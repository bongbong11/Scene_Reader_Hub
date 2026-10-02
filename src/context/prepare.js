import { MEMORY_REFERENCE_ENABLED } from "../memory/context.js";

export function createContextStage(deps) {
async function prepareContext(run,frame) {
await deps.waitForOutputChanges?.();
    if (deps.judgeInFlight) await deps.judgeCompletionPromise;
    run.assert();
    if (!deps.settings.enabled) throw new Error('씬판독기가 꺼져 있습니다.');
    deps.showActivity('입력 확인 중…');
    (frame.context = undefined);
    try { frame.context = deps.recentContext(frame.pendingUserText); }
    catch (error) { deps.updateActivity(error.message, { error: true }); throw error; }
    if (frame.context.malformedOoc) {
        await deps.clearInjection();
        deps.updateStatus('닫히지 않은 OOC 블록 · 안전하게 판독 중단');
        deps.updateActivity('닫히지 않은 OOC 블록이 있어 이번 판독과 주입을 건너뜁니다.', { error: true });
        frame.done=true; frame.result=undefined; return frame.result;
    }
    if (frame.context.oocOnly) {
        await deps.handleOocOnlySkip({ inputKey: deps.currentInputKey(frame.pendingUserText, frame.cycleSalt) });
        frame.done=true; frame.result=undefined; return frame.result;
    }
    (frame.mixedOoc = Boolean(frame.context.metaGuidance.current));
    if (frame.mixedOoc) deps.updateActivity('OOC 지시 확인 · RP와 분리해 판독 중…');

    // Manual and automatic judgment both consume completed prior-response state.
    await deps.waitForProfileState?.();
    run.assert();

    (frame.waitingReasoner = deps.settings.continuityEnabled ? deps.reasonerJobs.get(deps.stateChatKey()) : null);
    if (frame.waitingReasoner) await Promise.race([frame.waitingReasoner, new Promise((resolve) => setTimeout(resolve, 180))]).catch((error) => console.warn('[씬판독기] Reasoner 결과 대기 실패', error));
    run.assert();
    (frame.rec = deps.stagedRecord(deps.record(true)));
    run.history = structuredClone(await deps.loadStateHistory(run.identity));
    run.assert();
    (frame.prefs = frame.rec.preferences);
    (frame.inputKey = deps.currentInputKey(frame.pendingUserText, frame.cycleSalt));
    (frame.world = deps.selectedWorld(frame.rec));
    (frame.sourceKey = deps.sourceRevisionKey(frame.rec, frame.world));
    (frame.assertCurrentSnapshot = () => {
        run.assert();
        if (!deps.settings.enabled || deps.currentInputKey(frame.pendingUserText,frame.cycleSalt)!==frame.inputKey
            || deps.recentContext(frame.pendingUserText).contextKey!==frame.context.contextKey
            || deps.sourceRevisionKey(deps.record(),deps.selectedWorld())!==frame.sourceKey) throw new deps.StaleRunError();
    });
    (frame.continuityCacheKey = deps.settings.continuityEnabled
        ? deps.stableFingerprint({ revision: frame.rec.continuity?.revision || 0, candidates: (frame.rec.pendingContinuityCandidates || []).map((item) => item.id) })
        : '');
    if (frame.rec.pendingPlan && frame.rec.pendingPlan.inputKey !== frame.inputKey && !frame.rec.pendingPlan.outputText) frame.rec.pendingPlan = null;
    (frame.transcript = frame.context.recentRoleplay);
    if (!frame.transcript.trim()) {
        await deps.clearInjection();
        deps.updateActivity('RP 본문이 없어 이번 판독과 주입을 건너뜁니다.', { done: true });
        frame.done=true; frame.result=undefined; return frame.result;
    }
    (frame.memoryIdentity = run.identity);
    ([frame.charm,frame.lore] = await Promise.all([
        MEMORY_REFERENCE_ENABLED && frame.prefs.charmMemory ? deps.readCharm(deps.window.__charmBridge, { identity: frame.memoryIdentity, isCurrent: () => run.valid() }) : null,
        MEMORY_REFERENCE_ENABLED && frame.prefs.lorebookMemory ? deps.readCharacterLorebooks(deps.worldInfoModule, deps.getContext(), { identity: frame.memoryIdentity, recentRoleplay: frame.transcript, isCurrent: () => run.valid() }) : null,
    ]));
    run.assert();
    (frame.memory = deps.mergeMemory(frame.charm, frame.lore, frame.memoryIdentity));
    if (!run.valid() || deps.sourceRevisionKey(deps.record(), deps.selectedWorld()) !== frame.sourceKey || deps.recentContext(frame.pendingUserText).contextKey !== frame.context.contextKey) throw new deps.StaleRunError();
    (frame.memoryKey = deps.stableFingerprint({ status: frame.memory.status, entries: frame.memory.entries.map(entry => [entry.sourceId, entry.contentHash]) }));
    if (!frame.force && frame.rec.lastJudgment?.inputKey === frame.inputKey && frame.rec.lastJudgment?.contextKey === frame.context.contextKey && frame.rec.lastJudgment?.sourceKey === frame.sourceKey && frame.rec.lastJudgment?.continuityCacheKey === frame.continuityCacheKey && frame.rec.lastJudgment?.memoryKey === frame.memoryKey && !frame.rec.lastJudgment?.sceneIntimacy?.error) {
        (frame.receipt = await deps.applyStoredInjection({validate:frame.assertCurrentSnapshot}));
        frame.assertCurrentSnapshot();
        if (!frame.receipt?.applied || frame.receipt.inputKey!==frame.inputKey || frame.receipt.sourceKey!==frame.sourceKey) throw new deps.StaleRunError();
        await deps.verifyAppliedJudgment(run, frame.rec.lastJudgment, frame.receipt);
        frame.assertCurrentSnapshot();
        deps.updateStatus('같은 입력 · 기존 판정과 추첨 재사용');
        deps.updateActivity(frame.receipt.macroMode||frame.receipt.worldMacroMode?'기존 판정 재사용 · 매크로용 주입문 준비':'기존 판정 재사용 · 주입문 준비', { done: true });
        frame.done=true; frame.result=frame.rec.lastJudgment; return frame.result;
    }
    
}
return {prepareContext};
}
