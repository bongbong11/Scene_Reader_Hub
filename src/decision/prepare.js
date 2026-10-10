import {selectActiveContinuity, confirmedContinuity} from '../continuity/selection.js';
import {confirmedEvolution} from '../character/evolution.js';
import {makeOpportunities} from '../scene/opportunities.js';
import {addOpportunityQuestions} from '../scene/opportunity-policy.js';
import {searchCharacterRecords} from '../retrieval/character-search.js';
import {drawOpportunityKey} from '../scene/draw-opportunity.js';
import {generatedActorCandidates} from '../scene/generated-cast.js';

import {stateForEntry} from "../characters/state-contract.js";
import {buildSexualQuestions, sexualEligible} from "../characters/sexual-conduct.js";
import {prepareKnowledgeVault} from '../integration/knowledge-vault.js';

export function createDecisionPreparation(deps) {
async function prepareQuestions(run,frame) {
if (frame.prefs.settingsContract >= 3) {
        const offerKey=drawOpportunityKey({identity:run.identity,chat:deps.getContext().chat,pendingUserText:frame.pendingUserText,type:deps.pendingGenerationType,pendingPlan:frame.rec.pendingPlan,excluded:frame.rec.nonRpOutputIndices||[]});
        frame.rec.drawOpportunityKey=offerKey;
        frame.opportunityOffers=makeOpportunities(frame.rec,offerKey,{worldId:frame.world?.id,worldName:frame.world?.name});
        frame.rec.appearanceOffer={...frame.opportunityOffers.person,candidates:undefined};
        frame.rec.lastNpcRoll={...frame.opportunityOffers.person,candidates:undefined};

    }
    frame.generatedNpcTargets=generatedActorCandidates(frame.rec,'npc');
    frame.generatedVillainTargets=generatedActorCandidates(frame.rec,'villain');
    (frame.questionPrefs = {
        ...frame.prefs,
        worldHint: frame.world?.hint || '',
        advancedEventTitle: frame.rec.eventProfile?.title || '',
        advancedEventElement: frame.rec.eventProfile?.source === 'advanced' ? frame.rec.eventProfile.element || '' : '',
    });
    (frame.questions = deps.buildQuestions({
        preferences: frame.questionPrefs,
        hasVillain: Boolean(frame.rec.villainProfile || frame.generatedVillainTargets.length),
        hasNpc: Boolean(frame.rec.npcProfile && frame.rec.npcProfile.status !== 'retired'),
        hasEvent: Boolean(frame.rec.eventProfile),
        eventSource: frame.rec.eventProfile?.source || '',
        pacingState: { ...frame.rec.pacingState, progression: frame.rec.progressionState },
    }));
    if (frame.prefs.advancedEnabled) frame.questions.advanced_world_rules = {type:'choice',instructions:'From explicit current world rules, recent RP and supplied memory only: are supernatural mechanisms established? A horror label alone does not establish ghosts, curses or exorcism. This is world evidence, never an invitation to invent.',criteria:{mundane:'No supported supernatural mechanics.',supernatural:'Supernatural mechanics are established and compatible with this setting.',unclear:'Insufficient world evidence.'}};
    Object.assign(frame.questions, deps.buildVerificationQuestions(frame.rec.pendingPlan));
    frame.vaultCards = prepareKnowledgeVault(frame, deps.window?.KnowledgeVaultV1);
    frame.confirmedContinuity=confirmedContinuity(deps.continuityView(frame.rec),{record:frame.rec,chatRef:run.identity,chat:deps.getContext().chat,fingerprint:deps.stableFingerprint,inherited:Boolean(frame.rec.sharedReference||frame.rec.legacyCarryReferenceV1)});
    (frame.continuityContext = deps.settings.continuityEnabled ? selectActiveContinuity(frame.confirmedContinuity, frame.transcript, { opportunity: frame.rec.sceneOpportunity,actorIds:[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[])].filter(a=>frame.transcript.toLowerCase().includes(a.name.toLowerCase())||frame.sceneGate.participantIds.includes(a.id)).map(a=>a.id) }) : { items: [], knowledge: [], followups: [] });
    (frame.storedFollowupCandidates = frame.continuityContext.followups.map((item) => ({ id: item.id, type: 'followup', label: item.action, evidence: item.reason, data: { relatedStateId: item.relatedStateId, action: item.action, reason: item.reason }, sourceIdentity: item.sourceRefs?.[0] })));
    (frame.pendingCandidates = deps.settings.continuityEnabled
        ? [...deps.pendingExternalCandidates(frame.rec, frame.sourceKey), ...frame.storedFollowupCandidates.filter((item) => !(frame.rec.pendingContinuityCandidates || []).some((pending) => pending.id === item.id))].slice(0, 5)
        : []);
    Object.assign(frame.questions, deps.buildPendingCandidateQuestions(frame.pendingCandidates));
    (frame.carriedCharacterIds = [...new Set([...frame.sceneGate.participantIds,...(frame.rec.lastJudgment?.characterTrace || [])
        .filter((item) => (item?.presence || item?.final?.presence) && (item.presence || item.final.presence) !== 'absent')
        .map((item) => item.id)])]);
    (frame.activeCharacters = deps.selectActiveEntries(deps.characterStore, frame.transcript, deps.getContext().name2 || '', frame.carriedCharacterIds, { allowUserImpersonation: frame.prefs.allowUserImpersonation }));
    (frame.priorStates = new Map(frame.activeCharacters.map(entry => [entry.id, stateForEntry(frame.rawPriorStates.get(entry.id), entry)]).filter(([, state]) => state)));
    (frame.npcTargets = frame.activeCharacters.filter((entry) => entry.kind === 'npc').slice(0, 6));
    (frame.categoryHints = deps.characterCategoryHints(frame.worldRecordAnswers));
    frame.effectiveEvolution=deps.settings.continuityEnabled?confirmedEvolution(frame.rec,{chat:deps.getContext().chat,chatRef:run.identity,fingerprint:deps.stableFingerprint,store:deps.characterStore}):null;
    frame.retrievalResults = await searchCharacterRecords({entries:deps.characterStore.enabled ? frame.activeCharacters : [],
        shared:Boolean(frame.rec.sharedSource),recovery:frame.recoveryAttempt,priorStates:frame.priorStates,transcript:frame.retrievalTranscript || frame.transcript,identity:run.identity,retrieval:deps.vectorRetrieval,signal:run.controller.signal,evolution:frame.effectiveEvolution});
    run.assert();
    (frame.liveCharacters = deps.characterStore.enabled ? deps.buildLiveCharacterPlan(frame.activeCharacters, {
        selected: frame.context.selected.map((message) => ({ ...message, _sceneReaderIndex: deps.getContext().chat?.indexOf(message) ?? -1 })),
        transcript: frame.transcript, knowledge: frame.continuityContext.knowledge, memory: frame.memory, persona: deps.characterStore.persona, canonicalOnly: true, volume:frame.prefs.characterVolume, npcSlots:frame.prefs.npcRecordLimit, retrievalResults: frame.retrievalResults, categoryHints: frame.categoryHints, evolution:frame.effectiveEvolution,fingerprint:deps.stableFingerprint,
    }) : []);
    for (const person of frame.liveCharacters) person.priorState = frame.priorStates.get(person.id) || null;
    for (const person of frame.liveCharacters) person.sexualConductManaged = sexualEligible(person);
    if (deps.characterStore.characters.length === 1 && !deps.characterStore.characters[0].cardCast) {
        const primary = frame.liveCharacters.find((person) => person.id === deps.characterStore.characters[0].id);
        if (primary) primary.mainSillyTavernName = deps.getContext().name2 || '';
    }
    if (deps.characterStore.enabled) Object.assign(frame.questions, deps.buildCharacterTurnQuestions(frame.liveCharacters,frame.sceneGate.participationObservations||{}));
    deps.noteDiagnostic?.('character_protection_candidates', { module:'character/record-protection + record-questions',
        baselineCount:frame.liveCharacters.reduce((sum,p)=>sum+(p.prefilterStats?.baselineCandidateCount ?? p.profileCandidates.length),0),
        supplementalCount:frame.liveCharacters.reduce((sum,p)=>sum+(p.protectedCandidateIds?.length || 0),0),
        requestChars:frame.liveCharacters.reduce((sum,p)=>sum+(p.prefilterStats?.protectedRequestChars || 0),0),
        unreviewedCount:frame.liveCharacters.reduce((sum,p)=>sum+(p.prefilterStats?.protectedOmittedByChars || 0)+(p.prefilterStats?.protectedOmittedByLimit || 0)+(p.prefilterStats?.protectedOmittedByRequest || 0),0),
        fallbackCount:frame.liveCharacters.filter(p=>p.prefilterStats?.protectionFallback).length });
    Object.assign(frame.questions, buildSexualQuestions(frame.liveCharacters, frame.prefs.physicalIntimacyPace));

    frame.questions.npc_target = {
        type: 'choice',
        instructions: 'Only if an existing NPC is routed to act, select the specific established person with a plausible current role and access. This selects identity, not knowledge or conduct. Judge independently from the other questions.',
        criteria: {
            none: 'No specific existing NPC is supported or no NPC route is needed.',
            ...Object.fromEntries(frame.generatedNpcTargets.map((profile,index)=>[`generated_${index}`,`Previously established generated NPC: ${profile.role||profile.id}. Reuse only with present role and access.`])),
            ...(frame.rec.npcProfile ? { stored_generated: 'The extension-stored generated NPC fits this role.' } : {}),
            ...Object.fromEntries(frame.npcTargets.map((entry, index) => [`sheet_${index}`, `Registered person ${entry.name} (${entry.npcRole || 'mixed'}) fits this role without changing their established identity or knowledge.`])),
            scene_existing: 'An already established person in the recent RP, not a new creation, fits this role.',
        },
    };
    if(frame.generatedVillainTargets.length)frame.questions.villain_target={type:'choice',instructions:'For a continuing villain route only, select the established antagonist with present motive and access. This does not summon an absent actor or add knowledge.',criteria:{current:'Use the currently stored antagonist.',...Object.fromEntries(frame.generatedVillainTargets.map((profile,index)=>[`generated_${index}`,`Previously established antagonist: ${profile.motive||profile.id}.`]))}};
    // The common scene router chooses who may enter; the sheet system owns how a registered person behaves.
    if (deps.isFranchiseWorld(frame.world)) frame.questions.npc_identity_route = {
        type: 'choice', instructions: 'If a new NPC is needed, choose a naturally present canon person, a setting-compatible original, an existing person, or a group. Presence must follow location, time, role, access, and continuity. Do not create a duplicate of a registered sheet character.',
        criteria: { none: 'No NPC route.', reuse_existing: 'An established NPC fits.', canon_natural: 'A canon character naturally occupies the role.', original_major: 'A lasting original NPC fits.', original_minor: 'A temporary original NPC fits.', group: 'A group fits.' },
    };
    if (frame.opportunityOffers) addOpportunityQuestions(frame.questions,frame.opportunityOffers,frame.rec);
    (frame.structuredCharacterContext = frame.liveCharacters.length ? {
        policy: deps.CHARACTER_LIVE_SYSTEM,
        npcRolePolicy: 'NPC villain, ally, or mixed is a broad role hint, not a personality or knowledge override. Use the stored records and actual RP to judge this person\'s specific motives and conduct. An ally may disagree; a villain may cooperate for a reason.',
        // Only compiled records and live context may cross the Jev boundary.
        // Keep local sheet, lorebook, bank provenance, and legacy excerpts out.
        people: frame.liveCharacters.map(({ index, id, name, kind, npcRole, recordStatus, recordMode, profileCandidates, contextCandidates }) =>
            ({ index, id, name, kind, npcRole, recordStatus, recordMode,
                profileCandidates: profileCandidates.map(item => ({id:item.id,type:item.type||item.kind,target:item.target})), contextCandidates })),
    } : null);

    deps.judgeInFlight = true;
    deps.judgeCompletionPromise = new Promise((resolve) => { deps.resolveJudgeCompletion = resolve; run.resolveDecision = resolve; });
    deps.setBusy(true);
    deps.updateStatus('Jev 판독 중…');
    deps.updateActivity(frame.mixedOoc ? 'OOC 지시 확인 · Jev가 RP 장면을 판독하고 있습니다…' : 'Jev가 최근 장면을 판독하고 있습니다…');
    
 deps.noteDiagnostic?.('appearance_offer',{passed:Boolean(frame.rec.appearanceOffer?.passed),chance:frame.rec.appearanceOffer?.chance||0,roll:frame.rec.appearanceOffer?.roll||0,availableNpc:true,availableVillain:Boolean(frame.rec.preferences.villainEnabled),storedNpcStatus:frame.rec.npcProfile?.status||'absent',kind:frame.rec.appearanceOffer?.kind||''});
}
return {prepareQuestions};
}
