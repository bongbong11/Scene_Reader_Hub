import {normalizeBehaviorMode} from '../injection/character-behavior.js';

export const behaviorToggleTemplate = `<div class="sr-behavior-toggle" role="group" aria-label="캐릭터 행동 지침 선택">
    <button id="sr-behavior-gemini" type="button" data-sr-behavior="gemini" aria-pressed="false" title="Gemini용 캐릭터 행동·표현 보정">잼</button><button id="sr-behavior-glm" type="button" data-sr-behavior="glm" aria-pressed="true" title="GLM·기타 모델용 캐릭터 행동">긂</button>
</div>`;

export function renderBehaviorToggle(deps) {
    const mode=normalizeBehaviorMode(deps.settings.characterBehaviorMode);
    for(const value of ['gemini','glm']) {
        deps.document.getElementById(`sr-behavior-${value}`)?.setAttribute('aria-pressed',String(value===mode));
    }
}

export function bindBehaviorToggle(deps) {
    const buttons=[...deps.document.querySelectorAll('[data-sr-behavior]')];
    for(const button of buttons)button.addEventListener('click',()=> {
        if(button.disabled || button.dataset.srBehavior===normalizeBehaviorMode(deps.settings.characterBehaviorMode))return;
        deps.runUiTask((async()=>{
            buttons.forEach(item=>{item.disabled=true;});
            try {
                deps.macroTransmissionPreview.clear();
                await deps.saveGlobal('characterBehaviorMode',button.dataset.srBehavior);
            } finally {
                buttons.forEach(item=>{item.disabled=false;});
                renderBehaviorToggle(deps);
            }
        })(),'캐릭터 행동 설정을 저장하지 못했습니다.');
    });
}
