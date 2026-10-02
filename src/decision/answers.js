import { applyDecisionPolicy } from "./policy.js";
export const FALLBACKS = {
    basic_move: 'continue',
    progress_need: 'unclear',
    arrival_mode: 'none',
    advanced_world_rules: 'unclear',
    scene_state: 'unclear',
    conflict_state: 'unclear',
    relationship_motion: 'unclear',
    trust_signal: 'unclear',
    intimacy_signal: 'unclear',
    romance_evidence: 'unclear',
    counterevidence: 'unclear',
    unresolved: 'unclear',
    context_change_source: 'none',
    continuity_trigger: 'none',
    event_state: 'unclear',
    event_valence: 'unclear',
    event_blocker: 'unclear',
    resolution_readiness: 'unclear',
    npc_presence: 'unclear',
    npc_valence: 'unclear',
    npc_role: 'none',
    npc_weight: 'none',
    npc_knowledge: 'none',
    npc_disclosure: 'none',
    npc_followthrough: 'not_applicable',
    npc_knowledge_fit: 'unclear',
    relationship_pacing: 'hold',
    relationship_beat: 'none',
    resolution_pacing: 'continue',
    primary_focus: 'direct',
    direct_execution: 'yes',
    event_route: 'none',
    fight_sustain: 'no',
    villain_route: 'none',
    progression_move: 'hold',
    npc_route: 'none',
    npc_target: 'none',
    hesitation_drag: 'no',
    refusal_stall: 'no',
    circularity: 'no',
    user_handoff: 'no',
    action_evasion: 'no',
    directive_followthrough: 'not_applicable',
    scene_cutoff: 'no',
    response_cadence: 'natural',
    input_echo: 'no',
    repetitive_ending: 'no',
    advanced_entry: 'closed',
    advanced_route: 'none',
    advanced_cause: 'none',
    advanced_element: 'none',
    advanced_move: 'quiet',
};

const THRESHOLDS = {
    basic_move: 0.55,
    progress_need: 0.58,
    arrival_mode: 0.55,
    advanced_world_rules: 0.8,
    scene_state: 0.50,
    conflict_state: 0.55,
    relationship_motion: 0.58,
    trust_signal: 0.58,
    intimacy_signal: 0.58,
    romance_evidence: 0.62,
    counterevidence: 0.55,
    unresolved: 0.52,
    context_change_source: 0.60,
    continuity_trigger: 0.72,
    event_state: 0.55,
    event_valence: 0.55,
    event_blocker: 0.55,
    resolution_readiness: 0.60,
    npc_presence: 0.55,
    npc_valence: 0.55,
    npc_role: 0.64,
    npc_weight: 0.64,
    npc_knowledge: 0.66,
    npc_disclosure: 0.66,
    npc_knowledge_fit: 0.66,
    relationship_pacing: 0.72,
    relationship_beat: 0.68,
    primary_focus: 0.55,
    event_route: 0.72,
    villain_route: 0.78,
    progression_move: 0.60,
    npc_route: 0.75,
    npc_target: 0.55,
    hesitation_drag: 0.62,
    refusal_stall: 0.62,
    circularity: 0.62,
    user_handoff: 0.62,
    action_evasion: 0.65,
    scene_cutoff: 0.62,
    response_cadence: 0.58,
    input_echo: 0.58,
    repetitive_ending: 0.60,
    advanced_entry: 0.62,
    advanced_route: 0.70,
    advanced_cause: 0.62,
    advanced_element: 0.66,
    advanced_move: 0.66,
};

// Creation is eligibility for a user-controlled draw; retirement and replacement
// change stored state and retain a higher evidence requirement.
const CHOICE_THRESHOLDS = {
    event_route: { create: 0.58, continue: 0.56, retire: 0.88, replace: 0.90 },
    npc_route: { create: 0.60, reuse: 0.55, retire: 0.84, replace: 0.86 },
    villain_route: { create: 0.66, continue: 0.58, retire: 0.88, replace: 0.90 },
    advanced_route: { create: 0.60, continue: 0.56 },
};

export function applyPolicy(key, answer, judgmentStyle = 'balanced', allowedChoices = [], progressIntensity = 1) {
    const fallback = String(key).startsWith('verification_') ? 'not_applicable' : String(key).startsWith('continuity_candidate_') ? 'reject' : FALLBACKS[key];
    const result = applyDecisionPolicy({
        key,
        answer,
        style: judgmentStyle,
        progressIntensity,
        allowedChoices,
        fallback: allowedChoices.includes(fallback) ? fallback : allowedChoices.includes('unclear') ? 'unclear' : allowedChoices.includes('not_applicable') ? 'not_applicable' : allowedChoices[0],
        baseThreshold: THRESHOLDS[key] ?? (String(key).startsWith('verification_') ? 0.66 : 0.7),
        choiceThreshold: CHOICE_THRESHOLDS[key],
    });
    result.policyEffective = result.effective;
    result.coordinatorFinal = result.effective;
    return result;
}

export function fixedDecision(effective) {
    return { selected: effective, effective, policyEffective: effective, coordinatorFinal: effective, certainty: 1, threshold: 1, adjusted: false, fixed: true };
}

export function applyCharacterPolicy(key, answer, judgmentStyle, allowedChoices) {
    const isAccess = /^character_\d+_(?:context_access_\d+|response_basis)$/.test(key);
    const fallback = key === 'npc_identity_route' ? 'none' : key.endsWith('_presence') ? 'absent' : 'none';
    // Active play may change routing, never the evidence standard for information access.
    const result = applyDecisionPolicy({ key, answer, style: isAccess ? 'balanced' : judgmentStyle, allowedChoices, fallback, baseThreshold: isAccess ? 0.75 : 0.59 });
    result.policyEffective = result.effective;
    result.coordinatorFinal = result.effective;
    return result;
}

export function applyRecordRelevance(answer) {
    const value = Number(answer?.noul);
    const valid = answer?.type === 'noul' && Number.isFinite(value) && value >= 0 && value <= 1;
    const selected = valid && value >= 0.5 ? 'yes' : 'no';
    return { selected, effective: selected, policyEffective: selected, coordinatorFinal: selected,
        certainty: valid ? value : 0, threshold: 0.5, adjusted: false,
        policy: 'record_relevance', fallbackApplied: !valid, rule: valid ? '' : 'Jev 관련성 판정 누락·형식 오류' };
}
