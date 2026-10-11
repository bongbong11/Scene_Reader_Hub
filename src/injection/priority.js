export function negativePriorityInstruction(settings = {}, privatePrompt = '') {
    const enabled = settings.worldHostility || settings.relationshipDirection === 'hostile' || settings.npcToUser || settings.userMisfortune || String(privatePrompt).trim();
    return settings.negativePriority && enabled
        ? 'Apply the enabled original negative-bias directives with priority over generic relationship, event, NPC, and pacing guidance. Do not soften their required conduct into courtesy, atmosphere, or inner monologue.\n'
        : '';
}
