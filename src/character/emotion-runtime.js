import { buildEmotionContext } from './state-context.js';
import { isStateOutput, latestStateOutputIndex } from './state-message.js';
import { missingStateFields, mergeRecoveredStates, captureDiagnostic } from './state-coverage.js';
import {waitForIdle} from '../lifecycle/jobs.js';
import {withRequestLifetime} from '../adapters/request-lifetime.js';
export function createEmotionRuntime(deps,{applyTimeoutMs=120000}={}) {
function notifyEmotionCapture(status, count=0, selected=true) {
    const messages={too_long:'답변이 감정 수집 길이 한도를 넘었습니다. 값을 임의로 잘라 수집하지 않았습니다.',incomplete:'요청한 인물의 감정값 일부가 반환되지 않았습니다. 기존 저장값은 유지했습니다.',timeout:'감정 수집 시간 초과 · 다시 판독해 주세요.',request:'감정 수집 실패 · 확장 연결모델의 응답을 확인하세요.',format:'감정값 형식 확인 필요 · 인물의 감정값 탭을 확인하세요.',unavailable:'감정 수집 실패 · 확장 연결모델 설정을 확인하세요.',save_failed:'감정값을 저장하지 못했습니다. 다시 판독해 주세요.',processing_failed:'감정 수집의 확장 처리에 실패했습니다. 전체 로그에서 단계를 확인해 주세요.'};
    const message=status==='collecting'?'감정 수집 중…':status==='collected'?`${selected?'감정 수집 완료':'다른 스와이프 감정 저장 완료'} · ${count}명`:status==='partial'?`감정 ${count}명 수집 · 일부 값은 형식 확인 필요`:status==='empty'?'감정 수집 완료 · 이번 답변에서 수집할 값 없음':messages[status];
    if(!message)return;
    const level=status==='collecting'||status==='empty'?'info':status==='collected'?'success':'warning';
    deps.notifySceneReaderToast(deps.window, level, message,'씬판독기',{timeOut:status==='collecting'?1800:3000,sceneState:status==='collecting'?'working':undefined});
}

function scheduleProfileStateCollection({ chatKey, outputIndex, text, roster, missingOnly = false }) {
    if ((!missingOnly && deps.stateCollectorMode(deps.record()?.preferences) !== 'profile-output') || !deps.settings.enabled || !deps.characterStore.enabled || !roster?.length || !text.trim()) return;
    const owner = deps.record();
    if (!isStateOutput(deps.getContext().chat?.[outputIndex],outputIndex,owner.nonRpOutputIndices)) return;
    const fingerprint = deps.stableFingerprint(text);
    const swipeId = deps.selectedStateSwipe(deps.getContext().chat?.[outputIndex]);
    const existing = owner.characterStateEvents?.find(event => event.outputIndex===outputIndex && event.swipeId===swipeId && event.fingerprint===fingerprint);
    const pending = deps.pendingProfileStateRequests.get(existing?.capture?.requestId);
    if (pending && !pending.retryable) return pending;
    const preserved = missingOnly ? structuredClone(existing?.states || []) : [];
    const fullRoster = roster;
    if (missingOnly) {
        roster = roster.map(person=>({...person,requestedFields:missingStateFields(preserved.find(state=>state.id===person.id),person)})).filter(person=>person.requestedFields.length);
        if (!roster.length) {
            deps.notifySceneReaderToast(deps.window,'info','대상 인물의 감정값이 이미 저장되어 있습니다. 추가로 수집하지 않았습니다.','씬판독기');
            return;
        }
        owner.characterStateRevision=(Number(owner.characterStateRevision)||0)+1;
    }
    const profileId = deps.settings.reasonerProfileId;
    const context = buildEmotionContext(deps.getContext().chat, outputIndex, {nonRpOutputIndices:owner.nonRpOutputIndices});
    const contextFingerprint = deps.stableFingerprint(context);
    const requestId = `${Date.now()}:${++deps.profileStateSequence}`;
    const participantIds=[...new Set([...(missingOnly ? existing?.capture?.participantIds || [] : []),...fullRoster.map(person=>person.id)])];
    const started=Date.now();
    const capture = { outputIndex, swipeId, fingerprint, requestId, participantIds, status:'collecting', phase:'request', count:preserved.length, source:'profile-output' };
    if(pending?.retryable)pending.cancel?.();
    owner.characterStateCapture = capture;
    deps.noteDiagnostic?.('character_state_capture',{module:'src/character/emotion-runtime.js',...captureDiagnostic(capture)});
    deps.storeStateEvent(owner,{outputIndex,swipeId,fingerprint,states:preserved,source:'profile-output',capture},deps.STATE_HISTORY_LIMIT);
    const controller=new AbortController();
    function progress(detail){
        if(chatKey!==deps.stateChatKey())return;
        const rec=deps.record(),event=rec?.characterStateEvents?.find(item=>item.capture?.requestId===requestId);
        if(!event)return;
        event.capture={...event.capture,...detail};
        if(rec.characterStateCapture?.requestId===requestId)rec.characterStateCapture=event.capture;
        deps.noteDiagnostic?.('character_state_capture',{module:'src/character/emotion-runtime.js',...captureDiagnostic(event.capture)});
        deps.renderCharacterTurnResults();
    }
    let phase='request';
    let finishFailure;
    const failureReady=new Promise(resolve=>{finishFailure=resolve;});
    const task = (async () => {
        if (!deps.connectionRequestService) await deps.loadReasonerProfiles();
        const result = await deps.collectProfileOutputState({
            request: deps.requestWithConnectionProfile, service: deps.connectionRequestService,
            profileId, output: text, roster, context, signal:controller.signal,
        });
        if(controller.signal.aborted)return;
        const requestMs=Date.now()-started;
        const requestFailed=Boolean(result.error&&!result.states.length);
        if(requestFailed){
            progress({status:result.error,phase:'request',requestMs,durationMs:requestMs,errorKind:result.errorKind||'EMOTION_'+result.error.toUpperCase()});
            // Expose failure immediately and allow an explicit retry. Keep this
            // task cancellable while its terminal status waits for safe storage.
            task.retryable=true;
            if(chatKey===deps.stateChatKey())notifyEmotionCapture(result.error,preserved.length);
            finishFailure();
        }else progress({phase:'response',requestMs});
        phase='source';
        const waiting=Date.now();
        if(!requestFailed)progress({phase:'waiting'});
        await withRequestLifetime(async signal=>{
            await deps.waitForOutputChanges();signal.throwIfAborted();
            // The reply is already complete. Protect Hub writes, not the host's
            // generation-ended flag, which may remain set through later hooks.
            do { await waitForIdle({hub:deps.hub,signal}); }
            while(deps.hub?.snapshot().state.status==='running');
        },{signal:controller.signal,timeoutMs:applyTimeoutMs,timeoutMessage:'감정 결과 적용 대기 시간이 초과되었습니다.'});
        if (!deps.pendingProfileStateRequests.has(requestId) || chatKey !== deps.stateChatKey() || !deps.settings.enabled || !deps.characterStore.enabled || (!missingOnly && deps.stateCollectorMode(deps.record()?.preferences) !== 'profile-output') || deps.settings.reasonerProfileId !== profileId) return;
        const rec = deps.record();
        if (!rec?.characterStateEvents?.some(event=>event.capture?.requestId===requestId)) return;
        const message = deps.getContext().chat?.[outputIndex];
        const selected = message && deps.selectedStateSwipe(message) === swipeId;
        const reply = selected ? message.mes : message?.swipes?.[swipeId];
        if (typeof reply !== 'string' || deps.stableFingerprint(reply) !== fingerprint) return;
        if (deps.stableFingerprint(buildEmotionContext(deps.getContext().chat,outputIndex,{nonRpOutputIndices:rec.nonRpOutputIndices})) !== contextFingerprint) return;
        const untouchedIds=new Set((existing?.capture?.participantIds || []).filter(id=>!roster.some(person=>person.id===id)));
        const states=mergeRecoveredStates(preserved,result.states);
        const diagnostics=result.diagnostics ? {...result.diagnostics,actors:(result.diagnostics.actors || []).map(actor=>({...actor,rosterIndex:participantIds.indexOf(roster[actor.rosterIndex]?.id)}))} : null;
        if (missingOnly && existing?.capture?.diagnostics?.actors?.length) {
            const retained=existing.capture.diagnostics.actors.filter(actor=>untouchedIds.has(existing.capture.participantIds?.[actor.rosterIndex])).map(actor=>({...actor,rosterIndex:participantIds.indexOf(existing.capture.participantIds[actor.rosterIndex])}));
            if(diagnostics)diagnostics.actors.push(...retained);
        }
        const absentIds=new Set((result.diagnostics?.absentIndices || []).map(index=>roster[index]?.id));
        const incomplete=roster.some(person=>!absentIds.has(person.id) && missingStateFields(states.find(state=>state.id===person.id),person).length);
        const malformed=diagnostics?.actors?.some(actor=>actor.reasons?.some(reason=>reason!=='not_participating' && reason!=='missing_moods'));
        const waitMs=Date.now()-waiting;
        const completed = {outputIndex,swipeId,fingerprint,requestId,participantIds,status:result.error || (incomplete?'incomplete':malformed?'partial':states.length?'collected':'empty'),count:states.length,source:'profile-output',diagnostics,phase:'complete',requestMs,waitMs,...(result.error?{errorKind:result.errorKind||'EMOTION_'+result.error.toUpperCase(),phase:'request'}:{})};
        // Publish one terminal capture to the shared record. Other normal saves
        // must see the same result, never a temporary collecting snapshot.
        if (selected) rec.characterStateCapture = completed;
        deps.storeStateEvent(rec,{outputIndex,swipeId,fingerprint,states,source:'profile-output',capture:completed},deps.STATE_HISTORY_LIMIT,deps.latestStateForChat(rec,deps.getContext().chat.slice(0,outputIndex),deps.stableFingerprint));
        task.saving=!requestFailed;
        if(task.saving)deps.noteDiagnostic?.('character_state_capture',{module:'src/character/emotion-runtime.js',...captureDiagnostic({...completed,status:'collecting',phase:'storage'})});
        deps.renderCharacterTurnResults();
        phase='storage';
        await deps.persistChat(chatKey);
        task.saving=false;
        if(controller.signal.aborted)return;
        completed.durationMs=Date.now()-started;
        phase='render';
        progress(completed);
        if (chatKey === deps.stateChatKey() && deps.pendingProfileStateRequests.has(requestId)) {
            deps.renderAll();
            if(!requestFailed)notifyEmotionCapture(completed.status,completed.count,selected);
        }
    })().catch(error => {
        if(controller.signal.aborted)return;
        if(chatKey===deps.stateChatKey() && deps.pendingProfileStateRequests.has(requestId)) {
            const rec=deps.record();
            const event=rec?.characterStateEvents?.find(item=>item.capture?.requestId===requestId);
            if(!event)return; // A newer retry or output change owns this slot now.
            const status=phase==='storage'&&!error.storageSaved?'save_failed':'processing_failed';
            const errorKind=phase==='source'&&error.code==='REQUEST_TIMEOUT'?'EMOTION_APPLY_TIMEOUT':/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code||'')?error.code:'EMOTION_PROCESSING_FAILED';
            if(event) {
                if(!error.storageSaved)event.states=preserved;
                event.capture={...capture,status,count:event.states.length,errorKind,phase:error.phase||phase};
                if(rec.characterStateCapture?.requestId===requestId)rec.characterStateCapture=event.capture;
            }
            notifyEmotionCapture(status);
            deps.noteDiagnostic?.('character_state_capture',{module:'src/character/emotion-runtime.js',status,errorKind,phase:error.phase||phase});
        }
    }).finally(()=>{
        task.saving=false;
        const rec=chatKey===deps.stateChatKey()?deps.record():null;
        if(rec?.characterStateEvents?.some(event=>event.capture?.requestId===requestId&&event.capture.status==='collecting'))progress({status:'cancelled',phase,errorKind:'EMOTION_SOURCE_CHANGED'});
        deps.pendingProfileStateRequests.delete(requestId);
        if (chatKey===deps.stateChatKey()) deps.renderCharacterTurnResults();
    });
    const closeCancelled = () => {
        for (const rec of new Set([owner,chatKey===deps.stateChatKey()?deps.record():null,deps.chatRecords?.get(chatKey)])) {
            if (!rec) continue;
            const event=rec.characterStateEvents?.find(item=>item.capture?.requestId===requestId);
            if(event?.capture?.status==='collecting')event.capture={...event.capture,status:'cancelled'};
            if(rec.characterStateCapture?.requestId===requestId && rec.characterStateCapture.status==='collecting')rec.characterStateCapture={...rec.characterStateCapture,status:'cancelled'};
        }
        deps.noteDiagnostic?.('character_state_capture',{module:'src/character/emotion-runtime.js',status:'cancelled',errorKind:'ANALYSIS_CANCELLED'});
    };
    task.cancel=()=>{controller.abort();closeCancelled();};
    task.failureReady=failureReady;
    deps.pendingProfileStateCollection = task;
    deps.pendingProfileStateRequests.set(requestId,task);
    notifyEmotionCapture('collecting');
    deps.renderCharacterTurnResults();
    return task;
}

async function collectCurrentEmotion() {
    await deps.waitForOutputChanges();
    const rec=deps.record();
    if (!deps.settings.enabled || !deps.characterStore.enabled) throw new Error('씬판독기와 인물 판정을 먼저 켜 주세요.');
    if (!deps.settings.reasonerProfileId) throw new Error('설정 → 모델·키 설정에서 확장 연결 프로필을 먼저 선택하세요.');
    if (rec?.lastJudgment?.sceneIntimacy?.route==='paused' || rec?.sceneIntimacy?.route==='paused') throw new Error('현재 장면에서는 감정 수집을 쉬고 있습니다.');
    const chat=deps.getContext().chat || [];
    const outputIndex=latestStateOutputIndex(chat,rec.nonRpOutputIndices);
    const text=String(chat[outputIndex]?.mes || '');
    if (!text.trim()) throw new Error('감정을 읽을 롤플 답변이 없습니다.');
    const entries=[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[]),...(rec.preferences?.allowUserImpersonation && deps.characterStore.persona?[deps.characterStore.persona]:[])];
    let judgment=rec.lastJudgment?.characterTrace?.length ? rec.lastJudgment : {characterTrace:entries.map(entry=>({id:entry.id,presence:'background'}))};
    const capturedIds=new Set(deps.latestStateEventForChat(rec,chat,deps.stableFingerprint)?.capture?.participantIds || []);
    if(capturedIds.size) judgment={...judgment,characterTrace:[...judgment.characterTrace.filter(person=>!capturedIds.has(person.id)),...[...capturedIds].map(id=>({id,presence:'background'}))]};
    // Recovery rechecks wrongly excluded registered actors from the completed output.
    // The collector still must find actual participation; this does not change Jev presence.
    judgment={...judgment,characterTrace:entries.map(entry=>({id:entry.id,presence:judgment.characterTrace.find(p=>p.id===entry.id)?.presence==='active'?'active':'background'}))};
    const roster=deps.stateRoster(deps.characterStore,rec.preferences,judgment);
    if (!roster.length) throw new Error('감정을 읽을 참여 인물이 없습니다. 인물 기록과 판독 결과를 확인하세요.');
    const task=scheduleProfileStateCollection({chatKey:deps.stateChatKey(),outputIndex,text,roster,missingOnly:true});
    // A known request failure releases the manual button immediately. Its
    // tracked task still saves the terminal status once the Hub is idle.
    if(task)await Promise.race([task,task.failureReady]);
}
return {notifyEmotionCapture, scheduleProfileStateCollection, collectCurrentEmotion};
}
