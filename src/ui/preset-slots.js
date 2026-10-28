import {PRESET_ENTRIES} from '../injection/preset-entry-contract.js';
import {notifySceneReaderToast} from './toasts.js';
const modes=id=>`<select id="${id}" class="text_pole"><option value="depth">기본 · 깊이 0 · system</option><option value="entry">프리셋에 주입 항목 만들기</option><option value="legacy" disabled>이전 위치 유지 · 새 위치를 선택하세요</option></select>`;
export const presetSlotTemplate=`<details id="sr-injection-placement" class="sr-settings-card sr-settings-collapsible"><summary>주입 위치</summary>
<p class="sr-help sr-explanation">씬판독기 주입 프롬프트를 자동으로 만듭니다. 설정은 현재 프리셋별로 저장됩니다.</p>
<label for="sr-injection-mode">1. 기본 판정·전개 주입 (인물 분석의 기본 주입 위치)</label>${modes('sr-injection-mode')}
<div id="sr-scene-slot-controls"><p class="sr-help">아래 목록에서 넣을 자리를 선택하세요. 생성된 항목은 프리셋에서 드래그하거나 토글로 켜고 끌 수 있습니다. 역할은 system이며, 상대적인 항목 순서로 배치됩니다.</p><div id="sr-scene-entry-list"></div></div>
<label for="sr-world-injection-mode">2. 세계관 규칙·시즌 참고 주입</label>${modes('sr-world-injection-mode')}
<div id="sr-world-slot-controls"><p class="sr-help">프리셋에 기존 세계관 관련 프롬프트가 있다면 그 근처의 자리를 선택하세요. 기본 판정·전개와 별도로 배치합니다.</p><div id="sr-world-entry-list"></div></div>
<div id="sr-character-macro-panel"><label>3. 인물 분석 주입</label><label class="checkbox_label"><input id="sr-character-macro" type="checkbox"><span>위브 5.2 연동</span></label>
<div class="sr-action-row"><button id="sr-character-macro-copy" type="button" class="menu_button">매크로 복사</button><button id="sr-character-macro-preview" type="button" class="menu_button">전송 내용 보기</button></div>
<p class="sr-help sr-explanation">위브 5.2부터는 인물 매크로가 미리 들어 있어 선택만 하면 됩니다. 끄면 1번 기본 판정·전개 주입 위치에 합쳐 전달합니다. 다른 프리셋은 기본 주입 위치가 무난합니다. 직접 배치할 때는 복사한 매크로를 넣으세요. 켰는데 매크로를 찾지 못하면 1번 위치에 합쳐 전달하고 실행 흐름에 표시합니다.</p></div>
<button id="sr-preset-slots-refresh" type="button" class="menu_button">프리셋 목록 새로 읽기</button><p id="sr-preset-slots-status" class="sr-help" aria-live="polite"></p>
<button id="sr-clean-legacy-injection" type="button" class="menu_button">이전 임시 주입 정리</button><p class="sr-help sr-explanation">새 위치로 전환한 뒤 이전 방식의 위치 저장값과 임시 주입을 정리합니다. 이전 위치를 쓰는 프리셋이 남아 있으면 먼저 알려드립니다. 인물 자료·대화·판독 기록은 유지됩니다.</p></details>`;
export function renderPresetSlots(deps){
    const el=id=>deps.document.getElementById(id),value=deps.placement?.read();
    if(!value)return;
    for(const kind of ['scene','world']){
        const select=el(kind==='scene'?'sr-injection-mode':'sr-world-injection-mode'),box=el(`sr-${kind}-slot-controls`),list=el(`sr-${kind}-entry-list`);
        if(select){select.value=value[kind];select.disabled=!value.available||deps.placement.isBusy();}
        if(box)box.hidden=value[kind]!=='entry'&&select?.dataset.choose!=='yes';
        if(!list)continue;
        list.replaceChildren();
        const stamp=deps.presetEntries.stamp();
        const prompts=value.preset.prompts;
        for(let index=0;index<=prompts.length;index++){
            const button=deps.document.createElement('button');button.type='button';button.className='menu_button';button.dataset.srGap=String(index);button.dataset.srKind=kind;button.disabled=!value.available||deps.placement.isBusy();
            button.textContent='＋ 여기에 넣기';
            button.addEventListener('click',()=>deps.runUiTask((async()=>{try{const save=deps.placement.place(kind,index,stamp);renderPresetSlots(deps);await save;delete select.dataset.choose;}finally{renderPresetSlots(deps);}})(),'주입 항목을 저장하지 못했습니다.'));
            list.append(button);
            if(index<prompts.length){const row=deps.document.createElement('p');row.className='sr-help';row.textContent=prompts[index].name+(prompts[index].enabled?'':' · 꺼짐');list.append(row);}
        }
    }
    const own=value.preset.prompts.filter(p=>Object.values(PRESET_ENTRIES).some(s=>s.identifier===p.identifier));
    const status=el('sr-preset-slots-status');if(status)status.textContent=value.available?`${value.preset.name} · ${value.preset.prompts.length}개 항목${own.length?' · 씬판독기 항목 '+own.length+'개':''}${value.pendingKind?' · 위치 저장 미완료: 해당 종류의 자리를 다시 선택해 주세요.':''}`:'저장된 Chat Completion 프리셋을 선택한 뒤 새로 읽어 주세요.';
    const macro=el('sr-character-macro');if(macro){macro.checked=value.characterMacroEnabled;macro.disabled=!value.available||deps.placement.isBusy();}
}
export function bindPresetSlots(deps){
    const el=id=>deps.document.getElementById(id);
    for(const kind of ['scene','world']){
        const select=el(kind==='scene'?'sr-injection-mode':'sr-world-injection-mode');
        select?.addEventListener('change',()=>{
            if(select.value==='entry'){
                select.dataset.choose='yes';
                // Selecting the mode opens the list; only choosing a gap changes the preset.
                renderPresetSlots(deps);select.value='entry';el(`sr-${kind}-slot-controls`).hidden=false;
            }else{delete select.dataset.choose;const save=deps.placement.save(kind,'depth');renderPresetSlots(deps);deps.runUiTask(save.finally(()=>renderPresetSlots(deps)),'주입 위치를 저장하지 못했습니다.');}
        });
    }
    el('sr-preset-slots-refresh')?.addEventListener('click',()=>renderPresetSlots(deps));
    el('sr-clean-legacy-injection')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        await deps.placement.cleanup();renderPresetSlots(deps);
        notifySceneReaderToast(deps.window,'success','이전 임시 주입을 정리했습니다. 인물 자료와 새 주입 위치는 유지됩니다.','씬판독기');
    })(),'이전 주입 설정을 정리하지 못했습니다.'));
}
