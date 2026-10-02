// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createInjectionReconcile(deps) {
async function reconcileInjection({report=true}={}) {
    if (deps.record()?.lastJudgment || !deps.activeInjectionPayload) return false;
    const chatKey = deps.stateChatKey(), payloadChars = deps.activeInjectionPayload.length;
    const cleared = await deps.clearInjection({chatKey,onlyIfOrphaned:true});
    if (cleared && chatKey === deps.stateChatKey()) {
        deps.noteDiagnostic('orphaned_injection_cleared',{payloadChars});
        if (report) deps.updateActivity('저장 판정 없이 남은 주입문을 정리했습니다. 다시 판독해 주세요.',{error:true});
    }
    return cleared;
}
return {reconcileInjection};
}
