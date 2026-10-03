

export function createContinuityRuntime(deps) {
function sourceIdentityForPending(pending) {
    return {
        chatKey: deps.stateChatKey(),
        inputKey: String(pending?.inputKey || ''),
        assistantIndex: Number(pending?.outputIndex),
        outputFingerprint: String(pending?.outputFingerprint || ''),
        sourceRevision: String(pending?.sourceKey || ''),
    };
}

function pendingExternalCandidates(rec, sourceRevision) {
    return deps.activePendingCandidates(rec?.pendingContinuityCandidates, {
        chatKey: deps.stateChatKey(),
        chat: deps.getContext().chat,
        sourceRevision,
    });
}

function sourceUserRpForOutput(outputIndex) {
    const chat = deps.getContext().chat || [];
    for (let index = Number(outputIndex) - 1; index >= 0; index -= 1) {
        if (!chat[index]?.is_user) continue;
        return chat[index]?.extra?.ooc_chat === true ? '' : deps.splitOocText(chat[index].mes).rpText;
    }
    return '';
}

async function postVerifiedCharacterOutput(rec, pending, verification, trigger) {
    const identity = sourceIdentityForPending(pending);
    if (!deps.settings.continuityEnabled || !deps.settings.reasonerProfileId || !deps.connectionRequestService || !pending.outputText) return;
    if (!trigger || trigger === 'none') return;
    if (rec.lastReasonerSource?.outputFingerprint === identity.outputFingerprint
        && rec.lastReasonerSource?.assistantIndex === identity.assistantIndex
        && rec.lastReasonerSource?.sourceRevision === identity.sourceRevision) return;
    const userText = sourceUserRpForOutput(identity.assistantIndex);
    const sourceText = `USER:\n${userText}\nCHARACTER:\n${pending.outputText}`.slice(-9000);
    const chatKey = identity.chatKey;
    if (deps.reasonerJobs.has(chatKey)) return;
    const generationToken = deps.reasonerGeneration;
    const previousSource=rec.lastReasonerSource;
    rec.lastReasonerSource = identity;
    rec.lastContinuityTrace = { status: 'analyzing', trigger, profileId: deps.settings.reasonerProfileId, sourceIdentity: identity, candidates: [] };
    const controller=new AbortController();
    const job = (async () => {
        try {
            const data = await deps.requestWithConnectionProfile(deps.connectionRequestService, deps.settings.reasonerProfileId, deps.REASONER_SYSTEM, {
                    memory_reference: pending.memoryReference || null,
                    trigger,
                    source_rp: sourceText,
                    active_continuity: {
                        items: deps.normalizeContinuity(deps.continuityView(rec)).items.map(({ id, kind, label, lifecycle, pressure, owners }) => ({ id, kind, label, lifecycle, pressure, owners })),
                        knowledge: deps.normalizeContinuity(deps.continuityView(rec)).knowledge.map(({ factId, character, source, summary }) => ({ factId, character, source, summary })),
                        dependencies: deps.normalizeContinuity(deps.continuityView(rec)).dependencies.map(({ stateId, pressure, reason }) => ({ stateId, pressure, reason })),
                    },
                    existing_state_refs: { event: rec.eventProfile ? { id: 'event:current', title: rec.eventProfile.title } : null, relationship: rec.relationshipState ? { id: 'relationship:current', ...rec.relationshipState } : null },
            },{signal:controller.signal});
            // A late auxiliary result must not race the detached scene transaction.
            if (deps.judgeInFlight) await deps.judgeCompletionPromise;
            const current = deps.record(true);
            const output = (deps.getContext().chat || [])[identity.assistantIndex];
            if (generationToken !== deps.reasonerGeneration || !deps.settings.continuityEnabled || deps.settings.reasonerProfileId !== rec.lastContinuityTrace?.profileId
                || deps.stateChatKey() !== chatKey || deps.sourceRevisionKey(current, deps.selectedWorld(current)) !== identity.sourceRevision
                || !output || deps.stableFingerprint(String(output.mes || '')) !== identity.outputFingerprint) return;
            const candidates = deps.validateReasonerResult(data.result, { sourceText, continuity: deps.continuityView(current), sourceIdentity: identity });
            current.pendingContinuityCandidates = deps.settings.continuityEnabled ? candidates : [];
            current.lastContinuityTrace = { status: candidates.length ? 'pending_jev' : 'empty', trigger, profileId: deps.settings.reasonerProfileId, sourceIdentity: identity, candidates: candidates.map((item) => ({ type: item.type, label: item.label, evidence: item.evidence })) };
            await deps.persistChat();
            deps.renderAll();
        } catch (error) {
            if (generationToken !== deps.reasonerGeneration || deps.stateChatKey() !== chatKey) return;
            const current=deps.record(true);
            if (current.lastReasonerSource?.outputFingerprint===identity.outputFingerprint) current.lastReasonerSource=previousSource;
            current.lastContinuityTrace = { status: 'error', trigger, profileId: deps.settings.reasonerProfileId, error: error.message, candidates: [] };
            try { await deps.persistChat(); deps.renderAll(); }
            catch (storageError) { console.error('[씬판독기] Reasoner 실패 상태 저장 오류', storageError); }
        } finally { if (deps.reasonerJobs.get(chatKey) === job) deps.reasonerJobs.delete(chatKey); }
    })();
    job.cancel=()=>controller.abort();
    deps.reasonerJobs.set(chatKey, job);
}

async function commitContinuityCandidates(rec, candidates, decisions, details, run = null) {
    run?.assert();
    const chatKey = run?.identity || deps.stateChatKey();
    if (!deps.settings.continuityEnabled || !candidates.length) return [];
    const result = deps.applyContinuityVerdicts(deps.continuityView(rec), candidates, decisions, { opportunity: rec.sceneOpportunity });
    const processed = new Set(candidates.map((item) => item.id));
    rec.pendingContinuityCandidates = (rec.pendingContinuityCandidates || []).filter((item) => !processed.has(item.id));
    rec.lastContinuityTrace = { ...(rec.lastContinuityTrace || {}), status: 'verified', verdicts: candidates.map((item, index) => {
        const detail = details[`continuity_candidate_${index}`] || {};
        return { label: item.label, type: item.type, selected: detail.selected || '응답 없음', certainty: detail.certainty || 0, threshold: detail.threshold || 0, verdict: decisions[`continuity_candidate_${index}`] || 'reject', reason: detail.fallbackApplied ? '확신도 부족·기본값 적용' : 'Jev 선택 유지' };
    }) };
    if (!result.accepted.length) return [];
    deps.assignContinuity(rec, result.continuity);
    const sourceIndex = Math.min(...result.accepted.map((item) => Number(item.sourceIdentity?.assistantIndex)));
    const history = [...(run?.history || await deps.loadStateHistory(chatKey))];
    run?.assert();
    const applyToSnapshot = (snapshot) => {
        if (!snapshot) return;
        deps.assignContinuity(snapshot, deps.applyContinuityVerdicts(deps.continuityView(snapshot), candidates, decisions, { opportunity: rec.sceneOpportunity }).continuity);
    };
    for (const entry of history) {
        if (Number(entry.assistantIndex) === sourceIndex) {
            entry.after ||= {};
            applyToSnapshot(entry.after);
        } else if (Number(entry.assistantIndex) > sourceIndex) {
            entry.before ||= {}; entry.after ||= {};
            applyToSnapshot(entry.before);
            applyToSnapshot(entry.after);
        }
    }
    applyToSnapshot(rec.pendingPlan?.stateSnapshot);
    if (run) run.history = history; else await deps.saveStateHistory(history, chatKey);
    run?.assert();
    return result.accepted;
}
return {sourceIdentityForPending,pendingExternalCandidates,sourceUserRpForOutput,postVerifiedCharacterOutput,commitContinuityCandidates};
}
