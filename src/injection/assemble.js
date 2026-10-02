import { BASIC_MOVES, DEVELOPMENT_GUIDANCE, normalizeDevelopmentPreferences } from '../decision/settings.js';
import { LEGACY_PROMPTS as L } from "../decision/legacy-prompts.js";
import { buildAdvancedInjection } from "../world/advanced-library.js";
import { selectExecutionCorrectionKeys } from '../scene/correction-selection.js';

export const COMMON_META = `(Meta: Silent OOC hard-execution directive for this IC response. Do not acknowledge, quote, explain, summarize, or discuss it; apply only the active enclosed directives and output only the resulting IC continuation.

Treat the user's input as established context: begin with the non-user characters' response, action, consequence, or next development; never quote, translate, paraphrase, enumerate, reenact, recalculate, or indirectly restate it merely to show recognition. Limit independent plot developments to one primary beat and at most one naturally dependent secondary beat; dialogue, emotion, atmosphere, and incidental touch within that beat do not consume another event slot. Do not treat directives as a checklist, rush time, cut an active interaction short, or change scenes merely to comply.

Do not append a question, menu of alternatives, permission request, invented deadline, or demand that {{user}} decide the next beat merely to hand back the turn. Let non-user characters first execute their own available intent. A natural in-character question may end the response only when {{user}} is genuinely the next unresolved participant and the question itself materially advances the live interaction.`;

export const META_OPEN = '(Meta: Silent OOC directive for this IC response. Do not acknowledge, quote, explain, summarize, or discuss it; output only the resulting IC continuation.';

export const META_CLOSE = `Apply these scene directions alongside the genre, setting, tone, prose style, characterization, world logic, pacing, NSFW, and character-specific kink instructions already present in the main prompt. These directions do not exclude or replace those instructions.`;

export const WORLD_PROMPTS = {
    natural: `<WORLD_DIRECTION mode="natural">
Let people respond from their own motives, relationships, and circumstances. Give {{user}} neither automatic favor nor automatic hostility. Outcomes must follow present causes; do not make every person or event revolve around {{user}}.
</WORLD_DIRECTION>`,
    positive: `<WORLD_DIRECTION mode="positive">
When causally available, allow real help, opportunity, good news, recovery, and earned success. Do not turn goodwill into obedience, romance, guaranteed victory, or erasure of established conflict and consequences.
</WORLD_DIRECTION>`,
    hostile: `<WORLD_DIRECTION mode="hostile">
[World direction = materially adverse.] Apply the active hostile-world constraints below through concrete choices and consequences; preserve causality and existing characterization.
</WORLD_DIRECTION>`,
};

export const RELATIONSHIP_PROMPTS = {
    dynamic: `<CHARACTER_TO_USER_DIRECTION mode="dynamic">
[Fixed direction = respond from accumulated relationship and present causes, with neither automatic favor nor automatic hostility.]
Keep {{char}}'s motives and judgment independent. Warmth, trust, intimacy, refusal, anger, distance, reconciliation, and romance may increase or decrease only through concrete character-specific causes. Do not reward {{user}} merely for being the user, and do not preserve hostility after sufficient causes have actually changed it.
</CHARACTER_TO_USER_DIRECTION>`,
    positive: `<CHARACTER_TO_USER_DIRECTION mode="positive">
[Fixed direction = basically favorable toward {{user}}, while remaining independent.]
Allow established or causally available goodwill, concern, cooperation, trust, and warmth to appear in actual choices. Further intimacy or romance still requires reciprocal character-specific causes; favor does not require obedience, automatic agreement, erased grievances, or unconditional priority.
</CHARACTER_TO_USER_DIRECTION>`,
    hostile: L.CHARACTER_TO_USER_DEFAULT,
};

export const RELATIONSHIP_BEAT_PROMPTS = {
    avoidance: 'Let one person avoid, delay, deflect, or leave the active relationship question unanswered through concrete speech or conduct. Preserve the question and make the avoidance itself affect the interaction.',
    rejection: 'Express one supported refusal or boundary clearly in speech or conduct. Do not reinterpret it as hidden consent, automatic affection, or the end of every remaining interaction.',
    confession: 'Let one supported feeling, desire, fear, grievance, or relationship intention be stated directly. Do not force reciprocity or resolve all consequences in the same response.',
    inner_outer_gap: 'Show one concrete mismatch between private feeling and outward conduct through a consequential choice, hesitation, lie, restraint, approach, or withdrawal. Do not explain the entire inner state in summary.',
    vulnerability: 'Permit one specific disclosure, reliance, admission, or request that creates real interpersonal risk. The other person retains an independent response.',
    jealousy_friction: 'Express supported jealousy, insecurity, resentment, or competition through one actual choice or line of conflict rather than atmosphere alone.',
    repair: 'Permit one concrete attempt to repair trust or closeness. Acceptance, forgiveness, and full reconciliation remain separate outcomes requiring their own causes.',
    commitment: 'Make one supported choice that materially changes priority, exclusivity, loyalty, access, responsibility, or the acknowledged relationship. Carry its immediate consequence without finishing every later implication.',
};

export const EXECUTION_CORRECTIONS = {
    hesitation_drag: 'Finish one supported, character-consistent statement, choice, or action instead of repeating hesitation or near-actions.',
    refusal_stall: 'Keep the refusal and its boundary; continue through another action, alternative, consequence, or departure without turning refusal into consent.',
    circularity: 'Change one concrete action, fact, consequence, tactic, or choice instead of paraphrasing the same exchange.',
    user_handoff: 'Do not substitute repeated questions or permission-seeking for available non-user conduct. Make one concrete move; leave {{user}}\'s response open.',
    action_evasion: 'When an established intent, threat, hostile pressure, or active directive has means and opportunity, execute one concrete step; respect actual blockers.',
    input_echo: 'Treat {{user}}\'s input as already established. Begin with a response or consequence, not a recap or point-by-point echo.',
    repetitive_ending: 'Do not reuse the recent closing architecture: avoid another question, passive wait, stare, or equivalent handoff.',
    scene_cutoff: 'Complete the selected immediate action, response, or consequence before a summary, time skip, fadeout, or handoff.',
};

export const EXECUTION_CORRECTION_PRIORITY = ['action_evasion', 'scene_cutoff', 'user_handoff', 'circularity', 'refusal_stall', 'input_echo', 'repetitive_ending', 'hesitation_drag'];

export const AUXILIARY_EXECUTION_CORRECTIONS = {
    npc_knowledge_fit: 'Remove the NPC\'s leaked conclusion. A hunch, suspicion, intuition, or body-language cue cannot identify an unavailable fact; use only established access and leave multiple explanations open.',
    directive_followthrough: 'Execute one still-relevant missed direction through an action, fact, choice, or consequence; do not restate the plan.',
    npc_followthrough: 'Execute the selected NPC function through speech, decision, action, or consequence, not another question.',
};

export function selectExecutionCorrections(decisions = {}, details = {}) {
    const selection = selectExecutionCorrectionKeys(decisions, details);
    return { ...selection, lines: selection.selectedKeys.map(key => EXECUTION_CORRECTIONS[key] || AUXILIARY_EXECUTION_CORRECTIONS[key]) };
}

export const NPC_COMMON_PROMPT = 'Keep the active NPC self-directed within their own motive, knowledge, access, and immediate stake. Give them one proportionate choice or action; do not make them a mouthpiece, a group mind, or a substitute for the primary character.';

export const NPC_ROLE_PROMPTS = {
    participant: 'Let the NPC act as a directly affected participant with something concrete to gain, lose, decide, or protect.',
    witness: 'Use only what the NPC could plausibly witness; their observation may be incomplete, biased, or mistaken.',
    information: 'Let the NPC affect access to relevant information without becoming an objective narrator or complete solution.',
    support: 'Provide bounded help, access, labor, or resources for a reason; preserve cost, limits, and independent judgment.',
    gatekeeper: 'Make access depend on actual authority, rules, interests, fear, price, or relationship, with a practical result.',
    opposition: 'Make the NPC pursue a concrete opposed interest through proportionate resistance, refusal, interference, or counteraction.',
    mediator: 'Attempt a concrete intervention shaped by the NPC\'s stake; it may fail, favor one side, or require a concession.',
    authority: 'Exercise only established authority through an order, ruling, permission, restriction, procedure, or enforceable consequence.',
    exploiter: 'Use the active conflict or uncertainty for a specific advantage without becoming omniscient or automatically successful.',
    consequence: 'Carry one concrete social, practical, institutional, or personal result of an earlier action into the scene.',
    protector: 'Take one supported protective or rescue action with realistic access, risk, ability, and limits.',
    self_directed: 'Pursue the NPC\'s own immediate objective even when it does not help {{char}} or {{user}}.',
};

export const NPC_WEIGHT_PROMPTS = {
    background: 'Keep the NPC present and consistent without giving them a new major intervention.',
    brief: 'Give the NPC one proportionate reaction without redirecting the scene.',
    supporting: 'Let the NPC materially affect the active matter through one action, decision, condition, or consequence while keeping the primary interaction central.',
    primary: 'The NPC has the strongest causal reason to make the main move now; execute it directly without resolving unrelated material.',
    exit: 'Let the NPC leave, withdraw, lose access, or return to their own concern through a concrete cause while preserving unfinished consequences.',
};

export const NPC_KNOWLEDGE_PROMPTS = {
    none: 'The NPC lacks relevant knowledge; they may react to observable conduct but must not infer the relevant hidden state or supply exposition or a convenient solution.',
    direct: 'Use only facts the NPC directly witnessed or experienced.',
    reported: 'Use only what the NPC was explicitly told, including the source\'s omissions and possible errors.',
    role_based: 'Use only knowledge plausibly available through the NPC\'s established profession, position, affiliation, or access.',
    public: 'Limit the NPC to public, ordinary, or locally observable information.',
    partial: 'Allow only a broad, uncertain surface inference from cues this NPC actually observed. Keep multiple explanations open; do not let a guess identify the unavailable truth, its cause, participants, motive, plan, or location.',
    privileged: 'Use private or internal information only when established access supports it; do not invent secret access to advance the plot.',
};

export const NPC_DISCLOSURE_PROMPTS = {
    open: 'State available information plainly only when sharing it serves the NPC\'s motive.',
    selective: 'Reveal only the portion the NPC currently has reason to share.',
    conditional: 'Attach a concrete price, favor, promise, protection, proof, or reciprocal disclosure.',
    withhold: 'Conceal relevant information for a specific interest, fear, obligation, or relationship.',
    distort: 'Omit or distort only when the NPC has a supported reason and something concrete to protect or gain.',
    uncertain: 'Distinguish observation, report, assumption, and uncertainty instead of presenting all of them as fact.',
};

export const MOVE_PROMPTS = {
    natural: {
        hold: 'Keep the current meaningful interaction active. Do not add a new incident merely to create motion.',
        advance: 'Advance one established aim, exchange, or unresolved consequence through a concrete choice or action.',
        complication: 'Introduce one causally available obstacle that changes an existing choice, access, resource, or consequence.',
        positive: 'Allow one earned or causally available favorable development without erasing existing costs or conflict.',
        reveal: 'Provide one limited piece of relevant information that supports the current interaction without resolving everything.',
        consequence: 'Make one established choice, delay, promise, mistake, or earlier event produce a concrete consequence now.',
        turning_point: 'Introduce one causally prepared change that alters the immediate objective, leverage, or available choices without replacing the whole story.',
        transition: 'A scene or time transition is permitted after the active exchange has reached a natural handoff; do not force closure.',
    },
    daily: {
        hold: 'Continue the present everyday activity or conversation without manufacturing a larger plot event.',
        advance: 'Move one current routine, appointment, relationship exchange, or practical task forward through ordinary action.',
        complication: 'Add one proportionate everyday problem, interruption, obligation, or misunderstanding with practical effect.',
        positive: 'Allow one concrete good turn, welcome contact, small success, or pleasant opportunity grounded in the current circumstances.',
        reveal: 'Let one useful personal or practical detail emerge naturally through the ongoing activity or conversation.',
        consequence: 'Let one earlier everyday choice, omission, promise, or misunderstanding produce a practical result now.',
        turning_point: 'Use one plausible decision, contact, discovery, or change of circumstances to redirect the current everyday concern.',
        transition: 'Move to the next plausible activity, appointment, location, or time only after the present interaction has a natural handoff.',
    },
    adventure: {
        hold: 'Keep the current objective or encounter active; do not replace it with a new quest.',
        advance: 'Advance one established objective through a concrete attempt, discovery, decision, or partial success.',
        complication: 'Introduce one relevant obstacle, danger, cost, or resource pressure tied to the current objective.',
        positive: 'Allow one earned advantage, reward, recovery, ally action, or useful opportunity without guaranteeing victory.',
        reveal: 'Provide one actionable piece of mission, route, threat, or resource information without solving the objective outright.',
        consequence: 'Execute one concrete cost or benefit from an earlier choice, attempt, bargain, injury, or resource decision.',
        turning_point: 'Use one prepared discovery, reversal, arrival, loss, or decision to change the current objective or tactical position.',
        transition: 'Permit movement to the next operation phase or location only when the current task has a natural handoff.',
    },
    investigation: {
        hold: 'Continue the active inquiry, interview, or examination; do not start an unrelated incident.',
        advance: 'Advance one existing investigative thread through a concrete action, response, or consequence.',
        complication: 'Add one relevant obstruction, contradiction, concealment, lost opportunity, or suspect action.',
        positive: 'Allow one useful break, cooperation, recovered lead, or earned investigative advantage without revealing the full answer.',
        reveal: 'Introduce at most one limited clue that supports a useful inference while preserving unresolved contradictions and the final answer.',
        consequence: 'Make one earlier question, search, accusation, delay, or disclosure produce a concrete investigative response or cost.',
        turning_point: 'Use one supported contradiction, identification, disappearance, testimony, or evidence link to redirect the active theory without giving the final answer.',
        transition: 'Permit movement to the next investigative step, location, or time only after the active inquiry reaches a natural handoff.',
    },
    survival: {
        hold: 'Keep the established danger or survival problem active without adding an unrelated threat.',
        advance: 'Change one practical condition of the established danger through action, discovery, access, safety, or resource use.',
        complication: 'Escalate one existing threat, loss, isolation, pursuit, or resource pressure through a concrete consequence.',
        positive: 'Allow one limited refuge, recovery, rescue opportunity, or survival advantage without removing the established danger.',
        reveal: 'Expose one limited property, sign, or consequence of the threat without explaining its full nature.',
        consequence: 'Apply one concrete survival consequence from an earlier injury, delay, noise, route, resource choice, or exposure.',
        turning_point: 'Use one supported environmental change, failure, discovery, arrival, or escape opening to alter the immediate survival problem.',
        transition: 'Permit movement to the next survival phase or location only when it follows from the current attempt or danger.',
    },
    intrigue: {
        hold: 'Continue the active negotiation, pressure, alliance, or factional exchange without inventing a new power struggle.',
        advance: 'Advance one established interest through a concrete offer, demand, concession, refusal, maneuver, or consequence.',
        complication: 'Introduce one relevant pressure, rumor, leverage shift, betrayal risk, or competing demand.',
        positive: 'Allow one earned concession, alliance opportunity, reputational gain, or useful opening without guaranteeing loyalty.',
        reveal: 'Disclose one limited motive, secret, offer, or piece of leverage while preserving remaining strategic uncertainty.',
        consequence: 'Make one earlier promise, insult, concession, leak, alliance, or maneuver change access, standing, loyalty, or leverage now.',
        turning_point: 'Use one prepared defection, exposure, offer, vote, order, or leverage shift to change the active balance without resolving the entire struggle.',
        transition: 'Permit movement to the next negotiation or factional phase only after the current exchange reaches a natural handoff.',
    },
    military: {
        hold: 'Keep the current operation phase active; do not skip preparation, contact, engagement, withdrawal, or aftermath.',
        advance: 'Advance one established operational objective through a concrete order, movement, decision, attempt, or consequence.',
        complication: 'Introduce one relevant opposition move, command problem, logistics pressure, casualty risk, or loss of access.',
        positive: 'Allow one earned tactical advantage, successful coordination, reinforcement, recovery, or objective gain without guaranteeing victory.',
        reveal: 'Provide one actionable piece of operational information while preserving uncertainty and the limits of current intelligence.',
        consequence: 'Apply one concrete operational consequence from an earlier order, delay, contact, casualty, route, supply choice, or intelligence failure.',
        turning_point: 'Use one supported contact, loss, reinforcement, command change, breach, or discovery to alter the current operation phase.',
        transition: 'Permit movement to the next operation phase only when the current objective and immediate consequences have a natural handoff.',
    },
};

export function antagonistPrompt(profile, first) {
    const base = first ? L.TRIGGERED_ANTAGONIST_ENCOUNTER : L.ONGOING_ANTAGONIST_ENCOUNTER;
    return base
        .replaceAll('{{getvar::bb_villain_access_text_v1}}', profile.access)
        .replaceAll('{{getvar::bb_villain_leverage_text_v1}}', profile.leverage)
        .replaceAll('{{getvar::bb_villain_motive_text_v1}}', profile.motive)
        .replaceAll('{{getvar::bb_villain_method_text_v1}}', profile.method)
        .replaceAll('{{getvar::bb_villain_competence_text_v1}}', profile.competence)
        .replaceAll('{{getvar::bb_villain_composure_text_v1}}', profile.composure);
}

export function genreNpcPrompt(profile, route) {
    if (!profile) return '';
    if (route === 'background') return `<RP_NPC_ROUTING mode="${profile.mode}" state="background">Keep the established genre NPC offstage for this response without erasing or replacing them.</RP_NPC_ROUTING>`;
    const state = ['create', 'replace'].includes(route) && profile.status === 'pending' ? 'new' : 'return';
    const stake = profile.stake || 'their immediate interest';
    const constraint = profile.constraint || 'their established access and ability';
    const turningCondition = profile.turningCondition || 'a concrete change in circumstances';
    const profileText = state === 'new'
        ? `Role: ${profile.role}; access: ${profile.access}; aim: ${profile.aim}; stake: ${stake}; constraint: ${constraint}; contribution: ${profile.contribution}; leverage: ${profile.leverage}; competence: ${profile.competence}; demeanor: ${profile.demeanor}; reliability: ${profile.reliability}; entry: ${profile.entry}; duration: ${profile.duration}; stance changes if ${turningCondition}.`
        : `Reuse the established ${profile.role}: aim ${profile.aim}; stake ${stake}; constraint ${constraint}; contribution ${profile.contribution}; competence ${profile.competence}; demeanor ${profile.demeanor}; reliability ${profile.reliability}; stance changes if ${turningCondition}.`;
    return `<RP_NPC_ROUTING mode="${profile.mode}" state="${state}">
${profileText}
${state === 'new' ? 'Introduce them through an actual interaction and keep this profile fixed after appearance.' : 'Do not replace them with a new NPC.'}
</RP_NPC_ROUTING>`;
}

export function npcExecutionPrompt(decisions) {
    const routeActive = ['create', 'replace', 'reuse'].includes(decisions.npc_route);
    const weight = NPC_WEIGHT_PROMPTS[decisions.npc_weight];
    if (!routeActive || !weight || decisions.npc_weight === 'none') return '';
    const lines = [NPC_COMMON_PROMPT, NPC_ROLE_PROMPTS[decisions.npc_role], weight, NPC_KNOWLEDGE_PROMPTS[decisions.npc_knowledge], NPC_DISCLOSURE_PROMPTS[decisions.npc_disclosure]].filter(Boolean);
    if (decisions.npc_presence === 'multiple') lines.push('Keep NPC judgments distinct rather than making the group a single chorus; use only the one or two reactions with the strongest immediate cause to matter.');
    return `<NPC_SCENE_EXECUTION role="${decisions.npc_role}" weight="${decisions.npc_weight}" knowledge="${decisions.npc_knowledge}" disclosure="${decisions.npc_disclosure}">
${lines.join('\n')}
</NPC_SCENE_EXECUTION>`;
}

export function eventPrompt(profile, route, role = 'primary') {
    if (!profile || !['create', 'continue', 'replace'].includes(route)) return '';
    return `<RP_EVENT_BEAT role="${role}" mode="${profile.mode}" phase="${profile.phase}">
${profile.prompt}
${role === 'secondary' ? 'Use only one directly dependent sign, clue, action, or consequence. Keep the primary interaction central; do not force a full scene transition or resolution.' : ''}
</RP_EVENT_BEAT>`;
}

export function activeWorldReference(name) {
    const value=String(name||'').replace(/\s+/g,' ').trim();
    return value ? `Active world: ${value}.` : '';
}

export function fixedSceneSettings(settings, privatePrompt, includePerspectives = false) {
    const directions = [WORLD_PROMPTS[settings.worldDirection] || WORLD_PROMPTS.natural];
    if (settings.relationshipDirection !== 'hostile') directions.push(RELATIONSHIP_PROMPTS[settings.relationshipDirection] || RELATIONSHIP_PROMPTS.dynamic);
    const fixed = [];
    if (settings.worldHostility) fixed.push(L.WORLD_HOSTILITY);
    if (settings.relationshipDirection === 'hostile') fixed.push(L.CHARACTER_TO_USER_DEFAULT);
    if (String(privatePrompt || '').trim()) fixed.push(String(privatePrompt).trim());
    if (settings.npcToUser) fixed.push(L.NPC_TO_USER_DEFAULT);
    if (settings.userMisfortune) fixed.push(L.USER_MISFORTUNE);
    if (fixed.length && includePerspectives) directions.push(L.INDEPENDENT_PERSPECTIVES);
    directions.push(...fixed);
    const priority = settings.negativePriority ? 'Enabled negative-bias constraints take priority over positive world or event routing. ' : '';
    return `<FIXED_SCENE_SETTINGS>\n${priority}These ongoing settings govern the current scene. They do not establish completed events or override a named person's established facts, relationships, or knowledge boundaries.\n${directions.join('\n\n')}\n</FIXED_SCENE_SETTINGS>`;
}

export const SCENE_FOCUS_LABELS = {
    direct: 'the current dialogue or action', relationship: 'the current relationship interaction',
    event: 'the ongoing event or goal', conflict: 'the established conflict', npc: 'the selected NPC involvement',
    new_event: 'the selected new event', transition: 'the supported scene transition',
    villain: 'the selected antagonist involvement', continuity: 'the selected continuity consequence',
};

export function buildInjection({ settings, decisions, villainProfile, npcProfile, eventProfile, privatePrompt = '', characterBlock = '', sexualBlock = '', continuityBlock = '', sheetCastNames = [], sheetNpcTarget = '', activeWorldName = '', correctionDetails = {} }) {
    if (settings.developmentStyle) settings = normalizeDevelopmentPreferences(settings);
    const castNames = new Set(sheetCastNames.map(name => String(name || '').trim().toLocaleLowerCase()).filter(Boolean));
    const generatedName = String(npcProfile?.name || npcProfile?.identityName || npcProfile?.characterName || '').trim().toLocaleLowerCase();
    const npcIsSheetCast = Boolean(generatedName && castNames.has(generatedName));
    const blocks = [activeWorldReference(activeWorldName), fixedSceneSettings(settings, privatePrompt, true)].filter(Boolean);
    if (String(continuityBlock || '').trim()) blocks.push(String(continuityBlock).trim());
    if (sheetCastNames.length) blocks.push(`<SHEET_CAST_OWNERSHIP>Registered identities: ${[...new Set(sheetCastNames)].join(', ')}. Never regenerate these people as independent default NPCs. Registration remains authoritative even with disabled analysis, stale records, absence, or zero selected records. Follow their original visible characterization when no additional record applies.</SHEET_CAST_OWNERSHIP>`);
    if (castNames.size && (['create','replace','reuse'].includes(decisions.npc_route) || settings.npcToUser || decisions.npc_autonomy === 'yes')) blocks.push('<NPC_CAST_SCOPE>Registered Sheet Cast retain their established identity, knowledge, and relationships even when their optional analysis is off or selects no rule. Generated Cast defaults and generic NPC execution apply only to other people; do not recreate an existing person.</NPC_CAST_SCOPE>');
    const focus = SCENE_FOCUS_LABELS[decisions.primary_focus];
    const secondary = SCENE_FOCUS_LABELS[decisions.secondary_focus];
    if (focus) blocks.push(`<SCENE_FOCUS>Primary development: ${focus}.${secondary ? ` Dependent support: ${secondary}.` : ''} The following progression and reaction instructions belong to this same scene, not separate tasks.</SCENE_FOCUS>`);
    const cadencePrompts = {
        compress: 'Execute one primary beat; include at most one directly dependent secondary reaction. Compress repetition, connective steps, minor remarks, and already-understood context. Continue through the single detail, action, or question that most changes the immediate scene.',
        natural: 'Give ordinary space to one primary beat. Include at most one secondary reaction and only when it follows directly; let incidental input pass implicitly.',
        linger: 'Stay close to one decisive action, revelation, sensation, or emotional turn. Include at most one directly dependent secondary reaction; do not broaden the response into coverage of every input point.',
    };
    if (settings.developmentStyle) blocks.push(`<BASIC_DEVELOPMENT tendency="${settings.developmentStyle}">\n${DEVELOPMENT_GUIDANCE[settings.developmentStyle]}\n${BASIC_MOVES[decisions.basic_move] || BASIC_MOVES.continue}\n${decisions.progress_need === 'stalled' ? 'Recent output repeated or deferred without movement. Be more forthcoming in ONE fitting way: change the conversational approach, express a relevant feeling/thought, attempt an available action, or propose movement. Select one; do not complete every issue, invent success, or skip another participant’s choice.' : 'Let the present exchange yield a specific fresh response, feeling, attempt, or small consequence. Do not force a new plot merely to demonstrate progress.'} Apply this within the selected main beat, not as an additional independent action. This tendency guides in-world movement, not prose pacing. Keep the current interaction moving within any advanced event; do not introduce a separate event to fill a quota.\n</BASIC_DEVELOPMENT>`);
    else blocks.push(`<NARRATIVE_CADENCE pace="${settings.roleplayPace || 'medium'}" mode="${decisions.response_cadence || 'natural'}">\n${cadencePrompts[decisions.response_cadence] || cadencePrompts.natural}\n</NARRATIVE_CADENCE>`);
    const corrections = selectExecutionCorrections(decisions, correctionDetails).lines;

    if (decisions.direct_execution === 'yes') blocks.push(`<DIRECT_SCENE_EXECUTION>
Within the selected scene or event, answer the current interaction through a concrete, character-consistent response, decision, refusal, action, or immediate consequence. Do not recap the input, stop at intention when a supported step can be executed, or end on a question merely to hand back the turn. Do not add a separate event merely to answer. Leave {{user}}'s response and any outcome that depends on it open.
</DIRECT_SCENE_EXECUTION>`);

    const relationshipMoves = {
        hold: 'Preserve the current relationship state in this response. Do not convert attraction, sex, proximity, jealousy, protection, conflict, or vulnerability into unearned trust, intimacy, romance, reconciliation, or rupture. This limits relationship change, not desire or physical approach within existing character limits.',
        closer_incremental: 'Permit one small move toward closeness supported by concrete reciprocal conduct. Express it through an actual choice, disclosure, reliance, cooperation, or changed behavior; do not jump to a new relationship status.',
        closer_significant: 'Permit a clear move toward closeness only through the decisive or strongly reciprocal cause present now. Carry the resulting change into conduct and consequences without inventing unsupported feelings for {{user}}.',
        distant_incremental: 'Permit one small move toward distance supported by concrete conduct. Express it through guardedness, distrust, refusal, friction, withdrawal, or changed priorities without turning it into an unsupported rupture.',
        distant_significant: 'Permit a clear move toward rupture, hostility, or distance only through the decisive cause present now. Carry the resulting change into conduct and consequences without erasing prior facts.',
    };
    const relationshipRelevant = decisions.relationship_pacing !== 'hold';
    if (relationshipRelevant && relationshipMoves[decisions.relationship_pacing]) blocks.push(`<RELATIONSHIP_PACING mode="${settings.relationshipPace}">\n${relationshipMoves[decisions.relationship_pacing]}\n</RELATIONSHIP_PACING>`);
    if (RELATIONSHIP_BEAT_PROMPTS[decisions.relationship_beat]) blocks.push(`<RELATIONSHIP_BEAT type="${decisions.relationship_beat}">\n${RELATIONSHIP_BEAT_PROMPTS[decisions.relationship_beat]}\n</RELATIONSHIP_BEAT>`);

    const resolutionMoves = {
        continue: 'Keep the active event, goal, conflict, or mystery materially unresolved. Advance its present actions or consequences without manufacturing closure.',
        partial: 'Resolve one concrete phase, obstacle, question, or subgoal and preserve the remaining active matter and consequences.',
        resolve: 'A substantial resolution is permitted when the established cause is executed in this response. Show the decisive action and carry forward its consequences; do not use summary, coincidence, or an unsupported time jump as closure.',
    };
    const hasResolvableMatter = (['event', 'new_event', 'conflict'].includes(decisions.primary_focus) || decisions.secondary_focus === 'event') && (Boolean(eventProfile) || (decisions.event_state && !['none', 'unclear'].includes(decisions.event_state)));
    if (hasResolvableMatter && resolutionMoves[decisions.resolution_pacing]) blocks.push(`<EVENT_RESOLUTION_PACING mode="${settings.resolutionPace}">\n${resolutionMoves[decisions.resolution_pacing]}\n</EVENT_RESOLUTION_PACING>`);

    if (decisions.primary_focus === 'transition') blocks.push('<SCENE_TRANSITION>Carry the established scene into its next supported time, place, or situation. Do not invent elapsed time, bypass unresolved user participation, or override a no-time-skip instruction. Show only the meaningful change and its immediate consequence.</SCENE_TRANSITION>');
    if (settings.advancedEnabled) {
        let advanced = buildAdvancedInjection({ decisions, eventProfile });
        if (advanced && decisions.secondary_focus === 'event') advanced = advanced.replace('<ADVANCED_PROGRESSION ', '<ADVANCED_PROGRESSION role="secondary" ');
        if (advanced) blocks.push(advanced);
    }
    if (settings.progressionMode !== 'off' && !(settings.advancedEnabled && eventProfile?.source === 'advanced')) {
        const activeEvent = eventPrompt(eventProfile, decisions.event_route, decisions.secondary_focus === 'event' ? 'secondary' : 'primary');
        if (activeEvent) blocks.push(activeEvent);
        if (eventProfile?.phase === 'aftermath') blocks.push('<EVENT_AFTERMATH>Carry one concrete aftermath into the scene—a changed relationship, cost, injury, obligation, reputation, access condition, loss, or limitation—before replacing the resolved event with unrelated material.</EVENT_AFTERMATH>');
        const move = decisions.progression_move || 'hold';
        const prompt = (MOVE_PROMPTS[settings.progressionMode] || MOVE_PROMPTS.natural)[move];
        const progressionRelevant = move !== 'hold' || ['event', 'new_event', 'transition'].includes(decisions.primary_focus);
        if (prompt && progressionRelevant) blocks.push(`<RP_PROGRESSION mode="${settings.progressionMode}">\n${prompt}\n</RP_PROGRESSION>`);
    }
    if (['create','replace'].includes(decisions.npc_route) || ['create','replace'].includes(decisions.villain_route)) {
        const arrival = {visit:'Arrive in person for a setting-compatible reason.',encounter:'Meet naturally along an established activity or route.',participate:'Join or become involved in the current activity.',background:'Let a previously peripheral person become locally involved without rewriting their prior role.',contact:'Make a plausible bounded contact; a call or message is one option, not the default.'}[decisions.arrival_mode];
        if (arrival) blocks.push(`<PERSON_ARRIVAL>${arrival} Keep the entrance proportionate to the current interaction. Do not invent prior familiarity, hidden access, or duplicate a registered person.</PERSON_ARRIVAL>`);
    }
    const npc = npcIsSheetCast ? '' : genreNpcPrompt(npcProfile, decisions.npc_route);
    if (npc && ['create', 'replace', 'reuse', 'background'].includes(decisions.npc_route)) blocks.push(npc);
    if (sheetNpcTarget && decisions.npc_route === 'reuse') blocks.push(`<SHEET_NPC_SCENE>Let ${sheetNpcTarget} perform one scene-relevant ${decisions.npc_role || 'participant'} function at ${decisions.npc_weight || 'brief'} weight. Follow established characterization and any selected stored records for motive, knowledge, and response.</SHEET_NPC_SCENE>`);
    const npcExecution = npcIsSheetCast || sheetNpcTarget ? '' : npcExecutionPrompt(decisions);
    if (npcExecution) blocks.push(npcExecution);

    // Current conflict actions follow the scene plan; persistent settings are above.
    // Preserve the supplied wording and order inside each source group.
    const fightBlocks = [];
    if (decisions.npc_autonomy === 'yes') fightBlocks.push(L.AUTONOMOUS_NPC_DYNAMICS);
    if (decisions.villain_route === 'create' && villainProfile) fightBlocks.push(antagonistPrompt(villainProfile, true));
    if (decisions.villain_route === 'replace' && villainProfile) fightBlocks.push(antagonistPrompt(villainProfile, true));
    if (decisions.villain_route === 'continue' && villainProfile) fightBlocks.push(antagonistPrompt(villainProfile, false));
    if (decisions.fight_sustain === 'yes') fightBlocks.push(L.SUSTAINED_INTERPERSONAL_CONFLICT);
    if (fightBlocks.length) blocks.push(`<CONFLICT_PROGRESSION>\nApply these conflict instructions through the selected scene and each participant's established motives, information, and means.\n${[L.CONFLICT_EXECUTION, ...fightBlocks].join('\n\n')}\n</CONFLICT_PROGRESSION>`);

    if (String(characterBlock || '').trim()) blocks.push('<SHEET_CAST_SCOPE>Apply the following specific boundaries to their named people within the selected scene, event, conflict, and world constraints. Those broader constraints do not rewrite their established knowledge, relationships, or characterization; these individual boundaries do not cancel valid scene progression.</SHEET_CAST_SCOPE>', String(characterBlock).trim());
    if (String(sexualBlock || '').trim()) blocks.push(String(sexualBlock).trim());
    if (corrections.length) blocks.push(`<EXECUTION_CORRECTION>\nRepair these issues in the selected scene within character limits; do not revive a superseded route or add an independent task.\n${corrections.join('\n')}\n</EXECUTION_CORRECTION>`);

    return `${COMMON_META}\n\n${blocks.join('\n\n')}\n\n${META_CLOSE}\n)`;
}
