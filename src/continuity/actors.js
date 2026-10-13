import {selectActiveEntries} from '../character/selection.js';

// These names retrieve existing state; they are not permission to create facts
// or to impersonate the user. Reuse the ordinary cast selection for pronouns.
export function continuityActors(store, context, transcript, participantIds = []) {
    const cast=selectActiveEntries({...store,enabled:true},transcript,context.name2||'',participantIds,{allowUserImpersonation:true});
    return [...new Set([context.name1,context.name2,...cast.flatMap(actor=>[actor.id,actor.name,...(actor.aliases||[])])].filter(Boolean))];
}
