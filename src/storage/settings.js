

import {cleanGlobalSettings} from './obsolete-settings.js';
export function createSettingsRepository(deps) {
function settingsSnapshot() {
    const global={...deps.settings};cleanGlobalSettings(global);
    return {
        global,
        worlds: deps.loadCustomWorlds(),
        owner: { unlocked: deps.ownerUnlocked(), prompt: deps.ownerPrompt() },
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
    };
}

async function saveServerSettings() {
    // Availability is the last request's observation, not a permanent write lock.
    // The transport owns timeouts and will report a still unavailable server.
    const snapshot = structuredClone(settingsSnapshot());
    await deps.queueWrite('settings', () => deps.storagePost('settings', { settings: snapshot }));
}
return {settingsSnapshot,saveServerSettings};
}
