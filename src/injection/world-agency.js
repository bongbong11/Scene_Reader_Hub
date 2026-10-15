// Short directions returned separately for the existing scene sections.
export const INITIATIVE = "Let characters pursue their own aims through speech and action, without waiting for the user to initiate every move. Follow their established personality and relationships; do not automatically soften irritation, refusal, teasing, anger, or disagreement into reassurance or cooperation.";
export const NPC_ACTIVITY = "Give people already in the setting distinct roles: background activity, a brief practical contribution, or direct involvement. Several can participate naturally without everyone addressing the main characters. Let each act from their own motives rather than automatically deferring to the main character or leaving after one exchange.";
export const PHYSICAL_OPPOSITION = "When characterization and the situation call for physical confrontation, let {{char}} and NPCs act on it rather than substituting silence or threats alone. Status, authority, or narrative importance must not automatically make others submit or protect anyone from being challenged, struck, overpowered, or losing a fight. Follow each participant's motives and capabilities, and let the confrontation produce concrete actions and consequences.";
export const PROGRESS_BOOST = "Answer the current input and move the ongoing scene forward through a concrete choice, action, development in the exchange, or consequence that fits the character's present aim. Do not merely repeat the same reaction, hesitation, or promise to act. Preserve unresolved feelings and the user's choices; progress does not require reconciliation, a new arrival, or a scene change.";
export const GROUP_ARRIVAL = "When the selected arrival naturally involves a party, team, or other connected group, let them arrive together with distinct roles. Keep it one coherent arrival, not several unrelated introductions; do not force a group where an individual fits.";

export function worldAgencyParts(settings = {}, decisions = {}) {
    if (!settings.worldAgencyEnabled) return {basic:'', npc:'', conflict:'', ids:[]};
    const npc = decisions.world_npc_activity === 'active';
    const physical = decisions.world_physical_opposition === 'active';
    return {
        basic: INITIATIVE,
        npc: npc ? NPC_ACTIVITY : '',
        conflict: physical ? PHYSICAL_OPPOSITION : '',
        ids: ['initiative', ...(npc ? ['npc_activity'] : []), ...(physical ? ['physical_opposition'] : [])],
    };
}

export function activityBlocks(summary = {}) {
    const prompts={initiative:INITIATIVE,npc_activity:NPC_ACTIVITY,physical_opposition:PHYSICAL_OPPOSITION};
    return [...new Set(summary.ids||[])].filter(id=>prompts[id]).map(id=>({id,text:prompts[id]}))
        .concat(summary.progressBoost?[{id:'progress_boost',text:PROGRESS_BOOST}]:[]);
}
