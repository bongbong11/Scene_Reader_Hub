import {waitForIdle} from '../lifecycle/jobs.js';
import {createAnalysisScheduler} from './analysis-scheduler.js';
import {analysisRequestBudget} from './request-budget.js';
import {sourceRp,messageRef,validateSourceRefs} from './source-refs.js';
import {REPETITION_SYSTEM,repetitionWindow,assessRepetition} from './repetition.js';
import {REASONER_SYSTEM,validateReasonerResult} from './engine.js';
import {continuityView} from './state-adapter.js';
import {continuityActors} from './actors.js';
import {selectAnalysisContinuity} from './analysis-context.js';
import {confirmedContinuity} from './selection.js';
import {createSessionTransaction} from '../storage/session-transaction.js';
import {vaultAnalysisBridge} from '../integration/vault-output.js';
import {completeVaultAudit} from '../integration/vault-completion.js';
import {visibilityKey} from '../context/visibility.js';
import {analysisDiagnostic,analysisFailureCode} from '../debug/analysis-events.js';
import {continuitySourceWindow,advanceContinuityWindow} from './source-window.js';
import {commitAnalyzedContinuity} from './commit-analysis.js';
import {restorePendingAnalysis,pendingAnalysisReceipt,pendingAnalysisState} from './pending-analysis.js';

// Detached ordinary continuity / topic review and optional vault audit only.
// No character-file comparison, evolution collection, historical scan or repair.
export function createAuxiliaryRuntime(deps){
 const report=(code,details)=>analysisDiagnostic(deps.noteDiagnostic,code,details);
 const {commitSession}=createSessionTransaction(deps);
 const scheduler=createAnalysisScheduler({onError:e=>report('analysis_failed',{status:'failed',reasonCode:analysisFailureCode(e)}),onSettled:()=>deps.renderAll()});
 const observed=new Map();let stopped=false,cancellationToken=0;
 const idle=signal=>waitForIdle({hub:deps.hub,signal,isBusy:deps.isGenerationBusy});
 const foregroundIdle=()=>deps.hub.snapshot().state.status!=='running'&&!deps.isGenerationBusy?.();

 function queue(index){
  if(stopped||!deps.settings.enabled)return Promise.resolve({status:'cancelled'});
  const key=deps.stateChatKey(),profile=deps.settings.reasonerProfileId,enabled=Boolean(deps.settings.continuityEnabled);
  const chat=deps.getContext().chat||[],record=deps.record();
  if(chat[index]?.is_user||!sourceRp(chat[index])||record?.nonRpOutputIndices?.includes(index)){report('auxiliary_usage',{status:'not_needed',reasonCode:'no_rp_output'});return Promise.resolve({status:'no_source'});}
  let user=index-1;while(user>=0&&!chat[user]?.is_user)user--;
  const refs=[...(user>=0&&sourceRp(chat[user])?[messageRef(key,chat,user,deps.fingerprint)]:[]),messageRef(key,chat,index,deps.fingerprint)];
  const stamp=visibilityKey(chat),sourceKey=deps.fingerprint(refs),group=index;
  let progress=observed.get(key);if(!progress){progress={groups:new Map(),processed:new Map()};observed.set(key,progress);if(observed.size>16)observed.delete(observed.keys().next().value);}
  restorePendingAnalysis(progress,record?.auxiliaryStateV1?.pending,{chatRef:key,chat,fingerprint:deps.fingerprint});
  for(const [id,entry] of progress.groups)if(!validateSourceRefs(entry.refs,{chatRef:key,chat,fingerprint:deps.fingerprint}))progress.groups.delete(id);
  if(enabled&&progress.processed.get(group)!==sourceKey&&progress.groups.get(group)?.key!==sourceKey)progress.groups.set(group,{key:sourceKey,refs,offset:0});
  return scheduler.request(async job=>{
   const valid=()=>job.current()&&!stopped&&deps.settings.enabled&&deps.stateChatKey()===key&&deps.settings.reasonerProfileId===profile&&Boolean(deps.settings.continuityEnabled)===enabled&&visibilityKey(deps.getContext().chat||[])===stamp&&validateSourceRefs(refs,{chatRef:key,chat:deps.getContext().chat||[],fingerprint:deps.fingerprint});
   let vault=null,bridge;
   try{
    await idle(job.signal);if(!valid())return {status:'cancelled'};
    const current=deps.record(true),nowChat=deps.getContext().chat;
    const window=enabled?continuitySourceWindow(progress.groups,{chatRef:key,chat:nowChat,fingerprint:deps.fingerprint}):null;
    const attempted=new Map((current.auxiliaryStateV1?.pending?.groups||[]).map(entry=>[entry.group,entry.key]));
    const freshGroups=[...progress.groups].filter(([group,entry])=>attempted.get(group)!==entry.key).length;
    const due=enabled&&Boolean(window?.text)&&(attempted.size?freshGroups>=3:progress.groups.size>=3||[...progress.groups.values()].some(entry=>entry.offset>0));
    const analysisKey=deps.fingerprint([sourceKey,due?window.consumed:[]]);
    if(current.auxiliaryStateV1?.sourceKey===analysisKey){report('auxiliary_usage',{status:'not_needed',reasonCode:'already_analyzed'});return {status:'already_analyzed'};}
    const source=`USER:\n${user>=0?sourceRp(nowChat[user]):''}\nCHARACTER:\n${sourceRp(nowChat[index])}`,sourceText=source.slice(-9000);
    bridge=vaultAnalysisBridge(deps.window);
    try{vault=bridge?.beginAnalysis({outputIndex:index,sourceText,sourceTruncated:source.length>sourceText.length,outputText:String(nowChat[index].mes||''),actorDefinitions:[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[])].map(({name,aliases})=>({name,aliases:aliases||[]}))});}
    catch{report('analysis_vault',{status:'degraded',reasonCode:'VAULT_INPUT_UNAVAILABLE'});}
    if(!due&&!vault){
     const alreadyProcessed=!progress.groups.size&&progress.processed.get(group)===sourceKey;
     report('auxiliary_usage',{status:enabled&&!alreadyProcessed?'waiting':'not_needed',reasonCode:!enabled?'analysis_disabled':alreadyProcessed?'already_analyzed':!window?.text?'source_unavailable':attempted.size?'retry_interval_pending':'interval_pending',turnCount:attempted.size?freshGroups:progress.groups.size,requiredTurns:3});return {status:'waiting'};
    }
    if(!profile||!deps.connectionRequestService){vault&&bridge.failAnalysis?.(vault.token,'PROFILE_UNAVAILABLE');report('auxiliary_usage',{status:'needs_setup',reasonCode:'profile_not_configured'});return {status:'needs_setup'};}
    if(current.auxiliaryStateV1?.retryAfter>Date.now()){report('auxiliary_usage',{status:'waiting',reasonCode:'retry_backoff',retrySeconds:Math.ceil((current.auxiliaryStateV1.retryAfter-Date.now())/1000)});return {status:'waiting'};}
    const repetition=due?repetitionWindow(nowChat,index,deps.settings,current.nonRpOutputIndices||[],deps.fingerprint):null;
    const repeatedRefs=repetition?.refs||[];
    const sourceValid=()=>valid()&&(!due||validateSourceRefs(window.refs,{chatRef:key,chat:deps.getContext().chat||[],fingerprint:deps.fingerprint}))&&(!repetition||deps.fingerprint(repetitionWindow(deps.getContext().chat,index,deps.settings,deps.record()?.nonRpOutputIndices||[],deps.fingerprint).refs)===deps.fingerprint(repeatedRefs));
    const continuityText=due?window.text:sourceText;
    const state=selectAnalysisContinuity(confirmedContinuity(continuityView(current),{record:current,chatRef:key,chat:nowChat,fingerprint:deps.fingerprint,inherited:Boolean(current.sharedReference||current.legacyCarryReferenceV1)}),continuityText,{opportunity:current.sceneOpportunity,actorIds:continuityActors(deps.characterStore,deps.getContext(),continuityText,current.sceneIntimacy?.participantIds||[]),limits:{items:12,knowledge:8,dependencies:4,followups:2}});
    const input={source_rp:continuityText,...(due?{active_continuity:state,actor_names:continuityActors(deps.characterStore,deps.getContext(),continuityText),existing_state_refs:{event:current.eventProfile?{id:'event:current',title:current.eventProfile.title}:null,relationship:{id:'relationship:current',...current.relationshipState}},...(repetition.turns.length>=2?{repetition_context:{turns:repetition.turns}}:{})}:{}),...(vault?{vault_audit:vault.input}:{})};
    const system=[due?REASONER_SYSTEM:'',repetition?.turns.length>=2?REPETITION_SYSTEM:'',vault?.system||'',vault&&due?'Return the continuity arrays, topic_fixation and vault_results in one JSON object. Sections are independent. Do not duplicate vault knowledge into knowledge_updates. Vault card contents are not RP evidence.':''].filter(Boolean).join('\n');
    const request=analysisRequestBudget(deps.requestWithConnectionProfile,{maxRequests:2,totalMs:180000});
    report('analysis_started',{status:'running',turnCount:due?window.groupCount:1,inputChars:JSON.stringify(input).length});
    const response=await request(deps.connectionRequestService,profile,system,input,{signal:job.signal,maxTokens:Math.min(4800,(due?2400:800)+(vault?.count||0)*160),timeoutMs:120000});
    await idle(job.signal);if(!sourceValid())return {status:'cancelled'};
    if(vault)await completeVaultAudit({bridge,vault,result:response.result,sourceText,request:(system,input,options)=>request(deps.connectionRequestService,profile,system,input,options),signal:job.signal,valid:sourceValid,idle,report});
    await idle(job.signal);if(!sourceValid())return {status:'cancelled'};
    let malformed=false,incomplete=false,counts={candidateCount:0,invalidCount:0,acceptedCount:0};
    const saved=await commitSession(key,({current:rec,history})=>{
     if(due){
      const identity={chatKey:key,assistantIndex:Math.max(...window.refs.filter(ref=>ref.role==='assistant').map(ref=>ref.messageIndex)),outputFingerprint:deps.fingerprint([continuityText,window.refs]),refs:window.refs,sourceRevision:deps.sourceRevisionKey(rec,deps.selectedWorld(rec))};
      const review=assessRepetition(response.result,repetition,identity);
      if(['ready','balanced','insufficient_history'].includes(review.status))rec.repetitionGuard=review.guard;
      const fields=['new_items','affected','knowledge_updates','possible_followups'];
      malformed=!fields.some(field=>Array.isArray(response.result?.[field]));
      const invalidSections=fields.filter(field=>response.result?.[field]!==undefined&&!Array.isArray(response.result[field])).length;
      counts.invalidCount=0;
      const actors=[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[]),deps.characterStore.persona].filter(Boolean).flatMap(actor=>[actor.name,...(actor.aliases||[])]);
      const candidates=malformed?[]:validateReasonerResult(response.result,{sourceText:continuityText,continuity:continuityView(rec),sourceIdentity:identity,stateRefs:['relationship:current',...(rec.eventProfile?['event:current']:[])],actors:[...actors,deps.getContext().name1,deps.getContext().name2].filter(Boolean),evidenceSources:window.sources,diagnostics:counts});
      counts.invalidCount+=invalidSections||(malformed?1:0);
      if(invalidSections||malformed)counts.invalidShapeCount=(counts.invalidShapeCount||0)+(invalidSections||1);
      malformed ||= !candidates.length&&counts.invalidCount>0;
      incomplete=malformed||counts.invalidCount>0;
      const receipt=pendingAnalysisReceipt(candidates,rec.auxiliaryStateV1?.pending,{chatRef:key,chat:deps.getContext().chat||[],fingerprint:deps.fingerprint});
      const applied=commitAnalyzedContinuity(rec,history,receipt.candidates);
      counts.reusedCount=receipt.reusedCount;
      counts.acceptedCount=applied.accepted.length;
      rec.lastContinuityTrace={...counts,status:malformed?'error':counts.invalidCount?'partial':applied.accepted.length||counts.reusedCount?'verified':'empty',trigger:'periodic',repetitionStatus:review.status,groupCount:window.groupCount,partial:window.partial,retryPending:incomplete,verdicts:applied.accepted.map(({type,label,verdict})=>({type,label,verdict,reason:'연결모델 분석 · 형식과 가시 근거 확인'})),acceptedCount:applied.accepted.length};
      rec.lastReasonerSource=identity;rec.lastJudgment=null;
      rec.auxiliaryStateV1={sourceKey:analysisKey,retryAfter:incomplete?Date.now()+30000:0,...(incomplete?{pending:pendingAnalysisState(progress,receipt.receipts)}:{})};
     }
     else rec.auxiliaryStateV1={...rec.auxiliaryStateV1,sourceKey:analysisKey};return {chat:rec,history};
    },()=>sourceValid()&&foregroundIdle());
    if(saved&&due){if(!incomplete)advanceContinuityWindow(progress,window);if(foregroundIdle())await deps.clearInjection?.({chatKey:key});}
    report('analysis_result',{...counts,status:saved?malformed||counts.invalidCount?'degraded':'succeeded':'deferred',...(malformed||counts.invalidCount?{reasonCode:'CONTINUITY_INVALID_RESPONSE'}:{})});
    return {status:saved?'complete':'cancelled'};
   }catch(error){
    if(!valid()||job.signal.aborted)return {status:'cancelled'};
    const reasonCode=analysisFailureCode(error);vault&&bridge?.failAnalysis?.(vault.token,reasonCode);
    report('analysis_failed',{status:'failed',reasonCode});
    try{await idle(job.signal);await commitSession(key,({current:rec,history})=>{rec.auxiliaryStateV1={...rec.auxiliaryStateV1,retryAfter:Date.now()+30000,...(enabled?{pending:pendingAnalysisState(progress,rec.auxiliaryStateV1?.pending?.receipts)}:{})};rec.lastContinuityTrace={status:'error',retryPending:enabled,error:'보조 분석에 실패했습니다. 기존 판독과 자료는 유지합니다.'};return {chat:rec,history};},()=>valid()&&foregroundIdle());}catch{report('analysis_failed',{status:'failed',reasonCode:'AUXILIARY_STORAGE_FAILED'});}
    return {status:'failed',reasonCode};
   }finally{vault&&bridge?.abandonAnalysis?.(vault.token);}
  });
 }
 function observe(index){stopped=false;void queue(index);}
 function cancel(reason){cancellationToken++;scheduler.cancel();if(!deps.settings.enabled||!deps.settings.continuityEnabled)observed.clear();if(reason==='generation_stopped')stopped=true;}
 return {observe,queue,cancel,get busy(){return scheduler.pending;},get cancellationToken(){return cancellationToken;},get completion(){return scheduler.completion;}};
}
