// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createActivity(deps) {
function showActivity(message, { owner = 'scene' } = {}) {
    const old = deps.activityToasts.get(owner);
    if (old) { deps.clearTimeout(old.timer); old.toast?.remove?.(); deps.activityToasts.delete(owner); }
    updateActivity(message, { owner });
}

function updateActivity(message, { done = false, error = false, owner = 'scene' } = {}) {
    deps.noteDiagnostic(error?'error':done?'complete':'working',{message:String(message).slice(0,240),owner});
    let item = deps.activityToasts.get(owner);
    if (!item) {
        const method = error ? 'error' : done ? 'success' : 'info';
        item = {toast: deps.notifySceneReaderToast(deps.window, method, message, error ? '씬판독기 오류' : done ? '씬판독기' : '씬판독기 실행 중', {timeOut:0,extendedTimeOut:0,sceneState:!done&&!error?'working':undefined}), timer:null};
        deps.activityToasts.set(owner,item);
    }
    deps.clearTimeout(item.timer);
    const toast = item.toast;
    deps.updateSceneReaderToast(toast,message,{level:error?'error':done?'success':'info',title:error?'씬판독기 오류':done?'씬판독기':'씬판독기 실행 중',sceneState:!done&&!error?'working':undefined});
    if (done || error) item.timer = deps.setTimeout(() => {
        toast?.remove?.();
        if (deps.activityToasts.get(owner) === item) deps.activityToasts.delete(owner);
    }, error ? 8000 : 4000);
}
return {showActivity, updateActivity};
}
