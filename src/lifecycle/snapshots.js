// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createStateSnapshots(deps) {
function reversibleStateSnapshot(rec) {
    return JSON.parse(JSON.stringify({
        opportunities: rec.opportunities || null,
        lastOpportunityVerification: rec.lastOpportunityVerification || null,
        pacingState: rec.pacingState,
        characterState: rec.characterState,
        relationshipState: rec.relationshipState,
        observationState: rec.observationState,
        sceneState: rec.sceneState,
        sceneIntimacy: rec.sceneIntimacy || null,
        characterStateEvents: rec.characterStateEvents || [],
        characterStateCapture: rec.characterStateCapture || null,
        eventProfile: rec.eventProfile || null,
        npcProfile: rec.npcProfile || null,
        ...(rec.generatedCast?{generatedCast:rec.generatedCast}:{}),
        ...(rec.drawOpportunityKey?{drawOpportunityKey:rec.drawOpportunityKey}:{}),
        villainProfile: rec.villainProfile || null,
        lastEventRoll: rec.lastEventRoll || null,
        lastNpcRoll: rec.lastNpcRoll || null,
        lastVillainRoll: rec.lastVillainRoll || null,
        backgroundEvents: rec.backgroundEvents || [],
        advancedEntities: rec.advancedEntities || [],
        sceneOpportunity: rec.sceneOpportunity || 1,
        progressionState: rec.progressionState || { turnsSinceMeaningfulProgress: 0, lastOutputFingerprint: '' },
        deferredRoutes: rec.deferredRoutes || {},
        observedOpportunityKeys: rec.observedOpportunityKeys || [],
        continuity: rec.continuity || { items: [], knowledge: [], followups: [], revision: 0 },
        pendingContinuityCandidates: rec.pendingContinuityCandidates || [],
        lastReasonerSource: rec.lastReasonerSource || null,
        lastContinuityTrace: rec.lastContinuityTrace || null,
        ...(rec.repetitionGuard ? {repetitionGuard:rec.repetitionGuard} : {}),
        lastOpportunityInput: rec.lastOpportunityInput || null,
        lastStateInput: rec.lastStateInput || null,
    }));
}

function restoreReversibleState(rec, snapshot) {
    if (!snapshot) return;
    Object.assign(rec, JSON.parse(JSON.stringify(snapshot)));
    if(snapshot.repetitionGuard)rec.repetitionGuard=structuredClone(snapshot.repetitionGuard);
    else delete rec.repetitionGuard;
    if(!snapshot.generatedCast)delete rec.generatedCast;
    if(!snapshot.drawOpportunityKey)delete rec.drawOpportunityKey;
    rec.opportunities = snapshot.opportunities ? structuredClone(snapshot.opportunities) : null;
    rec.lastOpportunityVerification = snapshot.lastOpportunityVerification ? structuredClone(snapshot.lastOpportunityVerification) : null;
    rec.sceneIntimacy = snapshot.sceneIntimacy ? structuredClone(snapshot.sceneIntimacy) : null;
    rec.characterStateEvents = structuredClone(snapshot.characterStateEvents || []);
    rec.characterStateCapture = snapshot.characterStateCapture ? structuredClone(snapshot.characterStateCapture) : null;
}
return {reversibleStateSnapshot, restoreReversibleState};
}
