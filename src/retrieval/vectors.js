import { fixedEmbeddingModel, VERTEX_EMBEDDING_REGION } from './connection-settings.js';
import { withRequestLifetime } from '../adapters/request-lifetime.js';
import {createRetrievalSchedule} from './scheduling.js';
import { requestFailure } from '../adapters/failure-info.js';
import { createEmbeddingCredentialDiagnostics, embeddingCredentialStore } from './credentials.js';
import {hash32,hash53,queryText,recordText} from './identity.js';
import {createSharedQuery} from './shared-query.js';
import {recordHashes} from './record-hashes.js';
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
    let cacheEpoch=0;
    function invalidateQueries(collectionId) {
        cacheEpoch++;
        if(!collectionId){queries.clear();return;}
        for(const [key,value] of queries)if(value.collectionId===collectionId)queries.delete(key);
    }
    let maintenanceCount=0;
    const schedule = createRetrievalSchedule();
    const budgets = {list:15000, insert:45000, delete:15000, query:15000, ...requestTimeouts};
    const report = detail => { try { onDiagnostic(detail); } catch { /* diagnostics cannot affect requests */ } };
    const credentials=createEmbeddingCredentialDiagnostics({fetch,getRequestHeaders,onDiagnostic:report});
    const sharedQuery=createSharedQuery({fetch,getRequestHeaders,report});
    function boundedSignal(signal, recovery=false, maintenance=false) {
        const controller = new AbortController();
        const relay = () => controller.abort(signal?.reason);
        if (signal?.aborted) relay();
        else signal?.addEventListener('abort', relay, { once: true });
        const started=Date.now(),expire=()=>controller.abort(Object.assign(new Error('검색 연결 시간이 초과되었습니다.'),{code:'REQUEST_TIMEOUT'}));
        let timer = setTimeout(expire, maintenance?300000:recovery?Math.max(timeoutMs,70000):timeoutMs);
        return { signal: controller.signal, preparing:()=>{clearTimeout(timer);timer=setTimeout(expire,Math.max(1,300000-(Date.now()-started)));},finish: () => { clearTimeout(timer); signal?.removeEventListener('abort', relay); } };
    }
    async function post(route, body, signal, recovery=false, sharedText='') {
        const started = Date.now();
        const detail = {module:'src/retrieval/vectors.js',phase:route,provider:body.source,bankHash:hash32(body.collectionId),recordCount:body.items?.length || 0,
            transport:sharedText?'scene_reader_shared_vector':'sillytavern_vector_api',httpScope:'sillytavern',upstreamStatusKnown:false,credentialStore:embeddingCredentialStore(body),
            authMode:body.source==='vertexai'?body.vertexai_auth_mode:body.source==='transformers'?'local':'api',
            model:body.source==='transformers'?'host_configured':body.model===RETRIEVAL_PROVIDERS[body.source]?.model?body.model:'custom',
            region:body.vertexai_region || 'default'};
        report({...detail,status:'started'});
        try {
            const result = await schedule.request(() => withRequestLifetime(async requestSignal => {
                if(route==='insert'||route==='delete')invalidateQueries(body.collectionId);
                if(route==='query'&&sharedText){
                    const shared=await sharedQuery.query({...body,searchText:sharedText},requestSignal);
                    if(shared)return shared;
                    detail.transport='sillytavern_vector_api';
                }
                const response = await fetch(`/api/vector/${route}`, { method:'POST', headers:getRequestHeaders(), body:JSON.stringify(body), signal:requestSignal });
                if (!response.ok) throw Object.assign(new Error(`SillyTavern 검색 연결 오류 (${response.status})`), {code:'RETRIEVAL_HTTP_ERROR',httpStatus:response.status});
                return route === 'insert' || route === 'delete' ? null : await response.json();
            }, {signal, timeoutMs:recovery?Math.max(budgets[route],60000):budgets[route], timeoutMessage:'검색 연결 시간이 초과되었습니다.'}), {signal,exclusive:body.source==='transformers'||route==='insert'||route==='delete'});
            signal?.throwIfAborted();
            report({...detail,status:'succeeded',durationMs:Date.now()-started});
            return result;
        } catch(error) {
            const sharedFailures={EMBEDDING_BUSY:'앞선 임베딩 처리가 진행 중입니다. 완료 후 다시 시도하세요.',EMBEDDING_INDEX_MISSING:'임베딩이 준비되지 않아 기록 매칭으로 진행합니다. 임베딩 재시도를 사용해 주세요.',EMBEDDING_DIMENSION_MISMATCH:'저장된 벡터와 모델의 차원이 다릅니다. 해당 자료의 임베딩을 다시 준비해 주세요.',EMBEDDING_INVALID_VECTOR:'임베딩 응답 형식이 올바르지 않아 기록 매칭으로 진행합니다.'};
            const failure=sharedFailures[error.code]?Object.assign(new Error(sharedFailures[error.code]),{code:error.code,httpStatus:error.httpStatus}):requestFailure(error,'RETRIEVAL','SillyTavern 임베딩 연결');
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
    function entryMap(kind, items, savedHashes=new Set()) {
        const map = new Map();
        for (const [index, item] of items.entries()) {
            const text = recordText(kind, item);
            const hashes=recordHashes(kind,item,index);
            const hash = hashes.find(value=>savedHashes.has(value))??hashes[0];
            if (map.has(hash)) throw new Error('검색 기록 해시 충돌');
            map.set(hash, { hash, index, text, item });
        }
        return map;
    }
    async function search({ kind, bankId, items, transcript, sharedTranscript='', limit = 12, signal, recovery=false, indexOnly=false, forceRebuild=false, background=false, validate=()=>{} }) {
        if (!items.length || (!indexOnly && !queryText(transcript))) return { indices: [], status: 'empty' };
        if(!indexOnly&&maintenanceCount)return {indices:[],status:'fallback',code:'EMBEDDING_MAINTENANCE',error:'임베딩 정비 중 · 이번 판독은 기록 매칭으로 진행합니다.'};
        if(indexOnly)maintenanceCount++;
        const bounded = boundedSignal(signal,recovery,indexOnly);
        const progress = background ? () => {} : onProgress;
        let indexCounts,preparing=false;
        try {
            validate();
            const options = config();
            const sharedText=!indexOnly&&queryText(sharedTranscript)&&await sharedQuery.supported(options.source,bounded.signal)?queryText(sharedTranscript):'';
            await credentials.inspect(options,bounded.signal);
            validate();
            const collectionId = `scene-reader-${kind}-${hash32(bankId)}`;
            const body = { ...options, collectionId };
            let entries;
            // The same bank can switch A -> B -> A, or be changed in another tab.
            // A cheap list request checks the actual index; it does not embed text.
            {
                progress({kind, phase:'checking'});
                const saved = await post('list', body, bounded.signal,recovery);
                validate();
                if (!Array.isArray(saved)) throw new Error('검색 색인 목록 오류');
                const savedHashes = new Set(saved.map(Number));
                entries=entryMap(kind,items,savedHashes);
                const stale = [...savedHashes].filter(hash => !entries.has(hash));
                const missing = [...entries.values()].filter(entry => forceRebuild || !savedHashes.has(entry.hash));
                indexCounts = {totalCount:entries.size,savedCount:savedHashes.size,missingCount:missing.length,staleCount:stale.length,reusedCount:forceRebuild?0:entries.size-missing.length,generatedCount:0};
                report({module:'src/retrieval/vectors.js',phase:'index_check',status:'succeeded',bankHash:hash32(collectionId),provider:options.source,model:options.model||'host_configured',...indexCounts});
                preparing=missing.length>0;
                if(preparing)bounded.preparing();
                if (indexOnly) {
                    progress({kind,phase:'syncing',...indexCounts});
                    report({module:'src/retrieval/vectors.js',phase:'index_sync',status:'started',bankHash:hash32(bankId),...indexCounts,forceRebuild});
                }
                if (missing.length) progress({kind, phase:'indexing', count:missing.length});
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
                    indexCounts.generatedCount+=batch.length;
                    validate();
                }
                // A successful HTTP insert is not proof that the index contains
                // the records. Verify before deleting old entries or querying.
                if(missing.length){
                    const actual=await post('list',body,bounded.signal,recovery);
                    validate();const verified=new Set(Array.isArray(actual)?actual.map(Number):[]);
                    if(!Array.isArray(actual)||[...entries.keys()].some(hash=>!verified.has(hash)))throw Object.assign(new Error('필요한 임베딩의 저장을 확인하지 못했습니다. 판독을 중단합니다. 재시도하면 저장된 부분은 재사용합니다.'),{code:'EMBEDDING_VERIFY_FAILED'});
                }
                // Do not remove the previous index until new records were accepted.
                if (stale.length) await post('delete', { ...body, hashes:stale }, bounded.signal,recovery);
                preparing=false;
            }
            const revision = JSON.stringify([body, [...entries.keys()]]);
            const cacheKey = `${revision}\n${queryText(transcript)}\n${limit}`;
            if (indexOnly) {
                const saved=await post('list',body,bounded.signal,recovery);
                validate();
                const verified = new Set(Array.isArray(saved)?saved.map(Number):[]);
                if (!Array.isArray(saved) || [...entries.keys()].some(hash=>!verified.has(hash))) throw new Error('임베딩 저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
                invalidateQueries(collectionId);
                report({module:'src/retrieval/vectors.js',phase:'index_sync',status:'succeeded',bankHash:hash32(bankId),...indexCounts,forceRebuild});
                return {indices:[],status:'rebuilt',recordCount:entries.size,...indexCounts};
            }
            if (!sharedText && options.source !== 'transformers' && queries.has(cacheKey) && !indexCounts.generatedCount) {
                report({module:'src/retrieval/vectors.js',phase:'query_cache',status:'succeeded',provider:options.source,bankHash:hash32(collectionId)});
                return { indices: [...queries.get(cacheKey).indices], status: 'cached' };
            }
            progress({kind, phase:'querying'});
            const queryEpoch=cacheEpoch;
            const result = await post('query', { ...body, searchText: queryText(transcript), topK: Math.min(limit, items.length), threshold: 0.01 }, bounded.signal,recovery,sharedText);
            // The native API returns sorted metadata, but no numeric similarity scores.
            // Never use its unfiltered hashes as accepted matches.
            if (!Array.isArray(result?.metadata)) throw new Error('검색 결과 형식 오류');
            const indices = [...new Set(result.metadata.map(value => entries.get(Number(value.hash))?.index).filter(Number.isInteger))].slice(0,limit);
            if(!sharedText&&queryEpoch===cacheEpoch)queries.set(cacheKey, {indices:[...indices],collectionId});
            if (queries.size > 48) queries.delete(queries.keys().next().value);
            return { indices, status: 'ready',...(result.sharedVector?{sharedVector:true}:{}) };
        } catch (error) {
            if (signal?.aborted) throw signal.reason || error;
            const reason = bounded.signal.aborted ? '검색 연결 시간이 초과되었습니다.' : status(error);
            if(preparing)report({module:'src/retrieval/vectors.js',phase:'index_sync',status:'failed',errorKind:error.code||'EMBEDDING_PREPARATION_FAILED',...indexCounts});
            progress({kind, phase:preparing?'prepare_failed':'fallback', error:reason});
            return { indices: [], status: 'fallback', error: reason, code:error.code || 'RETRIEVAL_FAILED',...(preparing?{preparationFailed:true}:{}) };
        } finally {
            if(indexOnly)maintenanceCount--;
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
    async function searchPaged({kind,bankId,count,transcript,sharedTranscript='',signal,recovery=false,pages}) {
        if(maintenanceCount)return {indices:[],hashes:[],status:'fallback',code:'EMBEDDING_MAINTENANCE',error:'임베딩 정비 중 · 이번 판독은 기록 매칭으로 진행합니다.'};
        const bounded=boundedSignal(signal,recovery);
        let preparing=false;
        try {const options=config();const body={...options,collectionId:`scene-reader-${kind}-${hash32(bankId)}`};await credentials.inspect(options,bounded.signal);
            const saved=await post('list',body,bounded.signal,recovery);if(!Array.isArray(saved))throw new Error('검색 색인 목록 오류');
            if(new Set(saved.map(Number)).size<count){
                preparing=true;bounded.preparing();
                if(!pages)throw Object.assign(new Error('누락된 임베딩의 원본 기록을 불러오지 못했습니다.'),{code:'EMBEDDING_SOURCE_UNAVAILABLE'});
                const prepared=await rebuildPaged({kind,bankId,count,pages:pages(bounded.signal),signal:bounded.signal});
                if(prepared.status!=='rebuilt')throw Object.assign(new Error(prepared.error),{code:prepared.code});
                preparing=false;
            }
            const sharedText=queryText(sharedTranscript)&&await sharedQuery.supported(options.source,bounded.signal)?queryText(sharedTranscript):'';
            const result=await post('query',{...body,searchText:queryText(transcript),topK:Math.min(12,count),threshold:.01},bounded.signal,recovery,sharedText);
            if(!Array.isArray(result?.metadata))throw new Error('검색 결과 형식 오류');return {...(result.sharedVector?{sharedVector:true}:{}),status:'ready',indices:result.metadata.map(item=>item.index).filter(index=>Number.isInteger(index)&&index>=0&&index<count),hashes:result.metadata.map(item=>item.hash)};
        }catch(error){if(signal?.aborted)throw signal.reason||error;onProgress({kind,phase:preparing?'prepare_failed':'fallback',error:status(error)});return {status:'fallback',indices:[],hashes:[],code:error.code||'RETRIEVAL_FAILED',error:status(error),...(preparing?{preparationFailed:true}:{})};}finally{bounded.finish();}
    }
    async function rebuildPaged({kind,bankId,count,pages,signal,forceRebuild=false,validate=()=>{}}){
        maintenanceCount++;
        let reusedCount=0,generatedCount=0;const entries=new Set();
        try{
            validate();const options=config();await credentials.inspect(options,signal);const body={...options,collectionId:`scene-reader-${kind}-${hash32(bankId)}`};
            const saved=await post('list',body,signal,true);if(!Array.isArray(saved))throw new Error('검색 색인 목록 오류');const savedHashes=new Set(saved.map(Number));
            for await(const page of pages){validate();signal?.throwIfAborted();const missing=[];
                for(let at=0;at<page.records.length;at++){const item=page.records[at],index=page.indices[at],text=recordText(kind,item),hashes=recordHashes(kind,item,index),hash=hashes.find(value=>savedHashes.has(value))??hashes[0];if(entries.has(hash))throw new Error('검색 기록 해시 충돌');entries.add(hash);if(!forceRebuild&&savedHashes.has(hash))reusedCount++;else missing.push({hash,index,text});}
                for(let offset=0;offset<missing.length;){const batch=[];let chars=0;while(offset<missing.length&&batch.length<20){const entry=missing[offset];if(batch.length&&chars+entry.text.length>16000)break;batch.push(entry);chars+=entry.text.length;offset++;}validate();if(forceRebuild){const hashes=batch.map(item=>item.hash).filter(hash=>savedHashes.has(hash));if(hashes.length)await post('delete',{...body,hashes},signal,true);}validate();await post('insert',{...body,items:batch},signal,true);generatedCount+=batch.length;}
                onProgress({kind,phase:'syncing',totalCount:count,reusedCount,generatedCount});
            }
            validate();if(entries.size!==count)throw new Error('일부 인물 기록을 읽지 못해 임베딩 완료로 처리하지 않았습니다.');
            const actual=await post('list',body,signal,true),verified=new Set(Array.isArray(actual)?actual.map(Number):[]);if(!Array.isArray(actual)||[...entries].some(hash=>!verified.has(hash)))throw new Error('임베딩 저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
            const stale=[...savedHashes].filter(hash=>!entries.has(hash));if(stale.length){validate();await post('delete',{...body,hashes:stale},signal,true);}invalidateQueries(body.collectionId);
            report({module:'src/retrieval/vectors.js',phase:'index_sync',status:'succeeded',bankHash:hash32(bankId),totalCount:count,reusedCount,generatedCount,forceRebuild});return {status:'rebuilt',recordCount:count,reusedCount,generatedCount};
        }catch(error){if(signal?.aborted)throw signal.reason||error;return {status:'fallback',code:error.code||'EMBEDDING_REBUILD_FAILED',error:status(error)};}
        finally{maintenanceCount--;}
    }
    // Lock the whole read/sync/query sequence, not individual requests. A second
    // caller then sees the completed index and can reuse an identical query.
    const inBank=(operation,options)=>schedule.bank(JSON.stringify([options.kind,options.bankId]),()=>operation(options),options.signal);
    return { search:options=>inBank(search,options), searchPaged:options=>inBank(searchPaged,options), rebuildPaged:options=>inBank(rebuildPaged,options),
        rebuild:options=>inBank(search,{...options,indexOnly:true,forceRebuild:options.forceRebuild===true,recovery:true}),
        test:signal=>schedule.bank('connection-test',()=>test(signal),signal), config, clear: () => {invalidateQueries();credentials.clear();} };
}
