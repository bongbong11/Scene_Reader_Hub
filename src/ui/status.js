// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createStatusUi(deps) {
function updateStatus(text = '') {
    const root = deps.document.getElementById('sr-live-status');
    if (!root) return;
    const judgedAt = deps.record()?.lastJudgment?.judgedAt;
    root.textContent = text || (judgedAt ? `마지막 판독 ${new Date(judgedAt).toLocaleString()}` : '판독 대기');
}

function updateKeyStatus(text = '') {
    const root = deps.document.getElementById('sr-jev-status');
    if (root) root.textContent = text || (deps.serverStoreAvailable ? deps.serverKeyStatus : deps.maskKey(deps.getSavedKey()));
}

function runUiTask(task, failureMessage = '설정을 저장하지 못했습니다.') {
    void Promise.resolve(task).catch((error) => {
        console.error('[씬판독기] UI 작업 실패', error);
        if (!error?.activityReported && !(error instanceof deps.StaleRunError)) deps.notifySceneReaderToast(deps.window, 'error', `${failureMessage}${error?.message ? ` · ${error.message}` : ''}`, '씬판독기');
    });
}

function runEventTask(task, failureMessage) {
    return Promise.resolve().then(task).catch((error) => {
        console.error('[씬판독기] 이벤트 처리 실패', error);
        deps.notifySceneReaderToast(deps.window, 'error', `${failureMessage}${error?.message ? ` · ${error.message}` : ''}`, '씬판독기');
    });
}

function setBusy(busy) {
    const button = deps.document.getElementById('sr-run');
    if (!button) return;
    button.disabled = busy || !deps.settings.enabled;
    button.innerHTML = busy ? '<i class="fa-solid fa-spinner fa-spin"></i> 판독 중' : '<i class="fa-solid fa-bolt"></i> 지금 판독';
}

async function testConnection() {
    updateKeyStatus('연결 확인 중…');
    try {
        const data = await deps.callJev({
            model: deps.JEV_MODEL,
            state: { text: 'Scene Reader connection test.' },
            questions: { connection: { type: 'choice', instructions: 'Select whether the text explicitly says this is a connection test.', criteria: { yes: 'It explicitly is a connection test.', no: 'It is not a connection test.' } } },
        }, 15000);
        if (!data.answers.connection?.choice) throw new Error('Jev 연결 확인 응답이 올바르지 않습니다.');
        updateKeyStatus('키 인증 성공 · 서버 플러그인 응답 확인');
        deps.notifySceneReaderToast(deps.window, 'success', 'Jev 연결에 성공했습니다.', '씬판독기');
    } catch (error) {
        updateKeyStatus(error.message);
        throw error;
    }
}
return {updateStatus, updateKeyStatus, runUiTask, runEventTask, setBusy, testConnection};
}
