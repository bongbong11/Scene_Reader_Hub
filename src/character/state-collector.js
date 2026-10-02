// Keep collection independent from Jev and select one collector per chat.
export function stateCollectorMode(preferences) {
    return preferences?.profileEmotionJudgment === true ? 'profile-output' : 'main-output';
}

export function stateRoster(store, preferences, judgment) {
    if (!store?.enabled) return [];
    const entries = [...(store.characters || []), ...(store.npcs || []), ...(preferences?.allowUserImpersonation && store.persona ? [store.persona] : [])];
    const trace = Array.isArray(judgment?.characterTrace) ? judgment.characterTrace : [];
    const active = new Set(trace.filter(item => item.presence === 'active' || item.final?.presence === 'active').map(item => item.id));
    const possible = new Set(trace.filter(item => ['active','background'].includes(item.presence) || ['active','background'].includes(judgment?.details?.[`character_${item.index}_presence`]?.selected)).map(item=>item.id));
    for (const id of judgment?.sceneIntimacy?.participantIds || []) active.add(id);
    const selected = entries.filter(entry => active.has(entry.id) || possible.has(entry.id)).sort((a,b)=>Number(active.has(b.id))-Number(active.has(a.id)));
    return selected.slice(0, 6).map((entry, index) => ({
        code: `C${index}`,
        id: entry.id,
        kind: entry.kind,
        name: String(entry.name || '').replace(/[|\r\n<>]/g, ' ').trim().slice(0, 80),
        trackArousal: entry.kind !== 'npc' || Boolean(entry.trackArousal),
    }));
}
