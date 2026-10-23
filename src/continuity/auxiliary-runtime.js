import {waitForIdle} from '../lifecycle/jobs.js';
import {createAnalysisScheduler} from './analysis-scheduler.js';
import {analysisRequestBudget} from './request-budget.js';
import {validateSourceRefs} from './source-refs.js';
import {COMPACT_CONTRACT,COMPACT_SYSTEM,compactContext,compactValues,readCompactResult,commitCompactContext} from './compact-context.js';
import {completedTurn,pendingTurns,compactSourceInput,turnText} from './turn-source.js';
import {createSessionTransaction} from '../storage/session-transaction.js';
import {vaultAnalysisBridge} from '../integration/vault-output.js';
import {completeVaultAudit} from '../integration/vault-completion.js';
import {visibilityKey} from '../context/visibility.js';
import {analysisDiagnostic,analysisFailureCode} from '../debug/analysis-events.js';
import {analysisFailure,safeAnalysisInfo,recordAnalysisDiagnostic} from './failure.js';

// Completed-turn collection is independent of foreground generation. The Hub
// owns cancellation; this module owns the compact contract and its persisted work.
export function createAuxiliaryRuntime(deps){
    const report=(code,details)=>analysisDiagnostic(deps.noteDiagnostic,code,details);
    const {commitSession}=createSessionTransaction(deps);
    const scheduler=createAnalysisScheduler({onError:error=>report('analysis_failed',{status:'failed',reasonCode:analysisFailureCode(error)}),onSettled:()=>deps.renderAll()});
    const inFlight=new Map();let stopped=false,cancellationToken=0,state=null;
    const idle=signal=>waitForIdle({hub:deps.hub,signal,isBusy:deps.isGenerationBusy});
    const foregroundIdle=()=>deps.hub.snapshot().state.status!=='running'&&!deps.isGenerationBusy?.();
    const sourceOptions=key=>({record:deps.record(),chatRef:key,chat:deps.getContext().chat||[],fingerprint:deps.fingerprint,excluded:deps.record()?.nonRpOutputIndices||[],inherited:Boolean(deps.record()?.sharedReference||deps.record()?.legacyCarryReferenceV1)});
    const safeBridge=(bridge,method,...args)=>{try{return bridge?.[method]?.(...args);}catch{report('analysis_vault',{status:'failed',reasonCode:'VAULT_HOOK_FAILED'});}};
    function schedule(index){
        const empty=status=>({registration:Promise.resolve({status}),completion:Promise.resolve({status})});
        if(stopped||!deps.settings.enabled)return empty('cancelled');
        const key=deps.stateChatKey(),profile=deps.settings.reasonerProfileId,enabled=Boolean(deps.settings.continuityEnabled),epoch=cancellationToken;
        const options=sourceOptions(key),turn=completedTurn(options.chat,index,options);
        if(!turn){report('auxiliary_usage',{status:'not_needed',reasonCode:'no_rp_output'});return empty('no_source');}
        const stamp=visibilityKey(options.chat),scopeKey=JSON.stringify([key,profile,enabled,turn.key,stamp]);
        if(inFlight.has(scopeKey))return inFlight.get(scopeKey);
        const needsCollection=enabled&&pendingTurns(deps.record(),turn,options).some(item=>item.outputIndex<=index);
        if(needsCollection)state={chatKey:key,status:'waiting',outputIndex:index,scopeKey};
        const valid=()=>epoch===cancellationToken&&!stopped&&deps.settings.enabled&&deps.stateChatKey()===key&&deps.settings.reasonerProfileId===profile&&Boolean(deps.settings.continuityEnabled)===enabled&&visibilityKey(deps.getContext().chat||[])===stamp&&validateSourceRefs(turn.refs,sourceOptions(key));
        // Register work before waiting for the model. New completed turns remain
        // distinct and survive reload even while an earlier request is running.
        const registration=needsCollection?(async()=>{
            for(let retry=0;retry<2&&valid();retry++){
                const saved=await commitSession(key,({current:rec,history})=>{
                    rec.auxiliaryStateV1={...rec.auxiliaryStateV1,contract:COMPACT_CONTRACT,pending:{turns:pendingTurns(rec,turn,sourceOptions(key))}};
                    return {chat:rec,history};
                },valid);
                if(saved)return true;
            }
            if(valid())throw Object.assign(new Error('수집할 답변 등록 중 저장 상태가 계속 변경됐습니다.'),{code:'CONTINUITY_REGISTRATION_CHANGED'});
            return false;
        })():Promise.resolve(true);
        // Attach immediately; registration failure is handled by the job below.
        void registration.catch(()=>{});
        const completion=scheduler.request(async job=>{
            let phase='prepare',vault=null,bridge=null,startedAnalysis=false,finished=false;
            let continuityIncluded=enabled,response=null,vaultFinished=false;
            const started=Date.now(),attempt={startedAt:new Date().toISOString(),profileHash:deps.fingerprint(profile),responseReceived:false};
            const current=()=>job.current()&&valid();
            const failVault=code=>vault&&!vaultFinished&&safeBridge(bridge,'failAnalysis',vault.token,code);
            try{
                await registration;await idle(job.signal);if(!current())return {status:'cancelled'};
                const rec=deps.record(true),opts=sourceOptions(key),turns=enabled?pendingTurns(rec,turn,opts):[];
                const previous=compactContext(rec,opts),previousHash=deps.fingerprint(compactValues(previous));
                continuityIncluded=enabled&&(!previous?.processedKeys?.includes(turn.key)||turns.some(item=>item.outputIndex<=turn.outputIndex));
                const vaultSource=Object.values(turnText(turn,opts.chat)).join('\n');
                bridge=vaultAnalysisBridge(deps.window,report);
                try{vault=bridge?.beginAnalysis({outputIndex:index,sourceText:vaultSource.slice(-9000),sourceTruncated:vaultSource.length>9000,outputText:String(opts.chat[index]?.mes||''),actorDefinitions:[...(deps.characterStore.characters||[]),...(deps.characterStore.npcs||[])].map(({name,aliases})=>({name,aliases:aliases||[]}))});}
                catch{report('analysis_vault',{status:'failed',reasonCode:'VAULT_INPUT_UNAVAILABLE'});}
                if(!continuityIncluded&&!vault){report('auxiliary_usage',{status:'not_needed',reasonCode:enabled?'already_analyzed':'analysis_disabled',continuityIncluded:false});return {status:'already_analyzed'};}
                if(continuityIncluded&&rec.auxiliaryStateV1?.retryAfter>Date.now()){
                    report('auxiliary_usage',{status:'waiting',reasonCode:'retry_backoff',continuityIncluded:true,retrySeconds:Math.ceil((rec.auxiliaryStateV1.retryAfter-Date.now())/1000)});
                    if(!vault)return {status:'waiting'};
                    continuityIncluded=false;
                }
                if(!profile||!deps.connectionRequestService)throw Object.assign(new Error('확장 연결 프로필을 선택하고 연결을 확인해 주세요.'),{code:'PROFILE_UNAVAILABLE'});
                const source=continuityIncluded?compactSourceInput(turn,turns,opts.chat):{input:{source_rp:vaultSource.slice(-9000)},covered:[],refs:turn.refs};
                const input={...(continuityIncluded?{previous_context:compactValues(previous)}:{}),...source.input,...(vault?{vault_audit:vault.input}:{})};
                const system=[continuityIncluded?COMPACT_SYSTEM:'',vault?.system||'',vault&&continuityIncluded?'Return current_situation, remaining_effects and vault_results in one JSON object. The sections are independent; do not turn vault content into a continuity fact.':''].filter(Boolean).join('\n');
                const sourceValid=()=>current()&&validateSourceRefs(source.refs,sourceOptions(key))&&deps.fingerprint(compactValues(compactContext(deps.record(),sourceOptions(key))))===previousHash;
                Object.assign(attempt,{inputHash:deps.fingerprint(input),inputChars:JSON.stringify(input).length,groupCount:continuityIncluded?source.covered.length:1,messageCount:source.refs.length,sourceIndices:source.refs.map(ref=>ref.messageIndex),firstMessageIndex:Math.min(...source.refs.map(ref=>ref.messageIndex)),lastMessageIndex:Math.max(...source.refs.map(ref=>ref.messageIndex)),maxTokens:Math.min(3600,1000+(vault?.count||0)*160),timeoutMs:60000,continuityIncluded});
                startedAnalysis=true;if(continuityIncluded)state={chatKey:key,status:'running',outputIndex:index,scopeKey};report('analysis_started',{...attempt,status:'running',phase:'prepare'});
                const request=analysisRequestBudget(deps.requestWithConnectionProfile,{maxRequests:2,totalMs:120000});
                phase='request';
                response=await request(deps.connectionRequestService,profile,system,input,{signal:job.signal,maxTokens:attempt.maxTokens,timeoutMs:attempt.timeoutMs});
                Object.assign(attempt,safeAnalysisInfo(response?.diagnostic),{responseReceived:true});
                phase='response';let review=null,parseFailure=null;
                if(continuityIncluded)try{review=readCompactResult(response?.result);}catch(error){parseFailure=error;}
                await idle(job.signal);if(!sourceValid())return {status:'cancelled'};
                if(review){
                    Object.assign(attempt,{invalidFields:review.invalidFields,updatedFields:Object.keys(review.values)});
                    phase='storage';
                    const failure=review.partial?analysisFailure({code:'CONTINUITY_PARTIAL_RESULT'},'response',attempt):null;
                    const coveredKeys=new Set(source.covered.map(item=>item.key));
                    const saved=await commitSession(key,({current:next,history})=>{
                        commitCompactContext(next,history,review,{refs:source.refs,key:turn.key,outputIndex:index,coveredKeys:[...coveredKeys],turnRefs:turn.refs},previous);
                        const pending=pendingTurns(next,turn,sourceOptions(key)).filter(item=>review.partial||!coveredKeys.has(item.key));
                        next.auxiliaryStateV1={contract:COMPACT_CONTRACT,sourceKey:turn.key,retryAfter:review.partial?Date.now()+30000:0,pending:{turns:pending}};
                        next.lastReasonerSource={refs:turn.refs,assistantIndex:index,outputFingerprint:deps.fingerprint(String(opts.chat[index]?.mes||''))};
                        next.lastContinuityTrace={contract:COMPACT_CONTRACT,mode:'model',groupCount:source.covered.length,status:review.partial?'partial':'verified',trigger:'each_turn',outputIndex:index,acceptedCount:Object.keys(review.values).length,invalidCount:review.invalidFields.length,retryPending:Boolean(pending.length),pendingCount:pending.length,...(failure?{failure,errorCode:failure.code}:{})};
                        // The prior judgment remains the receipt for the prior
                        // request. Its continuity cache key is now stale, so the
                        // next preparation rebuilds it without an orphan alarm.
                        recordAnalysisDiagnostic(next,{...attempt,at:new Date().toISOString(),status:review.partial?'partial':'succeeded',acceptedCount:Object.keys(review.values).length,invalidCount:review.invalidFields.length,persisted:true},failure);
                        return {chat:next,history};
                    },()=>sourceValid()&&foregroundIdle());
                    if(!saved)return {status:'cancelled'};
                    // No request is in progress here. Invalidation is for the next
                    // preparation only; an already sent generation is untouched.
                    finished=true;
                    state={chatKey:key,status:review.partial?'partial':'success',outputIndex:index,scopeKey};
                    report('analysis_result',{...attempt,status:review.partial?'degraded':'succeeded',acceptedCount:Object.keys(review.values).length,invalidCount:review.invalidFields.length,...(failure?{phase:failure.phase,reasonCode:failure.code}:{})});
                }
                // A bad continuity section must not discard valid Vault results.
                if(vault&&current()){await completeVaultAudit({bridge,vault,result:response?.result,sourceText:vaultSource.slice(-9000),request:(system,input,options)=>request(deps.connectionRequestService,profile,system,input,options),signal:job.signal,valid:current,idle,report});vaultFinished=true;}
                if(parseFailure){phase='response';throw parseFailure;}
                return {status:'complete'};
            }catch(error){
                if(!current()||job.signal.aborted)return {status:'cancelled'};
                Object.assign(attempt,safeAnalysisInfo(error?.diagnostic));
                const failure=analysisFailure(error,phase,attempt);failVault(failure.code);finished=true;
                if(continuityIncluded)state={chatKey:key,status:'failed',outputIndex:index,scopeKey};
                report(continuityIncluded?'analysis_failed':'analysis_vault',{...failure,continuityIncluded,status:'failed',reasonCode:failure.code});
                if(continuityIncluded){
                    const remember=(next,persisted)=>{
                        next.lastContinuityTrace={contract:COMPACT_CONTRACT,status:'error',trigger:'each_turn',outputIndex:index,retryPending:true,errorCode:failure.code,failure};
                        recordAnalysisDiagnostic(next,{...attempt,at:new Date().toISOString(),status:'failed',persisted},failure);
                    };
                    try{
                        await idle(job.signal);
                        await commitSession(key,({current:next,history})=>{next.auxiliaryStateV1={...next.auxiliaryStateV1,contract:COMPACT_CONTRACT,retryAfter:Date.now()+30000,pending:{turns:pendingTurns(next,turn,sourceOptions(key))}};remember(next,true);return {chat:next,history};},()=>current()&&foregroundIdle());
                    }catch(storageError){
                        if(current()){const next=deps.chatRecords.get(key);if(next){remember(next,false);next.lastContinuityTrace.diagnosticWriteFailure=analysisFailure(storageError,'storage');}}
                        report('analysis_failed',{...analysisFailure(storageError,'storage'),status:'failed',reasonCode:'AUXILIARY_STORAGE_FAILED',continuityIncluded:true});
                    }
                }
                return {status:'failed',reasonCode:failure.code};
            }finally{
                if(startedAnalysis&&!finished&&deps.stateChatKey()===key){if(continuityIncluded&&state?.scopeKey===scopeKey)state={chatKey:key,status:'cancelled',outputIndex:index,scopeKey};report('analysis_cancelled',{...attempt,status:'cancelled',phase,continuityIncluded,reasonCode:'ANALYSIS_CANCELLED'});}
                if(vault)safeBridge(bridge,'abandonAnalysis',vault.token);
            }
        });
        const entry={registration,completion};inFlight.set(scopeKey,entry);
        void completion.finally(()=>{if(inFlight.get(scopeKey)===entry)inFlight.delete(scopeKey);});
        return entry;
    }
    function queue(index){return schedule(index).completion;}
    function observe(index){stopped=false;return schedule(index).registration;}
    function resume(){
        stopped=false;const rec=deps.record();
        if(!deps.settings.continuityEnabled||(!rec?.auxiliaryStateV1?.pending&&!rec?.continuity?.context))return Promise.resolve();
        const chat=deps.getContext().chat||[];let index=chat.length-1;
        while(index>=0&&!completedTurn(chat,index,sourceOptions(deps.stateChatKey())))index--;
        return index>=0?observe(index):Promise.resolve();
    }
    function cancel(reason){cancellationToken++;scheduler.cancel();inFlight.clear();if(state)state={...state,status:'cancelled'};if(reason==='generation_stopped')stopped=true;}
    return {observe,queue,resume,cancel,get state(){return state?{...state}:null;},get busy(){return scheduler.pending;},get cancellationToken(){return cancellationToken;},get completion(){return scheduler.completion;}};
}
