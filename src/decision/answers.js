import {validNoul} from '../adapters/answer-value.js';
import {applyDecisionPolicy} from "./policy.js";
export const FALLBACKS = {
    event_closure: 'unclear',
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

export function applyPolicy(key, answer, judgmentStyle = 'balanced', allowedChoices = []) {
    const fallback = String(key).startsWith('verification_') ? 'unavailable' : key.endsWith('_conflict_tactic')?'character_driven':FALLBACKS[key];
    const result = applyDecisionPolicy({
        key,
        answer,
        style: judgmentStyle,
        allowedChoices,
        fallback: allowedChoices.includes(fallback) ? fallback : allowedChoices.includes('unclear') ? 'unclear' : allowedChoices.includes('not_applicable') ? 'not_applicable' : allowedChoices[0],
    });
    result.policyEffective = result.effective;
    result.coordinatorFinal = result.effective;
    return result;
}

export function fixedDecision(effective) {
    return { selected: effective, effective, policyEffective: effective, coordinatorFinal: effective, certainty: 1, threshold: 0, adjusted: false, fixed: true };
}

export function applyCharacterPolicy(key, answer, judgmentStyle, allowedChoices) {
    const isParticipation=key.endsWith('_participation');
    const fallback = key.endsWith('_conflict_tactic')?'character_driven':key === 'npc_identity_route' ? 'none' : isParticipation?'unknown':key.endsWith('_presence') ? 'absent' : 'none';
    const result = applyDecisionPolicy({ key, answer, style: judgmentStyle, allowedChoices, fallback });
    result.policyEffective = result.effective;
    result.coordinatorFinal = result.effective;
    return result;
}

export function applyRecordRelevance(answer) {
    const value = Number(answer?.noul);
    const valid = answer?.type === 'noul' && validNoul(answer.noul);
    const selected = valid && value >= 0.5 ? 'yes' : 'no';
    return { selected, effective: selected, policyEffective: selected, coordinatorFinal: selected,
        certainty: valid ? value : 0, threshold: 0.5, adjusted: false,
        policy: 'record_relevance', fallbackApplied: !valid, rule: valid ? '' : 'Jev 관련성 판정 누락·형식 오류' };
}
