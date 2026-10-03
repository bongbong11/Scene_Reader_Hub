import { notifySceneReaderToast } from "../toasts.js";
import { MEMORY_REFERENCE_ENABLED } from "../../context/memory.js";
import { SEASONAL_OPTIONS } from "../../world/seasonal.js";

export function createSettingsForm(deps) {
function setFormValues() {
    const prefs = deps.preferences();
    const setValue = (id, value) => { const element = deps.document.getElementById(id); if (element) element.value = value; };
    const setChecked = (id, value) => { const element = deps.document.getElementById(id); if (element) element.checked = Boolean(value); };
    setValue('sr-jev-provider', deps.settings.jevProviderSelection || 'auto');
    const provider = deps.RETRIEVAL_PROVIDERS[deps.settings.retrievalProvider] ? deps.settings.retrievalProvider : 'transformers';
    setValue('sr-retrieval-provider', provider);
    setValue('sr-retrieval-model', deps.settings.retrievalModel || deps.RETRIEVAL_PROVIDERS[provider].model);
    setValue('sr-retrieval-vertex-auth', deps.settings.retrievalVertexAuth || 'express');
    setValue('sr-retrieval-vertex-region', deps.settings.retrievalVertexRegion || 'global');
    setValue('sr-retrieval-vertex-project', deps.settings.retrievalVertexProject || '');
    const modelRow=deps.document.getElementById('sr-retrieval-model-row');
    const vertexRow=deps.document.getElementById('sr-retrieval-vertex-row');
    const keyRow=deps.document.getElementById('sr-retrieval-key-row');
    if(modelRow)modelRow.hidden=provider==='transformers';
    if(vertexRow)vertexRow.hidden=provider!=='vertexai';
    if(keyRow)keyRow.hidden=provider==='transformers'||(provider==='vertexai'&&deps.settings.retrievalVertexAuth==='full');
    setValue('sr-world-direction', prefs.worldDirection);
    setValue('sr-relationship-direction', prefs.relationshipDirection);
    setChecked('sr-negative-priority', prefs.negativePriority);
    setValue('sr-development-style', prefs.developmentStyle);
    setValue('sr-progress-intensity', Number(prefs.progressIntensity ?? 1).toFixed(1));
    setValue('sr-character-volume', prefs.characterVolume || 'generous');
    setValue('sr-npc-record-limit', prefs.npcRecordLimit || 3);
    const intensityValue=deps.document.getElementById('sr-progress-intensity-value');
    if(intensityValue)intensityValue.textContent=Number(prefs.progressIntensity ?? 1).toFixed(1);
    setValue('sr-world-profile', prefs.selectedWorldId);
    for (const key of Object.keys(SEASONAL_OPTIONS)) setChecked(`sr-season-${key}`, prefs.seasonalReferences?.includes(key));
    setChecked('sr-advanced-enabled', prefs.advancedEnabled);
    setValue('sr-advanced-style', prefs.advancedStyle);
    for (const key of Object.keys(deps.ADVANCED_ELEMENTS)) setChecked(`sr-advanced-${key}`, prefs.advancedElements.includes(key));
    setValue('sr-injection-mode', deps.macroAvailable ? prefs.injectionMode : 'depth');
    setValue('sr-world-injection-mode', deps.macroAvailable ? prefs.worldInjectionMode : 'depth');
    setValue('sr-relationship-pace', prefs.relationshipPace);
    setValue('sr-resolution-pace', prefs.resolutionPace);
    setValue('sr-physical-intimacy-pace', prefs.physicalIntimacyPace || 'medium');
    setChecked('sr-fight-sustain', prefs.fightSustain);
    setChecked('sr-villain-enabled', prefs.villainEnabled);
    setValue('sr-appearance-chance', prefs.appearanceChance);
    setChecked('sr-social-enabled', prefs.socialEnabled);
    setChecked('sr-world-hostility', prefs.worldHostility);
    setChecked('sr-private-prompt-enabled', prefs.privatePromptEnabled && deps.ownerUnlocked());
    setChecked('sr-npc-user', prefs.npcToUser);
    setChecked('sr-user-misfortune', prefs.userMisfortune);
    setChecked('sr-enabled', deps.settings.enabled);
    setChecked('sr-extension-enabled', deps.settings.enabled);
    setChecked('sr-extension-icon', deps.settings.showChatIcon);
    const chatIcon = deps.document.getElementById('scene-reader-quick-button');
    if (chatIcon) chatIcon.hidden = !deps.settings.showChatIcon;
    setChecked('sr-auto', deps.settings.autoJudge);
    setChecked('sr-user-impersonation', prefs.allowUserImpersonation);
    setChecked('sr-profile-emotion', prefs.profileEmotionJudgment);
    const emotionNow=deps.document.getElementById('sr-emotion-now');
    if(emotionNow) emotionNow.hidden=!prefs.profileEmotionJudgment;
    for (const [id,key] of [['sr-memory-charm','charmMemory'],['sr-memory-lorebook','lorebookMemory']]) { setChecked(id, MEMORY_REFERENCE_ENABLED && prefs[key]); const input = deps.document.getElementById(id); if (input) input.disabled = !MEMORY_REFERENCE_ENABLED; }
    setChecked('sr-continuity-enabled', deps.settings.continuityEnabled);
    deps.renderReasonerProfiles();
    setValue('sr-recent-turns', deps.settings.recentTurns);
    setChecked('sr-confidence', deps.settings.showConfidence);
    const debugStatus = deps.document.getElementById('sr-ooc-debug-status');
    if (debugStatus) debugStatus.textContent = deps.debugInjectionArmed
        ? '대기 중 · 다음 OOC-only 응답에 직전 주입문을 한 번 유지합니다.'
        : '문제 확인용 1회 기능입니다. 다음 입력이 OOC-only일 때만 직전 주입문을 그대로 유지하며, 그 응답은 상태나 이행 검증에 반영하지 않습니다.';
    const runButton = deps.document.getElementById('sr-run');
    if (runButton && !deps.judgeInFlight) runButton.disabled = !deps.settings.enabled;
    deps.updateKeyStatus();
    deps.updateStatus();
    const macroStatus = deps.document.getElementById('sr-macro-status');
    if (macroStatus) macroStatus.textContent = deps.macroAvailable ? '필요한 위치에 각 매크로를 한 번씩 넣으세요.' : '이 SillyTavern 버전에서는 사용자 매크로를 등록할 수 없습니다.';
    const advancedNote = deps.document.getElementById('sr-basic-progression-note');
    if (advancedNote) advancedNote.textContent = prefs.advancedEnabled
        ? '고급 이벤트와 기본 전개 성향이 함께 작동합니다. 서술의 속도와 호흡은 메인 프롬프트에 명시된 지침을 따릅니다.'
        : '새 이벤트는 고급 전개에서 설정합니다. 글의 속도·호흡은 프리셋을 따릅니다.';
    const advancedResults = deps.document.getElementById('sr-advanced-results');
    if (advancedResults) advancedResults.hidden = !prefs.advancedEnabled;
    deps.renderWorldControls();
    deps.renderOwnerMode();
}

async function saveGlobal(key, value) {
    const target=deps.settings;
    const current=deps.nextMutation(target,key);
    const previous = target[key];
    target[key] = value;
    try { await deps.saveServerSettings(); deps.saveSettingsDebounced(); }
    catch (error) { if (current() && deps.settings===target) target[key] = previous; setFormValues(); throw error; }
}

async function saveRetrievalSettings(patch) {
    const chatKey=deps.stateChatKey();
    deps.invalidateReasonerJobs();
    const target=deps.settings;
    const current=Object.fromEntries(Object.keys(patch).map(key=>[key,deps.nextMutation(target,key)]));
    const previous=Object.fromEntries(Object.keys(patch).map(key=>[key,target[key]]));
    Object.assign(target,patch);
    try { await deps.saveServerSettings(); deps.saveSettingsDebounced(); }
    catch(error) {
        for(const key of Object.keys(patch))if(current[key]() && deps.settings===target)target[key]=previous[key];
        setFormValues();
        throw error;
    }
    if(chatKey!==deps.stateChatKey() || deps.settings!==target || Object.keys(patch).some(key=>!current[key]()))return;
    deps.vectorRetrieval.clear();
    const rec=deps.record(true);
    rec.lastJudgment=null;
    if(!rec.pendingPlan?.outputText)rec.pendingPlan=null;
    await deps.persistChat(chatKey,rec);
    await deps.clearInjection({chatKey});
    if(chatKey!==deps.stateChatKey())return;
    setFormValues();
    deps.renderAll();
}

async function saveRetrievalSetting(key,value) { return saveRetrievalSettings({[key]:value}); }

async function retrievalSecretState() {
    const provider=deps.settings.retrievalProvider;
    const secret=provider==='vertexai'&&deps.settings.retrievalVertexAuth==='full'?'vertexai_service_account_json':deps.RETRIEVAL_PROVIDERS[provider]?.secret;
    const node=deps.document.getElementById('sr-retrieval-key-status');
    if(!node)return;
    if(!secret){node.textContent='로컬 검색 · 키 불필요';return;}
    try {
        const response=await deps.fetch('/api/secrets/read',{method:'POST',headers:deps.getRequestHeaders()});
        if(!response.ok)throw new Error(`키 상태 확인 오류 (${response.status})`);
        const state=await response.json();
        node.textContent=state?.[secret]?.some?.(entry=>entry.active) ? 'SillyTavern 키 저장됨' :
            provider==='vertexai'&&deps.settings.retrievalVertexAuth==='full' ? '서비스 계정 없음 · SillyTavern API 연결에서 등록하세요.' :
                '키 없음 · 위에서 저장하거나 SillyTavern API 연결에서 설정하세요.';
    } catch(error) {node.textContent=error.message;}
}

async function savePreference(key, value) {
    const chatKey=deps.stateChatKey();
    const initialRecord = deps.record(true);
    return deps.queueWrite(`preferences:${chatKey}`, async () => {
    const rec = deps.chatRecords.get(chatKey) || initialRecord;
    const mutationCurrent=deps.nextMutation(rec,key);
    const current=()=>mutationCurrent() && deps.chatRecords.get(chatKey)===rec;
    if (chatKey === deps.stateChatKey()) deps.invalidateReasonerJobs();
    const previous = { preference: rec.preferences[key], preferences:JSON.stringify(rec.preferences), pendingPlan: rec.pendingPlan, lastJudgment: rec.lastJudgment };
    if (!rec.pendingPlan?.outputText) rec.pendingPlan = null;
    rec.preferences[key] = value;
    rec.lastJudgment = null;
    try { await deps.persistChat(chatKey,rec); }
    catch (error) {
        if (current()) {
            rec.preferences[key] = previous.preference;
            if (JSON.stringify(rec.preferences) === previous.preferences) {
                rec.pendingPlan = previous.pendingPlan;
                rec.lastJudgment = previous.lastJudgment;
            }
        }
        if(chatKey===deps.stateChatKey())setFormValues();
        throw error;
    }
    if(chatKey!==deps.stateChatKey() || !current())return;
    await deps.clearInjection({chatKey,onlyIfOrphaned:true});
    if(chatKey!==deps.stateChatKey() || !current())return;
    if (key === 'selectedWorldId') await deps.applyStoredInjection();
    if(chatKey===deps.stateChatKey() && current())deps.renderAll();
    });
}

async function saveInjectionMode(value) {
    if (value === 'macro' && !deps.macroAvailable) notifySceneReaderToast(deps.window, 'warning', '현재 SillyTavern에서는 사용자 매크로를 등록할 수 없어 기본 위치를 사용합니다.', '씬판독기');
    const mode = value === 'macro' && deps.macroAvailable ? 'macro' : 'depth';
    const rec=deps.record(true),chatKey=deps.stateChatKey();
    const current=deps.nextMutation(rec,'injectionMode');
    const previous=rec.preferences.injectionMode;
    rec.preferences.injectionMode = mode;
    try { await deps.persistChat(chatKey,rec); }
    catch(error) { if(current())rec.preferences.injectionMode=previous; if(chatKey===deps.stateChatKey())setFormValues(); throw error; }
    if(chatKey!==deps.stateChatKey() || !current())return;
    await deps.applyStoredInjection();
    if(chatKey===deps.stateChatKey())setFormValues();
}

async function saveWorldInjectionMode(value) {
    if (value === 'macro' && !deps.macroAvailable) notifySceneReaderToast(deps.window, 'warning', '현재 SillyTavern에서는 사용자 매크로를 등록할 수 없어 기본 위치를 사용합니다.', '씬판독기');
    const rec=deps.record(true),chatKey=deps.stateChatKey();
    const current=deps.nextMutation(rec,'worldInjectionMode');
    const previous=rec.preferences.worldInjectionMode;
    rec.preferences.worldInjectionMode = value === 'macro' && deps.macroAvailable ? 'macro' : 'depth';
    try { await deps.persistChat(chatKey,rec); }
    catch(error) { if(current())rec.preferences.worldInjectionMode=previous; if(chatKey===deps.stateChatKey())setFormValues(); throw error; }
    if(chatKey!==deps.stateChatKey() || !current())return;
    await deps.applyStoredInjection();
    if(chatKey===deps.stateChatKey())setFormValues();
}

async function endActiveEvent() {
    deps.invalidateReasonerJobs();
    const chatKey=deps.stateChatKey();
    const rec = deps.record(true);
    if (rec.eventProfile) deps.archiveCurrentEvent(rec, 'ended_by_user');
    rec.eventProfile = null;
    rec.lastEventRoll = null;
    rec.pacingState.event = { qualifiedSteps: 0, evidence: [] };
    rec.sceneOpportunity += 1;
    rec.lastJudgment = null;
    rec.pendingPlan = null;
    await deps.persistChat(chatKey,rec);
    await deps.clearInjection({chatKey,onlyIfOrphaned:true});
    if(chatKey!==deps.stateChatKey())return;
    deps.renderAll();
    notifySceneReaderToast(deps.window, 'success', '현재 사건을 끝냈습니다. 다음 적합한 기회부터 새 사건을 판정합니다.', '씬판독기');
}
return {setFormValues,saveGlobal,saveRetrievalSettings,saveRetrievalSetting,retrievalSecretState,savePreference,saveInjectionMode,saveWorldInjectionMode,endActiveEvent};
}
