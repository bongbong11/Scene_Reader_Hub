// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createStorageIdentity(deps) {
function getContext() {
    return deps.SillyTavern.getContext();
}

function stateChatKey() {
    const context = getContext();
    const avatar = context.characters?.[context.characterId]?.avatar;
    const owner = context.groupId ? `group:${context.groupId}` : avatar ? `character-avatar:${avatar}` : `character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    return `${owner}|chat:${context.chatId || 'unsaved'}`;
}

function legacyStateChatKey() {
    const context=getContext();
    const owner=context.groupId?`group:${context.groupId}`:`character:${context.characterId ?? context.name2 ?? 'unknown'}`;
    return `${owner}|chat:${context.chatId || 'unsaved'}`;
}
return {getContext, stateChatKey, legacyStateChatKey};
}
