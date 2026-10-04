export const COMMON_EXECUTION = `Silent scene directions for this IC response. Do not quote, name or discuss these directions.
Respond to the present interaction through character-consistent speech, thought, decision or action. Treat the user's input as already established instead of recapping it. Keep that response as the base while carrying out each explicitly selected addition below.
An addition marked EXECUTE_NOW must start as an observable action, interaction or changed condition in this response. Do not replace it with intention, a vague sign, atmosphere, a possible future event, or an invitation to choose whether the event should exist. The event starting does not imply that it succeeds or is resolved.
Keep the current scene coherent. When an event and a person can share a cause, let the person participate in that event. Otherwise keep both proportionate; do not invent a connection, extra independent subplot, forced scene cut or time skip. Supported relationship expression belongs within these actions and does not erase them.
Do not decide the user's speech, actions, thoughts, consent, feelings or choices. Stop at the part that actually requires their response, after the non-user action or environmental change has occurred. Preserve established characterization, world rules, access, knowledge, injuries and consequences. No generic directive authorizes contradicting a hard fact.
Use the main prompt's language, genre, prose style, pacing and applicable boundaries. These instructions supply scene actions, not a new writing style. Do not output a checklist or mechanically cover every prompt field.`;

export const BASE_RESPONSE = `Respond specifically to the current interaction without rephrasing the input. If no addition is selected, a meaningful direct response alone is sufficient. If an addition is selected, respond and execute that addition in the same continuation; do not interpret direct response as a ban on it.`;
export const DEVELOPMENT = {
  static:'Keep selected additions small and close to the current exchange. Show one definite change and the relevant reaction; do not reduce the addition to a warning or omit it. Give room to character-specific feelings without imposing relationship change.',
  balanced:'Weave selected additions into the current exchange with one definite action and its immediate effect. Preserve room for the other participant without losing the selected action.',
  dynamic:'Make the selected addition produce a clear immediate action, changed access or practical consequence. Do not inflate stakes, finish the whole matter or force travel simply to appear dynamic.',
};
export const DIRECTIONS = {
  natural:'Use a plausible favorable, neutral, mixed or adverse outcome shaped by the current setting. Do not attach a price, threat or hidden betrayal to every small opportunity.',
  positive:'Prefer a fitting practical benefit, pleasant discovery, welcome contact or small success. Preserve established conflict and independent motives; do not guarantee success, trust or romance.',
  hostile:'Use a proportionate adverse choice, obstacle or practical consequence where the enabled setting calls for it. Do not make every arrival violent, omniscient or arbitrarily powerful.',
  negativePriority:'Where individually enabled negative constraints conflict with a favorable option, use the compatible adverse or mixed form. Priority alone enables no new constraint. Preserve explicit boundaries and factual limits.',
};
export const KEEP_ONGOING_EVENT = `The stored central event remains in progress. Let this addition change one local circumstance within that event or current interaction. Do not replace its goal, erase consequences, or create another persistent central event.`;
export const COMBINE_ADDITIONS = `Both additions are selected. When their access, setting and purpose genuinely fit, let the selected person perform or respond to the selected event, keeping one shared scene. If they are unrelated, execute each briefly without inventing shared history or dropping either. Neither addition requires immediate resolution.`;
export const PERSON_EXECUTION = `Introduce the selected person through the specified valid route and one actual interaction. Give them their own immediate purpose and one readable action or line of speech that has an effect. Being brief does not mean remaining unseen, only being mentioned, or asking the user to invent the entrance. Keep knowledge bounded by direct perception and established role competence. Retain the person’s identity after their arrival is verified; do not turn an existing person into someone new.`;
export const ANTAGONIST_EXECUTION = `The selected arrival is an antagonist. Express the selected immediate interest through one concrete, proportionate opposed move. Resistance may be social, practical or procedural; it need not be violence. Use only available access and means. Do not create prior fixation, attraction, intimacy, secret knowledge, automatic success or user helplessness. A private room is not permission to materialize inside it.`;
export const NORMAL_EVENT_EXECUTION = `Connect the selected action to the current activity, established objective, world condition or unresolved consequence. Execute its first material step now; it need not be urgent or indispensable. Do not invent a past cause to justify it.`;
export const SPONTANEOUS_EVENT_EXECUTION = `The selected small happening may begin through ordinary plausible chance without prior foreshadowing. Make its concrete action or changed condition occur now, then show an immediate non-user response where appropriate. Do not substitute generic unease, a ringing phone, an unexplained knock or an arrival merely because a fresh development was requested. Use only the selected package and established setting.`;
export const PERSON_MODE = {
  normal:'Connect this entrance to the ongoing activity or a person with a present practical reason to be here. An ordinary role and access are enough; the arrival need not solve the story.',
  spontaneous:'A plausible coincidental encounter or routine arrival is permitted even without prior narrative setup. Establish the new interaction now without inventing a past relationship.',
};

export function renderAddition(candidate,{kind,spontaneous=false,style='balanced',direction='natural',ongoing=false,antagonist=false}={}) {
  if(!candidate || !['event','person'].includes(kind))throw new Error('INVALID_ADDITION');
  const local=kind==='event'?(spontaneous?SPONTANEOUS_EVENT_EXECUTION:NORMAL_EVENT_EXECUTION):`${PERSON_EXECUTION}\n${PERSON_MODE[spontaneous?'spontaneous':'normal']}\n${antagonist?ANTAGONIST_EXECUTION:''}`;
  return [`<SCENE_ADDITION kind="${kind}" action="EXECUTE_NOW">`,local,
    `Access and prerequisites: ${candidate.condition}`,
    `Selected action: ${candidate.action}`,`Required immediate effect: ${candidate.effect}`,
    DEVELOPMENT[style]||DEVELOPMENT.balanced,DIRECTIONS[direction]||DIRECTIONS.natural,
    ongoing&&kind==='event'?KEEP_ONGOING_EVENT:'','Leave the user-dependent response and the later outcome open.','</SCENE_ADDITION>'].filter(Boolean).join('\n');
}

export function renderAdvancedEvent(profile,{move='seed',ongoing=false,style='balanced',direction='natural'}={}) {
  // profile is a validated trusted catalog/profile value, not arbitrary model text.
  const actions={seed:'Execute the first concrete occurrence of this event now; it must change an immediate circumstance. The entire objective remains open.',advance:'Execute one causal step toward or against the active objective.',obstacle:'Make one bounded obstacle actually affect the available approach.',reveal:'Reveal one limited actionable fact through an available source.',contact:'Make actual contact through established means and access.',attack:'Execute one supported hostile move with available means; do not dictate the user response or its success.',aftermath:'Show one actual consequence of the established result without fabricating closure.'};
  if(move==='quiet')return '';
  return ['<ADVANCED_PROGRESSION action="EXECUTE_NOW">',`Event direction: ${profile.prompt}`,
    `Use this trigger only if its prerequisites are supported: ${profile.trigger}`,
    `Open objective: ${profile.goal}`,`Bounded practical stake: ${profile.pressure}`,
    actions[move]||actions.advance,DEVELOPMENT[style]||DEVELOPMENT.balanced,DIRECTIONS[direction]||DIRECTIONS.natural,ongoing?KEEP_ONGOING_EVENT:'',
    'Keep unsupported details unspecified. Do not invent a missing prerequisite, new private knowledge, or a new featured person to force the template. Use established actors, environmental causes or anonymous background; background people do not become recurring NPCs. Only the separately selected person addition authorizes one new featured arrival.','</ADVANCED_PROGRESSION>'].filter(Boolean).join('\n');
}
