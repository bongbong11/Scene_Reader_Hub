import {registerEmptyLegacyMacros} from '../injection/legacy-cleanup.js';
import {recentTurnCount} from '../context/turn-settings.js';
// Lifecycle coordination only; feature implementation lives in its module.
export function createStartup(deps) {
async function init() {
    deps.settings = { ...deps.DEFAULTS, ...(deps.extension_settings[deps.MODULE] || {}) };
    delete deps.settings.continuityInterval;delete deps.settings.collectPersonaChanges;
    delete deps.settings.pauseOnOoc;
    for (const key of ['enabled', 'showChatIcon', 'autoJudge', 'showConfidence', 'ownerUnlocked', 'continuityEnabled']) if (typeof deps.settings[key] !== 'boolean') deps.settings[key] = deps.DEFAULTS[key];
    deps.settings.recentTurns = recentTurnCount(deps.settings);
    deps.extension_settings[deps.MODULE] = deps.settings;
    deps.saveSettingsDebounced();
    deps.chatReadyKey = '';
    if (await deps.hydrateServerState()) deps.chatReadyKey = deps.stateChatKey();
    else deps.noteDiagnostic('startup_hydration_failed');
    try { registerEmptyLegacyMacros(deps.getContext().macros); }
    catch(error) { deps.noteDiagnostic('legacy_macro_compatibility_failed',{error:error.message}); }
    await deps.initPresetRequest?.();
    try { deps.worldInfoModule = await import('/scripts/world-info.js'); } catch { deps.worldInfoModule = null; }
    if (deps.event_types.WORLDINFO_UPDATED) deps.eventSource.on(deps.event_types.WORLDINFO_UPDATED, (...args) => deps.runEventTask(() => deps.onLorebookUpdated(...args), '수정된 로어북의 판정 대기를 갱신하지 못했습니다.'));
    deps.createExtensionSettings();
    deps.createDialog();
    deps.createWandEntry();
    deps.ensureQuickEntry();
    await deps.loadStateHistory();
    deps.eventSource.on(deps.event_types.GENERATION_AFTER_COMMANDS, deps.onBeforeGeneration);
    if(deps.event_types.GENERATION_STARTED)deps.eventSource.on(deps.event_types.GENERATION_STARTED,(...args)=>deps.observeGenerationStart?.(...args));
    if(deps.event_types.GENERATE_AFTER_DATA)deps.eventSource.on(deps.event_types.GENERATE_AFTER_DATA,(data,dryRun)=>deps.observeFinalPrompt?.(data,dryRun));
    if(deps.event_types.CHAT_COMPLETION_SETTINGS_READY)deps.eventSource.on(deps.event_types.CHAT_COMPLETION_SETTINGS_READY,data=>deps.observeBackendRequest?.(data));
    deps.eventSource.on(deps.event_types.CHAT_CHANGED, () => {deps.resetPresetRequest?.();return deps.runEventTask(deps.onChatChanged, '채팅 상태를 불러오지 못했습니다.');});
    if (deps.event_types.MESSAGE_SENT) deps.eventSource.on(deps.event_types.MESSAGE_SENT, (messageId) => deps.runEventTask(() => deps.onUserMessageSent(messageId), 'OOC 입력 상태를 처리하지 못했습니다.'));
    if (deps.event_types.MESSAGE_RECEIVED) deps.eventSource.on(deps.event_types.MESSAGE_RECEIVED, (messageId) => deps.runEventTask(() => deps.onCharacterMessageReceived(messageId), '생성 결과의 이행 검증 대기를 저장하지 못했습니다.'));
    if (deps.event_types.MESSAGE_SWIPED) deps.eventSource.on(deps.event_types.MESSAGE_SWIPED, (messageId) => deps.runEventTask(() => deps.onAssistantOutputChanged(messageId, 'swiped'), '리롤 상태를 복원하지 못했습니다.'));
    if (deps.event_types.MESSAGE_EDITED) deps.eventSource.on(deps.event_types.MESSAGE_EDITED, (messageId) => deps.runEventTask(() => deps.onAssistantOutputChanged(messageId, 'edited'), '수정된 출력 상태를 반영하지 못했습니다.'));
    if (deps.event_types.MESSAGE_DELETED) deps.eventSource.on(deps.event_types.MESSAGE_DELETED, (messageId) => deps.runEventTask(() => deps.onAssistantOutputChanged(messageId, deps.pendingGenerationType === 'regenerate' ? 'regenerated' : 'deleted'), '삭제된 출력 상태를 복원하지 못했습니다.'));
    if (deps.event_types.CONNECTION_PROFILE_CREATED) deps.eventSource.on(deps.event_types.CONNECTION_PROFILE_CREATED, () => { void deps.loadReasonerProfiles(); });
    for (const type of [deps.event_types.CONNECTION_PROFILE_UPDATED, deps.event_types.CONNECTION_PROFILE_DELETED].filter(Boolean)) {
        deps.eventSource.on(type, (...profiles) => deps.runEventTask(async () => {
            deps.invalidateReasonerJobs();
            await deps.loadReasonerProfiles();
            if (!profiles.some((profile) => profile?.id === deps.settings.reasonerProfileId)) return;
            const rec = deps.record(true);
            rec.pendingContinuityCandidates = [];
            rec.lastReasonerSource = null;
            rec.lastJudgment = null;
            await deps.persistChat();
            await deps.clearInjection();
            deps.renderAll();
        }, '연결 프로필 변경을 반영하지 못했습니다.'));
    }
    if (deps.event_types.GENERATION_STOPPED) deps.eventSource.on(deps.event_types.GENERATION_STOPPED, () => {
        deps.resetPresetRequest?.();
        deps.invalidateReasonerJobs({reason:'generation_stopped'});
        deps.updateActivity('생성이 중단되어 판독을 정리했습니다.', {done:true});
        const wasDebug = deps.activeGenerationCycle?.mode === 'ooc_debug';
        deps.pendingGenerationType = '';
        deps.generationMode = 'rp';
        deps.activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
        if (deps.debugInjectionArmed) deps.debugInjectionArmed = false;
        deps.runEventTask(deps.clearInjection, wasDebug ? '중단된 검사용 주입을 비우지 못했습니다.' : '중단된 생성의 주입을 비우지 못했습니다.');
    });
    if (deps.event_types.GENERATION_ENDED) deps.eventSource.on(deps.event_types.GENERATION_ENDED, () => { deps.resetPresetRequest?.();deps.pendingGenerationType = '';deps.hub?.endCycle(); });
    await deps.clearInjection();
    deps.initVisibility?.();
    console.info('[씬판독기] loaded');
}
return {init};
}
