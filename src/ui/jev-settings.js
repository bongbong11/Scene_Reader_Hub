import { JEV_PROVIDERS, JEV_BROWSER_KEY_STORAGE, jevProvider, browserJevKey, detectJevProvider, resolveJevKeyProvider, saveBrowserJevKey } from '../adapters/jev-providers.js';
import { notifySceneReaderToast } from './toasts.js';

export function renderJevProviderSelection(deps) {
    const provider = jevProvider(deps.settings);
    const saved = provider === 'typesafe' ? deps.serverKeyStatus?.startsWith('저장됨') : Boolean(browserJevKey(deps.localStorage, provider));
    const select = deps.document.getElementById('sr-jev-provider');
    if (select) select.value = saved ? provider : '';
    const note = deps.document.getElementById('sr-jev-detected');
    if (note) note.textContent = saved ? `저장된 발급처: ${JEV_PROVIDERS[provider].label} · 새 키를 넣을 때 발급처를 확인하세요.` : '키를 발급받은 서비스를 먼저 선택하세요.';
}

export function bindJevSettings(deps) {
    const el = id => deps.document.getElementById(id);
    let saving = false;
    const preview = () => {
        const key = el('sr-jev-key')?.value || '', detected = detectJevProvider(key);
        const provider = el('sr-jev-provider')?.value;
        if (el('sr-jev-detected')) el('sr-jev-detected').textContent = !Object.hasOwn(JEV_PROVIDERS, provider || '')
            ? '키를 발급받은 서비스를 먼저 선택하세요.'
            : detected && detected !== provider ? '선택한 발급처와 키 형식이 다릅니다. 발급받은 서비스를 확인하세요.'
            : `${JEV_PROVIDERS[provider].label} 선택 · 키 저장을 누르면 입력한 키로 연결을 확인한 뒤 저장합니다.`;
    };
    el('sr-jev-key')?.addEventListener('input', preview);
    el('sr-jev-provider')?.addEventListener('change', preview);
    el('sr-jev-save')?.addEventListener('click', async () => {
        if (saving) return;
        const input = el('sr-jev-key'), selection = el('sr-jev-provider')?.value || '';
        const key = String(input?.value || '').trim();
        const button = el('sr-jev-save');
        saving = true;
        if (button) button.disabled = true;
        try {
            if (!Object.hasOwn(JEV_PROVIDERS, selection)) throw new Error('키 발급처를 먼저 선택하세요.');
            const provider = key ? resolveJevKeyProvider(key, selection) : selection;
            if (!key && provider !== jevProvider(deps.settings)) throw new Error('선택한 발급처의 키를 입력한 뒤 키 저장을 누르세요.');
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
            if (el('sr-jev-provider')?.value === selection && !input.value.trim()) renderJevProviderSelection(deps);
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
        if (saving) return;
        try {
            if (!Object.hasOwn(JEV_PROVIDERS, el('sr-jev-provider')?.value || '')) throw new Error('키 발급처를 먼저 선택하세요.');
            if (el('sr-jev-key')?.value.trim() || el('sr-jev-provider')?.value !== jevProvider(deps.settings)) throw new Error('새 키나 발급처 변경은 키 저장을 먼저 누르세요. 연결을 확인한 뒤 저장합니다.');
            await deps.testConnection();
        } catch (error) { deps.updateKeyStatus(error.message); notifySceneReaderToast(deps.window, 'error', error.message, '씬판독기'); }
    });
}
