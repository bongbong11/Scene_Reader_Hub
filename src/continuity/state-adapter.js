// Individual knowledge has one owner. Continuity receives a read-only projection.
export function migrateKnowledge(record) {
    record.characterState ||= { knowledge: [], revision: 0 };
    record.characterState.knowledge = Array.isArray(record.characterState.knowledge) ? record.characterState.knowledge : [];
    const old = Array.isArray(record.continuity?.knowledge) ? record.continuity.knowledge : [];
    if (old.length) {
        const keyed = new Map(record.characterState.knowledge.map(item => [`${item.character}:${item.factId}`,item]));
        for (const item of old) keyed.set(`${item.character}:${item.factId}`, item);
        record.characterState.knowledge = [...keyed.values()];
        record.continuity.knowledge = [];
    }
    return record;
}
export function continuityView(record) {
    return { ...record.continuity, knowledge: record.characterState?.knowledge || record.continuity?.knowledge || [] };
}
export function assignContinuity(record, state) {
    record.characterState = { ...record.characterState, knowledge: state.knowledge || [], revision: (record.characterState?.revision || 0) + 1 };
    record.continuity = {...state, knowledge: []};
}
