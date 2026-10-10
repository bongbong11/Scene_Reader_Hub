import {createJudgmentView} from './results/judgment.js';
import {createCharacterView} from './results/character.js';
import {createStorageView} from './results/storage.js';
import {createContinuityView} from './results/continuity.js';
import {selectCapabilities} from '../shared/capabilities.js';
import {MEMORY_REFERENCE_ENABLED} from "../context/memory.js";

import {memoryStatusText} from "../context/memory.js";








export function createResults({readState:readRawState, document, getContext, record:readRecord, isRoomReady = () => true, ownerPrompt, escapeHtml, selectCharacter, stableFingerprint, isStateCapturePending = () => true, onBeforeRender = () => {},getAnalysis=()=>null,getChanges=()=>null,window}) {
const record=()=>isRoomReady()?readRecord():null;
const readState=()=>{const state=readRawState();return isRoomReady()?state:{...state,characterStore:{enabled:false,characters:[],npcs:[],persona:null,recordGroups:[]},activeInjectionPayload:''};};
const services={readState,document,getContext,record,ownerPrompt,escapeHtml,selectCharacter,stableFingerprint,isStateCapturePending,onBeforeRender,getAnalysis,getChanges,window};
Object.defineProperty(services,'decisionTitle',{configurable:true,get:()=>decisionTitle});
Object.defineProperty(services,'resultLabel',{configurable:true,get:()=>resultLabel});
Object.defineProperty(services,'characterTurnLabel',{configurable:true,get:()=>characterTurnLabel});
Object.defineProperty(services,'renderCharacterTurnResults',{configurable:true,get:()=>renderCharacterTurnResults});
Object.defineProperty(services,'renderJudgment',{configurable:true,get:()=>renderJudgment});
Object.defineProperty(services,'renderProfiles',{configurable:true,get:()=>renderProfiles});
Object.defineProperty(services,'renderStoredState',{configurable:true,get:()=>renderStoredState});
Object.defineProperty(services,'renderCharacterStore',{configurable:true,get:()=>renderCharacterStore});
Object.defineProperty(services,'renderCharacterAnalysisBrowser',{configurable:true,get:()=>renderCharacterAnalysisBrowser});
Object.defineProperty(services,'renderBackups',{configurable:true,get:()=>renderBackups});
Object.defineProperty(services,'renderReasonerProfiles',{configurable:true,get:()=>renderReasonerProfiles});
Object.defineProperty(services,'renderContinuity',{configurable:true,get:()=>renderContinuity});
Object.defineProperty(services,'renderAll',{configurable:true,get:()=>renderAll});
Object.defineProperty(services,'characterCardViews',{configurable:true,get:()=>characterCardViews,set:value=>{characterCardViews=value}});
Object.defineProperty(services,'characterCardOpen',{configurable:true,get:()=>characterCardOpen,set:value=>{characterCardOpen=value}});
Object.defineProperty(services,'RESULT_GROUPS',{configurable:true,get:()=>RESULT_GROUPS,set:value=>{RESULT_GROUPS=value}});
Object.defineProperty(services,'CHARACTER_TURN_LABELS',{configurable:true,get:()=>CHARACTER_TURN_LABELS,set:value=>{CHARACTER_TURN_LABELS=value}});
Object.defineProperty(services,'SEXUAL_TURN_LABELS',{configurable:true,get:()=>SEXUAL_TURN_LABELS,set:value=>{SEXUAL_TURN_LABELS=value}});
Object.defineProperty(services,'continuityLabels',{configurable:true,get:()=>continuityLabels,set:value=>{continuityLabels=value}});
Object.defineProperty(services,'continuityLabel',{configurable:true,get:()=>continuityLabel,set:value=>{continuityLabel=value}});
const {decisionTitle,resultLabel,renderJudgment,renderProfiles} = createJudgmentView(selectCapabilities(services,["RESULT_GROUPS","document","escapeHtml","getContext","ownerPrompt","readState","record"]));
const {characterTurnLabel,renderCharacterTurnResults,renderCharacterStore,renderCharacterAnalysisBrowser} = createCharacterView(selectCapabilities(services,["CHARACTER_TURN_LABELS","SEXUAL_TURN_LABELS","characterCardOpen","characterCardViews","document","escapeHtml","getContext","isStateCapturePending","readState","record","selectCharacter","stableFingerprint"]));
const {renderStoredState,renderBackups} = createStorageView(selectCapabilities(services,["document","escapeHtml","getContext","readState","record"]));
const {renderReasonerProfiles,renderContinuity} = createContinuityView(selectCapabilities(services,["getChanges","window","getAnalysis","continuityLabel","document","escapeHtml","readState","record","resultLabel"]));

const characterCardViews = new Map();
const characterCardOpen = new Map();


const RESULT_GROUPS = {
    'sr-scene-relation': ['scene_state', 'context_change_source', 'continuity_trigger', 'progress_need', 'basic_move', 'unresolved', 'relationship_motion', 'trust_signal', 'intimacy_signal', 'romance_evidence', 'counterevidence', 'relationship_direction', 'relationship_pacing', 'relationship_beat'],
    'sr-event-npc': ['primary_focus', 'secondary_focus', 'direct_execution', 'event_state', 'event_valence', 'event_blocker', 'resolution_readiness', 'event_route', 'progression_move', 'resolution_pacing', 'npc_presence', 'npc_valence', 'npc_route', 'arrival_mode', 'npc_target', 'npc_identity_route', 'npc_role', 'npc_weight', 'npc_knowledge', 'npc_disclosure', 'npc_followthrough', 'npc_knowledge_fit', 'villain_route', 'npc_autonomy'],
    'sr-advanced-judgment': ['advanced_entry', 'advanced_route', 'advanced_cause', 'advanced_element', 'advanced_move'],
    'sr-conflict-quality': ['world_direction', 'conflict_state', 'fight_sustain', 'negative_priority', 'world_hostility', 'npc_guard', 'misfortune', 'hesitation_drag', 'refusal_stall', 'circularity', 'user_handoff', 'input_echo', 'repetitive_ending', 'action_evasion', 'directive_followthrough', 'scene_cutoff'],
};



const CHARACTER_TURN_LABELS = {
    presence: { absent: '이번 응답에서 역할 없음', background: '배경에 머묾', active: '실제로 반응하거나 행동할 차례' },
    direction: { none: '별도 행동 지시 없음', speak: '대사로 반응', act: '행동으로 반응', selective: '중요한 부분만 반응', withhold: '근거 있는 정보 제한', evade: '근거 있는 회피', deceive: '근거 있는 기만', withdraw: '장면에서 물러남', confront: '현재 쟁점에 맞섬' },
};
const SEXUAL_TURN_LABELS = {
    pace: { glacial:'극도의 슬로우번', slow:'느리게', medium:'중간', fast:'빠르게', unrestrained:'무절제' },
    restraint: { full:'충분함', some:'조금 있음', little:'거의 없음', none:'없음' },
    route: { approach:'상대에게 접근', self_relief:'개인적인 해소', controlled:'조절된 행동', inward:'내면에 유지', blocked:'실제 제약으로 보류' },
    target: { self:'자신', scene_partner:'현재 장면의 상대' },
};

















const continuityLabels = {
    new_item:'새 약속·일정', affected:'기존 상태에 미친 영향', knowledge:'정보 전달', followup:'가능한 후속 행동',
    supported:'근거 확인', unsupported:'근거 없음', unclear:'판단 보류', accept_changed:'실제 변화 반영', accept_pressured:'부담만 반영', followup_only:'후속 후보로 보관', reject:'제외',
    none:'없음', strained:'부담 있음', at_risk:'이행 위험', blocked:'장애 있음',
    direct:'직접 접함', observed:'직접 관찰', told:'직접 전달받음', reported:'간접 전달받음', public:'공개 정보', role_based:'역할상 알고 있음', privileged:'확인된 특수 접근',
};
const continuityLabel = value => continuityLabels[value] || '확인 대기';


function renderAll() {
    if(!isRoomReady()){
        const preview=document.getElementById('sr-character-preview');if(preview)preview.hidden=true;
        const records=document.getElementById('sr-character-analysis-result');if(records)records.srPageToken=null;
        characterCardViews.clear();characterCardOpen.clear();
    }
    onBeforeRender();
    const memoryNode = document.getElementById('sr-memory-status');
    if (memoryNode) memoryNode.textContent = MEMORY_REFERENCE_ENABLED ? memoryStatusText(record()?.preferences, record()?.lastJudgment?.memoryStatus) : '준비 중 · 현재 RP 판독에서는 사용하지 않습니다.';
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = readState();
    renderJudgment();
    renderProfiles();
    renderStoredState();
    renderCharacterStore();
    renderCharacterTurnResults();
    renderBackups();
    renderReasonerProfiles();
    renderContinuity();
    const preview = document.getElementById('sr-prompt-preview');
    if (preview) preview.textContent = activeInjectionPayload || '현재 주입문 없음';
}


return {decisionTitle, resultLabel, characterTurnLabel, renderCharacterTurnResults, renderJudgment, renderProfiles, renderStoredState, renderCharacterStore, renderCharacterAnalysisBrowser, renderBackups, renderReasonerProfiles, renderContinuity, renderAll};
}
