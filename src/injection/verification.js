import {jsonValueEqual} from '../shared/json-value.js';
export function createInjectionVerification(deps) {
async function verifyAppliedJudgment(run, expected, receipt) {
    run.assert();
    const memory = deps.record()?.lastJudgment;
    if (!memory || !jsonValueEqual(memory, expected)
        || deps.activeInjectionPayload !== expected.payload || receipt?.payloadChars !== expected.payload.length) {
        throw new Error('판독 저장 상태와 활성 주입문이 일치하지 않습니다.');
    }
    if (deps.storageVersion < 3) return;
    const saved = await deps.storagePost('bootstrap', {chatKey:run.identity});
    run.assert();
    if (!jsonValueEqual(saved?.chat?.lastJudgment, expected)
        || !jsonValueEqual(deps.record()?.lastJudgment, expected)
        || deps.activeInjectionPayload !== expected.payload) {
        throw new Error('서버에 저장된 판정과 활성 주입문이 일치하지 않습니다.');
    }
    deps.noteDiagnostic?.('judgment_verified',{inputKey:expected.inputKey,payloadChars:expected.payload.length,serverReadback:true});
}
return {verifyAppliedJudgment};
}
