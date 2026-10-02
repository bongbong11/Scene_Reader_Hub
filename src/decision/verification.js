

export function createDecisionVerification(deps) {
function registerSceneOpportunity(rec, key) {
    const marker = String(key || '');
    if (!marker) return false;
    rec.observedOpportunityKeys ||= [];
    if (rec.observedOpportunityKeys.includes(marker)) return false;
    rec.observedOpportunityKeys.push(marker);
    rec.observedOpportunityKeys = rec.observedOpportunityKeys.slice(-12);
    rec.sceneOpportunity = Math.max(1, Number(rec.sceneOpportunity) || 1) + 1;
    rec.lastOpportunityInput = marker;
    return true;
}

async function commitPriorVerification(rec, decisions, run = null) {
    run?.assert();
    const chatKey = run?.identity || deps.stateChatKey();
    const pending = rec.pendingPlan;
    if (!pending?.outputText) return null;
    const verification = deps.verificationSummary(pending, decisions);
    const before = JSON.parse(JSON.stringify(pending.stateSnapshot || deps.reversibleStateSnapshot(rec)));
    const result = deps.commitVerifiedPlan(rec, pending, verification);
    const followed = rec.continuity?.followups?.find((item) => item.id === pending.decisions?.selected_continuity_id);
    if (followed) {
        followed.lastOffered = rec.sceneOpportunity;
        if (['fulfilled', 'partial'].includes(verification.continuity)) {
            followed.executed = true;
            followed.status = 'executed';
        }
        rec.continuity.revision += 1;
    }
    const activeThread = Boolean(rec.eventProfile)
        || ['active', 'turning', 'resolution_ready'].includes(decisions.event_state)
        || !['none', 'unclear', undefined].includes(decisions.unresolved)
        || decisions.scene_state === 'stalled';
    deps.updateProgressionPressure(rec, pending, verification, { activeThread });
    if (['character_established', 'both'].includes(decisions.context_change_source)
        && ['fulfilled', 'partial'].includes(verification.progress)) {
        registerSceneOpportunity(rec, `character:${pending.outputFingerprint}`);
    }
    const history = [...(run?.history || await deps.loadStateHistory(chatKey))];
    run?.assert();
    history.push({
        inputKey: pending.inputKey,
        assistantIndex: pending.outputIndex,
        before,
        after: deps.reversibleStateSnapshot(rec),
        plan: JSON.parse(JSON.stringify(pending)),
        judgment: pending.judgment ? JSON.parse(JSON.stringify(pending.judgment)) : null,
        verification,
        committed: result.committed,
        committedEffects: result.committedEffects,
        committedAt: new Date().toISOString(),
    });
    if (run) run.history = history; else await deps.saveStateHistory(history, chatKey);
    run?.assert();
    if (run) run.postOutput = {pending,verification,trigger:decisions.continuity_trigger};
    else await deps.postVerifiedCharacterOutput(rec, pending, verification, decisions.continuity_trigger);
    rec.lastVerification = { inputKey: pending.inputKey, outputIndex: pending.outputIndex, verification, committed: result.committed, committedEffects: result.committedEffects, at: new Date().toISOString() };
    rec.pendingPlan = null;
    return rec.lastVerification;
}
return {registerSceneOpportunity,commitPriorVerification};
}
