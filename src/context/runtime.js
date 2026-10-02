// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createContextRuntime(deps) {
function recentContext(pendingUserText = '') {
    const context = deps.getContext();
    const chat = deps.filterNonRpHistory(context.chat, deps.record()?.nonRpOutputIndices || [], pendingUserText);
    return deps.buildRecentContext({ chat, pendingUserText, turnCount: deps.settings.recentTurns, maxChars: deps.MAX_TRANSCRIPT_CHARS, userName: context.name1, characterName: context.name2 });
}

function currentInputKey(pendingUserText = '', cycleSalt = '') { return deps.buildInputKey(deps.getContext().chat, pendingUserText, cycleSalt); }
return {recentContext, currentInputKey};
}
