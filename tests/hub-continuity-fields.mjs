import assert from 'node:assert/strict';
import {auxiliaryFixture,emptyResponse} from './fixtures/auxiliary-runtime.mjs';
import {validateReasonerResult,REASONER_SYSTEM} from '../src/continuity/response.js';
import {continuityView} from '../src/continuity/state-adapter.js';
import {confirmedContinuity,selectActiveContinuity} from '../src/continuity/selection.js';
import {buildContinuityInjection} from '../src/continuity/engine.js';
import {splitCharacterContext} from '../src/injection/character-context.js';
import {parseProfileStates} from '../src/character/state-contract.js';
import {assessRepetition} from '../src/continuity/repetition.js';
import {continuitySourceWindow} from '../src/continuity/source-window.js';
import {messageRef} from '../src/continuity/source-refs.js';
import {codeContinuityCandidates} from '../src/continuity/fallback.js';

const result=patch=>({result:{...emptyResponse().result,...patch}});
const plan={kind:'schedule',label:'Return the spare key',owners:['Porter'],lifecycle:'active',time:'tomorrow noon',summary:'The porter agreed to return the key.',impact:'Mira has not agreed to the time.',source_type:'promise',source_indices:[1]};
const f=auxiliaryFixture();f.context.name1='Mira';
f.deps.requestWithConnectionProfile=async(...args)=>{
    f.requests.push(args);
    assert.match(args[2],/source_indices/);assert.doesNotMatch(args[2],/must include a short verbatim/);
    assert.deepEqual(args[3].source_indices,[0,1,2,3,4,5]);
    return result({new_items:[plan],knowledge_updates:[{character:'Mira',source:'told',summary:'The porter claims the key is ready.',source_type:'claim',source_indices:[1]}]});
};
await f.turn('The porter said he would bring it at noon tomorrow.');await f.turn('She looks at the door.');await f.turn('They wait.');
let rec=f.records.get('room-A'),id=rec.continuity.items[0].id;
assert.equal(rec.lastContinuityTrace.acceptedCount,2);
assert.deepEqual(rec.continuity.items[0].sourceRefs.map(ref=>ref.messageIndex),[1]);
assert.equal(rec.characterState.knowledge[0].sourceType,'claim');
const selection=selectActiveContinuity(continuityView(rec),'She waits.',{actorIds:['Mira']});
assert.equal(selection.items[0].id,id,'off-screen obligation survives without repeated name or phrase');
const split=splitCharacterContext(selection,[{id:'porter',name:'Porter'},{id:'mira',name:'Mira'}]);
assert.match(split.text,/tomorrow noon/);assert.match(split.text,/has not agreed/);
assert.match(split.text,/source type=claim/);assert.doesNotMatch(buildContinuityInjection(split.scene),/Return the spare key/,'macro routing does not duplicate the selected records');
assert.match(buildContinuityInjection(selection),/tomorrow noon/,'unified delivery retains the same material');

// Structured changes preserve optional fields and roll back with their source.
f.deps.requestWithConnectionProfile=async(...args)=>{f.requests.push(args);return result({affected:[{state_id:id,relation:'changed',lifecycle:'active',time:'tomorrow evening',summary:'The delivery was moved to the evening.',impact:null,reason:'The porter changed the time.',source_type:'promise',source_indices:[7]}]});};
await f.turn('The porter moves it to the evening.');await f.turn();await f.turn();rec=f.records.get('room-A');
assert.equal(rec.continuity.items[0].time,'tomorrow evening');assert.equal(rec.continuity.items[0].impact,'');
const visible=()=>confirmedContinuity(continuityView(rec),{record:rec,chatRef:'room-A',chat:f.context.chat,fingerprint:f.deps.fingerprint});
f.context.chat[7].is_hidden=true;assert.equal(visible().items[0].time,'tomorrow noon');assert.match(visible().items[0].impact,/not agreed/);f.context.chat[7].is_hidden=false;
f.context.chat[1].mes='There is no arrangement.';assert.equal(visible().items.length,0);

// No literal-evidence or actor-name semantic veto. Bad IDs remain isolated.
const refs=[{messageIndex:1,role:'assistant'}],identity={outputFingerprint:'fields',assistantIndex:1,refs};
const options={continuity:{items:[{id:'known',label:'Dinner'}]},stateRefs:['known'],sourceIdentity:identity,actors:['Mira']};
const counts={};
const normalized=validateReasonerResult({new_items:[{...plan,source_indices:[999]},{...plan,source_indices:['1'],lifecycle:'Completed',source_type:'promise'}],knowledge_updates:[{character:'Unregistered Porter',source:'Told',summary:'He described the route.',source_type:'claim',source_indices:[1]}],affected:[{state_id:'missing',relation:'changed',source_type:'world_fact',source_indices:[1]}]}, {...options,diagnostics:counts});
assert.equal(normalized.length,2);assert.equal(counts.invalidEvidenceCount,1);assert.equal(counts.invalidStateCount,1);
assert.equal(normalized[0].data.lifecycle,'completed','code does not repeat the model semantic judgment');
assert.equal(normalized[1].data.character,'Unregistered Porter');
assert.equal(validateReasonerResult({new_items:[{...plan,source_indices:undefined,evidence:'A paraphrase, not a quotation.'}]},options).length,1,'legacy response is bound to supplied window, not discarded for paraphrasing');
assert.equal(assessRepetition({topic_fixation:{topic:'Unnecessary detours about the key',output_indices:[1,3]}},{turns:[{output_index:1},{output_index:3}],refs:[]},identity).status,'ready');
assert.equal(assessRepetition({topic_fixation:{topic:'Unnecessary detours',output_indices:[1,99]}},{turns:[{output_index:1},{output_index:3}],refs:[]},identity).status,'invalid_evidence');

// Window slicing cannot authorize a source message whose content was not sent.
const longChat=[{is_user:true,mes:'x'.repeat(1000)},{is_user:false,mes:'UNREAD_SUFFIX'}];
const longRefs=longChat.map((_,index)=>messageRef('room-A',longChat,index,f.deps.fingerprint));
const shortWindow=continuitySourceWindow(new Map([[1,{key:'long',refs:longRefs,offset:0}]]),{chatRef:'room-A',chat:longChat,fingerprint:f.deps.fingerprint,maxChars:100});
assert.deepEqual(shortWindow.sources[0].messageIndices,[0]);
assert.equal(validateReasonerResult({new_items:[plan]},{...options,sourceIdentity:{...identity,refs:longRefs},evidenceSources:shortWindow.sources}).length,0);
const excerpts=codeContinuityCandidates(shortWindow,{identity:{...identity,refs:longRefs},chat:longChat,fingerprint:f.deps.fingerprint});
assert.ok(excerpts.length);assert.ok(!JSON.stringify(excerpts).includes('UNREAD_SUFFIX'));

// Technical model failure uses a local path, not another remote request or a
// fabricated lifecycle update. Normal interpretation never calls this path.
for(const failure of ['network','malformed']) {
    const code=auxiliaryFixture();let calls=0;
    code.deps.requestWithConnectionProfile=async()=>{calls++;if(failure==='network')throw Object.assign(new Error('offline'),{code:'PROFILE_NETWORK_ERROR'});return {result:{unusable:true}};};
    await code.turn('I will return the key tomorrow.');await code.turn('The bridge is blocked, so the delivery must wait.');await code.turn('Mira says she still needs the key.');
    let saved=code.records.get('room-A');
    assert.equal(calls,1);assert.equal(saved.lastContinuityTrace.status,'fallback');assert.ok(saved.continuity.references.length);
    assert.equal(saved.continuity.items.length,0,'an excerpt is not a verified promise/completion');
    const text=buildContinuityInjection(selectActiveContinuity(continuityView(saved),''));assert.match(text,/Uninterpreted RP context/);
    assert.ok(!JSON.stringify(code.events).includes('bridge is blocked'));
    const reference=saved.continuity.references[0];
    const opts={record:saved,chatRef:'room-A',chat:code.context.chat,fingerprint:code.deps.fingerprint};
    code.context.chat[reference.sourceRefs[0].messageIndex].is_hidden=true;
    assert.ok(!confirmedContinuity(continuityView(saved),opts).references.some(item=>item.id===reference.id));
    code.context.chat[reference.sourceRefs[0].messageIndex].is_hidden=false;
    saved.auxiliaryStateV1.retryAfter=0;
    code.deps.requestWithConnectionProfile=async()=>{calls++;return emptyResponse();};
    await code.turn();await code.turn();await code.turn();saved=code.records.get('room-A');
    assert.equal(calls,2);assert.equal(saved.continuity.references.length,0,'successful reread clears provisional context');assert.equal(saved.lastContinuityTrace.status,'empty');
}
const partial=auxiliaryFixture();
partial.deps.requestWithConnectionProfile=async()=>result({new_items:[{...plan,source_indices:[999]}]});
await partial.turn();await partial.turn();await partial.turn();
assert.equal(partial.records.get('room-A').lastContinuityTrace.status,'partial');assert.equal(partial.records.get('room-A').continuity.references?.length||0,0,'invalid item does not invoke a second interpretation');

// Cancellation must not be converted into a fallback write.
const cancelled=auxiliaryFixture();let release;
cancelled.deps.requestWithConnectionProfile=async()=>new Promise((_,reject)=>{release=reject;});
await cancelled.turn();await cancelled.turn();const pending=cancelled.turn();while(!release)await new Promise(resolve=>setImmediate(resolve));
cancelled.analysis.cancel('generation_stopped');release(Object.assign(new Error('cancelled'),{name:'AbortError'}));await pending;
assert.equal(cancelled.records.get('room-A').continuity.references?.length||0,0);

// Independent vault repairs do not delay a completed ordinary continuity save.
const vault=auxiliaryFixture();let repairFinish;
vault.deps.window.KnowledgeVaultV1={version:'0.1.0',isEnabled:()=>true,
    beginAnalysis:({outputIndex})=>outputIndex===5?{token:'t',input:{},system:'VAULT',count:1}:null,
    analysisCurrent:()=>true,repairAnalysis:()=>({system:'REPAIR',input:{},cardIds:['v']}),
    commitAnalysis:async()=>({status:'succeeded'}),abandonAnalysis(){},failAnalysis(){}};
vault.deps.requestWithConnectionProfile=async(...args)=>{
    vault.requests.push(args);
    if(args[2]==='REPAIR')return new Promise(resolve=>{repairFinish=()=>resolve({result:{vault_results:[]}});});
    return result({new_items:[plan]});
};
await vault.turn('The porter promised delivery.');await vault.turn();const vaultRun=vault.turn();
while(!repairFinish)await new Promise(resolve=>setImmediate(resolve));
assert.equal(vault.records.get('room-A').continuity.items.length,1);
assert.equal(vault.records.get('room-A').lastContinuityTrace.status,'verified');repairFinish();await vaultRun;

// One malformed numeric field cannot erase the other collected emotions.
const roster=[{id:'mira',code:'C1',name:'Mira',trackArousal:false}];
const moods=parseProfileStates([{code:'C1',anger:20,joy:0,fear:10.5,sadness:'invalid'}],roster,{completeMoods:true});
assert.equal(moods.states.length,1);assert.deepEqual(moods.states[0].values,{anger:20,joy:0,fear:11});assert.equal(moods.diagnostics.partial,1);
assert.ok(REASONER_SYSTEM.length<4000,'collection instructions remain compact');
console.log('Continuity fields passed: short structured collection, source IDs, causal context, routing, updates/rollback, partial results, local fallback/recovery/cancel and independent mood fields.');
