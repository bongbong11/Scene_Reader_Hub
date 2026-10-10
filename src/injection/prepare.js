import {buildMemoryStateBlock} from './memory-state.js';
import {selectActiveContinuity} from '../continuity/selection.js';
import {characterVolume} from '../character/volume.js';
import {additionBlocks,incorporateAdditions} from './opportunity.js';
import {repetitionInjection} from '../continuity/repetition.js';
import {storylineInjection} from '../context/storyline-reference.js';
import { selectExecutionCorrectionKeys } from "../scene/correction-selection.js";
import { applySexualChoice, buildSexualInjection, buildSexualQuestions, resolveSexualConduct, sexualEligible, sexualRoutingState } from "../characters/sexual-conduct.js";

export function createInjectionPreparation(deps) {
async function prepareInjection(run,frame) {
frame.details.world_direction = deps.fixedDecision(frame.prefs.worldDirection);
        frame.details.relationship_direction = deps.fixedDecision(frame.prefs.relationshipDirection);
        if (frame.prefs.negativePriority) frame.details.negative_priority = deps.fixedDecision('on');
        if (frame.prefs.worldHostility) frame.details.world_hostility = deps.fixedDecision('yes');
        if (frame.prefs.npcToUser) frame.details.npc_guard = deps.fixedDecision('yes');
        if (frame.prefs.userMisfortune) frame.details.misfortune = deps.fixedDecision('yes');
        if (frame.prefs.socialEnabled) {
            const npcActive = ['present', 'entering', 'multiple'].includes(frame.decisions.npc_presence) || ['create', 'replace', 'reuse'].includes(frame.decisions.npc_route) || ['create', 'continue', 'replace'].includes(frame.decisions.villain_route);
            frame.details.npc_autonomy = { selected: npcActive ? 'yes' : 'no', effective: npcActive ? 'yes' : 'no', certainty: 1, threshold: 1, adjusted: false, conditional: true };
            frame.decisions.npc_autonomy = frame.details.npc_autonomy.effective;
        }
        (frame.resolvedCharacters = deps.characterStore.enabled ? deps.resolveLiveCharacterPlan(frame.liveCharacters, frame.decisions, frame.details) : []);
        frame.memoryExecution=deps.settings.continuityEnabled&&frame.rec.analysisRuntimeV1?buildMemoryStateBlock({...frame.rec,characterEvolutionV1:frame.effectiveEvolution},{actors:frame.activeCharacters.filter(a=>frame.resolvedCharacters.some(p=>p.id===a.id&&p.presence==='active')),store:deps.characterStore,chosenContinuity:frame.chosenContinuity,limit:Math.min(1000,Math.floor(characterVolume(frame.prefs.characterVolume).chars*0.2)),selectedContinuity:selectActiveContinuity(frame.confirmedContinuity,frame.transcript,{actorIds:frame.resolvedCharacters.filter(p=>p.presence==='active').map(p=>p.id)})}):{text:''};
        (frame.characterExecution = deps.buildCharacterInjection(frame.resolvedCharacters, { conflictActive: ['tension', 'active'].includes(frame.decisions.conflict_state) || frame.decisions.fight_sustain === 'yes', volume:frame.prefs.characterVolume,maxChars:characterVolume(frame.prefs.characterVolume).chars-frame.memoryExecution.text.length }));
        (frame.characterTrace = frame.characterExecution.traces);
        (frame.sexualPlan = resolveSexualConduct(frame.resolvedCharacters, frame.decisions, frame.prefs.physicalIntimacyPace));
        (frame.sexualExecution = buildSexualInjection(frame.sexualPlan, frame.prefs.physicalIntimacyPace));
        for (const item of frame.characterTrace) item.sexualConduct = frame.sexualPlan.find(plan => plan.id === item.id) || null;
        for(const item of frame.characterTrace) {
            if(item.recordMode) {
                const prefix=`character_${item.index}_record_`;
                item.relevance = (frame.liveCharacters[item.index]?.profileCandidates || []).map((record,index)=>({id:record.id,type:record.type,score:frame.details[`${prefix}${index}`]?.certainty ?? 0,selected:frame.details[`${prefix}${index}`]?.effective==='yes',valid:!frame.details[`${prefix}${index}`]?.fallbackApplied}));
            }
            if (item.recordMode) {
                const extras = new Set(frame.liveCharacters[item.index]?.protectedCandidateIds || []);
                item.protection.invalidAnswers = item.relevance.filter(record=>extras.has(record.id)&&!record.valid).length;
            }
            if(item.profileIds.length || !item.candidateCount)continue;
            const prefix=`character_${item.index}_`;
            const presenceDetail=frame.details[`${prefix}presence`];
            if(item.presence!=='active') {
                item.zeroReason=presenceDetail?.selected==='active' ? `참여 판정 후처리: ${presenceDetail.rule || item.presence}` : `참여 판정: ${item.presence}`;
                continue;
            }
            const slots=Object.keys(frame.questions).filter(key=>key.startsWith(`${prefix}${item.recordMode?'record_':'profile_slot_'}`));
            const invalid=slots.filter(key=>item.recordMode ? frame.details[key]?.fallbackApplied : !Object.hasOwn(frame.questions[key].criteria,frame.data.answers?.[key]?.choice));
            const selected=slots.filter(key=>item.recordMode ? frame.details[key]?.effective==='yes' : frame.data.answers?.[key]?.choice && frame.data.answers[key].choice!=='none' && Object.hasOwn(frame.questions[key].criteria,frame.data.answers[key].choice));
            item.zeroReason=invalid.length ? `Jev 선택 응답 누락·형식 오류 ${invalid.length}개` : selected.length ? 'Jev 선택이 판정 기준 또는 코드 후처리에서 제외됨' : 'Jev가 관련 기록을 선택하지 않음';
        }
        deps.noteDiagnostic?.('character_protection_prepared', {module:'character/record-allocation + character/live',
            injectedCount:frame.characterTrace.reduce((sum,p)=>sum+(p.protection?.injected || 0),0),
            slotOmissions:frame.characterTrace.reduce((sum,p)=>sum+(p.protection?.omittedBySlots || 0),0),
            lengthOmissions:frame.characterTrace.reduce((sum,p)=>sum+(p.protection?.omittedByInjectionChars || 0),0),
            invalidAnswers:frame.characterTrace.reduce((sum,p)=>sum+(p.protection?.invalidAnswers || 0),0) });
        (frame.characterBlock = [frame.characterExecution.text,frame.memoryExecution.text].filter(Boolean).join('\n'));
        (frame.continuityBlock = deps.settings.continuityEnabled
            ? (frame.rec.analysisRuntimeV1 ? '' : deps.buildContinuityInjection(deps.selectContinuityContext(deps.continuityView(frame.rec), frame.transcript, { opportunity: frame.rec.sceneOpportunity }), frame.chosenContinuity))
            : '');
        if(deps.settings.continuityEnabled && frame.rec.repetitionGuard) {
            const review=repetitionInjection(frame.rec.repetitionGuard,{chat:deps.getContext().chat,chatKey:run.identity,excluded:frame.rec.nonRpOutputIndices || [],fingerprint:deps.stableFingerprint});
            if(review.text) {
                frame.continuityBlock=[frame.continuityBlock,review.text].filter(Boolean).join('\n');
                frame.rec.repetitionGuard=review.guard;
            } else frame.rec.repetitionGuard=null;
            deps.noteDiagnostic?.('topic_fixation_injection',{module:'src/continuity/repetition.js',status:review.status,targetCount:review.text?1:0});
        }
        (frame.sheetCastNames = [...deps.characterStore.characters, ...deps.characterStore.npcs, ...[deps.characterStore.persona].filter(Boolean)].flatMap(entry => [entry.name, ...(entry.aliases || [])]));
        (frame.selectedSheetNpc = frame.decisions.npc_route === 'reuse' && /^sheet_\d+$/.test(frame.decisions.npc_target || '')
            ? frame.npcTargets[Number(frame.decisions.npc_target.slice(6))] || null : null);
        (frame.correctionSelection = selectExecutionCorrectionKeys(frame.decisions, frame.details));
        (frame.payload = deps.buildInjection({ settings: frame.prefs, decisions: frame.decisions, villainProfile: frame.staged.villainProfile, npcProfile: frame.selectedSheetNpc ? null : frame.staged.npcProfile, sheetNpcTarget: frame.selectedSheetNpc?.name || '', eventProfile: frame.staged.eventProfile, privatePrompt: frame.prefs.privatePromptEnabled ? deps.ownerPrompt() : '', characterBlock: frame.characterBlock, sexualBlock:frame.sexualExecution.text, continuityBlock: frame.continuityBlock, sheetCastNames: frame.sheetCastNames, activeWorldName:frame.world?.name||'', correctionDetails:frame.details }));
        frame.additionBlocks=additionBlocks(frame.additions||[],frame.prefs,Boolean(frame.rec.eventProfile));
        frame.payload=incorporateAdditions(frame.payload,frame.additionBlocks,frame.prefs);
        const carried=storylineInjection(frame.rec);
        if(carried)frame.payload=carried+'\n\n'+frame.payload;
        (frame.finalContinuityCacheKey = deps.settings.continuityEnabled
            ? deps.stableFingerprint({ revision: frame.rec.continuity?.revision || 0, evolutionRevision:frame.rec.characterEvolutionV1?.revision||0, deltaCandidates:(frame.rec.analysisRuntimeV1?.pendingBatches||[]).flatMap(b=>b.candidates||[]).filter(c=>c.status==='pending').map(c=>c.id), candidates: (frame.rec.pendingContinuityCandidates || []).map((item) => item.id), ...(frame.rec.repetitionGuard?{repetition:frame.rec.repetitionGuard}:{}) })
            : '');
        (frame.rawChoices = Object.fromEntries(Object.entries(frame.data.answers || {}).map(([key, answer]) => [key, { choice: answer?.choice, confidence: answer?.confidence, probabilities: answer?.probabilities, noul: answer?.noul }])));
        frame.rec.lastJudgment = { details: frame.details, decisions: frame.decisions, rawChoices: frame.rawChoices, jevDiagnostics:frame.data.answerDiagnostics||null, npcTargetName: frame.selectedSheetNpc?.name || '', memoryStatus: frame.memory.status, memoryKey: frame.memoryKey, characterTrace: frame.characterTrace, characterInjectionChars:frame.characterExecution.charCount, characterInjectionLimit:frame.characterExecution.charLimit, sexualInjectionChars:frame.sexualExecution.charCount, sexualTrace:frame.sexualExecution.traces, actionPlan: deps.actionPlanSummary(frame.finalPlan), payload: frame.payload, worldSelection: frame.worldSelection, worldId:frame.world?.id||'',...(frame.world?.worldRef?{worldVersion:frame.world.worldRef}:{}), worldPayload: frame.selectedWorldPayload, sceneIntimacy:frame.rec.sceneIntimacy, inputKey: frame.inputKey, contextKey: frame.context.contextKey, sourceKey: frame.sourceKey, continuityCacheKey: frame.finalContinuityCacheKey, priorVerification: frame.priorVerification, rolls: { event: frame.staged.lastEventRoll || null, npc: frame.staged.lastNpcRoll || null, villain: frame.staged.lastVillainRoll || null }, judgedAt: new Date().toISOString(), model: String(frame.data.model || deps.JEV_MODEL) };
        frame.rec.lastJudgment.opportunityPlan=frame.opportunityPlan||null;
        frame.rec.lastJudgment.additionBlocks=frame.additionBlocks;
        frame.rec.lastJudgment.correctionSelection = frame.correctionSelection;
        frame.rec.lastJudgment.drawDiagnostics=frame.drawDiagnostics;
        if (frame.rec.lastStateInput !== frame.inputKey || !frame.rec.pendingPlan) {
            const pendingOffset = String(frame.pendingUserText || '').trim() ? 1 : 0;
            frame.rec.pendingPlan = {
                additions: structuredClone(frame.additions||[]),
                opportunityKey: frame.opportunityOffers?.key||null,
                inputKey: frame.inputKey,
                sourceKey: frame.sourceKey,
                generationMode: 'rp',
                memoryReference: frame.memory,
                decisions: { ...frame.decisions },
                effects: deps.pendingPlanEffects(frame.decisions),
                visibleCount: (deps.getContext().chat || []).filter(deps.isVisibleRoleplayMessage).length + pendingOffset,
                chatCount: (deps.getContext().chat || []).length + pendingOffset,
                stateSnapshot: frame.stateBefore,
                preparedStateSnapshot: deps.reversibleStateSnapshot(frame.staged),
                judgment: JSON.parse(JSON.stringify(frame.rec.lastJudgment)),
                outputText: '',
                outputFingerprint: '',
                outputIndex: null,
                status: 'awaiting_output',
            };
        }

}
return {prepareInjection};
}
