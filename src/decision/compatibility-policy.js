

export function focusMatches(candidate, requested) {
    if (requested === 'new_event') return candidate.kind === 'event' && candidate.isNew;
    if (requested === 'event') return candidate.kind === 'event' && !candidate.isNew;
    if (requested === 'transition') return candidate.transition;
    if (requested === 'npc') return ['npc', 'villain'].includes(candidate.kind);
    return candidate.focus === requested || candidate.kind === requested;
}

export function primaryFallbackScore(candidate, decisions, settings) {
    const base = candidate.id === 'advanced_scene' ? 68 : {
        transition: 120,
        event: candidate.isNew ? 62 : 105,
        conflict: 100,
        relationship: 88,
        villain: 80,
        npc: 76,
        continuity: 72,
        direct: 60,
    }[candidate.kind] ?? 50;
    const active = settings.judgmentStyle === 'active' ? 8 : settings.judgmentStyle === 'conservative' ? -5 : 0;
    const stalled = Math.min(3, Math.max(0, Number(settings.turnsSinceMeaningfulProgress) || 0));
    if (candidate.kind === 'event' && !candidate.isNew) return base + active + stalled * 8 + (settings.resolutionPace === 'fast' ? 12 : settings.resolutionPace === 'slow' ? -8 : 0);
    if (candidate.kind === 'relationship') return base + (settings.relationshipPace === 'fast' ? 10 : settings.relationshipPace === 'slow' ? -6 : 0);
    if (candidate.kind === 'conflict' && decisions.conflict_state === 'active') return base + 20;
    const deferred = Math.min(3, Math.max(0, Number(settings.deferredRoutes?.[candidate.id]) || 0));
    return base + (candidate.kind === 'direct' ? 0 : active) + Number(candidate.priority || 0) + deferred * 8;
}

export function secondaryCompatible(primary, candidate, decisions, settings) {
    if (!candidate || candidate.id === primary.id || candidate.kind === 'direct' || candidate.transition) return false;
    if (candidate.external && candidate.compatibleWith.length && !candidate.compatibleWith.includes(primary.kind) && !candidate.compatibleWith.includes(primary.focus)) return false;
    if (primary.kind === 'transition') return false;
    if (candidate.external) return candidate.compatibleWith.includes(primary.kind) || candidate.compatibleWith.includes(primary.focus);
    if (primary.kind === 'relationship') {
        if (candidate.kind === 'event') return !candidate.isNew && ['advance', 'reveal', 'consequence', 'aftermath'].includes(String(candidate.move || ''));
        return candidate.kind === 'npc' && (!candidate.isNew || settings.settingsContract >= 3) && ['brief', 'background'].includes(candidate.weight);
    }
    if (primary.kind === 'conflict') return candidate.kind === 'villain' || (candidate.kind === 'npc' && !candidate.isNew) || (candidate.kind === 'event' && !candidate.isNew && ['consequence', 'aftermath'].includes(String(candidate.move || '')));
    if (primary.kind === 'event') {
        if (candidate.kind === 'relationship') return decisions.relationship_pacing?.endsWith('_incremental') || decisions.relationship_beat !== 'none';
        return ['npc', 'villain', 'continuity'].includes(candidate.kind);
    }
    if (primary.kind === 'npc' || primary.kind === 'villain') return candidate.kind === 'event' && !candidate.isNew;
    if (primary.kind === 'direct') {
        if (candidate.kind === 'event' && candidate.isNew) {
            const stalled = Number(settings.turnsSinceMeaningfulProgress) || 0;
            return stalled > 0 || settings.judgmentStyle === 'active' || ['normal', 'stalled', 'transition_ready'].includes(decisions.scene_state);
        }
        if (candidate.kind === 'event' && settings.advancedEnabled && !['seed', 'advance', 'obstacle', 'reveal', 'aftermath'].includes(String(candidate.move || ''))) return false;
        return ['relationship', 'event', 'conflict', 'npc', 'villain', 'continuity'].includes(candidate.kind);
    }
    return candidate.external;
}

export function secondaryScore(candidate, decisions, settings) {
    const stalled = Math.min(3, Math.max(0, Number(settings.turnsSinceMeaningfulProgress) || 0));
    let score = candidate.id === 'advanced_scene' ? 62 : {
        event: candidate.isNew ? 54 : 92,
        conflict: 96,
        relationship: 78,
        villain: 74,
        npc: candidate.isNew ? 58 : 68,
        continuity: 72,
    }[candidate.kind] ?? 50;
    if (candidate.kind === 'event') {
        score += stalled * 9;
        if (settings.resolutionPace === 'fast') score += 14;
        if (settings.resolutionPace === 'slow') score -= 10;
        if (candidate.isNew && settings.judgmentStyle === 'conservative') score -= 18;
        // Creation is only eligibility for a draw. Give an active-mode candidate
        // a fair chance to reach that draw before a routine relationship beat.
        if (candidate.isNew && settings.judgmentStyle === 'active' && !settings.developmentStyle) score += 32;
        if (candidate.isNew && settings.advancedEnabled && decisions.advanced_route === 'create') score += 20;
    }
    if (candidate.kind === 'relationship') score += settings.relationshipPace === 'fast' ? 10 : settings.relationshipPace === 'slow' ? -8 : 0;
    if (candidate.kind === 'conflict' && decisions.conflict_state === 'active') score += 15;
    if (candidate.kind === 'npc' && candidate.isNew && settings.judgmentStyle === 'active' && !settings.developmentStyle) score += 24;
    score += Math.min(3, Math.max(0, Number(settings.deferredRoutes?.[candidate.id]) || 0)) * 10;
    score += Number(candidate.priority || 0);
    return score;
}
