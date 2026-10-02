import { parseProfileStates, STATE_MOODS } from "./state-contract.js";

const PROFILE_STATE_SYSTEM = `Read the finished RP reply and return compact JSON only: {"states":[{"code":"C0","a":38,"c":60,"anger":25,"targets":{"anger":"Dante"}}]}. Judge only listed characters who actually speak, act, or have a viewpoint in this reply. a is sexual arousal, c is self-control, both 0-100 and required only when trackArousal is true. Optional mood fields: ${STATE_MOODS.join(', ')}; omit zero moods. Add an optional target by feeling only when explicit, even if the target is offscene. Do not infer unexpressed thoughts from model knowledge. Current incoming texts and phone-call replies count as participation without physical presence. A memory, imagined reaction, predicted feeling, quoted past message, or merely receiving an unanswered message does not establish that person's current state. Read only what their actual current expression supports. Do not treat desire as action, consent, or relationship change. Return {"states":[]} when no eligible person appears.`;

// Optional background collector: reads completed RP with the saved connection
// profile. The main-output collector remains the default and makes no extra call.
export async function collectProfileOutputState({ request, service, profileId, output, roster, timeoutMs = 30000 }) {
    if (!service || !profileId || !roster.length) return { states: [], error: 'unavailable' };
    let timer;
    try {
        const response = await Promise.race([
            request(service, profileId, PROFILE_STATE_SYSTEM, {
                people: roster.map(({ code, name, trackArousal }) => ({ code, name, trackArousal })),
                output: String(output || '').slice(-12000),
            }, { maxTokens: 1200 }),
            new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
        ]);
        if (!response) return { states: [], error: 'timeout' };
        const {states,diagnostics} = parseProfileStates(response.result?.states, roster);
        return { states, diagnostics, error: states.length || (!diagnostics.received && !diagnostics.reasons.length) ? '' : 'format' };
    } catch { return { states: [], error: 'request' }; }
    finally { clearTimeout(timer); }
}
