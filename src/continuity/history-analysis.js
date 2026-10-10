import {deltaRepairInput,DELTA_REPAIR_SYSTEM} from './delta-repair.js';
import {ensureReviewTranslations} from './review-translation.js';
import {sameComparisonBase,mergeComparisonProgress,RECORD_COMPARISON_VERSION} from './record-comparison.js';
import {commitFrameDeltas} from './delta-verification.js';
import {analysisRequestBudget} from './request-budget.js';
import {validatedDeltaResponse} from './response-validation.js';
import {readHistorySources,historyWindow,historyBooks} from '../memory/history-sources.js';
import {analysisContext} from './analysis-context.js';
import {ANALYSIS_LIMITS} from './analysis-contract.js';
import {buildDeltaSystem} from './delta-prompts.js';
import {createDeltaCommit} from './delta-commit.js';
import {visibilityKey} from '../context/visibility.js';
import {sourceEligibility} from './source-eligibility.js';
import {loadBankRecords} from '../storage/character-pages.js';
export const HISTORY_POLICY=`This is a retrospective comparison, not next-scene writing. Reference summaries and lorebook entries are fallible author-level data, not proof that a character learned a secret. They can omit dates and context. Distinguish original setting from actual story development. Compare all supplied original records with grounded changes, preserving unrelated personality and relationship targets. Do not erase a newer confirmed change using an older event. Reference-only findings require user review. Cite supplied source segments exactly. Hidden chat and unselected swipes are absent and must not be reconstructed. Your output will be reviewed before application.`;
const bankSignature=(store,fingerprint)=>fingerprint([...(store.characters||[]),...(store.npcs||[]),...[store.persona].filter(Boolean)].map(a=>[a.id,a.recordBank?.analysisId,a.recordBank?.pagedRecords?.bankId,a.recordBank?.records]));
const failure=error=>typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'HISTORY_ANALYSIS_FAILED';
export function createHistoryAnalysis(deps){
 const {commitDeltaTransaction}=createDeltaCommit(deps);
 let active=false;
 const report=(code,details={})=>deps.noteDiagnostic?.('history_analysis',{module:'src/continuity/history-analysis.js',code,...details});
 const available=()=>deps.settings.enabled&&deps.settings.continuityEnabled;
 function request({books,restart=false}={}){
  if(!available())return {status:'disabled'};
  if(!deps.settings.reasonerProfileId||!deps.connectionRequestService)return {status:'needs_setup'};
  if(deps.analysis.busy||active||deps.hub.snapshot().state.status==='running')return {status:'busy'};
  const key=deps.stateChatKey(),profile=deps.settings.reasonerProfileId,visibility=visibilityKey(deps.getContext().chat),banks=bankSignature(deps.characterStore,deps.fingerprint);
  const valid=job=>job.current()&&available()&&key===deps.stateChatKey()&&profile===deps.settings.reasonerProfileId&&visibility===visibilityKey(deps.getContext().chat)&&banks===bankSignature(deps.characterStore,deps.fingerprint);
  return deps.analysis.requestTask(async job=>{
   const requestProfile=analysisRequestBudget(deps.requestWithConnectionProfile,{maxRequests:6,totalMs:360000});
   active=true;report('HISTORY_STARTED',{status:'running'});deps.renderAll();
   try{
    const read=await readHistorySources({window:deps.window,context:deps.getContext(),chatRef:key,worldInfoModule:deps.worldInfoModule,books,fingerprint:deps.fingerprint,isCurrent:()=>valid(job),signal:job.signal,excluded:deps.record()?.nonRpOutputIndices||[]});
    if(!valid(job))return {status:'cancelled'};
    report('HISTORY_SOURCE_STATUS',{status:'running',charm:read.statuses.charm,lorebook:read.statuses.lorebook,chat:read.statuses.chat,messageCount:read.sources.length});
    if(!read.sources.length){if(Object.values(read.statuses).some(s=>['error','timeout','stale'].includes(s)))throw Object.assign(new Error('이전 기억을 읽지 못했습니다.'),{code:'HISTORY_SOURCE_FAILED'});const emptySaved=await commitDeltaTransaction(key,({current,history})=>{current.historyAnalysisV1={...(current.historyAnalysisV1||{}),status:'empty',sourceStatus:read.statuses};return {chat:current,history};},()=>valid(job));if(!emptySaved)return {status:'cancelled'};report('HISTORY_EMPTY',{status:'succeeded'});return {status:'no_history'};}
    const old=deps.record()?.historyAnalysisV1;
    if(!restart&&old?.comparisonVersion===RECORD_COMPARISON_VERSION&&old?.signature===read.signature&&old?.bankSignature===banks&&['complete','limited'].includes(old.status)){report('HISTORY_UNCHANGED',{status:'succeeded'});return {status:'already_analyzed'};}
    const continuing=!restart&&old?.comparisonVersion===RECORD_COMPARISON_VERSION&&old?.signature===read.signature&&old?.bankSignature===banks&&old.cursor&&['partial','failed','running'].includes(old.status);
    let state=continuing?structuredClone(old):{schemaVersion:1,comparisonVersion:RECORD_COMPARISON_VERSION,signature:read.signature,bankSignature:banks,checkpointId:deps.fingerprint([key,read.signature,banks,Date.now()]),cursor:{source:0,offset:0},baselineOffset:0,review:structuredClone((old?.review||[]).filter(c=>c.status==='history_review')),approvedSources:old?.approvedSources||[],pages:0};
    state.status='running';state.sources=read.sources.map(s=>({id:s.id,kind:s.kind,hash:s.hash,scope:s.scope,limited:s.limited===true}));state.sourceStatus=read.statuses;
    for(let pass=0;pass<3;pass++){
     const window=historyWindow(read.sources,{cursor:state.cursor,chatRef:key,checkpointId:state.checkpointId,fingerprint:deps.fingerprint,persona:deps.settings.collectPersonaChanges});
     const context=await analysisContext(deps.record(true),window,{store:deps.characterStore,selectActiveEntries:deps.selectActiveEntries,name:deps.getContext().name2,userName:deps.getContext().name1,chat:deps.getContext().chat,fingerprint:deps.fingerprint,signal:job.signal,baselineOffset:state.baselineOffset,allActors:true});
     const input={...context.input,earlier_review_candidates:(state.review||[]).filter(c=>c.type==='character'&&context.bases.some(b=>b.actorId===c.data.actorId&&sameComparisonBase(b.baseRef,c.data.baseRef))).slice(-8).map(c=>({actor_id:c.data.actorId,base_ref:context.bases.find(b=>b.actorId===c.data.actorId&&sameComparisonBase(b.baseRef,c.data.baseRef))?.ref,proposed_rule:c.data.compactRule,status:'unapproved_reference'})),source_kinds:window.segments.map(s=>({ref:s.ref,kind:s.identity.sourceKind,scope:s.scope})),retrospective:true};
     if(JSON.stringify(input).length>ANALYSIS_LIMITS.inputChars)throw Object.assign(new Error('과거 분석 자료 한도'),{code:'ANALYSIS_INPUT_CAPACITY'});
     const response=await requestProfile(deps.connectionRequestService,profile,buildDeltaSystem(HISTORY_POLICY),input,{signal:job.signal,maxTokens:ANALYSIS_LIMITS.maxTokens,timeoutMs:ANALYSIS_LIMITS.timeoutMs});
     if(!valid(job))return {status:'cancelled'};
     const packet=await validatedDeltaResponse(response,{window,...context,fingerprint:deps.fingerprint},{request:feedback=>requestProfile(deps.connectionRequestService,profile,feedback.mode==='patch'?DELTA_REPAIR_SYSTEM:buildDeltaSystem(HISTORY_POLICY+' Return all required arrays and coverage keys. Use only supplied IDs and exact evidence.'),deltaRepairInput(input,feedback),{signal:job.signal,maxTokens:ANALYSIS_LIMITS.maxTokens,timeoutMs:ANALYSIS_LIMITS.timeoutMs}),valid:()=>valid(job),report});
     await ensureReviewTranslations(packet,{request:(system,translation)=>requestProfile(deps.connectionRequestService,profile,system,translation,{signal:job.signal,maxTokens:ANALYSIS_LIMITS.maxTokens,timeoutMs:ANALYSIS_LIMITS.timeoutMs}),valid:()=>valid(job),report});
     if(!valid(job))return {status:'cancelled'};
     for(const candidate of packet.candidates){candidate.status='history_review';const existing=state.review.findIndex(c=>c.id===candidate.id);if(existing<0)state.review.push(candidate);else state.review[existing]=candidate;}
     if(state.review.length>128)throw Object.assign(new Error('검토 자료 한도'),{code:'HISTORY_REVIEW_CAPACITY'});
     const partial=Object.values(packet.coverage).includes('deferred');
     state.pages++;state.baselineTotal=context.baseline.total;state.comparison=mergeComparisonProgress(state.comparison,packet.comparison);state.lastComparison=packet.comparison;state.translationMissing=state.review.filter(c=>c.reviewText?.status==='missing').length;
     if(!partial)state.baselineOffset=context.baseline.nextOffset??0;
     if(!partial&&context.baseline.nextOffset===null)state.cursor=window.next;
     state.status=!partial&&context.baseline.nextOffset===null&&window.next===null?(read.limited||Object.values(read.statuses).some(s=>['error','timeout','partial','stale','unsupported'].includes(s))?'limited':'complete'):'partial';
     state.lastCoverage=packet.coverage;state.lastCounts={recordChanges:state.review.filter(c=>c.type==='character'&&c.data.baseRef).length,memoryItems:state.review.filter(c=>c.type!=='character').length,additionalStates:state.review.filter(c=>c.type==='character'&&!c.data.baseRef).length};state.reviewCount=state.review.filter(c=>c.status==='history_review').length;
     const saved=await commitDeltaTransaction(key,({current,history})=>{current.historyAnalysisV1=structuredClone(state);return {chat:current,history};},()=>valid(job));
     if(!saved)return {status:'cancelled'};
     deps.renderAll();report('HISTORY_PAGE',{status:'succeeded',candidateCount:packet.candidates.length,pageCount:state.pages,baselineCount:context.bases.length,baselineTotal:context.baseline.total,comparedCount:packet.comparison?.reviewed||0,missingComparison:packet.comparison?.missing||0,recordChangeCount:packet.candidates.filter(c=>c.type==='character'&&c.data.baseRef).length,translationMissing:packet.translationMissing||0});
     if(state.status==='complete'||state.status==='limited'||partial||context.baseline.blocked)break;
    }
    report('HISTORY_RESULT',{status:state.status==='complete'?'succeeded':'partial',candidateCount:state.reviewCount,pageCount:state.pages});
    return {status:state.status==='complete'?'history_ready':'history_partial',candidateCount:state.reviewCount};
   }catch(error){
    if(job.signal.aborted||!valid(job))return {status:'cancelled'};
    const code=failure(error);report('HISTORY_FAILED',{status:'failed',errorKind:code});
    await commitDeltaTransaction(key,({current,history})=>{current.historyAnalysisV1={...(current.historyAnalysisV1||{}),status:'failed',failureCode:code};return {chat:current,history};},()=>valid(job));
    return {status:'failed',reasonCode:code};
   }finally{active=false;deps.renderAll();}
  });
 }
 async function original(candidate,signal){
  const ref=candidate.data?.baseRef;if(!ref)return candidate.baseline||null;
  const person=[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[]),...[deps.characterStore.persona].filter(Boolean)].find(a=>a.id===candidate.data.actorId);
  const bank=person?.recordBank;
  if(!bank||String(bank.analysisId||'')!==ref.analysisId||(bank.pagedRecords?.bankId||String(bank.analysisId||''))!==ref.bankDigest)throw Object.assign(new Error('원본 파일이 바뀌었습니다.'),{code:'BASELINE_CHANGED'});
  const version=bankSignature(deps.characterStore,deps.fingerprint),page=await loadBankRecords(bank,{hashes:[ref.retrievalHash],signal});
  if(version!==bankSignature(deps.characterStore,deps.fingerprint))throw Object.assign(new Error('원본 파일이 바뀌었습니다.'),{code:'BASELINE_CHANGED'});
  const record=page.records.find((r,i)=>(page.indices?.[i]??i)===ref.index&&deps.fingerprint(r)===ref.recordDigest);
  if(!record)throw Object.assign(new Error('원본 기록이 바뀌었습니다.'),{code:'BASELINE_CHANGED'});return record;
 }
 async function approve(id){
  if(deps.analysis.busy||deps.hub.snapshot().state.status==='running')throw Object.assign(new Error('판독 중입니다. 끝난 뒤 반영해 주세요.'),{code:'CHANGE_BUSY'});
  const key=deps.stateChatKey(),candidate=deps.record()?.historyAnalysisV1?.review?.find(c=>c.id===id&&c.status==='history_review');if(!candidate)return false;
  const approvalVisibility=visibilityKey(deps.getContext().chat),approvalBanks=bankSignature(deps.characterStore,deps.fingerprint),approvalSignature=deps.fingerprint(candidate);
  await original(candidate);
  if(key!==deps.stateChatKey()||approvalVisibility!==visibilityKey(deps.getContext().chat)||approvalBanks!==bankSignature(deps.characterStore,deps.fingerprint)||approvalSignature!==deps.fingerprint(deps.record()?.historyAnalysisV1?.review?.find(c=>c.id===id)))throw Object.assign(new Error('검토 중 자료가 바뀌었습니다.'),{code:'HISTORY_SOURCE_CHANGED'});
  const externalEvidence=candidate.evidence.filter(e=>e.identity.sourceKind&&e.identity.sourceKind!=='chat');
  if(externalEvidence.length){
   const read=await readHistorySources({window:deps.window,context:deps.getContext(),chatRef:key,worldInfoModule:deps.worldInfoModule,fingerprint:deps.fingerprint,isCurrent:()=>key===deps.stateChatKey()&&approvalVisibility===visibilityKey(deps.getContext().chat)});
   if(externalEvidence.some(e=>!read.sources.some(s=>s.id===e.identity.sourceId&&s.hash===e.identity.contentHash)))throw Object.assign(new Error('참고 자료가 바뀌었습니다. 이전 이야기를 다시 확인해 주세요.'),{code:'HISTORY_SOURCE_CHANGED'});
  }
  if(approvalBanks!==bankSignature(deps.characterStore,deps.fingerprint))throw Object.assign(new Error('원본 파일이 바뀌었습니다.'),{code:'BASELINE_CHANGED'});
  const signature=deps.fingerprint(candidate),visibility=visibilityKey(deps.getContext().chat),banks=bankSignature(deps.characterStore,deps.fingerprint);
  const valid=()=>deps.hub.snapshot().state.status!=='running'&&!deps.analysis.busy&&banks===bankSignature(deps.characterStore,deps.fingerprint)&&key===deps.stateChatKey()&&visibility===visibilityKey(deps.getContext().chat)&&deps.fingerprint(deps.record()?.historyAnalysisV1?.review?.find(c=>c.id===id))===signature;
  const saved=await commitDeltaTransaction(key,({current,history})=>{
   const c=current.historyAnalysisV1.review.find(c=>c.id===id),external=c.evidence.filter(e=>e.identity.sourceKind!=='chat');
   const approvedSources=(current.approvedHistorySourcesV1||=structuredClone(current.historyAnalysisV1.approvedSources||[]));
   if(approvedSources.length>=512)throw Object.assign(new Error('승인된 근거의 저장 한도'),{code:'HISTORY_REVIEW_CAPACITY'});
   for(const e of external){const ref=e.identity;if(!approvedSources.some(s=>s.id===ref.sourceId&&s.hash===ref.contentHash&&s.checkpointId===ref.checkpointId))approvedSources.push({id:ref.sourceId,hash:ref.contentHash,checkpointId:ref.checkpointId});}
   if(sourceEligibility(c.evidence.map(e=>e.identity),{record:current,chatRef:key,chat:deps.getContext().chat,fingerprint:deps.fingerprint})!=='ready')throw Object.assign(new Error('근거가 바뀌었습니다.'),{code:'HISTORY_SOURCE_CHANGED'});
   const accepted={...c,status:'pending',sourceIndex:external.length?deps.getContext().chat.length-1:c.sourceIndex};
   const frame={rec:current};const committed=commitFrameDeltas(frame,{history},[accepted],{continuity_delta_0:{choice:'supported'}},{onFailure:error=>{throw error;}});const staged={record:frame.rec,accepted:committed};
   if(!staged.accepted.length)throw Object.assign(new Error('현재 자료와 맞지 않아 반영하지 않았습니다.'),{code:'CHANGE_REVIEW_CONFLICT'});
   staged.record.historyAnalysisV1.review.find(c=>c.id===id).status='accepted';staged.record.lastJudgment=null;
   return {chat:staged.record,history};
  },valid);
  if(saved&&key===deps.stateChatKey())await deps.clearInjection({chatKey:key});deps.renderAll();return saved;
 }
 return {request,approve,original,books:()=>historyBooks(deps.getContext(),deps.worldInfoModule),get busy(){return active;}};
}
