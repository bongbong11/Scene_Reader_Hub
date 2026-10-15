import {ADVANCED_ELEMENTS} from './advanced-library.js';

// Ongoing emphasis shares the existing decision request and cast search.
// It never draws an event, creates an identity, or asserts observed presence.
export const STORY_DIRECTIONS = {
    social: {name:'daily life and social ties', hint:'routine friendship family community work leisure invitation', prompt:"Let everyday routines, personal interests, and social ties shape the interaction. Give familiar activities and conversations room to develop through the participants' own choices and reactions."},
    exploration: {name:'exploration', hint:'travel route discovery guide curiosity surroundings', prompt:'Let curiosity and practical exploration guide how people engage with the established surroundings. Develop what they can encounter or learn without inventing a new destination, artifact, or extraordinary discovery merely to fill the scene.'},
    objective: {name:'goals and unfinished business', hint:'goal duty task obligation unfinished work', prompt:'Keep established aims and unfinished business relevant to choices and consequences. Let participants attempt useful steps or respond to setbacks while preserving outcomes that remain unresolved.'},
    investigation: {name:'investigation', hint:'question witness evidence inquiry suspicion testimony', prompt:'Let established questions, observations, testimony, and inconsistencies guide inquiry. Have people examine or challenge what is available without inventing decisive evidence or treating suspicion as fact.'},
    threat: {name:'danger and confrontation', hint:'opponent rivalry danger hostility defense confrontation', prompt:'Let established danger, opposition, and competing aims shape decisions and conduct. When confrontation is supported, carry out attempts and responses rather than endlessly announcing danger; preserve uncertain outcomes.'},
    horror: {name:'horror and uncertainty', hint:'fear vulnerability unknown threat uncertainty', prompt:'Let established uncertainty, vulnerability, and unsettling circumstances shape perception and choices. Keep the source of fear consistent with the world; do not invent supernatural beings or explain an unknown threat without support.'},
    intrigue: {name:'intrigue', hint:'interest leverage secrecy alliance deception rivalry influence', prompt:'Let conflicting interests, leverage, secrecy, and alliances shape what people say and do. Relevant actors pursue advantage through available information and influence, rather than private scheming alone.'},
    relationship: {name:'relationship intrigue', hint:'attraction rival rivalry jealousy desire affection relationship compete attention invitation commitment lover', prompt:'Let relationship intrigue shape the ongoing story through established attraction, rivalry, jealousy, secrets, and competing commitments. Relevant characters and NPCs pursue their own interests and seek plausible openings to influence one another. Carry these dynamics through dialogue, choices, and consequences, including between major events.'},
};

export function storyElements(settings={}) {
    return settings.advancedEnabled && Array.isArray(settings.advancedElements)
        ? [...new Set(settings.advancedElements.filter(key=>Object.hasOwn(ADVANCED_ELEMENTS,key)))] : [];
}

export function storyDirectionQuestion(elements) {
    return {type:'choice', instructions:'Choose which enabled story element best shapes this interaction. This selects emphasis, not permission to proceed. Read quiet, subtle, hostile, and cooperative conduct according to the established people and setting. Do not select none merely because no new event was drawn. Do not invent a new incident merely to express an element. Use none when no extra emphasis is useful; continue the current interaction.',
        criteria:{none:'No extra emphasis needed in this interaction.',...Object.fromEntries(elements.map(key=>[key,STORY_DIRECTIONS[key].name]))}};
}

export function storyDirectionBeat(elements) {
    return {key:'direction', source:'ongoing_direction', title:'Ongoing interaction',
        text:`Enabled directions: ${elements.map(key=>`${STORY_DIRECTIONS[key].name} (${STORY_DIRECTIONS[key].hint})`).join('; ')}. Choose an existing participant's move within the current interaction. This is not a new incident or a new person. Do not invent a separate crisis, secret, evidence or accident.`};
}

export function resolveStoryDirection(elements=[], choice, bindings=[]) {
    if(!elements.length)return null;
    const focus=elements.includes(choice)?choice:'none';
    const actor=bindings.find(item=>item.kind!=='unresolved');
    return {contract:1,enabledElements:[...elements],focus,
        actorSource:({sheet:'registered',generated:'established',scene_existing:'established',current_cast:'current',new:'new_addition'})[actor?.kind]||'none',
        actorRef:actor?.actorId||null,action:actor?.action||'none',
        origin:actor?(actor.beatKey==='direction'||actor.beatKey==='ongoing'?'ongoing':'addition'):'none',
        reason:choice===undefined?'missing_answer':focus==='none'?'no_extra_emphasis':actor?'selected':'no_actor_move',
        delivery:'prepared',verification:actor?'awaiting_output':'unavailable'};
}

export function buildStoryDirection(settings, direction) {
    const elements=storyElements(settings);
    if(!elements.length||!direction)return '';
    const focus=elements.includes(direction.focus)?STORY_DIRECTIONS[direction.focus].prompt:'';
    return `<STORY_DIRECTION>\nEnabled elements: ${elements.map(key=>STORY_DIRECTIONS[key].name).join(', ')}.\n${focus?focus+'\n':''}These elements shape existing interactions as well as selected additions; they do not require a new incident in every reply.\n</STORY_DIRECTION>`;
}
