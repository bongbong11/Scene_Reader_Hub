// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createOwnerUi(deps) {
function renderOwnerMode() {
    const unlocked = deps.ownerUnlocked();
    const ownerCard = deps.document.getElementById('sr-owner-card');
    const ownerStatus = deps.document.getElementById('sr-owner-status');
    if (ownerCard) ownerCard.hidden = !unlocked;
    const replacement=deps.document.getElementById('sr-replacement-tools');
    if(replacement)replacement.hidden=!unlocked;
    const tracePanel = deps.document.getElementById('sr-hub-trace-panel');
    if (tracePanel) { tracePanel.hidden = !unlocked; if (!unlocked) tracePanel.open = false; }
    if (ownerStatus) ownerStatus.textContent = unlocked ? '열림' : '잠금 상태';
    const promptInput = deps.document.getElementById('sr-owner-prompt');
    if (promptInput && unlocked) promptInput.value = deps.ownerPrompt();
}
return {renderOwnerMode};
}
