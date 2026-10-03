// Read the active host order without modifying presets or evaluating macros.
export function activePresetPrompts(host = {}, context = {}) {
    const manager = host.promptManager || context.promptManager;
    const settings = manager?.serviceSettings || host.oai_settings || context.chatCompletionSettings || context.oaiSettings || context.oai_settings;
    if (!Array.isArray(settings?.prompts)) return [];
    const active = manager?.activeCharacter;
    let order;
    if (active && typeof manager.getPromptOrderForCharacter === 'function') order = manager.getPromptOrderForCharacter(active);
    else {
        const id = active?.id ?? context.characterId;
        const lists = settings.prompt_order || [];
        order = (lists.find(item => String(item.character_id) === String(id)) || lists.find(item => String(item.character_id) === '100001'))?.order;
    }
    return (order || []).flatMap(entry => {
        const prompt = settings.prompts.find(item => item.identifier === entry.identifier);
        if (!prompt || prompt.marker) return [];
        return [{identifier:prompt.identifier, name:prompt.name || prompt.identifier, role:prompt.role || 'system', content:String(prompt.content || ''), enabled:entry.enabled === true}];
    });
}

export function normalizePresetSlot(value) {
    return {identifier:typeof value?.identifier === 'string' ? value.identifier : 'main', side:value?.side === 'before' ? 'before' : 'after'};
}
