import {LEGACY_PROMPTS as L} from './legacy-prompts.js';

export function negativeContext(preferences={}){
    const originals={};
    if(preferences.relationshipDirection==='hostile')originals.CHARACTER_TO_USER_DEFAULT=L.CHARACTER_TO_USER_DEFAULT;
    if(preferences.worldHostility)originals.WORLD_HOSTILITY=L.WORLD_HOSTILITY;
    if(preferences.npcToUser)originals.NPC_TO_USER_DEFAULT=L.NPC_TO_USER_DEFAULT;
    if(preferences.userMisfortune)originals.USER_MISFORTUNE=L.USER_MISFORTUNE;
    if(!Object.keys(originals).length)return {};
    return {active_negative_directives:{originals,priority:Boolean(preferences.negativePriority),scope:'Apply each original only to its named actors and scope when choosing the next direction. Observations still describe established facts. Preserve existing affection and grievances; helpful conduct is not automatically forgiveness or increased attachment. Character-to-user emotional change must use the causes specified in that original, not merely the assistant repeating its own affectionate behavior. A repair attempt is not acceptance. These directives guide routing, not an additional permission test or a prose style.'}};
}
