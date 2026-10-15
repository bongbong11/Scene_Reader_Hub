import { recordBankIsCurrent } from '../character/records.js';
import { sexualEligible } from '../character/sexual-conduct.js';
import {bankIdentity} from './bank-identity.js';
import {loadBankRecords} from '../storage/character-pages.js';

// Retrieval failures keep the existing lexical fallback. Failure is recorded on
// the result; it is never evidence that a person is absent or has no records.
export async function searchCharacterRecords({ entries, priorStates, transcript, transcripts=new Map(), identity, retrieval, signal, recovery=false, shared=false }) {
    const results = new Map();
    let unavailable = null;
    const connectionFailure=result=>result.status==='fallback'&&!['EMBEDDING_INDEX_PENDING','EMBEDDING_INDEX_MISSING'].includes(result.code);
    const eligible=entries.filter(recordBankIsCurrent);
    // Page loading mutates the bank's loaded window, so keep that path serial.
    const width=['palm','vertexai','nanogpt'].includes(retrieval.config?.().source) && !eligible.some(entry=>entry.recordBank?.pagedRecords)?2:1;
    async function searchEntry(entry) {
        const query=transcripts.get(entry.id)||transcript;
        signal?.throwIfAborted();
        if(entry.recordBank?.pagedRecords){
            const bank=entry.recordBank,result=unavailable?{...unavailable,indices:[]}:await retrieval.searchPaged({kind:'character',bankId:bank.pagedRecords.bankId,count:bank.pagedRecords.count,transcript:query,signal,recovery});
            let loaded;try{loaded=await loadBankRecords(bank,{query,hashes:result.hashes||[],signal});}catch(error){if(signal?.aborted)throw signal.reason||error;bank.records=[];bank.recordIndices=[];results.set(entry.id,{status:'failed',indices:[],code:error.code||'CHARACTER_RECORD_READ_FAILED'});return;}signal?.throwIfAborted();bank.records=loaded.records;bank.recordIndices=loaded.indices;if(loaded.status==='fallback')Object.assign(result,{status:'fallback',code:loaded.code,indices:[]});
            results.set(entry.id,result);if(connectionFailure(result))unavailable=result;return;
        }
        const values = priorStates.get(entry.id)?.values || {};
        const cue = [sexualEligible(entry) || values.a > 0 ? 'sexual desire restraint boundary' : '',
            ...['anger','joy','fear','sadness'].filter(key => values[key] > 0)].filter(Boolean).join(' ');
        // eligible already validated the bank; do not clone/validate all of its
        // records twice again just to build the ID and pass the same items.
        const items=entry.recordBank.records;
        const result = unavailable ? {...unavailable,indices:[]} : await retrieval.search({kind:'character',bankId:bankIdentity('character',`${identity}:${entry.id}`,items,shared),items,
            transcript:cue ? `${query}\n${cue}` : query,limit:12,signal,recovery});
        signal?.throwIfAborted();
        if (connectionFailure(result)) unavailable=result;
        results.set(entry.id, result);
    }
    for(let offset=0;offset<eligible.length;offset+=width){
        signal?.throwIfAborted();
        const batch=await Promise.allSettled(eligible.slice(offset,offset+width).map(searchEntry));
        const failed=batch.find(item=>item.status==='rejected');if(failed)throw failed.reason;
    }
    // Completion order must not change the downstream character order.
    return new Map(eligible.map(entry=>[entry.id,results.get(entry.id)]));
}
