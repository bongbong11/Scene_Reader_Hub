import { StaleRunError } from "../lifecycle/jobs.js";
import { normalizePresetSlot } from './preset-catalog.js';
import { clearLegacyPrompts } from './legacy-cleanup.js';

export function createInjectionWriter(deps) {
function queueInjectionWrite(task) {
    const result = deps.injectionWrite.catch(() => {}).then(task);
    deps.injectionWrite = result.catch(() => {});
    return result;
}

async function applyStoredInjection({ exactSnapshot = false, validate = null } = {}) {
    return queueInjectionWrite(async () => {
    let wrotePrompt = false;
    try {
    validate?.();
    const rec = deps.record();
    const judgment = rec?.lastJudgment;
    const chatKey=deps.stateChatKey();
    const world = deps.selectedWorld(rec);
    const sourceCurrent=!judgment?.sourceKey || judgment.sourceKey===deps.sourceRevisionKey(rec,world);
    const payload = deps.settings.enabled && sourceCurrent && judgment?.payload ? judgment.payload : '';
    const judgmentPayload = judgment?.payload;
    const assertOwner=()=>{validate?.();if(chatKey!==deps.stateChatKey() || rec!==deps.record() || judgment!==deps.record()?.lastJudgment || judgment?.payload!==judgmentPayload)throw new StaleRunError();};
    const worldPayload = deps.settings.enabled
        ? String(exactSnapshot ? rec?.lastJudgment?.worldPayload || '' : sourceCurrent && rec?.lastJudgment?.worldId === world?.id ? rec.lastJudgment.worldPayload || '' : world?.prompt || '')
        : '';
    const scenePreset = ['preset','macro'].includes(rec?.preferences?.injectionMode);
    const worldPreset = ['preset','macro'].includes(rec?.preferences?.worldInjectionMode);
    wrotePrompt = true;
    await deps.setExtensionPrompt(deps.INJECT_KEY, scenePreset ? '' : payload, deps.IN_CHAT, 0, false, deps.SYSTEM_ROLE);
    assertOwner();
    await deps.setExtensionPrompt(deps.WORLD_INJECT_KEY, worldPreset ? '' : worldPayload, deps.IN_CHAT, 0, false, deps.SYSTEM_ROLE);
    assertOwner();
    const roster = deps.settings.enabled ? deps.stateRoster(deps.characterStore, rec?.preferences, rec?.lastJudgment,{recheckOutput:deps.STATE_COLLECTOR_MODE==='profile-output'}) : [];
    const stateCollectionPaused = rec?.lastJudgment?.sceneIntimacy?.route === 'paused';
    const context = deps.getContext();
    const multipleOutputs = context.mainApi === 'openai' && Number(context.chatCompletionSettings?.n) > 1;
    const mainCapture = !stateCollectionPaused && deps.STATE_COLLECTOR_MODE === 'main-output' && !deps.isStreamingEnabled() && !multipleOutputs;
    const capturePayload=mainCapture ? deps.mainOutputStatePrompt(roster) : '';
    await deps.setExtensionPrompt(deps.STATE_CAPTURE_KEY, scenePreset ? '' : capturePayload, deps.IN_CHAT, 0, false, deps.SYSTEM_ROLE);
    assertOwner();
    const slots=deps.getContext().extensionPrompts;
    if(slots)for(const [key,expected] of [[deps.INJECT_KEY,scenePreset?'':payload],[deps.WORLD_INJECT_KEY,worldPreset?'':worldPayload],[deps.STATE_CAPTURE_KEY,scenePreset?'':capturePayload]]) {
        const slot=slots[key];
        const actual=typeof slot==='string'?slot:slot?.value||'';
        if(actual!==expected)throw new Error('주입문이 SillyTavern에 등록되지 않았습니다: '+key);
    }
    deps.activeInjectionPayload = payload;
    deps.activeMacroPayload = '';
    deps.activeWorldMacroPayload = '';
    deps.activeGenerationCycle = { ...deps.activeGenerationCycle, injection:{chatKey,payload,worldPayload,capturePayload,scenePreset,worldPreset,sceneSlot:normalizePresetSlot(rec?.preferences?.scenePresetSlot),worldSlot:normalizePresetSlot(rec?.preferences?.worldPresetSlot),registrationVerified:Boolean(slots),judgmentWarning:Boolean(judgment?.sceneIntimacy?.error||(judgment?.jevDiagnostics?.valid<judgment?.jevDiagnostics?.requested))}, stateRoster: roster, stateCollectorMode: deps.STATE_COLLECTOR_MODE, stateCollectionPaused, stateCaptureEnabled: !scenePreset && mainCapture && roster.length > 0 };
    const preview = deps.document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = payload || '현재 주입문 없음';
    deps.hub?.report('injection.register','PROMPT_REGISTERED',{payloadChars:payload.length,worldChars:worldPayload.length,scenePreset,worldPreset,inputKey:rec?.lastJudgment?.inputKey||''});
    return { applied: true, chatKey, inputKey: rec?.lastJudgment?.inputKey || '', sourceKey: rec?.lastJudgment?.sourceKey || '', sourceCurrent, payloadChars: payload.length, worldChars: worldPayload.length,scenePreset,worldPreset };
    } catch (error) {
        // This still owns the serialized prompt write. Clear a partial apply
        // before a later chat/turn is allowed to install its own injection.
        if (wrotePrompt) await resetInjection();
        throw error;
    }
    });
}

async function resetInjection() {
    deps.activeInjectionPayload = '';
    deps.activeMacroPayload = '';
    deps.activeWorldMacroPayload = '';
    await clearLegacyPrompts(deps.setExtensionPrompt,[deps.INJECT_KEY,deps.WORLD_INJECT_KEY,deps.STATE_CAPTURE_KEY]);
    deps.activeGenerationCycle = { ...deps.activeGenerationCycle, injection:null, stateRoster: [], stateCollectionPaused:false, stateCaptureEnabled: false };
    const preview = deps.document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = '현재 주입문 없음';
}

async function clearInjection({chatKey=null,onlyIfOrphaned=false,owns=null}={}) {
    return queueInjectionWrite(async () => {
    if(owns&&!owns())return false;
    if(chatKey!==null && chatKey!==deps.stateChatKey())return false;
    if(onlyIfOrphaned && (deps.record()?.lastJudgment || !deps.activeInjectionPayload))return false;
    await resetInjection();
    return true;
    });
}
return {queueInjectionWrite,applyStoredInjection,resetInjection,clearInjection};
}
