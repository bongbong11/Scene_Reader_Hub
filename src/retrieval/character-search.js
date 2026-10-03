import { currentRecords, recordBankIsCurrent } from '../characters/records.js';
import { sexualEligible } from '../characters/sexual-conduct.js';

// Retrieval failures keep the existing lexical fallback. Failure is recorded on
// the result; it is never evidence that a person is absent or has no records.
export async function searchCharacterRecords({ entries, priorStates, transcript, identity, retrieval, signal, recovery=false }) {
    const results = new Map();
    let unavailable = null;
    for (const entry of entries.filter(recordBankIsCurrent)) {
        signal?.throwIfAborted();
        const values = priorStates.get(entry.id)?.values || {};
        const cue = [sexualEligible(entry) || values.a > 0 ? 'sexual desire restraint boundary' : '',
            ...['anger','joy','fear','sadness'].filter(key => values[key] > 0)].filter(Boolean).join(' ');
        const result = unavailable ? {...unavailable,indices:[]} : await retrieval.search({kind:'character',bankId:`${identity}:${entry.id}`,items:currentRecords(entry),
            transcript:cue ? `${transcript}\n${cue}` : transcript,limit:12,signal,recovery});
        signal?.throwIfAborted();
        if (result.status === 'fallback') unavailable=result;
        results.set(entry.id, result);
    }
    return results;
}
