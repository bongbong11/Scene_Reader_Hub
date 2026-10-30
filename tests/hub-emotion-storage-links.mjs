import assert from 'node:assert/strict';
import {createEmotionRuntime} from '../src/character/emotion-runtime.js';
import {storeStateEvent,latestStateForChat,latestStateEventForChat,selectedStateSwipe} from '../src/character/state-contract.js';
import {createInjectionWriter} from '../src/injection/writer.js';
import {createPresetRequest} from '../src/injection/preset-request.js';
import {PRESET_ENTRIES,entryText} from '../src/injection/preset-entry-contract.js';
import {stateRoster} from '../src/character/state-collector.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const success={states:[{id:'m',coverageVersion:2,values:{anger:0,joy:10,fear:0,sadness:0,shame:0,interest:20}}],diagnostics:{actors:[]}};
function fixture(){
 const rec={preferences:{profileEmotionJudgment:true},characterStateEvents:[]},chat=[{is_user:false,mes:'Morgan answers.',swipe_id:0}],requests=[],stored=[];
 let busy=false,notify=()=>{},room='room';
 const deps={settings:{enabled:true,reasonerProfileId:'test'},characterStore:{enabled:true,characters:[{id:'m',kind:'character',name:'Morgan'}],npcs:[]},connectionRequestService:{},
 stateChatKey:()=>room,getContext:()=>({chat}),record:()=>rec,stableFingerprint:JSON.stringify,selectedStateSwipe,
 stateCollectorMode:()=> 'profile-output',pendingProfileStateRequests:new Map(),profileStateSequence:0,
 collectProfileOutputState:()=>new Promise(resolve=>requests.push(resolve)),waitForOutputChanges:async()=>{},isGenerationBusy:()=>false,
 hub:{snapshot:()=>({state:{status:busy?'running':'prepared'}}),subscribe:fn=>(notify=fn,()=>{})},noteDiagnostic(){},notifySceneReaderToast(){},
 storeStateEvent,latestStateForChat,latestStateEventForChat,stateRoster,renderCharacterTurnResults(){},renderAll(){},persistChat:async(_key,value=rec)=>{stored.push(structuredClone(value));}};
 const runtime=createEmotionRuntime(deps);
 const start=(missingOnly=false)=>runtime.scheduleProfileStateCollection({chatKey:room,outputIndex:0,text:chat[0].mes,roster:[{id:'m',code:'C0',name:'Morgan',trackArousal:false,coverageVersion:2}],missingOnly});
 return {deps,rec,chat,requests,stored,start,manual:runtime.collectCurrentEmotion,busy(value){busy=value;notify();},room(value){room=value;}};
}
{
 const f=fixture();f.busy(true);let released=false;
 const manual=f.manual().then(()=>released=true);await tick();
 f.requests[0]({states:[],error:'timeout'});await manual;
 assert.equal(released,true);assert.equal(f.stored.length,0,'manual failure releases the button before safe background persistence');
 const task=[...f.deps.pendingProfileStateRequests.values()][0];assert.equal(task.retryable,true);
 f.busy(false);await task;assert.equal(f.stored.at(-1).characterStateCapture.status,'timeout');
}
for(const error of ['timeout','request','format','unavailable','too_long']){
 const f=fixture(),task=f.start();f.stored.push(structuredClone(f.rec));
 f.requests[0]({states:[],error,errorKind:'SYNTHETIC_FAILURE'});await task;
 assert.equal(f.stored.at(-1).characterStateCapture.status,error,'failure replaces a previously saved collecting status');
 assert.equal(f.deps.pendingProfileStateRequests.size,0);
}
{
 const f=fixture();let release;const originalSave=f.deps.persistChat;
 f.deps.persistChat=async(...args)=>{await originalSave(...args);await new Promise(resolve=>release=resolve);};
 const task=f.start();f.requests[0](success);await tick();
 assert.equal(task.saving,true);assert.equal(f.rec.characterStateCapture.status,'collected');
 await originalSave();release();await task;
 assert.ok(f.stored.every(rec=>rec.characterStateCapture.status==='collected'),'overlapping normal saves never restore collecting');
 assert.equal(f.rec.characterStateEvents[0].states[0].values.interest,20);
}
{
 const f=fixture();f.busy(true);const old=f.start();f.requests[0]({states:[],error:'timeout'});await tick();
 assert.equal(f.rec.characterStateCapture.status,'timeout');assert.equal(old.retryable,true);assert.equal(f.stored.length,0);
 const retry=f.start(true);assert.notEqual(retry,old);assert.equal(f.requests.length,2,'only an explicit retry starts the second request');
 f.requests[1](success);f.busy(false);await Promise.all([old,retry]);
 assert.equal(f.rec.characterStateCapture.status,'collected');assert.equal(f.stored.at(-1).characterStateCapture.status,'collected');
 assert.equal(f.stored.length,1,'the old failed request cannot overwrite its replacement');
}
{
 const f=fixture();storeStateEvent(f.rec,{outputIndex:0,swipeId:0,fingerprint:JSON.stringify(f.chat[0].mes),states:[{id:'m',coverageVersion:2,values:{joy:42}}],capture:{participantIds:['m']}});
 const task=f.start(true);f.requests[0]({states:[],error:'timeout'});await task;
 assert.equal(f.stored.at(-1).characterStateEvents[0].states[0].values.joy,42,'failed missing-only repair keeps independently collected values');
}
for(const changed of ['room','edit','cancel']){
 const f=fixture();f.busy(true);const task=f.start();f.requests[0]({states:[],error:'timeout'});await tick();
 if(changed==='room')f.room('other');else if(changed==='edit')f.chat[0].mes='Edited reply.';else task.cancel();
 f.busy(false);await task;assert.equal(f.stored.length,0,'stale failure completion cannot save over a new source');
}

// Use the real writer and final transport, including late basic-slot toggles.
let combinations=0;
for(const collector of ['main-output','profile-output'])for(const character of ['depth','weave','entry'])for(const basic of ['on','off','late-off'])for(const paused of [false,true]){
 let chatKey='room';
 const handlers={},sent=[],prompts=Object.entries(PRESET_ENTRIES).map(([kind,spec])=>({...spec,content:entryText(kind),enabled:kind!=='scene'||basic!=='off'}));
 const ctx={mainApi:'openai',name1:'User',name2:'Morgan',chat:[],extensionPrompts:{},chatCompletionSettings:{n:1},macros:{register:(name,value)=>handlers[name]=value.handler}};
 const rec={preferences:{},lastJudgment:{payload:'BASE_ONLY\nPERSON',sourceKey:'same',characterDelivery:{version:1,scenePayload:'BASE_ONLY',text:'PERSON'},characterTrace:[{id:'m',presence:'active'}],sceneIntimacy:{route:paused?'paused':'normal'}}};
 const store={enabled:true,characters:[{id:'m',kind:'character',name:'Morgan'}],npcs:[]};
 const preset=()=>({key:'A',scene:'entry',world:'depth',character,preset:{prompts}});
 const deps={settings:{enabled:true},characterStore:store,record:()=>rec,stateChatKey:()=>chatKey,selectedWorld:()=>null,getContext:()=>ctx,sourceRevisionKey:()=> 'same',
 placement:{read:preset},stateRoster,STATE_COLLECTOR_MODE:collector,isStreamingEnabled:()=>false,mainOutputStatePrompt:()=> 'COLLECT_ONLY',injectionWrite:Promise.resolve(),
 INJECT_KEY:'scene',WORLD_INJECT_KEY:'world',STATE_CAPTURE_KEY:'capture',setExtensionPrompt:async(key,value)=>{ctx.extensionPrompts[key]=value;},document:{getElementById:()=>null},activeGenerationCycle:{},hub:{report(){}}};
 const transport={fetch:async(_url,options)=>{sent.push(JSON.parse(options.body));return {ok:true};}};
 const adapter=createPresetRequest({window:transport,getContext:()=>ctx,getCycle:()=>deps.activeGenerationCycle,getChatKey:()=>chatKey,isEnabled:()=>true,
 isCharacterMacroEnabled:()=>character==='weave',getPreset:()=>({key:'A',prompts}),loadHost:async()=>({}),report(){},verifyRequest(){}});
 await adapter.init();await createInjectionWriter(deps).applyStoredInjection();adapter.start('normal');
 const body={type:'normal',messages:[...Object.values(ctx.extensionPrompts).filter(Boolean).map(content=>({role:'system',content})),
 ...['scene-reader-hub','scene-reader-hub-world','scene-reader-hub-character','scene-reader-character'].map(name=>({role:'system',content:handlers[name]?.()||''})),{role:'user',content:'USER_UNCHANGED'}]};
 adapter.observeAssembly({prompt:body.messages});if(basic==='late-off')prompts[0].enabled=false;
 adapter.observeRequest(body);
 async function sendOpenAIRequest(){return transport.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});}
 async function sendGenerationRequest(){return sendOpenAIRequest();}
 await sendGenerationRequest();await sendGenerationRequest();
 const text=sent.at(-1).messages.map(message=>message.content).join('\n'),capture=collector==='main-output'&&!paused;
 assert.equal(text.split('COLLECT_ONLY').length-1,capture?1:0,JSON.stringify({collector,character,basic,paused}));
 assert.equal(deps.activeGenerationCycle.stateRoster.length,1,'basic delivery never disables the registered collector roster');
 assert.equal(deps.activeGenerationCycle.stateCaptureEnabled,capture);
 assert.equal(deps.activeGenerationCycle.stateCollectionPaused,paused);
 assert.equal(text.split('PERSON').length-1,1);assert.equal(text.includes('BASE_ONLY'),basic==='on');assert.equal(sent.at(-1).messages.at(-1).content,'USER_UNCHANGED');
 chatKey='other-room';await sendGenerationRequest();
 const stale=sent.at(-1).messages.map(message=>message.content).join('\n');
 assert.ok(!stale.includes('COLLECT_ONLY')&&!stale.includes('PERSON')&&!stale.includes('BASE_ONLY'),'room changes strip the separate collection command with every old RP block');
 combinations++;
}
console.log(`Emotion storage links passed: persisted failures, overlapping saves, explicit retry ownership, partial values, cancellation/source changes and ${combinations} real writer/final transport combinations.`);
