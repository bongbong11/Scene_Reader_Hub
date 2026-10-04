import { createEmbeddingMaintenance } from '../retrieval/maintenance.js';
import { executionReport } from '../debug/execution-report.js';
import { registerSlashCommands } from '../adapters/slash-commands.js';
import { createDiagnostics } from '../debug/diagnostics.js';
import { createEmotionRuntime } from '../character/emotion-runtime.js';
import { createJobControl } from '../lifecycle/job-control.js';
import { createStorageIdentity } from '../storage/identity.js';
import { createOwnerStorage } from '../storage/owner.js';
import { createActivity } from '../ui/activity.js';
import { createOwnerUi } from '../ui/owner.js';
import { createClipboard } from '../ui/clipboard.js';
import { createHtml } from '../shared/html.js';
import { createRecordRepository } from '../storage/record.js';
import { createWorldSelection } from '../world/selection.js';
import { createContextRuntime } from '../context/runtime.js';
import { createOocLifecycle } from '../lifecycle/ooc.js';
import { createJevClient } from '../adapters/jev-client.js';
import { createStateSnapshots } from '../lifecycle/snapshots.js';
import { createStatusUi } from '../ui/status.js';
import { createShell } from '../ui/shell.js';
import { createGenerationLifecycle } from '../lifecycle/generation.js';
import { createStartup } from '../lifecycle/startup.js';
import { createInjectionReconcile } from '../injection/reconcile.js';
import { MODULE, INJECT_KEY, WORLD_INJECT_KEY, STATE_CAPTURE_KEY, IN_CHAT, SYSTEM_ROLE, JEV_KEY_STORAGE, JEV_API_URL, STORAGE_API_URL, JEV_MODEL, PROMPT_MACRO, WORLD_PROMPT_MACRO, MAX_TRANSCRIPT_CHARS, STATE_DB_NAME, STATE_DB_STORE, STATE_HISTORY_LIMIT, OWNER_UNLOCK_STORAGE, OWNER_PROMPT_STORAGE, OWNER_PASSWORD_HASH, DEFAULTS, CHAT_DEFAULTS } from '../storage/contract.js';
import { createRuntimeState } from '../hub/state.js';
import { createHub } from '../hub/orchestrator.js';
import { installGenerationInterceptor } from '../adapters/generation-interceptor.js';
import { createPromptObserver } from '../injection/receipt.js';
import { createPresetRequest } from '../injection/preset-request.js';
import { createTraceView } from '../ui/trace.js';
import { createCurrentStatusView } from '../ui/current-status.js';
import { notifySceneReaderToast, updateSceneReaderToast } from '../ui/toasts.js';
import { MASCOT_ICON_URL } from '../ui/mascot.js';
import { MEMORY_REFERENCE_ENABLED } from "../context/memory.js";
import { createRepository } from '../storage/repository.js';
import { createOutputLifecycle } from '../app/output-lifecycle.js';
import { createSceneExecution } from '../scene/execution.js';
import { createUiController } from '../ui/controller.js';
import { migrateKnowledge, continuityView, assignContinuity } from "../continuity/state-adapter.js";
import { readCharm, readCharacterLorebooks, mergeMemory, linkedCharacterBooks, memoryStatusText } from "../context/memory.js";
import { FALLBACKS, applyPolicy, fixedDecision, applyCharacterPolicy, applyRecordRelevance } from "../decision/answers.js";
import { createVectorRetrieval, RETRIEVAL_PROVIDERS } from '../retrieval/vectors.js';
import { renderRetrievalProgress } from '../ui/embedding-maintenance.js';
import { effectiveMap, overrideDecision, deriveDependentDecisions, coordinateDecisions, coordinateActionBudget, coordinateCharacterDecisions } from '../scene/coordinator.js';
import { createDraws } from '../scene/draws.js';
import { createResults } from '../ui/results.js';
import { dialogTemplate } from '../ui/dialog-template.js';

import { CHARACTER_LIVE_SYSTEM } from "../character/prompts.js";
import { NPC_CORE_SYSTEM, parseNpcCore, deriveEnglishCore, suggestNpcAliases } from "../character/npc-sheet.js";
import { stateCollectorMode, stateRoster } from "../character/state-collector.js";
import { mainOutputStatePrompt, collectMainOutputState } from "../character/state-main-output.js";
import { collectProfileOutputState } from "../character/state-profile-output.js";
import { latestStateForChat, latestStateEventForChat, selectedStateSwipe, storeStateEvent, dropStateEventsFrom } from "../character/state-contract.js";
import { eventSource, event_types, saveSettingsDebounced, setExtensionPrompt, chat_metadata, getRequestHeaders, isStreamingEnabled } from '../../st-adapter.js';
import { extension_settings } from '../../st-adapter.js';
import { WORLD_DIRECTIONS, RELATIONSHIP_DIRECTIONS, PROGRESSION_MODES, JUDGMENT_STYLES, DEVELOPMENT_STYLES, normalizeDevelopmentPreferences, PACE_OPTIONS, buildQuestions, buildInjection, buildPausedInjection } from '../../prompt-library.js';
import { SEASONAL_OPTIONS } from '../world/seasonal.js';
import { ADVANCED_STYLES, ADVANCED_ELEMENTS, ADVANCED_DEFAULT_ELEMENTS, BUILTIN_WORLDS } from "../world/advanced-library.js";
import { allWorlds, isFranchiseWorld, loadCustomWorlds, saveCustomWorlds } from "../world/catalog.js";
import { buildInputKey, buildRecentContext, filterNonRpHistory, generationCycleSalt, isVisibleRoleplayMessage, pendingComposerText, splitOocText } from "../context/messages.js";
import { buildVerificationQuestions, pendingPlanEffects, stableFingerprint, verificationSummary } from "../decision/policy.js";
import { archiveCurrentEvent, commitObservedState, commitVerifiedPlan, updateProgressionPressure } from "../scene/state-effects.js";
import { actionPlanSummary, selectActionPlan, nextDeferredRoutes } from "../decision/action-budget.js";
import { activePendingCandidates, buildPendingCandidateQuestions, verifiedSecondaryCandidates } from "../continuity/candidates.js";
import { REASONER_SYSTEM, applyContinuityVerdicts, buildContinuityInjection, normalizeContinuity, selectContinuityContext, validateReasonerResult } from "../continuity/engine.js";
import { listConnectionProfiles, createConnectionProfileClient } from "../adapters/connection-profile.js";
import { sha256Hex } from "../shared/security.js";
import { profileStatus, normalizeCharacterStore, selectActiveEntries, addCharacterNeedsQuestions, characterCategoryHints, buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from "../character/index.js";
import { PHYSICAL_PACES, normalizePhysicalPace } from "../character/sexual-conduct.js";

import { createJobScope, createWriteQueue, StaleRunError } from "../lifecycle/jobs.js";
import { messageSnapshot, firstChangedMessage, attachSelectedOutput } from "../context/message-identity.js";

const runtime = createRuntimeState(() => stateChatKey());
const hub = createHub({jobs:runtime.jobs,getIdentity:()=>stateChatKey(),StaleRunError});
let {noteDiagnostic, diagnosticSnapshot} = createDiagnostics({
    get hub() { return hub; },
    get activeGenerationCycle() { return runtime.activeGenerationCycle; }, set activeGenerationCycle(value) { runtime.activeGenerationCycle = value; },
    get activeInjectionPayload() { return runtime.activeInjectionPayload; }, set activeInjectionPayload(value) { runtime.activeInjectionPayload = value; },
    get activeMacroPayload() { return runtime.activeMacroPayload; }, set activeMacroPayload(value) { runtime.activeMacroPayload = value; },
    get activeWorldMacroPayload() { return runtime.activeWorldMacroPayload; }, set activeWorldMacroPayload(value) { runtime.activeWorldMacroPayload = value; },
    get characterStore() { return runtime.characterStore; }, set characterStore(value) { runtime.characterStore = value; },
    get chatReadyKey() { return runtime.chatReadyKey; }, set chatReadyKey(value) { runtime.chatReadyKey = value; },
    get diagnosticEvents() { return runtime.diagnosticEvents; }, set diagnosticEvents(value) { runtime.diagnosticEvents = value; },
    get record() { return record; },
    get selectedWorld() { return selectedWorld; },
    get serverStoreAvailable() { return runtime.serverStoreAvailable; }, set serverStoreAvailable(value) { runtime.serverStoreAvailable = value; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
    get sourceRevisionKey() { return sourceRevisionKey; },
    get stableFingerprint() { return stableFingerprint; },
    get stateChatKey() { return stateChatKey; },
    get storageVersion() { return runtime.storageVersion; }, set storageVersion(value) { runtime.storageVersion = value; },
});

let {waitForProfileState, notifyEmotionCapture, scheduleProfileStateCollection, collectCurrentEmotion} = createEmotionRuntime({
    get noteDiagnostic() { return noteDiagnostic; },
    get STATE_HISTORY_LIMIT() { return STATE_HISTORY_LIMIT; },
    get characterStore() { return runtime.characterStore; }, set characterStore(value) { runtime.characterStore = value; },
    get collectProfileOutputState() { return collectProfileOutputState; },
    get connectionRequestService() { return runtime.connectionRequestService; }, set connectionRequestService(value) { runtime.connectionRequestService = value; },
    get getContext() { return getContext; },
    get latestStateEventForChat() { return latestStateEventForChat; },
    get latestStateForChat() { return latestStateForChat; },
    get loadReasonerProfiles() { return loadReasonerProfiles; },
    get notifySceneReaderToast() { return notifySceneReaderToast; },
    get pendingProfileStateCollection() { return runtime.pendingProfileStateCollection; }, set pendingProfileStateCollection(value) { runtime.pendingProfileStateCollection = value; },
    get pendingProfileStateRequests() { return runtime.pendingProfileStateRequests; }, set pendingProfileStateRequests(value) { runtime.pendingProfileStateRequests = value; },
    get persistChat() { return persistChat; },
    get profileStateSequence() { return runtime.profileStateSequence; }, set profileStateSequence(value) { runtime.profileStateSequence = value; },
    get record() { return record; },
    get renderAll() { return renderAll; },
    get renderCharacterTurnResults() { return renderCharacterTurnResults; },
    get requestWithConnectionProfile() { return requestWithConnectionProfile; },
    get selectedStateSwipe() { return selectedStateSwipe; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
    get stableFingerprint() { return stableFingerprint; },
    get stateChatKey() { return stateChatKey; },
    get stateCollectorMode() { return stateCollectorMode; },
    get stateRoster() { return stateRoster; },
    get storeStateEvent() { return storeStateEvent; },
    get waitForOutputChanges() { return waitForOutputChanges; },
    get window() { return window; },
});

let requestWithConnectionProfile=createConnectionProfileClient({onDiagnostic:detail=>noteDiagnostic('profile_request',detail)});

let {invalidateReasonerJobs} = createJobControl({
    get hub() { return hub; },
    get jobs() { return runtime.jobs; }, set jobs(value) { runtime.jobs = value; },
    get pendingProfileStateRequests() { return runtime.pendingProfileStateRequests; }, set pendingProfileStateRequests(value) { runtime.pendingProfileStateRequests = value; },
    get reasonerGeneration() { return runtime.reasonerGeneration; }, set reasonerGeneration(value) { runtime.reasonerGeneration = value; },
    get reasonerJobs() { return runtime.reasonerJobs; }, set reasonerJobs(value) { runtime.reasonerJobs = value; },
    get stateChatKey() { return stateChatKey; },
});

let {getContext, stateChatKey, legacyStateChatKey} = createStorageIdentity({
    get SillyTavern() { return SillyTavern; },
});

let {ownerUnlocked, ownerPrompt, getSavedKey, maskKey} = createOwnerStorage({
    get JEV_KEY_STORAGE() { return JEV_KEY_STORAGE; },
    get OWNER_PROMPT_STORAGE() { return OWNER_PROMPT_STORAGE; },
    get OWNER_UNLOCK_STORAGE() { return OWNER_UNLOCK_STORAGE; },
    get localStorage() { return localStorage; },
    get privateOwnerPrompt() { return runtime.privateOwnerPrompt; }, set privateOwnerPrompt(value) { runtime.privateOwnerPrompt = value; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
});

let {showActivity, updateActivity} = createActivity({
    get setTimeout() { return (...args) => setTimeout(...args); },
    get clearTimeout() { return (...args) => clearTimeout(...args); },
    get activityToasts() { return runtime.activityToasts; }, set activityToasts(value) { runtime.activityToasts = value; },
    get noteDiagnostic() { return noteDiagnostic; },
    get notifySceneReaderToast() { return notifySceneReaderToast; },
    get updateSceneReaderToast() { return updateSceneReaderToast; },
    get window() { return window; },
});

let {renderOwnerMode} = createOwnerUi({
    get document() { return document; },
    get ownerPrompt() { return ownerPrompt; },
    get ownerUnlocked() { return ownerUnlocked; },
});

let {copyText} = createClipboard({
    get dialog() { return runtime.dialog; }, set dialog(value) { runtime.dialog = value; },
    get document() { return document; },
    get navigator() { return navigator; },
});

let {escapeHtml} = createHtml({

});

let {record, preferences, persistChat} = createRecordRepository({
    get ADVANCED_DEFAULT_ELEMENTS() { return ADVANCED_DEFAULT_ELEMENTS; },
    get ADVANCED_ELEMENTS() { return ADVANCED_ELEMENTS; },
    get ADVANCED_STYLES() { return ADVANCED_STYLES; },
    get CHAT_DEFAULTS() { return CHAT_DEFAULTS; },
    get PACE_OPTIONS() { return PACE_OPTIONS; },
    get RELATIONSHIP_DIRECTIONS() { return RELATIONSHIP_DIRECTIONS; },
    get SEASONAL_OPTIONS() { return SEASONAL_OPTIONS; },
    get WORLD_DIRECTIONS() { return WORLD_DIRECTIONS; },
    get chatRecords() { return runtime.chatRecords; }, set chatRecords(value) { runtime.chatRecords = value; },
    get migrateKnowledge() { return migrateKnowledge; },
    get normalizeContinuity() { return normalizeContinuity; },
    get normalizeDevelopmentPreferences() { return normalizeDevelopmentPreferences; },
    get normalizePhysicalPace() { return normalizePhysicalPace; },
    get reconcileInjection() { return reconcileInjection; },
    get saveServerChat() { return saveServerChat; },
    get stateChatKey() { return stateChatKey; },
});

let {availableWorlds, selectedWorld} = createWorldSelection({
    get BUILTIN_WORLDS() { return BUILTIN_WORLDS; },
    get allWorlds() { return allWorlds; },
    get loadCustomWorlds() { return loadCustomWorlds; },
    get record() { return record; },
});

let {recentContext, currentInputKey} = createContextRuntime({
    get MAX_TRANSCRIPT_CHARS() { return MAX_TRANSCRIPT_CHARS; },
    get buildInputKey() { return buildInputKey; },
    get buildRecentContext() { return buildRecentContext; },
    get filterNonRpHistory() { return filterNonRpHistory; },
    get getContext() { return getContext; },
    get record() { return record; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
});

let {rememberOocMarker, handleOocOnlySkip} = createOocLifecycle({
    get activeGenerationCycle() { return runtime.activeGenerationCycle; }, set activeGenerationCycle(value) { runtime.activeGenerationCycle = value; },
    get clearInjection() { return clearInjection; },
    get generationMode() { return runtime.generationMode; }, set generationMode(value) { runtime.generationMode = value; },
    get handledOocMarkers() { return runtime.handledOocMarkers; }, set handledOocMarkers(value) { runtime.handledOocMarkers = value; },
    get stateChatKey() { return stateChatKey; },
    get updateActivity() { return updateActivity; },
    get updateStatus() { return updateStatus; },
});

let {apiError, pluginError, callJev} = createJevClient({
    get noteDiagnostic() { return noteDiagnostic; },
    get localStorage() { return localStorage; },
    get settings() { return runtime.settings; },
    get JEV_API_URL() { return JEV_API_URL; },
    get StaleRunError() { return StaleRunError; },
    get fetch() { return (...args) => fetch(...args); },
    get getRequestHeaders() { return getRequestHeaders; },
    get getSavedKey() { return getSavedKey; },
    get serverKeyStatus() { return runtime.serverKeyStatus; }, set serverKeyStatus(value) { runtime.serverKeyStatus = value; },
});

let {reversibleStateSnapshot, restoreReversibleState} = createStateSnapshots({

});

let {updateStatus, updateKeyStatus, runUiTask, runEventTask, setBusy, testConnection} = createStatusUi({
    get noteDiagnostic() { return noteDiagnostic; },
    get localStorage() { return localStorage; },
    get JEV_MODEL() { return JEV_MODEL; },
    get StaleRunError() { return StaleRunError; },
    get callJev() { return callJev; },
    get document() { return document; },
    get getSavedKey() { return getSavedKey; },
    get maskKey() { return maskKey; },
    get notifySceneReaderToast() { return notifySceneReaderToast; },
    get record() { return record; },
    get serverKeyStatus() { return runtime.serverKeyStatus; }, set serverKeyStatus(value) { runtime.serverKeyStatus = value; },
    get serverStoreAvailable() { return runtime.serverStoreAvailable; }, set serverStoreAvailable(value) { runtime.serverStoreAvailable = value; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
    get window() { return window; },
});

let {optionsHtml, createDialog, createWandEntry, createExtensionSettings, openSceneReader, createQuickEntry, ensureQuickEntry} = createShell({
    get window() { return window; },
    bindHubTrace: () => { traceView.bind(); currentStatusView.bind(); },
    refreshCurrentStatus: () => currentStatusView.render(),
    get ADVANCED_ELEMENTS() { return ADVANCED_ELEMENTS; },
    get ADVANCED_STYLES() { return ADVANCED_STYLES; },
    get DEVELOPMENT_STYLES() { return DEVELOPMENT_STYLES; },
    get JUDGMENT_STYLES() { return JUDGMENT_STYLES; },
    get MASCOT_ICON_URL() { return MASCOT_ICON_URL; },
    get PACE_OPTIONS() { return PACE_OPTIONS; },
    get PHYSICAL_PACES() { return PHYSICAL_PACES; },
    get PROGRESSION_MODES() { return PROGRESSION_MODES; },
    get RELATIONSHIP_DIRECTIONS() { return RELATIONSHIP_DIRECTIONS; },
    get WORLD_DIRECTIONS() { return WORLD_DIRECTIONS; },
    get bindForm() { return bindForm; },
    get dialog() { return runtime.dialog; }, set dialog(value) { runtime.dialog = value; },
    get dialogTemplate() { return dialogTemplate; },
    get document() { return document; },
    get escapeHtml() { return escapeHtml; },
    get loadReasonerProfiles() { return loadReasonerProfiles; },
    get renderAll() { return renderAll; },
    get setFormValues() { return setFormValues; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
});

let {cachedJudgmentMatches, onLorebookUpdated, onBeforeGeneration, onChatChanged,prepareFallback} = createGenerationLifecycle({
    isEmbeddingBusy:()=>embeddingMaintenance.isBusy(),
    get judgmentFailureState() { return judgmentFailureState; },
    get hub() { return hub; },
    get MAX_TRANSCRIPT_CHARS() { return MAX_TRANSCRIPT_CHARS; },
    get MEMORY_REFERENCE_ENABLED() { return MEMORY_REFERENCE_ENABLED; },
    get StaleRunError() { return StaleRunError; },
    get activeGenerationCycle() { return runtime.activeGenerationCycle; }, set activeGenerationCycle(value) { runtime.activeGenerationCycle = value; },
    get applyStoredInjection() { return applyStoredInjection; },
    get buildRecentContext() { return buildRecentContext; },
    get characterStore() { return runtime.characterStore; }, set characterStore(value) { runtime.characterStore = value; },
    get chatReadyKey() { return runtime.chatReadyKey; }, set chatReadyKey(value) { runtime.chatReadyKey = value; },
    get clearInjection() { return clearInjection; },
    get currentInputKey() { return currentInputKey; },
    get debugInjectionArmed() { return runtime.debugInjectionArmed; }, set debugInjectionArmed(value) { runtime.debugInjectionArmed = value; },
    get document() { return document; },
    get filterNonRpHistory() { return filterNonRpHistory; },
    get generationCycleSalt() { return generationCycleSalt; },
    get generationMode() { return runtime.generationMode; }, set generationMode(value) { runtime.generationMode = value; },
    get getContext() { return getContext; },
    get handleOocOnlySkip() { return handleOocOnlySkip; },
    get handledOocMarkers() { return runtime.handledOocMarkers; }, set handledOocMarkers(value) { runtime.handledOocMarkers = value; },
    get hydrateServerState() { return hydrateServerState; },
    get invalidateReasonerJobs() { return invalidateReasonerJobs; },
    get jobs() { return runtime.jobs; }, set jobs(value) { runtime.jobs = value; },
    get linkedCharacterBooks() { return linkedCharacterBooks; },
    get loadStateHistory() { return loadStateHistory; },
    get lorebookRevisions() { return runtime.lorebookRevisions; }, set lorebookRevisions(value) { runtime.lorebookRevisions = value; },
    get normalizeCharacterStore() { return normalizeCharacterStore; },
    get noteDiagnostic() { return noteDiagnostic; },
    get notifySceneReaderToast() { return notifySceneReaderToast; },
    get pendingComposerText() { return pendingComposerText; },
    get pendingGenerationType() { return runtime.pendingGenerationType; }, set pendingGenerationType(value) { runtime.pendingGenerationType = value; },
    get persistChat() { return persistChat; },
    get preferences() { return preferences; },
    get recentContext() { return recentContext; },
    get reconcileInjection() { return reconcileInjection; },
    get record() { return record; },
    get renderAll() { return renderAll; },
    get runJudge() { return options => hub.commands.dispatch('judge',options); },
    get selectedWorld() { return selectedWorld; },
    get setFormValues() { return setFormValues; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
    get sourceRevisionKey() { return sourceRevisionKey; },
    get stableFingerprint() { return stableFingerprint; },
    get stateChatKey() { return stateChatKey; },
    get updateActivity() { return updateActivity; },
    get updateStatus() { return updateStatus; },
    get waitForOutputChanges() { return waitForOutputChanges; },
    get waitForProfileState() { return waitForProfileState; },
    get window() { return window; },
    get worldInfoModule() { return runtime.worldInfoModule; }, set worldInfoModule(value) { runtime.worldInfoModule = value; },
});

const promptObserver=createPromptObserver({
    getExpected:()=>runtime.activeGenerationCycle?.injection,
    getRecord:()=>record(),
    getNames:()=>({userName:getContext().name1,characterName:getContext().name2}),
    getCycleId:()=>hub.snapshot().state.cycleId,
    report:(...args)=>hub.report(...args),
    updateActivity:(...args)=>updateActivity(...args),updateStatus:(...args)=>updateStatus(...args),
});
const presetRequest=createPresetRequest({
    window,getContext,getCycle:()=>runtime.activeGenerationCycle,getChatKey:()=>stateChatKey(),isEnabled:()=>runtime.settings?.enabled,
    report:(...args)=>hub.report(...args),verifyRequest:promptObserver.verifyRequest,
});
let {init} = createStartup({
    get hub() { return hub; },
    initPresetRequest:presetRequest.init,
    resetPresetRequest:presetRequest.reset,
    observeGenerationStart:(...args)=>{presetRequest.start(...args);promptObserver.start(...args);},
    observeFinalPrompt:(...args)=>{presetRequest.observeAssembly(...args);return promptObserver.observe(...args);},
    observeBackendRequest:data=>presetRequest.observeRequest(data)?promptObserver.inspectPrepared(data):promptObserver.observeRequest(data),
    get DEFAULTS() { return DEFAULTS; },
    get MODULE() { return MODULE; },
    get PROMPT_MACRO() { return PROMPT_MACRO; },
    get WORLD_PROMPT_MACRO() { return WORLD_PROMPT_MACRO; },
    get activeGenerationCycle() { return runtime.activeGenerationCycle; }, set activeGenerationCycle(value) { runtime.activeGenerationCycle = value; },
    get activeMacroPayload() { return runtime.activeMacroPayload; }, set activeMacroPayload(value) { runtime.activeMacroPayload = value; },
    get activeWorldMacroPayload() { return runtime.activeWorldMacroPayload; }, set activeWorldMacroPayload(value) { runtime.activeWorldMacroPayload = value; },
    get chatReadyKey() { return runtime.chatReadyKey; }, set chatReadyKey(value) { runtime.chatReadyKey = value; },
    get clearInjection() { return clearInjection; },
    get createDialog() { return createDialog; },
    get createExtensionSettings() { return createExtensionSettings; },
    get createWandEntry() { return createWandEntry; },
    get debugInjectionArmed() { return runtime.debugInjectionArmed; }, set debugInjectionArmed(value) { runtime.debugInjectionArmed = value; },
    get ensureQuickEntry() { return ensureQuickEntry; },
    get eventSource() { return eventSource; },
    get event_types() { return event_types; },
    get extension_settings() { return extension_settings; },
    get generationMode() { return runtime.generationMode; }, set generationMode(value) { runtime.generationMode = value; },
    get getContext() { return getContext; },
    get hydrateServerState() { return hydrateServerState; },
    get invalidateReasonerJobs() { return invalidateReasonerJobs; },
    get jobs() { return runtime.jobs; }, set jobs(value) { runtime.jobs = value; },
    get loadReasonerProfiles() { return loadReasonerProfiles; },
    get loadStateHistory() { return loadStateHistory; },
    get macroAvailable() { return runtime.macroAvailable; }, set macroAvailable(value) { runtime.macroAvailable = value; },
    get noteDiagnostic() { return noteDiagnostic; },
    get onAssistantOutputChanged() { return onAssistantOutputChanged; },
    get onBeforeGeneration() { return onBeforeGeneration; },
    get onCharacterMessageReceived() { return onCharacterMessageReceived; },
    get onChatChanged() { return onChatChanged; },
    get onLorebookUpdated() { return onLorebookUpdated; },
    get onUserMessageSent() { return onUserMessageSent; },
    get pendingGenerationType() { return runtime.pendingGenerationType; }, set pendingGenerationType(value) { runtime.pendingGenerationType = value; },
    get persistChat() { return persistChat; },
    get record() { return record; },
    get renderAll() { return renderAll; },
    get runEventTask() { return runEventTask; },
    get saveSettingsDebounced() { return saveSettingsDebounced; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
    get stateChatKey() { return stateChatKey; },
    get updateActivity() { return updateActivity; },
    get worldInfoModule() { return runtime.worldInfoModule; }, set worldInfoModule(value) { runtime.worldInfoModule = value; },
});

let {reconcileInjection} = createInjectionReconcile({
    get activeInjectionPayload() { return runtime.activeInjectionPayload; }, set activeInjectionPayload(value) { runtime.activeInjectionPayload = value; },
    get clearInjection() { return clearInjection; },
    get noteDiagnostic() { return noteDiagnostic; },
    get record() { return record; },
    get stateChatKey() { return stateChatKey; },
    get updateActivity() { return updateActivity; },
});



































const vectorRetrieval = createVectorRetrieval({ fetch: (...args) => fetch(...args), getRequestHeaders, getSettings: () => runtime.settings || DEFAULTS,
    onDiagnostic: detail => noteDiagnostic('retrieval_request',detail),
    onProgress: progress => renderRetrievalProgress({document,updateActivity},progress),
});
const embeddingMaintenance = createEmbeddingMaintenance({
    get characterStore() { return runtime.characterStore; },
    get chatReadyKey() { return runtime.chatReadyKey; },
    get jobs() { return runtime.jobs; },
    stateChatKey, selectedWorld, vectorRetrieval, invalidateReasonerJobs, noteDiagnostic,
    get clearInjection() { return clearInjection; },
});











































const {prepareProfiles, prepareStandardProfiles, prepareConflictProfiles} = createDraws(selectedWorld);
let {decisionTitle, resultLabel, characterTurnLabel, renderCharacterTurnResults, renderJudgment, renderProfiles, renderStoredState, renderCharacterStore, renderCharacterAnalysisBrowser, renderBackups, renderReasonerProfiles, renderContinuity, renderAll} = createResults({document, getContext, record, ownerPrompt, escapeHtml,
    onBeforeRender: () => { if (!record()?.lastJudgment && runtime.activeInjectionPayload) runEventTask(reconcileInjection,'남은 주입문을 정리하지 못했습니다.'); },
    stableFingerprint,
    isStateCapturePending: requestId => runtime.pendingProfileStateRequests.has(requestId),
    readState: () => ({settings: runtime.settings, characterStore: runtime.characterStore, backupList: runtime.backupList, reasonerProfiles: runtime.reasonerProfiles, reasonerProfileError: runtime.reasonerProfileError, characterAnalysisSelection: runtime.characterAnalysisSelection, activeInjectionPayload: runtime.activeInjectionPayload}),
    selectCharacter: value => {runtime.characterAnalysisSelection = value;},
});














let {storagePost, loadReasonerProfiles, settingsSnapshot, saveServerSettings, saveServerChat, saveSession, saveCharacterStore, hydrateServerState, openStateDb, loadStateHistory, saveStateHistory, clearStateHistory} = createRepository({
    get chatReadyKey() { return runtime.chatReadyKey; },
    get noteDiagnostic() { return noteDiagnostic; },
    get legacyStateChatKey() { return legacyStateChatKey; },
    get DEFAULTS() { return DEFAULTS; },
    get JEV_KEY_STORAGE() { return JEV_KEY_STORAGE; },
    get MODULE() { return MODULE; },
    get OWNER_PROMPT_STORAGE() { return OWNER_PROMPT_STORAGE; },
    get OWNER_UNLOCK_STORAGE() { return OWNER_UNLOCK_STORAGE; },
    get STATE_DB_NAME() { return STATE_DB_NAME; },
    get STATE_DB_STORE() { return STATE_DB_STORE; },
    get STATE_HISTORY_LIMIT() { return STATE_HISTORY_LIMIT; },
    get STORAGE_API_URL() { return STORAGE_API_URL; },
    get backupList() { return runtime.backupList; }, set backupList(value) { runtime.backupList = value; },
    get characterStore() { return runtime.characterStore; }, set characterStore(value) { runtime.characterStore = value; },
    get chatRecords() { return runtime.chatRecords; },
    get chat_metadata() { return chat_metadata; },
    get clearInjection() { return clearInjection; },
    get connectionRequestService() { return runtime.connectionRequestService; }, set connectionRequestService(value) { runtime.connectionRequestService = value; },
    get extension_settings() { return extension_settings; },
    get fetch() { return (...args) => fetch(...args); },
    get getContext() { return getContext; },
    get getRequestHeaders() { return getRequestHeaders; },
    get getSavedKey() { return getSavedKey; },
    get hydrateSequence() { return runtime.hydrateSequence; }, set hydrateSequence(value) { runtime.hydrateSequence = value; },
    get jobs() { return runtime.jobs; },
    get listConnectionProfiles() { return listConnectionProfiles; },
    get loadCustomWorlds() { return loadCustomWorlds; },
    get localStorage() { return localStorage; },
    get messageSnapshot() { return messageSnapshot; },
    get messageSnapshots() { return runtime.messageSnapshots; },
    get normalizeCharacterStore() { return normalizeCharacterStore; },
    get ownerPrompt() { return ownerPrompt; },
    get ownerUnlocked() { return ownerUnlocked; },
    get pluginError() { return pluginError; },
    get privateOwnerPrompt() { return runtime.privateOwnerPrompt; }, set privateOwnerPrompt(value) { runtime.privateOwnerPrompt = value; },
    get queueWrite() { return runtime.queueWrite; },
    get reasonerProfileError() { return runtime.reasonerProfileError; }, set reasonerProfileError(value) { runtime.reasonerProfileError = value; },
    get reasonerProfiles() { return runtime.reasonerProfiles; }, set reasonerProfiles(value) { runtime.reasonerProfiles = value; },
    get record() { return record; },
    get renderReasonerProfiles() { return renderReasonerProfiles; },
    get saveCustomWorlds() { return saveCustomWorlds; },
    get serverKeyStatus() { return runtime.serverKeyStatus; }, set serverKeyStatus(value) { runtime.serverKeyStatus = value; },
    get serverStoreAvailable() { return runtime.serverStoreAvailable; }, set serverStoreAvailable(value) { runtime.serverStoreAvailable = value; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
    get stateChatKey() { return stateChatKey; },
    get stateDbPromise() { return runtime.stateDbPromise; }, set stateDbPromise(value) { runtime.stateDbPromise = value; },
    get stateHistoryCache() { return runtime.stateHistoryCache; },
    get storageVersion() { return runtime.storageVersion; }, set storageVersion(value) { runtime.storageVersion = value; },
    get window() { return window; },
});















































let {onCharacterMessageReceived, onUserMessageSent, rollbackChangedOutput, onAssistantOutputChanged, applyStoredInjection, clearInjection, waitForOutputChanges} = createOutputLifecycle({
    hub,
    get STATE_CAPTURE_KEY() { return STATE_CAPTURE_KEY; },
    get STATE_COLLECTOR_MODE() { return stateCollectorMode(record()?.preferences); },
    get stateRoster() { return stateRoster; },
    get mainOutputStatePrompt() { return mainOutputStatePrompt; },
    get collectMainOutputState() { return collectMainOutputState; },
    get latestStateForChat() { return latestStateForChat; },
    get storeStateEvent() { return storeStateEvent; },
    get dropStateEventsFrom() { return dropStateEventsFrom; },
    get scheduleProfileStateCollection() { return scheduleProfileStateCollection; },
    get isStreamingEnabled() { return isStreamingEnabled; },
    get characterStore() { return runtime.characterStore; },
    get preferences() { return preferences; },
    get saveSession() { return saveSession; },
    get reversibleStateSnapshot() { return reversibleStateSnapshot; },
    get INJECT_KEY() { return INJECT_KEY; },
    get IN_CHAT() { return IN_CHAT; },
    get SYSTEM_ROLE() { return SYSTEM_ROLE; },
    get WORLD_INJECT_KEY() { return WORLD_INJECT_KEY; },
    get activeGenerationCycle() { return runtime.activeGenerationCycle; }, set activeGenerationCycle(value) { runtime.activeGenerationCycle = value; },
    get activeInjectionPayload() { return runtime.activeInjectionPayload; }, set activeInjectionPayload(value) { runtime.activeInjectionPayload = value; },
    get activeMacroPayload() { return runtime.activeMacroPayload; }, set activeMacroPayload(value) { runtime.activeMacroPayload = value; },
    get activeWorldMacroPayload() { return runtime.activeWorldMacroPayload; }, set activeWorldMacroPayload(value) { runtime.activeWorldMacroPayload = value; },
    get attachSelectedOutput() { return attachSelectedOutput; },
    get currentInputKey() { return currentInputKey; },
    get debugInjectionArmed() { return runtime.debugInjectionArmed; }, set debugInjectionArmed(value) { runtime.debugInjectionArmed = value; },
    get document() { return document; },
    get firstChangedMessage() { return firstChangedMessage; },
    get generationMode() { return runtime.generationMode; }, set generationMode(value) { runtime.generationMode = value; },
    get getContext() { return getContext; },
    get handleOocOnlySkip() { return handleOocOnlySkip; },
    get invalidateReasonerJobs() { return invalidateReasonerJobs; },
    get loadStateHistory() { return loadStateHistory; },
    get macroAvailable() { return runtime.macroAvailable; }, set macroAvailable(value) { runtime.macroAvailable = value; },
    get messageSnapshot() { return messageSnapshot; },
    get messageSnapshots() { return runtime.messageSnapshots; },
    get pendingGenerationType() { return runtime.pendingGenerationType; }, set pendingGenerationType(value) { runtime.pendingGenerationType = value; },
    get persistChat() { return persistChat; },
    get record() { return record; },
    get renderAll() { return renderAll; },
    get restoreReversibleState() { return restoreReversibleState; },
    get saveStateHistory() { return saveStateHistory; },
    get selectedWorld() { return selectedWorld; },
    get sourceRevisionKey() { return sourceRevisionKey; },
    get setExtensionPrompt() { return setExtensionPrompt; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
    get stableFingerprint() { return stableFingerprint; },
    get stateChatKey() { return stateChatKey; },
    get updateActivity() { return updateActivity; },
    get updateStatus() { return updateStatus; },
    get window() { return window; },
});

let {judgmentFailureState, sourceRevisionKey, stagedRecord, sourceIdentityForPending, pendingExternalCandidates, sourceUserRpForOutput, postVerifiedCharacterOutput, registerSceneOpportunity, commitPriorVerification, commitContinuityCandidates, runJudge, executeJudge} = createSceneExecution({
    isEmbeddingBusy:()=>embeddingMaintenance.isBusy(),
    get pendingGenerationType() { return runtime.pendingGenerationType; },
    hub,
    waitForProfileState,
    waitForOutputChanges,
    noteDiagnostic,
    get latestStateForChat() { return latestStateForChat; },
    get vectorRetrieval() { return vectorRetrieval; },
    get addCharacterNeedsQuestions() { return addCharacterNeedsQuestions; },
    get characterCategoryHints() { return characterCategoryHints; },
    get applyRecordRelevance() { return applyRecordRelevance; },
    get CHARACTER_LIVE_SYSTEM() { return CHARACTER_LIVE_SYSTEM; },
    get FALLBACKS() { return FALLBACKS; },
    get JEV_MODEL() { return JEV_MODEL; },
    get REASONER_SYSTEM() { return REASONER_SYSTEM; },
    get STATE_HISTORY_LIMIT() { return STATE_HISTORY_LIMIT; },
    get StaleRunError() { return StaleRunError; },
    get actionPlanSummary() { return actionPlanSummary; },
    get activePendingCandidates() { return activePendingCandidates; },
    get applyCharacterPolicy() { return applyCharacterPolicy; },
    get applyContinuityVerdicts() { return applyContinuityVerdicts; },
    get applyPolicy() { return applyPolicy; },
    get applyStoredInjection() { return applyStoredInjection; },
    get activeInjectionPayload() { return runtime.activeInjectionPayload; },
    get assignContinuity() { return assignContinuity; },
    get buildCharacterInjection() { return buildCharacterInjection; },
    get buildLiveCharacterPlan() { return buildLiveCharacterPlan; },
    get buildCharacterTurnQuestions() { return buildCharacterTurnQuestions; },
    get resolveLiveCharacterPlan() { return resolveLiveCharacterPlan; },
    get buildContinuityInjection() { return buildContinuityInjection; },
    get buildInjection() { return buildInjection; },
    get buildPausedInjection() { return buildPausedInjection; },
    get buildPendingCandidateQuestions() { return buildPendingCandidateQuestions; },
    get buildQuestions() { return buildQuestions; },
    get buildVerificationQuestions() { return buildVerificationQuestions; },
    get callJev() { return callJev; },
    get characterStore() { return runtime.characterStore; }, set characterStore(value) { runtime.characterStore = value; },
    get chatRecords() { return runtime.chatRecords; },
    get clearInjection() { return clearInjection; },
    get commitObservedState() { return commitObservedState; },
    get commitVerifiedPlan() { return commitVerifiedPlan; },
    get connectionRequestService() { return runtime.connectionRequestService; }, set connectionRequestService(value) { runtime.connectionRequestService = value; },
    get continuityView() { return continuityView; },
    get coordinateActionBudget() { return coordinateActionBudget; },
    get coordinateCharacterDecisions() { return coordinateCharacterDecisions; },
    get coordinateDecisions() { return coordinateDecisions; },
    get currentInputKey() { return currentInputKey; },
    get deriveDependentDecisions() { return deriveDependentDecisions; },
    get document() { return document; },
    get effectiveMap() { return effectiveMap; },
    get fixedDecision() { return fixedDecision; },
    get getContext() { return getContext; },
    get handleOocOnlySkip() { return handleOocOnlySkip; },
    get isFranchiseWorld() { return isFranchiseWorld; },
    get isVisibleRoleplayMessage() { return isVisibleRoleplayMessage; },
    get jobs() { return runtime.jobs; },
    get judgeCompletionPromise() { return runtime.judgeCompletionPromise; }, set judgeCompletionPromise(value) { runtime.judgeCompletionPromise = value; },
    get judgeInFlight() { return runtime.judgeInFlight; }, set judgeInFlight(value) { runtime.judgeInFlight = value; },
    get loadStateHistory() { return loadStateHistory; },
    get mergeMemory() { return mergeMemory; },
    get linkedCharacterBooks() { return linkedCharacterBooks; },
    get lorebookRevisions() { return runtime.lorebookRevisions; },
    get memoryStatusText() { return memoryStatusText; },
    get normalizeContinuity() { return normalizeContinuity; },
    get overrideDecision() { return overrideDecision; },
    get ownerPrompt() { return ownerPrompt; },
    get pendingPlanEffects() { return pendingPlanEffects; },
    get persistChat() { return persistChat; },
    get preferences() { return preferences; },
    get prepareProfiles() { return prepareProfiles; },
    get queueWrite() { return runtime.queueWrite; },
    get readCharm() { return readCharm; },
    get readCharacterLorebooks() { return readCharacterLorebooks; },
    get worldInfoModule() { return runtime.worldInfoModule; },
    get reasonerGeneration() { return runtime.reasonerGeneration; }, set reasonerGeneration(value) { runtime.reasonerGeneration = value; },
    get reasonerJobs() { return runtime.reasonerJobs; },
    get recentContext() { return recentContext; },
    get record() { return record; },
    get renderAll() { return renderAll; },
    get requestWithConnectionProfile() { return requestWithConnectionProfile; },
    get resolveJudgeCompletion() { return runtime.resolveJudgeCompletion; }, set resolveJudgeCompletion(value) { runtime.resolveJudgeCompletion = value; },
    get reversibleStateSnapshot() { return reversibleStateSnapshot; },
    get saveStateHistory() { return saveStateHistory; },
    get selectActionPlan() { return selectActionPlan; },
    get nextDeferredRoutes() { return nextDeferredRoutes; },
    get selectActiveEntries() { return selectActiveEntries; },
    get selectContinuityContext() { return selectContinuityContext; },
    get selectedWorld() { return selectedWorld; },
    get setBusy() { return setBusy; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
    get showActivity() { return showActivity; },
    get splitOocText() { return splitOocText; },
    get stableFingerprint() { return stableFingerprint; },
    get stateChatKey() { return stateChatKey; },
    get stateHistoryCache() { return runtime.stateHistoryCache; },
    get storagePost() { return storagePost; },
    get storageVersion() { return runtime.storageVersion; }, set storageVersion(value) { runtime.storageVersion = value; },
    get updateActivity() { return updateActivity; },
    get updateProgressionPressure() { return updateProgressionPressure; },
    get updateStatus() { return updateStatus; },
    get validateBackstage() { return validateBackstage; },
    get validateReasonerResult() { return validateReasonerResult; },
    get verificationSummary() { return verificationSummary; },
    get verifiedSecondaryCandidates() { return verifiedSecondaryCandidates; },
    get verifyBackstageDelivery() { return verifyBackstageDelivery; },
    get window() { return window; },
});













let {setFormValues, renderWorldControls, showWorldEditor, showWorldList, characterEntries, showCharacterEditor, closeCharacterEditor, saveCharacterEntry, analyzeAndSaveCharacter, deleteCharacterEntry, downloadJson, saveGlobal, savePreference, saveInjectionMode, saveWorldInjectionMode, endActiveEvent, bindForm} = createUiController({
    noteDiagnostic,
    embeddingMaintenance,
    presetPrompts:presetRequest.prompts,
    get hub() { return hub; },
    collectCurrentEmotion,
    get vectorRetrieval() { return vectorRetrieval; },
    get RETRIEVAL_PROVIDERS() { return RETRIEVAL_PROVIDERS; },
    get getRequestHeaders() { return getRequestHeaders; },
    get fetch() { return (...args) => fetch(...args); },
    get NPC_CORE_SYSTEM() { return NPC_CORE_SYSTEM; },
    get suggestNpcAliases() { return suggestNpcAliases; },
    get parseNpcCore() { return parseNpcCore; },
    get deriveEnglishCore() { return deriveEnglishCore; },
    get splitOocText() { return splitOocText; },
    get linkedCharacterBooks() { return linkedCharacterBooks; },
    get worldInfoModule() { return runtime.worldInfoModule; },
    get saveSession() { return saveSession; },
    get ADVANCED_ELEMENTS() { return ADVANCED_ELEMENTS; },
    get JEV_KEY_STORAGE() { return JEV_KEY_STORAGE; },
    get JEV_MODEL() { return JEV_MODEL; },
    get OWNER_PASSWORD_HASH() { return OWNER_PASSWORD_HASH; },
    get OWNER_PROMPT_STORAGE() { return OWNER_PROMPT_STORAGE; },
    get OWNER_UNLOCK_STORAGE() { return OWNER_UNLOCK_STORAGE; },
    get StaleRunError() { return StaleRunError; },
    get SyntaxError() { return SyntaxError; },
    get applyStoredInjection() { return applyStoredInjection; },
    get archiveCurrentEvent() { return archiveCurrentEvent; },
    get availableWorlds() { return availableWorlds; },
    get backupList() { return runtime.backupList; }, set backupList(value) { runtime.backupList = value; },
    get profileStatus() { return profileStatus; },
    get callJev() { return callJev; },
    get characterAnalysisSelection() { return runtime.characterAnalysisSelection; }, set characterAnalysisSelection(value) { runtime.characterAnalysisSelection = value; },
    get characterEditorId() { return runtime.characterEditorId; }, set characterEditorId(value) { runtime.characterEditorId = value; },
    get characterEditorKind() { return runtime.characterEditorKind; }, set characterEditorKind(value) { runtime.characterEditorKind = value; },
    get characterStore() { return runtime.characterStore; }, set characterStore(value) { runtime.characterStore = value; },
    get clearInjection() { return clearInjection; },
    get clearStateHistory() { return clearStateHistory; },
    get chatRecords() { return runtime.chatRecords; },
    get queueWrite() { return runtime.queueWrite; },
    get connectionRequestService() { return runtime.connectionRequestService; }, set connectionRequestService(value) { runtime.connectionRequestService = value; },
    get copyText() { return copyText; },
    get debugInjectionArmed() { return runtime.debugInjectionArmed; }, set debugInjectionArmed(value) { runtime.debugInjectionArmed = value; },
    get executionDebugReport() { return () => executionReport({hub,failureStop:judgmentFailureState(),settings:runtime.settings}); },
    get reconcileInjection() { return reconcileInjection; },
    get dialog() { return runtime.dialog; }, set dialog(value) { runtime.dialog = value; },
    get document() { return document; },
    get escapeHtml() { return escapeHtml; },
    get getContext() { return getContext; },
    get hydrateServerState() { return hydrateServerState; },
    get invalidateReasonerJobs() { return invalidateReasonerJobs; },
    get jobs() { return runtime.jobs; },
    get judgeInFlight() { return runtime.judgeInFlight; }, set judgeInFlight(value) { runtime.judgeInFlight = value; },
    get loadCustomWorlds() { return loadCustomWorlds; },
    get loadReasonerProfiles() { return loadReasonerProfiles; },
    get localStorage() { return localStorage; },
    get macroAvailable() { return runtime.macroAvailable; }, set macroAvailable(value) { runtime.macroAvailable = value; },
    get normalizeCharacterStore() { return normalizeCharacterStore; },
    get normalizeContinuity() { return normalizeContinuity; },
    get ownerPrompt() { return ownerPrompt; },
    get ownerUnlocked() { return ownerUnlocked; },
    get persistChat() { return persistChat; },
    get preferences() { return preferences; },
    get privateOwnerPrompt() { return runtime.privateOwnerPrompt; }, set privateOwnerPrompt(value) { runtime.privateOwnerPrompt = value; },
    get reasonerProfileError() { return runtime.reasonerProfileError; }, set reasonerProfileError(value) { runtime.reasonerProfileError = value; },
    get reasonerProfiles() { return runtime.reasonerProfiles; }, set reasonerProfiles(value) { runtime.reasonerProfiles = value; },
    get record() { return record; },
    get renderAll() { return renderAll; },
    get renderBackups() { return renderBackups; },
    get renderCharacterAnalysisBrowser() { return renderCharacterAnalysisBrowser; },
    get renderCharacterStore() { return renderCharacterStore; },
    get renderJudgment() { return renderJudgment; },
    get renderOwnerMode() { return renderOwnerMode; },
    get renderProfiles() { return renderProfiles; },
    get renderReasonerProfiles() { return renderReasonerProfiles; },
    get requestWithConnectionProfile() { return requestWithConnectionProfile; },
    get runJudge() { return options => hub.commands.dispatch('judge',options); },
    get runUiTask() { return runUiTask; },
    get saveCharacterStore() { return saveCharacterStore; },
    get saveCustomWorlds() { return saveCustomWorlds; },
    get saveServerChat() { return saveServerChat; },
    get saveServerSettings() { return saveServerSettings; },
    get saveSettingsDebounced() { return saveSettingsDebounced; },
    get serverKeyStatus() { return runtime.serverKeyStatus; }, set serverKeyStatus(value) { runtime.serverKeyStatus = value; },
    get settings() { return runtime.settings; }, set settings(value) { runtime.settings = value; },
    get settingsSnapshot() { return settingsSnapshot; },
    get sha256Hex() { return sha256Hex; },
    get stableFingerprint() { return stableFingerprint; },
    get stateChatKey() { return stateChatKey; },
    get storagePost() { return storagePost; },
    get testConnection() { return testConnection; },
    get updateActivity() { return updateActivity; },
    get updateKeyStatus() { return updateKeyStatus; },
    get updateStatus() { return updateStatus; },
    get window() { return window; },
});

























hub.commands.register('judge',options=>runJudge(options));
const traceView=createTraceView({hub,document,judgmentFailureState,getSettings:()=>runtime.settings,isDeveloperMode:()=>ownerUnlocked(),version:'0.1.16',copyText:value=>copyText(value)});
const currentStatusView=createCurrentStatusView({hub,document,getScope:()=>JSON.stringify([stateChatKey(),runtime.settings?.retrievalProvider,runtime.settings?.jevProvider])});
let startupPromise;
installGenerationInterceptor({window,prepareFallback,ready:()=>startupPromise||Promise.resolve()});
window.SceneReaderHub=Object.freeze({diagnostics:()=>hub.snapshot()});
jQuery(() => void (startupPromise=init().then(()=>{
    registerSlashCommands({getContext,hub,document,openSceneReader,saveGlobal,setFormValues,invalidateReasonerJobs,clearInjection,updateStatus,diagnosticSnapshot,noteDiagnostic,get settings(){return runtime.settings;}});
})).catch((error) => {
    console.error('[씬판독기] 초기화 실패', error);
    notifySceneReaderToast(window, 'error', '씬판독기를 불러오지 못했습니다.', '씬판독기');
}));
