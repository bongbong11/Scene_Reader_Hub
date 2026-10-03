import {buildTurnReport} from '../../debug/turn-report.js';
import { bindPresetSlots } from '../preset-slots.js';
import { bindJevSettings } from '../jev-settings.js';
import { notifySceneReaderToast } from "../toasts.js";
import { MEMORY_REFERENCE_ENABLED } from "../../context/memory.js";
import { debugReportText } from "../../debug/report.js";
import { bindCharacterTransfer } from "../character-transfer.js";
import { openPersonPreview } from "../person-preview.js";
import { worldCompilerPrompt, parseAdvancedWorld, advancedWorldToStored, storedWorldToJson } from "../../world/advanced.js";
import { characterCopyNotice, worldCopyNotice } from '../compiler-copy.js';
import { SEASONAL_OPTIONS } from "../../world/seasonal.js";

export function createFormBindings(deps) {
function bindForm() {
    bindPresetSlots(deps);
    const updateWorldCopy=()=>worldCopyNotice(deps.document,deps.availableWorlds());
    for(const id of ['sr-world-edit-name','sr-world-edit-prompt','sr-world-advanced-json'])deps.document.getElementById(id)?.addEventListener('input',updateWorldCopy);
    deps.document.getElementById('sr-world-profile')?.addEventListener('change',updateWorldCopy);
    deps.document.getElementById('sr-world-advanced')?.addEventListener('toggle',updateWorldCopy);
    deps.document.querySelector('.sr-retrieval-panel')?.addEventListener('toggle',event=>{if(event.target.open)void deps.retrievalSecretState();});
    deps.document.getElementById('sr-retrieval-provider')?.addEventListener('change',event=>deps.runUiTask((async()=>{
        const provider=event.target.value;
        if(!deps.RETRIEVAL_PROVIDERS[provider])throw new Error('검색 방식을 선택하세요.');
        await deps.saveRetrievalSettings({retrievalProvider:provider,retrievalModel:deps.RETRIEVAL_PROVIDERS[provider].model});
        await deps.retrievalSecretState();
    })(),'검색 방식을 바꾸지 못했습니다.'));
    deps.document.getElementById('sr-retrieval-model')?.addEventListener('change',event=>deps.runUiTask(deps.saveRetrievalSetting('retrievalModel',event.target.value.trim()),'검색 모델을 저장하지 못했습니다.'));
    for(const [id,key] of [['sr-retrieval-vertex-auth','retrievalVertexAuth'],['sr-retrieval-vertex-region','retrievalVertexRegion'],['sr-retrieval-vertex-project','retrievalVertexProject']])
        deps.document.getElementById(id)?.addEventListener('change',event=>deps.runUiTask(deps.saveRetrievalSetting(key,event.target.value.trim()).then(deps.retrievalSecretState),'Vertex 설정을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-retrieval-key-refresh')?.addEventListener('click',()=>deps.runUiTask(deps.retrievalSecretState(),'키 상태를 확인하지 못했습니다.'));
    deps.document.getElementById('sr-retrieval-key-save')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        const secret=deps.RETRIEVAL_PROVIDERS[deps.settings.retrievalProvider]?.secret;
        const input=deps.document.getElementById('sr-retrieval-key');
        const value=input?.value.trim();
        if(!secret||!value)throw new Error('선택한 검색 서비스의 새 키를 입력하세요.');
        const response=await deps.fetch('/api/secrets/write',{method:'POST',headers:deps.getRequestHeaders(),body:JSON.stringify({key:secret,value,label:'Scene Reader retrieval'})});
        if(!response.ok)throw new Error(`SillyTavern 키 저장 오류 (${response.status})`);
        input.value='';
        deps.vectorRetrieval.clear();
        await deps.retrievalSecretState();
        notifySceneReaderToast(deps.window, 'success', 'SillyTavern 키 저장소에 저장했습니다.','씬판독기');
    })(),'검색 키를 저장하지 못했습니다.'));
    deps.document.getElementById('sr-retrieval-test')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        const node=deps.document.getElementById('sr-retrieval-key-status');
        if(node)node.textContent='검색 연결 확인 중…';
        try { const result=await deps.vectorRetrieval.test();if(node)node.textContent=result;notifySceneReaderToast(deps.window, 'success', result,'씬판독기'); }
        catch(error){if(node)node.textContent=`연결 실패 · ${error.message}`;throw error;}
    })(),'검색 연결 확인에 실패했습니다.'));
    bindCharacterTransfer(deps,{characterForm: deps.characterForm,invalidatePreparedJudgment: deps.invalidatePreparedJudgment,downloadJson: deps.downloadJson,ensureLoreLoaded: deps.ensureLoreLoaded,captureCharacterError: deps.captureCharacterError,showVersionEditor: deps.showVersionEditor,showVersionPreview: deps.showVersionPreview});
    const importCurrentSheet=async()=>{
        const kind=deps.characterEditorKind, context=deps.getContext();
        let name='', source='';
        if(kind==='character') {
            const character=context.characters?.[context.characterId], card=character?.data || character;
            name=card?.name || character?.name || context.name2 || '';
            source=[['DESCRIPTION',card?.description],['PERSONALITY',card?.personality]].filter(([,value])=>String(value || '').trim()).map(([label,value])=>`${label}:\n${value}`).join('\n\n');
        } else if(kind==='persona') {
            const revision=deps.characterEditorRevision;
            const personas=await import('/scripts/personas.js').catch(()=>null);
            if(revision!==deps.characterEditorRevision)throw new deps.StaleRunError();
            const entry=context.powerUserSettings?.persona_descriptions?.[personas?.user_avatar];
            name=context.name1 || entry?.name || '';
            source=context.personaDescription || context.persona?.description || (typeof entry==='string'?entry:entry?.description) || context.powerUserSettings?.persona_description || '';
        }
        if(!String(source).trim())throw new Error('현재 인물의 시트 원문을 찾지 못했습니다. 캐릭터 카드나 페르소나 설정을 확인한 뒤 다시 가져오세요.');
        const input=deps.document.getElementById('sr-character-source');
        if(input.value.trim() && !deps.window.confirm('입력 중인 원문을 현재 시트로 바꿀까요?'))return;
        const cast=deps.document.getElementById('sr-character-cast-names');
        input.value=source;
        if(cast?.dataset.member!=='true')deps.document.getElementById('sr-character-name').value=name;
        if(cast)cast.dataset.cardName=kind==='character'?name:'';
        deps.updateSheetButton();
        deps.document.getElementById('sr-character-sheet-summary').textContent=`${name} · 시트 ${source.length}자 가져옴`;
        deps.characterEditorRevision++;await deps.beginLoreRefresh();deps.taskStatus('현재 시트와 연결 로어북을 가져왔습니다. 분석 명령문을 복사하세요.');
    };
    deps.document.getElementById('sr-character-read-sheet')?.addEventListener('click',()=>{
        const source=deps.document.getElementById('sr-character-source').value.trim();
        if(source)openPersonPreview(deps.document,deps.escapeHtml,{entry:{name:deps.document.getElementById('sr-character-name').value,source},sourceOnly:true});
        else deps.runUiTask(importCurrentSheet(),'현재 시트를 가져오지 못했습니다.');
    });
    deps.document.getElementById('sr-character-sheet-refresh')?.addEventListener('click',()=>deps.runUiTask(importCurrentSheet(),'현재 시트를 가져오지 못했습니다.'));
    deps.document.getElementById('sr-debug-open')?.addEventListener('click', () => {
        const judgment = deps.record()?.lastJudgment;
        const frame = judgment && deps.lastDebugFrame?.chatKey === deps.stateChatKey() && deps.lastDebugFrame?.inputKey === judgment.inputKey ? deps.lastDebugFrame : null;
        const preview = deps.document.getElementById('sr-debug-preview');
        if (!preview) return;
        preview.value = debugReportText({
            status: judgment ? 'judgment_available' : 'no_judgment',
            diagnostics: deps.diagnosticEvents?.slice(-80) || [],
            judgedAt: judgment?.judgedAt, model: judgment?.model,
            request: frame?.request || '원문 요청은 재시작 또는 다른 채팅으로 전환되어 메모리에 남아 있지 않습니다.',
            rawJevAnswers: frame?.answers || judgment?.rawChoices,
            jevDiagnostics: judgment?.jevDiagnostics,
            worldSelection: judgment?.worldSelection, worldGate: frame?.worldGate,
            sceneIntimacy: judgment?.sceneIntimacy,
            decisions: judgment?.details, actionPlan: judgment?.actionPlan, rolls: judgment?.rolls,
            correctionSelection: judgment?.correctionSelection,
            characterTrace: judgment?.characterTrace,
            verification: judgment?.priorVerification, characterStateCapture: deps.selectedStateCapture(),
            finalInjection: judgment?.payload, worldInjection: judgment?.worldPayload,
        }, deps.ownerPrompt());
        preview.hidden = false;
    });
    deps.document.getElementById('sr-debug-copy')?.addEventListener('click', () => deps.runUiTask((async () => {
        const preview = deps.document.getElementById('sr-debug-preview');
        if (!preview || preview.hidden || !preview.value.trim()) throw new Error('먼저 전체 판정을 열고 개인정보를 확인하세요.');
        await deps.copyText(preview.value);
        notifySceneReaderToast(deps.window, 'success', '검토한 판정 기록을 복사했습니다.', '씬판독기');
    })(), '판정 기록을 복사하지 못했습니다.'));
    for (const [id,key] of [['sr-memory-charm','charmMemory'],['sr-memory-lorebook','lorebookMemory']]) deps.document.getElementById(id)?.addEventListener('change', event => { if (MEMORY_REFERENCE_ENABLED && deps.ownerUnlocked()) deps.runUiTask(deps.savePreference(key,event.target.checked)); });

    deps.document.getElementById('sr-close')?.addEventListener('click', () => deps.dialog.close());
    deps.document.getElementById('sr-copy-debug')?.addEventListener('click', () => deps.runUiTask((async () => {
        const judgment = deps.record()?.lastJudgment;
        if (!judgment) {
            await deps.copyText(debugReportText({status:'no_judgment',diagnostics:deps.diagnosticEvents?.slice(-80)||[]},deps.ownerPrompt()));
            notifySceneReaderToast(deps.window, 'success', '판독 실패·진행 기록을 복사했습니다.', '씬판독기');
            return;
        }
        const tab = deps.dialog.querySelector('.sr-tab-panel.active')?.id?.replace('sr-tab-', '') || 'flow';
        const related = (key) => tab === 'advanced' ? key.startsWith('advanced_') || ['primary_focus', 'secondary_focus', 'event_state', 'event_route'].includes(key)
            : tab === 'conflict' ? ['conflict_state', 'fight_sustain', 'villain_route', 'npc_autonomy', 'npc_knowledge_fit', 'world_hostility', 'misfortune', 'negative_priority'].includes(key) || key.startsWith('verification_')
                : tab === 'characters' ? key.startsWith('character_') || key.startsWith('sexual_') || ['npc_route', 'npc_presence', 'npc_knowledge_fit'].includes(key)
                    : true;
        const report = { ...buildTurnReport({judgment,tab,related}),
            ...(tab==='characters'?{characterStateCapture:deps.selectedStateCapture(),characterTrace:(judgment.characterTrace || []).map(person=>({id:person.id,kind:person.kind,presence:person.presence,storedRecordCount:person.storedRecordCount,candidateCount:person.candidateCount,protection:person.protection,jevSelectedRuleIds:person.jevSelectedRuleIds,profileIds:person.profileIds,injectedRuleIds:person.injectedRuleIds,omittedBySlotRuleIds:person.omittedBySlotRuleIds,omittedRuleIds:person.omittedRuleIds,excludedByPresenceRuleIds:person.excludedByPresenceRuleIds,blockChars:person.blockChars,zeroReason:person.zeroReason})),sexualTrace:judgment.sexualTrace}:{}), };
        await deps.copyText(JSON.stringify(report, null, 2));
        notifySceneReaderToast(deps.window, 'success', '판정 원선택과 최종 조정 결과를 복사했습니다.', '씬판독기');
    })()));
    deps.dialog.addEventListener('click', (event) => { if (event.target === deps.dialog) deps.dialog.close(); });
    deps.dialog.querySelectorAll('[data-sr-tab]').forEach((button) => button.addEventListener('click', () => {
        const target = button.dataset.srTab;
        deps.dialog.querySelectorAll('[data-sr-tab]').forEach((item) => item.classList.toggle('active', item === button));
        deps.dialog.querySelectorAll('.sr-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `sr-tab-${target}`));
    }));
    deps.document.getElementById('sr-settings-button')?.addEventListener('click', () => {
        deps.dialog.querySelectorAll('[data-sr-tab]').forEach((item) => item.classList.remove('active'));
        deps.dialog.querySelectorAll('.sr-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === 'sr-tab-settings'));
    });
    deps.document.getElementById('sr-run')?.addEventListener('click', () => {
        const pendingUserText = String(deps.document.getElementById('send_textarea')?.value || '').trim();
        void deps.runJudge({ force: true, pendingUserText }).catch(() => {});
    });
    deps.document.getElementById('sr-development-style')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('developmentStyle', event.target.value)));
    deps.document.getElementById('sr-world-direction')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('worldDirection', event.target.value)));
    deps.document.getElementById('sr-relationship-direction')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('relationshipDirection', event.target.value)));
    deps.document.getElementById('sr-world-profile')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('selectedWorldId', event.target.value)));
    for (const key of Object.keys(SEASONAL_OPTIONS)) deps.document.getElementById(`sr-season-${key}`)?.addEventListener('change', () => {
        const selected = Object.keys(SEASONAL_OPTIONS).filter(option => deps.document.getElementById(`sr-season-${option}`)?.checked);
        deps.runUiTask(deps.savePreference('seasonalReferences', selected).then(deps.setFormValues));
    });
    deps.document.getElementById('sr-advanced-enabled')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('advancedEnabled', event.target.checked).then(deps.setFormValues)));
    deps.document.getElementById('sr-advanced-style')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('advancedStyle', event.target.value)));
    for (const key of Object.keys(deps.ADVANCED_ELEMENTS)) deps.document.getElementById(`sr-advanced-${key}`)?.addEventListener('change', () => {
        const selected = Object.keys(deps.ADVANCED_ELEMENTS).filter((item) => deps.document.getElementById(`sr-advanced-${item}`)?.checked);
        if (!selected.length) { deps.document.getElementById(`sr-advanced-${key}`).checked = true; return; }
        deps.runUiTask(deps.savePreference('advancedElements', selected));
    });
    deps.document.getElementById('sr-injection-mode')?.addEventListener('change', (event) => deps.runUiTask(deps.saveInjectionMode(event.target.value)));
    deps.document.getElementById('sr-world-injection-mode')?.addEventListener('change', (event) => deps.runUiTask(deps.saveWorldInjectionMode(event.target.value)));
    deps.document.getElementById('sr-relationship-pace')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('relationshipPace', event.target.value)));
    deps.document.getElementById('sr-resolution-pace')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('resolutionPace', event.target.value)));
    deps.document.getElementById('sr-physical-intimacy-pace')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('physicalIntimacyPace', event.target.value)));
    for (const [id, key] of [['sr-negative-priority', 'negativePriority'], ['sr-fight-sustain', 'fightSustain'], ['sr-social-enabled', 'socialEnabled'], ['sr-world-hostility', 'worldHostility'], ['sr-npc-user', 'npcToUser'], ['sr-user-misfortune', 'userMisfortune']]) {
        deps.document.getElementById(id)?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference(key, event.target.checked)));
    }
    deps.document.getElementById('sr-private-prompt-enabled')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        if (event.target.checked && !deps.ownerPrompt()) {
            event.target.checked = false;
            notifySceneReaderToast(deps.window, 'warning', '먼저 제작자 전용 원문을 저장하세요.', '씬판독기');
            return;
        }
        await deps.savePreference('privatePromptEnabled', event.target.checked);
    })()));
    const unlockOwner = async () => {
        const input = deps.document.getElementById('sr-owner-password');
        const candidate = String(input?.value || '').trim();
        if (!candidate || await deps.sha256Hex(candidate) !== deps.OWNER_PASSWORD_HASH) {
            notifySceneReaderToast(deps.window, 'error', '제작자 비밀번호가 맞지 않습니다.', '씬판독기');
            return;
        }
        try { deps.localStorage.setItem(deps.OWNER_UNLOCK_STORAGE, 'yes'); } catch { /* extension settings still persist unlock */ }
        await deps.saveGlobal('ownerUnlocked', true);
        if (input) input.value = '';
        deps.renderOwnerMode();
        notifySceneReaderToast(deps.window, 'success', '개발자 모드를 열었습니다.', '씬판독기');
    };
    deps.document.getElementById('sr-owner-unlock')?.addEventListener('click', () => deps.runUiTask(unlockOwner(), '잠금을 해제하지 못했습니다.'));
    const ownerDiagnostic = async () => {
        if(!deps.ownerUnlocked())throw new Error('개발자 모드를 먼저 열어 주세요.');
        const orphanCleared = await deps.reconcileInjection();
        const category=deps.document.getElementById('sr-owner-diagnostic-category')?.value||'all';
        const snapshot=deps.diagnosticSnapshot();
        const checks=deps.diagnosticChecks(snapshot);
        const pattern={opportunities:/draw_|appearance_|policy_|사건|등장/,automatic:/자동|판독|생성|입력|judge_|jev_/,scene:/장면|중단|복귀|다시|scene_gate/,storage:/저장|채팅 상태|불러오|hydration/,retrieval:/검색|임베딩|벡터|세계관|retrieval/,characters:/인물|감정|기록|character/,injection:/주입|적용|매크로|injection_/}[category];
        const events=(deps.diagnosticEvents||[]).filter(event=>!pattern || pattern.test(`${event.message||''} ${event.stage||''}`)).slice(-35);
        const selectedChecks=category==='all'?checks:{[category]:checks[category]};
        const report={checkedAt:new Date().toISOString(),category,summary:orphanCleared?'오류 · 저장 판정 없이 남은 주입문을 정리했습니다.':Object.values(selectedChecks).flat().some(item=>item.result==='check')?'확인 필요':'기본 상태 확인 통과',checks:selectedChecks,state:category==='all'?snapshot:{[category]:snapshot[category]},recentEvents:events};
        const output=deps.document.getElementById('sr-owner-diagnostic-output');
        const value=debugReportText(report,deps.ownerPrompt());
        if(output){output.value=value;output.hidden=false;}
        return value;
    };
    deps.document.getElementById('sr-owner-diagnostic-run')?.addEventListener('click',()=>deps.runUiTask(Promise.resolve().then(ownerDiagnostic),'기능 상태를 확인하지 못했습니다.'));
    deps.document.getElementById('sr-owner-diagnostic-copy')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        await deps.copyText(await ownerDiagnostic());
        notifySceneReaderToast(deps.window,'success','기능 진단 결과를 복사했습니다.','씬판독기');
    })(),'기능 진단 결과를 복사하지 못했습니다.'));
    deps.document.getElementById('sr-owner-password')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        deps.runUiTask(unlockOwner(), '잠금을 해제하지 못했습니다.');
    });
    deps.document.getElementById('sr-owner-save')?.addEventListener('click', () => deps.runUiTask((async () => {
        if (!deps.ownerUnlocked()) return;
        const value = String(deps.document.getElementById('sr-owner-prompt')?.value || '').trim();
        deps.privateOwnerPrompt = value;
        try { deps.localStorage.removeItem(deps.OWNER_PROMPT_STORAGE); } catch { /* legacy cache cleanup */ }
        const rec = deps.record(true);
        if (!value) rec.preferences.privatePromptEnabled = false;
        rec.lastJudgment = null;
        await deps.persistChat();
        await deps.clearInjection();
        deps.setFormValues();
        notifySceneReaderToast(deps.window, 'success', value ? '제작자 전용 원문을 전용 저장소에 저장했습니다.' : '제작자 전용 원문을 비웠습니다.', '씬판독기');
    })(), '제작자 전용 원문을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-villain-enabled')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        await deps.savePreference('villainEnabled', event.target.checked);
        if (!event.target.checked) { const rec = deps.record(true); rec.villainProfile = null; rec.lastVillainRoll = null; await deps.persistChat(); deps.renderProfiles(); }
    })()));
    deps.document.getElementById('sr-appearance-chance')?.addEventListener('change', (event) => deps.runUiTask(deps.savePreference('appearanceChance', Number(event.target.value) || 10)));
    for (const id of ['sr-enabled', 'sr-extension-enabled']) deps.document.getElementById(id)?.addEventListener('change', (event) => deps.runUiTask((async () => {
        const enabled = event.target.checked;
        await deps.saveGlobal('enabled', enabled);
        if (!enabled) {
            deps.invalidateReasonerJobs();
            await deps.clearInjection();
            deps.updateStatus('씬판독기 꺼짐 · 판독과 주입 중단');
        } else deps.updateStatus('씬판독기 켜짐 · 다음 생성부터 판독');
        deps.setFormValues();
    })()));
    deps.document.getElementById('sr-extension-icon')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        await deps.saveGlobal('showChatIcon', event.target.checked);
        deps.setFormValues();
    })(), '아이콘 표시 설정을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-auto')?.addEventListener('change', (event) => deps.runUiTask(deps.saveGlobal('autoJudge', event.target.checked)));
    deps.document.getElementById('sr-arm-ooc-debug')?.addEventListener('click', () => {
        const rec = deps.record();
        if (!rec?.lastJudgment?.payload) {
            notifySceneReaderToast(deps.window, 'warning', '먼저 정상 RP 판독을 한 번 실행해 직전 주입문을 저장하세요.', '씬판독기');
            return;
        }
        deps.debugInjectionArmed = !deps.debugInjectionArmed;
        deps.setFormValues();
        notifySceneReaderToast(deps.window, 'info', deps.debugInjectionArmed ? '다음 OOC-only 응답에 직전 주입문을 한 번 유지합니다.' : '검사용 OOC 대기를 취소했습니다.', '씬판독기', { timeOut: 1800 });
    });
    deps.document.getElementById('sr-recent-turns')?.addEventListener('change', (event) => deps.runUiTask(deps.saveGlobal('recentTurns', Math.max(1, Math.min(5, Number(event.target.value) || 3)))));
    deps.document.getElementById('sr-progress-intensity')?.addEventListener('change', event => {
        const parsed = Number(event.target.value);
        const value = Number.isFinite(parsed) && parsed > 0 ? Math.round(Math.max(0.5, Math.min(1.5, parsed)) * 10) / 10 : 1;
        event.target.value = value.toFixed(1);
        deps.runUiTask(deps.savePreference('progressIntensity', value).then(deps.setFormValues));
    });
    for(const [id,delta] of [['sr-progress-intensity-down',-0.1],['sr-progress-intensity-up',0.1]])deps.document.getElementById(id)?.addEventListener('click',()=>{
        const current=Number(deps.document.getElementById('sr-progress-intensity')?.value)||1;
        const value=Math.round(Math.max(0.5,Math.min(1.5,current+delta))*10)/10;
        deps.document.getElementById('sr-progress-intensity').value=value.toFixed(1);
        deps.document.getElementById('sr-progress-intensity-value').textContent=value.toFixed(1);
        deps.runUiTask(deps.savePreference('progressIntensity',value).then(deps.setFormValues));
    });
    deps.document.getElementById('sr-progress-intensity-reset')?.addEventListener('click', () => deps.runUiTask(deps.savePreference('progressIntensity', 1).then(deps.setFormValues)));
    deps.document.getElementById('sr-confidence')?.addEventListener('change', (event) => { deps.runUiTask(deps.saveGlobal('showConfidence', event.target.checked).then(deps.renderJudgment)); });
    bindJevSettings(deps);
    deps.document.getElementById('sr-continuity-enabled')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        await deps.saveGlobal('continuityEnabled', event.target.checked);
        if (event.target.checked && !deps.settings.reasonerProfileId) notifySceneReaderToast(deps.window, 'warning', '연속성 추론에 사용할 연결 프로필을 선택하세요.', '씬판독기');
        const rec = deps.record(true);
        if (!event.target.checked) rec.pendingContinuityCandidates = [];
        rec.lastJudgment = null;
        await deps.persistChat();
        await deps.clearInjection();
        deps.renderAll();
    })(), '연속성 추론 설정을 바꾸지 못했습니다.'));
    deps.document.getElementById('sr-reasoner-profile')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        await deps.saveGlobal('reasonerProfileId', event.target.value);
        const rec = deps.record(true);
        rec.pendingContinuityCandidates = [];
        rec.lastReasonerSource = null;
        rec.lastJudgment = null;
        await deps.persistChat();
        await deps.clearInjection();
        deps.renderReasonerProfiles();
    })(), 'Reasoner 프로필을 변경하지 못했습니다.'));
    deps.document.getElementById('sr-reasoner-refresh')?.addEventListener('click', () => deps.runUiTask((async () => {
        await deps.loadReasonerProfiles();
        if (deps.reasonerProfileError) throw new Error(deps.reasonerProfileError);
        notifySceneReaderToast(deps.window, 'info', `SillyTavern 연결 프로필 ${deps.reasonerProfiles.length}개를 읽었습니다.`, '씬판독기', { timeOut: 1800 });
    })(), 'SillyTavern 연결 프로필을 새로 읽지 못했습니다.'));
    deps.document.getElementById('sr-reasoner-test')?.addEventListener('click', () => deps.runUiTask((async () => {
        if (!deps.settings.reasonerProfileId) throw new Error('연결 프로필을 선택하세요.');
        const status = deps.document.getElementById('sr-reasoner-status');
        if (status) status.textContent = '연결 확인 중…';
        if (!deps.connectionRequestService) await deps.loadReasonerProfiles();
        if (!deps.connectionRequestService) throw new Error(deps.reasonerProfileError || 'SillyTavern 연결 기능을 찾지 못했습니다.');
        try {
            const result = await deps.requestWithConnectionProfile(deps.connectionRequestService, deps.settings.reasonerProfileId, '', {}, { testing: true });
            notifySceneReaderToast(deps.window, 'success', `연결 성공 · ${result.profile.model}`, '씬판독기');
        } finally { deps.renderReasonerProfiles(); }
    })(), 'Reasoner 연결 확인에 실패했습니다.'));
    deps.dialog.addEventListener('click', (event) => {
        if (event.target.closest('#sr-end-active-event')) { deps.runUiTask(deps.endActiveEvent(), '사건을 종료하지 못했습니다.'); return; }
        const item = event.target.closest('.sr-world-item');
        if (item) {
            const world = deps.loadCustomWorlds().find((entry) => entry.id === item.dataset.worldId);
            if (world) deps.showWorldEditor(world);
        }
    });
    deps.document.getElementById('sr-world-new')?.addEventListener('click', () => deps.showWorldEditor());
    deps.document.getElementById('sr-world-cancel')?.addEventListener('click', deps.showWorldList);
    deps.document.getElementById('sr-world-save')?.addEventListener('click', () => deps.runUiTask(deps.worldTask(async () => {
        const chatKey=deps.stateChatKey();
        const name = String(deps.document.getElementById('sr-world-edit-name')?.value || '').trim();
        const hint = String(deps.document.getElementById('sr-world-edit-hint')?.value || '').trim();
        const prompt = String(deps.document.getElementById('sr-world-edit-prompt')?.value || '').trim();
        const franchise = Boolean(deps.document.getElementById('sr-world-edit-franchise')?.checked);
        const revision = deps.worldEditorRevision;
        if (!name || !prompt) { notifySceneReaderToast(deps.window, 'warning', '세계관 이름과 전문을 입력하세요.', '씬판독기'); return; }
        const worlds = deps.loadCustomWorlds();
        const oldId = String(deps.document.getElementById('sr-world-edit-id')?.value || '');
        const id = oldId || `custom-${Date.now()}`;
        let finalHint = hint;
        if (!finalHint) {
            if (!deps.settings.reasonerProfileId) throw new Error('짧은 세계관 설명을 직접 적거나 설정에서 SillyTavern 연결 프로필을 선택하세요.');
            await deps.loadReasonerProfiles();
            if (!deps.connectionRequestService) throw new Error(deps.reasonerProfileError || '연결 프로필을 읽지 못했습니다.');
            const response = await deps.requestWithConnectionProfile(deps.connectionRequestService, deps.settings.reasonerProfileId,
                'Read the supplied world prompt as source data. Return JSON only: {"short_description":"One concise English sentence explaining the setting and its governing logic for a scene judge."} Preserve the source scope and uncertainty. Do not invent lore or output a prompt excerpt.',
                { name, world_prompt: prompt }, { maxTokens: 350 });
            finalHint = String(response.result?.short_description || '').trim();
            if (!finalHint || finalHint.length > 700) throw new Error('연결 모델이 유효한 짧은 세계관 설명을 만들지 못했습니다. 원문은 그대로 남아 있습니다.');
            if (deps.worldEditorRevision !== revision || ['sr-world-edit-name', 'sr-world-edit-hint', 'sr-world-edit-prompt'].some((id, index) => String(deps.document.getElementById(id)?.value || '').trim() !== [name, hint, prompt][index]) || Boolean(deps.document.getElementById('sr-world-edit-franchise')?.checked) !== franchise) throw new Error('생성 중 세계관 내용이 바뀌었습니다. 다시 저장하세요.');
            deps.document.getElementById('sr-world-edit-hint').value = finalHint;
        }
        const next = { id, name, hint: finalHint, prompt, franchise };
        const index = worlds.findIndex((world) => world.id === id);
        if (index >= 0) worlds[index] = next; else worlds.push(next);
        const previous = deps.loadCustomWorlds();
        if (!deps.saveCustomWorlds(worlds)) { notifySceneReaderToast(deps.window, 'error', '브라우저 저장소에 세계관을 저장하지 못했습니다.', '씬판독기'); return; }
        try { await deps.saveServerSettings(); }
        catch (error) { deps.saveCustomWorlds(previous); throw error; }
        if(chatKey!==deps.stateChatKey())return;
        deps.invalidatePreparedJudgment(); const rec=deps.record(true); await deps.persistChat(chatKey,rec);
        if(chatKey!==deps.stateChatKey())return;
        if (deps.preferences().selectedWorldId === id) await deps.applyStoredInjection();
        deps.showWorldList();
        notifySceneReaderToast(deps.window, 'success', '커스텀 세계관을 저장했습니다.', '씬판독기');
    }), '커스텀 세계관을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-world-advanced-copy')?.addEventListener('click', () => deps.runUiTask((async () => {
        const {source}=updateWorldCopy();
        await deps.copyText(worldCompilerPrompt(source));
        notifySceneReaderToast(deps.window, 'success', source?'선택한 세계관 원문을 포함해 분석 명령문을 복사했습니다.':'기본 분석 명령문만 복사했습니다. 사용할 세계관 원문을 함께 넣어 주세요.', '씬판독기');
    })(), '분석 명령문을 복사하지 못했습니다.'));
    deps.document.getElementById('sr-world-advanced-file')?.addEventListener('change', event => deps.runUiTask(deps.worldTask(async () => {
        const file = event.target.files?.[0];
        if (!file) return;
        const chatKey=deps.stateChatKey();
        const value = await file.text();
        if(chatKey!==deps.stateChatKey())return;
        deps.document.getElementById('sr-world-advanced-json').value = value;
        deps.document.getElementById('sr-world-advanced-status').textContent = `${file.name} · 검증 후 저장을 누르세요.`;
        event.target.value = '';
    }), 'JSON 파일을 읽지 못했습니다.'));
    deps.document.getElementById('sr-world-advanced-cancel')?.addEventListener('click', deps.showWorldList);
    deps.document.getElementById('sr-world-advanced-save')?.addEventListener('click', () => deps.runUiTask(deps.worldTask(async () => {
        const chatKey=deps.stateChatKey();
        const status = deps.document.getElementById('sr-world-advanced-status');
        let parsed;
        try { parsed = parseAdvancedWorld(deps.document.getElementById('sr-world-advanced-json').value); }
        catch (error) { status.textContent = `검증 실패 · ${error.message}`; return; }
        const oldId = deps.document.getElementById('sr-world-advanced-edit-id').value;
        const id = oldId || `advanced-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const previous = deps.loadCustomWorlds();
        const next = [...previous];
        const index = next.findIndex(world => world.id === id);
        if (index >= 0) next[index] = advancedWorldToStored(parsed, id); else next.push(advancedWorldToStored(parsed, id));
        if (!deps.saveCustomWorlds(next)) { status.textContent = '브라우저 저장소에 저장하지 못했습니다.'; return; }
        try { await deps.saveServerSettings(); }
        catch (error) { deps.saveCustomWorlds(previous); throw error; }
        if(chatKey!==deps.stateChatKey())return;
        deps.invalidatePreparedJudgment(); const rec=deps.record(true); await deps.persistChat(chatKey,rec);
        if(chatKey!==deps.stateChatKey())return;
        if (deps.preferences().selectedWorldId === id) await deps.applyStoredInjection();
        deps.showWorldList();
        notifySceneReaderToast(deps.window, 'success', `고급 세계관 ${parsed.name} · 기록 ${parsed.records.length}개 저장`, '씬판독기');
    }), '고급 세계관을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-world-advanced-delete')?.addEventListener('click', () => deps.runUiTask(deps.worldTask(async () => {
        const chatKey=deps.stateChatKey();
        const id = deps.document.getElementById('sr-world-advanced-edit-id').value;
        if (!id) return;
        const previous = deps.loadCustomWorlds();
        if (!deps.saveCustomWorlds(previous.filter(world => world.id !== id))) throw new Error('브라우저 저장소에서 삭제하지 못했습니다.');
        try { await deps.saveServerSettings(); }
        catch (error) { deps.saveCustomWorlds(previous); throw error; }
        if(chatKey!==deps.stateChatKey())return;
        if (deps.preferences().selectedWorldId === id) await deps.savePreference('selectedWorldId', 'current');
        if(chatKey!==deps.stateChatKey())return;
        deps.invalidatePreparedJudgment(); const rec=deps.record(true); await deps.persistChat(chatKey,rec);
        if(chatKey!==deps.stateChatKey())return;
        deps.showWorldList();
        notifySceneReaderToast(deps.window, 'success', '고급 세계관을 삭제했습니다.', '씬판독기');
    }), '고급 세계관을 삭제하지 못했습니다.'));
    deps.document.getElementById('sr-world-delete')?.addEventListener('click', () => deps.runUiTask(deps.worldTask(async () => {
        const chatKey=deps.stateChatKey();
        const id = String(deps.document.getElementById('sr-world-edit-id')?.value || '');
        if (!id) return;
        const previous = deps.loadCustomWorlds();
        if (!deps.saveCustomWorlds(previous.filter((world) => world.id !== id))) { notifySceneReaderToast(deps.window, 'error', '브라우저 저장소에서 세계관을 삭제하지 못했습니다.', '씬판독기'); return; }
        try { await deps.saveServerSettings(); }
        catch (error) { deps.saveCustomWorlds(previous); throw error; }
        if(chatKey!==deps.stateChatKey())return;
        if (deps.preferences().selectedWorldId === id) await deps.savePreference('selectedWorldId', 'current');
        if(chatKey!==deps.stateChatKey())return;
        deps.showWorldList();
        notifySceneReaderToast(deps.window, 'success', '커스텀 세계관을 삭제했습니다.', '씬판독기');
    }), '커스텀 세계관을 삭제하지 못했습니다.'));
    deps.document.getElementById('sr-reset-npc')?.addEventListener('click', () => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        const chatKey = deps.stateChatKey();
        const rec = structuredClone(deps.record(true));
        rec.npcProfile = null;
        rec.villainProfile = null;
        rec.eventProfile = null;
        rec.lastNpcRoll = null;
        rec.lastVillainRoll = null;
        rec.lastEventRoll = null;
        rec.pacingState = { relationship: { closer: 0, distant: 0, lastBeat: 'none', evidence: [] }, event: { qualifiedSteps: 0, evidence: [] } };
        rec.relationshipState = { motion: 'none', trust: 'none', intimacy: 'none', romance: 'none', lastBeat: 'none' };
        rec.observationState = { relationshipMotion: 'unclear', trustSignal: 'unclear', intimacySignal: 'unclear', romanceEvidence: 'unclear', unresolved: 'unclear', evidenceKey: '' };
        rec.sceneState = { unresolved: 'none' };
        rec.backgroundEvents = [];
        rec.advancedEntities = [];
        rec.continuity = deps.normalizeContinuity(null);
        rec.characterState = {knowledge:[],revision:0};
        rec.characterStateEvents = [];
        rec.characterStateCapture = null;
        rec.progressionState = {turnsSinceMeaningfulProgress:0,lastOutputFingerprint:""};
        rec.observedOpportunityKeys = []; rec.sceneOpportunity = 1;
        rec.lastVerification = null; rec.lastStateInput = null;
        rec.pendingContinuityCandidates = [];
        rec.lastReasonerSource = null;
        rec.lastContinuityTrace = null;
        rec.pendingPlan = null;
        rec.lastJudgment = null;
        await deps.clearInjection({chatKey});
        await deps.saveSession(chatKey, rec, []);
        if(chatKey!==deps.stateChatKey())return;
        deps.renderAll();
        notifySceneReaderToast(deps.window, 'success', '이 채팅의 판정, 관계 누적, 사건과 추첨 인물을 초기화했습니다.', '씬판독기');
    })(), '채팅 판정 상태를 초기화하지 못했습니다.'));
    deps.document.getElementById('sr-reset-villain')?.addEventListener('click', () => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        const chatKey = deps.stateChatKey();
        const rec = structuredClone(deps.record(true));
        rec.villainProfile = null;
        rec.lastVillainRoll = null;
        rec.lastJudgment = null;
        rec.pendingPlan = null;
        await deps.clearInjection({chatKey});
        await deps.saveSession(chatKey, rec, []);
        if(chatKey!==deps.stateChatKey())return;
        deps.renderAll();
        notifySceneReaderToast(deps.window, 'success', '현재 빌런을 종료하고 새 추첨 대기로 전환했습니다.', '씬판독기');
    })(), '현재 빌런을 종료하지 못했습니다.'));
    deps.document.getElementById('sr-reset-current-npc')?.addEventListener('click', () => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        const chatKey = deps.stateChatKey();
        const rec = structuredClone(deps.record(true));
        rec.npcProfile = null;
        rec.lastNpcRoll = null;
        rec.lastJudgment = null;
        rec.pendingPlan = null;
        rec.sceneOpportunity += 1;
        await deps.clearInjection({chatKey});
        await deps.saveSession(chatKey, rec, []);
        if(chatKey!==deps.stateChatKey())return;
        deps.renderAll();
        notifySceneReaderToast(deps.window, 'success', '현재 일반 NPC를 종료하고 새 판독 대기로 전환했습니다.', '씬판독기');
    })(), '현재 일반 NPC를 종료하지 못했습니다.'));
    deps.document.getElementById('sr-reset-event')?.addEventListener('click', () => deps.runUiTask(deps.endActiveEvent(), '사건을 종료하지 못했습니다.'));
    deps.document.getElementById('sr-reset-relationship')?.addEventListener('click', () => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        const chatKey = deps.stateChatKey();
        const rec = structuredClone(deps.record(true));
        rec.pacingState.relationship = { closer: 0, distant: 0, lastBeat: 'none', evidence: [] };
        rec.relationshipState = { motion: 'none', trust: 'none', intimacy: 'none', romance: 'none', lastBeat: 'none' };
        rec.observationState = { relationshipMotion: 'unclear', trustSignal: 'unclear', intimacySignal: 'unclear', romanceEvidence: 'unclear', unresolved: 'unclear', evidenceKey: '' };
        rec.lastJudgment = null;
        rec.pendingPlan = null;
        await deps.clearInjection({chatKey});
        await deps.saveSession(chatKey, rec, []);
        if(chatKey!==deps.stateChatKey())return;
        deps.renderAll();
        notifySceneReaderToast(deps.window, 'success', '확장이 저장한 관계 누적 상태를 초기화했습니다.', '씬판독기');
    })(), '관계 누적 상태를 초기화하지 못했습니다.'));
    deps.document.getElementById('sr-character-enabled')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        const previous = deps.characterStore.enabled;
        deps.characterStore.enabled = event.target.checked;
        try { await deps.saveCharacterStore(); }
        catch (error) { deps.characterStore.enabled = previous; event.target.checked = previous; throw error; }
        deps.invalidatePreparedJudgment();
        await deps.clearInjection(); await deps.persistChat(); deps.renderAll();
    })(), '인물 판정 설정을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-user-impersonation')?.addEventListener('change', event => deps.runUiTask(deps.savePreference('allowUserImpersonation', event.target.checked), '사칭 허용 설정을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-emotion-now')?.addEventListener('click', event => {
        const button=event.currentTarget;
        if(button.disabled)return;
        button.disabled=true; button.textContent='판독 중…';
        deps.runUiTask((async()=>{
            try { await deps.collectCurrentEmotion(); }
            finally { button.disabled=false; button.textContent='빠진 감정 수집'; }
        })(),'감정을 판독하지 못했습니다.');
    });
    deps.document.getElementById('sr-profile-emotion')?.addEventListener('change', event => deps.runUiTask((async () => {
        if (event.target.checked && !deps.settings.reasonerProfileId) {
            event.target.checked = false;
            throw new Error('설정 → 모델 연결에서 연결 프로필을 먼저 선택하세요.');
        }
        await deps.savePreference('profileEmotionJudgment', event.target.checked);
        deps.setFormValues();
    })(), '감정 판정 방식을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-character-volume')?.addEventListener('change', event => deps.runUiTask(deps.savePreference('characterVolume', event.target.value), '인물 주입량 설정을 저장하지 못했습니다.'));
    deps.document.getElementById('sr-npc-record-limit')?.addEventListener('change', event => deps.runUiTask(deps.savePreference('npcRecordLimit', Number(event.target.value)), 'NPC 주입 개수 설정을 저장하지 못했습니다.'));
    for (const [id, kind] of [['sr-character-new', 'character'], ['sr-persona-new', 'persona'], ['sr-npc-sheet-new', 'npc']]) deps.document.getElementById(id)?.addEventListener('click', () => deps.showCharacterEditor(kind));
    deps.document.getElementById('sr-character-lore-options')?.addEventListener('change',()=>{
        const checked=new Set([...deps.document.querySelectorAll('#sr-character-lore-options input:checked')].map(input=>input.value));
        deps.editorLore=deps.availableEditorLore.filter(item=>checked.has(deps.loreKey(item)));
        characterCopyNotice(deps.document,deps.editorLore);
        deps.initialEditorLoreKeys=checked;
        deps.document.getElementById('sr-character-lore-count').textContent=`${checked.size}개 엔트리 선택됨`;
        for(const group of deps.document.querySelectorAll('#sr-character-lore-options .sr-character-lore-book')) {
            const boxes=[...group.querySelectorAll('input')];
            group.querySelector('summary').textContent=`${deps.availableEditorLore.find(item=>deps.loreKey(item)===boxes[0]?.value)?.book || ''} · ${boxes.filter(box=>box.checked).length}/${boxes.length}개 선택`;
        }
    });
    deps.document.querySelectorAll('[data-record-kind]').forEach(button=>button.addEventListener('click',()=>{
        deps.document.getElementById('sr-character-versions').dataset.kind=button.dataset.recordKind;
        deps.renderCharacterStore();
        deps.document.getElementById('sr-character-preview').hidden=true;
    }));
    deps.document.getElementById('sr-character-versions')?.addEventListener('change',event=>{
        const input=event.target.closest('[data-npc-affect-id]');
        if(!input)return;
        deps.runUiTask((async()=>{
            const old=deps.characterStore;
            const next=deps.normalizeCharacterStore(old);
            const npc=next.npcs.find(item=>item.id===input.dataset.npcAffectId);
            if(!npc)throw new Error('NPC 등록을 찾지 못했습니다.');
            npc.trackArousal=input.checked;
            await deps.saveCharacterStore(deps.stateChatKey(),next);
            deps.characterStore=next;
            deps.invalidatePreparedJudgment();
            await deps.clearInjection();await deps.persistChat();deps.renderAll();
        })(),'NPC 충동 판독 설정을 저장하지 못했습니다.');
    });
    deps.document.getElementById('sr-character-record-close')?.addEventListener('click',()=>{deps.document.getElementById('sr-character-preview').hidden=true;});
    for(const [tab,panel,other] of [['source','sr-character-preview-source','sr-character-analysis-result'],['record','sr-character-analysis-result','sr-character-preview-source']])deps.document.getElementById(`sr-character-preview-${tab}-tab`)?.addEventListener('click',()=>{
        deps.document.getElementById(panel).hidden=false;deps.document.getElementById(other).hidden=true;
        deps.document.getElementById('sr-character-preview-source-tab').classList.toggle('active',tab==='source');
        deps.document.getElementById('sr-character-preview-record-tab').classList.toggle('active',tab==='record');
    });
    deps.document.getElementById('sr-character-editor-cancel')?.addEventListener('click', deps.closeCharacterEditor);
    deps.document.getElementById('sr-character-lore-refresh')?.addEventListener('click',()=>deps.runUiTask(deps.beginLoreRefresh().catch(error=>{deps.captureCharacterError(error,'lorebook');throw error;}),'연결 로어북을 읽지 못했습니다.'));
    deps.document.getElementById('sr-character-error-copy')?.addEventListener('click',()=>deps.runUiTask((async()=>{
        if(!deps.lastCharacterError)return;
        const value=JSON.stringify(deps.lastCharacterError,null,2);
        try{await deps.copyText(value);}catch{
            const preview=deps.document.getElementById('sr-character-error-preview');
            if(preview){preview.value=value;preview.hidden=false;preview.focus();preview.select();}
        }
    })(),'오류 로그를 복사하지 못했습니다.'));
    deps.dialog.addEventListener('click', (event) => {
        const view = event.target.closest('[data-character-view-id]');
        if (view) {
            deps.showSavedPerson(view.dataset.characterViewKind,view.dataset.characterViewId);
            return;
        }
        const backupButton = event.target.closest('[data-backup-action]');
        if (!backupButton) return;
        const action = backupButton.dataset.backupAction;
        const id = backupButton.dataset.backupId;
        deps.runUiTask((async () => {
            if (action === 'restore') {
                deps.invalidateReasonerJobs();
                const data = await deps.storagePost('backup/restore', { id }); deps.backupList = data.backups || [];
                await deps.hydrateServerState({ migrate: false }); deps.setFormValues(); deps.renderAll();
                notifySceneReaderToast(deps.window, 'success', '백업을 복원했습니다. 복원 직전 상태도 자동 백업했습니다.', '씬판독기');
            } else if (action === 'download') {
                const data = await deps.storagePost('backup/export', { id }); deps.downloadJson(`scene-reader-${id}.json`, data.snapshot);
                notifySceneReaderToast(deps.window, 'success', '백업을 다운로드했습니다.', '씬판독기');
            } else if (action === 'delete') {
                const data = await deps.storagePost('backup/delete', { id }); deps.backupList = data.backups || []; deps.renderBackups();
                notifySceneReaderToast(deps.window, 'success', '백업을 삭제했습니다.', '씬판독기');
            }
        })(), '백업 작업에 실패했습니다.');
    });
    deps.document.getElementById('sr-backup-create')?.addEventListener('click', () => deps.runUiTask((async () => {
        await deps.saveServerSettings(); await deps.saveServerChat(); await deps.saveCharacterStore();
        const data = await deps.storagePost('backup/create'); deps.backupList = data.backups || []; deps.renderBackups();
        notifySceneReaderToast(deps.window, 'success', '현재 데이터를 날짜·시간 백업으로 저장했습니다.', '씬판독기');
    })(), '백업을 만들지 못했습니다.'));
    deps.document.getElementById('sr-backup-import')?.addEventListener('change', (event) => deps.runUiTask((async () => {
        deps.invalidateReasonerJobs();
        const file = event.target.files?.[0]; if (!file) return;
        const snapshot = JSON.parse(await file.text());
        const data = await deps.storagePost('backup/import', { snapshot }); deps.backupList = data.backups || [];
        await deps.hydrateServerState({ migrate: false }); deps.setFormValues(); deps.renderAll(); event.target.value = '';
        notifySceneReaderToast(deps.window, 'success', '백업 파일을 가져와 복원했습니다.', '씬판독기');
    })(), '백업 파일을 가져오지 못했습니다.'));
}
return {bindForm};
}
