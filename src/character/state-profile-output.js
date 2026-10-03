import { withRequestLifetime } from '../adapters/request-lifetime.js';
import { parseProfileStates, STATE_MOODS } from "./state-contract.js";

export const PROFILE_STATE_SYSTEM = `Read the finished RP reply and return compact JSON only: {"states":[{"code":"C0","participation":"present","a":38,"c":60,"anger":0,"joy":25,"fear":0,"sadness":0,"targets":{"joy":"another person"}}]}. Example values are format examples only, never defaults. Check EVERY listed person independently, including later speakers. Determine participation from the completed output, not an earlier routing decision: actual speech, action or a live viewpoint establishes participation even without repeating their name. Pronouns may refer to the registered single main speaker. A multi-person card's author label alone does not establish participation of every member. For a nonparticipant return {"code":"C0","participation":"absent"} without scores. Current texts and phone calls count; memories, predictions, quoted past messages and unanswered outgoing messages do not. For each participating person assess ALL requestedFields independently; if no requestedFields is supplied assess ${STATE_MOODS.join(', ')} and, only when trackArousal is true, a and c. Return integer percentages 0-100. A zero means evaluated and no current evidence, not an omitted assessment. Do not omit zero moods. If an item truly cannot be assessed, omit only that item, retaining independently supported values. a is sexual arousal, c is self-control; never return them for a moods-only NPC. Ordinary feelings coexist with arousal, restraint and quiet conversation. Speech, actions, inner viewpoint, tone and relational reactions can support subtle feelings without explicit emotion words. Do not force nonzero scores or invent feelings from stereotypes. Never copy one person's values into another. Preset Scene_Info/status panel percentages are not a substitute for your own assessment of the RP; examine the narrative and actual viewpoint. Optional targets require clear individual evidence; never default to the user. Desire does not establish action, consent or relationship change.`;

// Optional background collector: reads completed RP with the saved connection
// profile. The main-output collector remains the default and makes no extra call.
export async function collectProfileOutputState({ request, service, profileId, output, roster, context = {messages:[]}, timeoutMs = 30000, signal }) {
    if (!service || !profileId || !roster.length) return { states: [], error: 'unavailable' };
    if (String(output || '').length > 24000) return { states: [], error: 'too_long' };
    try {
        const response = await withRequestLifetime(requestSignal=>request(service, profileId, PROFILE_STATE_SYSTEM + ' Recent RP context is background evidence for understanding this finished reply: read the earlier exchanges to resolve who is addressed, what provoked a feeling, and whether it persists or changed. Only return states supported by the listed person\'s actual expression in output. Never collect an absent person from context alone, copy an old numerical state, or carry a resolved feeling forward without current evidence. Consider every listed person and all four mood fields independently. A subtle feeling may be supported by speech, conduct or restraint; do not require explicit emotion words, and do not invent feelings from stereotypes. Do not copy example values.', {
                people: roster.map(({ code, name, trackArousal, requestedFields, singleMainSpeaker }) => ({ code, name, trackArousal, requestedFields, singleMainSpeaker })),
                recent_roleplay_context: context.messages,
                output: String(output || ''),
            }, { maxTokens:1200, timeoutMs, signal:requestSignal }),{signal,timeoutMs});
        if (!response) return { states: [], error: 'timeout' };
        const {states,diagnostics} = parseProfileStates(response.result?.states, roster,{completeMoods:true});
        const absent=(diagnostics.actors || []).filter(actor=>actor.rosterIndex>=0 && actor.reasons.includes('not_participating') && !actor.reasons.includes('duplicate_person'));
        diagnostics.absentCount=absent.length;
        diagnostics.rejected-=absent.length;
        diagnostics.absentIndices=absent.map(actor=>actor.rosterIndex);
        return { states, diagnostics, error: states.length || absent.length===roster.length || (!diagnostics.received && !diagnostics.reasons.length) ? '' : 'format' };
    } catch (error) { return { states: [], error: /TIMEOUT/.test(error?.code || '') ? 'timeout' : 'request', errorKind:error?.code || 'PROFILE_REQUEST_FAILED' }; }
}
