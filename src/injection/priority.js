export function negativePriorityInstruction(settings = {}, privatePrompt = '', decisions = {}) {
    const enabled = settings.worldHostility || settings.relationshipDirection === 'hostile' || settings.npcToUser || settings.userMisfortune || String(privatePrompt).trim()
        || settings.socialEnabled && decisions.npc_autonomy==='yes' || decisions.fight_sustain==='yes';
    return settings.negativePriority && enabled
        ? 'Apply the enabled original negative-bias directives with priority over generic relationship, event, NPC, and pacing guidance. Do not soften their required conduct into courtesy, atmosphere, or inner monologue.\n'
        : '';
}
