import {clone,decode,documentKey,envelope,fail} from './shared-document.js';
import {createPagedTransport} from './paged-transport.js';
import {bindCharacterPages,packCharacterStore} from './character-pages.js';
import {assetIdentity} from '../baseline/projector.js';
// Reserved documents bypass ordinary chat normalization and companion merging.
export function createSharedTransport({post,noteDiagnostic}) {
    const paged=createPagedTransport(post,{noteDiagnostic});
    bindCharacterPages(post,noteDiagnostic);
    const immutable=new Map(),inflight=new Map();let epoch=0,cacheBytes=0;
    async function read(kind,id,{fresh=false,signal}={}) {
        const key=documentKey(kind,id),started=epoch;signal?.throwIfAborted();
        if(!fresh && immutable.has(key))return clone(immutable.get(key).value);
        if(!fresh && inflight.has(key))return clone(await inflight.get(key));
        const request=(async()=>{
            let stored;
            if((await paged.capabilities())?.schemaVersion===2)stored=await paged.read(key,{signal});
            const response=stored?{chat:stored}:await post('bootstrap',{chatKey:key},{signal});
            signal?.throwIfAborted();
            if(epoch!==started)throw fail('STORAGE_STALE_CHAT','복원된 자료를 다시 불러와 주세요.');
            const result=decode(response.chat,kind,id);
            if(result && ['asset','baseline','original'].includes(kind)){const size=new TextEncoder().encode(JSON.stringify(result)).length;if(immutable.has(key)){cacheBytes-=immutable.get(key).size;immutable.delete(key);}while(immutable.size&&cacheBytes+size>8*1048576){const oldest=immutable.keys().next().value;cacheBytes-=immutable.get(oldest).size;immutable.delete(oldest);}if(size<=8*1048576){immutable.set(key,{value:clone(result),size});cacheBytes+=size;}}
            return result;
        })();
        if(!fresh)inflight.set(key,request);
        try{return clone(await request);}finally{if(inflight.get(key)===request)inflight.delete(key);}
    }
    async function write(kind,id,data,{revision=1,operationId='',signal}={}) {
        signal?.throwIfAborted();
        const modern=(await paged.capabilities())?.schemaVersion===2;
        let value=envelope(kind,id,data,revision,operationId);
        if(['asset','baseline','original'].includes(kind)) {
            const previous=await read(kind,id,{fresh:true,signal});
            if(previous){
                if((previous.sourceContentHash||previous.contentHash)!==value.hubDocument.contentHash&&!(kind==='asset'&&assetIdentity(previous.data)===assetIdentity(data)))throw fail('IMMUTABLE_DOCUMENT_CONFLICT','보존된 공통 자료나 원본과 내용이 다릅니다. 이전 자료를 덮어쓰지 않았습니다. 다시 불러와 주세요.');
                return previous;
            }
        }
        if(modern)await paged.write(documentKey(kind,id),value,{signal,prepare:kind==='asset'?async emit=>{const packed={...data,characters:await packCharacterStore(data.characters,emit,{signal})};const result=envelope(kind,id,packed,revision,operationId);result.hubDocument.sourceContentHash=value.hubDocument.contentHash;return result;}:undefined,immutable:['asset','baseline','original'].includes(kind)});
        else await post('chat',{chatKey:documentKey(kind,id),value},{signal});
        // An accepted write with a lost response is recovered by the caller using its operation ID.
        const saved=await read(kind,id,{fresh:true,signal});
        if((saved?.sourceContentHash||saved?.contentHash)!==value.hubDocument.contentHash)throw fail('SHARED_VERIFY_FAILED','저장한 자료를 다시 확인하지 못했습니다. 완료로 처리하지 않았습니다.');
        noteDiagnostic?.('shared_storage',{module:'src/storage/shared-transport.js',phase:'verify',kind,status:'succeeded',revision});
        return saved;
    }
    return {read,write,paged,clear(){epoch++;immutable.clear();cacheBytes=0;inflight.clear();paged.clear();}};
}
