

export function createSessionRepository(deps) {
async function saveServerChat(chatKey = deps.stateChatKey(), value = deps.record()) {
    // A failed write must not permanently block retries for an already loaded store.
    const loaded=deps.storageVersion>=2 && (deps.chatReadyKey===undefined || deps.chatReadyKey===chatKey);
    if (!deps.serverStoreAvailable && !loaded) throw new Error('서버 저장소 연결이 끊겨 저장하지 못했습니다. 채팅을 다시 불러온 뒤 저장하세요.');
    const snapshot = structuredClone(value);
    await deps.queueWrite(`session:${chatKey}`, () => deps.storagePost('chat', { chatKey, value: snapshot }));
}

async function saveSession(chatKey, chat, history) {
    const snapshot = structuredClone(chat);
    const limited = structuredClone(history.slice(-deps.STATE_HISTORY_LIMIT));
    if (deps.storageVersion < 2) throw new Error('서버 플러그인을 0.7.0으로 업데이트한 뒤 다시 시작하세요.');
    const previousChat = deps.chatRecords.get(chatKey), previousHistory = deps.stateHistoryCache.get(chatKey);
    const working = structuredClone(snapshot), workingHistory = structuredClone(limited);
    // Publish before waiting: later edits must start from this state, and a late
    // response must never replace those newer edits with the queued snapshot.
    deps.chatRecords.set(chatKey, working);
    deps.stateHistoryCache.set(chatKey, workingHistory);
    const saving = deps.queueWrite(`session:${chatKey}`, () => deps.storagePost('transaction', {chatKey, chat:snapshot, history:limited}));
    const clearing = snapshot?.lastJudgment ? null : deps.clearInjection({chatKey,onlyIfOrphaned:true});
    const [saved, cleared] = await Promise.allSettled([saving, clearing]);
    if (saved.status === 'rejected') {
        if (deps.chatRecords.get(chatKey) === working && JSON.stringify(working) === JSON.stringify(snapshot)) {
            if (previousChat === undefined) deps.chatRecords.delete(chatKey); else deps.chatRecords.set(chatKey, previousChat);
        }
        if (deps.stateHistoryCache.get(chatKey) === workingHistory && JSON.stringify(workingHistory) === JSON.stringify(limited)) {
            if (previousHistory === undefined) deps.stateHistoryCache.delete(chatKey); else deps.stateHistoryCache.set(chatKey, previousHistory);
        }
        throw saved.reason;
    }
    if (cleared.status === 'rejected') throw cleared.reason;
}

async function saveCharacterStore(chatKey = deps.stateChatKey(), value = deps.characterStore) {
    if (deps.chatReadyKey !== undefined && deps.chatReadyKey !== chatKey) throw new Error('현재 채팅의 인물 저장 상태를 읽지 못해 저장을 중단했습니다. 채팅을 다시 열어 주세요.');
    const loaded = deps.chatReadyKey === chatKey && deps.storageVersion >= 2;
    if (!deps.serverStoreAvailable && !loaded) throw new Error('씬판독기 서버 저장소에 연결되지 않았습니다.');
    const snapshot = structuredClone(value);
    snapshot.updatedAt = new Date().toISOString();
    await deps.queueWrite(`characters:${chatKey}`, () => deps.storagePost('characters', { chatKey, value: snapshot }));
}
return {saveServerChat,saveSession,saveCharacterStore};
}
