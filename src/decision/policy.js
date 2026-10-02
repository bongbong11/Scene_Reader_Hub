export const OBSERVATION_KEYS = new Set([
    'advanced_world_rules', 'scene_state', 'conflict_state', 'relationship_motion', 'trust_signal',
    'intimacy_signal', 'romance_evidence', 'counterevidence',
    'unresolved', 'event_state', 'event_valence', 'event_blocker',
    'progress_need', 'resolution_readiness', 'npc_presence', 'npc_valence', 'npc_knowledge_fit', 'context_change_source', 'continuity_trigger',
]);

export const DIAGNOSTIC_KEYS = new Set([
    'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'input_echo',
    'repetitive_ending', 'action_evasion', 'directive_followthrough', 'scene_cutoff',
    'npc_followthrough',
]);

export function decisionPolicyKind(key) {
    if (String(key).startsWith('verification_') || String(key).startsWith('continuity_candidate_')) return 'verification';
    if (OBSERVATION_KEYS.has(key) || /_knowledge$|_competence$|_access$|_certainty$|^character_\d+_context_access_\d+$/.test(key)) return 'observation';
    if (DIAGNOSTIC_KEYS.has(key)) return 'diagnostic';
    return 'routing';
}

export function certainty(answer) {
    const choice = String(answer?.choice || '');
    const probability = Number(answer?.probabilities?.[choice]);
    const confidence = Number(answer?.confidence);
    const p = Number.isFinite(probability) ? probability : 0;
    return Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : p));
}

// Explicit allowlist: this control cannot weaken evidence, access, pacing,
// creation eligibility, retirement, or output-verification decisions.
const ADJUSTABLE_PROGRESS = {
    basic_move: ['dialogue', 'emotion', 'movement', 'action', 'choice', 'consequence'],
    primary_focus: ['direct', 'event', 'relationship', 'conflict', 'npc', 'transition'],
    progression_move: ['advance', 'complication', 'positive', 'consequence'],
    event_route: ['continue'],
    advanced_route: ['continue'],
    advanced_move: ['advance'],
    npc_route: ['reuse'],
    villain_route: ['continue'],
};

export function applyDecisionPolicy({ key, answer, style = 'balanced', allowedChoices = [], fallback, baseThreshold = 0.7, choiceThreshold, progressIntensity = 1 }) {
    const candidate = String(answer?.choice || '');
    const selected = !allowedChoices.length || allowedChoices.includes(candidate) ? candidate : '';
    const score = certainty(answer);
    const kind = decisionPolicyKind(key);
    const irreversibleOrPaceSensitive = ['retire', 'replace'].includes(selected)
        || selected.endsWith('_significant')
        || key === 'relationship_pacing'
        || (key === 'advanced_entry' && selected === 'closed');
    const deltas = kind === 'routing' && !irreversibleOrPaceSensitive
        ? { conservative: 0.08, balanced: 0, active: -0.12 }
        : { conservative: 0, balanced: 0, active: 0 };
    const rawThreshold = Number(choiceThreshold?.[selected] ?? baseThreshold);
    const baseAcceptanceThreshold = Math.max(0.4, Math.min(0.95, rawThreshold + (deltas[style] ?? 0)));
    const parsedIntensity = Number(progressIntensity);
    const intensity = Number.isFinite(parsedIntensity) && parsedIntensity > 0 ? Math.max(0.5, Math.min(1.5, parsedIntensity)) : 1;
    const adjustable = ADJUSTABLE_PROGRESS[key]?.includes(selected) === true;
    const threshold = adjustable ? Math.max(0.4, Math.min(0.78, baseAcceptanceThreshold / intensity)) : baseAcceptanceThreshold;
    const effective = selected && score >= threshold ? selected : fallback;
    return {
        selected,
        effective,
        certainty: score,
        threshold,
        baseAcceptanceThreshold,
        progressIntensity: adjustable ? intensity : 1,
        adjusted: selected !== effective,
        policy: kind,
        fallbackApplied: !(selected && score >= threshold),
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
    return Object.fromEntries(pendingPlan.effects.map((effect) => [`verification_${effect}`, {
        type: 'choice',
        instructions: effect === 'progress'
            ? 'Evaluate only the immediately following CHARACTER output. Material progress means that the output actually changes an active exchange, feeling, thought, decision, relationship pressure, event, access condition, knowledge state, action, or consequence. A quiet but specific new emotional or internal development counts; loud action is not required. Rephrasing, atmosphere, preparation, warning, repeated questions, or handing the turn back without a concrete step is not progress. Do not use the current USER reaction as proof.'
            : `Compare the prior pending plan with the immediately following CHARACTER output. Verify only actual execution of the planned ${EFFECT_LABELS[effect] || effect}. A mention, intention, atmosphere, or setup without material execution is not fulfillment. Do not use the current USER reaction as proof that the prior output executed the plan.`,
        criteria: {
            fulfilled: 'The prior CHARACTER output materially executed the planned effect.',
            partial: 'The prior CHARACTER output executed a real but incomplete part of the planned effect.',
            missed: 'The prior CHARACTER output omitted, evaded, or replaced the planned effect.',
            not_applicable: 'The pending plan did not actually require this effect or the output cannot be evaluated.',
        },
    }]));
}

export function verificationSummary(pendingPlan, decisions = {}) {
    const result = {};
    for (const effect of pendingPlan?.effects || []) result[effect] = decisions[`verification_${effect}`] || 'not_applicable';
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
