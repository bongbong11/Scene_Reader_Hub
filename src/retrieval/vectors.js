import { fixedEmbeddingModel, VERTEX_EMBEDDING_REGION } from './connection-settings.js';
import { withRequestLifetime, createRequestQueue } from '../adapters/request-lifetime.js';
import { requestFailure } from '../adapters/failure-info.js';
import { createEmbeddingCredentialDiagnostics, embeddingCredentialStore } from './credentials.js';
import {hash32,hash53,queryText,recordText} from './identity.js';
// Scene Reader owns retrieval. SillyTavern owns embedding inference, indexes and API secrets.
export const RETRIEVAL_PROVIDERS = Object.freeze({
    transformers: { label: 'SillyTavern 로컬', model: '', secret: '' },
    palm: { label: 'Gemini · AI Studio', model: 'gemini-embedding-001', secret: 'api_key_makersuite' },
    vertexai: { label: 'Google Vertex AI', model: 'gemini-embedding-001', secret: 'api_key_vertexai' },
    nanogpt: { label: 'NanoGPT Qwen', model: 'Qwen/Qwen3-Embedding-0.6B', secret: 'api_key_nanogpt' },
});





const status = error => String(error?.message || error || '검색 오류').slice(0, 180);

export function createVectorRetrieval({ fetch, getRequestHeaders, getSettings, onProgress = () => {}, onDiagnostic = () => {}, timeoutMs = 60000, requestTimeouts = {} }) {
    const queries = new Map();
    const enqueue = createRequestQueue();
    const budgets = {list:15000, insert:45000, delete:15000, query:15000, ...requestTimeouts};
    const report = detail => { try { onDiagnostic(detail); } catch { /* diagnostics cannot affect requests */ } };
    const credentials=createEmbeddingCredentialDiagnostics({fetch,getRequestHeaders,onDiagnostic:report});
    function boundedSignal(signal, recovery=false, maintenance=false) {
        const controller = new AbortController();
        const relay = () => controller.abort(signal?.reason);
        if (signal?.aborted) relay();
        else signal?.addEventListener('abort', relay, { once: true });
        const timer = setTimeout(() => controller.abort(Object.assign(new Error('검색 연결 시간이 초과되었습니다.'),{code:'REQUEST_TIMEOUT'})), maintenance?300000:recovery?Math.max(timeoutMs,70000):timeoutMs);
        return { signal: controller.signal, finish: () => { clearTimeout(timer); signal?.removeEventListener('abort', relay); } };
    }
    async function post(route, body, signal, recovery=false) {
        const started = Date.now();
        const detail = {module:'src/retrieval/vectors.js',phase:route,provider:body.source,bankHash:hash32(body.collectionId),recordCount:body.items?.length || 0,
            transport:'sillytavern_vector_api',httpScope:'sillytavern',upstreamStatusKnown:false,credentialStore:embeddingCredentialStore(body),
            authMode:body.source==='vertexai'?body.vertexai_auth_mode:body.source==='transformers'?'local':'api',
            model:body.source==='transformers'?'host_configured':body.model===RETRIEVAL_PROVIDERS[body.source]?.model?body.model:'custom',
            region:body.vertexai_region || 'default'};
        report({...detail,status:'started'});
        try {
            const result = await enqueue(() => withRequestLifetime(async requestSignal => {
                const response = await fetch(`/api/vector/${route}`, { method:'POST', headers:getRequestHeaders(), body:JSON.stringify(body), signal:requestSignal });
                if (!response.ok) throw Object.assign(new Error(`SillyTavern 검색 연결 오류 (${response.status})`), {code:'RETRIEVAL_HTTP_ERROR',httpStatus:response.status});
                return route === 'insert' || route === 'delete' ? null : await response.json();
            }, {signal, timeoutMs:recovery?Math.max(budgets[route],60000):budgets[route], timeoutMessage:'검색 연결 시간이 초과되었습니다.'}), signal);
            signal?.throwIfAborted();
            report({...detail,status:'succeeded',durationMs:Date.now()-started});
            return result;
        } catch(error) {
            const failure=requestFailure(error,'RETRIEVAL','SillyTavern 임베딩 연결');
            report({...detail,status:signal?.aborted && !/TIMEOUT/.test(error?.code || '')?'cancelled':'failed',durationMs:Date.now()-started,errorKind:failure.code,httpStatus:failure.httpStatus});
            throw failure;
        }
    }
    function config() {
        const settings = getSettings();
        const source = RETRIEVAL_PROVIDERS[settings.retrievalProvider] ? settings.retrievalProvider : 'transformers';
        const model = source === 'transformers' ? '' : fixedEmbeddingModel(source) || String(settings.retrievalModel || RETRIEVAL_PROVIDERS[source].model).trim();
        if (source !== 'transformers' && !model) throw new Error('검색 모델 이름을 설정하세요.');
        return { source, model, ...(source === 'vertexai' ? { api: 'vertexai', vertexai_auth_mode: settings.retrievalVertexAuth === 'full' ? 'full' : 'express', vertexai_region: VERTEX_EMBEDDING_REGION, vertexai_express_project_id: settings.retrievalVertexProject || '' } : {}) };
    }
    function entryMap(kind, items) {
        const map = new Map();
        for (const [index, item] of items.entries()) {
            const text = recordText(kind, item);
            const hash = hash53(JSON.stringify([kind, item.id || index, item, text]));
            if (map.has(hash)) throw new Error('검색 기록 해시 충돌');
            map.set(hash, { hash, index, text, item });
        }
        return map;
    }
    async function search({ kind, bankId, items, transcript, limit = 12, signal, recovery=false, indexOnly=false, forceRebuild=false, validate=()=>{} }) {
        if (!items.length || (!indexOnly && !queryText(transcript))) return { indices: [], status: 'empty' };
        const bounded = boundedSignal(signal,recovery,indexOnly);
        let indexCounts;
        try {
            validate();
            const options = config();
            await credentials.inspect(options,bounded.signal);
            validate();
            const collectionId = `scene-reader-${kind}-${hash32(bankId)}`;
            const body = { ...options, collectionId };
            const entries = entryMap(kind, items);
            const revision = JSON.stringify([body, [...entries.keys()]]);
            const cacheKey = `${revision}\n${queryText(transcript)}\n${limit}`;
            // The same bank can switch A -> B -> A, or be changed in another tab.
            // A cheap list request checks the actual index; it does not embed text.
            {
                onProgress({kind, phase:'checking'});
                const saved = await post('list', body, bounded.signal,recovery);
                validate();
                if (!Array.isArray(saved)) throw new Error('검색 색인 목록 오류');
                const savedHashes = new Set(saved.map(Number));
                const stale = [...savedHashes].filter(hash => !entries.has(hash));
                const missing = [...entries.values()].filter(entry => forceRebuild || !savedHashes.has(entry.hash));
                indexCounts = {totalCount:entries.size,reusedCount:forceRebuild?0:entries.size-missing.length,generatedCount:missing.length};
                if (indexOnly) {
                    onProgress({kind,phase:'syncing',...indexCounts});
                    report({module:'src/retrieval/vectors.js',phase:'index_sync',status:'started',bankHash:hash32(bankId),...indexCounts,forceRebuild});
                }
                if (missing.length) onProgress({kind, phase:'indexing', count:missing.length});
                // Bound batches by both count and text size, without dropping records.
                for (let offset = 0; offset < missing.length;) {
                    const batch = []; let chars = 0;
                    while (offset < missing.length && batch.length < 20) {
                        const entry = missing[offset];
                        if (batch.length && chars + entry.text.length > 16000) break;
                        batch.push(entry); chars += entry.text.length; offset++;
                    }
                    validate();
                    // Native insert creates new vector IDs. Remove only this batch's old hashes to avoid duplicates.
                    const replaceHashes = forceRebuild ? batch.map(entry=>entry.hash).filter(hash=>savedHashes.has(hash)) : [];
                    if (replaceHashes.length) await post('delete',{...body,hashes:replaceHashes},bounded.signal,recovery);
                    validate();
                    await post('insert', { ...body, items:batch.map(({hash,index,text}) => ({hash,index,text})) }, bounded.signal,recovery);
                    validate();
                }
                // Do not remove the previous index until new records were accepted.
                if (stale.length) await post('delete', { ...body, hashes:stale }, bounded.signal,recovery);
            }
            if (indexOnly) {
                const saved=await post('list',body,bounded.signal,recovery);
                validate();
                const verified = new Set(Array.isArray(saved)?saved.map(Number):[]);
                if (!Array.isArray(saved) || [...entries.keys()].some(hash=>!verified.has(hash))) throw new Error('임베딩 저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
                queries.clear();
                report({module:'src/retrieval/vectors.js',phase:'index_sync',status:'succeeded',bankHash:hash32(bankId),...indexCounts,forceRebuild});
                return {indices:[],status:'rebuilt',recordCount:entries.size,...indexCounts};
            }
            if (options.source !== 'transformers' && queries.has(cacheKey)) return { indices: queries.get(cacheKey), status: 'cached' };
            onProgress({kind, phase:'querying'});
            const result = await post('query', { ...body, searchText: queryText(transcript), topK: Math.min(limit, items.length), threshold: 0.01 }, bounded.signal,recovery);
            // The native API returns sorted metadata, but no numeric similarity scores.
            // Never use its unfiltered hashes as accepted matches.
            if (!Array.isArray(result?.metadata)) throw new Error('검색 결과 형식 오류');
            const indices = [...new Set(result.metadata.map(value => entries.get(Number(value.hash))?.index).filter(Number.isInteger))].slice(0,limit);
            queries.set(cacheKey, indices);
            if (queries.size > 48) queries.delete(queries.keys().next().value);
            return { indices, status: 'ready' };
        } catch (error) {
            if (signal?.aborted) throw signal.reason || error;
            const reason = bounded.signal.aborted ? '검색 연결 시간이 초과되었습니다.' : status(error);
            onProgress({kind, phase:'fallback', error:reason});
            return { indices: [], status: 'fallback', error: reason, code:error.code || 'RETRIEVAL_FAILED' };
        } finally {
            bounded.finish();
        }
    }
    async function test(signal) {
        const options = config();
        const body = { ...options, collectionId: 'scene-reader-connection-test' };
        const item = { hash: hash53(String(Date.now()) + Math.random()), text: 'A scene retrieval connection test.', index: 0 };
        const bounded = boundedSignal(signal);
        try {
            credentials.clear();
            await credentials.inspect(options,bounded.signal);
            const saved = await post('list', body, bounded.signal);
            if (!Array.isArray(saved)) throw new Error('검색 색인 목록 오류');
            if (saved.length) await post('delete', { ...body, hashes: saved }, bounded.signal);
            await post('insert', { ...body, items: [item] }, bounded.signal);
            const result = await post('query', { ...body, searchText: 'scene retrieval test', topK: 1, threshold: 0.01 }, bounded.signal);
            if (!result?.metadata?.some(value => Number(value.hash) === item.hash)) throw new Error('검색 결과를 확인하지 못했습니다.');
            report({module:'src/retrieval/vectors.js',phase:'connection_test',provider:options.source,status:'succeeded',embeddingVerified:true});
        } catch(error) {
            report({module:'src/retrieval/vectors.js',phase:'connection_test',provider:options.source,status:'failed',errorKind:error.code || 'RETRIEVAL_INVALID_RESPONSE',httpStatus:error.httpStatus || 0});
            throw error;
        } finally {
            await post('delete', { ...body, hashes: [item.hash] }, bounded.signal).catch(() => {});
            bounded.finish();
        }
        return `${RETRIEVAL_PROVIDERS[options.source].label} 연결 성공`;
    }
    async function searchPaged({kind,bankId,count,transcript,signal,recovery=false}) {
        const bounded=boundedSignal(signal,recovery);
        try {const options=config();await credentials.inspect(options,bounded.signal);const result=await post('query',{...options,collectionId:`scene-reader-${kind}-${hash32(bankId)}`,searchText:queryText(transcript),topK:Math.min(12,count),threshold:.01},bounded.signal,recovery);
            if(!Array.isArray(result?.metadata))throw new Error('검색 결과 형식 오류');return {status:result.metadata.length?'ready':'fallback',indices:result.metadata.map(item=>item.index).filter(index=>Number.isInteger(index)&&index>=0&&index<count),hashes:result.metadata.map(item=>item.hash),...(!result.metadata.length?{code:'EMBEDDING_INDEX_MISSING',error:'임베딩이 준비되지 않아 기록 매칭으로 찾습니다. 임베딩 재시도를 사용할 수 있습니다.'}:{})};
        }catch(error){if(signal?.aborted)throw signal.reason||error;return {status:'fallback',indices:[],hashes:[],code:error.code||'RETRIEVAL_FAILED',error:'검색 연결에 실패해 기록 매칭으로 찾습니다.'};}finally{bounded.finish();}
    }
    async function rebuildPaged({kind,bankId,count,pages,signal,forceRebuild=false,validate=()=>{}}){
        let reusedCount=0,generatedCount=0;const entries=new Set();
        try{
            validate();const options=config();await credentials.inspect(options,signal);const body={...options,collectionId:`scene-reader-${kind}-${hash32(bankId)}`};
            const saved=await post('list',body,signal,true);if(!Array.isArray(saved))throw new Error('검색 색인 목록 오류');const savedHashes=new Set(saved.map(Number));
            for await(const page of pages){validate();signal?.throwIfAborted();const missing=[];
                for(let at=0;at<page.records.length;at++){const item=page.records[at],index=page.indices[at],text=recordText(kind,item),hash=hash53(JSON.stringify([kind,item.id||index,item,text]));if(entries.has(hash))throw new Error('검색 기록 해시 충돌');entries.add(hash);if(!forceRebuild&&savedHashes.has(hash))reusedCount++;else missing.push({hash,index,text});}
                for(let offset=0;offset<missing.length;){const batch=[];let chars=0;while(offset<missing.length&&batch.length<20){const entry=missing[offset];if(batch.length&&chars+entry.text.length>16000)break;batch.push(entry);chars+=entry.text.length;offset++;}validate();if(forceRebuild){const hashes=batch.map(item=>item.hash).filter(hash=>savedHashes.has(hash));if(hashes.length)await post('delete',{...body,hashes},signal,true);}validate();await post('insert',{...body,items:batch},signal,true);generatedCount+=batch.length;}
                onProgress({kind,phase:'syncing',totalCount:count,reusedCount,generatedCount});
            }
            validate();if(entries.size!==count)throw new Error('일부 인물 기록을 읽지 못해 임베딩 완료로 처리하지 않았습니다.');
            const actual=await post('list',body,signal,true),verified=new Set(Array.isArray(actual)?actual.map(Number):[]);if(!Array.isArray(actual)||[...entries].some(hash=>!verified.has(hash)))throw new Error('임베딩 저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
            const stale=[...savedHashes].filter(hash=>!entries.has(hash));if(stale.length){validate();await post('delete',{...body,hashes:stale},signal,true);}queries.clear();
            report({module:'src/retrieval/vectors.js',phase:'index_sync',status:'succeeded',bankHash:hash32(bankId),totalCount:count,reusedCount,generatedCount,forceRebuild});return {status:'rebuilt',recordCount:count,reusedCount,generatedCount};
        }catch(error){if(signal?.aborted)throw signal.reason||error;return {status:'fallback',code:error.code||'EMBEDDING_REBUILD_FAILED',error:status(error)};}
    }
    return { search, searchPaged, rebuildPaged, rebuild:options=>search({...options,indexOnly:true,forceRebuild:options.forceRebuild===true,recovery:true}), test, config, clear: () => {queries.clear();credentials.clear();} };
}
