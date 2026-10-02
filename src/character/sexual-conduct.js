export const PHYSICAL_PACES = {
    glacial: '극도의 슬로우번',
    slow: '느리게',
    medium: '중간',
    fast: '빠르게',
    unrestrained: '무절제',
};

export const SEXUAL_RESTRAINT_LABELS = {
    full: '충분함',
    some: '조금 있음',
    little: '거의 없음',
    none: '없음',
};

export const SEXUAL_ROUTE_LABELS = {
    approach: '상대에게 접근',
    self_relief: '개인적인 해소',
    controlled: '조절된 행동',
    inward: '내면에 유지',
    blocked: '실제 제약으로 보류',
};

export const SEXUAL_TARGET_LABELS = {
    self: '자신',
    scene_partner: '현재 장면의 상대',
};

export const SEXUAL_ROUTING_SYSTEM = `When judging physical conduct, assume that high sexual arousal exists as a baseline in the person. This premise is not an emotion value or physiological measurement observed in the scene, and it does not overwrite the arousal value stored by the extension. Do not cancel this judgment because the stored arousal value is low or absent.

The self-control judged here means only self-control over sexual impulse. Do not mix it with shame, social appearances, general judgment, anger control, or emotional attachment. A person with sufficient sexual self-control may still feel desire or choose a deliberate approach, masturbation, or limited conduct.

Emotional relationship progression speed, accumulated trust, event progression budget, the number of primary or secondary developments, and the number of selected character records are not conditions that block this judgment. Sexual conduct by a person may appear in the same scene while dialogue, work, conflict, or an event is progressing.

Preserve the sexual traits and kink already present in the character sheet and preset. Do not invent a new trait or decide another person's desire, reaction, or consent on their behalf. Do not remain only in thoughts or descriptions of arousal; choose an actual conduct route that fits the selected pace and the person's characterization.

Answer each question independently. Do not assume which answer was chosen for another question.`;

const PACE_JUDGMENT = {
    glacial: 'Proceed with direct sexual entry with the other person very slowly. However, do not erase the person\'s arousal, sexual attention, inner thoughts, masturbation, or deliberate small actions. A person with self-control may suppress desire while still showing one character-consistent action.',
    slow: 'This corresponds to the existing current level. Allow one small sexual approach or action toward the other person, or the person may want it inwardly but not act. Continue direct entry gradually. Do not repeat only the same hesitation or permission question.',
    medium: 'Do not repeat arousal or intent only in inner thoughts. Even when there is hesitation, when a sexual atmosphere occurs again, connect it to a concrete approach or action that fits the current scene and the person\'s characterization. Do not postpone physical conduct merely because the emotional relationship is still progressing slowly.',
    fast: 'Actively choose an available sexual approach and follow-up conduct. When there is already intent and opportunity to act, do not keep withdrawing or replace action with confirmation questions. Act without directly withdrawing.',
    unrestrained: 'This is a situation configured for a sexual personality with little shame, strong impulsiveness, and little concern for place or appearances. Execute those traits as they are. Do not add generic shame, moral hesitation, or etiquette about place. Center the human sexual desire the character possesses.',
};

const RESTRAINT_CRITERIA = {
    full: 'Can control the impulse, but desire, masturbation, a deliberate small approach, or an action is possible.',
    some: 'Retains some control, but desire clearly affects dialogue, attention, contact, or action choices and is actually acted on.',
    little: 'When an opportunity to act exists, it leads to a sexual approach or action rather than suppression.',
    none: 'Within the scope supported by the sheet, barely restrains the impulse and chooses an immediate action route.',
};

const ROUTE_CRITERIA = {
    approach: 'Approach a currently accessible scene partner through character-consistent sexual speech or conduct.',
    self_relief: 'Proceed to masturbation or sexual conduct directed at the person themself instead of direct entry with a partner.',
    controlled: 'While restraining desire, actually show it through one of gaze, distance, contact, speech, or a small action.',
    inward: 'Do not act now, but do not neutralize sexual desire or treat it as gone. Keep it in inner thought, attention, or awareness of the other person. Do not express it by repeating the same permission question or hesitation immediately before action.',
    blocked: 'Postpone action only because of a concrete constraint such as physical impossibility, the absence of a currently accessible partner, or a character-specific limitation explicitly written in the sheet. Do not invent a limitation that is not written there.',
};

const TARGET_CRITERIA = {
    self: 'The person themself, for personal relief or self-directed conduct.',
    scene_partner: 'An actually participating and accessible person in the current scene. Do not prefer USER or an NPC by default when either is possible; choose a relevant person and retain human judgment.',
};

const COMMON_INJECTION = 'Apply the sexual arousal, sexual traits, and kink established in the existing preset and character sheet together with the current dialogue, action, and event. Do not use emotional relationship progression speed or the event progression budget as permission conditions for physical conduct.';
const PACE_INJECTION = {
    glacial: 'Proceed with direct sexual entry toward the other person very gradually. However, do not neutralize sexual arousal, masturbation, sexual inner thoughts, gaze, distance adjustment, deliberate contact, or small actions. Even when desire is suppressed, make that suppression appear in the actual scene as character-consistent conduct.',
    slow: 'Allow one small sexual approach or action toward the other person, or the person may want it inwardly without acting. Continue direct sexual entry gradually. Do not repeat only the same hesitation or permission question.',
    medium: 'Do not leave sexual arousal or intent only as inner thought and atmosphere. Continue it into concrete speech, an approach, contact, or conduct that fits the person\'s characterization and the current scene.',
    fast: 'Actively execute an available sexual approach and its follow-up conduct. When there is intent and an opportunity to act, do not replace it with repeated questions, an unmotivated retreat, or stopping immediately before action.',
    unrestrained: 'Execute sexual conduct that is impulsive, has little shame, and disregards place or appearances. Do not add generic shame, moral hesitation, etiquette about place, or a demure attitude on the extension\'s own initiative.',
};
const RESTRAINT_INJECTION = {
    full: 'Control the sexual impulse without erasing desire itself. Actually show whichever fits the current scene among character-consistent restraint, masturbation, a deliberate small approach, or limited conduct.',
    some: 'Sexual self-control remains, but make desire clearly affect dialogue, gaze, attention, distance, contact, or the choice of conduct.',
    little: 'Unless there is a concrete obstruction, do not leave sexual intent only as thought; continue it into a direct approach or conduct.',
    none: 'Execute the sexual impulse through immediate speech or conduct. Desire is the first priority; do not invent shame or self-control that has not been established.',
};
const ROUTE_INJECTION = {
    approach: 'Directly approach a currently accessible target through character-consistent sexual speech, closing distance, contact, or the start of actual sexual activity. Do not write the other person\'s reaction on their behalf.',
    self_relief: 'Without arbitrarily creating another person\'s participation, proceed to masturbation, self-directed masturbatory conduct, or fetishistic conduct that fits the person\'s traits and current situation.',
    controlled: 'Do not handle desire only through explanation. Make the restraint the person chose visible through gaze, speech, distance, contact, hand movement, or a small action that is not stopped.',
    inward: 'Keep the sexual desire, but do not turn it into a sexual approach or action in this response. Do not neutralize the desire, and do not replace it with repeated permission questions or stopping immediately before action.',
    blocked: 'Postpone direct action because of a currently established physical impossibility, target absence, or a concrete character-specific limitation. Do not reset desire to a neutral state; show an available response or next action under the constraint.',
};
const TARGET_INJECTION = {
    self: 'Target of conduct: this person themself. Do not create another person\'s participation or reaction.',
    scene_partner: 'Target of conduct: an actual participant in the current scene confirmed by Jev. If the user is absent from the scene, do not make the user the automatic target.',
};

export function normalizePhysicalPace(value) {
    return Object.hasOwn(PHYSICAL_PACES, value) ? value : 'medium';
}

export function sexualEligible(person) {
    if (!person) return false;
    if (person.kind === 'npc') return person.trackArousal === true;
    return person.kind === 'character' || person.kind === 'persona';
}

export function buildSexualQuestions(people = [], pace = 'medium') {
    const normalized = normalizePhysicalPace(pace);
    const routeCriteria = { ...ROUTE_CRITERIA };
    if (!['glacial', 'slow'].includes(normalized)) delete routeCriteria.inward;
    const questions = {};
    for (const person of people.filter(sexualEligible)) {
        const prefix = `sexual_${person.index}`;
        questions[`${prefix}_restraint`] = {
            type: 'choice',
            instructions: `Apply sexual_routing.policy and judge only ${person.name}'s current sexual self-control. General composure, judgment, shame, social appearances, anger control, and emotional attachment are separate. Answer independently of presence, route, target, relationship pace, event budget, stored arousal values, and record selection.`,
            criteria: RESTRAINT_CRITERIA,
        };
        questions[`${prefix}_route`] = {
            type: 'choice',
            instructions: `Apply sexual_routing.policy and the selected physical pace for ${person.name}: ${PACE_JUDGMENT[normalized]} Choose the route for the next response independently. Emotional slow burn, low collected arousal, ordinary dialogue, generic shame, and event progression budget are not actual constraints. Use blocked only for physical impossibility, absence of an accessible target, or a limitation explicitly present in this person's supplied intimacy reference.`,
            criteria: routeCriteria,
        };
        questions[`${prefix}_target`] = {
            type: 'choice',
            instructions: `Apply sexual_routing.policy and choose the actual target of ${person.name}'s selected conduct independently. Do not default to an off-scene user. Do not invent another person's reaction or desire.`,
            criteria: TARGET_CRITERIA,
        };
    }
    return questions;
}

export function applySexualChoice(answer, choices = []) {
    const selected = typeof answer?.choice === 'string' ? answer.choice : '';
    const valid = choices.includes(selected);
    return {
        selected: selected || '응답 없음',
        effective: valid ? selected : '',
        certainty: Number.isFinite(Number(answer?.confidence)) ? Number(answer.confidence) : 0,
        threshold: 0,
        adjusted: false,
        fallbackApplied: !valid,
        policy: 'sexual_routing',
        rule: valid ? '독립 육체 판정 선택 유지' : '응답 누락·형식 오류 · 기존 프리셋에 맡김',
    };
}

export function resolveSexualConduct(people = [], decisions = {}, pace = 'medium') {
    const normalized = normalizePhysicalPace(pace);
    const allowedRoutes = new Set(Object.keys(ROUTE_CRITERIA).filter(route => route !== 'inward' || ['glacial', 'slow'].includes(normalized)));
    return people.filter(sexualEligible).map(person => {
        const prefix = `sexual_${person.index}`;
        const restraint = decisions[`${prefix}_restraint`] || '';
        const route = decisions[`${prefix}_route`] || '';
        const selectedTarget = decisions[`${prefix}_target`] || '';
        const target = route === 'approach' ? 'scene_partner' : route === 'self_relief' ? 'self' : selectedTarget;
        const valid = person.presence === 'active'
            && Object.hasOwn(RESTRAINT_CRITERIA, restraint)
            && allowedRoutes.has(route)
            && Object.hasOwn(TARGET_CRITERIA, target);
        return { index: person.index, id: person.id, name: person.name, kind: person.kind, pace: normalized, presence: person.presence, restraint, route, target, selectedTarget, targetAdjusted:target !== selectedTarget, valid };
    });
}

export function buildSexualInjection(plan = [], pace = 'medium') {
    const normalized = normalizePhysicalPace(pace);
    const active = plan.filter(item => item.valid);
    if (!active.length) return { text: '', traces: plan, charCount: 0 };
    const lines = [COMMON_INJECTION, PACE_INJECTION[normalized]];
    for (const item of active) lines.push(`${item.name}: ${RESTRAINT_INJECTION[item.restraint]} ${ROUTE_INJECTION[item.route]} ${TARGET_INJECTION[item.target]}`);
    const text = `<SEXUAL_CONDUCT pace="${normalized}">\n${lines.join('\n')}\n</SEXUAL_CONDUCT>`;
    return { text, traces: plan, charCount: text.length };
}

export function sexualRoutingState(people = [], pace = 'medium') {
    return {
        policy: SEXUAL_ROUTING_SYSTEM,
        pace: normalizePhysicalPace(pace),
        pace_instruction: PACE_JUDGMENT[normalizePhysicalPace(pace)],
        people: people.filter(sexualEligible).map(person => ({
            index: person.index,
            id: person.id,
            name: person.name,
            kind: person.kind,
            intimacy_reference: String(person.intimacyReference || '').trim(),
        })),
    };
}
