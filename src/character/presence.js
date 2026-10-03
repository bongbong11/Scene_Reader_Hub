import { certainty } from '../decision/policy.js';

export const PARTICIPATION_CHOICES = {
    unknown:'No reliable current participation evidence.',
    direct:'This person actually speaks, acts, or has a live viewpoint in the latest RP exchange, with no later departure.',
    remote:'This person actually sends a current message or speaks on a current call, with no later end to that exchange.',
    continuing:'This person remains in the ongoing scene but does not actively respond in the latest exchange.',
    departed:'A later departure, ended call, or scene change explicitly removes this person from the current interaction.',
    reference:'Only a memory, quoted past message, speculation, name mention, or unanswered outgoing message references this person.',
};

// Participation is an observation; next-response routing uncertainty is not proof of absence.
export function resolveCharacterPresence(plan, details, answers) {
    for (const person of plan) {
        const key=`character_${person.index}_presence`, detail=details[key];
        if (!detail) continue;
        const evidence=answers[`character_${person.index}_participation`];
        const valid=Object.hasOwn(PARTICIPATION_CHOICES,evidence?.choice || '') && certainty(evidence)>=0.55;
        const basis=valid?evidence.choice:'unknown';
        detail.participationEvidence=basis;
        detail.presenceUncertain=detail.fallbackApplied && basis==='unknown';
        let resolved=detail.effective, reason='policy';
        if (['departed','reference'].includes(basis)) { resolved='absent'; reason=basis; }
        else if (detail.fallbackApplied) {
            if (['direct','remote'].includes(basis)) { resolved='active'; reason='observed_participation'; }
            else { resolved='background'; reason=basis==='continuing'?'continuing_presence':'uncertain_presence'; }
        }
        detail.effective=resolved;
        detail.coordinatorFinal=resolved;
        detail.presenceResolution=reason;
        if(resolved!==detail.policyEffective)detail.rule=({observed_participation:'최신 RP의 실제 발화·행동으로 참여 확인',continuing_presence:'계속되는 장면 참여 · 배경 참고',uncertain_presence:'참여 판정 불확실 · 부재로 확정하지 않음',departed:'최신 RP의 퇴장·연결 종료 확인',reference:'현재 참여 없이 회상·언급만 확인'})[reason];
    }
}
