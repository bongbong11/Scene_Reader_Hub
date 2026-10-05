import {renderOpportunitySettings} from '../opportunity-settings.js';
import { renderRetrievalSettings, refreshRetrievalSecret } from '../retrieval-settings.js';
import { normalizeRetrievalPatch } from '../../retrieval/connection-settings.js';
import { renderPresetSlots } from '../preset-slots.js';
import { renderJevProviderSelection } from '../jev-settings.js';
import { normalizePresetSlot } from '../../injection/preset-catalog.js';
import { COMMON_PREFERENCE_KEYS, commonPreferences } from '../../storage/common-preferences.js';
import { notifySceneReaderToast } from "../toasts.js";
import { MEMORY_REFERENCE_ENABLED } from "../../context/memory.js";
import { SEASONAL_OPTIONS } from "../../world/seasonal.js";

export function createSettingsForm(deps) {
function setFormValues() {
    const prefs = deps.preferences();
    const setValue = (id, value) => { const element = deps.document.getElementById(id); if (element) element.value = value; };
    const setChecked = (id, value) => { const element = deps.document.getElementById(id); if (element) element.checked = Boolean(value); };
    renderJevProviderSelection(deps);
    renderRetrievalSettings(deps);
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
    setValue('sr-injection-mode', prefs.injectionMode);
    setValue('sr-world-injection-mode', prefs.worldInjectionMode);
    renderPresetSlots(deps);
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
    if(emotionNow) emotionNow.hidden=false;
    for (const [id,key] of [['sr-memory-charm','charmMemory'],['sr-memory-lorebook','lorebookMemory']]) { setChecked(id, MEMORY_REFERENCE_ENABLED && prefs[key]); const input = deps.document.getElementById(id); if (input) input.disabled = !MEMORY_REFERENCE_ENABLED; }
    setChecked('sr-continuity-enabled', deps.settings.continuityEnabled);
    deps.renderReasonerProfiles();
    setValue('sr-recent-turns', deps.settings.recentTurns);
    setChecked('sr-confidence', deps.settings.showConfidence);
    const debugStatus = deps.document.getElementById('sr-ooc-debug-status');
    if (debugStatus) debugStatus.textContent = deps.debugInjectionArmed
        ? '대기 중 · 다음 OOC-only 응답에 직전 주입문을 한 번 유지합니다.'
        : '다음 OOC-only에 직전 주입문을 한 번 유지합니다. 해당 응답은 상태 저장·이행 검증에 반영하지 않습니다.';
    const runButton = deps.document.getElementById('sr-run');
    if (runButton && !deps.judgeInFlight) runButton.disabled = !deps.settings.enabled;
    deps.updateKeyStatus();
    deps.updateStatus();

    const advancedNote = deps.document.getElementById('sr-basic-progression-note');
    if (advancedNote) advancedNote.textContent = prefs.advancedEnabled
        ? '고급 이벤트에도 기본 전개 성향을 함께 적용합니다. 글의 호흡은 프리셋 지침을 참고합니다.'
        : '기본 전개는 유지됩니다. 새 사건·인물과 돌발은 아래에서 조절하세요.';
    const advancedResults = deps.document.getElementById('sr-advanced-results');
    if (advancedResults) advancedResults.hidden = !prefs.advancedEnabled;
    renderOpportunitySettings(deps);
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
    patch=normalizeRetrievalPatch(deps.settings,patch);
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

async function retrievalSecretState() { const services=Object.create(deps); services.saveRetrievalSettings=saveRetrievalSettings; return refreshRetrievalSecret(services); }

async function savePreference(key, value) {
    if (COMMON_PREFERENCE_KEYS.includes(key)) return saveCommonPreferences({[key]:value});
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

async function saveCommonPreferences(patch) {
    return deps.queueWrite('common-preferences',async()=>{
        const target=deps.settings,previous=target.commonPreferences,chatKey=deps.stateChatKey();
        const next=commonPreferences({...deps.preferences(),...previous,...patch});
        deps.invalidateReasonerJobs();target.commonPreferences=next;
        try {await deps.saveServerSettings();deps.saveSettingsDebounced();}
        catch(error){if(target.commonPreferences===next)target.commonPreferences=previous;setFormValues();throw error;}
        if(target!==deps.settings || chatKey!==deps.stateChatKey())return;
        const rec=deps.record(true);
        if(Object.hasOwn(patch,'progressIntensity')) {
            rec.lastJudgment=null;if(!rec.pendingPlan?.outputText)rec.pendingPlan=null;
            await deps.clearInjection({chatKey,onlyIfOrphaned:true});
        } else await deps.applyStoredInjection();
        setFormValues();deps.renderAll();
    });
}
async function saveInjectionSetting(modeKey,slotKey,value) {
    const mode=typeof value==='object'?value.mode:value;
    const patch={[modeKey]:mode==='preset'?'preset':'depth'};
    if(typeof value==='object')patch[slotKey]=normalizePresetSlot(value.slot);
    return saveCommonPreferences(patch);
}
async function saveInjectionMode(value) {return saveInjectionSetting('injectionMode','scenePresetSlot',value);}
async function saveWorldInjectionMode(value) {return saveInjectionSetting('worldInjectionMode','worldPresetSlot',value);}

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
