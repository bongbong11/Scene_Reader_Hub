import {ROUTING_SCOPE} from './opportunity-questions.js';
import { applySexualChoice, buildSexualInjection, buildSexualQuestions, resolveSexualConduct, sexualEligible, sexualRoutingState } from "../characters/sexual-conduct.js";
import { publishKnowledgeVault, knowledgeVaultDecisionState } from '../integration/knowledge-vault.js';

export function createDecisionRequest(deps) {
async function requestDecision(run,frame) {
(frame.jevRequest = {
            model: deps.JEV_MODEL,
            state: {
                scope: 'Observe established scene facts from recent_roleplay only. A character\'s claim, belief, suspicion, promise, intention, or proposed action is not automatically a world fact or completed action.\n\nUse current OOC only as guidance or constraints for this routing decision. Use past OOC only for continuity facts or constraints that remain applicable; never re-execute an expired one-turn or scene-specific direction. Do not treat OOC as an event witnessed by characters. Do not pass raw OOC into the final scene injection.\n\nAnswer each question from the supplied evidence; do not assume another question has already been answered. The extension will validate dependencies after receiving all answers.\n\nChoose a supported Primary route and report other plausible routes independently. The extension will retain one Primary and at most one directly dependent Secondary. Every development style favors a fitting concrete response, thought, emotion, or executable step among supported routes; it does not lower fact, knowledge, or diagnostic standards, and does not require a new incident.\n\nFollow narrative speed and rhythm specified in the main prompt. Basic development tendency chooses how the scene moves, including inside advanced events; it does not control prose length. Relationship pace governs the amount of relationship change permitted. Resolution pace governs event resolution. Only advanced progression can introduce a new independent event. None of these controls rewrites the preset\'s genre, world rules, characterization, or prose style.',
                recent_roleplay: frame.transcript,
                ...knowledgeVaultDecisionState(frame.vaultCards),
                appearance_offer: frame.rec.appearanceOffer || null,
                memory_reference: frame.memory,
                meta_guidance: {
                    current: frame.context.metaGuidance.current,
                    recent: frame.context.metaGuidance.recent,
                    policy: 'Current OOC may direct the next route or impose facts and constraints, but it is never RP evidence. Past OOC is not a current instruction queue. Use past OOC only when it is still an active continuity fact, knowledge restriction, persistent character or relationship state, or explicitly ongoing constraint. One-turn and scene-specific progression requests expire after their applicable turn or scene. Ignore prose style, wording, length, format, translation, and language instructions for judgment. Never copy raw OOC into the scene-reader injection.',
                },
                controls: { ...frame.prefs, progressIntensity: undefined, world: { id: frame.world?.id, name: frame.world?.name, hint: frame.world?.hint } },
                seasonal_context: frame.seasonalContext || null,
                applicable_world_rules: frame.appliedWorldRecords.map(({ id, category, when, rule }) => ({ id, category, when, rule })),
                world_rule_selection: { status: frame.worldSelection.status, scope: 'Rules constrain only scenes meeting their stated conditions. If world selection fails, only fixed rules remain; conditional rules are not presumed active. No rule alone establishes an event or character knowledge.' },
                stored_profiles: { antagonist: frame.rec.villainProfile || null, genre_npc: frame.rec.npcProfile || null, primary_event: frame.rec.eventProfile || null },
                ...(frame.generatedNpcTargets?.length||frame.generatedVillainTargets?.length?{previously_generated_people:{npcs:frame.generatedNpcTargets,villains:frame.generatedVillainTargets,scope:'These are established stored profiles, not proof of current presence. Select by current RP and plausible access only.'}}:{}),
                accumulated_state: { pacing: frame.rec.pacingState, progression_pressure: frame.rec.progressionState, relationship: frame.rec.relationshipState, latest_observation: frame.rec.observationState, background_events: frame.rec.backgroundEvents },
                character_profiles: frame.structuredCharacterContext,
                sexual_routing: sexualRoutingState(frame.liveCharacters, frame.prefs.physicalIntimacyPace),
                prior_output_character_states: frame.liveCharacters.filter(person => person.priorState).map(person => ({
                    id: person.id, name: person.name, values: person.priorState.values, targets: person.priorState.targets,
                    scope: 'Previous completed assistant output only; not proof of a current action or another person’s knowledge.',
                })),
                registered_sheet_cast: [...deps.characterStore.characters, ...deps.characterStore.npcs, ...[deps.characterStore.persona].filter(Boolean)].map(entry => ({ name: entry.name, aliases: entry.aliases || [], ...(entry.kind === 'npc' ? { npc_role_hint: entry.npcRole || (entry.antagonist ? 'villain' : 'mixed') } : {}) })),
                pending_verification: frame.rec.pendingPlan?.outputText ? { plan: { effects: frame.rec.pendingPlan.effects, decisions: frame.rec.pendingPlan.decisions }, source_user_rp: deps.sourceUserRpForOutput(frame.rec.pendingPlan.outputIndex), character_output: frame.rec.pendingPlan.outputText } : null,
                continuity_context: deps.settings.continuityEnabled ? { items: frame.continuityContext.items, knowledge: frame.continuityContext.knowledge, dependencies: frame.continuityContext.dependencies } : null,
                pending_continuity_candidates: frame.pendingCandidates.map((candidate) => ({ id: candidate.id, type: candidate.type, label: candidate.label, evidence: candidate.evidence, data: candidate.data, sourceIdentity: candidate.sourceIdentity })),
                priority: frame.prefs.negativePriority ? 'Enabled negative-bias constraints govern world and event routing without rewriting a registered person\'s established knowledge, relationships, or characterization.' : 'Normal scene-reader priority.',
                safety_policy: frame.prefs.settingsContract >= 3 ? 'Do not confuse uncertainty about hidden facts with inability to respond. Ordinary dialogue, feelings, attempts, and small consequences can move in every style. Preserve genuine user decisions and hard constraints. No forced resolution or new incident is required. Do not count sexual activity as required plot progress. Character feelings may coexist with every progression style; judge their expression through the character questions independently of event budgets.' : frame.prefs.judgmentStyle === 'active' ? 'Uncertainty blocks unsupported major invention, but it does not require passive holding when an established thread can move by one concrete genre-compatible beat. Sexual activity is not a scene-progression axis and must not be used to decide whether an NSFW scene should continue, slow, or end.' : 'Uncertainty defaults to no unsupported new event, NPC, or escalation and continued current interaction. Sexual activity is not a scene-progression axis and must not be used to decide whether an NSFW scene should continue, slow, or end.',
            },
            questions: frame.questions,
        });
        if(frame.questions.event_opportunity||frame.questions.person_opportunity)frame.jevRequest.state.scope=ROUTING_SCOPE;
        frame.jevRequest.state.new_opportunities=frame.opportunityOffers?{key:frame.opportunityOffers.key,event:{mode:frame.opportunityOffers.event.spontaneous?'spontaneous':'normal',scope:frame.opportunityOffers.event.scope},person:{mode:frame.opportunityOffers.person.spontaneous?'spontaneous':'normal',kind:frame.opportunityOffers.person.kind}}:null;
        (frame.data = await deps.callJev(frame.jevRequest, frame.recoveryAttempt ? 60000 : 30000, run.controller.signal));
        run.assert();
        (frame.missingAnswerCount = frame.data.answerDiagnostics?.invalidKeys?.length||0);
        if(frame.missingAnswerCount)deps.noteDiagnostic?.('jev_partial',{requested:frame.data.answerDiagnostics.requested,missing:frame.missingAnswerCount,keys:frame.data.answerDiagnostics.invalidKeys.slice(0,20)});
        if (!deps.settings.enabled || deps.currentInputKey(frame.pendingUserText, frame.cycleSalt) !== frame.inputKey || deps.recentContext(frame.pendingUserText).contextKey !== frame.context.contextKey || deps.sourceRevisionKey(deps.record(), deps.selectedWorld()) !== frame.sourceKey) throw new deps.StaleRunError();
        publishKnowledgeVault(deps.window?.KnowledgeVaultV1, frame.vaultCards, frame.data.answers);
        deps.updateStatus('판독 완료 · 주입문 조립 중…');
        deps.updateActivity(frame.mixedOoc ? 'OOC 지시 확인 · 필요한 주입문을 조립하고 있습니다…' : '판독 완료 · 필요한 주입문을 조립하고 있습니다…');
        
}
return {requestDecision};
}
