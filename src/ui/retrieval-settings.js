import { fixedEmbeddingModel } from '../retrieval/connection-settings.js';
import { withRequestLifetime } from '../adapters/request-lifetime.js';
import { notifySceneReaderToast } from './toasts.js';
import { normalizeEmbeddingCredential } from '../retrieval/credentials.js';

const configuredSecret = settings => settings.retrievalProvider === 'vertexai' && settings.retrievalVertexAuth === 'full'
    ? 'vertexai_service_account_json' : null;
const activeKey = (state,key) => state?.[key] === true || Boolean(state?.[key]?.some?.(entry=>entry.active));

export function renderRetrievalSettings(deps) {
    const provider = deps.RETRIEVAL_PROVIDERS[deps.settings.retrievalProvider] ? deps.settings.retrievalProvider : 'transformers';
    const node = id => deps.document.getElementById(id);
    if (!node('sr-retrieval-provider')) return;
    node('sr-retrieval-provider').value = provider;
    const legacy = node('sr-retrieval-provider').querySelector('option[value="palm"]');
    legacy.hidden = provider !== 'palm';
    legacy.disabled = provider !== 'palm';
    node('sr-retrieval-model').value = fixedEmbeddingModel(provider) || deps.settings.retrievalModel || deps.RETRIEVAL_PROVIDERS[provider].model;
    node('sr-retrieval-model-row').hidden = provider !== 'nanogpt';
    node('sr-retrieval-key-row').hidden = provider === 'transformers';
    node('sr-retrieval-key-label').textContent = provider === 'vertexai' ? 'Vertex Express API 키' : '선택한 서비스의 API 키';
    node('sr-retrieval-key-help').textContent = provider === 'vertexai'
        ? '저장된 키·서비스 계정은 자동 사용합니다. 새 Express 키만 입력하세요. 서비스 계정 JSON은 SillyTavern에서 설정하세요.'
        : 'SillyTavern에 저장된 키를 그대로 사용합니다. 키를 새로 등록하거나 바꿀 때만 입력하세요.';
    node('sr-retrieval-google-note').hidden = !fixedEmbeddingModel(provider);
    node('sr-retrieval-google-note').textContent = provider === 'vertexai'
        ? '모델·리전(global)은 자동 설정됩니다. SillyTavern에 저장된 Vertex 인증 정보를 사용합니다.'
        : '기존 Google AI Studio 키 설정을 유지하고 있습니다. Vertex 키와는 호환되지 않습니다.';
}

async function secretRequest(deps,route,body) {
    const started=Date.now(),provider=deps.settings.retrievalProvider;
    const credentialStore=body?.key || configuredSecret(deps.settings) || deps.RETRIEVAL_PROVIDERS[provider]?.secret || 'none';
    const report=detail=>{try{deps.noteDiagnostic?.('embedding_credential',{module:'src/ui/retrieval-settings.js',phase:route,provider,credentialStore,...detail});}catch{/* diagnostic only */}};
    report({status:'started'});
    try { const result=await withRequestLifetime(async signal=>{
        const response = await deps.fetch(`/api/secrets/${route}`,{method:'POST',headers:deps.getRequestHeaders(),signal,...(body?{body:JSON.stringify(body)}:{})});
        if (!response.ok) throw Object.assign(new Error(`키 ${route==='read'?'확인':'저장'} 실패 (${response.status})`),{code:'CREDENTIAL_STORAGE_HTTP_ERROR',httpStatus:response.status});
        return route === 'read' ? await response.json() : null;
    },{timeoutMs:15000,timeoutMessage:'키 설정 연결 시간이 초과되었습니다.'});
    report({status:'succeeded',durationMs:Date.now()-started});
    return result;
    } catch(error) { report({status:'failed',durationMs:Date.now()-started,errorKind:error.code || 'CREDENTIAL_STORAGE_INVALID_RESPONSE',httpStatus:error.httpStatus || 0}); throw error; }
}

export async function refreshRetrievalSecret(deps) {
    const settings = deps.settings, provider = settings.retrievalProvider;
    const node = deps.document.getElementById('sr-retrieval-key-status');
    if (!node) return;
    if (provider === 'transformers') { node.textContent='로컬 임베딩 · 키 불필요'; return; }
    const auth = settings.retrievalVertexAuth;
    node.textContent='저장된 키 확인 중…';
    try {
        const state = await secretRequest(deps,'read');
        if (settings !== deps.settings || provider !== settings.retrievalProvider || auth !== settings.retrievalVertexAuth) return;
        let secret = configuredSecret(settings) || deps.RETRIEVAL_PROVIDERS[provider]?.secret;
        if (provider === 'vertexai' && !activeKey(state,secret)) {
            const alternate = auth === 'full' ? 'api_key_vertexai' : 'vertexai_service_account_json';
            if (activeKey(state,alternate)) {
                await deps.saveRetrievalSettings({retrievalVertexAuth:auth === 'full' ? 'express' : 'full'});
                if (settings !== deps.settings || provider !== settings.retrievalProvider) return;
                secret = alternate;
            }
        }
        node.textContent = activeKey(state,secret) ? (secret === 'vertexai_service_account_json' ? '인증 정보 저장됨 · SillyTavern 서비스 계정 사용' : '키 저장됨') : '저장된 키 없음';
    } catch { if (settings === deps.settings && provider === settings.retrievalProvider) node.textContent='저장된 키 상태를 확인하지 못했습니다. 연결 확인으로 다시 확인해 주세요.'; }
}

export function bindRetrievalSettings(deps) {
    const node = id => deps.document.getElementById(id);
    node('sr-retrieval-provider')?.addEventListener('change',event=>deps.runUiTask((async()=>{
        const provider = event.target.value;
        if (!deps.RETRIEVAL_PROVIDERS[provider]) throw new Error('임베딩 서비스를 선택하세요.');
        node('sr-retrieval-key').value='';
        await deps.saveRetrievalSettings({retrievalProvider:provider,retrievalModel:deps.RETRIEVAL_PROVIDERS[provider].model});
        await deps.retrievalSecretState();
    })(),'임베딩 설정을 바꾸지 못했습니다.'));
    node('sr-retrieval-model')?.addEventListener('change',event=>deps.runUiTask(deps.saveRetrievalSetting('retrievalModel',event.target.value.trim()),'임베딩 모델을 저장하지 못했습니다.'));
    node('sr-retrieval-key-save')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        const button=node('sr-retrieval-key-save');
        if (button.disabled) return;
        const provider=deps.settings.retrievalProvider,settings=deps.settings;
        const secret=deps.RETRIEVAL_PROVIDERS[provider]?.secret;
        const input=node('sr-retrieval-key'),original=input.value;
        if (provider==='vertexai' && original.trim().startsWith('{')) throw new Error('서비스 계정 JSON은 SillyTavern 연결 설정에서 등록하세요. 이 칸은 Vertex Express API 키용입니다.');
        const value=normalizeEmbeddingCredential(original);
        if (!secret || !value) throw new Error('새 API 키를 입력하세요. 저장된 키를 쓴다면 연결 확인만 누르면 됩니다.');
        if (provider==='vertexai' && value.startsWith('{')) throw new Error('서비스 계정 JSON은 SillyTavern 연결 설정에서 등록하세요. 이 칸은 Vertex Express API 키용입니다.');
        button.disabled=true;
        try {
            await secretRequest(deps,'write',{key:secret,value,label:'Scene Reader retrieval'});
            if (input.value===original) input.value='';
            if (settings===deps.settings && provider===settings.retrievalProvider) {
                if (provider==='vertexai') {
                    try { await deps.saveRetrievalSettings({retrievalVertexAuth:'express'}); }
                    catch { throw new Error('키는 저장됐지만 Express 연결 설정을 저장하지 못했습니다. 설정을 확인한 뒤 다시 시도하세요.'); }
                }
                deps.vectorRetrieval.clear();
                await deps.retrievalSecretState();
            }
            notifySceneReaderToast(deps.window,'success','키를 저장했습니다.','씬판독기');
        } finally { button.disabled=false; }
    })(),'임베딩 키를 저장하지 못했습니다.'));
    node('sr-retrieval-test')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        const button=node('sr-retrieval-test');
        if (button.disabled) return;
        if (deps.embeddingMaintenance.isBusy()) throw new Error('임베딩 작업이 끝난 뒤 연결을 확인해 주세요.');
        button.disabled=true;
        const settings=deps.settings,provider=settings.retrievalProvider;
        const status=node('sr-retrieval-key-status');
        try {
            await deps.retrievalSecretState();
            if (settings!==deps.settings || provider!==settings.retrievalProvider) return;
            status.textContent='임베딩 연결 확인 중…';
            const result=await deps.vectorRetrieval.test();
            if (settings!==deps.settings || provider!==settings.retrievalProvider) return;
            status.textContent=result;
            notifySceneReaderToast(deps.window,'success',result,'씬판독기');
        } catch(error) {
            if (settings===deps.settings && provider===settings.retrievalProvider) status.textContent=`연결 실패 · ${error.message}`;
            throw error;
        } finally { button.disabled=false; }
    })(),'임베딩 연결 확인에 실패했습니다.'));
}
