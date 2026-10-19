const crypto=require('node:crypto');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

function createSceneCache({maxEntries=64,perUser=16,ttlMs=30*60*1000,now=Date.now}={}){
    const ready=new Map(),pending=new Map();
    async function get(user,scope,text,embed){
        const owner=digest(user),key=digest(JSON.stringify([owner,1,scope,text]));
        for(const [id,item] of ready)if(now()-item.at>ttlMs)ready.delete(id);
        if(ready.has(key)){const item=ready.get(key);ready.delete(key);ready.set(key,item);return {vector:item.vector,cache:'hit',embeddingMs:0};}
        if(pending.has(key))return {...await pending.get(key).promise,cache:'joined'};
        // Host helpers do not expose cancellation. Keep an outstanding job in
        // this bounded map until it settles, even if all HTTP callers time out.
        const local=scope[0]==='transformers';
        if(pending.size>=8||[...pending.values()].filter(item=>item.owner===owner).length>=2||(local&&[...pending.values()].some(item=>item.local)))throw Object.assign(new Error('Embedding is already busy. Retry after it finishes.'),{code:'EMBEDDING_BUSY',status:429});
        const started=now();
        const job={owner,local,promise:null};
        job.promise=Promise.resolve().then(()=>embed(text)).then(vector=>{
            if(!Array.isArray(vector)||!vector.length||vector.length>16384||vector.some(value=>!Number.isFinite(value))||!vector.some(value=>value!==0))throw Object.assign(new Error('Invalid embedding response.'),{code:'EMBEDDING_INVALID_VECTOR',status:502});
            ready.set(key,{owner,vector,at:now()});
            for(const [id,item] of ready){if([...ready.values()].filter(value=>value.owner===owner).length<=perUser)break;if(item.owner===owner)ready.delete(id);}
            while(ready.size>maxEntries)ready.delete(ready.keys().next().value);
            return {vector,cache:'miss',embeddingMs:now()-started};
        }).finally(()=>pending.delete(key));
        pending.set(key,job);
        return job.promise;
    }
    return {get};
}
module.exports={createSceneCache};
