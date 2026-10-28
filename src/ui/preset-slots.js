import {PRESET_ENTRIES} from '../injection/preset-entry-contract.js';
import {notifySceneReaderToast} from './toasts.js';
import {openPresetPositionDialog} from './preset-position-dialog.js';
const modes=id=>`<select id="${id}" class="text_pole"><option value="depth">기본 · 깊이 0 · system</option><option value="entry">프리셋에 주입 항목 만들기</option><option value="legacy" disabled>이전 위치 유지 · 새 위치를 선택하세요</option></select>`;
export const presetSlotTemplate=`<details id="sr-injection-placement" class="sr-settings-card sr-settings-collapsible"><summary>주입 위치</summary>
<p class="sr-help sr-explanation">씬판독기 주입 프롬프트를 자동으로 만듭니다. 설정은 현재 프리셋별로 저장됩니다.</p>
<label for="sr-injection-mode">1. 기본 판정·전개 주입 (인물 분석의 기본 주입 위치)</label>${modes('sr-injection-mode')}
<div id="sr-scene-slot-controls"><button id="sr-scene-position" type="button" class="menu_button">판정·전개 주입 위치 선택</button></div>
<label for="sr-world-injection-mode">2. 세계관 규칙·시즌 참고 주입</label>${modes('sr-world-injection-mode')}
<div id="sr-world-slot-controls"><button id="sr-world-position" type="button" class="menu_button">세계관·시즌 주입 위치 선택</button></div>
<label for="sr-character-mode">3. 인물 분석 주입</label><select id="sr-character-mode" class="text_pole"><option value="weave">위브 5.2 연동</option><option value="entry">프리셋에 주입 항목 만들기</option><option value="depth">끄기 (기본 판정·전개 주입)</option></select>
<button id="sr-character-position" type="button" class="menu_button" hidden>인물 주입 위치 선택</button>
<div id="sr-character-macro-panel">
<div class="sr-action-row"><button id="sr-character-macro-copy" type="button" class="menu_button">매크로 복사</button><button id="sr-character-macro-preview" type="button" class="menu_button">전송 내용 보기</button></div>
<details class="sr-placement-help sr-help sr-explanation"><summary>설명 보기</summary><p><b>위브 5.2 연동</b> · 위브에 이미 들어 있는 인물 매크로로 전달합니다. 매크로를 찾지 못하면 기본 깊이 0에 합칩니다.</p><p><b>프리셋에 주입 항목 만들기</b> · 선택한 자리에 🐵 인물판독주입 system 항목을 만들고 전용 인물 매크로로 전달합니다. 프리셋에서 이동하거나 켜고 끌 수 있습니다.</p><p><b>끄기 (기본 판정·전개 주입)</b> · 인물 판독은 계속하며 기본 깊이 0을 쓰는 내용들과 한 주입문으로 합칩니다. 다른 프리셋에서도 무난한 기본 방식입니다.</p><p>1번은 판정·전개, 2번은 세계관·시즌, 3번은 인물 내용입니다. 전용 위치를 쓰면 각각 분리하고 기본 위치를 쓰는 내용들만 합칩니다. 설정은 프리셋별로 저장됩니다.</p></details></div>
<button id="sr-preset-slots-refresh" type="button" class="menu_button">프리셋 목록 새로 읽기</button><p id="sr-preset-slots-status" class="sr-help" aria-live="polite"></p>
<button id="sr-clean-legacy-injection" type="button" class="menu_button">이전 임시 주입 정리</button><p class="sr-help sr-explanation">새 위치로 전환한 뒤 이전 방식의 위치 저장값과 임시 주입을 정리합니다. 이전 위치를 쓰는 프리셋이 남아 있으면 먼저 알려드립니다. 인물 자료·대화·판독 기록은 유지됩니다.</p></details>`;
export function renderPresetSlots(deps){
    const el=id=>deps.document.getElementById(id),value=deps.placement?.read();
    if(!value)return;
    for(const kind of ['scene','world']){
        const select=el(kind==='scene'?'sr-injection-mode':'sr-world-injection-mode'),box=el(`sr-${kind}-slot-controls`);
        if(select){select.value=value[kind];select.disabled=!value.available||deps.placement.isBusy();}
        if(box)box.hidden=value[kind]!=='entry';
        const button=el(`sr-${kind}-position`);if(button)button.disabled=!value.available||deps.placement.isBusy();
    }
    const own=value.preset.prompts.filter(p=>Object.values(PRESET_ENTRIES).some(s=>s.identifier===p.identifier));
    const status=el('sr-preset-slots-status');if(status)status.textContent=value.available?`${value.preset.name} · ${value.preset.prompts.length}개 항목${own.length?' · 씬판독기 항목 '+own.length+'개':''}${value.pendingKind?' · 위치 저장 미완료: 해당 종류의 자리를 다시 선택해 주세요.':''}`:'저장된 Chat Completion 프리셋을 선택한 뒤 새로 읽어 주세요.';
    const macro=el('sr-character-mode');if(macro){macro.value=value.character;macro.disabled=!value.available||deps.placement.isBusy();}
    const position=el('sr-character-position');if(position){position.hidden=value.character!=='entry';position.disabled=!value.available||deps.placement.isBusy();}
}
export function bindPresetSlots(deps){
    const el=id=>deps.document.getElementById(id);
    const openCharacter=()=>openPresetPositionDialog(deps,'character',{refresh:()=>renderPresetSlots(deps)});
    el('sr-character-mode')?.addEventListener('change',event=>{
        const mode=event.target.value;
        if(mode==='entry'){renderPresetSlots(deps);deps.runUiTask(Promise.resolve().then(openCharacter),'위치 선택을 열지 못했습니다.');}
        else {const save=deps.placement.character(mode);renderPresetSlots(deps);deps.runUiTask(save.finally(()=>renderPresetSlots(deps)),'인물 주입 방식을 저장하지 못했습니다.');}
    });
    el('sr-character-position')?.addEventListener('click',()=>deps.runUiTask(Promise.resolve().then(openCharacter),'위치 선택을 열지 못했습니다.'));
    for(const kind of ['scene','world']){
        const select=el(kind==='scene'?'sr-injection-mode':'sr-world-injection-mode');
        const open=()=>openPresetPositionDialog(deps,kind,{refresh:()=>renderPresetSlots(deps)});
        el(`sr-${kind}-position`)?.addEventListener('click',()=>deps.runUiTask(Promise.resolve().then(open),'위치 선택을 열지 못했습니다.'));
        select?.addEventListener('change',()=>{
            if(select.value==='entry'){
                renderPresetSlots(deps);deps.runUiTask(Promise.resolve().then(open),'위치 선택을 열지 못했습니다.');
            }else{delete select.dataset.choose;const save=deps.placement.save(kind,'depth');renderPresetSlots(deps);deps.runUiTask(save.finally(()=>renderPresetSlots(deps)),'주입 위치를 저장하지 못했습니다.');}
        });
    }
    el('sr-preset-slots-refresh')?.addEventListener('click',()=>renderPresetSlots(deps));
    el('sr-clean-legacy-injection')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        await deps.placement.cleanup();renderPresetSlots(deps);
        notifySceneReaderToast(deps.window,'success','이전 임시 주입을 정리했습니다. 인물 자료와 새 주입 위치는 유지됩니다.','씬판독기');
    })(),'이전 주입 설정을 정리하지 못했습니다.'));
}
