import { stableFingerprint } from "../decision/policy.js";
import { continuityQuestion } from "./engine.js";

export function activePendingCandidates(candidates, { chatKey, chat, sourceRevision }) {
    return (Array.isArray(candidates) ? candidates : [])
        .filter((candidate) => {
            const source = candidate?.sourceIdentity;
            const index = Number(source?.assistantIndex);
            const message = Array.isArray(chat) ? chat[index] : null;
            return Boolean(candidate?.id
                && source?.chatKey === chatKey
                && source?.sourceRevision === sourceRevision
                && Number.isInteger(index)
                && message && !message.is_user && !message.is_system && !message.is_hidden && !message.hidden
                && source.outputFingerprint === stableFingerprint(String(message.mes || '')));
        })
        .slice(0, 5);
}

export function buildPendingCandidateQuestions(candidates) {
    return Object.fromEntries(candidates.map((candidate, index) => [`continuity_candidate_${index}`, candidate.type ? continuityQuestion(candidate) : {
        type: 'choice',
        instructions: 'Accept only a directly supported, still relevant, executable next-step candidate. It is never proof that its future action already happened. OOC is not RP evidence.',
        criteria: {
            accept: `The proposed small follow-up is causally supported and currently executable: ${String(candidate.label || '').slice(0, 160)}. Basis: ${String(candidate.evidence || '').slice(0, 320)}.`,
            reject: 'The candidate is stale, unsupported, already executed, irrelevant, incompatible with the present scene, or depends on an invented fact.',
        },
    }]));
}

export function verifiedSecondaryCandidates(candidates, decisions) {
    return candidates.filter((candidate, index) => candidate.type === 'followup'
        ? ['followup_only', 'accept_pressured'].includes(decisions[`continuity_candidate_${index}`])
        : !candidate.type && decisions[`continuity_candidate_${index}`] === 'accept')
        .map((candidate) => candidate.type === 'followup'
            ? { ...candidate, kind: 'continuity', focus: 'event', compatibleWith: ['direct', 'relationship', 'event', 'conflict'], priority: 2 }
            : candidate);
}
