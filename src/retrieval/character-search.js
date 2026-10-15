import { currentRecords, recordBankIsCurrent } from '../character/records.js';
import { sexualEligible } from '../character/sexual-conduct.js';
import {bankIdentity} from './bank-identity.js';
import {loadBankRecords} from '../storage/character-pages.js';

// Retrieval failures keep the existing lexical fallback. Failure is recorded on
// the result; it is never evidence that a person is absent or has no records.
export async function searchCharacterRecords({ entries, priorStates, transcript, transcripts=new Map(), identity, retrieval, signal, recovery=false, shared=false }) {
    const results = new Map();
    let unavailable = null;
    const connectionFailure=result=>result.status==='fallback'&&!['EMBEDDING_INDEX_PENDING','EMBEDDING_INDEX_MISSING'].includes(result.code);
    for (const entry of entries.filter(recordBankIsCurrent)) {
        const query=transcripts.get(entry.id)||transcript;
        signal?.throwIfAborted();
        if(entry.recordBank?.pagedRecords){
            const bank=entry.recordBank,result=unavailable?{...unavailable,indices:[]}:await retrieval.searchPaged({kind:'character',bankId:bank.pagedRecords.bankId,count:bank.pagedRecords.count,transcript:query,signal,recovery});
            let loaded;try{loaded=await loadBankRecords(bank,{query,hashes:result.hashes||[],signal});}catch(error){if(signal?.aborted)throw signal.reason||error;bank.records=[];bank.recordIndices=[];results.set(entry.id,{status:'failed',indices:[],code:error.code||'CHARACTER_RECORD_READ_FAILED'});continue;}bank.records=loaded.records;bank.recordIndices=loaded.indices;if(loaded.status==='fallback')Object.assign(result,{status:'fallback',code:loaded.code,indices:[]});
            results.set(entry.id,result);if(connectionFailure(result))unavailable=result;continue;
        }
        const values = priorStates.get(entry.id)?.values || {};
        const cue = [sexualEligible(entry) || values.a > 0 ? 'sexual desire restraint boundary' : '',
            ...['anger','joy','fear','sadness'].filter(key => values[key] > 0)].filter(Boolean).join(' ');
        const result = unavailable ? {...unavailable,indices:[]} : await retrieval.search({kind:'character',bankId:bankIdentity('character',`${identity}:${entry.id}`,currentRecords(entry),shared),items:currentRecords(entry),
            transcript:cue ? `${query}\n${cue}` : query,limit:12,signal,recovery});
        signal?.throwIfAborted();
        if (connectionFailure(result)) unavailable=result;
        results.set(entry.id, result);
    }
    return results;
}
