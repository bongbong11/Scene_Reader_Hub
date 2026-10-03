import { selectedStateSwipe } from "../character/state-contract.js";

export function createOutputEvents(deps) {
async function onCharacterMessageReceived(messageId) {
    const chatKey=deps.stateChatKey();
    const rec = deps.record();
    const cycleMode = deps.activeGenerationCycle?.mode || deps.generationMode || 'rp';
    const outputIndex = Number.isInteger(Number(messageId)) ? Number(messageId) : (deps.getContext().chat || []).length - 1;
    const output = (deps.getContext().chat || [])[outputIndex];
    const roster = deps.activeGenerationCycle?.stateRoster || [];
    const collectorMode = deps.activeGenerationCycle?.stateCollectorMode || deps.STATE_COLLECTOR_MODE;
    const stateCollectionPaused = deps.activeGenerationCycle?.stateCollectionPaused === true;
    // Remove recognizable metadata even if a generation was stopped or its roster
    // was cleared while the completed response was arriving.
    const collected = output && !output.is_user && !output.is_system ? deps.collectMainOutputState(output.mes, roster) : null;
    if (collected?.found) {
        const raw = output.mes;
        output.mes = collected.text;
        const swipeId = selectedStateSwipe(output);
        if (output.swipes?.[swipeId] === raw) output.swipes[swipeId] = collected.text;
    }
    let captureChanged = false;
    if (rec && cycleMode === 'rp' && (!deps.activeGenerationCycle?.chatKey || deps.activeGenerationCycle.chatKey === deps.stateChatKey()) && output && !output.is_user && !output.is_system && stateCollectionPaused) {
        rec.characterStateCapture = { outputIndex, status:'paused', count:0, source:collectorMode };
        captureChanged = true;
    } else if (rec && cycleMode === 'rp' && (!deps.activeGenerationCycle?.chatKey || deps.activeGenerationCycle.chatKey === deps.stateChatKey()) && output && !output.is_user && !output.is_system && roster.length) {
        if (collectorMode === 'main-output' && deps.activeGenerationCycle?.stateCaptureEnabled) {
            const result = collected;
            if (!String(output.mes || '').trim()) { result.states = []; result.error = 'empty_output'; }
            rec.characterStateCapture = { outputIndex, participantIds:roster.map(person=>person.id), status: result.error || (result.diagnostics?.rejected || result.diagnostics?.partial ? 'partial' : result.states.length ? 'collected' : 'empty'), count: result.states.length, source: 'main-output', diagnostics: result.diagnostics || null };
            captureChanged = true;
        } else if (collectorMode === 'profile-output') {
            deps.scheduleProfileStateCollection({ chatKey: deps.stateChatKey(), outputIndex, text: String(output.mes || ''), roster });
        }
    }
    if (captureChanged) {
        const fingerprint = deps.stableFingerprint(output.mes || '');
        const swipeId = selectedStateSwipe(output);
        Object.assign(rec.characterStateCapture, {fingerprint,swipeId});
        deps.storeStateEvent(rec, {outputIndex,fingerprint,swipeId,states:stateCollectionPaused || collected?.error ? [] : collected?.states || [],source:collectorMode,capture:rec.characterStateCapture},12,deps.latestStateForChat(rec,deps.getContext().chat.slice(0,outputIndex),deps.stableFingerprint));
        deps.renderAll();
    }
    deps.messageSnapshots.set(deps.stateChatKey(), deps.messageSnapshot(deps.getContext().chat));
    if (!deps.settings.enabled || cycleMode === 'disabled') { deps.pendingGenerationType = ''; if (captureChanged) await deps.persistChat(); return; }
    if (deps.activeGenerationCycle?.chatKey && deps.activeGenerationCycle.chatKey !== deps.stateChatKey()) { if (captureChanged) await deps.persistChat(); return; }
    if (cycleMode !== 'rp') {
        if (rec && outputIndex >= 0) {
            rec.nonRpOutputIndices ||= [];
            if (!rec.nonRpOutputIndices.includes(outputIndex)) rec.nonRpOutputIndices.push(outputIndex);
            rec.nonRpOutputIndices = rec.nonRpOutputIndices.slice(-20);
            await deps.persistChat();
        }
        if(chatKey!==deps.stateChatKey())return;
        deps.pendingGenerationType = '';
        deps.generationMode = 'rp';
        deps.activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
        if (cycleMode === 'ooc_debug') {
            await deps.clearInjection({chatKey});
            if(chatKey!==deps.stateChatKey())return;
            deps.updateStatus('검사용 OOC 완료 · 직전 주입문 다시 비움');
            deps.updateActivity('검사용 OOC 완료 · 다음 RP부터 정상 판독합니다.', { done: true });
        }
        return;
    }
    if (!rec?.pendingPlan) { deps.pendingGenerationType = ''; if (captureChanged) await deps.persistChat(); return; }
    if (deps.activeGenerationCycle?.inputKey && deps.activeGenerationCycle.inputKey !== rec.pendingPlan.inputKey) {
        deps.pendingGenerationType = '';
        deps.activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
        if (captureChanged) await deps.persistChat();
        return;
    }
    const index = outputIndex;
    const message = (deps.getContext().chat || [])[index];
    if (!message || message.is_user || message.is_system) { deps.pendingGenerationType = ''; if (captureChanged) await deps.persistChat(); return; }
    rec.pendingPlan.outputIndex = index;
    rec.pendingPlan.outputText = String(message.mes || '');
    rec.pendingPlan.outputFingerprint = deps.stableFingerprint(rec.pendingPlan.outputText);
    rec.pendingPlan.status = 'awaiting_verification';
    deps.pendingGenerationType = '';
    deps.activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
    await deps.persistChat();
    if(chatKey!==deps.stateChatKey())return;
    deps.renderAll();
}

async function onUserMessageSent(messageId) {
    deps.messageSnapshots.set(deps.stateChatKey(), deps.messageSnapshot(deps.getContext().chat));
    if (!deps.settings?.enabled) return;
    const index = Number(messageId);
    const message = Number.isInteger(index) ? (deps.getContext().chat || [])[index] : null;
    if (!message?.is_user || message?.extra?.ooc_chat !== true) return;
    if (deps.debugInjectionArmed) return;
    await deps.handleOocOnlySkip({ messageId: index, inputKey: deps.currentInputKey() });
}
return {onCharacterMessageReceived,onUserMessageSent};
}
