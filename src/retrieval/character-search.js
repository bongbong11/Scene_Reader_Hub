import { recordBankIsCurrent } from '../character/records.js';
import {STATE_MOODS} from '../character/state-contract.js';
import {bankIdentity} from './bank-identity.js';
import {loadBankRecords,bankPages,completeBankMatches} from '../storage/character-pages.js';
import {requirePreparedIndex} from './record-hashes.js';

// Retrieval failures keep the existing lexical fallback. Failure is recorded on
// the result; it is never evidence that a person is absent or has no records.
export async function searchCharacterRecords({ entries, priorStates, transcript, transcripts=new Map(), identity, retrieval, signal, recovery=false, shared=false }) {
    const results = new Map();
    let unavailable = null;
    // A corrupt/different bank is local to that person. Only confirmed service
    // failures suppress the rest of this batch to avoid a request storm.
    const connectionFailure=result=>result.status==='fallback'
        && /^RETRIEVAL_(?:AUTH_FAILED|FORBIDDEN|RATE_LIMIT|BILLING|NOT_FOUND|SERVER_ERROR|NETWORK_ERROR)$/.test(result.code || '');
    const eligible=entries.filter(recordBankIsCurrent);
    // Page loading mutates the bank's loaded window, so keep that path serial.
    const width=['palm','vertexai','nanogpt'].includes(retrieval.config?.().source) && !eligible.some(entry=>entry.recordBank?.pagedRecords)?2:1;
    async function searchEntry(entry) {
        const query=transcripts.get(entry.id)||transcript;
        const values = priorStates.get(entry.id)?.values || {};
        const cue = [values.a > 0 ? 'sexual desire restraint' : '',
            ...STATE_MOODS.filter(key => values[key] > 0)].filter(Boolean).join(' ');
        signal?.throwIfAborted();
        if(entry.recordBank?.pagedRecords){
            const bank=entry.recordBank,result=unavailable?{...unavailable,indices:[]}:await retrieval.searchPaged({kind:'character',bankId:bank.pagedRecords.bankId,count:bank.pagedRecords.count,transcript:query,sharedTranscript:transcript,signal,recovery,pages:pageSignal=>bankPages(bank,{signal:pageSignal})});
            requirePreparedIndex(result);
            let loaded;try{loaded=await loadBankRecords(bank,{query:result.sharedVector?[cue,query].filter(Boolean).join('\n'):query,hashes:result.hashes||[],signal});if(result.status==='ready')loaded=await completeBankMatches(bank,loaded,result.indices||[],{signal});}catch(error){if(signal?.aborted)throw signal.reason||error;bank.records=[];bank.recordIndices=[];results.set(entry.id,{status:'failed',indices:[],code:error.code||'CHARACTER_RECORD_READ_FAILED'});return;}signal?.throwIfAborted();bank.records=loaded.records;bank.recordIndices=loaded.indices;if(loaded.status==='fallback')Object.assign(result,{status:'fallback',code:loaded.code,indices:[]});
            if(result.sharedVector)result.retrievalCue=cue;
            results.set(entry.id,result);if(connectionFailure(result))unavailable=result;return;
        }
        // eligible already validated the bank; do not clone/validate all of its
        // records twice again just to build the ID and pass the same items.
        const items=entry.recordBank.records;
        const result = unavailable ? {...unavailable,indices:[]} : await retrieval.search({kind:'character',bankId:bankIdentity('character',`${identity}:${entry.id}`,items,shared),items,
            transcript:cue ? `${query}\n${cue}` : query,sharedTranscript:transcript,limit:12,signal,recovery});
        signal?.throwIfAborted();
        requirePreparedIndex(result);
        if(result.sharedVector)result.retrievalCue=cue;
        if (connectionFailure(result)) unavailable=result;
        results.set(entry.id, result);
    }
    let next=0;
    const workers=await Promise.allSettled(Array.from({length:Math.min(width,eligible.length)},async()=>{
        while(next<eligible.length){signal?.throwIfAborted();await searchEntry(eligible[next++]);}
    }));
    const failed=workers.find(item=>item.status==='rejected');if(failed)throw failed.reason;
    // Completion order must not change the downstream character order.
    return new Map(eligible.map(entry=>[entry.id,results.get(entry.id)]));
}
