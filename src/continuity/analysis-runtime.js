import {deltaRepairInput,DELTA_REPAIR_SYSTEM} from './delta-repair.js';
import {ensureReviewTranslations} from './review-translation.js';
import {analysisRequestBudget} from './request-budget.js';
import {commitCollectedDeltas} from './delta-verification.js';
import {createAnalysisScheduler} from './analysis-scheduler.js';
import {ANALYSIS_LIMITS, normalizeAnalysisRuntime, normalizeAnalysisSettings} from './analysis-contract.js';
import {observeCompletedTurn, observeManualWindow, buildAnalysisWindow, pendingTurnCount, validateSourceRefs, sourceRp, pruneAnalysisRuntime} from './analysis-window.js';
import {analysisContext} from './analysis-context.js';
import {validatedDeltaResponse} from './response-validation.js';
import {createDeltaCommit, invalidateDeltasFrom} from './delta-commit.js';
import {buildDeltaSystem} from './delta-prompts.js';
import {REPETITION_SYSTEM, repetitionWindow, assessRepetition} from './repetition.js';
import {vaultAnalysisBridge} from '../integration/vault-output.js';
import {visibilityKey} from '../context/visibility.js';
import {analysisDiagnostic, analysisFailureCode} from '../debug/analysis-events.js';

export function createAnalysisRuntime(deps) {
 const report=(code,details)=>analysisDiagnostic(deps.noteDiagnostic,code,details);
 const {commitDeltaTransaction}=createDeltaCommit(deps);
 const scheduler=createAnalysisScheduler({onError:error=>report('analysis_failed',{status:'failed',reasonCode:analysisFailureCode(error)}),onSettled:()=>deps.renderAll()});
 let stopped=false,cancellationToken=0;
 const completed=new Map();
 const enabled=()=>deps.settings.enabled&&deps.settings.continuityEnabled;
 async function idle(signal){
  if(deps.hub.snapshot().state.status!=='running')return;
  await new Promise((resolve,reject)=>{
   const done=()=>{unsubscribe();clearTimeout(timer);signal.removeEventListener('abort',abort);resolve();};
   const abort=()=>{unsubscribe();clearTimeout(timer);reject(Object.assign(new Error('분석 준비 대기가 종료됐습니다.'),{name:signal.aborted?'AbortError':'TimeoutError',code:signal.aborted?'ANALYSIS_CANCELLED':'ANALYSIS_BUSY_TIMEOUT'}));};
   const unsubscribe=deps.hub.subscribe(()=>{if(deps.hub.snapshot().state.status!=='running')done();});
   const timer=setTimeout(abort,ANALYSIS_LIMITS.timeoutMs);signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted)abort();else if(deps.hub.snapshot().state.status!=='running')done();
  });
 }
 function queue(outputIndex,{generationType='',manual=false,trigger='periodic'}={}){
  if(stopped||!deps.settings.enabled)return Promise.resolve({status:'cancelled'});
  const key=deps.stateChatKey(),profile=deps.settings.reasonerProfileId;
  const output=deps.getContext().chat[outputIndex];
  if(output&&sourceRp(output))completed.set(key+':'+outputIndex,{key,outputIndex,generationType,hash:deps.fingerprint(String(output.mes||''))});
  const settingsKey=deps.fingerprint([profile,normalizeAnalysisSettings(deps.settings),enabled()]),visibility=visibilityKey(deps.getContext().chat);
  const task=async({signal,current})=>{
   const valid=()=>current()&&!stopped&&visibility===visibilityKey(deps.getContext().chat)&&deps.stateChatKey()===key&&deps.fingerprint([deps.settings.reasonerProfileId,normalizeAnalysisSettings(deps.settings),enabled()])===settingsKey;
   await idle(signal);if(!valid())return {status:'cancelled'};
   let record=deps.record(true);const chat=deps.getContext().chat;
   if(!sourceRp(chat[outputIndex])||(record.nonRpOutputIndices||[]).includes(outputIndex)){report('auxiliary_usage',{status:'not_needed',reasonCode:'no_rp_output'});return {status:'no_source'};}
   const config=normalizeAnalysisSettings(deps.settings);
   const previousRefs=[...(record.analysisJournalV1||[]).flatMap(j=>j.refs||[]),...(record.analysisRuntimeV1?.turnRefs||[]).flatMap(t=>t.refs||[])];
   const changed=previousRefs.filter(ref=>ref.originChatRef===key&&ref.messageIndex===outputIndex&&ref.contentHash!==deps.fingerprint(String(chat[outputIndex].mes||'')));
   if(changed.length){record=structuredClone(record);invalidateDeltasFrom(record,outputIndex,{chatRef:key});}
   let runtime=enabled()?normalizeAnalysisRuntime(record.analysisRuntimeV1):null;
   const observed=[...completed.values()].filter(e=>e.key===key&&e.outputIndex<=outputIndex);
   if(runtime)for(const event of observed){if(event.hash!==deps.fingerprint(String(chat[event.outputIndex]?.mes||''))||(record.nonRpOutputIndices||[]).includes(event.outputIndex))continue;runtime=observeCompletedTurn(runtime,{chatRef:key,chat,outputIndex:event.outputIndex,fingerprint:deps.fingerprint,generationType:event.generationType});}
   if(runtime&&manual)runtime=observeManualWindow(runtime,{chatRef:key,chat,fingerprint:deps.fingerprint,interval:config.interval,excluded:record.nonRpOutputIndices||[]});
   if(runtime)runtime=pruneAnalysisRuntime(runtime,{chat,persona:config.persona,fingerprint:deps.fingerprint});
   const count=runtime?pendingTurnCount(runtime,{chat,persona:config.persona}):0;
   const scene=record.sceneIntimacy;
   let boundary=false;
   if(runtime&&scene&&!scene.error&&scene.confirmation!=='unresolved'){
    if(scene.route==='paused'&&!runtime.openScene){runtime.openScene={startIndex:Math.max(0,scene.contextEndIndex||0),inputKey:scene.inputKey};}
    else if(scene.route!=='paused'&&runtime.openScene){runtime.openScene=null;boundary=true;}
    if(scene.route==='paused'&&runtime.openScene&&!Number.isInteger(runtime.openScene.firstOutputIndex)&&outputIndex>=runtime.openScene.startIndex){runtime.openScene.firstOutputIndex=outputIndex;boundary=true;}
   }
   let due=Boolean(runtime&&(manual||boundary||scene?.route!=='paused'&&(runtime.carryPending||count>=config.interval))&&(manual||Date.now()>=(runtime.retry.notBefore||0)));
   if(runtime){
    runtime.lastRun={...(runtime.lastRun||{}),status:due?'running':runtime.lastRun?.status==='failed'?'failed':'waiting',turnCount:count,interval:config.interval};
    const saved=await commitDeltaTransaction(key,({current,history})=>{if(changed.length)invalidateDeltasFrom(current,outputIndex,{chatRef:key});current.analysisRuntimeV1=runtime;return {chat:current,history};},valid);
    if(!saved)return {status:'cancelled'};
    for(const event of observed)completed.delete(event.key+':'+event.outputIndex);
    deps.renderAll();record=deps.record(true);
   }
   if(!runtime)for(const event of observed)completed.delete(event.key+':'+event.outputIndex);
   const bridge=vaultAnalysisBridge(deps.window);let vault=null;
   try{let userIndex=outputIndex-1;while(userIndex>=0&&!chat[userIndex].is_user)userIndex--;const full=`USER:\n${userIndex>=0?sourceRp(chat[userIndex]):''}\nCHARACTER:\n${sourceRp(chat[outputIndex])}`,text=full.slice(-9000);vault=bridge?.beginAnalysis({outputIndex,sourceText:text,sourceTruncated:full.length>text.length,outputText:String(chat[outputIndex].mes||''),actorDefinitions:[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[])].map(({name,aliases})=>({name,aliases:aliases||[]}))});}catch{report('analysis_vault',{status:'not_needed',reasonCode:'vault_input_unavailable'});}
   try{
   if(!due&&!vault){report('auxiliary_usage',{status:'not_needed',reasonCode:!runtime?'analysis_disabled':scene?.route==='paused'?'scene_end_pending':'interval_pending',turnCount:count});return {status:'waiting'};}
   if(!profile||!deps.connectionRequestService){
    if(vault)bridge.failAnalysis?.(vault.token,'PROFILE_UNAVAILABLE');
    report('auxiliary_usage',{status:'needs_setup',reasonCode:'profile_not_configured'});return {status:'needs_setup'};
   }
   const repetition=due?repetitionWindow(chat,outputIndex,deps.settings,record.nonRpOutputIndices||[],deps.fingerprint):null;
   const extraInput={...(repetition?.turns.length>=2?{repetition_context:{turns:repetition.turns}}:{}),...(vault?{vault_audit:vault.input,source_rp:sourceRp(chat[outputIndex]).slice(-9000)}:{})};
   const contextBudget=ANALYSIS_LIMITS.inputChars-JSON.stringify(extraInput).length-256;
   const window=due?buildAnalysisWindow(runtime,{chatRef:key,chat,fingerprint:deps.fingerprint,persona:config.persona,maxChars:Math.min(ANALYSIS_LIMITS.sourceChars,Math.max(128,contextBudget-2000))}):null;
   let outcome={status:'already_analyzed'};
   if(due&&!window.segments.length){const saved=await commitDeltaTransaction(key,({current,history})=>{const accepted=commitCollectedDeltas(current,history,{chatRef:key,chat:deps.getContext().chat,fingerprint:deps.fingerprint,store:deps.characterStore,enabled:enabled()});const status=accepted.length?'saved':(current.analysisRuntimeV1.pendingBatches||[]).some(b=>b.candidates?.some(c=>['pending','needs_review'].includes(c.status)))?'needs_review':current.analysisRuntimeV1.coverageGaps?.length?'source_unavailable':'already_analyzed';if(accepted.length)current.lastJudgment=null;outcome={status,collected:accepted.length>0};current.analysisRuntimeV1.lastRun={status,turnCount:0};return {chat:current,history};},valid);if(!saved)return {status:'cancelled'};if(outcome.status==='saved')await deps.clearInjection?.({chatKey:key});report('auxiliary_usage',{status:'not_needed',reasonCode:outcome.status});if(!vault)return outcome;due=false;}
   const refs=window?.sourceRefs?.length?window.sourceRefs:[{originChatRef:key,messageIndex:outputIndex,role:'assistant',swipeId:Number(chat[outputIndex].swipe_id)||0,contentHash:deps.fingerprint(String(chat[outputIndex].mes||''))}];
   const sourceValid=()=>valid()&&validateSourceRefs(refs,{chatRef:key,chat:deps.getContext().chat,fingerprint:deps.fingerprint});
   const priorEvolution=deps.fingerprint(record.characterEvolutionV1||null),storeKey=deps.fingerprint([...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[]),deps.characterStore.persona].filter(Boolean).map(a=>[a.id,a.recordBank?.analysisId,a.recordBank?.pagedRecords?.bankId]));
   const started=Date.now(),requestProfile=analysisRequestBudget(deps.requestWithConnectionProfile);
   try{
    const context=due?await analysisContext(record,window,{store:deps.characterStore,selectActiveEntries:deps.selectActiveEntries,name:deps.getContext().name2,userName:deps.getContext().name1,chat,fingerprint:deps.fingerprint,signal,maxInputChars:contextBudget,recentInterval:config.interval,baselineOffset:runtime.baselineProgress?.windowId===window.id?runtime.baselineProgress.offset:0}):null;
    const input={...(context?.input||{}),...extraInput};
    if(JSON.stringify(input).length>ANALYSIS_LIMITS.inputChars)throw Object.assign(new Error('분석 자료 한도'),{code:'ANALYSIS_INPUT_CAPACITY'});
    report('analysis_started',{status:'running',turnCount:window?.turnCount||0,inputChars:JSON.stringify(input).length});
    const system=[due?buildDeltaSystem(repetition?.turns.length>=2?REPETITION_SYSTEM:''):'',vault?.system||'',vault&&due?'Return both protocol sections and vault_results in one JSON object. The vault audit is independent.':''].filter(Boolean).join('\n');
    const response=await requestProfile(deps.connectionRequestService,profile,system,input,{signal,maxTokens:due?ANALYSIS_LIMITS.maxTokens:Math.min(3600,800+vault.count*160),timeoutMs:ANALYSIS_LIMITS.timeoutMs});
    await idle(signal);
    const unchanged=()=>sourceValid()&&deps.fingerprint(deps.record(true).characterEvolutionV1||null)===priorEvolution&&storeKey===deps.fingerprint([...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[]),deps.characterStore.persona].filter(Boolean).map(a=>[a.id,a.recordBank?.analysisId,a.recordBank?.pagedRecords?.bankId]));
    if(!unchanged())return {status:'cancelled'};
    if(due){
     const packet=await validatedDeltaResponse(response,{window,...context,fingerprint:deps.fingerprint},{request:feedback=>requestProfile(deps.connectionRequestService,profile,feedback.mode==='patch'?DELTA_REPAIR_SYSTEM:system+'\nReturn all four required arrays, protocol 1 and coverage. Use supplied IDs and exact quotes. No prose or thought process.',deltaRepairInput(input,feedback),{signal,maxTokens:ANALYSIS_LIMITS.maxTokens,timeoutMs:ANALYSIS_LIMITS.timeoutMs}),valid:unchanged,report});
     await ensureReviewTranslations(packet,{request:(system,translation)=>requestProfile(deps.connectionRequestService,profile,system,translation,{signal,maxTokens:ANALYSIS_LIMITS.maxTokens,timeoutMs:ANALYSIS_LIMITS.timeoutMs}),valid:unchanged,report});
     await idle(signal);if(!unchanged())return {status:'cancelled'};
     if(context.baseline.nextOffset!==null)packet.coverage.evolution='deferred';
     let resultStatus='empty',acceptedCount=0;
     const saved=await commitDeltaTransaction(key,({current,history})=>{
      const next=normalizeAnalysisRuntime(current.analysisRuntimeV1);
      next.baselineProgress=packet.comparison?.missing?{windowId:window.id,offset:context.baseline.offset,total:context.baseline.total,blocked:false}:context.baseline.nextOffset===null?null:{windowId:window.id,offset:context.baseline.nextOffset,total:context.baseline.total,blocked:context.baseline.blocked};
      next.pendingBatches=next.pendingBatches.filter(b=>b.status==='pending'||b.candidates?.some(c=>c.status==='needs_review'));
      const priorBatch=next.pendingBatches.find(b=>b.id===packet.id);
      if(priorBatch){priorBatch.candidates=[...priorBatch.candidates,...packet.candidates.filter(c=>!priorBatch.candidates.some(old=>old.id===c.id))];priorBatch.coverage=packet.coverage;priorBatch.invalid=packet.invalid;}
      else next.pendingBatches.push(packet);
      next.rangeLedger.push({id:window.id,refs:window.sourceRefs,coverage:packet.coverage});
      const partial=Object.values(packet.coverage).includes('deferred');
      next.retry={attempts:partial?(next.retry.attempts||0)+1:0,notBefore:partial?Date.now()+ANALYSIS_LIMITS.retryMs:0,failureClass:partial?'ANALYSIS_PARTIAL':null};next.lastRun={status:packet.candidates.length?'needs_review':partial?'partial':'empty',candidateCount:packet.candidates.length,turnCount:window.turnCount,durationMs:Date.now()-started,baselineCount:context.bases.length,baselineTotal:context.baseline.total,comparison:packet.comparison,translationMissing:packet.translationMissing||0,repairCount:packet.repairCount||0,invalidCount:Object.values(packet.invalid).reduce((n,v)=>n+v,0)};
      for(const section of ['continuity','evolution','persona']){next.sections[section].scannedThrough=window.sourceRefs.at(-1);if(packet.coverage[section]==='complete'&&!packet.candidates.some(c=>c.section===section))next.sections[section].settledThrough=window.sourceRefs.at(-1);}
      const pruned=pruneAnalysisRuntime(next,{chat:deps.getContext().chat,persona:config.persona,fingerprint:deps.fingerprint});
      pruned.carryPending=window.sourceRefs.some(ref=>ref.part?.end<sourceRp(deps.getContext().chat[ref.messageIndex]).length);
      current.analysisRuntimeV1=pruned;
      acceptedCount=commitCollectedDeltas(current,history,{chatRef:key,chat:deps.getContext().chat,fingerprint:deps.fingerprint,store:deps.characterStore,enabled:enabled()}).length;
      resultStatus=partial?'partial':acceptedCount?'saved':packet.candidates.length?'needs_review':'empty';
      current.analysisRuntimeV1.lastRun={...next.lastRun,status:resultStatus,acceptedCount};
      if(acceptedCount)current.lastJudgment=null;
      current.lastContinuityTrace={status:resultStatus,trigger,profileId:profile,candidates:packet.candidates.map(c=>({type:c.type,label:c.data.stateSummary||c.data.label||c.data.summary||c.data.compactRule})),repetitionStatus:repetition?assessRepetition(response.result,repetition,{chatKey:key}).status:'insufficient_history'};
      if(repetition?.turns.length>=2)current.repetitionGuard=assessRepetition(response.result,repetition,{chatKey:key}).guard;
      return {chat:current,history};
     },unchanged);
     if(saved&&acceptedCount)await deps.clearInjection?.({chatKey:key});
     outcome=saved?{status:resultStatus,candidateCount:packet.candidates.length,acceptedCount}:{status:'cancelled'};
     report('analysis_result',{status:saved?'succeeded':'deferred',candidateCount:packet.candidates.length,acceptedCount,turnCount:window.turnCount,baselineCount:context.bases.length,baselineTotal:context.baseline.total,comparison:packet.comparison,translationMissing:packet.translationMissing||0,repairCount:packet.repairCount||0,invalidCount:Object.values(packet.invalid).reduce((n,v)=>n+v,0),durationMs:Date.now()-started});
    }
    if(vault&&bridge.analysisCurrent(vault.token)){
     try{
      let result=response.result;
      const repair=bridge.repairAnalysis?.(vault.token,result);
      if(repair&&sourceValid()){
       try{
        const corrected=await requestProfile(deps.connectionRequestService,profile,repair.system,{vault_audit:repair.input,source_rp:sourceRp(chat[outputIndex]).slice(-9000)},{signal,maxTokens:Math.min(2600,800+repair.cardIds.length*160),timeoutMs:ANALYSIS_LIMITS.timeoutMs});
        await idle(signal);
        if(sourceValid()&&bridge.analysisCurrent(vault.token)&&Array.isArray(corrected.result?.vault_results))result={...result,vault_results:[...(Array.isArray(result?.vault_results)?result.vault_results:[]).filter(item=>!repair.cardIds.includes(item?.card_id)),...corrected.result.vault_results.filter(item=>repair.cardIds.includes(item?.card_id))]};
       }catch(error){if(signal.aborted||!valid())return {status:'cancelled'}; /* Keep valid sections; one repair only. */}
      }
      if(!sourceValid()||!bridge.analysisCurrent(vault.token))return {status:'cancelled'};
      const outcome=await bridge.commitAnalysis(vault.token,result);
      report('analysis_vault',{status:outcome.status||'succeeded'});
     }catch{bridge.failAnalysis?.(vault.token,'VAULT_STORAGE_FAILED');report('analysis_vault',{status:'failed',reasonCode:'VAULT_STORAGE_FAILED'});}
    }
    deps.renderAll();return outcome;
   }catch(error){
    if(signal.aborted||!valid())return {status:'cancelled'};
    const code=analysisFailureCode(error);
    vault&&bridge.failAnalysis?.(vault.token,code);
    if(due){await commitDeltaTransaction(key,({current,history})=>{const next=normalizeAnalysisRuntime(current.analysisRuntimeV1);next.retry={attempts:(next.retry.attempts||0)+1,notBefore:Date.now()+ANALYSIS_LIMITS.retryMs,failureClass:code};next.lastRun={status:'failed',reasonCode:code};current.analysisRuntimeV1=next;return {chat:current,history};},valid);}
    report('analysis_failed',{status:'failed',reasonCode:code});deps.renderAll();return {status:'failed',reasonCode:code};
   }
   }finally{vault&&bridge.abandonAnalysis?.(vault.token);}
  };
  return scheduler.request(async context=>{try{return await task(context);}catch(error){if(context.signal.aborted||!context.current())return {status:'cancelled'};const reasonCode=analysisFailureCode(error);report('analysis_failed',{status:'failed',reasonCode});return {status:'failed',reasonCode};}});
 }
 function observe(outputIndex,options){stopped=false;const key=deps.stateChatKey();void queue(outputIndex,options).then(outcome=>{if(key===deps.stateChatKey())deps.onOutcome?.(outcome);});}
 function cancel(reason){cancellationToken++;scheduler.cancel();completed.clear();if(reason==='generation_stopped')stopped=true;}
 function requestManual(){
  const reject=(status,reasonCode)=>{report('auxiliary_usage',{status:status==='needs_setup'?'needs_setup':'not_needed',reasonCode});return {status};};
  if(!enabled())return reject('disabled','analysis_disabled');
  if(!deps.settings.reasonerProfileId||!deps.connectionRequestService)return reject('needs_setup','profile_not_configured');
  if(scheduler.pending)return reject('busy','analysis_in_progress');
  const chat=deps.getContext().chat||[],excluded=deps.record()?.nonRpOutputIndices||[];
  const index=chat.findLastIndex((m,i)=>!m.is_user&&sourceRp(m)&&!excluded.includes(i));
  if(index<0)return reject('no_source','no_completed_output');
  stopped=false;const completion=queue(index,{manual:true,trigger:'manual'});
  report('analysis_manual',{status:'queued'});deps.renderAll();
  return {status:'accepted',completion};
 }
 function observeBoundary(){if(!enabled())return;const rec=deps.record(),scene=rec?.sceneIntimacy;if(!scene||scene.error||scene.confirmation==='unresolved'||Boolean(rec.analysisRuntimeV1?.openScene)===(scene.route==='paused'))return;const chat=deps.getContext().chat;const index=chat.findLastIndex(m=>!m.is_user&&sourceRp(m));if(index>=0){const key=deps.stateChatKey();void queue(index,{trigger:'boundary'}).then(outcome=>{if(key===deps.stateChatKey())deps.onOutcome?.(outcome);});}}
 async function exclude(id){
  scheduler.cancel();const key=deps.stateChatKey();
  const saved=await commitDeltaTransaction(key,({current,history})=>{
   const entry=current.characterEvolutionV1?.entries.find(e=>e.id===id);if(!entry)return null;
   entry.status='excluded';current.characterEvolutionV1.revision++;
   current.characterEvolutionV1.excludedProposals=[...(current.characterEvolutionV1.excludedProposals||[]),entry.id].slice(-128);
   for(const snapshot of [...history.flatMap(h=>[h.before,h.after]),current.pendingPlan?.stateSnapshot].filter(Boolean)){
    const old=snapshot.characterEvolutionV1?.entries.find(e=>e.id===id);if(old)old.status='excluded';
   }
   current.lastJudgment=null;return {chat:current,history};
  },()=>deps.stateChatKey()===key);if(saved&&key===deps.stateChatKey())await deps.clearInjection?.({chatKey:key});deps.renderAll();return saved;
 }
 function requestTask(task){if(scheduler.pending)return {status:'busy'};stopped=false;const completion=scheduler.request(task);deps.renderAll();return {status:'accepted',completion};}
 return {requestTask,observe,cancel,requestManual,observeBoundary,exclude,queue,get busy(){return scheduler.pending;},get cancellationToken(){return cancellationToken;},get completion(){return scheduler.completion;}};
}
