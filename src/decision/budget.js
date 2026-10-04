import { focusMatches, primaryFallbackScore, secondaryCompatible, secondaryScore } from './compatibility-policy.js';

export const ROUTE_LABELS = {
    direct: '현재 상호작용 직접 응답',
    relationship: '관계·로맨스 진행',
    event: '진행 중인 사건·목표',
    new_event: '새 사건의 첫 징후',
    transition: '장면·시간 전환',
    conflict: '현재 갈등 실행',
    npc: '일반 NPC 개입',
    villain: '빌런 개입',
    continuity: '연속성 후속 결과',
};

export function activeEventCandidate(decisions, settings, hasEventProfile, allowUnpreparedCreates) {
    const advanced = Boolean(settings.advancedEnabled && ['create', 'continue'].includes(decisions.advanced_route));
    const rawRoute = advanced ? decisions.advanced_route : decisions.event_route;
    const route = settings.developmentStyle && !advanced && ['create','replace'].includes(rawRoute) ? 'none' : rawRoute;
    const move = advanced ? decisions.advanced_move : decisions.progression_move;
    const create = advanced ? route === 'create' : ['create', 'replace'].includes(route);
    const continuing = route === 'continue';
    const observedEvent = !['none', 'unclear', undefined, ''].includes(decisions.event_state);
    const movingObservedEvent = !advanced && observedEvent && !['hold', 'quiet', undefined, ''].includes(move);
    const profileReady = Boolean(hasEventProfile) || (create && allowUnpreparedCreates);
    if (move === 'transition' || decisions.primary_focus === 'transition') {
        return {
            id: 'transition', kind: 'transition', focus: 'transition', label: ROUTE_LABELS.transition,
            isNew: false, transition: true, executable: true,
        };
    }
    if (!((continuing && (hasEventProfile || observedEvent)) || (create && profileReady) || movingObservedEvent)) {
        const sceneMove = String(decisions.advanced_move || '');
        if (settings.advancedEnabled && ['latent', 'open'].includes(decisions.advanced_entry)
            && decisions.advanced_element && decisions.advanced_element !== 'none'
            && decisions.advanced_cause && decisions.advanced_cause !== 'none'
            && ['seed', 'obstacle', 'reveal', 'aftermath'].includes(sceneMove)) {
            return { id: 'advanced_scene', kind: 'event', focus: 'event', label: '고급 요소의 작은 장면 변화', isNew: false, transition: false, move: sceneMove, executable: true };
        }
        return null;
    }
    if (advanced && ['quiet', undefined, ''].includes(move)) return null;
    const isNew = create;
    return {
        id: advanced ? 'advanced_event' : 'event',
        kind: 'event',
        focus: isNew ? 'new_event' : 'event',
        label: isNew ? ROUTE_LABELS.new_event : ROUTE_LABELS.event,
        isNew,
        transition: false,
        route,
        move,
        executable: true,
    };
}

export function collectActionCandidates({
    decisions = {},
    settings = {},
    hasEventProfile = false,
    hasNpcProfile = false,
    hasVillainProfile = false,
    allowUnpreparedCreates = false,
    externalCandidates = [],
} = {}) {
    const candidates = [{
        id: 'direct', kind: 'direct', focus: 'direct', label: ROUTE_LABELS.direct,
        executable: true, isNew: false, transition: false,
    }];
    if ((decisions.relationship_pacing && decisions.relationship_pacing !== 'hold')
        || (decisions.relationship_beat && decisions.relationship_beat !== 'none')) {
        candidates.push({ id: 'relationship', kind: 'relationship', focus: 'relationship', label: ROUTE_LABELS.relationship, executable: true, isNew: false, transition: false });
    }
    const event = activeEventCandidate(decisions, settings, hasEventProfile, allowUnpreparedCreates);
    if (event) candidates.push(event);
    if (decisions.fight_sustain === 'yes' || decisions.primary_focus === 'conflict') {
        candidates.push({ id: 'conflict', kind: 'conflict', focus: 'conflict', label: ROUTE_LABELS.conflict, executable: true, isNew: false, transition: false });
    }
    if (['create', 'reuse', 'replace'].includes(decisions.npc_route)
        && decisions.npc_role !== 'none' && decisions.npc_weight !== 'none'
        && (allowUnpreparedCreates || !['create', 'replace'].includes(decisions.npc_route) || hasNpcProfile)) {
        candidates.push({ id: 'npc', kind: 'npc', focus: 'npc', label: ROUTE_LABELS.npc, executable: true, isNew: ['create', 'replace'].includes(decisions.npc_route), transition: false, weight: decisions.npc_weight });
    }
    if (['create', 'continue', 'replace'].includes(decisions.villain_route)
        && (allowUnpreparedCreates || !['create', 'replace'].includes(decisions.villain_route) || hasVillainProfile)) {
        candidates.push({ id: 'villain', kind: 'villain', focus: 'npc', label: ROUTE_LABELS.villain, executable: true, isNew: ['create', 'replace'].includes(decisions.villain_route), transition: false });
    }
    for (const item of Array.isArray(externalCandidates) ? externalCandidates : []) {
        if (!item || !item.id || item.executable === false) continue;
        candidates.push({
            id: `external:${item.id}`,
            kind: String(item.kind || 'continuity'),
            focus: String(item.focus || 'event'),
            label: String(item.label || ROUTE_LABELS.continuity),
            executable: true,
            isNew: false,
            transition: false,
            external: true,
            priority: Number(item.priority) || 0,
            compatibleWith: Array.isArray(item.compatibleWith) ? item.compatibleWith : [],
            sourceIdentity: item.sourceIdentity || null,
        });
    }
    return candidates;
}

export function selectActionPlan({
    decisions = {},
    settings = {},
    hasEventProfile = false,
    hasNpcProfile = false,
    hasVillainProfile = false,
    allowUnpreparedCreates = false,
    externalCandidates = [],
} = {}) {
    const candidates = collectActionCandidates({ decisions, settings, hasEventProfile, hasNpcProfile, hasVillainProfile, allowUnpreparedCreates, externalCandidates });
    const requested = decisions.primary_focus || 'direct';
    const primaryEligible = candidates.filter((candidate) => !candidate.external);
    const requestedCandidates = primaryEligible.filter((candidate) => focusMatches(candidate, requested));
    const primary = (requestedCandidates.length ? requestedCandidates : primaryEligible)
        .slice()
        .sort((a, b) => primaryFallbackScore(b, decisions, settings) - primaryFallbackScore(a, decisions, settings))[0]
        || candidates.find((candidate) => candidate.id === 'direct');
    const compatible = candidates
        .filter((candidate) => candidate.kind!=='relationship' || !['event','npc','villain','conflict'].includes(primary?.kind))
        .filter((candidate) => secondaryCompatible(primary, candidate, decisions, settings))
        .sort((a, b) => secondaryScore(b, decisions, settings) - secondaryScore(a, decisions, settings));
    const secondary = compatible[0] || null;
    // The direct response is part of the selected scene, not an extra plot beat.
    // A supported relationship expression can color that same event/NPC exchange
    // without consuming the single independent secondary route.
    const relationship=candidates.find(candidate=>candidate.kind==='relationship');
    const sharedInteraction=['event','npc','villain','conflict'].includes(primary?.kind)
        || ['event','npc','villain','conflict'].includes(secondary?.kind);
    const overlays=[candidates.find(candidate=>candidate.kind==='direct'),...(relationship && sharedInteraction?[relationship]:[])].filter(candidate=>candidate && candidate.id!==primary?.id && candidate.id!==secondary?.id);
    const kept = new Set([primary?.id, secondary?.id,...overlays.map(candidate=>candidate.id)].filter(Boolean));
    const excluded = candidates.filter((candidate) => !kept.has(candidate.id)).map((candidate) => ({
        id: candidate.id,
        kind: candidate.kind,
        label: candidate.label,
        reason: candidate.transition && primary?.id !== candidate.id
            ? '장면 전환은 보조 진행으로 사용하지 않음'
            : secondaryCompatible(primary, candidate, decisions, settings)
                ? '다른 진행 우선'
                : candidate.kind==='event' && candidate.isNew ? '별도 사건 과다'
                : candidate.external ? '조건 미충족'
                : '현재 장면과 별도 진행',
    }));
    return {
        primary,
        secondary,
        overlays,
        candidates,
        excluded,
        allowedCandidateIds: [primary?.id, secondary?.id,...overlays.map(candidate=>candidate.id)].filter(Boolean),
    };
}

export function actionPlanSummary(plan) {
    return {
        primary: plan?.primary ? { id: plan.primary.id, kind: plan.primary.kind, focus: plan.primary.focus, label: plan.primary.label } : null,
        secondary: plan?.secondary ? { id: plan.secondary.id, kind: plan.secondary.kind, focus: plan.secondary.focus, label: plan.secondary.label } : null,
        additions: Array.isArray(plan?.additions)?plan.additions.map(item=>({...item})):[],
        overlays: Array.isArray(plan?.overlays)?plan.overlays.map(item=>({id:item.id,kind:item.kind,label:item.label})):[],
        excluded: Array.isArray(plan?.excluded) ? plan.excluded.map((item) => ({ ...item })) : [],
    };
}

export function nextDeferredRoutes(previous = {}, plan = {}) {
    const eligible = new Set((plan.candidates || []).map((candidate) => candidate.id));
    const selected = new Set([plan.primary?.id, plan.secondary?.id,...(plan.overlays||[]).map(item=>item.id)].filter(Boolean));
    return Object.fromEntries(['event', 'advanced_event', 'advanced_scene', 'npc', 'villain']
        .filter((id) => eligible.has(id) && !selected.has(id))
        .map((id) => [id, Math.min(3, (Number(previous[id]) || 0) + 1)]));
}
