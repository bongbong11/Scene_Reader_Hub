import {DEFAULT_CHARACTER_REVIEW_PROMPT, currentCharacterReview, validateReviewTemplate} from '../character/replacement-prompts.js';

export function createReviewPromptEditor({container, deps, run, current, getName, status}) {
    container.innerHTML = `<summary>✎ 확인 명령문 보기·수정</summary><p class="sr-help">{{subject}}는 선택한 인물 이름으로 바뀝니다. 편집한 내용으로 확인하며, 저장하면 모든 방에서 유지됩니다. 저장하지 않은 수정은 창을 닫으면 사라집니다.</p><textarea data-review-template class="text_pole" aria-label="인물 변화 확인 명령문" spellcheck="false"></textarea><div class="sr-replacement-actions"><button type="button" data-template-save class="menu_button">저장</button><button type="button" data-template-default class="menu_button">기본값 불러오기</button><button type="button" data-template-copy class="menu_button">명령문 복사</button></div><p data-template-status class="sr-help" role="status"></p>`;
    const input = container.querySelector('[data-review-template]'), note = container.querySelector('[data-template-status]');
    input.value = typeof deps.settings.characterReviewPrompt === 'string' && deps.settings.characterReviewPrompt.trim()
        ? deps.settings.characterReviewPrompt : DEFAULT_CHARACTER_REVIEW_PROMPT;
    let saved = input.value;
    const resize = () => { if(container.open){input.style.height='auto'; input.style.height=Math.max(180,input.scrollHeight)+'px';} };
    const getTemplate = () => validateReviewTemplate(input.value);
    input.addEventListener('input', () => {note.textContent=input.value===saved?'':'아직 저장하지 않은 명령문입니다.'; resize();});
    container.addEventListener('toggle', resize);
    container.querySelector('[data-template-default]').addEventListener('click', () => {input.value=DEFAULT_CHARACTER_REVIEW_PROMPT;note.textContent='기본값을 불러왔습니다. 유지하려면 저장하세요.';resize();});
    container.querySelector('[data-template-save]').addEventListener('click', () => run(async () => {
        const value=getTemplate(); note.textContent='저장 중…';
        try {await deps.saveGlobal('characterReviewPrompt', value===DEFAULT_CHARACTER_REVIEW_PROMPT?'':value);}
        catch(error){if(current())note.textContent='저장하지 못했습니다. 수정한 내용은 이 창에 남아 있습니다.';throw error;}
        if(current()){saved=value;note.textContent='저장 완료 · 모든 방에서 사용합니다.';status.textContent='확인 명령문을 저장했습니다.';}
    }));
    container.querySelector('[data-template-copy]').addEventListener('click', () => run(async () => {
        const name=getName();if(!name)throw new Error('인물을 먼저 선택하세요.');
        await deps.copyText(currentCharacterReview(name,getTemplate()));
        if(current())note.textContent='선택한 인물 이름을 넣은 명령문을 복사했습니다.';
    }));
    return {getTemplate, resize, setBusy(busy){input.readOnly=busy;for(const button of container.querySelectorAll('button'))button.disabled=busy;}};
}
