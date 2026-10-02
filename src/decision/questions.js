import { BASIC_MOVES, DEVELOPMENT_GUIDANCE, normalizeDevelopmentPreferences } from './settings.js';
import { buildAdvancedQuestions } from "../world/advanced-library.js";

export function buildQuestions({ preferences, hasVillain, hasNpc, hasEvent = false, eventSource = '', pacingState = {} }) {
    if (preferences.developmentStyle) preferences = normalizeDevelopmentPreferences(preferences);
    const progressionMode = preferences.progressionMode;
    const newEventEnabled = !hasEvent && (preferences.advancedEnabled || progressionMode !== 'off');
    const posture = 'Use the same evidence standard regardless of routing style. Select none only when the recent exchange affirmatively supports absence; select unclear when relevant evidence exists but is insufficient or contradictory. Do not turn desired next movement into an observed fact.';
    const relationshipDirectionRule = {
        hostile: 'The complete original CHARACTER_TO_USER_DEFAULT directive is fixed and active. Do not reinterpret, narrow, soften, summarize, or replace it. Judge only whether the current exchange supports an additional relationship change and how large that change may be.',
        positive: 'The fixed relationship directive establishes basic goodwill. Do not count that baseline as new progress; select movement toward closeness only when this exchange adds concrete reciprocal trust, openness, reliance, intimacy, or commitment. Real conflict or betrayal may still support movement away.',
        dynamic: 'The fixed relationship directive has no preset positive or negative destination. Choose direction only from concrete reciprocal conduct and its likely effect on the established relationship.',
    }[preferences.relationshipDirection] || 'The fixed relationship directive has no preset positive or negative destination. Choose direction only from concrete reciprocal conduct and its likely effect on the established relationship.';
    const questions = {
        scene_state: {
            type: 'choice',
            instructions: `Classify only the immediate state of the latest roleplay exchange. Do not recommend a plot direction. ${posture}`,
            criteria: {
                active: 'A concrete exchange or action is actively unfolding and demands continuation.',
                normal: 'The interaction has ordinary momentum without urgent unfinished action.',
                stalled: 'The exchange is materially repeating or lacks a meaningful next action.',
                transition_ready: 'The current beat has a natural handoff into a later time, place, or distinct beat.',
                unclear: 'The recent text is insufficient or ambiguous.',
            },
        },
        conflict_state: {
            type: 'choice',
            instructions: `Classify actual interpersonal conflict in the recent exchange. Tension, refusal, distance, or sadness alone are not an active fight. ${posture}`,
            criteria: {
                none: 'No material interpersonal conflict is active.',
                tension: 'Friction or opposed interests exist but no actual confrontation is underway.',
                active: 'People are concretely confronting, attacking, coercing, accusing, obstructing, or fighting.',
                resolving: 'Concrete causes for partial or full de-escalation are already occurring.',
                unclear: 'The recent text does not establish the state reliably.',
            },
        },
        relationship_motion: {
            type: 'choice',
            instructions: `Classify immediate relationship movement, not the overall relationship. If no earlier relationship state is available, select none rather than unclear. Do not infer closeness from proximity or genre alone. ${posture}`,
            criteria: { none: 'There is no usable earlier relationship state or no relationship evidence to compare.', stable: 'The established relationship state is being maintained.', closer: 'Concrete voluntary conduct supports increased closeness.', distant: 'Concrete conduct supports increased distance, rejection, or rupture.', mixed: 'Closer and more distant signals are both materially present.', unclear: 'Relevant evidence exists but its direction genuinely cannot be distinguished.' },
        },
        trust_signal: {
            type: 'choice',
            instructions: `Classify current trust evidence from reliance, disclosure, follow-through, deception, betrayal, or refusal. ${posture}`,
            criteria: { none: 'No meaningful trust evidence occurs.', positive: 'Concrete evidence supports increased trust.', negative: 'Concrete evidence supports increased distrust.', mixed: 'Positive and negative trust evidence coexist.', unclear: 'The trust signal cannot be distinguished.' },
        },
        intimacy_signal: {
            type: 'choice',
            instructions: `Classify current emotional or relational intimacy evidence. Physical proximity or sexual activity alone is insufficient. ${posture}`,
            criteria: { none: 'No meaningful intimacy evidence occurs.', positive: 'Voluntary vulnerability, mutual understanding, or personal closeness supports increased intimacy.', negative: 'Withdrawal, rejection, violation, or emotional distance supports reduced intimacy.', mixed: 'Positive and negative intimacy evidence coexist.', unclear: 'The intimacy signal cannot be distinguished.' },
        },
        romance_evidence: {
            type: 'choice',
            instructions: `Classify romantic evidence conservatively. Attraction, sex, jealousy, possession, protection, proximity, or genre alone do not establish romantic love. ${posture}`,
            criteria: { none: 'No romantic evidence occurs.', attraction: 'Only attraction, sexual tension, jealousy, possession, or proximity is supported.', established: 'Explicit or accumulated character-specific romantic investment is evidenced.', counter: 'Concrete evidence weighs against romantic investment or reciprocity.', mixed: 'Romantic and counterevidence coexist.', unclear: 'The evidence cannot be distinguished.' },
        },
        counterevidence: {
            type: 'choice',
            instructions: 'Does observed RP contain concrete evidence that limits a proposed increase in trust, intimacy, romance, or relationship closeness? Judge the observation only; an OOC direction or desired next beat is not evidence.',
            criteria: {
                none: 'No material limiting evidence is present.',
                limited: 'A specific reservation or contrary cue limits the size or meaning of the change.',
                clear: 'Concrete conduct directly contradicts the proposed escalation.',
                mixed: 'Supporting and limiting evidence both materially matter.',
                unclear: 'Relevant evidence exists, but its meaning cannot be distinguished reliably.',
                not_applicable: 'No closer relationship interpretation is being considered.',
            },
        },
        unresolved: {
            type: 'choice',
            instructions: `Identify the dominant unresolved element still active at the end of the recent exchange. ${posture}`,
            criteria: { none: 'No material unresolved element remains.', relationship: 'A relationship question or emotional issue remains.', conflict: 'An interpersonal confrontation or grievance remains.', goal: 'An action, task, decision, or objective remains.', information: 'A clue, secret, uncertainty, or needed explanation remains.', danger: 'An immediate threat or survival pressure remains.', multiple: 'Several unresolved elements are equally central.', unclear: 'The unresolved element cannot be distinguished.' },
        },
        context_change_source: {
            type: 'choice',
            instructions: 'Identify whether a materially new time, location, situation, access condition, or scene phase was actually established in the latest exchange, and who established it. A planned, threatened, intended, or merely suggested transition is not an established context change.',
            criteria: {
                none: 'No materially new scene opportunity was actually established.',
                user_established: 'The latest USER roleplay directly establishes the new time, place, situation, access condition, or phase.',
                character_established: 'The immediately prior CHARACTER output actually establishes it rather than merely planning or suggesting it.',
                both: 'Both the prior CHARACTER output and latest USER roleplay establish material parts of the new context.',
                unclear: 'A material context change may exist but its source or completion cannot be distinguished.',
            },
        },
        event_state: {
            type: 'choice',
            instructions: 'Classify the primary plot event, task, mystery, danger, negotiation, or practical problem currently in focus. A relationship conversation alone is not a plot event unless it has a concrete external objective or consequence.',
            criteria: { none: 'No primary event is active.', introduced: 'A concrete problem, objective, or question has just been established.', active: 'Participants are actively pursuing or confronting an established event.', turning: 'A discovery, loss, choice, or reversal has materially changed the event.', resolution_ready: 'The core information, access, choice, or action needed for resolution is now available.', aftermath: 'The central matter is resolved and its consequences are currently being handled.', unclear: 'Relevant event material exists but its current phase cannot be established reliably.' },
        },
        event_valence: {
            type: 'choice',
            instructions: 'Classify the current primary event by its immediate practical direction in the scene, not by genre mood or whether the writing is pleasant. Consider concrete opportunity, relief, success, danger, loss, obstruction, and cost. If no primary event is active, select neutral.',
            criteria: { positive: 'The event currently provides a concrete benefit, opportunity, relief, recovery, useful success, or favorable opening.', negative: 'The event currently imposes danger, loss, harm, pressure, obstruction, worsening conditions, or an adverse consequence.', mixed: 'The event currently carries both a concrete benefit and a concrete adverse cost or threat.', neutral: 'No active primary event exists, or its current practical direction is neither favorable nor adverse.', unclear: 'An event exists but its practical direction cannot be distinguished.' },
        },
        event_blocker: {
            type: 'choice',
            instructions: 'Identify the main thing preventing the current event from advancing or resolving. Select none when no active event exists or no material blocker remains.',
            criteria: { none: 'No active event or no material blocker.', information: 'A relevant fact, clue, explanation, or location is still missing.', action: 'A concrete attempt or follow-through has not yet been performed.', choice: 'A participant must make a consequential decision.', resource: 'Time, access, tools, money, personnel, safety, or another resource is insufficient.', resistance: 'A person, group, institution, or opponent is actively resisting.', external: 'An outside event, environment, interruption, or dependency blocks progress.', unclear: 'A blocker may exist but its type cannot be established.' },
        },
        resolution_readiness: {
            type: 'choice',
            instructions: 'Judge causal readiness to resolve the current primary event. Count established facts and executed actions, never message count, prose length, or how long the user has waited.',
            criteria: { none: 'The necessary cause, information, choice, or action is affirmatively absent.', partial: 'At least one useful condition is met, but a central obstacle or question remains.', core: 'The core conditions are met and a decisive attempt can now occur.', decisive: 'The decisive action has already been executed; the response can establish its result and consequences.', unclear: 'Relevant conditions exist but readiness cannot be established reliably.' },
        },
        npc_presence: {
            type: 'choice',
            instructions: 'Classify whether any non-user, non-primary-character NPC is participating or concretely entering the immediate scene. Distinguish mere mention from presence.',
            criteria: { none: 'No NPC is present, entering, or materially mentioned.', mentioned: 'An NPC is only mentioned, remembered, or offstage with no current entry or action.', present: 'One NPC is currently participating.', entering: 'An NPC contact, arrival, summons, or intervention is concretely underway.', multiple: 'Two or more NPCs are currently participating or entering.', unclear: 'NPC involvement is suggested but cannot be established reliably.' },
        },
        npc_valence: {
            type: 'choice',
            instructions: 'Classify the immediate practical direction of the participating or entering NPCs. Judge their current conduct and effect, not whether they are morally good or likable. When different NPCs pull in opposite directions, select mixed. If no NPC is active, select neutral.',
            criteria: { positive: 'The relevant NPCs currently provide concrete help, protection, cooperation, access, useful information, or a favorable opportunity.', negative: 'The relevant NPCs currently obstruct, exploit, threaten, harm, deceive, pressure, or impose an adverse consequence.', mixed: 'One NPC or several NPCs currently produce both favorable and adverse effects.', neutral: 'No NPC is active, or the NPC is presently independent/background without a material favorable or adverse effect.', unclear: 'NPC conduct exists but its practical direction cannot be established.' },
        },
        npc_knowledge_fit: {
            type: 'choice',
            instructions: 'Judge whether participating NPCs used only information available through witnessed events, explicit reports, public facts, or established role and access. Uncertainty wording, intuition, suspicion, body-language reading, coincidence, and genre convention do not excuse a conclusion whose content depends on private, offscreen, or narrator-only information.',
            criteria: { not_applicable: 'No participating NPC used relevant information.', fit: 'The information has an established source; any inference stays broad and follows only from cues that NPC actually observed.', overreach: 'The NPC states or correctly guesses an unavailable fact, cause, relationship, motive, plan, location, or private thought. If removing inaccessible narration would make the conclusion impossible, it is overreach even when phrased as a hunch or uncertainty.', unclear: 'An NPC used relevant information, but the recent text does not establish its source or accessibility well enough to classify fit versus overreach.' },
        },
        hesitation_drag: {
            type: 'choice',
            instructions: 'Detect whether repeated hesitation, aborted action, trailing speech, or near-decisions are now obstructing narrative movement. Ordinary uncertainty or one meaningful pause is not a failure.',
            criteria: { no: 'Hesitation is absent, brief, meaningful, or followed by action.', yes: 'The character repeatedly approaches the same statement or action without committing despite having enough motive and information to do something concrete.' },
        },
        refusal_stall: {
            type: 'choice',
            instructions: 'Detect whether refusal is being rendered so rigidly or repetitively that all interaction and narration stop. Preserve genuine refusal, boundaries, characterization, and non-consent.',
            criteria: { no: 'The refusal is clear and the scene still develops through action, consequence, alternatives, conflict, or departure.', yes: 'The same refusal repeatedly ends the response without a new action, consequence, demand, alternative, or change in the interaction.' },
        },
        circularity: {
            type: 'choice',
            instructions: 'Detect whether the recent exchange circles the same content without adding a material action, fact, consequence, tactic, or choice. Repetition that intentionally escalates or changes consequences is not circular.',
            criteria: { no: 'The exchange adds or changes something material.', yes: 'The same position, emotion, threat, explanation, or question is repeatedly paraphrased while the interaction remains materially unchanged.' },
        },
        user_handoff: {
            type: 'choice',
            instructions: 'Detect whether the latest character output uses a closing question to transfer narrative labor to the user instead of executing the non-user character\'s available intent. Count forced either/or menus, asking where or how the user wants the character positioned, permission-seeking, generic solicitation, invented countdowns or deadlines demanding a choice, and a question that merely restates a decision the character could make. A natural question is allowed only when the user is genuinely the next unresolved participant and it materially advances the live interaction. Never require writing the user\'s dialogue, feelings, consent, or actions.',
            criteria: { no: 'Non-user characters first perform their own supported speech, choices, and actions. Any closing question is specifically necessary because the user is the next unresolved participant.', yes: 'The output ends on a question, option menu, permission request, deadline, or demand for direction that substitutes for an available non-user action or exists mainly to hand back the turn.' },
        },
        input_echo: {
            type: 'choice',
            instructions: 'Detect whether the latest character output repeats the user input merely to prove recognition. Include quotation, translation, paraphrase, summary, reenactment, answering every minor point in order, repeated numbers or dates, recalculation, and indirect equivalents. Preserve necessary factual reference when it changes the response or consequence.',
            criteria: { no: 'The output begins from the response, action, consequence, or next development; any repeated detail is necessary to what changes now.', yes: 'The output spends material space quoting, translating, paraphrasing, enumerating, reenacting, recalculating, or individually acknowledging information already established by the user.' },
        },
        repetitive_ending: {
            type: 'choice',
            instructions: 'Across the recent character outputs, detect repeated closing architecture rather than repeated wording alone: recurring question endings, either/or choices, countdowns, passive waiting, a final stare or pause, or the same action-then-question sequence. Judge only when at least two character outputs are available.',
            criteria: { no: 'The recent endings vary naturally or only one comparable character output exists.', yes: 'At least two recent outputs use materially the same closing device and it makes the roleplay feel formulaic or repeatedly hands continuation back to the user.' },
        },
        action_evasion: {
            type: 'choice',
            instructions: 'Detect whether established anger, violence, hostile pressure, negative-bias consequences, threats, or other active execution requirements are repeatedly softened into atmosphere, posture, vague implication, warnings, or aborted action despite means and opportunity. Do not demand unsupported violence or override a concrete blocking cause.',
            criteria: { no: 'Required conduct is executed concretely, or a specific established cause prevents it.', yes: 'The text repeatedly signals imminent or required conduct but evades actual speech, action, follow-through, or consequence without a concrete cause.' },
        },
        scene_cutoff: {
            type: 'choice',
            instructions: 'Detect whether the latest output summarizes, time-skips, fades out, or ends immediately before a selected or already-started action, response, or consequence is materially executed.',
            criteria: { no: 'The current beat is executed or stops at a natural point for the user response.', yes: 'The output cuts away, summarizes, or hands off immediately before a non-user action or consequence that should occur now.' },
        },
    };
    if (preferences.villainEnabled) {
        questions.villain_route = {
            type: 'choice',
            instructions: 'Choose an antagonist route using the selected conservative, balanced, or active routing style. Existing opponents may act through established motives, access, and consequences; a new opponent needs a plausible role and entry route, then remains subject to the configured appearance draw. Do not invent access, hidden knowledge, or an interruption that overrides a live user interaction. Retire or replace only when the old role is conclusively finished.',
            criteria: hasVillain ? {
                none: 'No antagonist intervention is needed or it would disrupt meaningful active material.',
                continue: 'The stored antagonist has a plausible current opening to continue or re-enter.',
                retire: 'The stored antagonist\'s conflict and role are conclusively finished; absence alone is insufficient.',
                replace: 'The stored antagonist\'s role is finished and a distinct opponent has plausible motive and access.',
            } : {
                none: 'No antagonist intervention suits this response.',
                create: 'A distinct opponent with a concrete motive, function, and plausible access may enter the configured appearance draw.',
            },
        };
    }

    const relationshipRule = {
        slow: `Require unusually clear, sustained, character-specific causes for relationship change; otherwise hold or choose only an incremental change. Prior qualified relationship causes: closer ${Number(pacingState?.relationship?.closer) || 0}, distant ${Number(pacingState?.relationship?.distant) || 0}.`,
        medium: `Allow a proportionate relationship change when the current exchange contains concrete reciprocal causes. Prior qualified relationship causes: closer ${Number(pacingState?.relationship?.closer) || 0}, distant ${Number(pacingState?.relationship?.distant) || 0}.`,
        fast: 'Allow a clear relationship change from strong current reciprocal evidence, while never inventing reciprocity, consent, or romance. Speed lowers the accumulation required; it does not create evidence.',
    }[preferences.relationshipPace] || 'Allow a proportionate relationship change when the current exchange contains concrete reciprocal causes.';
    questions.relationship_pacing = {
        type: 'choice',
        instructions: `Choose the direction and maximum amount of relationship movement permitted in the NEXT response. This is a plan, not proof that the movement has occurred. Base it on actual RP conduct, the established relationship, relevant counterevidence, and the selected relationship pace. When an event or NPC also moves, any relationship change must arise within that same interaction, not from a second invented exchange. The fixed relationship direction remains active. Do not create love, trust, consent, reconciliation, or rupture merely to satisfy a pace setting. Commit a change to stored state only after the following CHARACTER output actually enacts it and verification confirms it. ${relationshipDirectionRule} ${relationshipRule}`,
        criteria: {
            hold: 'Keep the current relationship state; this exchange adds no sufficient cause for change at the selected pace.',
            closer_incremental: 'One small increase in openness, trust, intimacy, cooperation, or favorable regard is supported.',
            closer_significant: 'A decisive event or strong reciprocal conduct supports a clear move toward closeness now.',
            distant_incremental: 'One small increase in distrust, friction, guardedness, rejection, or distance is supported.',
            distant_significant: 'A decisive event or strong conduct supports a clear move toward rupture, hostility, or distance now.',
        },
    };
    questions.relationship_beat = {
        type: 'choice',
        instructions: 'Choose at most one concrete relationship or romance beat for the next response. This is an expression route, not permission to invent a feeling. It may color an ongoing event or NPC exchange only when it belongs to that same interaction; do not add a separate scene. It must agree with the fixed relationship direction, the selected pace, established characterization, and actual evidence. Prefer none over a repetitive or unsupported beat.',
        criteria: {
            none: 'No distinct relationship beat is supported or the active interaction should continue without adding one.',
            avoidance: 'An active relationship question, feeling, demand, or decision can be meaningfully avoided, delayed, concealed, or deflected.',
            rejection: 'A person has a supported reason to refuse, set a boundary, deny reciprocity, or reject a relationship claim.',
            confession: 'Accumulated or decisive current causes support directly revealing a feeling, desire, fear, grievance, or relationship intention.',
            inner_outer_gap: 'A supported private motive or feeling conflicts with outward conduct, and one concrete mismatch can affect the interaction.',
            vulnerability: 'A specific disclosure, reliance, admission, or request would be character-consistent and carry genuine interpersonal risk.',
            jealousy_friction: 'Established attachment, rivalry, insecurity, resentment, or possessiveness supports an actual choice or confrontation.',
            repair: 'Prior harm or distance exists and a concrete attempt at repair is supported, without guaranteeing acceptance or reconciliation.',
            commitment: 'A decisive cause supports changing priority, exclusivity, loyalty, access, responsibility, or the acknowledged relationship.',
        },
    };

    const cadenceRule = {
        slow: 'Prefer linger only for a genuinely consequential emotional, sensory, or decision beat; otherwise remain natural.',
        medium: 'Compress incidental remarks and connective material, while giving the single scene-changing beat enough space.',
        fast: 'Prefer compress unless an immediate decisive action, revelation, or relationship turn would become unclear.',
    }[preferences.roleplayPace] || 'Compress incidental material and give the single scene-changing beat enough space.';
    questions.response_cadence = {
        type: 'choice',
        instructions: `Choose the response granularity, not relationship or event progress. Judge salience rather than message length. ${cadenceRule}`,
        criteria: {
            compress: 'Most input details are repetition, connective material, minor remarks, already-understood context, or steps that can pass implicitly; center one consequential continuation.',
            natural: 'One primary beat and at most one directly dependent secondary beat need ordinary scene space.',
            linger: 'A decisive action, revelation, sensory turning point, or emotionally consequential moment needs close treatment to remain intelligible and effective.',
        },
    };

    questions.primary_focus = {
        type: 'choice',
        instructions: 'Choose the one function that should lead the next response. Finish an already-started action or answer the active interaction before adding optional material. A calm scene can still admit a causally available event or NPC; calmness alone is neither a reason to create one nor a reason to forbid one. If a proposed route is unavailable, preserve an executable direct response instead of treating the turn as empty.',
        criteria: {
            direct: 'Respond to the user\'s immediate speech, choice, or already-started action.',
            relationship: 'The active relationship question or interpersonal change should receive the main development.',
            event: 'The established primary event should receive the main action, clue, obstacle, result, or resolution.',
            conflict: 'An actual active confrontation or immediate threat requires execution.',
            npc: 'An established or concretely entering NPC or antagonist should make the main move.',
            ...(newEventEnabled ? { new_event: 'No stronger unfinished focus exists and one new event compatible with the selected world and progression controls can enter without disrupting the scene.' } : {}),
            transition: 'The active beat has a natural handoff into another time, place, or phase.',
        },
    };

    if (progressionMode !== 'off' && !(preferences.advancedEnabled && hasEvent && eventSource === 'advanced')) {
        const eventCriteria = hasEvent ? {
            none: 'Keep the stored event in the background this response without erasing it.',
            continue: 'The stored event should take one concrete step now.',
            retire: 'The stored event is conclusively complete and only its consequences remain.',
            replace: 'The stored event is conclusively complete and a distinct new event has a plausible opening.',
        } : {
            none: 'No event route needs an instruction in this response.',
            continue: 'An already established RP event, goal, external pressure, or consequence can take one concrete step even though the extension has no stored event profile.',
            create: 'A distinct new central event has a plausible causal opening and may enter the configured probability draw.',
        };
        questions.event_route = {
            type: 'choice',
            instructions: 'Choose one event route for the next response. An existing RP event can move without an extension-stored profile; its clue, contact, obstacle, or consequence is continuation, not a newly invented central event. Create only means eligibility for the configured draw, never guaranteed occurrence. Favor the selected conservative, balanced, or active routing style while preserving world rules, access, causality, and the current interaction. An event is not completed merely because it was absent from recent messages.',
            criteria: eventCriteria,
        };
        questions.progression_move = {
            type: 'choice',
            instructions: 'Choose one concrete plot function supported by the active scene, stored event, established consequences, or setting-compatible opportunity. In active mode, prefer an executable step over passive repetition, but do not manufacture a cause, force a time jump, or accelerate relationship change. If a new-event route fails, an existing event, relationship pressure, current interaction, or prior action may still move.',
            criteria: {
                hold: 'The current interaction already has meaningful unfinished material and needs no added movement.',
                advance: 'One existing aim, event, or thread should move through concrete action or consequence.',
                complication: 'A causally grounded obstacle or pressure would create needed movement without replacing the scene.',
                positive: 'An earned or causally available favorable development is appropriate now.',
                reveal: 'A limited relevant clue or piece of information would meaningfully advance the current material.',
                consequence: 'An earlier choice, action, delay, promise, mistake, or event should now produce a concrete result.',
                turning_point: 'A causally prepared change should alter the current objective, leverage, theory, danger, or available choices.',
                transition: 'The current beat has a natural handoff into a later time, place, or distinct phase.',
            },
        };
    }
    const npcRouteCriteria = {
        none: 'No NPC entry or independent NPC action suits this response.',
        reuse: 'An established person has a plausible current function and access; reuse does not require a newly generated profile.',
        background: 'An established NPC should remain present or available without an independent move.',
        ...(progressionMode !== 'off' || preferences.advancedEnabled ? { create: 'A new non-villain person with a concrete function and plausible access may enter the configured appearance draw; necessity is not required.' } : {}),
        ...(hasNpc ? { retire: 'The stored NPC role is conclusively complete; absence alone is insufficient.', replace: 'The stored NPC role is complete and a distinct person has a plausible function now.' } : {}),
    };
    questions.npc_route = {
        type: 'choice',
        instructions: 'Choose the NPC route once, separately from registered Sheet Cast presence. A registered person being active does not prohibit another suitable NPC from entering. Reuse a fitting established person when possible; a new person needs a concrete scene function, plausible access, and world compatibility, then remains subject to the configured draw. The routing style controls openness; it does not grant knowledge or change a person\'s identity. A meaningful active exchange may take priority this response without making a candidate impossible.',
        criteria: npcRouteCriteria,
    };
    questions.npc_role = {
        type: 'choice',
        instructions: 'Independently choose the most plausible function IF the proposed NPC route is used. The extension ignores this answer if no NPC route survives. Do not assume another Jev question was already answered.',
        criteria: {
            participant: 'The NPC is directly affected and has something concrete to gain, lose, decide, or protect.', witness: 'The NPC can contribute an observation from direct presence.', information: 'The NPC controls or carries relevant information.', support: 'The NPC can provide bounded help, access, labor, or resources.', gatekeeper: 'The NPC controls access, permission, procedure, or entry.', opposition: 'The NPC has a concrete opposed interest.', mediator: 'The NPC has reason to intervene between opposed participants.', authority: 'The NPC can exercise established institutional, social, or practical authority.', exploiter: 'The NPC can use the active conflict or uncertainty for a specific advantage.', consequence: 'The NPC carries a social, practical, institutional, or personal result of an earlier action.', protector: 'The NPC has a supported reason and ability to protect or rescue.', self_directed: 'The NPC should pursue an immediate objective independent of helping or opposing the main participants.',
        },
    };
    questions.npc_weight = {
        type: 'choice',
        instructions: 'Independently choose the maximum space the NPC route could use IF selected. The extension ignores this answer when no NPC route survives. Preserve the primary character and active interaction.',
        criteria: { background: 'Presence or continuity should remain without a new intervention.', brief: 'One proportionate reaction is enough.', supporting: 'One material supporting action or decision is needed.', primary: 'The NPC has the strongest causal reason to make the main move now.', exit: 'The NPC should leave, withdraw, lose access, or return to their own concern.' },
    };
    questions.npc_knowledge = {
        type: 'choice',
        instructions: 'Choose the narrowest established knowledge source the active NPC may rely on now. Never grant narration, private thoughts, or offscreen facts without established access. A hunch may describe only a broad surface state supported by cues this NPC observed; it may not correctly identify the hidden truth.',
        criteria: { none: 'The NPC lacks relevant knowledge and may not infer the relevant hidden state.', direct: 'Only directly witnessed or experienced facts are available.', reported: 'The NPC relies on an explicit report and inherits its omissions or errors.', role_based: 'Relevant knowledge follows from established profession, position, affiliation, or access.', public: 'Only public, ordinary, or locally observable information is available.', partial: 'Observed cues support only a broad uncertain impression, with multiple explanations left open and no identification of the hidden fact.', privileged: 'Private or internal information is available through explicitly established access.' },
    };
    questions.npc_disclosure = {
        type: 'choice',
        instructions: 'If the NPC has relevant information, choose how their motive and current stake govern its use. Otherwise select none.',
        criteria: { none: 'No information use is needed.', open: 'Plain disclosure serves the NPC\'s motive.', selective: 'The NPC has reason to reveal only a useful portion.', conditional: 'The NPC requires a concrete price, favor, protection, proof, or exchange.', withhold: 'A specific interest, fear, obligation, or relationship supports concealment.', distort: 'A supported motive and concrete stake support omission or deception.', uncertain: 'The NPC should distinguish observation, report, assumption, and uncertainty.' },
    };
    Object.assign(questions, buildAdvancedQuestions({
        preferences,
        hasEvent,
        worldHint: preferences.worldHint || '',
        eventTitle: preferences.advancedEventTitle || '',
        eventElement: preferences.advancedEventElement || '',
    }));
    if (preferences.developmentStyle) {
        delete questions.response_cadence;
        questions.progress_need = {type:'choice', instructions:'Compare actual recent CHARACTER outputs with their preceding exchanges. Did anything meaningful change in dialogue, feelings, thoughts, a choice, action, or consequence? Quiet relational/emotional movement counts. Use stalled only for repeated content or preparation without a new step; waiting for a necessary user choice is not failure. Never demand that every issue be resolved.', criteria:{flowing:'Meaningful interaction or change is continuing.',stalled:'Actual outputs keep repeating, preparing, or deferring without a meaningful step.',unclear:'Not enough comparable outputs.'}};
        questions.basic_move = { type:'choice', instructions:`Choose how the current RP should keep moving, including inside an advanced event. ${DEVELOPMENT_GUIDANCE[preferences.developmentStyle]} This is the manner of carrying the selected main beat, not an extra independent plot. Respect the main prompt's narrative speed, genre, and style.`, criteria:BASIC_MOVES };
        // Basic movement continues without drawing a separate event.
        if (!preferences.advancedEnabled) delete questions.primary_focus.criteria.new_event;
        if (questions.event_route) {
            delete questions.event_route.criteria.create;
            delete questions.event_route.criteria.replace;
            questions.event_route.instructions = 'Manage an already established event only: continue, keep in the background, or retire a completed stored event. Do not create or replace an event here. New independent events are available only through enabled advanced progression.';
        }
        const guide = DEVELOPMENT_GUIDANCE[preferences.developmentStyle] + ' Static/dynamic changes the medium of movement only, never the evidentiary bar. Even the most cautious setting should allow an ordinary response, attempt, emotion, or small consequence without requiring a major event.';
        for (const key of ['primary_focus','progression_move','npc_route','villain_route','relationship_beat','advanced_route','advanced_move']) {
            if (questions[key]) questions[key].instructions += `\nBasic development tendency: ${guide} This applies inside advanced events too. Follow the main prompt's genre and narrative pace; do not determine prose length or descriptive density here.`;
        }
        questions.relationship_pacing.instructions += '\nSlow: normally allow only incremental movement; reserve major changes for accumulated causes. Balanced: allow changes proportionate to clear current conduct. Fast: allow a warranted major change without repeated accumulation, never fabricate it. This applies to both closeness and distance. Never replay the same interaction just to delay change.';
    }
    return questions;
}
