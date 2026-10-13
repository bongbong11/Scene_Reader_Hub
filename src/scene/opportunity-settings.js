import {advancedChance} from '../world/advanced-library.js';

export function normalizeChance(value,fallback=10) {
    const number=typeof value==='number'||typeof value==='string'&&value.trim()?Number(value):NaN;
    return Number.isFinite(number)?Math.max(0,Math.min(100,number)):fallback;
}

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
        eventEnabled:enabled,
        personEnabled:enabled,eventChance:advancedChance(preferences.advancedStyle),
        personChance:normalizeChance(preferences.appearanceChance),villainAllowed:Boolean(preferences.villainEnabled)};
}
