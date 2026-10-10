import {continuityCacheMatches} from '../continuity/cache.js';
// Extracted from Scene Reader 0.26.2; behavior preserved.
import { recentTurnCount } from '../context/turn-settings.js';
export function createGenerationLifecycle(deps) {
async function generationBoundary(task) {
    const chatKey=deps.stateChatKey();
    try { return await task(); }
    catch(error) {
        if(error instanceof deps.StaleRunError || error?.name==='AbortError')return;
        if (chatKey!==deps.stateChatKey()) return;
        deps.generationMode='error';
        deps.activeGenerationCycle={mode:'error',chatKey,inputKey:'',startedAt:new Date().toISOString()};
        deps.noteDiagnostic?.('generation_preparation',{module:'src/lifecycle/generation.js',status:'failed',errorKind:error.code || error.name || 'Error'});
        try { await deps.clearInjection({chatKey}); }
        catch(cleanupError) { deps.noteDiagnostic?.('generation_cleanup',{module:'src/lifecycle/generation.js',status:'failed',errorKind:cleanupError.code || cleanupError.name || 'Error'}); }
        deps.updateStatus('판독 준비 실패 · 이번 Hub 주입을 건너뜁니다.');
        deps.updateActivity('판독 준비에 실패했습니다. 전체 진단 로그에서 오류를 확인해 주세요.',{error:true});
    }
}
function cachedJudgmentMatches(rec, context, inputKey, allowOutputChange = false) {
    const saved = rec?.lastJudgment;
    if (saved && !continuityCacheMatches(rec,deps.settings,deps.stableFingerprint))return false;
    if (!saved || saved.inputKey !== inputKey || saved.sourceKey !== deps.sourceRevisionKey(rec, deps.selectedWorld(rec))) return false;
    if (saved.contextKey === context?.contextKey) return true;
    if (!allowOutputChange || !Number.isInteger(rec.pendingPlan?.chatCount)) return false;
    const ctx = deps.getContext();
    const chat = deps.filterNonRpHistory(ctx.chat.slice(0, rec.pendingPlan.chatCount), rec.nonRpOutputIndices || []);
    const originalInput = deps.buildRecentContext({chat, turnCount:recentTurnCount(deps.settings),maxChars:deps.MAX_TRANSCRIPT_CHARS,userName:ctx.name1,characterName:ctx.name2});
    return saved.contextKey === originalInput.contextKey;
}

async function onLorebookUpdated(name, data) {
    deps.lorebookRevisions.set(name, deps.stableFingerprint(data));
    if (!deps.MEMORY_REFERENCE_ENABLED || !deps.preferences().lorebookMemory || !deps.linkedCharacterBooks(deps.getContext(), deps.worldInfoModule?.world_info).includes(name)) return;
    deps.invalidateReasonerJobs();
    const rec = deps.record(true);
    rec.lastJudgment = null;
    if (!rec.pendingPlan?.outputText) rec.pendingPlan = null;
    await deps.clearInjection();
    await deps.persistChat();
    deps.renderAll();
}

async function prepareGeneration(type, data, dryRun, preparation) {
    preparation?.assert();
    if (dryRun || data?.quiet_prompt || type === 'quiet') return;
    const startedChatKey = deps.stateChatKey();
    if(deps.isStorageBusy?.()) {
        await deps.clearInjection({chatKey:startedChatKey});
        deps.updateStatus('자료 연결 중 · 이번 응답은 Hub 판독 없이 진행합니다.');
        return;
    }
    if(deps.isEmbeddingBusy?.()) {
        deps.generationMode='embedding_maintenance';
        deps.activeGenerationCycle={mode:'embedding_maintenance',chatKey:startedChatKey,inputKey:'',startedAt:new Date().toISOString()};
        await deps.clearInjection({chatKey:startedChatKey});
        deps.updateStatus('임베딩 생성 중 · 이번 응답은 Hub 판독 없이 진행합니다.');
        return;
    }
    await deps.reconcileInjection();
    preparation?.assert();
    await deps.waitForOutputChanges();
    preparation?.assert();
    if (startedChatKey !== deps.stateChatKey()) return;
    if (deps.chatReadyKey !== null && deps.chatReadyKey !== startedChatKey) {
        await deps.clearInjection();
        deps.updateActivity('현재 채팅의 저장 상태를 읽지 못했습니다. 채팅을 다시 열고 판독해 주세요.',{error:true});
        return;
    }
    if (!deps.settings.enabled) {
        deps.jobs.invalidate();
        deps.generationMode = 'disabled';
        deps.activeGenerationCycle = { mode: 'disabled', chatKey: deps.stateChatKey(), inputKey: '', startedAt: new Date().toISOString() };
        await deps.clearInjection();
        return;
    }
    deps.pendingGenerationType = String(type || 'normal');
    const pendingUserText = deps.pendingComposerText(type, data, deps.document.getElementById('send_textarea')?.value);
    const cycleSalt = deps.generationCycleSalt(deps.getContext().chat, type, data);
    let context;
    try { context = deps.recentContext(pendingUserText); }
    catch { context = null; }
    if (context?.malformedOoc) {
        deps.generationMode = 'ooc_skip';
        deps.activeGenerationCycle = { mode: 'ooc_skip', inputKey: deps.currentInputKey(pendingUserText, cycleSalt), startedAt: new Date().toISOString() };
        await deps.clearInjection();
        deps.updateStatus('닫히지 않은 OOC 블록 · 안전하게 판독 중단');
        deps.updateActivity('닫히지 않은 OOC 블록이 있어 이번 판독과 주입을 건너뜁니다.', { error: true });
        return;
    }
    const generationInputKey = deps.currentInputKey(pendingUserText, cycleSalt);
    if (deps.debugInjectionArmed && context?.oocOnly) {
        deps.debugInjectionArmed = false;
        const rec = deps.record();
        if (!rec?.lastJudgment?.payload) {
            deps.generationMode = 'ooc_skip';
            deps.activeGenerationCycle = { mode: 'ooc_skip', inputKey: generationInputKey, startedAt: new Date().toISOString() };
            await deps.clearInjection();
            deps.updateStatus('검사용 OOC 취소 · 보존할 직전 주입문 없음');
            deps.updateActivity('직전 주입문이 없어 검사용 OOC를 시작하지 못했습니다.', { error: true });
            return;
        }
        deps.generationMode = 'ooc_debug';
        deps.activeGenerationCycle = { mode: 'ooc_debug', inputKey: generationInputKey, startedAt: new Date().toISOString() };
        await deps.applyStoredInjection({ exactSnapshot: true, validate:()=>preparation?.assert() });
        deps.updateStatus('검사용 OOC · 직전 주입문을 이번 응답에만 유지');
        deps.updateActivity('검사용 OOC · 직전 씬판독기 주입문을 한 번 유지합니다.', { done: true });
        return;
    }
    if (deps.debugInjectionArmed && !context?.oocOnly) {
        deps.debugInjectionArmed = false;
        deps.notifySceneReaderToast(deps.window, 'info', '다음 입력이 OOC-only가 아니어서 검사용 주입 유지가 취소되었습니다.', '씬판독기', { timeOut: 1800 });
    }
    if (context?.oocOnly) {
        await deps.handleOocOnlySkip({ inputKey: generationInputKey });
        return;
    }
    deps.generationMode = 'rp';
    deps.activeGenerationCycle = { mode: 'rp', chatKey: deps.stateChatKey(), inputKey: generationInputKey, startedAt: new Date().toISOString() };
    await deps.waitForProfileState();
    preparation?.assert();
    if (startedChatKey !== deps.stateChatKey() || deps.currentInputKey(pendingUserText,cycleSalt)!==generationInputKey) return;
    if (!deps.settings.autoJudge) {
        const rec = deps.record();
        if (cachedJudgmentMatches(rec, context, generationInputKey)) {
            try {
                const receipt=await deps.applyStoredInjection({validate:()=>{
                    preparation?.assert();
                    if(startedChatKey!==deps.stateChatKey() || deps.currentInputKey(pendingUserText,cycleSalt)!==generationInputKey
                        || !cachedJudgmentMatches(deps.record(),deps.recentContext(pendingUserText),generationInputKey))throw new deps.StaleRunError();
                }});
                deps.updateStatus(receipt.sourceCurrent&&receipt.payloadChars?'수동 판독 결과 적용':'현재 입력에 적용할 판독 결과 없음');
            } catch(error) {
                if(!(error instanceof deps.StaleRunError))throw error;
                if(preparation && !preparation.valid())return;
                await deps.clearInjection();
                deps.updateStatus('수동 판독 결과가 바뀌어 이번 주입을 건너뜁니다.');
            }
        } else {
            await deps.clearInjection();
            deps.updateStatus('자동 판독 꺼짐 · 현재 입력은 수동 판독 필요');
        }
        return;
    }
    if (['swipe', 'regenerate'].includes(deps.pendingGenerationType) && cachedJudgmentMatches(deps.record(), context, generationInputKey, true)) {
        try {
            const receipt=await deps.applyStoredInjection({validate:()=>{
                preparation?.assert();
                if(startedChatKey!==deps.stateChatKey() || deps.currentInputKey(pendingUserText,cycleSalt)!==generationInputKey
                    || !cachedJudgmentMatches(deps.record(),deps.recentContext(pendingUserText),generationInputKey,true))throw new deps.StaleRunError();
            }});
            if(!receipt.sourceCurrent || !receipt.payloadChars)throw new deps.StaleRunError();
            deps.updateStatus('리롤·재생성 · 기존 판정과 추첨 재사용');
            deps.updateActivity(receipt.scenePreset||receipt.worldPreset?'기존 판정 재사용 · 프리셋 주입문 준비':'기존 판정 재사용 · 주입문 준비', { done: true });
            return;
        } catch(error) {
            if(!(error instanceof deps.StaleRunError))throw error;
            if(preparation && !preparation.valid())return;
            deps.updateActivity('기존 판정이 바뀌어 현재 입력을 다시 판독합니다.');
        }
    }
    const startingSourceKey=deps.sourceRevisionKey(deps.record(),deps.selectedWorld());
    const startingContextKey=context?.contextKey||'';
    try {
        let result=await deps.runJudge({ pendingUserText, cycleSalt });
        preparation?.assert();
        if (!result && deps.settings.enabled && deps.settings.autoJudge && startedChatKey===deps.stateChatKey()
            && deps.activeGenerationCycle?.inputKey===generationInputKey
            && deps.currentInputKey(pendingUserText,cycleSalt)===generationInputKey) {
            let currentContextKey='';
            try { currentContextKey=deps.recentContext(pendingUserText).contextKey; } catch { /* input changed */ }
            const changed=startingSourceKey!==deps.sourceRevisionKey(deps.record(),deps.selectedWorld()) || startingContextKey!==currentContextKey;
            if(changed) {
                deps.updateActivity('판독 중 기록이 바뀌어 현재 상태로 한 번 다시 판독합니다.');
                result=await deps.runJudge({ pendingUserText, cycleSalt });
                preparation?.assert();
            }
            if(!result && !cachedJudgmentMatches(deps.record(),deps.recentContext(pendingUserText),generationInputKey)) {
                await deps.clearInjection();
                deps.updateActivity('이번 판독이 취소되어 주입하지 않았습니다. 다시 실행해 주세요.',{error:true});
            }
        }
    }
    catch (error) {
        if(preparation && !preparation.valid())return;
        console.error('[씬판독기] 자동 판독 실패', error);
        if (!error.activityReported) deps.updateActivity(`자동 판독 실패 · ${error.message}`, { error: true });
    }
}

async function onChatChanged() {
    const chatKey=deps.stateChatKey();
    deps.invalidateReasonerJobs();
    deps.chatReadyKey = '';
    deps.closeCharacterEditor?.();
    deps.characterStore = deps.normalizeCharacterStore(null);
    deps.updateActivity('채팅 전환 · 이전 작업을 정리했습니다.', { done: true });
    deps.handledOocMarkers.length = 0;
    deps.debugInjectionArmed = false;
    deps.generationMode = 'rp';
    deps.activeGenerationCycle = { mode: 'rp', inputKey: '', startedAt: '' };
    deps.setFormValues();
    deps.renderAll();
    await deps.clearInjection();
    if(chatKey!==deps.stateChatKey())return;
    const loaded = await deps.hydrateServerState();
    if(chatKey!==deps.stateChatKey())return;
    if (!loaded) {
        deps.noteDiagnostic('chat_hydration_failed');
        deps.updateActivity('현재 채팅의 저장 상태를 읽지 못했습니다. 이전 채팅의 인물 기록을 사용하지 않습니다.',{error:true});
        deps.renderAll();
        return;
    }
    deps.chatReadyKey = deps.stateChatKey();
    await deps.loadStateHistory();
    if(chatKey!==deps.stateChatKey())return;
    deps.setFormValues();
    deps.renderAll();
}
async function prepareBeforeGeneration(type,data={},dryRun=false,trigger='after_commands') {
    type=String(type||'normal');
    if(!deps.hub || deps.isEmbeddingBusy?.())return prepareGeneration(type,data,dryRun);
    if(dryRun||data?.quiet_prompt||type==='quiet') {
        deps.hub.report('trigger','GENERATION_SKIPPED',{trigger,type:String(type||'normal'),dryRun:Boolean(dryRun)});
        return prepareGeneration(type,data,dryRun);
    }
    const pendingUserText=deps.pendingComposerText(type,data,deps.document.getElementById('send_textarea')?.value);
    const cycleSalt=deps.generationCycleSalt(deps.getContext().chat,type,data);
    const request={type,data,dryRun,pendingUserText,cycleSalt,inputKey:deps.currentInputKey(pendingUserText,cycleSalt),contextKey:deps.recentContext(pendingUserText).contextKey,sourceKey:deps.sourceRevisionKey(deps.record(),deps.selectedWorld())};
    const key=deps.stableFingerprint({chat:deps.stateChatKey(),inputKey:request.inputKey,contextKey:request.contextKey,sourceKey:request.sourceKey,type});
    return deps.hub.ensurePrepared({key,trigger,request},async preparation=>{
        const result=await prepareGeneration(type,data,dryRun,preparation);
        preparation.assert();
        request.sourceKey=deps.sourceRevisionKey(deps.record(),deps.selectedWorld());
        return result;
    });
}
async function prepareFallbackUnsafe(type='normal') {
    type=String(type||'normal');
    const prior=deps.hub?.pendingRequest();
    const matches=()=>prior&&deps.hub.pendingRequest()===prior&&prior.type===type
        &&deps.currentInputKey(prior.pendingUserText,prior.cycleSalt)===prior.inputKey
        &&deps.recentContext(prior.pendingUserText).contextKey===prior.contextKey
        &&deps.sourceRevisionKey(deps.record(),deps.selectedWorld())===prior.sourceKey;
    if(matches()) {
        await deps.hub.waitPrepared();
        if(deps.hub.pendingRequest()!==prior)return;
        if(!matches())return onBeforeGeneration(type,{},false,'interceptor');
        // Another extension may clear host slots between the two host hooks.
        // Only restore a snapshot that this preparation actually activated.
        if(deps.activeGenerationCycle?.injection?.payload) {
            try {
                await deps.applyStoredInjection({exactSnapshot:deps.generationMode==='ooc_debug',validate:()=>{if(deps.hub.pendingRequest()!==prior || !matches())throw new deps.StaleRunError();}});
            } catch(error) {
                if(!(error instanceof deps.StaleRunError))deps.updateActivity('주입문 등록 실패 · '+error.message,{error:true});
                deps.hub.report('injection.register','PROMPT_REGISTRATION_FAILED',{error:String(error.message||error)});
                return;
            }
        }
        deps.hub.report('trigger','INTERCEPTOR_PREPARATION_REUSED',{trigger:'interceptor',status:deps.hub.snapshot().state.status});
        return;
    }
    deps.hub?.report('trigger','INTERCEPTOR_FALLBACK',{trigger:'interceptor',reason:prior?'snapshot_changed':'primary_missing'});
    return onBeforeGeneration(type,{},false,'interceptor');
}
const onBeforeGeneration=(...args)=>generationBoundary(()=>prepareBeforeGeneration(...args));
const prepareFallback=(...args)=>generationBoundary(()=>prepareFallbackUnsafe(...args));
return {cachedJudgmentMatches, onLorebookUpdated, onBeforeGeneration, onChatChanged,prepareFallback};
}
