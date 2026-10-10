import {createAnalysisScheduler} from './analysis-scheduler.js';
import {ANALYSIS_LIMITS,normalizeAnalysisRuntime,normalizeAnalysisSettings} from './analysis-contract.js';
import {observeCompletedTurn,buildAnalysisWindow,pendingTurnCount,validateSourceRefs,sourceRp,pruneAnalysisRuntime} from './analysis-window.js';
import {analysisContext} from './analysis-context.js';
import {validateDeltaPacket} from './delta-validation.js';
import {createDeltaCommit,invalidateDeltasFrom} from './delta-commit.js';
import {buildDeltaSystem} from './delta-prompts.js';
import {REPETITION_SYSTEM,repetitionWindow,assessRepetition} from './repetition.js';
import {vaultAnalysisBridge} from '../integration/vault-output.js';
import {analysisDiagnostic,analysisFailureCode} from '../debug/analysis-events.js';

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
  if(stopped||!deps.settings.enabled)return Promise.resolve();
  const key=deps.stateChatKey(),profile=deps.settings.reasonerProfileId;
  const output=deps.getContext().chat[outputIndex];
  if(output&&sourceRp(output))completed.set(key+':'+outputIndex,{key,outputIndex,generationType,hash:deps.fingerprint(String(output.mes||''))});
  const settingsKey=deps.fingerprint([profile,normalizeAnalysisSettings(deps.settings),enabled()]);
  return scheduler.request(async({signal,current})=>{
   const valid=()=>current()&&!stopped&&deps.stateChatKey()===key&&deps.fingerprint([deps.settings.reasonerProfileId,normalizeAnalysisSettings(deps.settings),enabled()])===settingsKey;
   await idle(signal);if(!valid())return;
   let record=deps.record(true);const chat=deps.getContext().chat;
   if(!sourceRp(chat[outputIndex])||(record.nonRpOutputIndices||[]).includes(outputIndex))return;
   const config=normalizeAnalysisSettings(deps.settings);
   const previousRefs=[...(record.analysisJournalV1||[]).flatMap(j=>j.refs||[]),...(record.analysisRuntimeV1?.turnRefs||[]).flatMap(t=>t.refs||[])];
   const changed=previousRefs.filter(ref=>ref.originChatRef===key&&ref.messageIndex===outputIndex&&ref.contentHash!==deps.fingerprint(String(chat[outputIndex].mes||'')));
   if(changed.length){record=structuredClone(record);invalidateDeltasFrom(record,outputIndex,{chatRef:key});}
   let runtime=enabled()?normalizeAnalysisRuntime(record.analysisRuntimeV1):null;
   const observed=[...completed.values()].filter(e=>e.key===key&&e.outputIndex<=outputIndex);
   if(runtime)for(const event of observed){if(event.hash!==deps.fingerprint(String(chat[event.outputIndex]?.mes||''))||(record.nonRpOutputIndices||[]).includes(event.outputIndex))continue;runtime=observeCompletedTurn(runtime,{chatRef:key,chat,outputIndex:event.outputIndex,fingerprint:deps.fingerprint,generationType:event.generationType});}
   if(runtime)runtime=pruneAnalysisRuntime(runtime,{chat,persona:config.persona,fingerprint:deps.fingerprint});
   const count=runtime?pendingTurnCount(runtime,{chat,persona:config.persona}):0;
   const scene=record.sceneIntimacy;
   let boundary=false;
   if(runtime&&scene&&!scene.error&&scene.confirmation!=='unresolved'){
    if(scene.route==='paused'&&!runtime.openScene){runtime.openScene={startIndex:Math.max(0,scene.contextEndIndex||0),inputKey:scene.inputKey};}
    else if(scene.route!=='paused'&&runtime.openScene){runtime.openScene=null;boundary=true;}
    if(scene.route==='paused'&&runtime.openScene&&!Number.isInteger(runtime.openScene.firstOutputIndex)&&outputIndex>=runtime.openScene.startIndex){runtime.openScene.firstOutputIndex=outputIndex;boundary=true;}
   }
   let due=Boolean(runtime&&(manual||boundary||trigger==='topic_fixation'||scene?.route!=='paused'&&(runtime.carryPending||count>=config.interval))&&(manual||Date.now()>=(runtime.retry.notBefore||0)));
   if(runtime){
    runtime.lastRun={...(runtime.lastRun||{}),status:due?'running':runtime.lastRun?.status==='failed'?'failed':'waiting',turnCount:count,interval:config.interval};
    const saved=await commitDeltaTransaction(key,({current,history})=>{if(changed.length)invalidateDeltasFrom(current,outputIndex,{chatRef:key});current.analysisRuntimeV1=runtime;return {chat:current,history};},valid);
    if(!saved)return;
    for(const event of observed)completed.delete(event.key+':'+event.outputIndex);
    deps.renderAll();record=deps.record(true);
   }
   if(!runtime)for(const event of observed)completed.delete(event.key+':'+event.outputIndex);
   const bridge=vaultAnalysisBridge(deps.window);let vault=null;
   try{let userIndex=outputIndex-1;while(userIndex>=0&&!chat[userIndex].is_user)userIndex--;const full=`USER:\n${userIndex>=0?sourceRp(chat[userIndex]):''}\nCHARACTER:\n${sourceRp(chat[outputIndex])}`,text=full.slice(-9000);vault=bridge?.beginAnalysis({outputIndex,sourceText:text,sourceTruncated:full.length>text.length,outputText:String(chat[outputIndex].mes||''),actorDefinitions:[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[])].map(({name,aliases})=>({name,aliases:aliases||[]}))});}catch{report('analysis_vault',{status:'not_needed',reasonCode:'vault_input_unavailable'});}
   try{
   if(!due&&!vault)return;
   if(!profile||!deps.connectionRequestService){
    if(vault)bridge.failAnalysis?.(vault.token,'PROFILE_UNAVAILABLE');
    report('auxiliary_usage',{status:'needs_setup',reasonCode:'profile_not_configured'});return;
   }
   const repetition=due?repetitionWindow(chat,outputIndex,deps.settings,record.nonRpOutputIndices||[],deps.fingerprint):null;
   const extraInput={...(repetition?.turns.length>=2?{repetition_context:{turns:repetition.turns}}:{}),...(vault?{vault_audit:vault.input,source_rp:sourceRp(chat[outputIndex]).slice(-9000)}:{})};
   const contextBudget=ANALYSIS_LIMITS.inputChars-JSON.stringify(extraInput).length-256;
   const window=due?buildAnalysisWindow(runtime,{chatRef:key,chat,fingerprint:deps.fingerprint,persona:config.persona,maxChars:Math.min(ANALYSIS_LIMITS.sourceChars,Math.max(128,contextBudget-2000))}):null;
   if(due&&!window.segments.length){await commitDeltaTransaction(key,({current,history})=>{current.analysisRuntimeV1.lastRun={status:(current.analysisRuntimeV1.pendingBatches||[]).some(b=>b.candidates?.some(c=>c.status==='pending'))?'pending_jev':'empty',turnCount:0};return {chat:current,history};},valid);if(!vault)return;due=false;}
   const refs=window?.sourceRefs?.length?window.sourceRefs:[{originChatRef:key,messageIndex:outputIndex,role:'assistant',swipeId:Number(chat[outputIndex].swipe_id)||0,contentHash:deps.fingerprint(String(chat[outputIndex].mes||''))}];
   const sourceValid=()=>valid()&&validateSourceRefs(refs,{chatRef:key,chat:deps.getContext().chat,fingerprint:deps.fingerprint});
   const priorEvolution=deps.fingerprint(record.characterEvolutionV1||null),storeKey=deps.fingerprint([...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[]),deps.characterStore.persona].filter(Boolean).map(a=>[a.id,a.recordBank?.analysisId,a.recordBank?.pagedRecords?.bankId]));
   const started=Date.now();
   try{
    const context=due?await analysisContext(record,window,{store:deps.characterStore,selectActiveEntries:deps.selectActiveEntries,name:deps.getContext().name2,chat,fingerprint:deps.fingerprint,signal,maxInputChars:contextBudget}):null;
    const input={...(context?.input||{}),...extraInput};
    if(JSON.stringify(input).length>ANALYSIS_LIMITS.inputChars)throw Object.assign(new Error('분석 자료 한도'),{code:'ANALYSIS_INPUT_CAPACITY'});
    report('analysis_started',{status:'running',turnCount:window?.turnCount||0,inputChars:JSON.stringify(input).length});
    const system=[due?buildDeltaSystem(repetition?.turns.length>=2?REPETITION_SYSTEM:''):'',vault?.system||'',vault&&due?'Return both protocol sections and vault_results in one JSON object. The vault audit is independent.':''].filter(Boolean).join('\n');
    const response=await deps.requestWithConnectionProfile(deps.connectionRequestService,profile,system,input,{signal,maxTokens:due?ANALYSIS_LIMITS.maxTokens:Math.min(3600,800+vault.count*160),timeoutMs:ANALYSIS_LIMITS.timeoutMs});
    await idle(signal);
    const unchanged=()=>sourceValid()&&deps.fingerprint(deps.record(true).characterEvolutionV1||null)===priorEvolution&&storeKey===deps.fingerprint([...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[]),deps.characterStore.persona].filter(Boolean).map(a=>[a.id,a.recordBank?.analysisId,a.recordBank?.pagedRecords?.bankId]));
    if(!unchanged())return;
    if(due){
     const packet=validateDeltaPacket(response.result,{window,...context,fingerprint:deps.fingerprint});
     const saved=await commitDeltaTransaction(key,({current,history})=>{
      const next=normalizeAnalysisRuntime(current.analysisRuntimeV1);
      next.pendingBatches=next.pendingBatches.filter(b=>b.status==='pending'||b.candidates?.some(c=>c.status==='needs_review'));
      const priorBatch=next.pendingBatches.find(b=>b.id===packet.id);
      if(priorBatch){priorBatch.candidates=[...priorBatch.candidates,...packet.candidates.filter(c=>!priorBatch.candidates.some(old=>old.id===c.id))];priorBatch.coverage=packet.coverage;priorBatch.invalid=packet.invalid;}
      else next.pendingBatches.push(packet);
      next.rangeLedger.push({id:window.id,refs:window.sourceRefs,coverage:packet.coverage});
      const partial=Object.values(packet.coverage).includes('deferred');
      next.retry={attempts:partial?(next.retry.attempts||0)+1:0,notBefore:partial?Date.now()+ANALYSIS_LIMITS.retryMs:0,failureClass:partial?'ANALYSIS_PARTIAL':null};next.lastRun={status:packet.candidates.length?'pending_jev':partial?'partial':'empty',candidateCount:packet.candidates.length,turnCount:window.turnCount,durationMs:Date.now()-started};
      for(const section of ['continuity','evolution','persona']){next.sections[section].scannedThrough=window.sourceRefs.at(-1);if(packet.coverage[section]==='complete'&&!packet.candidates.some(c=>c.section===section))next.sections[section].settledThrough=window.sourceRefs.at(-1);}
      const pruned=pruneAnalysisRuntime(next,{chat:deps.getContext().chat,persona:config.persona,fingerprint:deps.fingerprint});
      pruned.carryPending=window.sourceRefs.some(ref=>ref.part?.end<sourceRp(deps.getContext().chat[ref.messageIndex]).length);
      current.analysisRuntimeV1=pruned;
      current.lastContinuityTrace={status:next.lastRun.status,trigger,profileId:profile,candidates:packet.candidates.map(c=>({type:c.type,label:c.data.stateSummary||c.data.label||c.data.summary||c.data.compactRule})),repetitionStatus:repetition?assessRepetition(response.result,repetition,{chatKey:key}).status:'insufficient_history'};
      if(repetition?.turns.length>=2)current.repetitionGuard=assessRepetition(response.result,repetition,{chatKey:key}).guard;
      return {chat:current,history};
     },unchanged);
     report('analysis_result',{status:saved?'succeeded':'deferred',candidateCount:packet.candidates.length,durationMs:Date.now()-started});
    }
    if(vault&&bridge.analysisCurrent(vault.token)){
     try{
      let result=response.result;
      const repair=bridge.repairAnalysis?.(vault.token,result);
      if(repair&&sourceValid()){
       try{
        const corrected=await deps.requestWithConnectionProfile(deps.connectionRequestService,profile,repair.system,{vault_audit:repair.input,source_rp:sourceRp(chat[outputIndex]).slice(-9000)},{signal,maxTokens:Math.min(2600,800+repair.cardIds.length*160),timeoutMs:ANALYSIS_LIMITS.timeoutMs});
        await idle(signal);
        if(sourceValid()&&bridge.analysisCurrent(vault.token)&&Array.isArray(corrected.result?.vault_results))result={...result,vault_results:[...(Array.isArray(result?.vault_results)?result.vault_results:[]).filter(item=>!repair.cardIds.includes(item?.card_id)),...corrected.result.vault_results.filter(item=>repair.cardIds.includes(item?.card_id))]};
       }catch(error){if(signal.aborted||!valid())return; /* Keep valid sections; one repair only. */}
      }
      if(!sourceValid()||!bridge.analysisCurrent(vault.token))return;
      const outcome=await bridge.commitAnalysis(vault.token,result);
      report('analysis_vault',{status:outcome.status||'succeeded'});
     }catch{bridge.failAnalysis?.(vault.token,'VAULT_STORAGE_FAILED');report('analysis_vault',{status:'failed',reasonCode:'VAULT_STORAGE_FAILED'});}
    }
    deps.renderAll();
   }catch(error){
    if(signal.aborted||!valid())return;
    const code=analysisFailureCode(error);
    vault&&bridge.failAnalysis?.(vault.token,code);
    if(due){await commitDeltaTransaction(key,({current,history})=>{const next=normalizeAnalysisRuntime(current.analysisRuntimeV1);next.retry={attempts:(next.retry.attempts||0)+1,notBefore:Date.now()+ANALYSIS_LIMITS.retryMs,failureClass:code};next.lastRun={status:'failed',reasonCode:code};current.analysisRuntimeV1=next;return {chat:current,history};},valid);}
    report('analysis_failed',{status:'failed',reasonCode:code});deps.renderAll();
   }
   }finally{vault&&bridge.abandonAnalysis?.(vault.token);}
  });
 }
 function observe(outputIndex,options){stopped=false;void queue(outputIndex,options);}
 function cancel(reason){cancellationToken++;scheduler.cancel();completed.clear();if(reason==='generation_stopped')stopped=true;}
 function requestManual(){if(!enabled())return;stopped=false;const chat=deps.getContext().chat;const index=chat.findLastIndex(m=>!m.is_user&&sourceRp(m));if(index>=0)void queue(index,{manual:true,trigger:'manual'});}
 function observeBoundary(){if(!enabled())return;const rec=deps.record(),scene=rec?.sceneIntimacy;if(!scene||scene.error||scene.confirmation==='unresolved'||Boolean(rec.analysisRuntimeV1?.openScene)===(scene.route==='paused'))return;const chat=deps.getContext().chat;const index=chat.findLastIndex(m=>!m.is_user&&sourceRp(m));if(index>=0)void queue(index,{trigger:'boundary'});}
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
  },()=>deps.stateChatKey()===key);if(saved&&key===deps.stateChatKey())await deps.clearInjection?.({chatKey:key});deps.renderAll();
 }
 return {observe,cancel,requestManual,observeBoundary,exclude,queue,get busy(){return scheduler.busy;},get cancellationToken(){return cancellationToken;},get completion(){return scheduler.completion;}};
}
