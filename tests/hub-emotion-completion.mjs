import assert from 'node:assert/strict';
import {createEmotionRuntime} from '../src/character/emotion-runtime.js';
import {collectProfileOutputState} from '../src/character/state-profile-output.js';
import {createConnectionProfileClient} from '../src/adapters/connection-profile.js';
import {mock} from 'node:test';
import {activitySummary} from '../src/debug/activity-summary.js';
import {storeStateEvent,latestStateForChat,selectedStateSwipe} from '../src/character/state-contract.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({result,hubBusy=false,hostBusy=false,sourceWait=async()=>{},applyTimeoutMs=50}={}){
    const chat=[{is_user:false,mes:'Morgan answers.',swipe_id:0}],events=[],notices=[];
    const record={preferences:{profileEmotionJudgment:true},characterStateEvents:[]};
    let running=hubBusy,notify=()=>{},saves=0;
    const deps={settings:{enabled:true,reasonerProfileId:'test'},characterStore:{enabled:true},connectionRequestService:{},
        stateChatKey:()=> 'room',getContext:()=>({chat}),record:()=>record,stableFingerprint:JSON.stringify,selectedStateSwipe,
        stateCollectorMode:()=> 'profile-output',pendingProfileStateRequests:new Map(),profileStateSequence:0,
        collectProfileOutputState:async()=>result,waitForOutputChanges:sourceWait,isGenerationBusy:()=>hostBusy,
        hub:{snapshot:()=>({state:{status:running?'running':'prepared'}}),subscribe:fn=>(notify=fn,()=>{notify=()=>{};})},
        noteDiagnostic:(stage,detail)=>events.push({stage,...detail}),notifySceneReaderToast:(_w,_level,text)=>notices.push(text),
        storeStateEvent,latestStateForChat,renderCharacterTurnResults:()=>{},renderAll:()=>{},persistChat:async()=>{saves++;}};
    const runtime=createEmotionRuntime(deps,{applyTimeoutMs});
    const start=()=>runtime.scheduleProfileStateCollection({chatKey:'room',outputIndex:0,text:chat[0].mes,roster:[{id:'m',code:'C0',name:'Morgan',trackArousal:false,coverageVersion:2}]});
    return {deps,record,chat,events,notices,start,get saves(){return saves;},idle(){running=false;notify();}};
}
const success={states:[{id:'m',coverageVersion:2,values:{anger:10,interest:20},targets:{}}],diagnostics:{actors:[],received:1,accepted:1}};
{
    const f=setup({result:{states:[],error:'timeout',errorKind:'PROFILE_TIMEOUT'},hubBusy:true,hostBusy:true});
    const task=f.start();await tick();
    assert.equal(f.record.characterStateCapture.status,'timeout','known request failure is visible before any apply wait');
    assert.equal(task.retryable,true,'a known failure allows a new explicit retry while its status waits for safe storage');
    assert.equal(f.saves,0,'failure persistence must not race a Hub transaction');
    f.idle();await task;assert.equal(f.saves,1);assert.equal(f.deps.pendingProfileStateRequests.size,0);
}
{
    const f=setup({result:success,hostBusy:true});await f.start();
    assert.equal(f.record.characterStateCapture.status,'incomplete','completed output is applied despite a host generation flag');
    assert.equal(f.saves,1);assert.equal(f.record.characterStateEvents[0].states[0].values.interest,20);
    assert.ok(f.events.some(e=>e.phase==='response')&&f.events.some(e=>e.phase==='storage'));
}
{
    const f=setup({result:success,hubBusy:true});const task=f.start();await tick();
    assert.equal(f.record.characterStateCapture.phase,'waiting');assert.equal(f.saves,0,'Hub transaction remains protected');
    f.idle();await task;assert.equal(f.saves,1);
}
{
    let finish,snapshot;const f=setup({result:success});
    f.deps.persistChat=async(_key,value=f.record)=>{snapshot=structuredClone(value);await new Promise(resolve=>{finish=resolve;});};
    const task=f.start();await tick();
    assert.equal(task.saving,true,'save activity is transient and not written into the persisted result');
    assert.equal(f.record.characterStateCapture.status,'incomplete','concurrent saves read the terminal result');
    assert.equal(snapshot.characterStateCapture.status,'incomplete','saved snapshot has a terminal status for reload');
    finish();await task;assert.equal(f.record.characterStateCapture.status,'incomplete');assert.equal(task.saving,false);
}
{
    const f=setup({result:success,sourceWait:()=>new Promise(()=>{}),applyTimeoutMs:10});await f.start();
    assert.equal(f.record.characterStateCapture.status,'processing_failed');
    assert.equal(f.record.characterStateCapture.errorKind,'EMOTION_APPLY_TIMEOUT');
    assert.equal(f.deps.pendingProfileStateRequests.size,0,'a stuck output queue is bounded');
}
{
    let finish;const f=setup({result:success,sourceWait:()=>new Promise(resolve=>{finish=resolve;})});
    const task=f.start();await tick();f.chat[0].mes='Edited reply.';finish();await task;
    assert.equal(f.saves,0);assert.equal(f.record.characterStateCapture.status,'cancelled','discarded results cannot stay collecting');
}
{
    let options;await collectProfileOutputState({service:{},profileId:'test',output:'Morgan answers.',roster:[{id:'m',code:'C0',name:'Morgan'}],
        request:async(_service,_profile,_system,_state,value)=>{options=value;return {result:{states:[]}};}});
    assert.equal(options.timeoutMs,60000,'emotion request uses the normal connection deadline');
    let calls=0;const response=await collectProfileOutputState({service:{},profileId:'test',output:'Morgan answers.',roster:[{id:'m',code:'C0',name:'Morgan'}],timeoutMs:10,
        request:()=>{calls++;return new Promise(()=>{});}});
    assert.equal(response.error,'timeout');assert.equal(calls,1,'timeout does not retry an accepted request');
}
{
    mock.timers.enable({apis:['setTimeout']});
    try{
        const pending=collectProfileOutputState({service:{},profileId:'test',output:'Morgan answers.',roster:[{id:'m',code:'C0',name:'Morgan'}],
            request:()=>new Promise(resolve=>setTimeout(()=>resolve({result:{states:[{code:'C0',joy:20}]}}),35000))});
        await tick();mock.timers.tick(35000);
        assert.equal((await pending).states[0]?.values.joy,20,'an answer after the former 30-second cutoff is retained');
    }finally{mock.timers.reset();}
}
{
    const events=[],controller=new AbortController(),service={getProfile:()=>({model:'synthetic'}),validateProfile:()=>{},sendRequest:()=>new Promise(()=>{})};
    const call=createConnectionProfileClient({onDiagnostic:e=>events.push(e)})(service,'test','test',{}, {signal:controller.signal,timeoutMs:100});
    controller.abort(Object.assign(new Error('deadline'),{code:'REQUEST_TIMEOUT'}));await assert.rejects(call);
    assert.equal(events.at(-1).status,'failed','deadline cancellation is recorded as a failure');
}
for(const [phase,label] of [['request','감정 응답 대기'],['response','감정 응답 수신'],['waiting','감정 결과 적용 대기'],['storage','감정 결과 저장 중']]){
    assert.equal(activitySummary({stage:'character_state_capture',status:'collecting',phase}).result,label);
}
console.log('Emotion completion passed: request failure release, bounded apply wait, host/Hub separation, stale-source closure, normal deadline and no automatic retry.');
