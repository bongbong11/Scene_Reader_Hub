import {additionVerificationQuestions} from '../scene/opportunity-policy.js';
import {optionalProbability} from '../adapters/jev-answer-normalizer.js';
export const DECISION_CONTRACT_VERSION = 3;
export const OBSERVATION_KEYS = new Set([
    'event_closure', 'advanced_world_rules', 'scene_state', 'conflict_state', 'relationship_motion', 'trust_signal',
    'intimacy_signal', 'romance_evidence', 'counterevidence',
    'unresolved', 'event_state', 'event_valence', 'event_blocker',
    'progress_need', 'resolution_readiness', 'npc_presence', 'npc_valence', 'npc_knowledge_fit', 'context_change_source',
]);

export const DIAGNOSTIC_KEYS = new Set([
    'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'input_echo',
    'repetitive_ending', 'action_evasion', 'directive_followthrough', 'scene_cutoff',
    'npc_followthrough',
]);

export function decisionPolicyKind(key) {
    if (String(key).startsWith('verification_')) return 'verification';
    if (OBSERVATION_KEYS.has(key) || /_knowledge$|_competence$|_access$|_certainty$|^character_\d+_context_access_\d+$/.test(key)) return 'observation';
    if (DIAGNOSTIC_KEYS.has(key)) return 'diagnostic';
    return 'routing';
}

export function certainty(answer) {
    const choice = String(answer?.choice || '');
    return optionalProbability(answer?.confidence) ?? optionalProbability(answer?.probabilities?.[choice]);
}

export function applyDecisionPolicy({ key, answer, allowedChoices = [], fallback }) {
    const candidate = String(answer?.choice || '');
    const selected = candidate && (!allowedChoices.length || allowedChoices.includes(candidate)) && !['invalid','missing'].includes(answer?.responseState) ? candidate : '';
    const score = certainty(answer);
    const kind = decisionPolicyKind(key);
    const effective = selected || fallback;
    return {
        selected,
        effective,
        certainty: score,
        threshold:0,
        baseAcceptanceThreshold:0,
        adjusted: !selected,
        policy: kind,
        fallbackApplied: !selected,
        responseState: selected ? 'valid' : answer?.responseState || (answer ? 'invalid' : 'missing'),
        rule: selected ? '유효한 분류 유지 · 확신도는 진단값' : '응답 누락·형식 오류 · 항목별 기본 처리',
    };
}

export function pendingPlanEffects(decisions = {}) {
    // Progress is verified for every completed RP output. It drives the
    // stalled-scene pressure without treating raw message count as progress.
    const effects = ['progress'];
    if (decisions.relationship_pacing && decisions.relationship_pacing !== 'hold') effects.push('relationship');
    if (decisions.relationship_beat && decisions.relationship_beat !== 'none' && !effects.includes('relationship')) effects.push('relationship');
    if (['create', 'continue', 'retire', 'replace'].includes(decisions.event_route)
        || ['create', 'continue'].includes(decisions.advanced_route)
        || !['', 'hold', 'quiet', undefined].includes(decisions.progression_move)
        || !['', 'continue', undefined].includes(decisions.resolution_pacing)) effects.push('event');
    if (['create', 'reuse', 'retire', 'replace'].includes(decisions.npc_route)
        || ['create', 'continue', 'retire', 'replace'].includes(decisions.villain_route)) effects.push('npc');
    if (decisions.fight_sustain === 'yes' || decisions.primary_focus === 'conflict') effects.push('conflict');
    if (decisions.direct_execution === 'yes' || decisions.primary_focus === 'direct') effects.push('direct');
    if (decisions.selected_continuity_id) effects.push('continuity');
    return [...new Set(effects)];
}

const EFFECT_LABELS = {
    progress: 'material scene progress rather than repetition, preparation, or another handoff',
    relationship: 'relationship movement or relationship beat',
    event: 'event creation, event movement, or event resolution',
    npc: 'NPC or antagonist route',
    conflict: 'active confrontation route',
    direct: 'direct response, decision, refusal, action, or immediate consequence',
    continuity: 'the selected continuity follow-up, without inventing completion beyond the actual output',
};

export function buildVerificationQuestions(pendingPlan) {
    if (!pendingPlan?.outputText || !Array.isArray(pendingPlan.effects)) return {};
    const support=(pendingPlan.eventFollowups||[]).slice(0,1).map((item,index)=>[`verification_event_followup_${index}`,{type:'choice',instructions:`In the matching completed CHARACTER output only, did this established event step actually happen: ${item.action}? Intention or a mention alone is not execution.`,criteria:{fulfilled:'The actual step happened.',partial:'Only a real part happened; the step remains open.',missed:'The step did not happen.',unavailable:'The matching output is unavailable.'}}]);
    const cast=(pendingPlan.cast||[]).filter(item=>item.beatKey==='ongoing'&&item.kind!=='unresolved').map((item,index)=>[`verification_event_actor_${index}`,{type:'choice',instructions:`In the matching completed CHARACTER output, did ${item.name||'the selected event actor'} actually carry out ${item.action} for the ongoing event? Inner thoughts, intention or atmosphere alone are not action.`,criteria:{fulfilled:'The concrete move happened.',partial:'A real part happened.',missed:'No actual move.',unavailable:'Output unavailable.'}}]);
    return {...Object.fromEntries([...support,...cast]),...additionVerificationQuestions(pendingPlan),...Object.fromEntries(pendingPlan.effects.filter(effect=>effect!=='progress').map((effect) => [`verification_${effect}`, {
        type: 'choice',
        instructions: `Compare the prior pending plan with the immediately following CHARACTER output. Verify only actual execution of the planned ${EFFECT_LABELS[effect] || effect}. A mention, intention, atmosphere, or setup without material execution is not fulfillment. Do not use the current USER reaction as proof that the prior output executed the plan.`,
        criteria: {
            fulfilled: 'The prior CHARACTER output materially executed the planned effect.',
            partial: 'The prior CHARACTER output executed a real but incomplete part of the planned effect.',
            missed: 'The prior CHARACTER output omitted, evaded, or replaced the planned effect.',
            uncertain: 'The output is available but whether this effect occurred is ambiguous.',
            unavailable: 'The matching output or required source is missing and cannot be assessed.',
            not_applicable: 'The pending plan did not require this effect.',
        },
    }]))};
}

export function verificationSummary(pendingPlan, decisions = {}) {
    const result = {};
    for (const effect of pendingPlan?.effects || []) result[effect] = decisions[`verification_${effect}`] || 'unavailable';
    return result;
}

export function isVerified(status) {
    return status === 'fulfilled' || status === 'partial';
}

export function stableFingerprint(value) {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return `${text.length}:${hash >>> 0}`;
}
