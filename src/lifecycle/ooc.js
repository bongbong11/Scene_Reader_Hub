// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createOocLifecycle(deps) {
function rememberOocMarker(marker) {
    const value = String(marker || '');
    if (!value || deps.handledOocMarkers.includes(value)) return;
    deps.handledOocMarkers.push(value);
    if (deps.handledOocMarkers.length > 24) deps.handledOocMarkers.splice(0, deps.handledOocMarkers.length - 24);
}

async function handleOocOnlySkip({ messageId = null, inputKey = '' } = {}) {
    deps.generationMode = 'ooc_skip';
    deps.activeGenerationCycle = { mode: 'ooc_skip', inputKey: String(inputKey || ''), startedAt: new Date().toISOString() };
    await deps.clearInjection();
    deps.updateStatus('OOC-only 입력 · 판독과 주입 건너뜀');
    const idMarker = messageId === null || messageId === undefined ? '' : `message:${deps.stateChatKey()}:${messageId}`;
    const keyMarker = inputKey ? `input:${inputKey}` : '';
    const alreadyHandled = Boolean(idMarker ? deps.handledOocMarkers.includes(idMarker) : keyMarker && deps.handledOocMarkers.includes(keyMarker));
    rememberOocMarker(idMarker);
    rememberOocMarker(keyMarker);
    // Finish every execution, even when this input has already been acknowledged.
    deps.updateActivity('OOC 입력 감지 · 이번 판독과 주입을 건너뜁니다.', { done: true });
    deps.noteDiagnostic?.('ooc_skip',{module:'src/lifecycle/ooc.js',status:'skipped',reasonCode:alreadyHandled?'OOC_ALREADY_HANDLED':'OOC_CURRENT_INPUT'});
}
return {rememberOocMarker, handleOocOnlySkip};
}
