// Settings select directions; they do not establish an observed conflict.
export function negativeSettingsEnabled(settings = {}, privatePrompt = '') {
    return Boolean(settings.worldHostility || settings.relationshipDirection === 'hostile'
        || settings.npcToUser || settings.userMisfortune || settings.socialEnabled
        || settings.fightSustain || settings.villainEnabled || String(privatePrompt || '').trim());
}
