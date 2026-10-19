const {discoverHost}=require('./host.cjs');
const {createSceneCache}=require('./scene-cache.cjs');
const SOURCES=new Set(['transformers','palm','vertexai','nanogpt']);
const OWNED=/^scene-reader-(?:(?:character|world)-\d+|connection-test)$/;

function registerRetrieval(router,{host,cache=createSceneCache(),timeoutMs=14000}={}){
    let hostPromise;
    const getHost=()=>hostPromise||=(host?Promise.resolve(host):discoverHost());
    router.post('/retrieval/capabilities',async(request,response)=>{
        if(!request.user?.directories?.root)return response.status(401).json({code:'AUTH_REQUIRED'});
        const adapter=await getHost();
        return response.json({version:1,sharedSceneVector:adapter.sources.length>0,sources:adapter.sources});
    });
    router.post('/retrieval/query',async(request,response)=>{
        let timer,expired=false;
        try{
            if(!request.user?.directories?.root||!request.user.directories.vectors)return response.status(401).json({code:'AUTH_REQUIRED'});
            const input=request.body||{};
            if(!SOURCES.has(input.source)||!OWNED.test(input.collectionId)||typeof input.searchText!=='string'||!input.searchText.trim()||input.searchText.length>4500||!Number.isInteger(input.topK)||input.topK<1||input.topK>40||!Number.isFinite(input.threshold)||input.threshold<0||input.threshold>1) return response.status(400).json({code:'RETRIEVAL_INVALID_INPUT'});
            // Pass only supported native embedding options. No reverse proxies.
            const body={source:input.source,collectionId:input.collectionId,model:input.model,api:input.source==='vertexai'?'vertexai':undefined,vertexai_auth_mode:input.vertexai_auth_mode==='full'?'full':'express',vertexai_region:String(input.vertexai_region||'global').slice(0,100),vertexai_express_project_id:String(input.vertexai_express_project_id||'').slice(0,200)};
            const scopedRequest={...request,body,user:request.user};
            const work=(async()=>{
                const adapter=await getHost(),prepared=await adapter.prepare(scopedRequest);
                const result=await cache.get(request.user.directories.root,prepared.scope,input.searchText,prepared.embed);
                if(expired||response.destroyed||response.writableEnded)return null;
                const started=Date.now(),found=await prepared.query(result.vector,input.topK,input.threshold);
                return {...found,sharedVector:{cache:result.cache,embeddingMs:result.embeddingMs,indexMs:Date.now()-started}};
            })();
            const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Object.assign(new Error('Embedding timed out.'),{code:'RETRIEVAL_TIMEOUT',status:504}));},timeoutMs);})]);
            if(!response.destroyed&&result)return response.json(result);
        }catch(error){if(!response.destroyed)return response.status(error.status||502).json({code:error.code||'RETRIEVAL_UPSTREAM_ERROR',error:'Shared embedding search failed. Retry or use record matching.'});}
        finally{clearTimeout(timer);}
    });
}
module.exports={registerRetrieval};
