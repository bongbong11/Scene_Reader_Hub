import { withRequestLifetime,createRequestQueue } from '../adapters/request-lifetime.js';

export function embeddingCredentialStore(config) {
    return config.source === 'vertexai' ? (config.vertexai_auth_mode === 'full' ? 'vertexai_service_account_json' : 'api_key_vertexai')
        : config.source === 'palm' ? 'api_key_makersuite'
        : config.source === 'nanogpt' ? 'api_key_nanogpt' : 'none';
}

export function normalizeEmbeddingCredential(value) {
    let normalized=String(value || '').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
    if ((normalized.startsWith('"') && normalized.endsWith('"')) || (normalized.startsWith("'") && normalized.endsWith("'"))) normalized=normalized.slice(1,-1).trim();
    if (/\s/.test(normalized)) throw Object.assign(new Error('키 중간에 공백이나 줄바꿈이 있습니다. 키만 한 줄로 붙여 넣어 주세요.'),{code:'EMBEDDING_CREDENTIAL_FORMAT'});
    return normalized;
}

// The host reveals active-secret metadata, not the actual credential used upstream.
export function createEmbeddingCredentialDiagnostics({fetch,getRequestHeaders,onDiagnostic=()=>{}}) {
    const cache=new Map();
    const readMetadata=createRequestQueue();
    let epoch=0;
    async function inspect(config,signal) {
        const credentialStore=embeddingCredentialStore(config);
        if (credentialStore==='none') return;
        const memo=cache.get(credentialStore);
        let presence=memo?.expires>Date.now()?memo.presence:null;
        if (!presence) {
            presence=await readMetadata(async()=>{
            // Another bank may have filled this metadata while we waited.
            const cached=cache.get(credentialStore);
            if(cached?.expires>Date.now())return cached.presence;
            const startedEpoch=epoch;
            let next;
            try {
                next=await withRequestLifetime(async requestSignal=>{
                    const response=await fetch('/api/secrets/read',{method:'POST',headers:getRequestHeaders(),signal:requestSignal});
                    if (!response.ok) return 'unknown';
                    const state=await response.json();
                    if (!state || typeof state !== 'object' || Array.isArray(state)) return 'unknown';
                    const entry=state[credentialStore];
                    return Array.isArray(entry) ? (entry.some(item=>item.active)?'available':'missing') : entry === true ? 'available' : entry === false || entry == null ? 'missing' : 'unknown';
                },{signal,timeoutMs:5000});
            } catch { if(signal?.aborted) signal.throwIfAborted(); next='unknown'; }
            if(startedEpoch===epoch)cache.set(credentialStore,{presence:next,expires:Date.now()+30000});
            return next;
            },signal);
        }
        try { onDiagnostic({module:'src/retrieval/credentials.js',phase:'credential_metadata',status:'info',provider:config.source,credentialStore,credentialPresence:presence,credentialUse:'resolved_by_sillytavern',upstreamAuthentication:'not_verified'}); } catch {/* diagnostic only */}
    }
    return {inspect,clear:()=>{epoch++;cache.clear();}};
}
