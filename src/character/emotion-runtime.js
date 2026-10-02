// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createEmotionRuntime(deps) {
async function waitForProfileState() {
    if (deps.stateCollectorMode(deps.record()?.preferences) !== 'profile-output') return;
    const event = deps.latestStateEventForChat(deps.record(),deps.getContext().chat,deps.stableFingerprint);
    const task = deps.pendingProfileStateRequests.get(event?.capture?.requestId);
    if (task) await task;
}

function notifyEmotionCapture(status, count=0, selected=true) {
    const messages={timeout:'감정 수집 시간 초과 · 다시 판독해 주세요.',request:'감정 수집 실패 · 확장 연결모델의 응답을 확인하세요.',format:'감정값 형식 확인 필요 · 인물의 감정값 탭을 확인하세요.',unavailable:'감정 수집 실패 · 확장 연결모델 설정을 확인하세요.',save_failed:'감정값을 저장하지 못했습니다. 다시 판독해 주세요.'};
    const message=status==='collecting'?'감정 수집 중…':status==='collected'?`${selected?'감정 수집 완료':'다른 스와이프 감정 저장 완료'} · ${count}명`:status==='partial'?`감정 ${count}명 수집 · 일부 값은 형식 확인 필요`:status==='empty'?'감정 수집 완료 · 이번 답변에서 수집할 값 없음':messages[status];
    if(!message)return;
    const level=status==='collecting'||status==='empty'?'info':status==='collected'?'success':'warning';
    deps.notifySceneReaderToast(deps.window, level, message,'씬판독기',{timeOut:status==='collecting'?1800:3000,sceneState:status==='collecting'?'working':undefined});
}

function scheduleProfileStateCollection({ chatKey, outputIndex, text, roster }) {
    if (deps.stateCollectorMode(deps.record()?.preferences) !== 'profile-output' || !deps.settings.enabled || !deps.characterStore.enabled || !roster?.length || !text.trim()) return;
    const owner = deps.record();
    const fingerprint = deps.stableFingerprint(text);
    const swipeId = deps.selectedStateSwipe(deps.getContext().chat?.[outputIndex]);
    const existing = owner.characterStateEvents?.find(event => event.outputIndex===outputIndex && event.swipeId===swipeId && event.fingerprint===fingerprint);
    const pending = deps.pendingProfileStateRequests.get(existing?.capture?.requestId);
    if (pending) return pending;
    const profileId = deps.settings.reasonerProfileId;
    const requestId = `${Date.now()}:${++deps.profileStateSequence}`;
    const capture = { outputIndex, swipeId, fingerprint, requestId, participantIds:roster.map(person=>person.id), status:'collecting', count:0, source:'profile-output' };
    owner.characterStateCapture = capture;
    deps.storeStateEvent(owner,{outputIndex,swipeId,fingerprint,states:[],source:'profile-output',capture},deps.STATE_HISTORY_LIMIT);
    const task = (async () => {
        if (!deps.connectionRequestService) await deps.loadReasonerProfiles();
        const result = await deps.collectProfileOutputState({
            request: deps.requestWithConnectionProfile, service: deps.connectionRequestService,
            profileId, output: text, roster,
        });
        await deps.waitForOutputChanges();
        if (!deps.pendingProfileStateRequests.has(requestId) || chatKey !== deps.stateChatKey() || !deps.settings.enabled || !deps.characterStore.enabled || deps.stateCollectorMode(deps.record()?.preferences) !== 'profile-output' || deps.settings.reasonerProfileId !== profileId) return;
        const rec = deps.record();
        if (!rec?.characterStateEvents?.some(event=>event.capture?.requestId===requestId)) return;
        const message = deps.getContext().chat?.[outputIndex];
        const selected = message && deps.selectedStateSwipe(message) === swipeId;
        const reply = selected ? message.mes : message?.swipes?.[swipeId];
        if (typeof reply !== 'string' || deps.stableFingerprint(reply) !== fingerprint) return;
        const completed = {outputIndex,swipeId,fingerprint,participantIds:roster.map(person=>person.id),status:result.error || (result.diagnostics?.rejected ? 'partial' : result.states.length ? 'collected' : 'empty'),count:result.states.length,source:'profile-output',diagnostics:result.diagnostics || null};
        if (selected) rec.characterStateCapture = completed;
        deps.storeStateEvent(rec,{outputIndex,swipeId,fingerprint,states:result.states,source:'profile-output',capture:completed},deps.STATE_HISTORY_LIMIT,deps.latestStateForChat(rec,deps.getContext().chat.slice(0,outputIndex),deps.stableFingerprint));
        await deps.persistChat();
        if (chatKey === deps.stateChatKey() && deps.pendingProfileStateRequests.has(requestId)) {
            deps.renderAll();
            notifyEmotionCapture(completed.status,completed.count,selected);
        }
    })().catch(error => {
        console.warn('[씬판독기] 출력 상태 판독 실패', error?.message || error);
        if(chatKey===deps.stateChatKey() && deps.pendingProfileStateRequests.has(requestId)) notifyEmotionCapture('save_failed');
    }).finally(()=>{ deps.pendingProfileStateRequests.delete(requestId); if (chatKey===deps.stateChatKey()) deps.renderCharacterTurnResults(); });
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
    if (deps.stateCollectorMode(rec?.preferences)!=='profile-output' || !deps.settings.reasonerProfileId) throw new Error('확장 연결모델을 선택하고 감정 판정을 켜 주세요.');
    if (rec?.lastJudgment?.sceneIntimacy?.route==='paused' || rec?.sceneIntimacy?.route==='paused') throw new Error('현재 장면에서는 감정 수집을 쉬고 있습니다.');
    const chat=deps.getContext().chat || [];
    const outputIndex=chat.findLastIndex((message,index)=>!message.is_user && !message.is_system && !(rec.nonRpOutputIndices||[]).includes(index));
    const text=String(chat[outputIndex]?.mes || '');
    if (!text.trim()) throw new Error('감정을 읽을 롤플 답변이 없습니다.');
    const entries=[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[]),...(rec.preferences?.allowUserImpersonation && deps.characterStore.persona?[deps.characterStore.persona]:[])];
    const judgment=rec.lastJudgment?.characterTrace?.length ? rec.lastJudgment : {characterTrace:entries.map(entry=>({id:entry.id,presence:'background'}))};
    const roster=deps.stateRoster(deps.characterStore,rec.preferences,judgment);
    if (!roster.length) throw new Error('감정을 읽을 참여 인물이 없습니다. 인물 기록과 판독 결과를 확인하세요.');
    // Explicit refresh also invalidates any prepared judgment made with older values.
    rec.characterStateRevision=(Number(rec.characterStateRevision)||0)+1;
    await scheduleProfileStateCollection({chatKey:deps.stateChatKey(),outputIndex,text,roster});
}
return {waitForProfileState, notifyEmotionCapture, scheduleProfileStateCollection, collectCurrentEmotion};
}
