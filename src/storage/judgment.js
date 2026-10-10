import {notifySceneReaderToast} from "../ui/toasts.js";
import {opportunityFailureMessage} from '../ui/opportunity-copy.js';

export function createJudgmentCommit(deps) {
async function commitJudgment(run,frame) {
run.assert();
        if (deps.storageVersion >= 2) await deps.queueWrite('session:'+run.identity, () => {run.assert(); return deps.storagePost('transaction',{chatKey:run.identity,chat:structuredClone(frame.rec),history:run.history.slice(-deps.STATE_HISTORY_LIMIT)});});
        else { await deps.persistChat(run.identity,frame.rec); await deps.saveStateHistory(run.history,run.identity); }
        run.assert();
        deps.chatRecords.set(run.identity,frame.rec);
        deps.stateHistoryCache.set(run.identity,run.history.slice(-deps.STATE_HISTORY_LIMIT));
        (frame.receipt = await deps.applyStoredInjection({validate:frame.assertCurrentSnapshot}));
        frame.assertCurrentSnapshot();
        if(!frame.receipt?.applied || frame.receipt.inputKey!==frame.inputKey || frame.receipt.sourceKey!==frame.sourceKey)throw new deps.StaleRunError();
        await deps.verifyAppliedJudgment(run, frame.rec.lastJudgment, frame.receipt);
        frame.assertCurrentSnapshot();
        deps.noteDiagnostic?.('injection_applied',{inputKey: frame.inputKey,payloadChars:frame.receipt.payloadChars,worldChars:frame.receipt.worldChars,scenePreset:frame.receipt.scenePreset,worldPreset:frame.receipt.worldPreset});
        deps.renderAll();
        if(frame.sceneGate.transition==='exited')notifySceneReaderToast(deps.window, 'info', '일반 판독·주입을 다시 시작합니다.','다시 왔어요!',{sceneState:'resumed'});
        deps.updateStatus('판독 완료 · 주입문 준비');
        (frame.incompleteAnswers = frame.missingAnswerCount>0);
        const additionFailure=opportunityFailureMessage(frame.opportunityPlan);
        deps.updateActivity(frame.sceneGateError?'장면 확인 실패 · 기존 상태를 유지한 채 일반 판독만 적용했습니다.':frame.incompleteAnswers?`Jev 응답 ${frame.missingAnswerCount}개 항목 확인 필요 · 유효한 판정만 적용했습니다.`:additionFailure|| (frame.receipt.scenePreset||frame.receipt.worldPreset?'판독 완료 · 직접 주입문·프리셋 주입 준비':frame.mixedOoc ? 'OOC 지시 반영 · 판독·주입문 준비' : '판독·주입문 준비'), frame.sceneGateError||frame.incompleteAnswers||additionFailure?{error:true}:{done:true});
        frame.done=true; frame.result=frame.rec.lastJudgment; return frame.result;
    
}
return {commitJudgment};
}
