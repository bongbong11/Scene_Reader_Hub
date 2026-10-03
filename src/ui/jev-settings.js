import { JEV_PROVIDERS, JEV_BROWSER_KEY_STORAGE, jevProvider, detectJevProvider, resolveJevKeyProvider, saveBrowserJevKey } from '../adapters/jev-providers.js';
import { notifySceneReaderToast } from './toasts.js';

export function bindJevSettings(deps) {
    const el = id => deps.document.getElementById(id);
    let saving = false;
    const preview = () => {
        const key = el('sr-jev-key')?.value || '', detected = detectJevProvider(key);
        if (el('sr-jev-detected')) el('sr-jev-detected').textContent = !key.trim() ? '' : detected ? `${JEV_PROVIDERS[detected].label} 키 형식 · 저장 시 연결 확인` : '형식만으로 발급처를 구분할 수 없습니다. 위에서 발급처를 선택하세요.';
    };
    el('sr-jev-key')?.addEventListener('input', preview);
    el('sr-jev-provider')?.addEventListener('change', preview);
    el('sr-jev-save')?.addEventListener('click', async () => {
        if (saving) return;
        const input = el('sr-jev-key'), selection = el('sr-jev-provider')?.value || 'auto';
        const key = String(input?.value || '').trim();
        const button = el('sr-jev-save');
        saving = true;
        if (button) button.disabled = true;
        try {
            const provider = key ? resolveJevKeyProvider(key, selection) : jevProvider(deps.settings);
            if (key) {
                deps.updateKeyStatus(`${JEV_PROVIDERS[provider].label} 연결 확인 중…`);
                await deps.callJev({model:'jev-latest',state:{text:'Scene Reader connection test.'},questions:{connection:{type:'choice',instructions:'Is this explicitly a connection test?',criteria:{yes:'Explicit connection test.',no:'Not a connection test.'}}}},15000,null,{provider,key});
            }
            const previousBrowserKey = deps.localStorage.getItem(JEV_BROWSER_KEY_STORAGE);
            if (provider === 'typesafe') {
                const data = await deps.storagePost('key', {key});
                deps.serverKeyStatus = data.keyStatus;
                deps.localStorage.removeItem(deps.JEV_KEY_STORAGE);
            } else saveBrowserJevKey(deps.localStorage, provider, key);
            try {
                deps.invalidateReasonerJobs();
                await deps.saveGlobal('jevProvider', provider);
            } catch (error) {
                if (provider !== 'typesafe') {
                    if (previousBrowserKey === null) deps.localStorage.removeItem(JEV_BROWSER_KEY_STORAGE);
                    else deps.localStorage.setItem(JEV_BROWSER_KEY_STORAGE, previousBrowserKey);
                }
                throw error;
            }
            if (input.value.trim() === key) input.value = '';
            preview();
            deps.updateKeyStatus();
            notifySceneReaderToast(deps.window, 'success', key ? `${JEV_PROVIDERS[provider].label} 연결 확인 후 ${provider === 'typesafe' ? '서버' : '이 브라우저'}에 키를 저장했습니다.` : '사용 중인 Jev 키를 삭제했습니다.', '씬판독기');
        } catch (error) {
            deps.updateKeyStatus(error.message);
            notifySceneReaderToast(deps.window, 'error', `Jev 키를 저장하지 못했습니다. · ${error.message}`, '씬판독기');
        } finally { saving = false; if (button) button.disabled = false; }
    });
    el('sr-jev-toggle')?.addEventListener('click', () => {
        const input = el('sr-jev-key');
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
    el('sr-jev-test')?.addEventListener('click', async () => {
        try { await deps.testConnection(); } catch (error) { notifySceneReaderToast(deps.window, 'error', error.message, '씬판독기'); }
    });
}
