import { withRequestLifetime } from '../adapters/request-lifetime.js';
import {digest} from './shared-document.js';
export function createStorageHttp(deps) {
const scopes=new Map();let sequence=0;
async function storagePost(route, body = {}, { allowFailure = false, signal:externalSignal } = {}) {
    const started=Date.now();
    // Only an opaque session-local ID leaves this module; never log body hashes or credentials.
    const identity=digest([route,body]);
    if(!scopes.has(identity)){if(scopes.size>=1024)scopes.delete(scopes.keys().next().value);scopes.set(identity,{id:`storage-${++sequence}`});}
    const scope=scopes.get(identity);
    const report=detail=>{try{deps.noteDiagnostic?.('storage_request',{module:'src/storage/http.js',phase:route,storageScope:scope.id,...detail});}catch{/* diagnostic only */}};
    report({status:'started'});
    try {
        const {response,data}=await withRequestLifetime(async signal=>{
        const response = await deps.fetch(`${deps.STORAGE_API_URL}/${route}`, {
            method: 'POST', headers: { ...deps.getRequestHeaders(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({...body,storageProtocol:2}),
            signal,
        });
        let data = null;
        try { data = await response.json(); } catch { /* status below */ }
        return {response,data};
        },{signal:externalSignal,timeoutMs:deps.timeoutMs || 15000,timeoutMessage:'씬판독기 저장소 응답 시간이 초과되었습니다. 저장 상태를 확인한 뒤 다시 시도하세요.'});
        if (!response.ok) throw Object.assign(new Error(deps.pluginError(response.status, data, `저장소 응답 오류 (${response.status})`)),{code:data?.code||'STORAGE_HTTP_ERROR',httpStatus:response.status});
        if (!data || typeof data !== 'object' || Array.isArray(data) || data.ok === false) throw Object.assign(new Error('저장소 응답을 확인하지 못했습니다. 저장 완료로 처리하지 않았습니다. 저장 상태를 다시 확인해 주세요.'),{code:'STORAGE_INVALID_RESPONSE'});
        deps.serverStoreAvailable = true;
        report({status:'succeeded',durationMs:Date.now()-started});
        return data;
    } catch (error) {
        const cancelled=externalSignal?.aborted || error?.name==='AbortError';
        if(!cancelled)deps.serverStoreAvailable=Boolean(error.httpStatus);
        if(error && typeof error==='object')error.storageScope=scope.id;
        report({status:cancelled?'cancelled':'failed',durationMs:Date.now()-started,errorKind:cancelled?'STORAGE_CANCELLED':typeof error.code==='string'?error.code:'STORAGE_NETWORK_ERROR',httpStatus:error.httpStatus || 0});
        if (allowFailure) return null;
        throw error;
    }
}
return {storagePost};
}
