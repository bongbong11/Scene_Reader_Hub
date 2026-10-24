import {negativeSettingsEnabled} from '../decision/negative-settings.js';

// Only decide delivery. No additional model verdict or admission threshold.
export function conflictExecutionEnabled(settings, decisions, {legacyConflict=false, privatePrompt='', villainProfile=null, antagonistActors=[], eventActors=[]} = {}) {
    // Preserve the established base path when every negative/conflict setting is off.
    if (!negativeSettingsEnabled(settings, privatePrompt)) return Boolean(legacyConflict);
    return decisions.conflict_state === 'active' || decisions.fight_sustain === 'yes'
        || decisions.primary_focus === 'conflict' || decisions.secondary_focus === 'conflict'
        || Boolean(villainProfile && ['create','replace','continue'].includes(decisions.villain_route))
        || antagonistActors.length > 0
        || decisions.npc_route === 'reuse' && decisions.npc_weight !== 'background' && ['opposition','exploiter'].includes(decisions.npc_role)
        || eventActors.some(actor => actor.kind !== 'unresolved' &&
            (actor.kind === 'new' && actor.antagonist || ['argument','threat','physical','obstruction'].includes(actor.action)));
}
