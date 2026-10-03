import { withRequestLifetime } from '../adapters/request-lifetime.js';
import { parseProfileStates, STATE_MOODS } from "./state-contract.js";

const PROFILE_STATE_SYSTEM = `Read the finished RP reply and return compact JSON only: {"states":[{"code":"C0","a":38,"c":60,"anger":25,"targets":{"anger":"Dante"}}]}. Check every listed person independently, including later speakers. Judge only listed characters who actually speak, act, or have a viewpoint in this reply. Never copy one person's values or allowed fields into another person's object. a is sexual arousal, c is self-control, both 0-100 and required only when trackArousal is true. Optional mood fields: ${STATE_MOODS.join(', ')}; omit zero moods. Add an optional target by feeling only when explicit, even if the target is offscene. Do not infer unexpressed thoughts from model knowledge. Current incoming texts and phone-call replies count as participation without physical presence. A memory, imagined reaction, predicted feeling, quoted past message, or merely receiving an unanswered message does not establish that person's current state. Read only what their actual current expression supports. Do not treat desire as action, consent, or relationship change. Return {"states":[]} when no eligible person appears.`;

// Optional background collector: reads completed RP with the saved connection
// profile. The main-output collector remains the default and makes no extra call.
export async function collectProfileOutputState({ request, service, profileId, output, roster, context = {messages:[]}, timeoutMs = 30000, signal }) {
    if (!service || !profileId || !roster.length) return { states: [], error: 'unavailable' };
    if (String(output || '').length > 24000) return { states: [], error: 'too_long' };
    try {
        const response = await withRequestLifetime(requestSignal=>request(service, profileId, PROFILE_STATE_SYSTEM + ' Recent RP context is background evidence for understanding this finished reply: read the earlier exchanges to resolve who is addressed, what provoked a feeling, and whether it persists or changed. Only return states supported by the listed person\'s actual expression in output. Never collect an absent person from context alone, copy an old numerical state, or carry a resolved feeling forward without current evidence. Consider every listed person and all four mood fields independently. A subtle feeling may be supported by speech, conduct or restraint; do not require explicit emotion words, and do not invent feelings from stereotypes. Do not copy example values.', {
                people: roster.map(({ code, name, trackArousal }) => ({ code, name, trackArousal })),
                recent_roleplay_context: context.messages,
                output: String(output || ''),
            }, { maxTokens:1200, timeoutMs, signal:requestSignal }),{signal,timeoutMs});
        if (!response) return { states: [], error: 'timeout' };
        const {states,diagnostics} = parseProfileStates(response.result?.states, roster);
        return { states, diagnostics, error: states.length || (!diagnostics.received && !diagnostics.reasons.length) ? '' : 'format' };
    } catch (error) { return { states: [], error: /TIMEOUT/.test(error?.code || '') ? 'timeout' : 'request', errorKind:error?.code || 'PROFILE_REQUEST_FAILED' }; }
}
