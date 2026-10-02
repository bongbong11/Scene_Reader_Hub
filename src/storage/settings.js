

export function createSettingsRepository(deps) {
function settingsSnapshot() {
    return {
        global: { ...deps.settings },
        worlds: deps.loadCustomWorlds(),
        owner: { unlocked: deps.ownerUnlocked(), prompt: deps.ownerPrompt() },
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
    };
}

async function saveServerSettings() {
    if (!deps.serverStoreAvailable) throw new Error('서버 저장소 연결이 끊겨 저장하지 못했습니다. 다시 연결한 뒤 저장하세요.');
    const snapshot = structuredClone(settingsSnapshot());
    await deps.queueWrite('settings', () => deps.storagePost('settings', { settings: snapshot }));
}
return {settingsSnapshot,saveServerSettings};
}
