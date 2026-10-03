import assert from 'node:assert/strict';
import {fixture} from './regression/audit-v012.mjs';
import {createJobControl} from '../src/lifecycle/job-control.js';
import {createHub} from '../src/hub/orchestrator.js';
import {createJobScope,StaleRunError} from '../src/lifecycle/jobs.js';
import {createContinuityRuntime} from '../src/continuity/runtime.js';
import {createGenerationLifecycle} from '../src/lifecycle/generation.js';

// Stop while generation is waiting for the previous emotion request, before Jev starts.
for(const waitAt of ['reconcileInjection','waitForOutputChanges','waitForProfileState']) for(const fallback of [false,true]) {
    const f=fixture();let release,entered,calls=0;
    const hold=new Promise(resolve=>{release=resolve;});
    const ready=new Promise(resolve=>{entered=resolve;});
    f.ctx.chat=[{is_user:true,mes:'A synthetic participant opens the door.'}];
    f.sandbox.heldProfile=()=>{entered();return hold;};
    f.sandbox.fakeJudge=async()=>{calls++;return {};};
    f.run(`record(true);${waitAt}=heldProfile;runJudge=fakeJudge;`);
    const primary=f.run('onBeforeGeneration("normal",{},false)');
    await ready;
    const secondary=fallback?f.run('prepareFallback("normal")'):Promise.resolve();
    await Promise.resolve();
    f.run('hub.invalidate("generation_stopped");activeGenerationCycle={mode:"rp",inputKey:""};');
    release();await Promise.all([primary,secondary]);
    assert.equal(calls,0,'a cancelled preparation must not start or restart Jev');
    await f.run('onBeforeGeneration("normal",{},false)');
    assert.equal(calls,1,'a later intentional generation remains usable');
}

// A chat switch changes the current identity before cancellation is delivered.
const cancelled=[];
const deps={pendingProfileStateRequests:new Map([['emotion',{cancel:()=>cancelled.push('emotion')}]]),
    reasonerJobs:new Map([['old-chat',{cancel:()=>cancelled.push('old')}],['new-chat',{cancel:()=>cancelled.push('new')}]]),
    reasonerGeneration:0,stateChatKey:()=> 'new-chat',hub:{invalidate:()=>cancelled.push('hub')}};
createJobControl(deps).invalidateReasonerJobs();
assert.deepEqual(new Set(cancelled),new Set(['emotion','old','new','hub']));
assert.equal(deps.reasonerJobs.size,0);
assert.equal(deps.pendingProfileStateRequests.size,0);

// Rapid stop/restart must clear local stage waits without waiting for a hung host.
const hub=createHub({jobs:createJobScope(()=> 'synthetic'),getIdentity:()=> 'synthetic',StaleRunError});
let committed=0;
for(let index=0;index<20;index++) {
    let release,entered;
    const ready=new Promise(resolve=>{entered=resolve;});
    const run=hub.run({key:`run-${index}`},async token=>{
        await token.stage('context',()=>{entered();return new Promise(resolve=>{release=resolve;});},{timeoutMs:1000});
        committed++;
    });
    await ready;hub.invalidate('generation_stopped');
    assert.equal(await run,null,'stop settles even when the host ignores cancellation');
    release();await Promise.resolve();
}
assert.equal(committed,0,'late host completions cannot advance the cancelled pipeline');
assert.deepEqual(await hub.run({key:'next'},async()=>({ok:true})),{ok:true});
let queuedCalls=0;
const queued=hub.ensurePrepared({key:'queued'},()=>{queuedCalls++;});
hub.invalidate('generation_stopped');await queued;
assert.equal(queuedCalls,0,'a preparation cancelled before dispatch sends nothing');

for(const autoJudge of [false,true]) {
    let release,entered,calls=0;
    const ready=new Promise(resolve=>{entered=resolve;});
    const record={lastJudgment:{inputKey:'input',contextKey:'context',sourceKey:'source',payload:'saved'}};
    const deps={hub,stateChatKey:()=> 'synthetic',settings:{enabled:true,autoJudge},chatReadyKey:null,
        getContext:()=>({chat:[]}),record:()=>record,selectedWorld:()=>null,sourceRevisionKey:()=> 'source',
        currentInputKey:()=> 'input',recentContext:()=>({contextKey:'context'}),stableFingerprint:()=> 'cache',
        pendingComposerText:()=>'',generationCycleSalt:()=>'',document:{getElementById:()=>null},
        reconcileInjection:async()=>{},waitForOutputChanges:async()=>{},waitForProfileState:async()=>{},
        StaleRunError,runJudge:async()=>{calls++;},updateActivity:()=>{},updateStatus:()=>{},clearInjection:async()=>{},
        applyStoredInjection:async({validate})=>{entered();await new Promise(resolve=>{release=resolve;});validate();return {sourceCurrent:true,payloadChars:5};}};
    // Use the real Hub preparation owner and cancel while cached registration waits.
    const lifecycle=createGenerationLifecycle(deps);
    const pending=lifecycle.onBeforeGeneration('swipe',{},false);
    await ready;hub.invalidate('generation_stopped');release();await pending;
    assert.equal(calls,0,'cancelled cached reroll must not fall through into a new judgment');
}

// Cancellation must not leave the same output permanently marked as collected.
let requests=0;
const rec={};
const continuityDeps={settings:{continuityEnabled:true,reasonerProfileId:'synthetic'},connectionRequestService:{},
    stateChatKey:()=> 'synthetic',getContext:()=>({chat:[]}),reasonerJobs:new Map(),reasonerGeneration:0,
    normalizeContinuity:()=>({items:[],knowledge:[],dependencies:[]}),continuityView:()=>({}),
    requestWithConnectionProfile:(_service,_profile,_system,_data,{signal})=>{
        requests++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    }};
const continuity=createContinuityRuntime(continuityDeps);
const pending={outputText:'Synthetic output.',outputFingerprint:'synthetic-output',outputIndex:0,sourceKey:'source'};
for(let i=0;i<2;i++) {
    await continuity.postVerifiedCharacterOutput(rec,pending,null,'changed');
    const task=continuityDeps.reasonerJobs.get('synthetic');
    continuityDeps.reasonerGeneration++;task.cancel();await task;
    assert.equal(rec.lastReasonerSource,undefined);
    assert.equal(rec.lastContinuityTrace.status,'cancelled');
}
assert.equal(requests,2,'a cancelled output can be intentionally collected again');
console.log('Stop boundaries passed: waiting preparation, paired interceptor, next intentional run and old-chat auxiliary cancellation.');
