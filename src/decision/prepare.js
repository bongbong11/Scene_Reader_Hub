import {activityQuestions} from './activity-questions.js';
import {progressComparison} from '../scene/progress-tracking.js';
import {selectTurnContinuity} from '../continuity/turn-context.js';
import {continuityActors} from '../continuity/actors.js';
import {makeOpportunities} from '../scene/opportunities.js';
import {addOpportunityQuestions} from '../scene/opportunity-policy.js';
import {searchCharacterRecords} from '../retrieval/character-search.js';
import {drawOpportunityKey} from '../scene/draw-opportunity.js';
import {generatedActorCandidates} from '../scene/generated-cast.js';

import {stateForEntry} from "../character/state-contract.js";
import {buildSexualQuestions, sexualEligible} from "../character/sexual-conduct.js";
import {prepareKnowledgeVault} from '../integration/knowledge-vault.js';
import {conflictTacticQuestion} from './npc-tactics.js';
import {castBeats,castQuestions,CAST_LIMIT} from '../scene/cast-binding.js';
import {selectReferencedCast} from '../character/selection.js';
import {recordBankIsCurrent} from '../character/records.js';
import {storyElements,storyDirectionQuestion,storyDirectionBeat} from '../world/story-direction.js';

export function createDecisionPreparation(deps) {
async function prepareQuestions(run,frame) {
if (frame.prefs.settingsContract >= 3) {
        const offerKey=drawOpportunityKey({identity:run.identity,chat:deps.getContext().chat,pendingUserText:frame.pendingUserText,type:deps.pendingGenerationType,pendingPlan:frame.rec.pendingPlan,excluded:frame.rec.nonRpOutputIndices||[]});
        frame.rec.drawOpportunityKey=offerKey;
        if(frame.npcOpportunityPreview?.key===offerKey){
            frame.opportunityOffers=frame.npcOpportunityPreview.offers;
            frame.rec.opportunities=frame.npcOpportunityPreview.history;
        }else frame.opportunityOffers=makeOpportunities(frame.rec,offerKey,{worldId:frame.world?.id,worldName:frame.world?.name});
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
    Object.assign(frame.questions, deps.buildVerificationQuestions(frame.rec.pendingPlan), activityQuestions(frame.prefs.worldAgencyEnabled));
    frame.progressComparison=progressComparison(deps.getContext().chat, {excluded:frame.rec.nonRpOutputIndices||[],selected:frame.context.selected,transcript:frame.transcript,blockedTurn:frame.rec.progressionState?.blockedTurn});
    frame.vaultCards = prepareKnowledgeVault(frame, deps.window?.KnowledgeVaultV1, deps.noteDiagnostic);
    frame.continuityActors=continuityActors(deps.characterStore,deps.getContext(),frame.transcript,frame.sceneGate.participantIds);
    frame.continuityContext=selectTurnContinuity(deps.continuityView(frame.rec),{record:frame.rec,chatRef:run.identity,chat:deps.getContext().chat,fingerprint:deps.stableFingerprint,inherited:Boolean(frame.rec.sharedReference||frame.rec.legacyCarryReferenceV1)},{enabled:deps.settings.continuityEnabled,transcript:frame.transcript,actorIds:frame.continuityActors});
    frame.storedFollowupCandidates=[];
    frame.pendingCandidates=[];
    (frame.carriedCharacterIds = [...new Set([...frame.sceneGate.participantIds,...(frame.rec.lastJudgment?.characterTrace || [])
        .filter((item) => (item?.presence || item?.final?.presence) && (item.presence || item.final.presence) !== 'absent')
        .map((item) => item.id)])]);
    (frame.activeCharacters = deps.selectActiveEntries(deps.characterStore, frame.transcript, deps.getContext().name2 || '', frame.carriedCharacterIds, { allowUserImpersonation: frame.prefs.allowUserImpersonation }));
    (frame.priorStates = new Map(frame.activeCharacters.map(entry => [entry.id, stateForEntry(frame.rawPriorStates.get(entry.id), entry)]).filter(([, state]) => state)));
    (frame.npcTargets = frame.activeCharacters.filter((entry) => entry.kind === 'npc').slice(0, 6));
    frame.castBeats=frame.prefs.advancedEnabled?castBeats(frame.opportunityOffers,frame.rec.eventProfile):[];
    frame.storyElements=storyElements(frame.prefs);
    if(frame.storyElements.length){
        frame.questions.story_element=storyDirectionQuestion(frame.storyElements);
        frame.castBeats.push(storyDirectionBeat(frame.storyElements));
    }
    const castQuery=frame.castBeats.map(beat=>beat.text).join('\n');
    const currentNpcIds=new Set(frame.activeCharacters.filter(entry=>entry.kind==='npc').map(entry=>entry.id));
    const prospective=deps.characterStore.npcs.filter(entry=>!currentNpcIds.has(entry.id));
    frame.castSheets=frame.castBeats.length&&deps.characterStore.enabled
        ?[...frame.activeCharacters.filter(entry=>entry.kind==='npc'&&recordBankIsCurrent(entry)),...selectReferencedCast(prospective,`${castQuery}\n${frame.transcript}`,frame.npcReferences,{fallbackLimit:CAST_LIMIT})]:[];
    // Current speakers retain all their slots. Prospective candidates share the
    // same six-person request ceiling and never become participation evidence.
    const activeIds=new Set(frame.activeCharacters.map(entry=>entry.id));
    const future=frame.castSheets.filter(entry=>!activeIds.has(entry.id)).slice(0,Math.max(0,6-frame.activeCharacters.length));
    const retained=new Set([...activeIds,...future.map(entry=>entry.id)]);
    if(frame.castBeats.length)deps.noteDiagnostic?.('event_cast_candidates',{module:'src/decision/prepare.js',registeredCount:frame.castSheets.length,omittedByCapacity:frame.castSheets.filter(entry=>!retained.has(entry.id)).length,currentCount:frame.activeCharacters.length,prospectiveCount:future.length,
        recordSearchEnabled:Boolean(deps.characterStore.enabled),pagedSeedCount:deps.characterStore.enabled?deps.characterStore.npcs.filter(entry=>entry.recordBank?.pagedRecords).length:0});
    frame.castSheets=frame.castSheets.filter(entry=>retained.has(entry.id));
    if(frame.npcReferenceCandidates)deps.noteDiagnostic?.('npc_reference_search',{module:'src/decision/prepare.js',registeredCount:deps.characterStore.npcs.length,
        currentCount:currentNpcIds.size,prospectiveCount:future.length,skippedCount:[...(frame.npcReferences?.values()||[])].filter(value=>value==='skip').length,
        fallbackCount:prospective.filter(entry=>!['reference','skip'].includes(frame.npcReferences?.get(entry.id))).length});
    frame.castGenerated=[frame.rec.npcProfile,frame.rec.villainProfile,...frame.generatedNpcTargets,...frame.generatedVillainTargets]
        .filter((item,index,all)=>item&&item.status!=='retired'&&all.findIndex(other=>other?.id===item.id)===index).slice(0,8);
    (frame.categoryHints = deps.characterCategoryHints(frame.worldRecordAnswers));
    frame.retrievalResults = await searchCharacterRecords({entries:deps.characterStore.enabled ? [...frame.activeCharacters,...future] : [],
        transcripts:new Map(frame.castSheets.map(entry=>[entry.id,`${frame.retrievalTranscript||frame.transcript}\n${castQuery}`])),
        shared:Boolean(frame.rec.sharedSource),recovery:frame.recoveryAttempt,priorStates:frame.priorStates,transcript:frame.retrievalTranscript || frame.transcript,identity:run.identity,retrieval:deps.vectorRetrieval,signal:run.controller.signal});
    run.assert();
    (frame.liveCharacters = deps.characterStore.enabled ? deps.buildLiveCharacterPlan(frame.activeCharacters, {
        selected: frame.context.selected.map((message) => ({ ...message, _sceneReaderIndex: deps.getContext().chat?.indexOf(message) ?? -1 })),
        transcript: frame.transcript, knowledge: frame.continuityContext.knowledge, memory: frame.memory, persona: deps.characterStore.persona, canonicalOnly: true, volume:frame.prefs.characterVolume, npcSlots:frame.prefs.npcRecordLimit, retrievalResults: frame.retrievalResults, categoryHints: frame.categoryHints,
    }) : []);
    frame.futureCast=deps.buildLiveCharacterPlan(future,{transcript:`${castQuery}\n${frame.transcript}`,canonicalOnly:true,volume:frame.prefs.characterVolume,npcSlots:frame.prefs.npcRecordLimit,retrievalResults:frame.retrievalResults,protection:false})
        .map((person,index)=>({...person,index:frame.liveCharacters.length+index,profileCandidates:person.profileCandidates.slice(0,(person.profileSlotLimit||3)+3),contextCandidates:[],priorState:null,plannedOnly:true}));
    for (const person of frame.liveCharacters) person.priorState = frame.priorStates.get(person.id) || null;
    for (const person of frame.liveCharacters) person.sexualConductManaged = sexualEligible(person);
    if (deps.characterStore.characters.length === 1 && !deps.characterStore.characters[0].cardCast) {
        const primary = frame.liveCharacters.find((person) => person.id === deps.characterStore.characters[0].id);
        if (primary) primary.mainSillyTavernName = deps.getContext().name2 || '';
    }
    if (deps.characterStore.enabled) Object.assign(frame.questions, deps.buildCharacterTurnQuestions(frame.liveCharacters,frame.sceneGate.participationObservations||{}));
    // Record choices are conditional on the actor being selected for the event.
    // Do not ask whether an unintroduced candidate is already present.
    const futureQuestions=deps.buildCharacterTurnQuestions(frame.futureCast,Object.fromEntries(frame.futureCast.map(person=>[person.id,{}])));
    for(const question of Object.values(futureQuestions))question.instructions+=' Also consider the proposed event_cast_context if this person is selected to act. This does not establish presence or knowledge.';
    Object.assign(frame.questions,futureQuestions,castQuestions(frame.castBeats,frame.castSheets,frame.castGenerated,{newPersonAllowed:Boolean(frame.opportunityOffers?.person?.passed)}));
    for(const person of frame.liveCharacters.filter(person=>frame.castSheets.some(entry=>entry.id===person.id))) {
        for(const [key,question] of Object.entries(frame.questions))if(key.startsWith(`character_${person.index}_record_`))question.instructions+=' Also consider their proposed event_cast_context role if selected.';
    }
    deps.noteDiagnostic?.('character_protection_candidates', { module:'character/record-protection + record-questions',
        baselineCount:frame.liveCharacters.reduce((sum,p)=>sum+(p.prefilterStats?.baselineCandidateCount ?? p.profileCandidates.length),0),
        supplementalCount:frame.liveCharacters.reduce((sum,p)=>sum+(p.protectedCandidateIds?.length || 0),0),
        requestChars:frame.liveCharacters.reduce((sum,p)=>sum+(p.prefilterStats?.protectedRequestChars || 0),0),
        unreviewedCount:frame.liveCharacters.reduce((sum,p)=>sum+(p.prefilterStats?.protectedOmittedByChars || 0)+(p.prefilterStats?.protectedOmittedByLimit || 0)+(p.prefilterStats?.protectedOmittedByRequest || 0),0),
        fallbackCount:frame.liveCharacters.filter(p=>p.prefilterStats?.protectionFallback).length });
    Object.assign(frame.questions, buildSexualQuestions(frame.liveCharacters, frame.prefs.physicalIntimacyPace));
    if (frame.prefs.socialEnabled) {
        if(frame.generatedVillainTargets.length||frame.rec.villainProfile||frame.npcTargets.length||frame.rec.npcProfile)frame.questions.npc_conflict_tactic=conflictTacticQuestion();
        for(const person of frame.liveCharacters.filter(person=>person.kind==='npc'&&(person.antagonist||person.npcRole==='villain'))){
            frame.questions[`character_${person.index}_conflict_tactic`]=conflictTacticQuestion();
            frame.questions[`character_${person.index}_conflict_tactic`].instructions+=` This question is specifically for ${person.name}; do not copy another NPC's tactic.`;
        }
    }

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
    (frame.structuredCharacterContext = frame.liveCharacters.length+frame.futureCast.length ? {
        policy: deps.CHARACTER_LIVE_SYSTEM,
        npcRolePolicy: 'NPC villain, ally, or mixed is a broad role hint, not a personality or knowledge override. Use the stored records and actual RP to judge this person\'s specific motives and conduct. An ally may disagree; a villain may cooperate for a reason.',
        // Only compiled records and live context may cross the Jev boundary.
        // Keep local sheet, lorebook, bank provenance, and legacy excerpts out.
        people: [...frame.liveCharacters,...frame.futureCast].map(({ index, id, name, kind, npcRole, recordStatus, recordMode, profileCandidates, contextCandidates,plannedOnly }) =>
            ({ index, id, name, kind, npcRole, recordStatus, recordMode,plannedOnly:Boolean(plannedOnly),
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
