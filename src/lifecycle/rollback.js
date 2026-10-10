import {invalidateDeltasFrom} from '../continuity/delta-commit.js';
import { notifySceneReaderToast } from "../ui/toasts.js";
import { selectedStateSwipe } from "../character/state-contract.js";

export function createRollback(deps) {
async function waitForOutputChanges() { await deps.outputChangePromise; }

async function rollbackChangedOutput(messageId, kind = 'changed') {
    deps.invalidateReasonerJobs({preserveProfileStates:kind === 'swiped'});
    const currentRecord = deps.record();
    const rec = currentRecord ? structuredClone(currentRecord) : null;
    if (!rec) return;
    const chatKey = deps.stateChatKey();
    let history = structuredClone(await deps.loadStateHistory(chatKey));
    if (chatKey !== deps.stateChatKey()) return;
    const currentMessages = deps.messageSnapshot(deps.getContext().chat);
    const previousMessages = deps.messageSnapshots.get(chatKey);
    const changedIndex = deps.firstChangedMessage(previousMessages, currentMessages);
    const deletion = ['deleted', 'regenerated'].includes(kind);
    const index = deletion ? (changedIndex < 0 ? Math.min(Number(messageId) || 0, currentMessages.length) : changedIndex) : Number(messageId);
    deps.messageSnapshots.set(chatKey, currentMessages);
    if (!Number.isInteger(index)) return;
    if(rec.analysisRuntimeV1||rec.characterEvolutionV1)invalidateDeltasFrom(rec,index,{chatRef:chatKey});
    const previousStateCount = rec.characterStateEvents?.length || 0;
    if (!['swiped', 'regenerated'].includes(kind)) deps.dropStateEventsFrom(rec, index, kind === 'edited' ? selectedStateSwipe(deps.getContext().chat?.[index]) : null);
    const preservedSwipeStates = ['swiped', 'regenerated', 'edited'].includes(kind) ? (rec.characterStateEvents || []).filter(item => item.outputIndex === index) : [];
    if (rec.characterStateCapture?.outputIndex >= index) rec.characterStateCapture = null;
    const stateEventsChanged = (rec.characterStateEvents?.length || 0) !== previousStateCount;
    if ((rec.nonRpOutputIndices || []).includes(index)) {
        if (kind === 'deleted') {
            rec.nonRpOutputIndices = rec.nonRpOutputIndices.filter((value) => value !== index).map((value) => value > index ? value - 1 : value);
            await deps.saveSession(chatKey, rec, history);
        }
        return;
    }
    if (kind === 'deleted' && rec.nonRpOutputIndices?.length) {
        rec.nonRpOutputIndices = rec.nonRpOutputIndices.map((value) => value > index ? value - 1 : value);
    }
    // A verdict made from edited/removed RP cannot keep a scene paused or reuse its injection.
    // Changes to the newly generated reply leave the earlier input verdict reusable.
    const sceneGateAffected=Boolean(rec.sceneIntimacy && (!Number.isInteger(rec.sceneIntimacy.contextEndIndex) || index<=rec.sceneIntimacy.contextEndIndex));
    if(sceneGateAffected) {
        rec.sceneIntimacy=null;
        rec.lastJudgment=null;
        await deps.clearInjection({chatKey});
    }
    const earliest = history.length ? Number(history[0].plan?.chatCount ?? history[0].assistantIndex) - 1 : null;
    if (earliest !== null && index < earliest) {
        for (const key of Object.keys(deps.reversibleStateSnapshot(rec))) delete rec[key];
        rec.pendingPlan = null; rec.lastJudgment = null; rec.lastVerification = null;
        await deps.saveSession(chatKey, rec, []);
        await deps.clearInjection({chatKey}); if(chatKey!==deps.stateChatKey())return; deps.renderAll();
        notifySceneReaderToast(deps.window, 'info', '복원 기록보다 이전 메시지가 바뀌어 누적 판정을 비웠습니다. 시트와 설정은 유지하며 다음 RP에서 다시 판독합니다.', '씬판독기', {timeOut:3000});
        return;
    }
    const affected = history.findIndex((entry) => Number(entry.assistantIndex) >= index);
    if (affected < 0) {
        const pendingAffected = rec.pendingPlan && Number(rec.pendingPlan.outputIndex ?? rec.pendingPlan.chatCount) >= index;
        if (!pendingAffected) {
            if (kind === 'swiped') { await deps.saveSession(chatKey, rec, history); if(chatKey===deps.stateChatKey())deps.renderAll(); return; }
            if (kind === 'edited' || sceneGateAffected || stateEventsChanged) { rec.lastJudgment = null; await deps.clearInjection({chatKey}); await deps.saveSession(chatKey, rec, history); if(chatKey===deps.stateChatKey())deps.renderAll(); }
            return;
        }
        if (['swiped', 'regenerated'].includes(kind)) {
            rec.pendingPlan.outputText = '';
            rec.pendingPlan.outputFingerprint = '';
            rec.pendingPlan.outputIndex = null;
            rec.pendingPlan.status = 'awaiting_output';
            if (kind === 'swiped') deps.attachSelectedOutput(rec.pendingPlan, deps.getContext().chat, index);

        } else if (kind === 'edited') {
            const changed = (deps.getContext().chat || [])[index];
            if (changed && !changed.is_user && !changed.is_system) {
                rec.pendingPlan.outputText = String(changed.mes || '');
                rec.pendingPlan.outputFingerprint = deps.stableFingerprint(rec.pendingPlan.outputText);
                rec.pendingPlan.outputIndex = index;
                rec.pendingPlan.status = 'awaiting_verification';
            } else {
                rec.pendingPlan = null;
                rec.lastJudgment = null;
                await deps.clearInjection({chatKey});
            }
        } else {
            rec.pendingPlan = null;
            rec.lastJudgment = null;
            await deps.clearInjection({chatKey});
        }
        await deps.saveSession(chatKey, rec, history);
        if(chatKey!==deps.stateChatKey())return;
        if (['swiped','regenerated'].includes(kind)) await deps.applyStoredInjection();
        if(chatKey!==deps.stateChatKey())return;
        deps.renderAll();
        const labels = { edited: '수정', deleted: '삭제' };
        notifySceneReaderToast(deps.window, 'info', `출력 ${labels[kind] || '변경'} 감지 · 대기 중인 이행 검증을 갱신했습니다.`, '씬판독기', { timeOut: 1800 });
        return;
    }
    const entry = history[affected];
    const canReuseSwipe = !sceneGateAffected && ['swiped', 'regenerated'].includes(kind) && entry.plan && entry.judgment;
    const analysisState={characterEvolutionV1:rec.characterEvolutionV1,analysisJournalV1:rec.analysisJournalV1};
    deps.restoreReversibleState(rec, entry.before);
    for(const [key,value]of Object.entries(analysisState))if(value)rec[key]=value;
    for (const stateEvent of preservedSwipeStates) deps.storeStateEvent(rec, stateEvent);
    if(sceneGateAffected)rec.sceneIntimacy=null;
    history = history.slice(0, affected);
    rec.lastVerification = null;
    if (canReuseSwipe) {
        rec.lastJudgment = JSON.parse(JSON.stringify(entry.judgment));
        rec.pendingPlan = JSON.parse(JSON.stringify(entry.plan));
        rec.pendingPlan.outputText = '';
        rec.pendingPlan.outputFingerprint = '';
        rec.pendingPlan.outputIndex = null;
        rec.pendingPlan.status = 'awaiting_output';
        if (kind === 'swiped') deps.attachSelectedOutput(rec.pendingPlan, deps.getContext().chat, index);

    } else {
        rec.pendingPlan = null;
        rec.lastJudgment = null;
        await deps.clearInjection({chatKey});
    }
    await deps.saveSession(chatKey, rec, history);
    if(chatKey!==deps.stateChatKey())return;
    if (canReuseSwipe) await deps.applyStoredInjection();
    if(chatKey!==deps.stateChatKey())return;
    deps.renderAll();
    const labels = { swiped: '리롤', regenerated: '재생성', edited: '수정', deleted: '삭제' };
    const suffix = canReuseSwipe ? '직전 누적을 되돌리고 같은 판정·추첨을 재사용합니다.' : '직전 저장 상태를 복원했습니다.';
    notifySceneReaderToast(deps.window, 'info', `출력 ${labels[kind] || '변경'} 감지 · ${suffix}`, '씬판독기', { timeOut: 1800 });
}

async function onAssistantOutputChanged(messageId, kind) {
    const task = deps.outputChangePromise.then(() => rollbackChangedOutput(messageId, kind));
    deps.outputChangePromise = task.catch(() => {});
    await task;
}
return {waitForOutputChanges,rollbackChangedOutput,onAssistantOutputChanged};
}
