export const EXECUTION_CORRECTION_LIMIT = 6;
const PROTECTED_KEYS = new Set(['npc_knowledge_fit', 'refusal_stall', 'user_handoff', 'repetitive_ending']);
const DIAGNOSTIC_KEYS = ['action_evasion', 'scene_cutoff', 'user_handoff', 'circularity', 'refusal_stall', 'input_echo', 'repetitive_ending', 'hesitation_drag'];

// These scores rank accepted diagnoses, not scene relevance or new actions.
export function selectExecutionCorrectionKeys(decisions = {}, details = {}) {
    const candidates = [
        ...(decisions.npc_knowledge_fit === 'overreach' ? ['npc_knowledge_fit'] : []),
        ...(['partial', 'missed'].includes(decisions.directive_followthrough) ? ['directive_followthrough'] : []),
        ...DIAGNOSTIC_KEYS.filter(key => decisions[key] === 'yes'),
        ...(['partial', 'missed'].includes(decisions.npc_followthrough) ? ['npc_followthrough'] : []),
    ];
    const confidence = key => {
        const value = Number(details[key]?.certainty);
        return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    };
    const ranked = candidates.map((key, order) => ({ key, order, confidence: confidence(key), protected: PROTECTED_KEYS.has(key) }))
        .sort((a, b) => Number(b.protected) - Number(a.protected) || b.confidence - a.confidence || a.order - b.order);
    const selectedKeys = ranked.slice(0, EXECUTION_CORRECTION_LIMIT).map(item => item.key);
    const selected = new Set(selectedKeys);
    return {
        limit: EXECUTION_CORRECTION_LIMIT,
        detectedKeys: candidates,
        selectedKeys,
        omittedKeys: candidates.filter(key => !selected.has(key)),
        ranking: ranked,
    };
}
