import assert from 'node:assert/strict';
import {createAnalysisRuntime} from '../src/continuity/analysis-runtime.js';
import {observeCompletedTurn,buildAnalysisWindow,pruneAnalysisRuntime} from '../src/continuity/analysis-window.js';
import {analysisContext} from '../src/continuity/analysis-context.js';
import {commitFrameDeltas} from '../src/continuity/delta-verification.js';
import {buildMemoryStateBlock} from '../src/injection/memory-state.js';
import {stableFingerprint as hash} from '../src/decision/policy.js';
import {validateDeltaPacket} from '../src/continuity/delta-validation.js';
import {bindCharacterPages} from '../src/storage/character-pages.js';
import {pausedCharacterReference} from '../src/injection/paused-character.js';
import {wholeDiagnosticReport} from '../src/debug/whole-report.js';
import {renderEvolutionStatus} from '../src/ui/evolution-status.js';
import {baseRecordRef} from '../src/character/evolution.js';
const reply=persona=>({result:{protocol:1,coverage:{memory:'complete',characters:'complete',persona:persona?'complete':'not_requested'},memory_changes:[],knowledge_changes:[],character_changes:[],deferred_changes:[]}});
function environment(){
 const ctx={chat:[],name2:'Actor'},settings={enabled:true,continuityEnabled:true,continuityInterval:3,collectPersonaChanges:false,reasonerProfileId:'test'},record={continuity:{items:[],knowledge:[],dependencies:[],followups:[],revision:0}},map=new Map([['test',record]]),requests=[],events=[];
 const deps={settings,characterStore:{enabled:false,characters:[],npcs:[],persona:null},window:{},stateChatKey:()=> 'test',getContext:()=>ctx,record:()=>map.get('test'),chatRecords:map,stateHistoryCache:new Map(),queueWrite:(_key,task)=>task(),loadStateHistory:async()=>[],storagePost:async()=>{},fingerprint:hash,renderAll(){},selectActiveEntries:()=>[],hub:{snapshot:()=>({state:{status:'prepared'}}),subscribe:()=>()=>{}},noteDiagnostic:(code,details)=>events.push({code,...details}),connectionRequestService:{},requestWithConnectionProfile:async(_client,_id,system,input,options)=>{requests.push({system,input,options});return reply(settings.collectPersonaChanges);}};
 return {ctx,settings,map,requests,events,deps,analysis:createAnalysisRuntime(deps),async turn(i){ctx.chat.push({is_user:true,mes:'Question '+i},{is_user:false,mes:'Answer '+i});await this.analysis.queue(ctx.chat.length-1,{generationType:'normal'});}};
}
// Paused scenes: inspect the first completed scene output and the exit range;
// ordinary interval does not fan out into an analysis request every few replies.
const scene=environment();scene.map.get('test').sceneIntimacy={route:'paused',contextEndIndex:0,participantIds:[],level:4};
await scene.turn(1);assert.equal(scene.requests.length,1);
for(let i=2;i<=5;i++)await scene.turn(i);
assert.equal(scene.requests.length,1);assert.equal(scene.map.get('test').analysisRuntimeV1.turnRefs.length,4);
scene.map.get('test').sceneIntimacy.route='normal';await scene.analysis.queue(9,{trigger:'boundary'});
assert.equal(scene.requests.length,2);assert.ok(scene.requests[1].input.source_segments.some(s=>s.text==='Answer 2'));assert.ok(scene.requests[1].input.source_segments.some(s=>s.text==='Answer 5'));
// Rapid completed outputs are retained while one detached request is pending.
const rapid=environment();await rapid.turn(1);await rapid.turn(2);let release,started;
rapid.deps.requestWithConnectionProfile=async(...args)=>{rapid.requests.push(args);started=true;await new Promise(r=>release=r);return reply(false);};
rapid.ctx.chat.push({is_user:true,mes:'Question 3'},{is_user:false,mes:'Answer 3'});const job=rapid.analysis.queue(5,{generationType:'normal'});
while(!started)await new Promise(r=>setImmediate(r));
for(let i=4;i<=5;i++){rapid.ctx.chat.push({is_user:true,mes:'Question '+i},{is_user:false,mes:'Answer '+i});void rapid.analysis.queue(rapid.ctx.chat.length-1,{generationType:'normal'});}
release();await job;for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));
assert.equal(rapid.map.get('test').analysisRuntimeV1.turnRefs.length,2);
rapid.deps.requestWithConnectionProfile=async(...args)=>{rapid.requests.push(args);return reply(false);};await rapid.turn(6);assert.equal(rapid.requests.length,2);
// Hidden unprocessed evidence is visibly missing; unhide restores the same range.
const hiddenChat=[{is_user:true,mes:'Question'},{is_user:false,mes:'Hidden unread answer'}];const cfg={chatRef:'test',chat:hiddenChat,outputIndex:1,generationType:'normal',fingerprint:hash};
let hidden=observeCompletedTurn(null,cfg);hiddenChat[1].is_hidden=true;hidden=pruneAnalysisRuntime(hidden,cfg);assert.equal(hidden.turnRefs.length,1);assert.equal(hidden.coverageGaps.length,1);
hiddenChat[1].is_hidden=false;assert.equal(buildAnalysisWindow(hidden,cfg).segments.at(-1).text,'Hidden unread answer');hidden=pruneAnalysisRuntime(hidden,cfg);assert.equal(hidden.coverageGaps.length,0);
// One old hidden gap does not retain every later completed turn and ledger.
let gapRuntime=observeCompletedTurn(null,cfg);hiddenChat[1].is_hidden=true;
for(let n=0;n<40;n++){
 hiddenChat.push({is_user:true,mes:'Later input '+n},{is_user:false,mes:'Later answer '+n});
 gapRuntime=observeCompletedTurn(gapRuntime,{...cfg,outputIndex:hiddenChat.length-1});
 const range=buildAnalysisWindow(gapRuntime,cfg);gapRuntime.rangeLedger.push({refs:range.sourceRefs,coverage:{continuity:'complete',evolution:'complete',persona:'not_requested'}});
 gapRuntime=pruneAnalysisRuntime(gapRuntime,cfg);assert.equal(gapRuntime.turnRefs.length,1);assert.ok(gapRuntime.rangeLedger.length<=1);
}
hiddenChat[1].is_hidden=false;assert.equal(buildAnalysisWindow(gapRuntime,cfg).segments[0].text,'Hidden unread answer');
// Whole comparison context is bounded, retained state is broader than injection.
const compareChat=[{is_user:true,mes:'Earlier input'},{is_user:false,mes:'Earlier answer'},{is_user:true,mes:'Latest input'},{is_user:false,mes:'Latest answer'}];
const win=buildAnalysisWindow(observeCompletedTurn(null,{chatRef:'compare',chat:compareChat,outputIndex:3,generationType:'normal',fingerprint:hash}),{chatRef:'compare',chat:compareChat,fingerprint:hash});
const person={id:'a',name:'Actor',kind:'character'};
const context=await analysisContext({continuity:{items:Array.from({length:14},(_,i)=>({id:String(i),owners:['a'],label:'A remembered fact '+i,lifecycle:'active'})),knowledge:[]}},win,{store:{enabled:true},selectActiveEntries:()=>[person],name:'Actor',chat:compareChat,fingerprint:hash});
assert.equal(context.input.prior_state.items.length,12);assert.equal(context.input.overlap_context.length,2);assert.ok(context.input.overlap_context.every(x=>!x.ref));assert.ok(JSON.stringify(context.input).length<=40000);
const chosen=buildMemoryStateBlock({}, {actors:[person],store:{characters:[person]},selectedContinuity:{items:[]},chosenContinuity:{id:'follow',data:{action:'Return the borrowed key.'}},limit:1000});assert.match(chosen.text,/Return the borrowed key/);
// Capacity cannot partly alter a main-run record or its reversible history.
const proof={originChatRef:'test',messageIndex:1,role:'assistant',swipeId:0,contentHash:hash(hiddenChat[1].mes)};
const proposal={id:'p',type:'memory',status:'pending',section:'continuity',sourceIndex:1,evidence:[{identity:proof,quote:'Hidden unread answer'}],data:{kind:'fact',label:'Confirmed fact',owners:['a'],lifecycle:'active',epistemic:'established',sourceType:'world_fact'}};
const frame={rec:{analysisRuntimeV1:{pendingBatches:[]},continuity:{items:[],knowledge:[]}}},run={history:[{assistantIndex:2,before:{analysisRuntimeV1:{oversized:'x'.repeat(2100000)}},after:{}}]},before=JSON.stringify(frame),historyBefore=JSON.stringify(run);let failed;
assert.deepEqual(commitFrameDeltas(frame,run,[proposal],{continuity_delta_0:{choice:'supported'}},{onFailure:error=>failed=error.code}),[]);assert.equal(failed,'ANALYSIS_CAPACITY');assert.equal(JSON.stringify(frame),before);assert.equal(JSON.stringify(run),historyBefore);
// Vault remains independent: no disabled calls, one shared primary response,
// at most one selective repair, and storage failure leaves memory coverage intact.
function vaultEnvironment({repair=false,fail=false}={}){
 const env=environment();let begun=0,committed=0,abandoned=0;
 env.deps.window.KnowledgeVaultV1={version:'0.1.0',isEnabled:()=>true,beginAnalysis:()=>{begun++;return {token:'t',input:{cards:[]},system:'Vault protocol',count:1};},analysisCurrent:()=>true,repairAnalysis:()=>repair?{system:'Repair vault',input:{},cardIds:['x']}:null,commitAnalysis:async(_token,value)=>{committed++;assert.ok(Array.isArray(value.vault_results));if(fail)throw new Error('Synthetic vault storage failure');return {status:'succeeded'};},abandonAnalysis:()=>abandoned++,failAnalysis(){} };
 env.deps.requestWithConnectionProfile=async(_client,_id,system,input,options)=>{env.requests.push({system,input,options});return {...reply(false),result:{...reply(false).result,vault_results:[]}};};
 return {env,get begun(){return begun;},get committed(){return committed;},get abandoned(){return abandoned;}};
}
const vault=vaultEnvironment();vault.env.deps.window.KnowledgeVaultV1.isEnabled=()=>false;await vault.env.turn(1);assert.equal(vault.begun,0);assert.equal(vault.env.requests.length,0);
vault.env.deps.window.KnowledgeVaultV1.isEnabled=()=>true;await vault.env.turn(2);assert.equal(vault.env.requests.length,1);await vault.env.turn(3);assert.equal(vault.env.requests.length,2);assert.ok(vault.env.requests.at(-1).input.vault_audit);assert.ok(vault.env.requests.at(-1).input.source_segments);assert.equal(vault.begun,vault.abandoned);
const repair=vaultEnvironment({repair:true});await repair.env.turn(1);assert.equal(repair.env.requests.length,2);assert.equal(repair.committed,1);assert.equal(repair.abandoned,1);
const vaultFail=vaultEnvironment({fail:true});for(let i=1;i<=3;i++)await vaultFail.env.turn(i);assert.equal(vaultFail.env.map.get('test').analysisRuntimeV1.lastRun.status,'empty');assert.ok(vaultFail.env.events.some(e=>e.reasonCode==='VAULT_STORAGE_FAILED'));
const saveFail=vaultEnvironment();saveFail.env.deps.storagePost=async()=>{throw new Error('Synthetic transaction failure');};await saveFail.env.turn(1);assert.equal(saveFail.begun,0,'no stranded vault token when initial observation save fails');
// A page read failure only drops the new paused-path change, leaving the old
// intimacy reference usable; no full-bank read or embedding request occurs.
const original={type:'relationship',target:'Actor',rule:'Keeps distance from Actor.',when:['always'],modality:'tendency',basis:'explicit',source_ids:['S001']};
const bank={analysisId:'bank',records:[original],recordIndices:[0],pagedRecords:{bankId:'paged',root:'root'},intimacy_reference:{text:'Established intimacy boundaries.'}},actor={id:'a',name:'Actor',kind:'character',recordBank:bank};
const evo={characterEvolutionV1:{entries:[{id:'change',actorId:'a',status:'active',compactStatus:'fits',baseRef:baseRecordRef(bank,original,0,hash),scope:{targetIds:[]},compactRule:'Keeps trusted distance.',evidenceRefs:[proof]}]}};let pages=0,readFailure=false;
bindCharacterPages(async(_route,payload)=>{pages++;assert.equal(payload.all,false);throw new Error('Synthetic missing page');});
assert.equal(await pausedCharacterReference(actor,evo,{chat:hiddenChat,chatRef:'test',store:{characters:[actor]},actorIds:['a'],fingerprint:hash,onFailure:()=>readFailure=true}),'Established intimacy boundaries.');assert.equal(pages,1);assert.ok(readFailure);
// Persona character changes need actual user-authored evidence, not a claim.
const persona={id:'p',kind:'persona',name:'Player'},pw={...win,persona:true};
const basePacket={protocol:1,coverage:{memory:'complete',characters:'complete',persona:'complete'},memory_changes:[],knowledge_changes:[],deferred_changes:[],character_changes:[{actor_id:'p',target_ids:[],base_ref:null,op:'add_state',state_summary:'Player is tired.',source_type:'world_fact',epistemic:'established',evidence:[{ref:'r1',quote:'Latest answer'}]}]};
const validate=value=>validateDeltaPacket(value,{window:pw,actors:[persona],bases:[],state:{items:[],knowledge:[]},evolution:{entries:[]},fingerprint:hash});
assert.equal(validate(basePacket).candidates.length,0);basePacket.character_changes[0].evidence=[{ref:'r0',quote:'Latest input'}];assert.equal(validate(basePacket).candidates.length,1);
// A second partial-window response merges new proposals instead of silently
// marking their range covered while discarding the new evidence-backed items.
const partial=environment();partial.deps.characterStore={enabled:true,characters:[person],npcs:[]};partial.deps.selectActiveEntries=()=>[person];let batchCall=0;
partial.deps.requestWithConnectionProfile=async(_c,_p,_s,input)=>{batchCall++;return {result:{...reply(false).result,coverage:{memory:batchCall===1?'deferred':'complete',characters:'complete',persona:'not_requested'},memory_changes:[{op:'add',kind:'fact',owners:['a'],target_ids:[],summary:'Actor remembers fact '+batchCall,lifecycle:'active',source_type:'world_fact',epistemic:'established',evidence:[{ref:batchCall===1?'r1':'r3',quote:'Answer '+batchCall}]}]}};};
for(let i=1;i<=3;i++)await partial.turn(i);assert.equal(partial.map.get('test').analysisRuntimeV1.pendingBatches[0].candidates.length,1);
await partial.analysis.queue(5,{manual:true});assert.equal(partial.map.get('test').analysisRuntimeV1.pendingBatches.length,1);assert.equal(partial.map.get('test').analysisRuntimeV1.pendingBatches[0].candidates.length,2);assert.equal(partial.map.get('test').analysisRuntimeV1.turnRefs.length,0);
// Full final wire input, including a large vault card and topic comparison,
// remains bounded and does not read a full source bank.
const combined=vaultEnvironment();combined.env.deps.window.KnowledgeVaultV1.beginAnalysis=()=>({token:'t',input:{card:'v'.repeat(10000)},system:'Vault',count:1});
for(let i=1;i<=3;i++){combined.env.ctx.chat.push({is_user:true,mes:'Question '+i},{is_user:false,mes:'Paragraph '+i+' '+('data '.repeat(1000))});await combined.env.analysis.queue(combined.env.ctx.chat.length-1,{generationType:'normal'});}
assert.ok(combined.env.requests.every(r=>JSON.stringify(r.input).length<=40000));assert.ok(combined.env.requests.at(-1).input.source_segments.length);
// An empty manual memory window must not suppress an independently due vault
// audit, and a failure on that status-only save must still release its token.
const noSource=vaultEnvironment();for(let i=1;i<=3;i++)await noSource.env.turn(i);
const priorCalls=noSource.env.requests.length;await noSource.env.analysis.queue(5,{manual:true});assert.equal(noSource.env.requests.length,priorCalls+1);assert.equal(noSource.begun,noSource.abandoned);
let writes=0;noSource.env.deps.storagePost=async()=>{if(++writes===2)throw new Error('Synthetic empty-window save failure');};await noSource.env.analysis.queue(5,{manual:true});assert.equal(noSource.begun,noSource.abandoned);
// A persisted running flag after stop/reload is never presented as a live job.
const statusNodes=new Map(['sr-analysis-status','sr-evolution-results','sr-analysis-now'].map(id=>[id,{}]));
const statusDoc={getElementById:id=>statusNodes.get(id)},statusRecord={analysisRuntimeV1:{lastRun:{status:'running'}}};
renderEvolutionStatus({document:statusDoc,record:statusRecord,settings:{enabled:true,continuityEnabled:true,reasonerProfileId:'test'},store:{characters:[]},escapeHtml:value=>String(value),analysis:{busy:false}});
assert.match(statusNodes.get('sr-analysis-status').textContent,/중단/);assert.equal(statusNodes.get('sr-analysis-now').disabled,false);
renderEvolutionStatus({document:statusDoc,record:statusRecord,settings:{enabled:true,continuityEnabled:true,reasonerProfileId:'test'},store:{characters:[]},escapeHtml:value=>String(value),analysis:{busy:true}});
assert.match(statusNodes.get('sr-analysis-status').textContent,/별도 분석 중/);assert.equal(statusNodes.get('sr-analysis-now').disabled,true);
// DOM-style numeric exception codes cannot break the one-button debug report.
const numericError=environment();numericError.deps.requestWithConnectionProfile=async()=>{throw new DOMException('Synthetic parser cancellation','AbortError');};
for(let i=1;i<=3;i++)await numericError.turn(i);assert.equal(numericError.map.get('test').analysisRuntimeV1.lastRun.reasonCode,'ANALYSIS_CANCELLED');
assert.doesNotThrow(()=>wholeDiagnosticReport({execution:{},record:{analysisRuntimeV1:{lastRun:{reasonCode:20}}}}));
const busy=environment(),nativeTimer=globalThis.setTimeout;busy.deps.hub.snapshot=()=>({state:{status:'running'}});
globalThis.setTimeout=(fn,_delay,...args)=>nativeTimer(fn,1,...args);
try{await busy.turn(1);}finally{globalThis.setTimeout=nativeTimer;}
assert.equal(busy.requests.length,0);assert.ok(busy.events.some(e=>e.reasonCode==='ANALYSIS_BUSY_TIMEOUT'));
console.log('Analysis boundaries passed: paused entry/exit, rapid outputs, hidden gaps, whole bounded comparison, atomic capacity fallback, independent vault with single repair, failed page read fallback and persona ownership.');
