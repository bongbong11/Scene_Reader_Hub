import { stableFingerprint } from "../decision/policy.js";
import {sourceRp,validateSourceRefs} from './source-refs.js';

export function candidateDecisions(candidates) {
    return Object.fromEntries(candidates.map((candidate,index)=>[`continuity_candidate_${index}`,
        ['knowledge','reference'].includes(candidate.type)?'supported':candidate.type==='new_item'?'accept_changed':candidate.type==='affected'?(candidate.data?.relation==='pressured'?'accept_pressured':'accept_changed'):candidate.type==='followup'?'followup_only':'reject']));
}

export function activePendingCandidates(candidates, { chatKey, chat, sourceRevision }) {
    return (Array.isArray(candidates) ? candidates : [])
        .filter((candidate) => {
            const source = candidate?.sourceIdentity;
            if(source?.refs?.length)return Boolean(candidate?.id&&candidate.type)&&validateSourceRefs(source.refs,{chatRef:chatKey,chat:chat||[],fingerprint:stableFingerprint});
            const index = Number(source?.assistantIndex);
            const message = Array.isArray(chat) ? chat[index] : null;
            return Boolean(candidate?.id
                && source?.chatKey === chatKey
                && source?.sourceRevision === sourceRevision
                && Number.isInteger(index)
                && message && !message.is_user && Boolean(sourceRp(message))
                && source.outputFingerprint === stableFingerprint(String(message.mes || '')));
        })
        .slice(0, 5);
}

export function verifiedSecondaryCandidates(candidates) {
    return candidates.filter(candidate=>candidate.type==='followup').map(candidate=>({...candidate,kind:'continuity',focus:'event',compatibleWith:['direct','relationship','event','conflict','npc','villain'],priority:2}));
}

export function eventFollowups(candidates,event) {
    if(!event)return [];
    return candidates.filter(item=>item.type==='followup'&&['event:current',event.id].filter(Boolean).includes(item.data?.relatedStateId)).slice(0,1);
}
