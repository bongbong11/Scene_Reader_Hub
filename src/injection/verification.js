

export function createInjectionVerification(deps) {
async function verifyAppliedJudgment(run, expected, receipt) {
    run.assert();
    const expectedJson = JSON.stringify(expected);
    const memory = deps.record()?.lastJudgment;
    if (!memory || JSON.stringify(memory) !== expectedJson
        || deps.activeInjectionPayload !== expected.payload || receipt?.payloadChars !== expected.payload.length) {
        throw new Error('판독 저장 상태와 활성 주입문이 일치하지 않습니다.');
    }
    if (deps.storageVersion < 3) return;
    const saved = await deps.storagePost('bootstrap', {chatKey:run.identity});
    run.assert();
    if (JSON.stringify(saved?.chat?.lastJudgment) !== expectedJson
        || JSON.stringify(deps.record()?.lastJudgment) !== expectedJson
        || deps.activeInjectionPayload !== expected.payload) {
        throw new Error('서버에 저장된 판정과 활성 주입문이 일치하지 않습니다.');
    }
    deps.noteDiagnostic?.('judgment_verified',{inputKey:expected.inputKey,payloadChars:expected.payload.length,serverReadback:true});
}
return {verifyAppliedJudgment};
}
