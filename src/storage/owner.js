// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createOwnerStorage(deps) {
function ownerUnlocked() {
    if (deps.settings?.ownerUnlocked === true) return true;
    try { return deps.localStorage.getItem(deps.OWNER_UNLOCK_STORAGE) === 'yes'; }
    catch { return false; }
}

function ownerPrompt() {
    if (deps.privateOwnerPrompt) return deps.privateOwnerPrompt;
    if (!ownerUnlocked()) return '';
    try { return String(deps.localStorage.getItem(deps.OWNER_PROMPT_STORAGE) || '').trim(); }
    catch { return ''; }
}

function getSavedKey() {
    try { return String(deps.localStorage.getItem(deps.JEV_KEY_STORAGE) || '').trim(); } catch { return ''; }
}

function maskKey(key) {
    if (!key) return '저장된 키 없음';
    return `저장됨 ····${key.slice(-4)}`;
}
return {ownerUnlocked, ownerPrompt, getSavedKey, maskKey};
}
