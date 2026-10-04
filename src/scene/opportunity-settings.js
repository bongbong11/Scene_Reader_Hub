// Older releases rebuild known preferences but retain extension fields on the
// chat record. Keep only the two new choices here so a downgrade/re-upgrade
// cannot silently turn a user's disabled generation setting back on.
export function restoreOpportunityPreferences(record,saved={}) {
    const retained=record.opportunityPreferences||{};
    const enabled=Object.hasOwn(saved,'newGenerationEnabled')?saved.newGenerationEnabled:retained.newGenerationEnabled;
    const mode=Object.hasOwn(saved,'spontaneousMode')?saved.spontaneousMode:retained.spontaneousMode;
    record.opportunityPreferences={newGenerationEnabled:enabled!==false,
        spontaneousMode:['off','event','person','both'].includes(mode)?mode:'off'};
    Object.assign(record.preferences,record.opportunityPreferences);
}

export function opportunitySettings(preferences={}) {
    const spontaneousMode=['off','event','person','both'].includes(preferences.spontaneousMode)?preferences.spontaneousMode:'off';
    const enabled=preferences.newGenerationEnabled!==false;
    const eventSpontaneous=['event','both'].includes(spontaneousMode);
    const personSpontaneous=['person','both'].includes(spontaneousMode);
    return {enabled,spontaneousMode,eventSpontaneous,personSpontaneous,
        eventEnabled:enabled&&(Boolean(preferences.advancedEnabled)||eventSpontaneous),
        personEnabled:enabled,eventChance:({conservative:18,balanced:35,active:58,very_active:75})[preferences.advancedStyle]??35,
        personChance:Math.max(1,Math.min(100,Number(preferences.appearanceChance)||10)),villainAllowed:Boolean(preferences.villainEnabled)};
}
