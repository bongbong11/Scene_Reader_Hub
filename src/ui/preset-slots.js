import { normalizePresetSlot } from '../injection/preset-catalog.js';
import { notifySceneReaderToast } from './toasts.js';

export const presetSlotTemplate = `<details class="sr-settings-card sr-settings-collapsible"><summary>주입 위치 <small class="sr-injection-credit">Card Inject 코드 이식·수정</small></summary>
<label for="sr-injection-mode">1. 기본 판정·전개 주입</label><select id="sr-injection-mode" class="text_pole"><option value="depth">기본 · 깊이 0 · system</option><option value="preset">프리셋 항목 앞·뒤</option></select>
<div id="sr-scene-slot-controls"><label for="sr-scene-slot-target">기준 프롬프트</label><select id="sr-scene-slot-target" class="text_pole"></select><label for="sr-scene-slot-side">삽입 방향</label><select id="sr-scene-slot-side" class="text_pole"><option value="before">앞</option><option value="after">뒤</option></select></div>
<label for="sr-world-injection-mode">2. 세계관 규칙·시즌 참고 주입</label><select id="sr-world-injection-mode" class="text_pole"><option value="depth">기본 · 깊이 0 · system</option><option value="preset">프리셋 항목 앞·뒤</option></select>
<div id="sr-world-slot-controls"><label for="sr-world-slot-target">기준 프롬프트</label><select id="sr-world-slot-target" class="text_pole"></select><label for="sr-world-slot-side">삽입 방향</label><select id="sr-world-slot-side" class="text_pole"><option value="before">앞</option><option value="after">뒤</option></select></div>
<button id="sr-preset-slots-refresh" type="button" class="menu_button">프리셋 목록 새로 읽기</button><p id="sr-preset-slots-status" class="sr-help" aria-live="polite"></p>
<p class="sr-help sr-explanation">Chat Completion에서 사용할 프리셋 항목과 앞·뒤를 고르세요. 기준을 찾지 못하면 알림을 표시합니다. 저장된 프리셋·자료는 유지됩니다.</p>
<button id="sr-clean-legacy-injection" type="button" class="menu_button">이전 임시 주입 정리</button><p class="sr-help sr-explanation">Hub의 임시 주입만 정리하고 현재 결과를 다시 준비합니다. 프리셋·캐릭터·판독 기록은 유지됩니다.</p></details>`;

export function renderPresetSlots(deps) {
    const prefs=deps.preferences(),prompts=deps.presetPrompts?.() || [];
    const el=id=>deps.document.getElementById(id);
    for(const [kind,modeKey,slotKey] of [['scene','injectionMode','scenePresetSlot'],['world','worldInjectionMode','worldPresetSlot']]) {
        const slot=normalizePresetSlot(prefs[slotKey]),node=el(`sr-${kind}-slot-target`);
        if(el(`sr-${kind}-slot-controls`))el(`sr-${kind}-slot-controls`).hidden=prefs[modeKey]!=='preset';
        if(node) {
            node.replaceChildren();
            const values=prompts.map(prompt=>({value:prompt.identifier,label:prompt.name+(prompt.enabled?'':' · 꺼짐')}));
            if(!values.some(item=>item.value===slot.identifier))values.unshift({value:slot.identifier,label:`${slot.identifier} · 현재 프리셋에 없음`});
            for(const item of values){const option=deps.document.createElement('option');option.value=item.value;option.textContent=item.label;node.append(option);}
            node.value=slot.identifier;
        }
        if(el(`sr-${kind}-slot-side`))el(`sr-${kind}-slot-side`).value=slot.side;
    }
    const status=el('sr-preset-slots-status');
    if(status)status.textContent=prompts.length?`현재 프리셋의 기준 항목 ${prompts.length}개를 읽었습니다. 꺼진 항목에는 주입되지 않습니다.`:'Chat Completion 프리셋 목록을 찾지 못했습니다. 연결 방식과 활성 프리셋을 확인한 뒤 새로 읽어 주세요.';
}

export function bindPresetSlots(deps) {
    const el=id=>deps.document.getElementById(id);
    for(const [kind,save,modeKey] of [['scene',deps.saveInjectionMode,'injectionMode'],['world',deps.saveWorldInjectionMode,'worldInjectionMode']]) {
        for(const field of ['target','side'])el(`sr-${kind}-slot-${field}`)?.addEventListener('change',()=>deps.runUiTask(save({mode:deps.preferences()[modeKey],slot:{identifier:el(`sr-${kind}-slot-target`).value,side:el(`sr-${kind}-slot-side`).value}}),'주입 기준을 저장하지 못했습니다.'));
    }
    el('sr-preset-slots-refresh')?.addEventListener('click',()=>renderPresetSlots(deps));
    el('sr-clean-legacy-injection')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        await deps.clearInjection();await deps.applyStoredInjection();
        notifySceneReaderToast(deps.window,'success','이전 임시 주입을 정리했습니다. 저장 자료와 프리셋은 유지됩니다.','씬판독기');
    })(),'임시 주입을 정리하지 못했습니다.'));
}
