import {PRESET_ENTRIES,entryText,entryHasMacro} from '../injection/preset-entry-contract.js';

const failure=(message,code='PRESET_ENTRY_UNAVAILABLE')=>Object.assign(new Error(message),{code});
// Only this adapter writes native presets. Analysis and Hub state stay outside it.
export function createPresetEntryHost({getContext,loadHost=()=>import('/scripts/openai.js'),loadManager=()=>import('/scripts/preset-manager.js')}) {
    let host={},service=null,pending;
    async function init(){host=await loadHost().catch(()=>({}));service=(await loadManager().catch(()=>({}))).getPresetManager?.('openai')||null;}
    function read() {
        const ctx=getContext(),manager=host.promptManager||ctx.promptManager;
        const settings=manager?.serviceSettings||host.oai_settings||ctx.chatCompletionSettings;
        const name=String(settings?.preset_settings_openai||host.oai_settings?.preset_settings_openai||'');
        const scope=manager?.activeCharacter;
        const order=scope&&typeof manager?.getPromptOrderForCharacter==='function'?manager.getPromptOrderForCharacter(scope):[];
        const available=ctx.mainApi==='openai'&&Boolean(name)&&Array.isArray(settings?.prompts)&&Array.isArray(order)&&Boolean(scope);
        const prompts=available?order.map(row=>{
            const prompt=settings.prompts.find(p=>p.identifier===row.identifier);
            return prompt?{identifier:prompt.identifier,name:prompt.name||prompt.identifier,content:String(prompt.content||''),role:prompt.role||'system',enabled:row.enabled===true,marker:Boolean(prompt.marker)}:{identifier:row.identifier,name:row.identifier+' · 원본 항목 없음',content:'',role:'system',enabled:row.enabled===true,missing:true};
        }):[];
        return {available,key:available?'openai:'+name:'',name,scope:scope?.id,prompts,manager,settings,order};
    }
    const stamp=value=>JSON.stringify([value.key,value.scope,value.settings?.prompts,value.settings?.prompt_order]);
    async function place(kind,index,expectedStamp) {
        if(!PRESET_ENTRIES[kind])throw failure('주입 종류를 확인해 주세요.');
        if(pending)throw failure('프리셋을 저장 중입니다. 잠시 후 다시 선택해 주세요.','PRESET_ENTRY_BUSY');
        const before=read(),signature=stamp(before),spec=PRESET_ENTRIES[kind];
        if(!before.available||typeof host.getChatCompletionPreset!=='function')throw failure('현재 Chat Completion 프리셋을 저장할 수 없습니다. 프리셋을 선택하고 다시 확인해 주세요.');
        if(expectedStamp&&expectedStamp!==signature)throw failure('프리셋 목록이 바뀌었습니다. 위치를 다시 선택해 주세요.','PRESET_ENTRY_CHANGED');
        const current=()=>{const now=read();return now.settings===before.settings&&now.manager===before.manager&&stamp(now)===signature;};
        const operation=(async()=>{
            if(!service)service=(await loadManager()).getPresetManager?.('openai');
            if(!current())throw failure('프리셋이 바뀌었습니다. 위치를 다시 선택해 주세요.','PRESET_ENTRY_CHANGED');
            if(!service?.savePreset||!service.getPresetList)throw failure('이 SillyTavern에서는 프리셋 저장 연결을 확인할 수 없습니다.');
            const list=service.getPresetList(),savedIndex=list.preset_names?.[before.name];
            if(!Number.isInteger(savedIndex)||!list.presets?.[savedIndex])throw failure('저장된 프리셋을 선택한 뒤 다시 시도해 주세요.');
            const next=host.getChatCompletionPreset(before.settings);
            if(!Array.isArray(next.prompts)||!Array.isArray(next.prompt_order))throw failure('프리셋 저장 형식을 확인하지 못했습니다.');
            const found=next.prompts.filter(p=>p.identifier===spec.identifier);
            if(found.length>1||found.length===1&&!entryHasMacro(found[0],kind))throw failure('기존 씬판독기 항목의 내용을 확인해 주세요. 같은 항목을 덮어쓰지 않았습니다.','PRESET_ENTRY_CONFLICT');
            const order=next.prompt_order.find(row=>String(row.character_id)===String(before.scope))?.order;
            if(!Array.isArray(order)||!Number.isInteger(index)||index<0||index>order.length)throw failure('선택한 위치가 바뀌었습니다. 다시 선택해 주세요.','PRESET_ENTRY_CHANGED');
            const old=order.find(row=>row.identifier===spec.identifier),oldAt=order.findIndex(row=>row.identifier===spec.identifier);
            if(!found.length)next.prompts.push({identifier:spec.identifier,name:spec.name,role:'system',content:entryText(kind),system_prompt:false,marker:false,injection_position:0,injection_depth:0,injection_order:100,forbid_overrides:false});
            const filtered=order.filter(row=>row.identifier!==spec.identifier);
            filtered.splice(Math.max(0,index-(oldAt>=0&&oldAt<index?1:0)),0,{identifier:spec.identifier,enabled:old?old.enabled===true:true});
            order.splice(0,order.length,...filtered);
            await service.savePreset(before.name,next,{skipUpdate:true});
            // A successful write belongs to its original named preset even if the UI moved.
            list.presets[savedIndex]=structuredClone(next);
            if(!current())throw failure('원래 프리셋에는 저장됐지만 화면이 바뀌었습니다. 해당 프리셋에서 위치를 다시 확인해 주세요.','PRESET_ENTRY_CHANGED');
            before.settings.prompts=structuredClone(next.prompts);
            before.settings.prompt_order=structuredClone(next.prompt_order);
            await before.manager.saveServiceSettings();
            if(read().key!==before.key)throw failure('저장 중 프리셋이 바뀌었습니다. 원래 프리셋에서 확인해 주세요.','PRESET_ENTRY_CHANGED');
            await before.manager.render?.(false);
            const after=read(),placed=after.prompts.filter(p=>p.identifier===spec.identifier);
            if(placed.length!==1||!entryHasMacro(placed[0],kind))throw failure('주입 항목 저장 결과를 확인하지 못했습니다.','PRESET_ENTRY_SAVE_FAILED');
            return {key:before.key,kind,identifier:spec.identifier};
        })();
        pending=operation;try{return await operation;}finally{if(pending===operation)pending=null;}
    }
    return {init,read,place,stamp:()=>stamp(read()),keys:()=>{const list=service?.getPresetList?.();return list?Object.keys(list.preset_names||{}).map(name=>'openai:'+name):[read().key].filter(Boolean);}};
}
