

import { vaultAnalysisBridge } from '../integration/vault-output.js';
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
    const usage = (reasonCode, status = 'not_needed') => deps.noteDiagnostic?.('auxiliary_usage', { module: 'src/continuity/runtime.js', status, reasonCode });
    if (!pending.outputText) { usage('no_completed_output'); return; }
    const userText = sourceUserRpForOutput(identity.assistantIndex);
    const outputRp = deps.splitOocText(pending.outputText).rpText;
    if (!outputRp.trim()) { usage('no_rp_output'); return; }
    const fullSource = `USER:\n${userText}\nCHARACTER:\n${outputRp}`;
    const sourceText = fullSource.slice(-9000);
    const chatKey = identity.chatKey;
    if (deps.reasonerJobs.has(chatKey)) { usage('analysis_in_progress', 'running'); return; }
    const bridge = vaultAnalysisBridge(deps.window);
    let vault = null;
    try { vault = bridge?.beginAnalysis({ outputIndex: identity.assistantIndex, sourceText, sourceTruncated:fullSource.length > sourceText.length, outputText: pending.outputText,
        actorDefinitions: [...(deps.characterStore?.characters || []), ...(deps.characterStore?.npcs || [])].map(actor => ({name:actor.name,aliases:actor.aliases || []})).filter(actor=>actor.name) }) || null; }
    catch { usage('vault_input_unavailable'); }
    const continuity = Boolean(deps.settings.continuityEnabled && (vault || trigger && !['none', 'vault_output'].includes(trigger)));
    if (!continuity && !vault) { usage(deps.settings.continuityEnabled ? 'no_continuity_change' : 'analysis_disabled'); return; }
    if (!deps.settings.reasonerProfileId || !deps.connectionRequestService) {
        if (vault) bridge.failAnalysis?.(vault.token, 'PROFILE_UNAVAILABLE');
        usage('profile_not_configured', 'needs_setup'); return;
    }
    const continuityRevision = deps.sourceRevisionKey(rec, deps.selectedWorld(rec), {includeVault:false});
    if (!vault && rec.lastReasonerSource?.outputFingerprint === identity.outputFingerprint
        && rec.lastReasonerSource?.assistantIndex === identity.assistantIndex
        && (rec.lastReasonerSource.continuityRevision || rec.lastReasonerSource.sourceRevision) === continuityRevision) { usage('already_analyzed'); return; }
    const generationToken = deps.reasonerGeneration;
    const previousSource=rec.lastReasonerSource;
    const profileId = deps.settings.reasonerProfileId;
    identity.continuityRevision = continuityRevision;
    if (continuity) {
        rec.lastReasonerSource = identity;
        rec.lastContinuityTrace = { status: 'analyzing', trigger, profileId, sourceIdentity: identity, candidates: [] };
    }
    const controller=new AbortController();
    const job = (async () => {
        try {
            const system = [continuity ? deps.REASONER_SYSTEM : '', vault?.system || '',
                vault && continuity ? 'Return one JSON object containing both the continuity arrays and vault_results. Each section is independent; an empty continuity section does not omit the vault audit. Report vault-card knowledge only in vault_results, not duplicate knowledge_updates. Vault fact data is not RP evidence.' : ''].filter(Boolean).join('\n');
            const data = await deps.requestWithConnectionProfile(deps.connectionRequestService, profileId, system, {
                    ...(vault ? { vault_audit: vault.input } : {}),
                    ...(continuity ? {
                    memory_reference: pending.memoryReference || null,
                    trigger,
                    active_continuity: {
                        items: deps.normalizeContinuity(deps.continuityView(rec)).items.map(({ id, kind, label, lifecycle, pressure, owners }) => ({ id, kind, label, lifecycle, pressure, owners })),
                        knowledge: deps.normalizeContinuity(deps.continuityView(rec)).knowledge.map(({ factId, character, source, summary }) => ({ factId, character, source, summary })),
                        dependencies: deps.normalizeContinuity(deps.continuityView(rec)).dependencies.map(({ stateId, pressure, reason }) => ({ stateId, pressure, reason })),
                    },
                    existing_state_refs: { event: rec.eventProfile ? { id: 'event:current', title: rec.eventProfile.title } : null, relationship: rec.relationshipState ? { id: 'relationship:current', ...rec.relationshipState } : null },
                    } : {}), source_rp: sourceText,
            },{signal:controller.signal, ...(vault ? {maxTokens: Math.min(3600, 800 + vault.count * 160 + (continuity ? 1000 : 0))} : {})});
            if (controller.signal.aborted) return;
            // A late auxiliary result must not race the detached scene transaction.
            if (deps.judgeInFlight) await deps.judgeCompletionPromise;
            const current = deps.record(true);
            const output = (deps.getContext().chat || [])[identity.assistantIndex];
            if (generationToken !== deps.reasonerGeneration || deps.settings.reasonerProfileId !== profileId
                || deps.stateChatKey() !== chatKey
                || !output || deps.stableFingerprint(String(output.mes || '')) !== identity.outputFingerprint) return;
            // A malformed section cannot discard a valid sibling section.
            if (continuity && deps.settings.continuityEnabled && deps.sourceRevisionKey(current, deps.selectedWorld(current), {includeVault:false}) === continuityRevision) {
                try {
                    if (!['new_items','affected','knowledge_updates','possible_followups'].every(key=>Array.isArray(data.result?.[key]))) throw new Error('연속성 결과 항목 누락');
                    const candidates = deps.validateReasonerResult(data.result, { sourceText, continuity: deps.continuityView(current), sourceIdentity: identity });
                    current.pendingContinuityCandidates = candidates;
                    current.lastContinuityTrace = { status: candidates.length ? 'pending_jev' : 'empty', trigger, profileId, sourceIdentity: identity, candidates: candidates.map((item) => ({ type: item.type, label: item.label, evidence: item.evidence })) };
                    await deps.persistChat();
                } catch {
                    current.lastContinuityTrace = {status:'error',trigger,profileId,candidates:[],error:'연속성 결과 또는 저장을 확인하지 못했습니다.'};
                    deps.noteDiagnostic?.('auxiliary_result',{module:'src/continuity/runtime.js',status:'partial',reasonCode:'continuity_result_unconfirmed'});
                }
            }
            if (vault && bridge.analysisCurrent(vault.token)) {
                try {
                    let result = data.result;
                    const repair = bridge.repairAnalysis?.(vault.token, result);
                    if (repair && !controller.signal.aborted) {
                        try {
                            const corrected = await deps.requestWithConnectionProfile(deps.connectionRequestService, profileId, repair.system,
                                {vault_audit:repair.input,source_rp:sourceText}, {signal:controller.signal,maxTokens:Math.min(2600,800+repair.cardIds.length*160)});
                            if (bridge.analysisCurrent(vault.token) && Array.isArray(corrected.result?.vault_results)) {
                                result = {...result,vault_results:[...(Array.isArray(result?.vault_results)?result.vault_results:[]).filter(item=>!repair.cardIds.includes(item?.card_id)),...corrected.result.vault_results.filter(item=>repair.cardIds.includes(item?.card_id))]};
                            }
                        } catch { /* Preserve the first response's valid sections; no further retry. */ }
                    }
                    if (controller.signal.aborted || generationToken !== deps.reasonerGeneration || deps.stateChatKey() !== chatKey) return;
                    const outcome = await bridge.commitAnalysis(vault.token, result);
                    deps.noteDiagnostic?.('vault_audit', {module:'src/integration/vault-output.js',status:outcome.status === 'partial' ? 'partial' : outcome.status === 'cancelled' ? 'cancelled' : 'succeeded',checkedCount:outcome.checkedCount || 0, learnedCount:outcome.learnedCount || 0, unresolvedCount:outcome.unresolvedCount || 0});
                } catch { bridge.failAnalysis?.(vault.token,'VAULT_STORAGE_FAILED'); usage('vault_storage_failed','failed'); }
            }
            deps.renderAll();
        } catch (error) {
            if (generationToken !== deps.reasonerGeneration || deps.stateChatKey() !== chatKey) return;
            const current=deps.record(true);
            if (vault) bridge.failAnalysis?.(vault.token, error.code || 'PROFILE_AUDIT_FAILED');
            if (continuity) {
                if (current.lastReasonerSource?.outputFingerprint===identity.outputFingerprint) current.lastReasonerSource=previousSource;
                current.lastContinuityTrace = { status: 'error', trigger, profileId, error: error.message, candidates: [] };
            }
            try { if (continuity) await deps.persistChat(); deps.renderAll(); }
            catch (storageError) { console.error('[씬판독기] Reasoner 실패 상태 저장 오류', storageError); }
        } finally { if (vault) bridge.abandonAnalysis?.(vault.token); if (deps.reasonerJobs.get(chatKey) === job) deps.reasonerJobs.delete(chatKey); }
    })();
    job.cancel=()=>{
        controller.abort();
        if (vault) bridge.abandonAnalysis?.(vault.token);
        // Restore only this request's marker so a later intentional run can retry.
        if(rec.lastReasonerSource===identity)rec.lastReasonerSource=previousSource;
        if(rec.lastContinuityTrace?.sourceIdentity===identity && rec.lastContinuityTrace.status==='analyzing')
            rec.lastContinuityTrace={...rec.lastContinuityTrace,status:'cancelled'};
    };
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
