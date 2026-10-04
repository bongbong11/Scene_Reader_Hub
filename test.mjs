import { prepareProfileItems, createProfile } from './tests/fixtures/legacy-profiles.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_PROMPTS } from './legacy-prompts.js';
import { buildInjection, buildQuestions, rollEventProfile, rollNpcProfile } from './prompt-library.js';
import { ADVANCED_DEFAULT_ELEMENTS, BUILTIN_WORLDS, advancedChance, rollAdvancedEvent } from './advanced-library.js';
import { CUSTOM_WORLD_STORAGE, INITIAL_CUSTOM_WORLDS, isFranchiseWorld, loadCustomWorlds, saveCustomWorlds } from './world-library.js';
import { appendPendingUserMessage, buildInputKey, buildRecentContext, buildRecentTranscript, filterNonRpHistory, generationCycleSalt, latestUserMessageText, pendingComposerText, selectRecentMessages, splitOocText } from './runtime-utils.js';
import { sha256Fallback, sha256Hex } from './security-utils.js';
import { buildCharacterInjection, buildCharacterTurnQuestions, buildLiveCharacterPlan, resolveLiveCharacterPlan, currentProfileItems, profileStatus, chunkSheet, defaultCharacterStore, normalizeCharacterStore, selectActiveEntries, selectRelevantChunks } from './character-library.js';
import { applyDecisionPolicy, buildVerificationQuestions, decisionPolicyKind, pendingPlanEffects, stableFingerprint, verificationSummary } from './decision-engine.js';
import { commitObservedState, commitVerifiedPlan, updateProgressionPressure } from './state-engine.js';
import { selectActionPlan, nextDeferredRoutes } from './action-coordinator.js';
import { coordinateDecisions, coordinateActionBudget } from './src/scene/coordinator.js';
import { applyPolicy } from './src/scene/policy.js';
import { createDraws } from './src/scene/draws.js';
import { activePendingCandidates, buildPendingCandidateQuestions, verifiedSecondaryCandidates } from './continuity-hooks.js';
import { applyContinuityVerdicts, buildContinuityInjection, emptyContinuity, selectContinuityContext, validateReasonerResult } from './continuity-engine.js';
import { listConnectionProfiles, parseReasonerReply, requestWithConnectionProfile } from './st-profile-reasoner.js';

const require = createRequire(import.meta.url);
const plugin = require('./server-plugin/index.cjs');
const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const pluginPkg = JSON.parse(await readFile(new URL('./server-plugin/package.json', import.meta.url), 'utf8'));
async function sourceFiles(dir){const result=[];for(const e of await readdir(new URL(dir+'/',import.meta.url),{withFileTypes:true})){const file=dir+'/'+e.name;if(e.isDirectory())result.push(...await sourceFiles(file));else if(file.endsWith('.js'))result.push(file);}return result;}
const source=(await Promise.all((await sourceFiles('src')).map(file=>readFile(new URL(file,import.meta.url),'utf8')))).join('\n').replaceAll('deps.','').replaceAll('frame.','').replaceAll('runtime.','');
const library=(await Promise.all(['src/decision/settings.js','src/decision/questions.js','src/injection/assemble.js','src/injection/paused.js','src/scene/profiles.js'].map(file=>readFile(new URL(file,import.meta.url),'utf8')))).join('\n');
const characterLibrarySource=await readFile(new URL('./src/character/index.js',import.meta.url),'utf8');
const decisionEngineSource=await readFile(new URL('./src/decision/policy.js',import.meta.url),'utf8');
const stateEngineSource=await readFile(new URL('./src/scene/state-effects.js',import.meta.url),'utf8');
const runtimeSource=await readFile(new URL('./src/context/messages.js',import.meta.url),'utf8');
const css = await readFile(new URL('./style.css', import.meta.url), 'utf8');
// Existing plugin source remains a byte-preserved compatibility fixture.
await access(new URL(`./${manifest.js}`, import.meta.url));

assert.equal(manifest.display_name, '씬판독기 Hub');
assert.equal(manifest.version, '0.1.17');
assert.equal(pkg.version, manifest.version);
assert.match(decisionEngineSource, /Math\.max\(0, Math\.min\(1, Number\.isFinite\(confidence\) \? confidence : p\)\)/);
assert.match(decisionEngineSource, /allowedChoices\.includes\(candidate\)/);
assert.match(source, /sr-development-style/);
assert.doesNotMatch(source, /sr-world-(?:export|import)/);
assert.match(library, /If a new-event route fails, an existing event, relationship pressure, current interaction, or prior action may still move/);
assert.match(library, /A registered person being active does not prohibit another suitable NPC from entering/);
assert.equal(pkg.main, 'index.js');
assert.equal(pluginPkg.main, 'index.cjs');
assert.equal(pluginPkg.version, '0.7.0');
assert.match(source, /GENERATION_AFTER_COMMANDS/);
assert.match(source, /extensionsMenu/);
assert.match(source, /id = 'scene-reader-quick-button'/);
assert.match(source, /document\.getElementById\('leftSendForm'\)/);
assert.match(source, /ensureQuickEntry\(\)/);
assert.match(source, /showModal\(\)/);
assert.match(source, /\/api\/plugins\/scene-reader-jev\/systemone/);
assert.match(source, /X-Jev-Key/);
assert.match(source, /최근 1턴/);
assert.match(source, /최근 2턴/);
assert.match(source, /최근 5턴/);
assert.match(source, /자동 전개/);
assert.match(source, /고급 전개/);
assert.match(source, /갈등용 진행/);
assert.match(source, /인물 판정/);
assert.match(source, /id="sr-settings-button"/);
assert.doesNotMatch(source, /data-sr-tab="settings"/);
assert.match(source, /관계 진전 속도/);
assert.match(source, /사건 해결 속도/);
assert.match(source, /opportunitySettingsTemplate/);
assert.match(source, /발생 확률은 자동 전개 탭/);
assert.match(source, /부정 편향을 최우선으로 사용/);
assert.match(source, /이번 턴 최종 적용/);
assert.match(source, /현재 사건·인물 현황/);
assert.ok(source.indexOf('현재 사건·인물 현황') < source.indexOf('장면·관계 판독'), 'active event and character dashboard must stay above accordions');
assert.match(source, /장면·관계 판독/);
assert.match(source, /사건·NPC 진행/);
assert.match(source, /갈등·실행 점검/);
assert.match(source, /저장 상태·실제 주입문/);
assert.equal((source.match(/<details class="sr-details"/g) || []).length, 5, 'automatic progression result UI must group results into five accordions');
assert.match(source, /id="sr-ooc-policy"/);
for (const id of ['sr-continuity-enabled', 'sr-reasoner-profile', 'sr-reasoner-refresh', 'sr-reasoner-test', 'sr-continuity-results']) assert.match(source, new RegExp(`id="${id}"`));
for (const id of ['sr-continuity-enabled', 'sr-reasoner-profile', 'sr-reasoner-refresh', 'sr-reasoner-test']) assert.match(source, new RegExp(`getElementById\\('${id}'\\)\\?\\.addEventListener`), `${id} requires an event handler`);
assert.doesNotMatch(source, /id="sr-reasoner-(?:new|edit|save|delete|key|url|model)"/);
assert.match(source, /id="sr-reset-current-npc"/);
assert.match(source, /OOC만 입력하면 판독·주입을 건너뜁니다/);
assert.match(runtimeSource, /ooc\|out\\s\+of\\s\+character\|오오씨\|사담/);
const oocPattern = /^\s*[\[(]?\s*(?:ooc|out\s+of\s+character|오오씨|사담)\s*:/i;
for (const text of ['(ooc:', '(OOC:', '  (Ooc:', '[oOc:', '사담:']) assert.ok(oocPattern.test(text), `${text} must pause case-insensitively`);
assert.match(source, /OOC 입력 감지 · 이번 판독과 주입을 건너뜁니다/);
assert.match(runtimeSource, /message\?\.extra\?\.ooc_chat === true/);
assert.match(source, /event_types\.MESSAGE_SENT/);
assert.match(source, /message:\$\{stateChatKey\(\)\}:\$\{messageId\}/);
assert.match(source, /input:\$\{inputKey\}/);
assert.match(source, /Past OOC is not a current instruction queue/);
assert.match(source, /Never copy raw OOC into the scene-reader injection/);
assert.match(source, /pendingComposerText\(type, data, document\.getElementById\('send_textarea'\)\?\.value\)/);
assert.match(source, /runJudge\(\{ pendingUserText, cycleSalt \}\)/);
assert.match(source, /자동 판독 꺼짐 · 현재 입력은 수동 판독 필요/);
assert.match(source, /activeInjectionPayload \|\| '현재 주입문 없음'/);
assert.match(source, /pendingGenerationType === 'regenerate' \? 'regenerated' : 'deleted'/);
assert.match(source, /\['swiped', 'regenerated'\]\.includes\(kind\)/);
assert.match(source, /preparedStateSnapshot/);
assert.match(source, /judgment: JSON\.parse\(JSON\.stringify\(rec\.lastJudgment\)\)/);
assert.doesNotMatch(source, /pendingCommit/);
assert.match(source, /pending plan|pendingPlan/i);
assert.match(source, /buildVerificationQuestions\(rec\.pendingPlan\)/);
assert.match(source, /commitPriorVerification\(rec, decisions, run\)/);
assert.match(source, /policyEffective/);
assert.match(source, /coordinatorFinal/);
assert.match(source, /committedEffects/);
assert.match(source, /추첨 \$\{Number\(roll\.roll\)\}/);
assert.match(source, /activityToasts: new Map/);
assert.match(stateEngineSource, /const amount = eventFulfilled \? 1 : 0\.5/);
assert.match(stateEngineSource, /relationshipFulfilled && planned\.relationship_beat/);
assert.match(stateEngineSource, /observedRank > currentRank/);
assert.match(stateEngineSource, /const changed = \['closer', 'distant', 'mixed'\]/);
assert.match(stateEngineSource, /!\['none', 'unclear'\]\.includes\(decisions\.unresolved\)/);
assert.match(stateEngineSource, /unfulfilledDestructiveRoute/);
assert.match(source, /Jev가 최근 장면을 판독하고 있습니다/);
assert.match(source, /필요한 주입문을 조립하고 있습니다/);
assert.match(source, /현재 빌런 종료 · 새 추첨 대기/);
assert.match(source, /const STATE_DB_NAME = 'scene-reader-state'/);
assert.match(source, /window\.indexedDB\.open\(STATE_DB_NAME, 1\)/);
assert.match(source, /STATE_HISTORY_LIMIT = 12/);
assert.match(source, /STORAGE_API_URL = '\/api\/plugins\/scene-reader-jev\/storage'/);
assert.match(source, /storagePost\('characters'/);
assert.match(source, /storagePost\('backup\/restore'/);
assert.match(source, /event_types\.MESSAGE_SWIPED/);
assert.match(source, /event_types\.MESSAGE_EDITED/);
assert.match(source, /event_types\.MESSAGE_DELETED/);
assert.match(source, /runEventTask/);
assert.match(source, /직전 저장 상태를 복원했습니다/);
assert.doesNotMatch(source, /rec\.stateHistory/);
assert.doesNotMatch(source, /id="sr-roleplay-pace"/);
assert.match(source, /id="sr-development-style"/);
assert.match(source, /id="sr-owner-card"/);
assert.match(source, /<details id="sr-owner-card"/);
assert.match(source, /OWNER_PASSWORD_HASH/);
assert.match(source, /sha256Hex\(candidate\)/);
assert.match(source, /잠금을 해제하지 못했습니다/);
assert.match(source, /id="sr-owner-unlock" type="button"/);
assert.match(source, /OWNER_PROMPT_STORAGE/);
assert.match(source, /ownerUnlocked: false/);
assert.match(source, /saveGlobal\('ownerUnlocked', true\)/);
assert.doesNotMatch(source, /id="sr-depth"/);
assert.doesNotMatch(source, /injectionDepth/);
assert.match(source, /setExtensionPrompt\(INJECT_KEY, scenePreset \? '' : payload, IN_CHAT, 0, false, SYSTEM_ROLE\)/);
assert.match(source, /clearLegacyPrompts/);
assert.match(source, /registerEmptyLegacyMacros/);
assert.doesNotMatch(source, /handler:.*return activeMacroPayload/);
assert.doesNotMatch(source, /world\.builtin \? '기본/);
assert.match(source, /id="sr-world-editor" hidden/);
assert.match(source, /showWorldList\(\)/);
assert.match(source, /id="sr-world-edit-hint"/);
assert.match(source, /id="sr-scene-slot-target"/);
assert.doesNotMatch(source, /id="sr-copy-macro"/);
assert.match(source, /씬판독기 전체 사용/);
assert.match(source, /판독과 주입 중단/);
assert.match(source, /document\.execCommand\('copy'\)/);
assert.match(source, /dialog\?\.open \? dialog : document\.body/);
assert.match(source, /ConnectionManagerRequestService/);
assert.doesNotMatch(source, /enableCorsProxy/);
assert.match(css, /\.sr-tabs \{[^\n]*grid-template-columns: repeat\(4/);
assert.match(css, /@media[\s\S]*\.sr-tabs \{ grid-template-columns: repeat\(2/);
assert.match(css, /100dvh/);
assert.match(css, /@media \(max-width: 600px\)/);
assert.match(css, /#sr-tab-flow\.active \{ display: grid; grid-template-columns: repeat\(2/);
assert.match(css, /\.sr-chip-grid \{ grid-template-columns: repeat\(2/);
assert.match(css, /#sr-tab-conflict > \.sr-settings-card:not\(\.sr-owner-details\)/);
assert.match(source, /<details class="sr-settings-card sr-settings-collapsible sr-developer-lock"><summary>개발자 모드/);
assert.match(css, /\.sr-run-row \.menu_button \{[^\n]*min-width: 110px/);
assert.match(css, /\[hidden\] \{ display: none !important; \}/);
assert.match(css, /button \{[^\n]*writing-mode: horizontal-tb !important/);
assert.match(css, /word-break: keep-all/);
assert.match(css, /input:not\(\[type="checkbox"\]\)/);
assert.match(css, /input\[type="checkbox"\].*appearance: auto/);
assert.match(css, /#scene-reader-quick-button \{[^\n]*width: 32px/);
assert.match(css, /\.sr-owner-details:not\(\[open\]\) > \.sr-owner-body \{ display: none; \}/);
assert.match(css, /\.sr-action-row \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); width: 100%; \}/);
const dialogIds = [...source.matchAll(/id="(sr-[^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(dialogIds).size, dialogIds.length, 'dialog element ids must be unique');
const referencedDialogIds = [...source.matchAll(/getElementById\('(sr-[^']+)'\)/g)].map((match) => match[1]);
const missingDialogIds = [...new Set(referencedDialogIds.filter((id) => !dialogIds.includes(id)))];
assert.deepEqual(missingDialogIds, [], `referenced dialog ids must exist: ${missingDialogIds.join(', ')}`);

const expectedHashes = {
    AUTONOMOUS_NPC_DYNAMICS: 'b9bca5d8decacc8bd6f9e7879473fd9308005ed6b648590cf28c940327d67e74',
    TRIGGERED_ANTAGONIST_ENCOUNTER: 'b66ebd647187d2aeb0ddaa0c10d2b163dc943ab5e159a8aea85e10b05f999052',
    ONGOING_ANTAGONIST_ENCOUNTER: '55b1b74254705840e32665dc6af6af32e6bbb15faea0f3ffdc1973feabbb2d8f',
    SUSTAINED_INTERPERSONAL_CONFLICT: 'd8ddf9808df79f7076a95622e51c9f601d4747006cf7eef003b6831f253a400c',
    CONFLICT_EXECUTION: 'be2d6c1794a82f939e2bb800a5db174e0580538b269bf07d1f45ffffbf575bb1',
    INDEPENDENT_PERSPECTIVES: '32e57bbed8dce1d8a899e409ff33beefa3d833cdf5ec8a37f8219cd5a2fea00f',
    WORLD_HOSTILITY: '4e646a4f1580bada6d342742e6843d80bc76e4edce35cdfc77d1fc18f8733e65',
    CHARACTER_TO_USER_DEFAULT: 'ed8794c84f93f82016184a1bd544ccba80a7169777c3294fc3cf7b19ce20acc7',
    NPC_TO_USER_DEFAULT: '4169eaf32516f1577a2f5f200eedc3b1e8f7c5f0b92eb41a34413d235f376450',
    USER_MISFORTUNE: '38dd4642f8bdc216a2716f28d13c0ed81d74756264b13e93428dead13891b27c',
};

assert.deepEqual(Object.keys(LEGACY_PROMPTS), Object.keys(expectedHashes));
for (const [name, expected] of Object.entries(expectedHashes)) {
    assert.equal(createHash('sha256').update(LEGACY_PROMPTS[name]).digest('hex'), expected, `${name} 원문이 변경됨`);
}

const preferences = { progressionMode: 'investigation', worldDirection: 'hostile', relationshipDirection: 'hostile', negativePriority: true, judgmentStyle: 'balanced', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium', fightSustain: true, villainEnabled: true, socialEnabled: true, worldHostility: true, npcToUser: true, userMisfortune: true };
const questions = buildQuestions({ preferences, hasVillain: false, hasNpc: false, hasEvent: false, pacingState: { relationship: { closer: 1, distant: 0 }, event: { qualifiedSteps: 1 } } });
for (const key of ['scene_state', 'conflict_state', 'relationship_motion', 'trust_signal', 'intimacy_signal', 'romance_evidence', 'counterevidence', 'unresolved', 'event_state', 'event_valence', 'event_blocker', 'resolution_readiness', 'npc_presence', 'npc_valence', 'npc_knowledge_fit', 'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'input_echo', 'repetitive_ending', 'action_evasion', 'scene_cutoff', 'response_cadence', 'relationship_pacing', 'relationship_beat', 'primary_focus', 'villain_route', 'event_route', 'progression_move', 'npc_route', 'npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure']) assert.ok(questions[key], `${key} question missing`);
for (const key of ['conversation_tone','continuity_change','ambiguity','time_relation']) assert.equal(questions[key], undefined);
for (const key of ['npc_autonomy', 'world_hostility', 'npc_guard', 'misfortune', 'directive_followthrough', 'npc_followthrough', 'resolution_pacing', 'fight_sustain']) assert.equal(questions[key], undefined, `${key} must be derived or fixed rather than redundantly Jev-gated`);
assert.equal(decisionPolicyKind('romance_evidence'), 'observation');
assert.equal(decisionPolicyKind('primary_focus'), 'routing');
assert.equal(decisionPolicyKind('input_echo'), 'diagnostic');
assert.equal(decisionPolicyKind('verification_event'), 'verification');
const observationAnswer = { choice: 'established', confidence: 0.57 };
const balancedObservation = applyDecisionPolicy({ key: 'romance_evidence', answer: observationAnswer, style: 'balanced', allowedChoices: ['none', 'established', 'unclear'], fallback: 'unclear', baseThreshold: 0.62 });
const activeObservation = applyDecisionPolicy({ key: 'romance_evidence', answer: observationAnswer, style: 'active', allowedChoices: ['none', 'established', 'unclear'], fallback: 'unclear', baseThreshold: 0.62 });
assert.equal(activeObservation.threshold, balancedObservation.threshold, 'active must not lower observation evidence thresholds');
assert.equal(activeObservation.effective, 'unclear', 'low-confidence observation must not become factual absence');
const balancedRoute = applyDecisionPolicy({ key: 'primary_focus', answer: { choice: 'event', confidence: 0.61 }, style: 'balanced', allowedChoices: ['direct', 'event'], fallback: 'direct', baseThreshold: 0.7 });
const activeRoute = applyDecisionPolicy({ key: 'primary_focus', answer: { choice: 'event', confidence: 0.61 }, style: 'active', allowedChoices: ['direct', 'event'], fallback: 'direct', baseThreshold: 0.7 });
assert.equal(balancedRoute.effective, 'direct');
assert.equal(activeRoute.effective, 'event', 'active may lower routing threshold only');
const retireActive = applyDecisionPolicy({ key: 'villain_route', answer: { choice: 'retire', confidence: 0.8 }, style: 'active', allowedChoices: ['none', 'retire'], fallback: 'none', baseThreshold: 0.78, choiceThreshold: { retire: 0.88 } });
assert.equal(retireActive.effective, 'none', 'active must not make destructive retire routes easy');
const advancedBalanced = applyDecisionPolicy({ key: 'advanced_route', answer: { choice: 'create', confidence: 0.65 }, style: 'balanced', allowedChoices: ['none', 'create'], fallback: 'none', baseThreshold: 0.7 });
const advancedActive = applyDecisionPolicy({ key: 'advanced_route', answer: { choice: 'create', confidence: 0.65 }, style: 'active', allowedChoices: ['none', 'create'], fallback: 'none', baseThreshold: 0.7 });
assert.ok(advancedActive.threshold < advancedBalanced.threshold, 'active routing may admit an advanced candidate while the separate configured draw still controls occurrence');
const relationshipBalanced = applyDecisionPolicy({ key: 'relationship_pacing', answer: { choice: 'closer_incremental', confidence: 0.68 }, style: 'balanced', allowedChoices: ['hold', 'closer_incremental'], fallback: 'hold', baseThreshold: 0.72 });
const relationshipActive = applyDecisionPolicy({ key: 'relationship_pacing', answer: { choice: 'closer_incremental', confidence: 0.68 }, style: 'active', allowedChoices: ['hold', 'closer_incremental'], fallback: 'hold', baseThreshold: 0.72 });
assert.equal(relationshipActive.threshold, relationshipBalanced.threshold, 'active execution style must not accelerate relationship pacing confidence');
const pendingFixture = { outputText: 'He finally acted.', effects: ['relationship', 'event', 'direct'] };
const verificationQuestions = buildVerificationQuestions(pendingFixture);
assert.deepEqual(Object.keys(verificationQuestions), ['verification_relationship', 'verification_event', 'verification_direct']);
assert.match(buildVerificationQuestions({ outputText: 'A reply', effects: ['progress'] }).verification_progress.instructions, /Material progress/);
assert.deepEqual(verificationSummary(pendingFixture, { verification_relationship: 'missed', verification_event: 'partial', verification_direct: 'fulfilled' }), { relationship: 'missed', event: 'partial', direct: 'fulfilled' });
assert.deepEqual(pendingPlanEffects({ relationship_pacing: 'hold', relationship_beat: 'none', event_route: 'none', progression_move: 'hold', resolution_pacing: 'continue', primary_focus: 'direct', direct_execution: 'yes' }), ['progress', 'direct']);
const actionSettings = { progressionMode: 'investigation', resolutionPace: 'fast', relationshipPace: 'medium', judgmentStyle: 'active' };
const directEventPlan = selectActionPlan({
    decisions: { primary_focus: 'direct', scene_state: 'normal', event_state: 'active', event_route: 'continue', progression_move: 'reveal', relationship_pacing: 'hold', npc_route: 'none' },
    settings: actionSettings,
    hasEventProfile: true,
});
assert.equal(directEventPlan.primary.kind, 'direct', 'a direct answer remains the primary beat');
assert.equal(directEventPlan.secondary.kind, 'event', 'an ongoing event can advance as a compatible secondary beat');
const advancedOpportunityPlan = selectActionPlan({
    decisions: { primary_focus: 'direct', scene_state: 'normal', advanced_route: 'create', advanced_move: 'seed', relationship_pacing: 'closer_incremental', relationship_beat: 'vulnerability' },
    settings: { ...actionSettings, advancedEnabled: true },
    allowUnpreparedCreates: true,
});
assert.equal(advancedOpportunityPlan.primary.kind, 'direct');
assert.equal(advancedOpportunityPlan.secondary.id, 'advanced_event', 'an eligible advanced event reaches its probability roll even when a routine relationship beat is available');
const contraryRelation = { relationship_pacing: 'closer_significant', relationship_beat: 'confession', counterevidence: 'clear', resolution_readiness: 'none', event_route: 'none', event_state: 'none', npc_route: 'none' };
coordinateDecisions({ preferences: { advancedEnabled: false, progressionMode: 'off', relationshipPace: 'slow', resolutionPace: 'medium' }, pacingState: { relationship: { closer: 0 } } }, {}, contraryRelation);
assert.equal(contraryRelation.relationship_pacing, 'hold', 'clear counterevidence must not be reopened by a later pace adjustment');
const eventFirstPlan = selectActionPlan({
    decisions: { primary_focus: 'event', event_state: 'active', event_route: 'continue', progression_move: 'advance', npc_route: 'reuse', npc_role: 'witness', npc_weight: 'supporting', relationship_pacing: 'closer_incremental' },
    settings: actionSettings,
    hasEventProfile: true,
    hasNpcProfile: true,
});
assert.equal(eventFirstPlan.primary.kind, 'event');
assert.equal(eventFirstPlan.secondary.kind, 'npc');
assert.ok(eventFirstPlan.overlays.some(item=>item.kind==='relationship'),'relationship expression can accompany the same event and NPC exchange');
assert.ok(eventFirstPlan.overlays.some(item=>item.kind==='direct'),'answering the user stays inside the event rather than being excluded');
assert.ok(!eventFirstPlan.excluded.some((item) => item.kind === 'direct' || item.kind === 'relationship'));
const combinedDecisions={primary_focus:'event',event_state:'active',event_route:'continue',progression_move:'advance',npc_route:'reuse',npc_role:'witness',npc_weight:'supporting',relationship_pacing:'closer_incremental',relationship_beat:'vulnerability'};
const combinedRecord={preferences:actionSettings,progressionState:{turnsSinceMeaningfulProgress:0},eventProfile:{},npcProfile:{}};
coordinateActionBudget(combinedRecord,{},combinedDecisions,combinedRecord);
assert.equal(combinedDecisions.direct_execution,'yes','current input receives an answer inside the event');
assert.equal(combinedDecisions.relationship_pacing,'closer_incremental','supported relationship movement remains available in the same interaction');
assert.equal(combinedDecisions.npc_route,'reuse','existing NPC can act within the event');
const failedNewEventPlan = selectActionPlan({
    decisions: { primary_focus: 'new_event', event_route: 'waiting', progression_move: 'hold', relationship_pacing: 'closer_incremental', relationship_beat: 'vulnerability' },
    settings: actionSettings,
    hasEventProfile: false,
});
assert.equal(failedNewEventPlan.primary.kind, 'relationship', 'a failed new-event roll must fall back to a concrete relationship route');
const directFallbackPlan = selectActionPlan({ decisions: { primary_focus: 'new_event', event_route: 'waiting', progression_move: 'hold' }, settings: actionSettings });
assert.equal(directFallbackPlan.primary.kind, 'direct', 'active routing must retain a concrete direct action when plot routes fail');
const transitionPlan = selectActionPlan({
    decisions: { primary_focus: 'transition', progression_move: 'transition', npc_route: 'reuse', npc_role: 'witness', npc_weight: 'brief' },
    settings: actionSettings,
    hasNpcProfile: true,
});
assert.equal(transitionPlan.primary.kind, 'transition');
assert.equal(transitionPlan.secondary, null, 'a scene transition cannot become or take a secondary action');
const externalConflictPlan = selectActionPlan({
    decisions: { primary_focus: 'relationship', relationship_pacing: 'closer_incremental', relationship_beat: 'vulnerability' },
    settings: actionSettings,
    externalCandidates: [{ id: 'dependent-followup', kind: 'continuity', label: 'Dependent follow-up', compatibleWith: ['event'] }],
});
assert.ok(externalConflictPlan.excluded.some((item) => item.id === 'external:dependent-followup'), 'external candidates obey the same primary compatibility gate');
const candidateOutput = 'He accepted responsibility.';
const pendingCandidate = { id: 'responsibility', label: 'Brother begins his accepted task', evidence: 'He accepted responsibility.', compatibleWith: ['direct'], sourceIdentity: { chatKey: 'chat-a', assistantIndex: 1, outputFingerprint: stableFingerprint(candidateOutput), sourceRevision: 'source-a' } };
const sourceChat = [{ is_user: true, mes: 'Take care of it.' }, { is_user: false, mes: candidateOutput }];
const validCandidates = activePendingCandidates([pendingCandidate], { chatKey: 'chat-a', chat: sourceChat, sourceRevision: 'source-a' });
assert.equal(validCandidates.length, 1);
assert.equal(activePendingCandidates([pendingCandidate], { chatKey: 'chat-a', chat: [{ ...sourceChat[0] }, { ...sourceChat[1], mes: 'He declined.' }], sourceRevision: 'source-a' }).length, 0, 'a changed swipe invalidates an async candidate');
assert.equal(activePendingCandidates([pendingCandidate], { chatKey: 'chat-a', chat: sourceChat, sourceRevision: 'source-b' }).length, 0, 'source revisions invalidate old candidates');
assert.ok(buildPendingCandidateQuestions(validCandidates).continuity_candidate_0);
assert.equal(verifiedSecondaryCandidates(validCandidates, { continuity_candidate_0: 'reject' }).length, 0);
assert.equal(verifiedSecondaryCandidates(validCandidates, { continuity_candidate_0: 'accept' }).length, 1);
const pressureState = { progressionState: { turnsSinceMeaningfulProgress: 0, lastOutputFingerprint: '' } };
updateProgressionPressure(pressureState, { outputFingerprint: 'output-a' }, { progress: 'missed' }, { activeThread: true });
assert.equal(pressureState.progressionState.turnsSinceMeaningfulProgress, 1);
updateProgressionPressure(pressureState, { outputFingerprint: 'output-a' }, { progress: 'missed' }, { activeThread: true });
assert.equal(pressureState.progressionState.turnsSinceMeaningfulProgress, 1, 'the same output cannot create additional stall pressure');
updateProgressionPressure(pressureState, { outputFingerprint: 'output-b' }, { progress: 'fulfilled' }, { activeThread: true });
assert.equal(pressureState.progressionState.turnsSinceMeaningfulProgress, 0, 'actual verified progress releases stall pressure');
const oocFiltered = filterNonRpHistory([
    { is_user: true, mes: 'Open the door.' },
    { is_user: false, mes: 'She opens it.' },
    { is_user: true, mes: '(OoC: Explain the injection.)', extra: { ooc_chat: true } },
    { is_user: false, mes: 'The injected prompt was...' },
    { is_user: true, mes: 'What is outside?' },
], [3]);
assert.deepEqual(oocFiltered.map((message) => message.mes), ['Open the door.', 'She opens it.', 'What is outside?'], 'prior OOC-only exchanges cannot become RP evidence or consume a recent-turn slot');
const stateFixture = () => ({
    pacingState: { relationship: { closer: 0, distant: 0, lastBeat: 'none', evidence: [] }, event: { qualifiedSteps: 3, evidence: [{ fingerprint: 'old' }] } },
    relationshipState: { motion: 'closer', trust: 'positive', intimacy: 'positive', romance: 'established', lastBeat: 'commitment' },
    sceneState: { unresolved: 'relationship' },
    eventProfile: { id: 'old-event', title: 'Old', phase: 'introduced', progress: 0 },
    npcProfile: null,
    villainProfile: null,
    lastEventRoll: null,
    lastNpcRoll: null,
    lastVillainRoll: null,
    backgroundEvents: [],
    advancedEntities: [],
});
const observedState = stateFixture();
commitObservedState(observedState, { relationship_motion: 'unclear', trust_signal: 'none', intimacy_signal: 'none', romance_evidence: 'none', unresolved: 'unclear', event_state: 'unclear' }, 'same-cause');
assert.equal(observedState.relationshipState.romance, 'established', 'current none must not erase established romance');
assert.equal(observedState.relationshipState.trust, 'positive', 'missing current trust signal must not erase prior trust state');
assert.equal(observedState.sceneState.unresolved, 'relationship', 'unclear scene state must not erase stored unresolved state');
commitObservedState(observedState, { relationship_motion: 'closer', trust_signal: 'positive', intimacy_signal: 'positive', romance_evidence: 'established', unresolved: 'relationship', event_state: 'turning' }, 'same-cause');
commitObservedState(observedState, { relationship_motion: 'closer', trust_signal: 'positive', intimacy_signal: 'positive', romance_evidence: 'established', unresolved: 'relationship', event_state: 'turning' }, 'same-cause');
assert.equal(observedState.pacingState.relationship.closer, 1, 'the same relationship cause must be counted once');
assert.equal(observedState.eventProfile.phase, 'turning', 'actual observed event phase must advance beyond introduced');
const missedState = stateFixture();
const preparedNew = { ...stateFixture(), eventProfile: { id: 'new-event', title: 'New', phase: 'introduced', progress: 0 }, lastEventRoll: { roll: 4, chance: 35 } };
const pendingNew = { inputKey: 'input-a', outputFingerprint: 'output-a', decisions: { event_route: 'create', progression_move: 'advance', resolution_pacing: 'continue' }, preparedStateSnapshot: preparedNew };
const missedCommit = commitVerifiedPlan(missedState, pendingNew, { event: 'missed' });
assert.equal(missedCommit.committed, false);
assert.equal(missedState.eventProfile.id, 'old-event', 'planned event must not replace persistent state when execution was missed');
assert.equal(missedState.pacingState.event.qualifiedSteps, 3);
assert.deepEqual(missedState.lastEventRoll, { roll: 4, chance: 35 }, 'probability roll state may persist independently of fictional execution');
const partialState = stateFixture();
const partialCommit = commitVerifiedPlan(partialState, pendingNew, { event: 'partial' });
assert.equal(partialCommit.committedEffects.event, 'partial');
assert.equal(partialState.eventProfile.id, 'new-event');
assert.equal(partialState.pacingState.event.qualifiedSteps, 0.5, 'partial execution must not count as a full event step');
const partialRetireState = stateFixture();
commitVerifiedPlan(partialRetireState, { inputKey: 'retire', outputFingerprint: 'retire-output', decisions: { event_route: 'retire' }, preparedStateSnapshot: { ...stateFixture(), eventProfile: null } }, { event: 'partial' });
assert.equal(partialRetireState.eventProfile.id, 'old-event', 'partial retirement must not delete an active event');
const partialReplaceState = stateFixture();
const preparedReplacement = { ...stateFixture(), eventProfile: { id: 'replacement', title: 'Replacement', phase: 'introduced', progress: 0 }, lastEventRoll: { roll: 2, chance: 35 } };
commitVerifiedPlan(partialReplaceState, { inputKey: 'replace', outputFingerprint: 'replace-output', decisions: { event_route: 'replace', progression_move: 'advance' }, preparedStateSnapshot: preparedReplacement }, { event: 'partial' });
assert.equal(partialReplaceState.eventProfile.id, 'old-event', 'partial replacement must preserve the prior event until replacement is fulfilled');
assert.equal(partialReplaceState.pacingState.event.qualifiedSteps, 3, 'partial replacement must not advance the old event with the new plan');
const partialNpcReplaceState = { ...stateFixture(), npcProfile: { id: 'old-npc' }, villainProfile: { id: 'old-villain' } };
commitVerifiedPlan(partialNpcReplaceState, { inputKey: 'npc-replace', outputFingerprint: 'npc-output', decisions: { npc_route: 'replace', villain_route: 'replace' }, preparedStateSnapshot: { ...stateFixture(), npcProfile: { id: 'new-npc' }, villainProfile: { id: 'new-villain' } } }, { npc: 'partial' });
assert.equal(partialNpcReplaceState.npcProfile.id, 'old-npc', 'partial NPC replacement must preserve the prior NPC');
assert.equal(partialNpcReplaceState.villainProfile.id, 'old-villain', 'partial antagonist replacement must preserve the prior antagonist');
const relationPartialState = stateFixture();
commitVerifiedPlan(relationPartialState, { inputKey: 'rel', outputFingerprint: 'rel-output', decisions: { relationship_beat: 'confession' }, preparedStateSnapshot: stateFixture() }, { relationship: 'partial' });
assert.equal(relationPartialState.relationshipState.lastBeat, 'commitment', 'partial relationship beat must not be committed as fully executed');
const npc = rollNpcProfile('investigation', () => 0);
assert.equal(npc.role, 'witness');
assert.equal(npc.stake, 'personal safety');
assert.equal(npc.constraint, 'limited time or access');
const event = rollEventProfile('investigation', () => 0);
const directWithEventPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', progressionMode: 'investigation', advancedEnabled: false, relationshipPace: 'medium', resolutionPace: 'fast', roleplayPace: 'medium' },
    decisions: { response_cadence: 'natural', primary_focus: 'direct', secondary_focus: 'event', direct_execution: 'yes', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'active', event_route: 'continue', progression_move: 'reveal', resolution_pacing: 'continue', npc_route: 'none', villain_route: 'none', fight_sustain: 'no' },
    eventProfile: event,
});
assert.match(directWithEventPayload, /<DIRECT_SCENE_EXECUTION>/, 'direct primary must reach the actual injection');
assert.match(directWithEventPayload, /<RP_EVENT_BEAT role="secondary"/, 'compatible stored-event progress must survive into the actual injection');
assert.match(directWithEventPayload, /Use only one directly dependent sign/, 'secondary event must stay proportionate to the active interaction');
assert.equal(event.title, '진술의 핵심 모순');
assert.equal(advancedChance('conservative'), 18);
assert.equal(advancedChance('balanced'), 35);
assert.equal(advancedChance('active'), 58);
assert.equal(advancedChance('very_active'), 75);
assert.ok(BUILTIN_WORLDS.some((world) => world.id === 'campus'));
const presetWorld = BUILTIN_WORLDS.find((world) => world.id === 'current');
assert.equal(presetWorld?.name, '프리셋 기본 세계관 사용');
assert.equal(presetWorld?.prompt, '', 'preset world option must not inject a separate world prompt');
assert.match(presetWorld?.hint || '', /No preset or lorebook text is supplied to Jev here/);
assert.equal(INITIAL_CUSTOM_WORLDS.length, 5);
assert.equal(isFranchiseWorld(INITIAL_CUSTOM_WORLDS.find((world) => world.id === 'custom-harry-potter')), true);
assert.equal(isFranchiseWorld(INITIAL_CUSTOM_WORLDS.find((world) => world.id === 'custom-general-world')), false);
const savedLocalStorage = globalThis.localStorage;
const localValues = new Map([[CUSTOM_WORLD_STORAGE, JSON.stringify([null, { id: 'custom-ok', name: '정상', prompt: 'Keep continuity.' }, { id: 'custom-ok', name: '중복', prompt: 'Duplicate.' }, { id: '', name: '손상', prompt: '' }])]]);
globalThis.localStorage = { getItem: (key) => localValues.get(key) ?? null, setItem: (key, value) => localValues.set(key, value) };
const recoveredWorlds = loadCustomWorlds();
assert.equal(recoveredWorlds.length, 1);
assert.equal(recoveredWorlds[0].id, 'custom-ok');
assert.equal(recoveredWorlds[0].hint, '정상');
assert.equal(recoveredWorlds[0].franchise, false);
assert.equal(saveCustomWorlds([{ id: 'legacy-canon', name: '원작', prompt: '## CANON_FIDELITY_PASS' }]), true);
assert.equal(JSON.parse(localValues.get(CUSTOM_WORLD_STORAGE))[0].franchise, true, 'legacy imported canon prompt must migrate to explicit franchise metadata');
if (savedLocalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = savedLocalStorage;
const baseChat = [
    { is_user: true, mes: '첫 질문', name: 'U' },
    { is_user: false, mes: '첫 답변', name: 'C' },
    { is_user: true, mes: '둘째 질문', name: 'U' },
    { is_user: false, mes: '둘째 답변', name: 'C' },
    { is_user: false, mes: '숨김 기억', hidden: true, name: 'C' },
];
const pendingTranscript = buildRecentTranscript({ chat: baseChat, pendingUserText: '방금 전송한 입력', turnCount: 2, userName: 'U', characterName: 'C' });
assert.doesNotMatch(pendingTranscript, /첫 질문/);
assert.match(pendingTranscript, /둘째 질문/);
assert.match(pendingTranscript, /방금 전송한 입력/);
assert.doesNotMatch(pendingTranscript, /숨김 기억/);
assert.equal(selectRecentMessages({ chat: baseChat, pendingUserText: '현재 입력', turnCount: 1 }).filter((message) => message.is_user).length, 1, 'recent range must be selected once before role splitting');
assert.deepEqual(splitOocText('Hello.\n(OoC: 아직 화해하지 마.)\n[사담: Marcus는 모른다.]'), { rpText: 'Hello.', oocBlocks: ['아직 화해하지 마.', 'Marcus는 모른다.'], malformed: false });
assert.equal(splitOocText('(OOC: 여러 줄\n지시)').oocBlocks[0], '여러 줄\n지시');
assert.equal(splitOocText('(OOC: 닫히지 않음').malformed, true);
const mixedContext = buildRecentContext({
    chat: [...baseChat, { is_user: true, mes: 'Fine.\n(OOC: 아직 화해하지 마.)', name: 'U' }],
    turnCount: 3,
    userName: 'U',
    characterName: 'C',
});
assert.match(mixedContext.recentRoleplay, /Fine\./);
assert.doesNotMatch(mixedContext.recentRoleplay, /화해하지/);
assert.equal(mixedContext.metaGuidance.current, '아직 화해하지 마.');
assert.equal(mixedContext.oocOnly, false);
const mixedContextWithDifferentPending = buildRecentContext({
    chat: [...baseChat, { is_user: true, mes: '다른 현재 입력', name: 'U' }],
    turnCount: 3,
    userName: 'U',
    characterName: 'C',
});
assert.equal(mixedContext.observationKey, mixedContextWithDifferentPending.observationKey, 'relationship evidence key must follow the latest CHARACTER output rather than count each new USER reaction as a new cause');
const changedRecentCharacter = buildRecentContext({
    chat: baseChat.map((message, index) => index === 3 ? { ...message, mes: '수정된 둘째 답변' } : message),
    turnCount: 2,
});
assert.notEqual(changedRecentCharacter.contextKey, buildRecentContext({ chat: baseChat, turnCount: 2 }).contextKey, 'editing a CHARACTER message in the selected range must invalidate the judgment context');
const changedRecentUser = buildRecentContext({
    chat: baseChat.map((message, index) => index === 2 ? { ...message, mes: '수정된 둘째 질문' } : message),
    turnCount: 2,
});
assert.notEqual(changedRecentUser.contextKey, buildRecentContext({ chat: baseChat, turnCount: 2 }).contextKey, 'editing a USER message in the selected range must invalidate the judgment context');
const markedOocContext = buildRecentContext({
    chat: [...baseChat, { is_user: true, mes: 'OOC_CHAT 본문', name: 'U', extra: { ooc_chat: true, ooc_instruction: '고정 송신 지시를 본문으로 쓰지 말 것' } }],
    turnCount: 3,
});
assert.equal(markedOocContext.oocOnly, true);
assert.equal(markedOocContext.confirmedOoc, true);
assert.equal(markedOocContext.metaGuidance.current, 'OOC_CHAT 본문');
assert.doesNotMatch(JSON.stringify(markedOocContext.metaGuidance), /고정 송신 지시/);
assert.doesNotMatch(markedOocContext.recentRoleplay, /OOC_CHAT 본문/);
const unmarkedSameTextContext = buildRecentContext({ chat: [...baseChat, { is_user: true, mes: 'OOC_CHAT 본문', name: 'U' }], turnCount: 3 });
assert.notEqual(markedOocContext.contextKey, unmarkedSameTextContext.contextKey, 'the stable OOC_CHAT marker must participate in context invalidation');
const sameRpDifferentOocA = buildInputKey([...baseChat, { is_user: true, mes: 'Fine.\n(OOC: 아직 화해하지 마.)' }]);
const sameRpDifferentOocB = buildInputKey([...baseChat, { is_user: true, mes: 'Fine.\n(OOC: 이제 화해해도 돼.)' }]);
assert.notEqual(sameRpDifferentOocA, sameRpDifferentOocB, 'input key must retain the full raw USER message including changed OOC');
assert.equal(latestUserMessageText(baseChat, '(OOC: 잠시 멈춤)'), '(OOC: 잠시 멈춤)');
assert.equal(appendPendingUserMessage([...baseChat, { is_user: true, mes: '동일 입력' }], '동일 입력').filter((message) => message.is_user && message.mes === '동일 입력').length, 2, 'identical consecutive user inputs are still distinct turns');
const preSendKey = buildInputKey(baseChat, '방금 전송한 입력');
const postSendKey = buildInputKey([...baseChat, { is_user: true, mes: '방금 전송한 입력', name: 'U' }]);
assert.equal(preSendKey, postSendKey, 'pre-send and saved forms of the same user input must share a key');
assert.equal(pendingComposerText('normal', { automatic_trigger: false }, ' 새 입력 '), '새 입력');
assert.equal(pendingComposerText('swipe', {}, '무시할 입력'), '');
assert.equal(pendingComposerText('normal', { automatic_trigger: true }, '무시할 입력'), '');
const firstContinueSalt = generationCycleSalt(baseChat, 'continue', {});
const continuedChat = baseChat.map((message, index) => index === 3 ? { ...message, mes: '둘째 답변 뒤에 이어진 내용' } : message);
const nextContinueSalt = generationCycleSalt(continuedChat, 'continue', {});
assert.notEqual(firstContinueSalt, nextContinueSalt, 'continued output must form a new judgment cycle after its text changes');
assert.equal(generationCycleSalt(baseChat, 'swipe', {}), '');
assert.equal(sha256Fallback('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
assert.equal(sha256Fallback('모바일 테스트'), createHash('sha256').update('모바일 테스트').digest('hex'));
assert.equal(await sha256Hex('모바일 테스트', null), sha256Fallback('모바일 테스트'), 'owner unlock hashing must work without Web Crypto');
const advancedQuestions = buildQuestions({ preferences: { ...preferences, advancedEnabled: true, advancedStyle: 'active', advancedElements: ADVANCED_DEFAULT_ELEMENTS, worldHint: 'campus', advancedEventTitle: '' }, hasVillain: false, hasNpc: false, hasEvent: false });
for (const key of ['advanced_entry', 'advanced_route', 'advanced_cause', 'advanced_element', 'advanced_move']) assert.ok(advancedQuestions[key], `${key} question missing`);
assert.ok(advancedQuestions.event_route, 'advanced mode adds to ordinary event routing');
assert.doesNotMatch(advancedQuestions.primary_focus.criteria.new_event, /Do not select/, 'advanced mode must keep new-event focus available');
assert.match(advancedQuestions.advanced_element.instructions, /ordinary RP progression type remains active/);
const continuingAdvancedQuestions = buildQuestions({ preferences: { ...preferences, advancedEnabled: true, advancedStyle: 'active', advancedElements: ['social'], worldHint: 'campus', advancedEventTitle: '저장 사건', advancedEventElement: 'threat' }, hasVillain: false, hasNpc: false, hasEvent: true });
assert.ok(continuingAdvancedQuestions.advanced_element.criteria.threat, 'stored event element must remain routable after its creation toggle is disabled');
assert.match(continuingAdvancedQuestions.advanced_element.instructions, /stored advanced event, keep its fixed element/);
const storedAdvancedQuestions = buildQuestions({ preferences: { ...preferences, advancedEnabled: true, advancedElements: ['social'] }, hasVillain: false, hasNpc: false, hasEvent: true, eventSource: 'advanced' });
assert.equal(storedAdvancedQuestions.event_route, undefined, 'a stored advanced event has one owner and no duplicate ordinary event route');
assert.equal(storedAdvancedQuestions.primary_focus.criteria.new_event, undefined, 'a second central event is not offered while one is stored');
assert.doesNotMatch(source, /id="sr-progression-mode"/);
assert.doesNotMatch(source, /id="sr-event-chance"/);
assert.doesNotMatch(source, /decisions\.advanced_route === 'create' && focus !== 'new_event'/, 'a direct primary must not erase an otherwise compatible advanced event candidate');
assert.match(source, /진행 중인 사건의 기존 요소 유지/);
assert.equal((source.match(/id="sr-world-profile"/g) || []).length, 1, 'active world selector must exist only once');
assert.ok(source.indexOf('id="sr-world-profile"') < source.indexOf('id="sr-tab-advanced"'), 'active world selector must stay in the first tab');
const advancedEvent = rollAdvancedEvent('exploration', { random: () => 0, worldId: 'campus', worldName: '현대 대학·캠퍼스' });
const advancedPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', progressionMode: 'natural', advancedEnabled: true, relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium' },
    decisions: { response_cadence: 'natural', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'none', resolution_pacing: 'continue', primary_focus: 'event', advanced_route: 'create', advanced_move: 'seed', advanced_cause: 'location', npc_route: 'none', villain_route: 'none', fight_sustain: 'no' },
    eventProfile: advancedEvent,
});
assert.match(advancedPayload, /<ADVANCED_PROGRESSION element="exploration" move="seed" cause="location">/);
assert.doesNotMatch(advancedPayload, /<RP_PROGRESSION/);

// A low-confidence future route is an eligible draw in active mode, not an
// observed fact. The same decision must survive coordination and assembly.
const activeCreate = applyPolicy('event_route', { choice: 'create', confidence: 0.48, probabilities: { create: 0.59, continue: 0.24, none: 0.04 } }, 'active', ['none', 'continue', 'create']);
assert.equal(activeCreate.effective, 'create');
const routingRecord = {
    preferences: { ...preferences, progressionMode: 'investigation', advancedEnabled: false, advancedElements: [], judgmentStyle: 'active', relationshipPace: 'medium', resolutionPace: 'medium', eventChance: 100, appearanceChance: 100 },
    pacingState: { relationship: { closer: 0, distant: 0 }, event: { qualifiedSteps: 0 } },
    progressionState: { turnsSinceMeaningfulProgress: 0 }, sceneOpportunity: 1,
};
const routingDecisions = { primary_focus: 'direct', scene_state: 'normal', event_state: 'unclear', event_route: activeCreate.effective, progression_move: 'reveal', relationship_pacing: 'closer_incremental', relationship_beat: 'vulnerability', resolution_readiness: 'unclear', resolution_pacing: 'continue', npc_route: 'none', advanced_route: 'none', advanced_move: 'quiet' };
const routingDetails = {};
coordinateDecisions(routingRecord, routingDetails, routingDecisions);
assert.equal(routingDecisions.event_route, 'create', 'an unclear observed event does not prove that a central event already exists');
const beforeDraw = selectActionPlan({ decisions: routingDecisions, settings: routingRecord.preferences, allowUnpreparedCreates: true });
assert.equal(beforeDraw.secondary?.id, 'event', 'active new-event candidate reaches the configured draw ahead of a routine relationship beat');
const deferredByRelationship = selectActionPlan({ decisions: { ...routingDecisions, primary_focus: 'relationship' }, settings: routingRecord.preferences, allowUnpreparedCreates: true });
assert.deepEqual(nextDeferredRoutes({}, deferredByRelationship), { event: 1 }, 'an eligible event excluded by the action budget remains a bounded future candidate');
assert.deepEqual(nextDeferredRoutes({ event: 3 }, beforeDraw), {}, 'selection clears a deferred route without claiming it occurred in RP');
const { prepareProfiles } = createDraws(() => ({ id: 'current', name: 'Current world' }));
const savedRandom = Math.random;
try { Math.random = () => 0; prepareProfiles(routingRecord, routingDecisions, routingDetails); }
finally { Math.random = savedRandom; }
assert.ok(routingRecord.eventProfile && routingRecord.lastEventRoll, 'a successful configured draw prepares one event');
const afterDraw = coordinateActionBudget(routingRecord, routingDetails, routingDecisions, routingRecord);
assert.equal(afterDraw.secondary?.id, 'event');
assert.match(buildInjection({ settings: routingRecord.preferences, decisions: routingDecisions, eventProfile: routingRecord.eventProfile }), /<RP_EVENT_BEAT/);

const observedEventRecord = { ...routingRecord, eventProfile: null, preferences: { ...routingRecord.preferences, advancedEnabled: true, advancedElements: ['social'] } };
const observedEventDecisions = { primary_focus: 'direct', scene_state: 'normal', event_state: 'active', event_route: 'continue', progression_move: 'reveal', relationship_pacing: 'hold', relationship_beat: 'none', resolution_readiness: 'partial', advanced_entry: 'latent', advanced_route: 'none', advanced_cause: 'none', advanced_element: 'none', advanced_move: 'quiet', npc_route: 'none' };
coordinateDecisions(observedEventRecord, {}, observedEventDecisions);
assert.equal(observedEventDecisions.event_route, 'continue', 'an existing RP event can progress without an extension-stored event');
const observedPlan = coordinateActionBudget(observedEventRecord, {}, observedEventDecisions, observedEventRecord);
assert.equal(observedPlan.secondary?.id, 'event');
assert.match(buildInjection({ settings: observedEventRecord.preferences, decisions: observedEventDecisions }), /<RP_PROGRESSION/);

const smallBeatDecisions = { ...observedEventDecisions, event_state: 'none', event_route: 'none', progression_move: 'hold', advanced_entry: 'latent', advanced_cause: 'location', advanced_element: 'social', advanced_move: 'seed' };
coordinateDecisions(observedEventRecord, {}, smallBeatDecisions);
const smallBeatPlan = coordinateActionBudget(observedEventRecord, {}, smallBeatDecisions, observedEventRecord);
assert.equal(smallBeatPlan.secondary?.id, 'advanced_scene', 'advanced mode can produce a bounded beat without creating an event');
assert.match(buildInjection({ settings: observedEventRecord.preferences, decisions: smallBeatDecisions }), /<ADVANCED_PROGRESSION[^>]*element="social" move="seed"/);
assert.match(buildInjection({ settings: observedEventRecord.preferences, decisions: smallBeatDecisions }), /Ground this small beat in the current place or route\. Use a concrete social obligation/);

const npcCreate = applyPolicy('npc_route', { choice: 'create', confidence: 0.50 }, 'active', ['none', 'reuse', 'create']);
assert.equal(npcCreate.effective, 'create');
const npcDecision = { primary_focus: 'direct', event_state: 'none', event_route: 'none', relationship_pacing: 'hold', relationship_beat: 'none', npc_route: npcCreate.effective, npc_role: 'participant', npc_weight: 'background', npc_knowledge: 'none', npc_disclosure: 'none' };
coordinateDecisions(routingRecord, {}, npcDecision);
assert.equal(npcDecision.npc_route, 'create', 'independent NPC role and weight answers do not veto an eligible route');
assert.equal(npcDecision.npc_weight, 'brief');
assert.equal(selectActionPlan({ decisions: npcDecision, settings: routingRecord.preferences, allowUnpreparedCreates: true }).secondary?.id, 'npc');
const sheetNpcPayload = buildInjection({ settings: routingRecord.preferences, decisions: { ...npcDecision, npc_route: 'reuse', npc_weight: 'brief', npc_role: 'opposition' }, sheetNpcTarget: 'Wade', sheetCastNames: ['Wade'] });
assert.match(sheetNpcPayload, /<SHEET_NPC_SCENE>Let Wade perform/);
assert.doesNotMatch(sheetNpcPayload, /<NPC_SCENE_EXECUTION/, 'registered sheet NPCs never receive generic generated-cast execution');

const exactPayload = buildInjection({
    settings: { worldDirection: 'hostile', relationshipDirection: 'hostile', negativePriority: true, progressionMode: 'off', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium', socialEnabled: true, worldHostility: true, npcToUser: true, userMisfortune: true },
    decisions: { response_cadence: 'natural', npc_autonomy: 'yes', fight_sustain: 'yes', villain_route: 'none', relationship_pacing: 'closer_incremental', relationship_beat: 'confession', event_state: 'active', resolution_pacing: 'partial', hesitation_drag: 'yes', refusal_stall: 'no', circularity: 'no', user_handoff: 'yes', action_evasion: 'yes', directive_followthrough: 'partial' },
    villainProfile: null,
    npcProfile: null,
    eventProfile: null,
    privatePrompt: '<OWNER_ONLY>local</OWNER_ONLY>',
});
for (const name of ['INDEPENDENT_PERSPECTIVES', 'WORLD_HOSTILITY', 'SUSTAINED_INTERPERSONAL_CONFLICT', 'CONFLICT_EXECUTION', 'CHARACTER_TO_USER_DEFAULT', 'NPC_TO_USER_DEFAULT', 'USER_MISFORTUNE']) {
    assert.ok(exactPayload.includes(LEGACY_PROMPTS[name]), `${name} must be injected verbatim`);
}
assert.equal(exactPayload.split(LEGACY_PROMPTS.CHARACTER_TO_USER_DEFAULT).length - 1, 1, 'hostile relationship source must be injected exactly once');
assert.ok(exactPayload.includes(LEGACY_PROMPTS.AUTONOMOUS_NPC_DYNAMICS));
assert.match(exactPayload, /<RELATIONSHIP_PACING mode="medium">/);
assert.match(exactPayload, /<RELATIONSHIP_BEAT type="confession">/);
assert.match(exactPayload, /<EXECUTION_CORRECTION>/);
assert.match(exactPayload, /When an established intent, threat, hostile pressure/);
assert.match(exactPayload, /repeating hesitation or near-actions/);
assert.match(exactPayload, /Do not substitute repeated questions/);
const position = (text) => exactPayload.indexOf(text);
assert.ok(position('<WORLD_DIRECTION') < position('<RELATIONSHIP_PACING'));
assert.ok(position(LEGACY_PROMPTS.CHARACTER_TO_USER_DEFAULT) < position('<RELATIONSHIP_PACING'), 'fixed relationship policy precedes this-turn relationship execution');
assert.ok(position('<RELATIONSHIP_PACING') < position('<CONFLICT_PROGRESSION>'));
assert.ok(position('<CONFLICT_EXECUTION>') < position('<AUTONOMOUS_NPC_DYNAMICS>'));
assert.ok(position('<AUTONOMOUS_NPC_DYNAMICS>') < position('<SUSTAINED_INTERPERSONAL_CONFLICT>'));
assert.ok(position('<INDEPENDENT_PERSPECTIVES>') < position('<WORLD_HOSTILITY>'));
assert.ok(position('<WORLD_HOSTILITY>') < position('<CHARACTER_TO_USER_DEFAULT>'));
assert.ok(position('<CHARACTER_TO_USER_DEFAULT>') < position('<OWNER_ONLY>'));
assert.ok(position('<OWNER_ONLY>') < position('<NPC_TO_USER_DEFAULT>'));
assert.match(exactPayload, /<NARRATIVE_CADENCE pace="medium" mode="natural">/);
assert.ok(position('<NPC_TO_USER_DEFAULT>') < position('<USER_MISFORTUNE>'));

const eventPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', negativePriority: false, progressionMode: 'investigation', relationshipPace: 'slow', resolutionPace: 'fast', roleplayPace: 'fast', socialEnabled: false, worldHostility: false, npcToUser: false, userMisfortune: false },
    decisions: { response_cadence: 'compress', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'introduced', event_route: 'create', progression_move: 'reveal', resolution_pacing: 'continue', primary_focus: 'new_event', npc_route: 'none', villain_route: 'none', fight_sustain: 'no' },
    villainProfile: null,
    npcProfile: null,
    eventProfile: event,
});
assert.match(eventPayload, /<RP_EVENT_BEAT role="primary" mode="investigation" phase="introduced">/);
assert.match(eventPayload, /Expose one precise contradiction/);
assert.doesNotMatch(eventPayload, /진술의 핵심 모순/);
assert.match(eventPayload, /Introduce at most one limited clue/);
assert.doesNotMatch(eventPayload, /<CONFLICT_PROGRESSION>/);

const npcPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', negativePriority: false, progressionMode: 'investigation', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium', socialEnabled: false, worldHostility: false, npcToUser: false, userMisfortune: false },
    decisions: { response_cadence: 'natural', primary_focus: 'event', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'active', event_route: 'none', progression_move: 'advance', resolution_pacing: 'continue', npc_presence: 'present', npc_route: 'reuse', npc_role: 'witness', npc_weight: 'supporting', npc_knowledge: 'partial', npc_disclosure: 'selective', npc_followthrough: 'fulfilled', npc_knowledge_fit: 'fit', villain_route: 'none', fight_sustain: 'no' },
    villainProfile: null,
    npcProfile: npc,
    eventProfile: null,
});
assert.match(npcPayload, /<NPC_SCENE_EXECUTION role="witness" weight="supporting" knowledge="partial" disclosure="selective">/);
assert.match(npcPayload, /Keep the active NPC self-directed/);
assert.match(npcPayload, /do not let a guess identify the unavailable truth/);
assert.match(npcPayload, /multiple explanations open/);
assert.match(npcPayload, /Reveal only the portion/);

const npcOverreachPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', negativePriority: false, progressionMode: 'investigation', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium', socialEnabled: false, worldHostility: false, npcToUser: false, userMisfortune: false },
    decisions: { response_cadence: 'natural', primary_focus: 'event', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'active', event_route: 'none', progression_move: 'advance', resolution_pacing: 'continue', npc_route: 'none', npc_knowledge_fit: 'overreach', villain_route: 'none', fight_sustain: 'no' },
    villainProfile: null,
    npcProfile: null,
    eventProfile: null,
});
assert.match(npcOverreachPayload, /Remove the NPC's leaked conclusion/);
assert.match(npcOverreachPayload, /hunch, suspicion, intuition/);

const emptyCharacterStore = defaultCharacterStore();
assert.equal(emptyCharacterStore.enabled, false);
assert.equal(emptyCharacterStore.schemaVersion, 7);
assert.equal(selectActiveEntries(emptyCharacterStore, 'Alice is here.', 'Alice').length, 0);
const sheet = 'Name: Wade\nRole: Family patriarch and business owner.\nHe controls his son on family decisions.';
const candidate = {id:'c1',kind:'relationship',topic:'family_decisions',target:'son',rule:'Wade tends to control his son on family decisions.'};
const prepared = prepareProfileItems({items:[candidate]});
assert.equal(prepared.items.length,1);
assert.equal(prepareProfileItems({items:[{...candidate,id:'c2',rule:'가족을 통제한다.'}]}).items.length,0);
const profileOptions={characterId:'wade',sourceHash:'sheet-v1',source:sheet,analysisId:'analysis-v1'};
const verified=createProfile(prepared.items,profileOptions);
assert.equal(verified.items.length,1);
assert.match(verified.items[0].id,/wade@sheet-v1:analysis-v1:c1/);
const characterStoreFixture=normalizeCharacterStore({enabled:true,characters:[{id:'alice',name:'Alice',aliases:['A'],source:'Alice is a surgeon.\n\nShe grew up in London.'}],npcs:[{id:'wade',name:'Wade',source:sheet,sourceHash:'sheet-v1',profile:verified}]});
assert.equal(selectActiveEntries(characterStoreFixture,'Wade enters. Alice watches.','Alice').length,2);
assert.ok(chunkSheet('a'.repeat(3000),1000).length>=3);
assert.ok(selectRelevantChunks(characterStoreFixture.characters[0].source,'London',1).some(chunk=>/London/.test(chunk)));
assert.equal(currentProfileItems(characterStoreFixture.npcs[0]).length,1);
assert.equal(profileStatus(characterStoreFixture.npcs[0]),'이전 인물 규칙 보관 중 · 새 인물 기록 추출 필요');
const stale=normalizeCharacterStore({...characterStoreFixture,npcs:[{...characterStoreFixture.npcs[0],source:sheet+' changed'}]});
assert.equal(currentProfileItems(stale.npcs[0]).length,0);
assert.match(profileStatus(stale.npcs[0]),/재판독 필요/);
const selected=[{is_user:true,name:'User',mes:'Perhaps he is the culprit.',send_date:'Friday'},{is_user:false,name:'Alice',mes:'I have no proof.',send_date:'Friday'},{is_user:true,name:'User',mes:'Wade enters.',send_date:'Saturday'}];
const live=buildLiveCharacterPlan([characterStoreFixture.npcs[0]],{selected,transcript:'Wade enters. Perhaps he is the culprit.'});
assert.equal(live[0].profileCandidates.length,1);
assert.ok(live[0].contextCandidates.some(item=>item.text==='Perhaps he is the culprit.' && item.speaker==='User'));
const turnQuestions=buildCharacterTurnQuestions(live);
assert.ok(turnQuestions.character_0_presence);
assert.ok(turnQuestions.character_0_profile_slot_1);
assert.match(turnQuestions.character_0_profile_slot_1.criteria[live[0].profileCandidates[0].id],/family decisions/);
assert.ok(turnQuestions.character_0_context_slot_2);
assert.ok(turnQuestions.character_0_context_access_0);
const noSelection=resolveLiveCharacterPlan(live,{character_0_presence:'active',character_0_profile_slot_1:'none',character_0_context_slot_1:'none',character_0_response_direction:'none'});
assert.equal(noSelection[0].profileItems.length,0);
const secret=live[0].contextCandidates.find(item=>item.text==='Perhaps he is the culprit.');
const secretOrdinal=live[0].contextCandidates.indexOf(secret);
const denied=resolveLiveCharacterPlan(live,{character_0_presence:'active',character_0_context_slot_1:secret.id,['character_0_context_access_'+secretOrdinal]:'none',character_0_response_direction:'confront',character_0_response_basis:'scene'});
assert.equal(denied[0].contextItems.length,0);
assert.equal(denied[0].direction,'confront','an independent direct response survives an unrelated denied item');
const accepted=resolveLiveCharacterPlan(live,{character_0_presence:'active',character_0_profile_slot_1:live[0].profileCandidates[0].id,character_0_response_direction:'act'});
const charResult=buildCharacterInjection(accepted);
const charBlock=charResult.text;
assert.match(charBlock,/<CHARACTER_EXECUTION>/);
assert.match(charBlock,/Wade/);
assert.match(charBlock,/family decisions/);
assert.ok(charBlock.length<1900);
assert.equal(buildCharacterInjection([]).text,'');const charPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', progressionMode: 'off', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'slow' },
    decisions: { response_cadence: 'linger', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'none', resolution_pacing: 'continue', primary_focus: 'direct', npc_route: 'none', villain_route: 'none', fight_sustain: 'no', repetitive_ending: 'yes', user_handoff: 'yes', input_echo: 'yes' },
    characterBlock: charBlock,
});
assert.match(charPayload, /<CHARACTER_EXECUTION>/);
assert.equal((charPayload.match(/Do not reuse the recent closing architecture/g) || []).length, 1, 'every detected correction is represented');
assert.equal((charPayload.match(/<EXECUTION_CORRECTION>/g) || []).length, 1);
assert.match(charPayload, /Treat \{\{user\}\}'s input as already established/);
assert.match(charPayload, /Do not substitute repeated questions/);
assert.match(charPayload, /Change one concrete action, fact, consequence|Begin with a response or consequence/);
assert.ok(charPayload.indexOf('<NARRATIVE_CADENCE') < charPayload.indexOf('<CHARACTER_EXECUTION>'));
assert.match(charPayload, /one primary beat/);
const allCorrectionsPayload = buildInjection({
    settings: { worldDirection:'natural', relationshipDirection:'dynamic', progressionMode:'off', roleplayPace:'medium' },
    decisions: {
        npc_knowledge_fit:'overreach', directive_followthrough:'missed', npc_followthrough:'partial',
        action_evasion:'yes', scene_cutoff:'yes', user_handoff:'yes', circularity:'yes',
        refusal_stall:'yes', input_echo:'yes', repetitive_ending:'yes', hesitation_drag:'yes',
    },
});
const correctionLines = allCorrectionsPayload.match(/<EXECUTION_CORRECTION>\n([^]*?)\n<\/EXECUTION_CORRECTION>/)?.[1].split('\n') || [];
assert.equal(correctionLines.length, 7, 'six prioritized corrections plus scope are injected');
assert.match(allCorrectionsPayload, /Do not substitute repeated questions/);
assert.match(allCorrectionsPayload, /Do not reuse the recent closing architecture/);
assert.doesNotMatch(allCorrectionsPayload, /repeating hesitation or near-actions/);
assert.ok(correctionLines.join('\n').length < 1600, `all corrections remain compact (${correctionLines.join('\n').length} chars)`);
const repeatedEndingPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', progressionMode: 'off', relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium' },
    decisions: { response_cadence: 'natural', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'none', resolution_pacing: 'continue', primary_focus: 'direct', npc_route: 'none', villain_route: 'none', fight_sustain: 'no', repetitive_ending: 'yes' },
});
assert.match(repeatedEndingPayload, /Do not reuse the recent closing architecture/);
assert.match(library, /At least two recent outputs use materially the same closing device/);
assert.match(decisionEngineSource, /active: -0\.12/);
assert.match(decisionEngineSource, /irreversibleOrPaceSensitive/);
for (const advancedEnabled of [false, true]) {
    for (const relationshipDirection of ['dynamic', 'hostile']) {
        for (const characterEnabled of [false, true]) {
            const matrixPayload = buildInjection({
                settings: { worldDirection: 'natural', relationshipDirection, progressionMode: 'adventure', advancedEnabled, relationshipPace: 'slow', resolutionPace: 'slow', roleplayPace: 'slow', negativePriority: false },
                decisions: { response_cadence: 'natural', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'none', resolution_pacing: 'continue', primary_focus: 'direct', advanced_route: 'none', advanced_move: 'quiet', progression_move: 'hold', event_route: 'none', npc_route: 'none', villain_route: 'none', fight_sustain: 'no' },
                characterBlock: characterEnabled ? charBlock : '',
            });
            assert.equal((matrixPayload.match(/^\(Meta:/gm) || []).length, 1, 'combined injection must keep one meta wrapper');
            assert.equal(matrixPayload.includes('<CHARACTER_EXECUTION>'), characterEnabled, 'character toggle must control character injection');
            assert.equal(matrixPayload.includes(LEGACY_PROMPTS.CHARACTER_TO_USER_DEFAULT), relationshipDirection === 'hostile', 'relationship toggle must control legacy source exactly');
            assert.equal(matrixPayload.includes('<RP_PROGRESSION'), false, 'hold route must not inject plot movement');
        }
    }
}
const injectionBase = { worldDirection: 'natural', relationshipDirection: 'dynamic', negativePriority: false, progressionMode: 'natural', advancedEnabled: false, relationshipPace: 'medium', resolutionPace: 'medium', roleplayPace: 'medium', socialEnabled: false, worldHostility: false, npcToUser: false, userMisfortune: false };
const directPayload = buildInjection({ settings: injectionBase, decisions: { response_cadence: 'natural', primary_focus: 'direct', direct_execution: 'yes', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'none', resolution_pacing: 'continue', event_route: 'none', progression_move: 'hold', npc_route: 'none', villain_route: 'none', fight_sustain: 'no' } });
assert.match(directPayload, /<DIRECT_SCENE_EXECUTION>/);
assert.doesNotMatch(directPayload, /<RP_EVENT_BEAT|<RP_PROGRESSION|<ADVANCED_PROGRESSION|<NPC_SCENE_EXECUTION|<CONFLICT_PROGRESSION/);
assert.doesNotMatch(directPayload, /아직 화해하지 마|OOC_CHAT 본문/, 'raw OOC guidance must never be copied into the scene-reader injection');
const replacementEventPayload = buildInjection({ settings: injectionBase, decisions: { response_cadence: 'natural', primary_focus: 'new_event', direct_execution: 'no', relationship_pacing: 'hold', relationship_beat: 'none', event_state: 'aftermath', resolution_pacing: 'continue', event_route: 'replace', progression_move: 'advance', npc_route: 'none', villain_route: 'none', fight_sustain: 'no' }, eventProfile: event });
assert.match(replacementEventPayload, /<RP_EVENT_BEAT/, 'a prepared replacement event must be injected without rewriting its route to create');
const relationshipPayload = buildInjection({ settings: injectionBase, decisions: { response_cadence: 'natural', primary_focus: 'relationship', direct_execution: 'no', relationship_pacing: 'closer_incremental', relationship_beat: 'vulnerability', event_state: 'none', resolution_pacing: 'continue', event_route: 'none', progression_move: 'hold', npc_route: 'none', villain_route: 'none', fight_sustain: 'no' } });
assert.match(relationshipPayload, /<RELATIONSHIP_PACING/);
assert.match(relationshipPayload, /<RELATIONSHIP_BEAT type="vulnerability">/);
assert.doesNotMatch(relationshipPayload, /<DIRECT_SCENE_EXECUTION|<RP_EVENT_BEAT|<RP_PROGRESSION|<NPC_SCENE_EXECUTION|<CONFLICT_PROGRESSION/);
assert.doesNotMatch(eventPayload, /<DIRECT_SCENE_EXECUTION|<RELATIONSHIP_BEAT|<NPC_SCENE_EXECUTION|<CONFLICT_PROGRESSION/);
assert.doesNotMatch(npcPayload, /<DIRECT_SCENE_EXECUTION|<RELATIONSHIP_BEAT|<RP_EVENT_BEAT|<CONFLICT_PROGRESSION/);
assert.doesNotMatch(advancedPayload, /<DIRECT_SCENE_EXECUTION|<RP_PROGRESSION|<NPC_SCENE_EXECUTION|<CONFLICT_PROGRESSION/);
for (const [name, payload] of Object.entries({ directPayload, relationshipPayload, eventPayload, npcPayload, advancedPayload })) {
    assert.ok(payload.length < 6000, `${name} should remain compact unless an exact legacy conflict block is enabled`);
    assert.equal((payload.match(/^\(Meta:/gm) || []).length, 1, `${name} must have one meta wrapper`);
}
for (const id of ['sr-settings-button', 'sr-character-enabled', 'sr-character-editor-cancel', 'sr-character-lore-refresh', 'sr-backup-create', 'sr-backup-import']) {
    assert.match(source, new RegExp(`getElementById\\('${id}'\\).*addEventListener`), `${id} must have a working event binding`);
}
assert.match(source, /\[\['sr-character-new', 'character'\], \['sr-persona-new', 'persona'\], \['sr-npc-sheet-new', 'npc'\]\].*addEventListener/);
assert.match(source, /resolveLiveCharacterPlan/);
assert.match(source, /buildCharacterTurnQuestions\(liveCharacters\)/);
assert.match(source, /selectActiveEntries\(characterStore, transcript/);
assert.match(source, /carriedCharacterIds/);
assert.match(source, /characterTrace/);
assert.match(source, /id="sr-character-turn-results"/);
assert.match(source, /id="sr-character-analysis-list"/);
assert.match(source, /id="sr-character-analysis-result"/);
assert.match(source, /characterAnalysisSelection = \{ kind, id: entry\.id \};\s*renderCharacterStore\(\)/, 'saving must select the saved person in the analysis browser');
assert.match(source, /data-character-view-kind/);
assert.match(source, /id="sr-character-versions"/);
assert.match(source, /showVersionEditor/);
assert.match(source, /이번 시트에서 저장할 만한 개별 규칙이 없습니다/);
assert.doesNotMatch(source, /id="sr-character-analysis"/, 'the old editor-bound analysis panel must be removed');
assert.match(source, /id="sr-world-edit-franchise"/);
assert.match(await readFile(new URL('./src/character/selection.js', import.meta.url), 'utf8'), /carried\.has\(entry\.id\)/);
assert.ok(selectActiveEntries(characterStoreFixture,'Alice and Wade speak.','Alice').length<=3);

const continuitySource = 'USER:\nI told Wade about the letter.\nCHARACTER:\nWade said, "I will handle the meeting."';
const continuityIdentity = { chatKey: 'chat-a', assistantIndex: 2, outputFingerprint: stableFingerprint('Wade said, "I will handle the meeting."'), sourceRevision: 'source-a' };
const reasonerCandidates = validateReasonerResult({
    new_items: [{ kind: 'delegation', label: 'Wade handles the meeting', source_type: 'delegation', evidence: 'I will handle the meeting.', owners: ['Wade'] }],
    affected: [],
    knowledge_updates: [{ fact_id: 'letter', character: 'Wade', source: 'told', source_type: 'claim', evidence: 'I told Wade about the letter.', summary: 'The letter exists' }],
    possible_followups: [],
}, { sourceText: continuitySource, continuity: emptyContinuity(), sourceIdentity: continuityIdentity });
assert.equal(reasonerCandidates.length, 2);
assert.equal(validateReasonerResult({ new_items: [{ kind: 'plan', label: 'Already called the family', source_type: 'intention', evidence: 'I will handle the meeting.' }] }, { sourceText: continuitySource, continuity: emptyContinuity(), sourceIdentity: continuityIdentity }).length, 0, 'an intention cannot become a completed continuity item');
const committedContinuity = applyContinuityVerdicts(emptyContinuity(), reasonerCandidates, { continuity_candidate_0: 'accept_changed', continuity_candidate_1: 'supported' }, { opportunity: 2 });
assert.equal(committedContinuity.continuity.items.length, 1);
assert.equal(committedContinuity.continuity.knowledge[0].character, 'Wade');
const itemId = committedContinuity.continuity.items[0].id;
const pressuredCandidate = validateReasonerResult({ affected: [{ state_id: itemId, relation: 'pressured', pressure: 'at_risk', source_type: 'world_fact', evidence: 'I told Wade about the letter.' }] }, { sourceText: continuitySource, continuity: committedContinuity.continuity, sourceIdentity: continuityIdentity })[0];
const pressuredState = applyContinuityVerdicts(committedContinuity.continuity, [pressuredCandidate], { continuity_candidate_0: 'accept_pressured' }, { opportunity: 3 }).continuity;
assert.equal(pressuredState.items[0].lifecycle, 'active', 'causal pressure must not overwrite a confirmed lifecycle');
assert.equal(pressuredState.items[0].pressure, 'at_risk');
const visibleContinuity = selectContinuityContext(pressuredState, 'Wade handles the meeting', { opportunity: 3 });
assert.match(buildContinuityInjection(visibleContinuity), /pressure=at_risk/);
const followupCandidate = validateReasonerResult({ possible_followups: [{ related_state_id: itemId, action: 'Wade may contact the other family.', source_type: 'delegation', evidence: 'I will handle the meeting.' }] }, { sourceText: continuitySource, continuity: pressuredState, sourceIdentity: continuityIdentity })[0];
const followupQuestions = buildPendingCandidateQuestions([followupCandidate]);
assert.ok(followupQuestions.continuity_candidate_0.criteria.followup_only);
const followupState = applyContinuityVerdicts(pressuredState, [followupCandidate], { continuity_candidate_0: 'followup_only' }, { opportunity: 3 }).continuity;
assert.equal(followupState.followups[0].executed, false, 'a possible follow-up is not an executed RP fact');
const routedFollowup = verifiedSecondaryCandidates([followupCandidate], { continuity_candidate_0: 'followup_only' });
const continuityPlan = selectActionPlan({ decisions: { primary_focus: 'direct', event_route: 'none', progression_move: 'hold' }, settings: actionSettings, externalCandidates: routedFollowup });
assert.equal(continuityPlan.primary.kind, 'direct');
assert.equal(continuityPlan.secondary.kind, 'continuity');
assert.match(buildContinuityInjection(selectContinuityContext(followupState, 'Wade may contact the family', { opportunity: 3 }), followupCandidate), /Optional secondary beat/);
followupState.followups[0].lastOffered = 3;
assert.equal(selectContinuityContext(followupState, 'Wade may contact the family', { opportunity: 3 }).followups.length, 0, 'the same scene opportunity cannot repeatedly offer a follow-up');
const stProfile = { id: 'st-profile-1', name: '빠른 모델', model: 'example-small', api: 'custom', mode: 'cc' };
const stCalls = [];
const stRequestService = {
    getSupportedProfiles: () => [stProfile],
    getProfile: (id) => { assert.equal(id, stProfile.id); return stProfile; },
    validateProfile: (profile) => { assert.equal(profile, stProfile); },
    sendRequest: async (...args) => { stCalls.push(args); return { content: args[1][1].content.includes('exactly') ? '{"ok":true}' : '```json\n{"new_items":[]}\n```' }; },
};
assert.deepEqual(listConnectionProfiles(stRequestService), [{ id: 'st-profile-1', name: '빠른 모델', model: 'example-small', mode: 'cc' }]);
const checkedProfile = await requestWithConnectionProfile(stRequestService, stProfile.id, '', {}, { testing: true });
assert.equal(checkedProfile.profile.model, 'example-small');
assert.equal(checkedProfile.result.ok, true);
const liveProfile = await requestWithConnectionProfile(stRequestService, stProfile.id, 'Analyze continuity.', { source_rp: continuitySource });
assert.deepEqual(liveProfile.result, { new_items: [] });
const npcJson = '{"npcs":[{"name":"Wade Rockwell","aliases":[],"hint":"Family head"}]}';
for (const reply of [npcJson, `\uFEFF\n\`\`\`json\n${npcJson}\n\`\`\``, `Here are the names:\n\`\`\`json\n${npcJson}\n\`\`\``,
    [{ text: `\`\`\`json\n${npcJson}\n\`\`\`` }], { parts: [{ text: npcJson }] }, { content: [{ text: npcJson }] }]) {
    assert.equal(parseReasonerReply(reply).npcs[0].name, 'Wade Rockwell', 'valid NPC JSON must survive common profile response wrappers');
}
for (const reply of ['', '```json\n{"npcs":[\n```', '```json\n{}\n```\n```json\n{}\n```', '[]']) {
    assert.throws(() => parseReasonerReply(reply), 'empty, truncated, ambiguous, or non-object replies must fail clearly');
}
const npcProfileService = { ...stRequestService, sendRequest: async () => ({ content: `\`\`\`json\n${npcJson}\n\`\`\`` }) };
assert.equal((await requestWithConnectionProfile(npcProfileService, stProfile.id, 'Find NPC names.', {})).result.npcs[0].name, 'Wade Rockwell');
assert.equal(stCalls[1][0], stProfile.id, 'Reasoner must call the selected SillyTavern profile');
assert.equal(stCalls[1][1][0].role, 'system');
assert.equal(stCalls[1][1][1].role, 'user');
assert.equal(stCalls[1][3].includePreset, false, 'RP generation presets must not leak into the Reasoner call');
assert.equal(stCalls[1][3].stream, false);
await assert.rejects(() => requestWithConnectionProfile({ ...stRequestService, sendRequest: async () => ({ content: '{"ok":false}' }) }, stProfile.id, '', {}, { testing: true }), /연결 확인 응답/);

assert.equal(plugin.info.id, 'scene-reader-jev');
const routes = {};
await plugin.init({
    get(path, handler) { routes[`GET ${path}`] = handler; },
    post(path, handler) { routes[`POST ${path}`] = handler; },
});
assert.ok(routes['GET /health']);
assert.ok(routes['POST /systemone']);
assert.ok(routes['POST /storage/bootstrap']);
assert.ok(routes['POST /storage/backup/restore']);
assert.equal(Object.keys(routes).some(route => route.includes('/reasoner/')), false, 'unused separate model/key API must not be registered');

const previousFetch = globalThis.fetch;
let forwarded;
globalThis.fetch = async (url, options) => {
    forwarded = { url, options };
    return { status: 200, headers: { get: () => 'application/json' }, text: async () => '{"answers":{}}' };
};
const response = {
    code: 0,
    body: '',
    status(value) { this.code = value; return this; },
    set() { return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = JSON.stringify(value); return this; },
};
const missingKeyResponse = { ...response, code: 0, body: '' };
await routes['POST /systemone']({ get: () => '', body: {} }, missingKeyResponse);
assert.equal(missingKeyResponse.code, 401);
const invalidBodyResponse = { ...response, code: 0, body: '' };
await routes['POST /systemone']({ get: () => 'secret-key', body: null }, invalidBodyResponse);
assert.equal(invalidBodyResponse.code, 400);
const oversizedResponse = { ...response, code: 0, body: '' };
await routes['POST /systemone']({ get: () => 'secret-key', body: { state: 'x'.repeat(1_000_100) } }, oversizedResponse);
assert.equal(oversizedResponse.code, 413);
await routes['POST /systemone']({ get: () => 'secret-key', body: { model: 'other', state: 'x', questions: { q: { type: 'choice', criteria: { a: 'a', b: 'b' } } } } }, response);
globalThis.fetch = previousFetch;
assert.equal(forwarded.url, 'https://api.typesafe.ai/v1/systemone');
assert.equal(forwarded.options.headers.Authorization, 'Bearer secret-key');
assert.equal(JSON.parse(forwarded.options.body).model, 'jev-latest');
assert.equal(response.code, 200);

const storageRoot = await mkdtemp(join(tmpdir(), 'scene-reader-test-'));
const makeResponse = () => ({
    code: 200, value: null,
    status(value) { this.code = value; return this; },
    set() { return this; },
    send(value) { this.value = value; return this; },
    json(value) { this.value = value; return this; },
});
const user = { directories: { root: storageRoot } };
let storageResponse = makeResponse();
await routes['POST /storage/settings']({ user, body: { settings: { global: { enabled: true }, worlds: [{ id: 'w' }] } } }, storageResponse);
assert.equal(storageResponse.value.ok, true);
storageResponse = makeResponse();
await routes['POST /storage/chat']({ user, body: { chatKey: 'chat-a', value: { preferences: { judgmentStyle: 'active' } } } }, storageResponse);
storageResponse = makeResponse();
await routes['POST /storage/history']({ user, body: { chatKey: 'chat-a', value: [{ assistantIndex: 2 }] } }, storageResponse);
storageResponse = makeResponse();
await routes['POST /storage/characters']({ user, body: { chatKey: 'chat-a', value: characterStoreFixture } }, storageResponse);
storageResponse = makeResponse();
await routes['POST /storage/key']({ user, body: { key: 'server-secret' } }, storageResponse);
assert.match(storageResponse.value.keyStatus, /cret$/);
let serverKeyForward;
globalThis.fetch = async (_url, options) => {
    serverKeyForward = options.headers.Authorization;
    return { status: 200, headers: { get: () => 'application/json' }, text: async () => '{"answers":{}}' };
};
await routes['POST /systemone']({ user, get: () => '', body: { state: 'stored key test', questions: {} } }, makeResponse());
globalThis.fetch = previousFetch;
assert.equal(serverKeyForward, 'Bearer server-secret', 'saved server key must be used when the browser sends no key');
storageResponse = makeResponse();
await routes['POST /storage/bootstrap']({ user, body: { chatKey: 'chat-a' } }, storageResponse);
assert.equal(storageResponse.value.settings.global.enabled, true);
assert.equal(storageResponse.value.chat.preferences.judgmentStyle, 'active');
assert.equal(storageResponse.value.history.length, 1);
assert.equal(storageResponse.value.characters.characters[0].name, 'Alice');
assert.match(storageResponse.value.keyStatus, /cret$/);
storageResponse = makeResponse();
await routes['POST /storage/backup/create']({ user, body: {} }, storageResponse);
const backupId = storageResponse.value.backup.id;
assert.ok(backupId);
await routes['POST /storage/settings']({ user, body: { settings: { global: { enabled: false }, stale: true } } }, makeResponse());
storageResponse = makeResponse();
await routes['POST /storage/backup/restore']({ user, body: { id: backupId } }, storageResponse);
storageResponse = makeResponse();
await routes['POST /storage/bootstrap']({ user, body: { chatKey: 'chat-a' } }, storageResponse);
assert.equal(storageResponse.value.settings.global.enabled, true, 'restore must replace modified settings');
assert.equal(storageResponse.value.settings.stale, undefined, 'restore must remove stale data');
storageResponse = makeResponse();
await routes['POST /storage/backup/create']({ user, body: {} }, storageResponse);
const portableBackup = storageResponse.value.backup.id;
storageResponse = makeResponse();
await routes['POST /storage/backup/export']({ user, body: { id: portableBackup } }, storageResponse);
assert.equal(storageResponse.value.snapshot.portable, true);
assert.equal(JSON.stringify(storageResponse.value.snapshot).includes('server-secret'), false, 'downloads must exclude credentials');
const malicious = { schemaVersion: 1, files: [{ path: '../outside.json', text: '{}' }] };
assert.throws(() => plugin._test.validateSnapshot(malicious), /Unsafe/);
await rm(storageRoot, { recursive: true, force: true });

console.log('씬판독기 검사 통과: UI, 인물 판정, 라우팅, 전용 저장소·백업, 서버 플러그인, 빠답 원문 해시');
