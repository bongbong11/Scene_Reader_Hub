

export function createHydration(deps) {
async function hydrateServerState({ migrate = true } = {}) {
    const chatKey = deps.stateChatKey();
    deps.companionStorage?.chatLoading(chatKey);
    const sequence = ++deps.hydrateSequence;
    const current = () => sequence === deps.hydrateSequence && chatKey === deps.stateChatKey();
    const data = await deps.storagePost('bootstrap', { chatKey, legacyChatKey:deps.legacyStateChatKey?.() }, { allowFailure: true });
    if (!data || !current()) return false;
    if(Number(data.storageVersion)>0 && Number(data.storageVersion)<3) throw new Error('서버 플러그인을 0.8.0으로 교체하고 SillyTavern을 다시 시작하세요. 저장한 인물과 설정은 그대로 보관됩니다.');
    if (!migrate) {
        deps.jobs.invalidate();
        deps.stateHistoryCache.clear();
        deps.characterStore = deps.normalizeCharacterStore(null);
        deps.privateOwnerPrompt = '';
        deps.settings = { ...deps.DEFAULTS };
        deps.chatRecords.clear();
        delete deps.chat_metadata[deps.MODULE];
        deps.saveCustomWorlds([]);
        try { deps.localStorage.removeItem(deps.OWNER_PROMPT_STORAGE); deps.localStorage.removeItem(deps.OWNER_UNLOCK_STORAGE); } catch {}
        await deps.clearInjection();
        if (!current()) return false;
    }
    deps.storageVersion = Number(data.storageVersion) || 1;
    deps.serverKeyStatus = String(data.keyStatus || '저장된 키 없음');
    const legacyKey = deps.getSavedKey();
    if (migrate && !deps.serverKeyStatus.startsWith('저장됨') && legacyKey) {
        const migrated = await deps.storagePost('key', { key: legacyKey }, { allowFailure: true });
        if (!current()) return false;
        if (migrated?.keyStatus) {
            deps.serverKeyStatus = migrated.keyStatus;
            try { deps.localStorage.removeItem(deps.JEV_KEY_STORAGE); } catch { /* server copy is authoritative */ }
        }
    }
    deps.backupList = Array.isArray(data.backups) ? data.backups : [];
    const saved = data.settings && typeof data.settings === 'object' ? data.settings : {};
    if (saved.global && typeof saved.global === 'object') {
        deps.settings = { ...deps.DEFAULTS, ...saved.global };
        delete deps.settings.pauseOnOoc;
        for (const key of ['enabled', 'showChatIcon', 'autoJudge', 'showConfidence', 'ownerUnlocked', 'continuityEnabled']) if (typeof deps.settings[key] !== 'boolean') deps.settings[key] = deps.DEFAULTS[key];
        deps.settings.recentTurns = Math.max(1, Math.min(5, Number(deps.settings.recentTurns) || deps.DEFAULTS.recentTurns));
        deps.extension_settings[deps.MODULE] = deps.settings;
    } else if (migrate) await deps.saveServerSettings();
    if (!current()) return false;
    if (Array.isArray(saved.worlds)) deps.saveCustomWorlds(saved.worlds);
    if (saved.owner?.unlocked) deps.settings.ownerUnlocked = true;
    if (saved.owner && Object.hasOwn(saved.owner, 'prompt')) {
        deps.privateOwnerPrompt = String(saved.owner.prompt);
        try { deps.localStorage.removeItem(deps.OWNER_PROMPT_STORAGE); } catch { /* legacy cache cleanup */ }
    }
    if (data.chat && typeof data.chat === 'object') deps.chatRecords.set(chatKey, data.chat);
    else if (migrate && !data.migrated && deps.chat_metadata[deps.MODULE]) {
        const legacy = structuredClone(deps.chat_metadata[deps.MODULE]);
        await deps.saveServerChat(chatKey, legacy); deps.chatRecords.set(chatKey, legacy);
    } else deps.chatRecords.delete(chatKey);
    delete deps.chat_metadata[deps.MODULE];
    if (!current()) return false;
    const loadedChat = deps.chatRecords.get(chatKey);
    if (loadedChat) {
        const savedPreferences = loadedChat.preferences || {};
        const needsPreferenceMigration = savedPreferences.settingsContract !== 4 || !Object.hasOwn(savedPreferences, 'characterVolume');
        const normalizedChat = deps.record(true);
        if (needsPreferenceMigration) {
            normalizedChat.preferences.settingsContract = 4;
            normalizedChat.lastJudgment = null;
            if (!normalizedChat.pendingPlan?.outputText) normalizedChat.pendingPlan = null;
            await Promise.all([deps.saveServerChat(chatKey, normalizedChat), deps.clearInjection({chatKey,onlyIfOrphaned:true})]);
            if (!current()) return false;
        }
    }
    const history = Array.isArray(data.history) ? data.history.slice(-deps.STATE_HISTORY_LIMIT) : [];
    if (history.length || !migrate || data.migrated) {
        deps.stateHistoryCache.set(chatKey, history);
        if (!migrate) { await deps.saveStateHistory(history, chatKey); await deps.saveServerChat(chatKey, data.chat || null); }
    }
    else if (migrate) {
        const localHistory = await deps.loadStateHistory(chatKey);
        if (!current()) return false;
        if (localHistory.length) await deps.storagePost('history', { chatKey, value: localHistory }, { allowFailure: true });
    }
    if (!current()) return false;
    deps.characterStore = deps.normalizeCharacterStore(data.characters);
    deps.messageSnapshots.set(chatKey, deps.messageSnapshot(deps.getContext().chat));
    await deps.loadReasonerProfiles();
    if (!current()) return false;
    deps.companionStorage?.chatLoaded(chatKey);
    return true;
}
return {hydrateServerState};
}
