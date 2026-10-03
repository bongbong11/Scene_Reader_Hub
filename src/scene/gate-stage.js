import {sceneDisplayState} from './display-state.js';
import { notifySceneReaderToast } from "../ui/toasts.js";
import { MEMORY_REFERENCE_ENABLED } from "../memory/context.js";
import { sceneGateRequest, resolveSceneGate, sceneGateAnswersConflict, sceneGateConflictRequest, resolveSceneGateConflict } from "./intimacy-gate.js";
import { currentRecords, recordBankIsCurrent } from "../characters/records.js";
import { addWorldQuestions, selectedWorldRecords, worldPayload as buildWorldPayload } from "../world/advanced.js";
import { seasonalWorldNote } from "../world/seasonal.js";
import { stateForEntry } from "../characters/state-contract.js";

export function createGateStage(deps) {
async function prepareGate(run,frame) {
(frame.memoryNode = deps.document.getElementById('sr-memory-status'));
    if (frame.memoryNode) {
        frame.memoryNode.textContent = MEMORY_REFERENCE_ENABLED ? deps.memoryStatusText(frame.prefs, frame.memory.status) : '준비 중 · 현재 RP 판독에서는 사용하지 않습니다.';
    }
    (frame.previousSceneRoute = frame.rec.sceneIntimacy?.route === 'paused' ? 'paused' : 'normal');
    (frame.previousParticipantIds = frame.previousSceneRoute==='paused' ? frame.rec.sceneIntimacy?.participantIds||[] : []);
    (frame.carriedGateIds = [...new Set([...frame.previousParticipantIds,...(frame.rec.lastJudgment?.characterTrace || []).filter(item=>(item?.presence||item?.final?.presence)==='active').map(item=>item.id)])]);
    (frame.gatePeople = deps.characterStore.enabled ? deps.selectActiveEntries(deps.characterStore, frame.transcript, deps.getContext().name2 || '', frame.carriedGateIds, {allowUserImpersonation:frame.prefs.allowUserImpersonation}).slice(0,6) : []);
    (frame.gateRequest = sceneGateRequest({model:deps.JEV_MODEL,transcript: frame.transcript,previous:frame.previousSceneRoute,people:frame.gatePeople,previousParticipantIds: frame.previousParticipantIds}));
    (frame.rawPriorStates = new Map(deps.latestStateForChat(frame.rec, deps.getContext().chat, deps.stableFingerprint).map(item => [item.id, item])));
    frame.gateRequest.state.prior_output_character_states = frame.gatePeople.map(entry => {
        const state = stateForEntry(frame.rawPriorStates.get(entry.id), entry);
        return state ? { ...state, name: entry.name } : null;
    }).filter(Boolean);
    if (frame.gateRequest.state.prior_output_character_states.length) frame.gateRequest.state.scope += ' Prior output feelings may guide character-record retrieval. They are not evidence that sexual activity has begun, a conditional world state is active, or anyone knows another person’s feelings.';
    (frame.worldRecords = frame.world?.advanced?.records || []);
    (frame.worldRetrieval = frame.world?.advanced && frame.worldRecords.length
        ? await deps.vectorRetrieval.search({kind:'world',bankId:frame.world.id,items:frame.worldRecords,transcript: frame.transcript,limit:10,signal:run.controller.signal})
        : {indices:[],status:'plain'});
    run.assert();
    (frame.worldRecordCandidates = addWorldQuestions(frame.gateRequest, frame.world, frame.transcript, frame.worldRetrieval.indices));
    if (deps.characterStore.enabled) deps.addCharacterNeedsQuestions(frame.gateRequest, frame.gatePeople);
    (frame.sceneGate = undefined);
    (frame.sceneGateError = '');
    (frame.worldRecordAnswers = {});
    (frame.worldSelectionFailed = false);
    (frame.worldInvalidCount = 0);
    deps.judgeInFlight = true;
    deps.judgeCompletionPromise = new Promise(resolve=>{deps.resolveJudgeCompletion=resolve;run.resolveGate=resolve;});
    deps.setBusy(true);
    try {
        deps.updateStatus('현재 장면 확인 중…');
        const gateData=await deps.callJev(frame.gateRequest,frame.worldRecordCandidates.length ? 30000 : 15000,run.controller.signal);
        run.assert();
        if(deps.currentInputKey(frame.pendingUserText,frame.cycleSalt)!==frame.inputKey || deps.recentContext(frame.pendingUserText).contextKey!==frame.context.contextKey || deps.sourceRevisionKey(deps.record(),deps.selectedWorld())!==frame.sourceKey)throw new deps.StaleRunError();
        frame.worldRecordAnswers = gateData.answers || {};
        frame.worldInvalidCount = frame.worldRecordCandidates.filter((_, index) => !['yes', 'no'].includes(frame.worldRecordAnswers[`world_record_${index}`]?.choice)).length;
        frame.worldSelectionFailed = frame.worldRecordCandidates.length > 0 && frame.worldInvalidCount === frame.worldRecordCandidates.length;
        frame.sceneGate=resolveSceneGate(gateData.answers,frame.gateRequest,frame.previousSceneRoute);
        if(sceneGateAnswersConflict(gateData.answers)) {
            try {
                const confirmation=await deps.callJev(sceneGateConflictRequest(frame.gateRequest,gateData.answers),15000,run.controller.signal);
                run.assert();
                frame.assertCurrentSnapshot();
                frame.sceneGate=resolveSceneGateConflict(frame.sceneGate,confirmation.answers,frame.gateRequest,frame.previousSceneRoute);
                if(frame.sceneGate.confirmation!=='resolved')frame.sceneGateError='서로 다른 장면 답변을 확인하지 못했습니다.';
            } catch(error) {
                if(error instanceof deps.StaleRunError || !run.valid())throw error;
                frame.sceneGateError=`장면 답변 재확인 실패: ${String(error?.message||error)}`;
                frame.sceneGate={...frame.sceneGate,confirmation:'unresolved'};
            }
        }
    } catch(error) {
        if(error instanceof deps.StaleRunError || !run.valid())throw error;
        frame.sceneGateError = String(error?.message || error);
        frame.sceneGate=resolveSceneGate({},frame.gateRequest,frame.previousSceneRoute);
        frame.worldSelectionFailed = true;
        deps.updateActivity(`장면 상태 확인 실패 · 기존 상태 유지: ${frame.sceneGateError}`,{error:true});
    } finally {
        run.resolveGate?.();
        if(deps.resolveJudgeCompletion===run.resolveGate) {
        deps.judgeInFlight=false;
        deps.resolveJudgeCompletion?.();deps.resolveJudgeCompletion=null;
        deps.setBusy(false);
        }
    }
    (frame.sceneContextEndIndex = Math.max(-1,...frame.context.selected.map(message=>(deps.getContext().chat||[]).indexOf(message)),String(frame.pendingUserText||'').trim()?(deps.getContext().chat||[]).length:-1));
    frame.rec.sceneIntimacy={route:frame.sceneGate.route,level:frame.sceneGate.level,phase:frame.sceneGate.phase,evidence:frame.sceneGate.evidence,participantIds:frame.sceneGate.participantIds,inputKey: frame.inputKey,contextEndIndex:frame.sceneContextEndIndex,...(frame.sceneGate.confirmation?{confirmation:frame.sceneGate.confirmation}:{}),...(frame.sceneGateError?{error:frame.sceneGateError}:{})};
    deps.noteDiagnostic?.('scene_gate',{displayStage:sceneDisplayState(frame.rec.sceneIntimacy).stage,route:frame.sceneGate.route,transition:frame.sceneGate.transition||'',phase:frame.sceneGate.phase||'',confirmation:frame.sceneGate.confirmation||'',error:frame.sceneGateError||''});
    (frame.seasonalContext = seasonalWorldNote(frame.prefs, frame.transcript, frame.world));
    (frame.appliedWorldRecords = selectedWorldRecords(frame.world, frame.worldRecordCandidates, frame.worldRecordAnswers, frame.worldSelectionFailed));
    (frame.selectedWorldPayload = [buildWorldPayload(frame.world, frame.worldRecordCandidates, frame.worldRecordAnswers, frame.worldSelectionFailed), frame.seasonalContext].filter(Boolean).join('\n\n'));
    (frame.worldSelection = { status: !frame.world?.advanced ? 'plain' : frame.worldSelectionFailed ? 'fallback' : frame.worldInvalidCount ? 'partial' : 'selected', invalidCount:frame.worldInvalidCount, retrievalStatus: frame.worldRetrieval.status, retrievalError:frame.worldRetrieval.error || '', candidateIds: frame.worldRecordCandidates.map(record=>record.id), selectedIds: frame.worldRecordCandidates.filter((_,index)=>frame.worldRecordAnswers[`world_record_${index}`]?.choice==='yes').map(record=>record.id), appliedIds: frame.appliedWorldRecords.map(record=>record.id) });
    if (frame.world?.advanced && frame.worldSelectionFailed) notifySceneReaderToast(deps.window, 'warning', '세계관 판정 응답을 확인하지 못해 이번 턴은 고정 규칙만 적용합니다.', '씬판독기');
    (frame.worldGateFrame = { request: frame.gateRequest, answers: frame.worldRecordAnswers });
    if(frame.sceneGate.route==='paused') {
        const referenceLines=[];
        for(const entry of frame.gatePeople) {
            if(!frame.sceneGate.participantIds.includes(entry.id) || (entry.kind==='persona'&&!frame.prefs.allowUserImpersonation) || !recordBankIsCurrent(entry))continue;
            const reference=String(entry.recordBank?.intimacy_reference?.text||'').trim();
            if(reference)referenceLines.push(`<CHARACTER_REFERENCE name="${String(entry.name).replace(/["<>]/g,'')}">Use this person's stored information in the current interaction without inventing traits or forcing an action: ${reference}</CHARACTER_REFERENCE>`);
        }
        (frame.payload = deps.buildPausedInjection({settings:frame.prefs,privatePrompt:frame.prefs.privatePromptEnabled?deps.ownerPrompt():'',referenceLines,activeWorldName:frame.world?.name||''}));
        frame.rec.lastJudgment={details:{},decisions:{},payload: frame.payload,worldSelection: frame.worldSelection,worldId:frame.world?.id||'',worldPayload:frame.selectedWorldPayload,inputKey: frame.inputKey,contextKey:frame.context.contextKey,sourceKey: frame.sourceKey,continuityCacheKey: frame.continuityCacheKey,memoryKey: frame.memoryKey,characterTrace:[],sceneIntimacy:frame.rec.sceneIntimacy,judgedAt:new Date().toISOString(),model:deps.JEV_MODEL};
        run.assert();
        if(deps.storageVersion>=2)await deps.queueWrite('session:'+run.identity,()=>{run.assert();return deps.storagePost('transaction',{chatKey:run.identity,chat:structuredClone(frame.rec),history:run.history.slice(-deps.STATE_HISTORY_LIMIT)});});
        else await deps.persistChat(run.identity,frame.rec);
        run.assert();deps.chatRecords.set(run.identity,frame.rec);
        (frame.receipt = await deps.applyStoredInjection({validate:frame.assertCurrentSnapshot}));
        frame.assertCurrentSnapshot();
        if(!frame.receipt?.applied || frame.receipt.inputKey!==frame.inputKey || frame.receipt.sourceKey!==frame.sourceKey)throw new deps.StaleRunError();
        await deps.verifyAppliedJudgment(run, frame.rec.lastJudgment, frame.receipt);
        frame.assertCurrentSnapshot();
        deps.noteDiagnostic?.('injection_applied',{inputKey: frame.inputKey,payloadChars:frame.receipt.payloadChars,worldChars:frame.receipt.worldChars,scenePreset:frame.receipt.scenePreset,worldPreset:frame.receipt.worldPreset});
        deps.renderAll();
        if(frame.sceneGate.transition==='entered')notifySceneReaderToast(deps.window, 'info', '잠깐 비켜드릴게요♡','앗, 둘만의 시간이네요!',{sceneState:'paused'});
        deps.updateStatus(frame.sceneGateError?'장면 확인 실패 · 기존 중단 상태 유지':'현재 장면 · 고정 지침 준비');
        deps.updateActivity(frame.sceneGateError?'장면 확인 실패 · 기존 중단 상태를 유지하고 고정 지침만 적용했습니다.':frame.receipt.scenePreset||frame.receipt.worldPreset?'현재 장면 · 고정 지침 준비·프리셋 주입 준비':'현재 장면 · 고정 지침과 저장된 인물 참고문 준비',frame.sceneGateError?{error:true}:{done:true});
        frame.done=true; frame.result=frame.rec.lastJudgment; return frame.result;
    }
    
}
return {prepareGate};
}
