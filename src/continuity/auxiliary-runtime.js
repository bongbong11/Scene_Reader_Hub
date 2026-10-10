import {createAnalysisScheduler} from './analysis-scheduler.js';
import {analysisRequestBudget} from './request-budget.js';
import {sourceRp,messageRef,validateSourceRefs} from './source-refs.js';
import {REPETITION_SYSTEM,repetitionWindow,assessRepetition} from './repetition.js';
import {REASONER_SYSTEM,validateReasonerResult} from './engine.js';
import {continuityView} from './state-adapter.js';
import {selectActiveContinuity,confirmedContinuity} from './selection.js';
import {createSessionTransaction} from '../storage/session-transaction.js';
import {vaultAnalysisBridge} from '../integration/vault-output.js';
import {completeVaultAudit} from '../integration/vault-completion.js';
import {visibilityKey} from '../context/visibility.js';
import {analysisDiagnostic,analysisFailureCode} from '../debug/analysis-events.js';

// Detached ordinary continuity / topic review and optional vault audit only.
// No character-file comparison, evolution collection, historical scan or repair.
export function createAuxiliaryRuntime(deps){
 const report=(code,details)=>analysisDiagnostic(deps.noteDiagnostic,code,details);
 const {commitSession}=createSessionTransaction(deps);
 const scheduler=createAnalysisScheduler({onError:e=>report('analysis_failed',{status:'failed',reasonCode:analysisFailureCode(e)}),onSettled:()=>deps.renderAll()});
 const observed=new Map();let stopped=false,cancellationToken=0;
 async function idle(signal){
  if(deps.hub.snapshot().state.status!=='running')return;
  await new Promise((resolve,reject)=>{
   let unsubscribe=()=>{},timer;
   const finish=error=>{unsubscribe();clearTimeout(timer);signal.removeEventListener('abort',abort);error?reject(error):resolve();};
   const abort=()=>finish(Object.assign(new Error('보조 분석 취소'),{name:'AbortError'}));
   unsubscribe=deps.hub.subscribe(()=>{if(deps.hub.snapshot().state.status!=='running')finish();});
   timer=setTimeout(()=>finish(Object.assign(new Error('보조 분석 대기 시간 초과'),{code:'ANALYSIS_BUSY_TIMEOUT'})),120000);
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();else if(deps.hub.snapshot().state.status!=='running')finish();
  });
 }
 function queue(index){
  if(stopped||!deps.settings.enabled)return Promise.resolve({status:'cancelled'});
  const key=deps.stateChatKey(),profile=deps.settings.reasonerProfileId,enabled=Boolean(deps.settings.continuityEnabled);
  const chat=deps.getContext().chat||[],record=deps.record();
  if(chat[index]?.is_user||!sourceRp(chat[index])||record?.nonRpOutputIndices?.includes(index))return Promise.resolve({status:'no_source'});
  let user=index-1;while(user>=0&&!chat[user]?.is_user)user--;
  const refs=[...(user>=0&&sourceRp(chat[user])?[messageRef(key,chat,user,deps.fingerprint)]:[]),messageRef(key,chat,index,deps.fingerprint)];
  const stamp=visibilityKey(chat),sourceKey=deps.fingerprint(refs),group=user>=0?user:index;
  let progress=observed.get(key);if(!progress){progress={groups:new Map()};observed.set(key,progress);if(observed.size>16)observed.delete(observed.keys().next().value);}
  progress.groups.set(group,sourceKey);while(progress.groups.size>3)progress.groups.delete(progress.groups.keys().next().value);
  const due=enabled&&progress.groups.size>=3;
  return scheduler.request(async job=>{
   const valid=()=>job.current()&&!stopped&&deps.settings.enabled&&deps.stateChatKey()===key&&deps.settings.reasonerProfileId===profile&&Boolean(deps.settings.continuityEnabled)===enabled&&visibilityKey(deps.getContext().chat||[])===stamp&&validateSourceRefs(refs,{chatRef:key,chat:deps.getContext().chat||[],fingerprint:deps.fingerprint});
   let vault=null,bridge;
   try{
    await idle(job.signal);if(!valid())return {status:'cancelled'};
    const current=deps.record(true),nowChat=deps.getContext().chat;
    if(current.auxiliaryStateV1?.sourceKey===sourceKey)return {status:'already_analyzed'};
    const source=`USER:\n${user>=0?sourceRp(nowChat[user]):''}\nCHARACTER:\n${sourceRp(nowChat[index])}`,sourceText=source.slice(-9000);
    bridge=vaultAnalysisBridge(deps.window);
    try{vault=bridge?.beginAnalysis({outputIndex:index,sourceText,sourceTruncated:source.length>sourceText.length,outputText:String(nowChat[index].mes||''),actorDefinitions:[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[])].map(({name,aliases})=>({name,aliases:aliases||[]}))});}
    catch{report('analysis_vault',{status:'degraded',reasonCode:'VAULT_INPUT_UNAVAILABLE'});}
    if(!due&&!vault)return {status:'waiting'};
    if(!profile||!deps.connectionRequestService){vault&&bridge.failAnalysis?.(vault.token,'PROFILE_UNAVAILABLE');report('auxiliary_usage',{status:'needs_setup',reasonCode:'profile_not_configured'});return {status:'needs_setup'};}
    if(current.auxiliaryStateV1?.retryAfter>Date.now())return {status:'waiting'};
    const repetition=due?repetitionWindow(nowChat,index,deps.settings,current.nonRpOutputIndices||[],deps.fingerprint):null;
    const repeatedRefs=repetition?.refs||[];
    const sourceValid=()=>valid()&&(!repetition||deps.fingerprint(repetitionWindow(deps.getContext().chat,index,deps.settings,deps.record()?.nonRpOutputIndices||[],deps.fingerprint).refs)===deps.fingerprint(repeatedRefs));
    const state=selectActiveContinuity(confirmedContinuity(continuityView(current),{record:current,chatRef:key,chat:nowChat,fingerprint:deps.fingerprint,inherited:Boolean(current.sharedReference||current.legacyCarryReferenceV1)}),sourceText,{opportunity:current.sceneOpportunity});
    const input={source_rp:sourceText,...(due?{active_continuity:state,existing_state_refs:{event:current.eventProfile?{id:'event:current',title:current.eventProfile.title}:null,relationship:{id:'relationship:current',...current.relationshipState}},...(repetition.turns.length>=2?{repetition_context:{turns:repetition.turns}}:{})}:{}),...(vault?{vault_audit:vault.input}:{})};
    const system=[due?REASONER_SYSTEM:'',repetition?.turns.length>=2?REPETITION_SYSTEM:'',vault?.system||'',vault&&due?'Return the continuity arrays, topic_fixation and vault_results in one JSON object. Sections are independent. Do not duplicate vault knowledge into knowledge_updates. Vault card contents are not RP evidence.':''].filter(Boolean).join('\n');
    const request=analysisRequestBudget(deps.requestWithConnectionProfile,{maxRequests:2,totalMs:180000});
    report('analysis_started',{status:'running',inputChars:JSON.stringify(input).length});
    const response=await request(deps.connectionRequestService,profile,system,input,{signal:job.signal,maxTokens:Math.min(4800,(due?2400:800)+(vault?.count||0)*160),timeoutMs:120000});
    await idle(job.signal);if(!sourceValid())return {status:'cancelled'};
    if(vault)await completeVaultAudit({bridge,vault,result:response.result,sourceText,request:(system,input,options)=>request(deps.connectionRequestService,profile,system,input,options),signal:job.signal,valid:sourceValid,idle,report});
    await idle(job.signal);if(!sourceValid())return {status:'cancelled'};
    let malformed=false;
    const saved=await commitSession(key,({current:rec,history})=>{
     if(due){
      const identity={chatKey:key,assistantIndex:index,outputFingerprint:deps.fingerprint(String(nowChat[index].mes||'')),sourceRevision:deps.sourceRevisionKey(rec,deps.selectedWorld(rec))};
      const review=assessRepetition(response.result,repetition,identity);
      if(['ready','balanced','insufficient_history'].includes(review.status))rec.repetitionGuard=review.guard;
      malformed=!['new_items','affected','knowledge_updates','possible_followups'].every(field=>Array.isArray(response.result?.[field]));
      if(!malformed)rec.pendingContinuityCandidates=validateReasonerResult(response.result,{sourceText,continuity:continuityView(rec),sourceIdentity:identity});
      rec.lastContinuityTrace={status:malformed?'error':rec.pendingContinuityCandidates?.length?'pending_jev':'empty',trigger:'periodic',repetitionStatus:review.status,candidates:malformed?[]:(rec.pendingContinuityCandidates||[]).map(c=>({type:c.type,label:c.label}))};
      rec.lastReasonerSource=identity;rec.lastJudgment=null;
     }
     rec.auxiliaryStateV1={...(malformed?{}:{sourceKey}),retryAfter:malformed?Date.now()+30000:0};return {chat:rec,history};
    },sourceValid);
    if(saved&&due){if(!malformed)progress.groups.clear();await deps.clearInjection?.({chatKey:key});}
    report('analysis_result',{status:saved?malformed?'degraded':'succeeded':'deferred',...(malformed?{reasonCode:'CONTINUITY_INVALID_RESPONSE'}:{})});
    return {status:saved?'complete':'cancelled'};
   }catch(error){
    if(!valid()||job.signal.aborted)return {status:'cancelled'};
    const reasonCode=analysisFailureCode(error);vault&&bridge?.failAnalysis?.(vault.token,reasonCode);
    report('analysis_failed',{status:'failed',reasonCode});
    try{await commitSession(key,({current:rec,history})=>{rec.auxiliaryStateV1={retryAfter:Date.now()+30000};rec.lastContinuityTrace={status:'error',error:'보조 분석에 실패했습니다. 기존 판독과 자료는 유지합니다.'};return {chat:rec,history};},valid);}catch{report('analysis_failed',{status:'failed',reasonCode:'AUXILIARY_STORAGE_FAILED'});}
    return {status:'failed',reasonCode};
   }finally{vault&&bridge?.abandonAnalysis?.(vault.token);}
  });
 }
 function observe(index){stopped=false;void queue(index);}
 function cancel(reason){cancellationToken++;scheduler.cancel();observed.clear();if(reason==='generation_stopped')stopped=true;}
 return {observe,queue,cancel,get busy(){return scheduler.pending;},get cancellationToken(){return cancellationToken;},get completion(){return scheduler.completion;}};
}
