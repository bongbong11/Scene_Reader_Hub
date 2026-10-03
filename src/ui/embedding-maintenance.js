import { notifySceneReaderToast } from './toasts.js';

export function bindEmbeddingMaintenance(deps) {
    const button = deps.document.getElementById('sr-embedding-rebuild');
    button?.addEventListener('click',()=>deps.runUiTask((async()=>{
        if (button.disabled) return;
        button.disabled = true;
        button.setAttribute('aria-busy','true');
        const label = button.querySelector('span');
        label.textContent = '임베딩 생성 중…';
        try {
            await deps.embeddingMaintenance.rebuild();
            notifySceneReaderToast(deps.window,'success','임베딩 재생성 완료 · 판독을 실행해 주세요.','씬판독기');
        } finally {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            label.textContent = '임베딩 재생성';
        }
    })(),'임베딩 재생성을 완료하지 못했습니다.'));
}
