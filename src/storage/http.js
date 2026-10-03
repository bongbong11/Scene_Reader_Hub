import { withRequestLifetime } from '../adapters/request-lifetime.js';
export function createStorageHttp(deps) {
async function storagePost(route, body = {}, { allowFailure = false } = {}) {
    const started=Date.now();
    const report=detail=>{try{deps.noteDiagnostic?.('storage_request',{module:'src/storage/http.js',phase:route,...detail});}catch{/* diagnostic only */}};
    report({status:'started'});
    try {
        const {response,data}=await withRequestLifetime(async signal=>{
        const response = await deps.fetch(`${deps.STORAGE_API_URL}/${route}`, {
            method: 'POST', headers: { ...deps.getRequestHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
            signal,
        });
        let data = null;
        try { data = await response.json(); } catch { /* status below */ }
        return {response,data};
        },{timeoutMs:deps.timeoutMs || 15000,timeoutMessage:'씬판독기 저장소 응답 시간이 초과되었습니다. 저장 상태를 확인한 뒤 다시 시도하세요.'});
        if (!response.ok) throw Object.assign(new Error(deps.pluginError(response.status, data, `저장소 응답 오류 (${response.status})`)),{code:'STORAGE_HTTP_ERROR',httpStatus:response.status});
        if (!data || typeof data !== 'object' || Array.isArray(data) || data.ok === false) throw Object.assign(new Error('저장소 응답을 확인하지 못했습니다. 저장 완료로 처리하지 않았습니다. 저장 상태를 다시 확인해 주세요.'),{code:'STORAGE_INVALID_RESPONSE'});
        deps.serverStoreAvailable = true;
        report({status:'succeeded',durationMs:Date.now()-started});
        return data;
    } catch (error) {
        deps.serverStoreAvailable = false;
        report({status:'failed',durationMs:Date.now()-started,errorKind:error.code || 'STORAGE_NETWORK_ERROR',httpStatus:error.httpStatus || 0});
        if (allowFailure) return null;
        throw error;
    }
}
return {storagePost};
}
