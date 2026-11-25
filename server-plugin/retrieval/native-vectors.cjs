// NanoGPT-only native vector transport for Hub-owned collections.
// Preserve SillyTavern's Vectra paths, metadata, and hash identifiers.
const OWNED=/^scene-reader-(?:(?:character|world)-\d+|connection-test)$/;
const ACTIONS=new Set(['list','insert','query','delete']);
const invalid=()=>Object.assign(new Error('Invalid scene retrieval vector request.'),{code:'RETRIEVAL_INVALID_INPUT',status:400});
const validHash=value=>Number.isSafeInteger(value)&&value>=0;
const validVector=vector=>Array.isArray(vector)&&vector.length>0&&vector.length<=16384&&vector.every(Number.isFinite)&&vector.some(value=>value!==0);
function validate(body,action){
    if(body?.source!=='nanogpt'||!OWNED.test(body.collectionId)||typeof body.model!=='string'||!body.model.trim()||body.model.length>200)throw invalid();
    if(action==='insert'){
        if(!Array.isArray(body.items)||body.items.length<1||body.items.length>20)throw invalid();
        if(body.items.some(item=>!validHash(item?.hash)||!Number.isInteger(item.index)||item.index<0||typeof item.text!=='string'||!item.text.trim()||item.text.length>16000))throw invalid();
        if(body.items.reduce((sum,item)=>sum+item.text.length,0)>16000)throw invalid();
    }else if(action==='delete'){
        if(!Array.isArray(body.hashes)||body.hashes.length>1000||body.hashes.some(value=>!validHash(value)))throw invalid();
    }else if(action==='query'){
        if(typeof body.searchText!=='string'||!body.searchText.trim()||body.searchText.length>4500||!Number.isInteger(body.topK)||body.topK<1||body.topK>40||!Number.isFinite(body.threshold)||body.threshold<0||body.threshold>1)throw invalid();
    }
}
async function runNative(prepared,action,body){
    const store=prepared.index;
    if(action==='list')return (await store.listItems()).map(item=>Number(item.metadata.hash));
    if(action==='insert'){
        const vectors=[];
        for(let i=0;i<body.items.length;i+=10){
            const batch=await prepared.embedBatch(body.items.slice(i,i+10).map(item=>item.text));
            if(!Array.isArray(batch)||batch.length!==Math.min(10,body.items.length-i)||batch.some(v=>!validVector(v)))throw Object.assign(new Error('Invalid NanoGPT vector response.'),{code:'EMBEDDING_INVALID_VECTOR',status:502});
            vectors.push(...batch);
        }
        await store.beginUpdate();
        try{
            for(let i=0;i<body.items.length;i++){
                const item=body.items[i];
                await store.upsertItem({vector:vectors[i],metadata:{hash:item.hash,text:item.text,index:item.index}});
            }
        }finally{await store.endUpdate();}
        return null;
    }
    if(action==='delete'){
        const items=await store.listItemsByMetadata({hash:{$in:body.hashes}});
        await store.beginUpdate();
        try{for(const item of items)await store.deleteItem(item.id);}
        finally{await store.endUpdate();}
        return null;
    }
    const vector=(await prepared.embedBatch([body.searchText]))[0];
    if(!validVector(vector))throw Object.assign(new Error('Invalid NanoGPT vector response.'),{code:'EMBEDDING_INVALID_VECTOR',status:502});
    const items=await store.listItems();
    if(items.some(item=>!validVector(item.vector)||item.vector.length!==vector.length))throw Object.assign(new Error('Embedding dimensions do not match.'),{code:'EMBEDDING_DIMENSION_MISMATCH',status:409});
    const result=await store.queryItems(vector,body.topK);
    return {metadata:result.filter(hit=>hit.score>=body.threshold).map(hit=>hit.item.metadata),hashes:result.map(hit=>Number(hit.item.metadata.hash))};
}
function registerNativeVectors(router,{getHost,getNanoKey=async()=>''}){
    router.post('/retrieval/vector/:action',async(request,response)=>{
        try{
            if(!request.user?.directories?.root||!request.user?.directories?.vectors)return response.status(401).json({code:'AUTH_REQUIRED'});
            const action=request.params?.action;
            if(!ACTIONS.has(action))return response.status(404).json({code:'RETRIEVAL_ROUTE_UNKNOWN'});
            const body=request.body||{};
            validate(body,action);
            const host=await getHost();
            if(!host.sources?.includes('nanogpt'))throw Object.assign(new Error('NanoGPT native vector transport unsupported.'),{code:'SHARED_RETRIEVAL_UNSUPPORTED',status:501});
            const nanoKey=await getNanoKey(request);if(!nanoKey)throw Object.assign(new Error('Scene Reader NanoGPT embedding key is missing.'),{code:'EMBEDDING_CREDENTIAL_MISSING',status:401});
            const prepared=await host.prepare({...request,body,user:request.user},{createIndex:true,nanoKey});
            const result=await runNative(prepared,action,body);
            if(!response.destroyed)return result===null?response.sendStatus(200):response.json(result);
        }catch(error){
            const status=Number(error.status||error.httpStatus);
            if(!response.destroyed)return response.status(Number.isInteger(status)&&status>=400&&status<=599?status:502).json({code:error.code||'RETRIEVAL_UPSTREAM_ERROR',error:'Scene Reader embedding request failed.'});
        }
    });
}
module.exports={registerNativeVectors,runNative,validate};
