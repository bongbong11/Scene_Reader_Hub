

export function createStorageHttp(deps) {
async function storagePost(route, body = {}, { allowFailure = false } = {}) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try {
        const response = await deps.fetch(`${deps.STORAGE_API_URL}/${route}`, {
            method: 'POST', headers: { ...deps.getRequestHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
            signal:controller.signal,
        });
        let data = null;
        try { data = await response.json(); } catch { /* status below */ }
        if (!response.ok) throw new Error(deps.pluginError(response.status, data, `저장소 응답 오류 (${response.status})`));
        deps.serverStoreAvailable = true;
        return data;
    } catch (error) {
        deps.serverStoreAvailable = false;
        if (allowFailure) return null;
        if(controller.signal.aborted)throw new Error('씬판독기 저장소 응답 시간이 초과되었습니다. 저장 상태를 확인한 뒤 다시 시도하세요.');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
return {storagePost};
}
