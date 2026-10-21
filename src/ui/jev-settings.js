import { notifySceneReaderToast } from './toasts.js';
import {bindNanoJev} from './nanogpt-jev.js';

export function bindJevSettings(deps) {
    bindNanoJev(deps);
    const el = id => deps.document.getElementById(id);
    let busy = false;
    const setBusy = value => {
        busy = value;
        for (const id of ['sr-jev-save', 'sr-jev-test', 'sr-jev-connection', 'sr-official-jev-model', 'sr-nano-jev-model']) if (el(id)) el(id).disabled = value;
    };
    el('sr-jev-save')?.addEventListener('click', async () => {
        if (busy) return;
        const input = el('sr-jev-key'), key = String(input?.value || '').trim();
        setBusy(true);
        try {
            if (key) {
                deps.updateKeyStatus('공홈 · TypeSafe 연결 확인 중…');
                await deps.callJev({model:'jev-latest',state:{text:'Scene Reader connection test.'},questions:{connection:{type:'choice',instructions:'Is this explicitly a connection test?',criteria:{yes:'Explicit connection test.',no:'Not a connection test.'}}}},15000,null,{key});
            }
            const data = await deps.storagePost('key', {key});
            deps.serverKeyStatus = data.keyStatus;
            try { deps.localStorage.removeItem(deps.JEV_KEY_STORAGE); } catch { /* server copy is authoritative */ }
            deps.invalidateReasonerJobs();
            if (input.value.trim() === key) input.value = '';
            deps.updateKeyStatus();
            notifySceneReaderToast(deps.window, 'success', key ? '공홈 · TypeSafe 연결 확인 후 서버에 키를 저장했습니다.' : '사용 중인 Jev 키를 삭제했습니다.', '씬판독기');
        } catch (error) {
            deps.updateKeyStatus(error.message);
            notifySceneReaderToast(deps.window, 'error', `Jev 키를 저장하지 못했습니다. · ${error.message}`, '씬판독기');
        } finally { setBusy(false); }
    });
    el('sr-jev-toggle')?.addEventListener('click', () => {
        const input = el('sr-jev-key');
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
    el('sr-jev-test')?.addEventListener('click', async () => {
        if (busy) return;
        setBusy(true);
        try {
            if (el('sr-jev-key')?.value.trim()) throw new Error('새 키는 키 저장을 먼저 누르세요. 연결을 확인한 뒤 저장합니다.');
            await deps.testConnection();
        } catch (error) {
            deps.updateKeyStatus(error.message);
            notifySceneReaderToast(deps.window, 'error', error.message, '씬판독기');
        } finally { setBusy(false); }
    });
}
