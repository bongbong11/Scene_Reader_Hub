import {opportunityDetail, resolveOpportunities} from '../scene/opportunity-policy.js';
import {opportunitySummary, reportOpportunities} from '../debug/opportunity-events.js';
import {archiveCurrentEvent} from '../scene/state-effects.js';
import {drawDiagnostics} from './draw-diagnostics.js';
import {resolveCharacterPresence} from '../character/presence.js';
import {applyAppearanceOffer} from "../scene/appearance.js";
import {applySexualChoice} from "../characters/sexual-conduct.js";

export function createDecisionResolution(deps) {
async function resolveDecision(run,frame) {
(frame.details = {});
        for (const key of Object.keys(frame.questions)) {
            const choices = Object.keys(frame.questions[key]?.criteria || {});
            frame.details[key] = key.endsWith('_opportunity')
                ? opportunityDetail(frame.data.answers[key],frame.opportunityOffers?.[key.split('_')[0]])
                : key.startsWith('sexual_')
                ? applySexualChoice(frame.data.answers[key], choices)
                : frame.questions[key]?.type === 'noul' && /^character_\d+_record_\d+$/.test(key)
                ? deps.applyRecordRelevance(frame.data.answers[key])
                : key.startsWith('character_') || key === 'npc_identity_route'
                ? deps.applyCharacterPolicy(key, frame.data.answers[key], frame.prefs.judgmentStyle, choices)
                : deps.applyPolicy(key, frame.data.answers[key], frame.prefs.judgmentStyle, choices, frame.prefs.progressIntensity);
        }
        resolveCharacterPresence(frame.liveCharacters,frame.details,frame.data.answers,frame.sceneGate?.participationObservations||{});
        (frame.decisions = deps.effectiveMap(frame.details));
        (frame.priorVerification = await deps.commitPriorVerification(frame.rec, frame.decisions, run));
        (frame.verifiedExternalCandidates = deps.verifiedSecondaryCandidates(frame.pendingCandidates, frame.decisions));
        await deps.commitContinuityCandidates(frame.rec, frame.pendingCandidates, frame.decisions, frame.details, run);
        run.assert();
        deps.deriveDependentDecisions(frame.rec, frame.details, frame.decisions);
        (frame.stateBefore = deps.reversibleStateSnapshot(frame.rec));
        deps.commitObservedState(frame.rec, frame.decisions, frame.context.observationKey);
        if (['user_established', 'both'].includes(frame.decisions.context_change_source)) deps.registerSceneOpportunity(frame.rec, `user:${frame.context.contextKey}`);
        if(frame.decisions.event_closure==='completed'&&frame.rec.eventProfile?.phase==='aftermath'){archiveCurrentEvent(frame.rec,'completed');frame.rec.eventProfile=null;}
        if(!frame.opportunityOffers)applyAppearanceOffer(frame.rec, frame.details, frame.decisions);
        deps.coordinateDecisions(frame.rec, frame.details, frame.decisions);
        if (frame.prefs.settingsContract < 3 && ['create', 'replace'].includes(frame.decisions.npc_route) && frame.decisions.npc_identity_route === 'reuse_existing') {
            deps.overrideDecision(frame.details, frame.decisions, 'npc_route', 'reuse', `인물 판정 경로: ${frame.decisions.npc_identity_route}`);
        }
        if (!['create', 'replace', 'reuse'].includes(frame.decisions.npc_route)) deps.overrideDecision(frame.details, frame.decisions, 'npc_identity_route', 'none', '이번 응답 NPC 실행 없음');
        if (['create', 'replace', 'reuse'].includes(frame.decisions.npc_route) && /^sheet_\d+$/.test(frame.decisions.npc_target || '')) {
            const target = frame.npcTargets[Number(frame.decisions.npc_target.slice(6))];
            if (!target || !frame.activeCharacters.some((entry, index) => entry.id === target.id && frame.decisions[`character_${index}_presence`] === 'active')) {
                deps.overrideDecision(frame.details, frame.decisions, 'npc_target', 'none', '해당 등록 인물의 이번 장면 참여 근거 없음');
                deps.overrideDecision(frame.details, frame.decisions, 'npc_route', 'none', '선택한 등록 인물이 이번 응답에 참여하지 않음');
            } else if (['create', 'replace'].includes(frame.decisions.npc_route)) {
                deps.overrideDecision(frame.details, frame.decisions, 'npc_route', 'reuse', '이미 등록된 인물을 새로 생성하지 않고 재사용');
            }
        }
        if (['create', 'replace'].includes(frame.decisions.npc_route) && frame.decisions.npc_target === 'scene_existing') {
            if (['mentioned', 'present', 'entering', 'multiple'].includes(frame.decisions.npc_presence)) deps.overrideDecision(frame.details, frame.decisions, 'npc_route', 'reuse', '실제 RP에 존재하는 인물을 재사용');
            else deps.overrideDecision(frame.details, frame.decisions, 'npc_target', 'none', '기존 인물의 관찰 근거 없음');
        }
        (frame.currentEventRelevant = Boolean(frame.rec.eventProfile && frame.rec.eventProfile.phase !== 'aftermath')
            && (['active', 'turning', 'resolution_ready'].includes(frame.decisions.event_state)
                || ((frame.rec.progressionState?.turnsSinceMeaningfulProgress || 0) > 0 && ['goal', 'information', 'danger', 'multiple'].includes(frame.decisions.unresolved))));
        if (frame.currentEventRelevant && (frame.prefs.advancedEnabled || frame.prefs.progressionMode !== 'off') && (frame.prefs.judgmentStyle === 'active' || frame.prefs.resolutionPace === 'fast')) {
            if (frame.rec.eventProfile?.source === 'advanced' && frame.prefs.advancedEnabled && frame.decisions.advanced_route === 'none') {
                deps.overrideDecision(frame.details, frame.decisions, 'advanced_route', 'continue', '저장 사건과 실제 미해결 목표가 있어 실행 후보로 복귀');
                if (frame.decisions.advanced_move === 'quiet') deps.overrideDecision(frame.details, frame.decisions, 'advanced_move', frame.decisions.event_blocker === 'information' ? 'reveal' : 'advance', '빠른 해결·적극 진행에서 저장 사건 한 단계 실행');
                deps.overrideDecision(frame.details, frame.decisions, 'advanced_cause', 'existing', '저장 사건의 계속되는 원인');
                deps.overrideDecision(frame.details, frame.decisions, 'advanced_element', frame.rec.eventProfile.element || 'objective', '저장 사건의 고정 요소 유지');
            } else if (frame.prefs.progressionMode !== 'off' && frame.decisions.event_route === 'none') {
                deps.overrideDecision(frame.details, frame.decisions, 'event_route', 'continue', '저장 사건과 실제 미해결 목표가 있어 실행 후보로 복귀');
                if (frame.decisions.progression_move === 'hold') deps.overrideDecision(frame.details, frame.decisions, 'progression_move', frame.decisions.event_blocker === 'information' ? 'reveal' : 'advance', '빠른 해결·적극 진행에서 저장 사건 한 단계 실행');
            }
        }
        (frame.beforeBudgetDecisions = { ...frame.decisions });
        (frame.provisionalPlan = deps.selectActionPlan({
            decisions: frame.decisions,
            settings: { ...frame.prefs, turnsSinceMeaningfulProgress: frame.rec.progressionState?.turnsSinceMeaningfulProgress || 0, deferredRoutes: frame.rec.deferredRoutes || {} },
            hasEventProfile: Boolean(frame.rec.eventProfile),
            hasNpcProfile: Boolean(frame.rec.npcProfile),
            hasVillainProfile: Boolean(frame.rec.villainProfile),
            allowUnpreparedCreates: true,
            externalCandidates: frame.verifiedExternalCandidates,
        }));
        (frame.proposedIds = new Set(frame.provisionalPlan.allowedCandidateIds));
        if (!frame.proposedIds.has('event') && !frame.proposedIds.has('advanced_event')) {
            if (['create', 'replace'].includes(frame.decisions.event_route)) frame.decisions.event_route = 'none';
            if (frame.decisions.advanced_route === 'create') frame.decisions.advanced_route = 'none';
        }
        if (!frame.proposedIds.has('npc') && ['create', 'replace'].includes(frame.decisions.npc_route)) frame.decisions.npc_route = 'none';
        if (!frame.proposedIds.has('villain') && ['create', 'replace'].includes(frame.decisions.villain_route)) frame.decisions.villain_route = 'none';
        (frame.staged = deps.stagedRecord(frame.rec));
        if(frame.decisions.npc_route==='reuse'&&/^generated_\d+$/.test(frame.decisions.npc_target||'')) {
            const target=frame.generatedNpcTargets[Number(frame.decisions.npc_target.slice(10))];
            if(target)frame.staged.npcProfile=structuredClone(target);
        }
        if(frame.decisions.villain_route==='continue'&&/^generated_\d+$/.test(frame.decisions.villain_target||'')) {
            const target=frame.generatedVillainTargets[Number(frame.decisions.villain_target.slice(10))];
            if(target)frame.staged.villainProfile=structuredClone(target);
        }
        deps.prepareProfiles(frame.staged, frame.decisions, frame.details);
        (frame.preparedRoutes = {
            event_route: frame.decisions.event_route,
            advanced_route: frame.decisions.advanced_route,
            npc_route: frame.decisions.npc_route,
            villain_route: frame.decisions.villain_route,
        });
        Object.assign(frame.decisions, frame.beforeBudgetDecisions);
        for (const [key, value] of Object.entries(frame.preparedRoutes)) {
            if (frame.proposedIds.has(key === 'event_route' ? 'event' : key === 'advanced_route' ? 'advanced_event' : key === 'npc_route' ? 'npc' : 'villain')) {
                if (value !== frame.beforeBudgetDecisions[key]) deps.overrideDecision(frame.details, frame.decisions, key, value, frame.details[key]?.rule || '추첨·프로필 준비 결과');
            }
        }
        (frame.finalPlan = deps.coordinateActionBudget(frame.rec, frame.details, frame.decisions, frame.staged, { externalCandidates: frame.verifiedExternalCandidates }));
        (frame.finalCandidateIds = new Set((frame.finalPlan.candidates || []).map((candidate) => candidate.id)));
        (frame.failedPrepared = [frame.provisionalPlan.primary, frame.provisionalPlan.secondary]
            .filter((candidate) => candidate && candidate.id !== 'direct' && !frame.finalCandidateIds.has(candidate.id))
            .map((candidate) => ({ id: candidate.id, kind: candidate.kind, label: candidate.label, reason: '확률 추첨 미통과 또는 실행 프로필 준비 실패' })));
        (frame.excludedById = new Map([...frame.provisionalPlan.excluded, ...frame.failedPrepared, ...frame.finalPlan.excluded].map((item) => [item.id, item])));
        for (const selectedCandidate of [frame.finalPlan.primary, frame.finalPlan.secondary,...(frame.finalPlan.overlays||[])]) if (selectedCandidate) frame.excludedById.delete(selectedCandidate.id);
        frame.finalPlan.excluded = [...frame.excludedById.values()];
        frame.rec.deferredRoutes = deps.nextDeferredRoutes(frame.rec.deferredRoutes, frame.provisionalPlan);
        frame.decisions.action_plan = deps.actionPlanSummary(frame.finalPlan);
        (frame.chosenExternal = frame.verifiedExternalCandidates.find((item) => frame.finalPlan.secondary?.id === `external:${item.id}`) || null);
        (frame.chosenContinuity = frame.chosenExternal);
        if (frame.chosenContinuity) frame.decisions.selected_continuity_id = frame.chosenContinuity.id;
        // Canonical records are constraints, not extra independent action beats.
        if (frame.decisions.npc_route !== 'reuse') deps.overrideDecision(frame.details, frame.decisions, 'npc_target', 'none', '이번 응답에 기존 NPC 재사용 없음');
        if (!['create', 'replace', 'reuse'].includes(frame.decisions.npc_route)) {
            for (const key of ['npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure']) deps.overrideDecision(frame.details, frame.decisions, key, 'none', frame.decisions.npc_route === 'waiting' ? '인물 등장 추첨 대기' : '이번 응답 NPC 실행 없음');
        }
        
        frame.additions=frame.opportunityOffers?resolveOpportunities(frame.opportunityOffers,frame.data.answers):[];
        if(frame.opportunityOffers){
            frame.rec.appearanceOffer={...frame.opportunityOffers.person,candidates:undefined};
            frame.rec.lastNpcRoll={...frame.rec.appearanceOffer};
            frame.staged.lastNpcRoll={...frame.rec.appearanceOffer};
            frame.opportunityPlan=opportunitySummary(frame.opportunityOffers,frame.additions);
            frame.finalPlan.additions=frame.opportunityPlan.additions;
            reportOpportunities(deps.noteDiagnostic,frame.opportunityPlan);
        }
 frame.drawDiagnostics=drawDiagnostics(frame);
 deps.noteDiagnostic?.('draw_opportunities',{event:frame.drawDiagnostics.event.status,person:frame.drawDiagnostics.person.status,drawKey:frame.drawDiagnostics.key});
 deps.noteDiagnostic?.('policy_candidates',{primary:frame.finalPlan.primary?.id||'',secondary:frame.finalPlan.secondary?.id||'',excludedCount:frame.finalPlan.excluded.length,exclusions:frame.finalPlan.excluded.map(x=>x.id+': '+x.reason)});
}
return {resolveDecision};
}
