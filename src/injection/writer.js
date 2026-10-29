import {StaleRunError} from "../lifecycle/jobs.js";
import {normalizePresetSlot} from './preset-catalog.js';
import {clearLegacyPrompts} from './legacy-cleanup.js';
import {judgmentVisibilityCurrent} from './source-validity.js';
import {visibilityKey} from '../context/visibility.js';
import {PRESET_ENTRIES} from './preset-entry-contract.js';
import {deliveryParts} from './delivery-routing.js';

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
    const visibility=visibilityKey(deps.getContext().chat||[]);
    const sourceCurrent=judgmentVisibilityCurrent(judgment,deps.getContext().chat||[])&&(!judgment?.sourceKey || judgment.sourceKey===deps.sourceRevisionKey(rec,world));
    const payload = deps.settings.enabled && sourceCurrent && judgment?.payload ? judgment.payload : '';
    const judgmentPayload = judgment?.payload;
    const assertOwner=()=>{validate?.();if(visibility!==visibilityKey(deps.getContext().chat||[]) || chatKey!==deps.stateChatKey() || rec!==deps.record() || judgment!==deps.record()?.lastJudgment || judgment?.payload!==judgmentPayload)throw new StaleRunError();};
    const worldPayload = deps.settings.enabled
        ? String(exactSnapshot ? rec?.lastJudgment?.worldPayload || '' : sourceCurrent && rec?.lastJudgment?.worldId === world?.id ? rec.lastJudgment.worldPayload || '' : world?.prompt || '')
        : '';
    const placement=deps.placement?.read();
    const sceneNative=placement?.scene==='entry',worldNative=placement?.world==='entry';
    const scenePreset = placement?placement.scene!=='depth':['preset','macro'].includes(rec?.preferences?.injectionMode);
    const worldPreset = placement?placement.world!=='depth':['preset','macro'].includes(rec?.preferences?.worldInjectionMode);
    const sceneSuppressed=sceneNative&&placement.preset.prompts.some(p=>p.identifier===PRESET_ENTRIES.scene.identifier&&!p.enabled);
    const independent=Boolean(placement),characterMode=placement?.character||'depth';
    const parts=deliveryParts({payload,characterDelivery:payload?judgment?.characterDelivery:null,worldPayload,scenePreset,worldPreset,characterMode});
    const roster = deps.settings.enabled && sourceCurrent && !sceneSuppressed ? deps.stateRoster(deps.characterStore, rec?.preferences, rec?.lastJudgment,{recheckOutput:deps.STATE_COLLECTOR_MODE==='profile-output'}) : [];
    const stateCollectionPaused = rec?.lastJudgment?.sceneIntimacy?.route === 'paused';
    const context = deps.getContext();
    const multipleOutputs = context.mainApi === 'openai' && Number(context.chatCompletionSettings?.n) > 1;
    const mainCapture = !stateCollectionPaused && deps.STATE_COLLECTOR_MODE === 'main-output' && !deps.isStreamingEnabled() && !multipleOutputs;
    const capturePayload=mainCapture ? deps.mainOutputStatePrompt(roster) : '';
    const basePayload=independent?[parts.base,!scenePreset?capturePayload:''].filter(Boolean).join('\n\n'):'';
    wrotePrompt=true;
    await deps.setExtensionPrompt(deps.INJECT_KEY,independent?basePayload:scenePreset?'':payload,deps.IN_CHAT,0,false,deps.SYSTEM_ROLE);
    assertOwner();
    await deps.setExtensionPrompt(deps.WORLD_INJECT_KEY,independent?'':worldPreset?'':worldPayload,deps.IN_CHAT,0,false,deps.SYSTEM_ROLE);
    assertOwner();
    await deps.setExtensionPrompt(deps.STATE_CAPTURE_KEY, independent?'':scenePreset?'':capturePayload, deps.IN_CHAT, 0, false, deps.SYSTEM_ROLE);
    assertOwner();
    const slots=deps.getContext().extensionPrompts;
    if(slots)for(const [key,expected] of [[deps.INJECT_KEY,independent?basePayload:scenePreset?'':payload],[deps.WORLD_INJECT_KEY,independent?'':worldPreset?'':worldPayload],[deps.STATE_CAPTURE_KEY,independent?'':scenePreset?'':capturePayload]]) {
        const slot=slots[key];
        const actual=typeof slot==='string'?slot:slot?.value||'';
        if(actual!==expected)throw new Error('주입문이 SillyTavern에 등록되지 않았습니다: '+key);
    }
    deps.activeInjectionPayload = payload;
    deps.activeMacroPayload = '';
    deps.activeWorldMacroPayload = '';
    const routing=independent?{independentDelivery:true,basePayload,baseWithoutCharacter:[parts.withoutCharacter,!scenePreset?capturePayload:''].filter(Boolean).join('\n\n'),deliveryPayload:!scenePreset&&characterMode!=='entry'?payload:parts.scene,independentScene:parts.scene,independentCharacter:parts.character,characterMode,characterNative:characterMode==='entry',characterPreset:characterMode==='entry'}:{};
    deps.activeGenerationCycle = { ...deps.activeGenerationCycle, injection:{chatKey,visibilityKeyV1:visibility,payload,characterDelivery:payload?judgment?.characterDelivery:null,worldPayload,capturePayload,activity:payload?judgment?.activity||{}:{},additionBlocks:payload?judgment?.additionBlocks||[]:[],scenePreset,worldPreset,sceneNative,worldNative,sceneSuppressed,presetKey:placement?.key||'',sceneSlot:normalizePresetSlot(placement?.sceneSlot||rec?.preferences?.scenePresetSlot),worldSlot:normalizePresetSlot(placement?.worldSlot||rec?.preferences?.worldPresetSlot),registrationVerified:Boolean(slots),judgmentWarning:Boolean(judgment?.sceneIntimacy?.error||[judgment?.opportunityPlan?.event,judgment?.opportunityPlan?.person].some(item=>item?.reasonCode==='invalid_selection')||(judgment?.jevDiagnostics?.valid<judgment?.jevDiagnostics?.requested))}, stateRoster: roster, stateCollectorMode: deps.STATE_COLLECTOR_MODE, stateCollectionPaused, stateCaptureEnabled: !scenePreset && mainCapture && roster.length > 0 };
    Object.assign(deps.activeGenerationCycle.injection,routing);
    deps.activeGenerationCycle.injection.statePayload=payload?judgment?.statePayload||'':'';
    const preview = deps.document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = payload || '현재 주입문 없음';
    deps.hub?.report('injection.register','PROMPT_REGISTERED',{payloadChars:payload.length,worldChars:worldPayload.length,scenePreset,worldPreset,inputKey:rec?.lastJudgment?.inputKey||''});
    if(payload&&judgment?.sceneIntimacy?.route==='paused')deps.hub?.report('scene_delivery','SCENE_DELIVERY',{module:'src/injection/writer.js',route:'paused',reasonCode:'NSFW_SCENE_PAUSED',referenceCount:judgment.sceneDelivery?.referenceCount??null,characterAnalysisSkipped:true,characterMacroSkipped:true,fixedGuidancePrepared:true});
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
