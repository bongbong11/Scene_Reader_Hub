import {withRequestLifetime} from '../adapters/request-lifetime.js';
const ROOT='/api/plugins/scene-reader-jev/retrieval';

// Capability negotiation is independent of the main request: cancelling one
// generation must not cancel another caller's capability check.
export function createSharedQuery({fetch,getRequestHeaders,report=()=>{}}){
    let capabilities=null,expires=0,probing=null;
    async function supported(source,signal){
        if(Date.now()>=expires&&!probing)probing=withRequestLifetime(async requestSignal=>{
            const response=await fetch(`${ROOT}/capabilities`,{method:'POST',headers:getRequestHeaders(),body:'{}',signal:requestSignal});
            if(!response.ok)return null;
            const value=await response.json();return value?.version===1&&value.sharedSceneVector&&Array.isArray(value.sources)?value:null;
        },{timeoutMs:2500}).catch(()=>null).then(value=>{capabilities=value;expires=Date.now()+60000;}).finally(()=>{probing=null;});
        if(probing)await withRequestLifetime(()=>probing,{signal,timeoutMs:3000});
        signal?.throwIfAborted();
        const enabled=Boolean(capabilities?.sources.includes(source));
        report({module:'src/retrieval/shared-query.js',phase:'shared_search',status:enabled?'ready':'fallback',code:enabled?'SHARED_VECTOR_ENABLED':'SHARED_VECTOR_UNAVAILABLE',provider:source});
        return enabled;
    }
    async function query(body,signal){
        const response=await fetch(`${ROOT}/query`,{method:'POST',headers:getRequestHeaders(),body:JSON.stringify(body),signal});
        if(!response.ok){
            const result=await response.json().catch(()=>({}));
            if(response.status===404||result.code==='SHARED_RETRIEVAL_UNSUPPORTED'){capabilities=null;expires=Date.now()+60000;return null;}
            const code=/^(?:EMBEDDING_[A-Z_]+|RETRIEVAL_[A-Z_]+)$/.test(result.code)?result.code:'RETRIEVAL_HTTP_ERROR';
            throw Object.assign(new Error(`공유 임베딩 검색 실패 (${response.status})`),{code,httpStatus:response.status});
        }
        const result=await response.json();
        if(result.sharedVector)report({module:'src/retrieval/shared-query.js',phase:'scene_vector',status:'succeeded',provider:body.source,cache:result.sharedVector.cache,embeddingMs:result.sharedVector.embeddingMs,indexMs:result.sharedVector.indexMs});
        return result;
    }
    return {supported,query};
}
