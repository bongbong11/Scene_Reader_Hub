import { currentRecords, recordBankIsCurrent } from '../characters/records.js';
import { sexualEligible } from '../characters/sexual-conduct.js';
import {bankIdentity} from './bank-identity.js';
import {loadBankRecords} from '../storage/character-pages.js';

// Retrieval failures keep the existing lexical fallback. Failure is recorded on
// the result; it is never evidence that a person is absent or has no records.
export async function searchCharacterRecords({ entries, priorStates, transcript, identity, retrieval, signal, recovery=false, shared=false, evolution=null }) {
    const results = new Map();
    let unavailable = null;
    for (const entry of entries.filter(recordBankIsCurrent)) {
        signal?.throwIfAborted();
        if(entry.recordBank?.pagedRecords){
            const bank=entry.recordBank,result=unavailable?{...unavailable,indices:[]}:await retrieval.searchPaged({kind:'character',bankId:bank.pagedRecords.bankId,count:bank.pagedRecords.count,transcript,signal,recovery});
            const changedHashes=(evolution?.entries||[]).filter(e=>e.actorId===entry.id&&e.status==='active'&&e.baseRef?.analysisId===bank.analysisId&&e.baseRef.bankDigest===bank.pagedRecords.bankId).slice(-8).map(e=>e.baseRef.retrievalHash);
            let loaded;try{loaded=await loadBankRecords(bank,{query:transcript,hashes:[...(result.hashes||[]),...changedHashes],signal});}catch(error){if(signal?.aborted)throw signal.reason||error;bank.records=[];bank.recordIndices=[];results.set(entry.id,{status:'failed',indices:[],code:error.code||'CHARACTER_RECORD_READ_FAILED'});continue;}bank.records=loaded.records;bank.recordIndices=loaded.indices;if(loaded.status==='fallback')Object.assign(result,{status:'fallback',code:loaded.code,indices:[]});
            results.set(entry.id,result);if(result.status==='fallback')unavailable=result;continue;
        }
        const values = priorStates.get(entry.id)?.values || {};
        const cue = [sexualEligible(entry) || values.a > 0 ? 'sexual desire restraint boundary' : '',
            ...['anger','joy','fear','sadness'].filter(key => values[key] > 0)].filter(Boolean).join(' ');
        const result = unavailable ? {...unavailable,indices:[]} : await retrieval.search({kind:'character',bankId:bankIdentity('character',`${identity}:${entry.id}`,currentRecords(entry),shared),items:currentRecords(entry),
            transcript:cue ? `${transcript}\n${cue}` : transcript,limit:12,signal,recovery});
        signal?.throwIfAborted();
        if (result.status === 'fallback') unavailable=result;
        results.set(entry.id, result);
    }
    return results;
}
