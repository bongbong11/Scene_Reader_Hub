import {OLD_PLACEMENT_KEYS,PLACEMENT_KEY} from './injection-placement.js';
import {normalizeSeasonalReferences} from '../world/seasonal.js';
// Only explicitly retired Hub-owned fields. World calendars and user documents are not junk.
const RETIRED_GLOBAL=['continuityInterval','collectPersonaChanges','characterReviewPrompt','pauseOnOoc','jevProvider'];
export function cleanGlobalSettings(settings) {
    if(!settings||typeof settings!=='object')return false;
    let changed=false;
    for(const key of RETIRED_GLOBAL)if(Object.hasOwn(settings,key)){delete settings[key];changed=true;}
    if(settings[PLACEMENT_KEY]?.retired){
        if(Object.hasOwn(settings,'characterMacroEnabled')){delete settings.characterMacroEnabled;changed=true;}
        const common=settings.commonPreferences;
        if(common&&OLD_PLACEMENT_KEYS.some(key=>Object.hasOwn(common,key))){settings.commonPreferences=Object.fromEntries(Object.entries(common).filter(([key])=>!OLD_PLACEMENT_KEYS.includes(key)));changed=true;}
    }
    return changed;
}
export function cleanSeasonalSettings(record) {
    const prefs=record?.preferences;
    if(!prefs||!Array.isArray(prefs.seasonalReferences))return false;
    const next=normalizeSeasonalReferences(prefs.seasonalReferences);
    if(JSON.stringify(next)===JSON.stringify(prefs.seasonalReferences))return false;
    prefs.seasonalReferences=next;
    record.lastJudgment=null;
    if(!record.pendingPlan?.outputText)record.pendingPlan=null;
    return true;
}

