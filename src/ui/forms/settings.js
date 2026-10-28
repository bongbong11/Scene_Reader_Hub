import {emptyProgress} from '../../scene/progress-tracking.js';
import {renderJevConnection} from '../nanogpt-jev.js';
import {renderBehaviorToggle} from '../behavior-toggle.js';
import {normalizeBehaviorMode} from '../../injection/character-behavior.js';
import {renderOpportunitySettings} from '../opportunity-settings.js';
import { recentTurnCount, renderRecentTurns } from '../../context/turn-settings.js';
import { renderRetrievalSettings, refreshRetrievalSecret } from '../retrieval-settings.js';
import { normalizeRetrievalPatch } from '../../retrieval/connection-settings.js';
import { renderPresetSlots } from '../preset-slots.js';
import { normalizePresetSlot } from '../../injection/preset-catalog.js';
import { COMMON_PREFERENCE_KEYS, commonPreferences } from '../../storage/common-preferences.js';
import { notifySceneReaderToast } from "../toasts.js";
import { MEMORY_REFERENCE_ENABLED } from "../../context/memory.js";
import { SEASONAL_OPTIONS } from "../../world/seasonal.js";

export function createSettingsForm(deps) {
function setFormValues() {
    renderJevConnection(deps);
    renderBehaviorToggle(deps);
    const prefs = deps.preferences();
    const setValue = (id, value) => { const element = deps.document.getElementById(id); if (element) element.value = value; };
    const setChecked = (id, value) => { const element = deps.document.getElementById(id); if (element) element.checked = Boolean(value); };
    renderRetrievalSettings(deps);
    setValue('sr-world-direction', prefs.worldDirection);
    setValue('sr-relationship-direction', prefs.relationshipDirection);
    setChecked('sr-negative-priority', prefs.negativePriority);
    setValue('sr-development-style', prefs.developmentStyle);
    setChecked('sr-world-agency', prefs.worldAgencyEnabled);
    setValue('sr-character-volume', prefs.characterVolume || 'generous');
    setValue('sr-npc-record-limit', prefs.npcRecordLimit || 3);
    setValue('sr-world-profile', prefs.selectedWorldId);
    for (const key of Object.keys(SEASONAL_OPTIONS)) setChecked(`sr-season-${key}`, prefs.seasonalReferences?.includes(key));
    deps.seasonalDate?.refresh();
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
    setChecked('sr-character-macro', deps.placement?.read().characterMacroEnabled ?? deps.settings.characterMacroEnabled);
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
    renderRecentTurns(deps.document, deps.settings);
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
        ? '고급 전개의 평소 움직임과 사건에도 적용합니다. 3회 연속 정체로 판독되면 선택한 성향 안에서 다른 반응을 유도합니다. 글의 호흡은 프리셋을 따릅니다.'
        : '3회 연속 정체로 판독되면 선택한 성향 안에서 다른 반응을 유도합니다. 새 사건·인물과 돌발은 아래에서 조절하세요.';
    const advancedResults = deps.document.getElementById('sr-advanced-results');
    if (advancedResults) advancedResults.hidden = !prefs.advancedEnabled;
    renderOpportunitySettings(deps);
    deps.renderWorldControls();
    deps.renderOwnerMode();
}

async function saveGlobal(key, value) {
    if(key==='seasonalDateFormats')return deps.queueWrite('seasonal-date-settings',async()=>{
        const target=deps.settings,previous=target[key];
        deps.invalidateReasonerJobs();target[key]=value;
        try{await deps.saveServerSettings({retryUnavailable:true});deps.saveSettingsDebounced();}
        catch(error){if(deps.settings===target)target[key]=previous;throw error;}
        await deps.applyStoredInjection();
    });
    if(key==='characterBehaviorMode')return deps.queueWrite('character-behavior',async()=>{
        const target=deps.settings,previous=target.characterBehaviorMode;
        deps.invalidateReasonerJobs();
        target.characterBehaviorMode=normalizeBehaviorMode(value);
        try {await deps.saveServerSettings();deps.saveSettingsDebounced();}
        catch(error) {
            if(deps.settings===target)target.characterBehaviorMode=previous;
            await deps.applyStoredInjection();
            setFormValues();
            throw error;
        }
        if(deps.settings!==target)return;
        // Drop stale transport by source revision, but preserve a new-mode judgment
        // if a normal run finished while settings were being saved.
        await deps.applyStoredInjection();
        deps.noteDiagnostic?.('character_behavior_changed',{module:'src/ui/forms/settings.js',status:'saved',mode:target.characterBehaviorMode});
        setFormValues();
    });
    if (['recentTurns', 'continuityEnabled'].includes(key)) return deps.queueWrite('context-settings', async () => {
        const target=deps.settings, chatKey=deps.stateChatKey();
        const previous={recentTurns:target.recentTurns,continuityEnabled:target.continuityEnabled};
        deps.invalidateReasonerJobs();
        target[key]=value;
        target.recentTurns=recentTurnCount(target);
        try { await deps.saveServerSettings(); deps.saveSettingsDebounced(); }
        catch(error) { if(deps.settings===target)Object.assign(target,previous); setFormValues(); throw error; }
        if(deps.settings!==target || chatKey!==deps.stateChatKey())return;
        const rec=deps.record(true);
        rec.repetitionGuard=null;
        rec.lastReasonerSource=null;
        rec.lastJudgment=null;
        if(!target.continuityEnabled)rec.pendingContinuityCandidates=[];
        if(!rec.pendingPlan?.outputText)rec.pendingPlan=null;
        await deps.clearInjection({chatKey});
        await deps.persistChat(chatKey,rec);
        if(chatKey===deps.stateChatKey())setFormValues();
    });
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
    const previous = { preference: rec.preferences[key], preferences:JSON.stringify(rec.preferences), pendingPlan: rec.pendingPlan, lastJudgment: rec.lastJudgment, progressionState: rec.progressionState };
    if (!rec.pendingPlan?.outputText) rec.pendingPlan = null;
    rec.preferences[key] = value;
    if(key==='developmentStyle' && previous.preference!==value)rec.progressionState=emptyProgress();
    rec.lastJudgment = null;
    try { await deps.persistChat(chatKey,rec); }
    catch (error) {
        if (current()) {
            rec.preferences[key] = previous.preference;
            if(key==='developmentStyle')rec.progressionState = previous.progressionState;
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
        await deps.applyStoredInjection();
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
