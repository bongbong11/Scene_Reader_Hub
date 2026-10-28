import {normalizePresetSlot} from '../injection/preset-catalog.js';
import {PRESET_ENTRIES,entryHasMacro} from '../injection/preset-entry-contract.js';
export const PLACEMENT_KEY='injectionPlacementsV1';
export const OLD_PLACEMENT_KEYS=['injectionMode','worldInjectionMode','scenePresetSlot','worldPresetSlot'];
const legacy=(settings,prefs)=>({scene:['preset','macro'].includes(prefs.injectionMode)?'legacy':'depth',world:['preset','macro'].includes(prefs.worldInjectionMode)?'legacy':'depth',
    sceneSlot:normalizePresetSlot(prefs.scenePresetSlot),worldSlot:normalizePresetSlot(prefs.worldPresetSlot),characterMacroEnabled:settings.characterMacroEnabled===true});
export function createInjectionPlacement({host,getSettings,getPreferences,saveSettings,isBusy=()=>false,clear=async()=>{},apply=async()=>{},refresh=()=>{},report=()=>{}}){
    let active=null;
    function read(){
        const preset=host.read(),settings=getSettings(),root=settings[PLACEMENT_KEY];
        const fallback=root?.retired?{scene:'depth',world:'depth',characterMacroEnabled:false}:legacy(settings,getPreferences());
        const profile=root?.profiles?.[preset.key]||fallback;
        return {...profile,key:preset.key,available:preset.available,preset,
            scene:profile.scene||'depth',world:profile.world||'depth',characterMacroEnabled:profile.characterMacroEnabled===true};
    }
    async function task(callback){if(active)throw Error('주입 위치를 저장 중입니다.');if(isBusy())throw Error('생성이 끝난 뒤 주입 위치를 변경해 주세요.');const run=callback();active=run;try{return await run;}finally{if(active===run)active=null;refresh();}}
    function draft(){
        const settings=getSettings(),old=settings[PLACEMENT_KEY];
        const next=structuredClone(old||{version:1,profiles:{}});next.profiles ||= {};
        // Preserve the old common behavior in known presets before edits become per-preset.
        const fallback=old?.retired?{scene:'depth',world:'depth',characterMacroEnabled:false}:legacy(settings,getPreferences());
        for(const key of [...host.keys(),host.read().key].filter(Boolean))if(!Object.hasOwn(next.profiles,key))next.profiles[key]=structuredClone(fallback);
        return next;
    }
    async function store(root,target,key){
        if(target!==getSettings()||host.read().key!==key)throw Error('저장 중 프리셋이나 사용자 설정이 바뀌었습니다. 다시 확인해 주세요.');
        const before=target[PLACEMENT_KEY];target[PLACEMENT_KEY]=root;
        try{await saveSettings();}catch(error){if(target===getSettings()&&target[PLACEMENT_KEY]===root){if(before===undefined)delete target[PLACEMENT_KEY];else target[PLACEMENT_KEY]=before;}throw error;}
    }
    async function commit(root,target,key){
        await store(root,target,key);
        if(target===getSettings()&&host.read().key===key){
            try{if(!isBusy()){await clear();await apply();}}
            catch(cause){throw Object.assign(Error('주입 위치는 저장됐지만 현재 주입을 갱신하지 못했습니다. 다음 생성 전에 다시 확인해 주세요.'),{code:'PRESET_ENTRY_APPLY_FAILED',storageSaved:true,cause});}
            finally{refresh();}
        }
    }
    async function save(kind,mode){return task(async()=>{
        const current=read(),target=getSettings();if(!current.available)throw Error('현재 Chat Completion 프리셋을 선택해 주세요.');
        if(!['scene','world'].includes(kind)||!['depth','entry'].includes(mode))throw Error('주입 위치를 확인해 주세요.');
        if(mode==='entry'){
            const prompt=current.preset.prompts.find(p=>p.identifier===PRESET_ENTRIES[kind].identifier);
            if(!prompt||!entryHasMacro(prompt,kind))throw Error('목록에서 주입할 자리를 먼저 선택해 주세요.');
        }
        const next=draft();next.profiles[current.key][kind]=mode;
        if(next.profiles[current.key].pendingKind===kind)delete next.profiles[current.key].pendingKind;
        await commit(next,target,current.key);
    });}
    async function place(kind,index,stamp){return task(async()=>{
        const current=read(),target=getSettings();if(!current.available)throw Error('현재 Chat Completion 프리셋을 선택해 주세요.');
        const pending=draft();pending.profiles[current.key].pendingKind=kind;
        await store(pending,target,current.key);
        await host.place(kind,index,stamp);
        if(isBusy())throw Error('프리셋 항목은 저장됐지만 생성이 시작되어 이전 전달 방식을 유지합니다. 생성이 끝난 뒤 위치를 다시 선택해 주세요.');
        const next=structuredClone(pending);delete next.profiles[current.key].pendingKind;next.profiles[current.key][kind]='entry';
        await commit(next,target,current.key);report('preset_entry_saved',{kind,status:'succeeded'});
    });}
    async function character(enabled){return task(async()=>{
        const current=read(),target=getSettings();if(!current.available)throw Error('현재 프리셋을 선택해 주세요.');
        const next=draft();next.profiles[current.key].characterMacroEnabled=enabled===true;await commit(next,target,current.key);
    });}
    async function cleanup(){return task(async()=>{
        const current=read(),target=getSettings(),root=target[PLACEMENT_KEY];
        if(!root?.profiles?.[current.key])throw Error('새 주입 위치를 먼저 저장해 주세요.');
        if(Object.values(root.profiles).some(p=>p.pendingKind))throw Error('저장 확인이 끝나지 않은 주입 위치가 있습니다. 해당 프리셋에서 위치를 다시 선택해 주세요.');
        const remaining=Object.values(root.profiles).filter(p=>p.scene==='legacy'||p.world==='legacy').length;
        if(remaining)throw Error(`옛 주입 위치를 쓰는 프리셋이 ${remaining}개 남아 있습니다. 각 프리셋에서 위치를 저장한 뒤 정리해 주세요.`);
        const next=structuredClone(root);next.retired=true;
        for(const profile of Object.values(next.profiles)){delete profile.sceneSlot;delete profile.worldSlot;}
        const previousCommon=target.commonPreferences,previousMacro=target.characterMacroEnabled;
        target.commonPreferences=Object.fromEntries(Object.entries(previousCommon||{}).filter(([key])=>!OLD_PLACEMENT_KEYS.includes(key)));
        delete target.characterMacroEnabled;
        try{await commit(next,target,current.key);}catch(error){if(target===getSettings()&&target[PLACEMENT_KEY]!==next){target.commonPreferences=previousCommon;target.characterMacroEnabled=previousMacro;}throw error;}
        report('preset_legacy_cleaned',{status:'succeeded'});
    });}
    return {read,save,place,character,cleanup,isBusy:()=>Boolean(active)};
}
