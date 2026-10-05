import assert from 'node:assert/strict';
import { fixture } from './audit-v012.mjs';
import { parseReasonerReply } from '../../st-profile-reasoner.js';
import { sceneGateRequest, resolveSceneGate, sceneGateAnswersConflict, sceneGateConflictRequest, resolveSceneGateConflict } from '../../src/scene/intimacy-gate.js';

function setup() {
    const f=fixture(), calls=[], activities=[];
    f.ctx.chat=[{is_user:true,mes:'Hunter continues the current scene.'}];
    f.sandbox.auditJev=async request=>{
        calls.push(request);
        return {answers:Object.fromEntries(Object.entries(request.questions).map(([key,question])=>[key,question.type==='noul'
            ? {type:'noul',noul:0.9}
            : {choice:key==='scene_level'?'0':key==='scene_phase'?'normal':key==='scene_evidence'?Object.keys(question.criteria).find(value=>value!=='none')||'none':Object.keys(question.criteria)[0],confidence:1}]))};
    };
    f.run('record(true);settings.recentTurns=1;callJev=auditJev;');
    f.sandbox.auditActivities=activities;
    f.run('updateActivity=(message,options={})=>auditActivities.push({message,...options});');
    return {f,calls,activities};
}

{
    const request=sceneGateRequest({model:'jev',transcript:'[1] CHARACTER: The prior interaction pauses.\n[2] USER: They move on to ordinary business.\n[3] CHARACTER: They begin another conversation.'});
    const answers={scene_level:{choice:'0'},scene_phase:{choice:'normal'},scene_evidence:{choice:'3'}};
    assert.equal(resolveSceneGate(answers,request,'paused').transition,'exited');
    answers.scene_evidence.choice='1';
    assert.equal(resolveSceneGate(answers,request,'paused').route,'paused','old evidence cannot end a current scene');
    const conflicting={scene_level:{choice:'4'},scene_phase:{choice:'ended'},scene_evidence:{choice:'3'}};
    assert.equal(sceneGateAnswersConflict(conflicting),true);
    const confirmationRequest=sceneGateConflictRequest(request,conflicting);
    assert.equal(Object.keys(confirmationRequest.questions).length,2,'conflict confirmation is bounded');
    const initial=resolveSceneGate(conflicting,request,'paused');
    assert.equal(resolveSceneGateConflict(initial,{scene_resolution:{choice:'ended'},scene_evidence:{choice:'3'}},request,'paused').transition,'exited');
    assert.equal(resolveSceneGateConflict(initial,{scene_resolution:{choice:'ended'},scene_evidence:{choice:'1'}},request,'paused').route,'paused');
}
{
    const {f,calls}=setup();
    f.run('record().sceneIntimacy={route:"paused",participantIds:[]};');
    const original=f.sandbox.auditJev;
    f.sandbox.conflictingJev=async request=>{
        if(request.questions.scene_resolution){calls.push(request);return {answers:{scene_resolution:{choice:'ended'},scene_evidence:{choice:Object.keys(request.questions.scene_evidence.criteria).filter(id=>id!=='none').at(-1)}}};}
        const result=await original(request);
        if(request.questions.scene_level){result.answers.scene_level.choice='4';result.answers.scene_phase.choice='ended';}
        return result;
    };
    f.run('callJev=conflictingJev;');
    await f.run('runJudge({force:true})');
    assert.equal(calls.length,3,'only conflicting gate answers add a second small check');
    assert.equal(f.run('record().sceneIntimacy.route'),'normal');
    assert.equal(f.run('record().lastJudgment.sceneIntimacy.confirmation'),'resolved');
}
{
    const {f,calls}=setup();
    let release,entered;
    const reached=new Promise(resolve=>entered=resolve);
    const original=f.sandbox.auditJev;
    f.sandbox.blockedJev=async request=>{if(!calls.length){entered();await new Promise(resolve=>release=resolve);}return original(request);};
    f.run('callJev=blockedJev;');
    const first=f.run('runJudge()');
    await reached;
    const second=f.run('runJudge()');
    release();
    const [a,b]=await Promise.all([first,second]);
    assert.equal(calls.length,2,'same input shares one gate and one main request');
    assert.equal(a?.inputKey,b?.inputKey);
}
{
    const {f,activities}=setup();
    let release,entered;
    const reached=new Promise(resolve=>entered=resolve);
    let first=true;
    f.sandbox.setExtensionPrompt=async()=>{if(first){first=false;entered();await new Promise(resolve=>release=resolve);}};
    const judge=f.run('runJudge({force:true})');
    await reached;
    f.run('invalidateReasonerJobs();record().lastJudgment=null;');
    const clearing=f.run('clearInjection()');
    release();
    assert.equal(await judge,null);
    await clearing;
    assert.equal(f.run('activeInjectionPayload'),'');
    assert.ok(!activities.some(item=>item.done&&/적용 완료/.test(item.message)),'cancelled apply must never claim completion');
}
{
    const {f}=setup();
    f.run('characterStore.npcs=[{id:"old-chat-npc",kind:"npc",name:"Old"}];');
    const renders=[];
    f.sandbox.captureRoomRender=()=>renders.push(f.run('({key:stateChatKey(),ready:chatReadyKey,npcs:characterStore.npcs.length})'));
    f.run('renderAll=captureRoomRender;');
    f.ctx.chatId='room-B';
    f.sandbox.fetch=async()=>{assert.ok(renders.length,'clear old display before waiting for the server');assert.equal(renders[0].npcs,0);assert.equal(renders[0].ready,'');return {ok:false,status:503,json:async()=>({error:'offline'})};};
    await f.run('onChatChanged()');
    assert.equal(f.run('characterStore.npcs.length'),0,'failed hydration must not retain prior chat cast');
    assert.equal(f.run('chatReadyKey'),'');
}
{
    const {f}=setup();
    let release,entered,first=true;
    const reached=new Promise(resolve=>entered=resolve);
    f.sandbox.setExtensionPrompt=async()=>{if(first){first=false;entered();await new Promise(resolve=>release=resolve);}};
    f.sandbox.fetch=async()=>({ok:true,json:async()=>({ok:true,storageVersion:3,migrated:true,history:[],characters:{enabled:false,characters:[],npcs:[]}})});
    f.ctx.chatId='room-B';
    const earlier=f.run('onChatChanged()');
    await reached;
    f.ctx.chatId='room-C';
    const later=f.run('onChatChanged()');
    release();
    await Promise.all([earlier,later]);
    assert.equal(f.run('chatReadyKey'),f.run('stateChatKey()'),'earlier chat hydration cannot claim the later chat');
}
{
    const {f}=setup();
    let release,entered;
    const reached=new Promise(resolve=>entered=resolve);
    f.sandbox.fetch=async url=>{if(url.endsWith('/chat')){entered();await new Promise(resolve=>release=resolve);}return {ok:true,json:async()=>({ok:true})};};
    const saving=f.run('savePreference("developmentStyle","dynamic")');
    await reached;
    f.ctx.chatId='room-B';
    f.run('record(true);activeInjectionPayload="B_PAYLOAD";');
    release();
    await saving;
    assert.equal(f.run('activeInjectionPayload'),'B_PAYLOAD','old chat setting save must not clear the new chat');
}
{
    const {f}=setup();
    let release,entered,count=0;
    const reached=new Promise(resolve=>entered=resolve);
    const stored=[];
    f.run('chatReadyKey=stateChatKey();');
    f.sandbox.fetch=async(url,options)=>{
        if(url.endsWith('/chat')){
            if(++count===1){entered();await new Promise(resolve=>release=resolve);return {ok:false,status:500,json:async()=>({error:'first write failed'})};}
            stored.push(JSON.parse(options.body).value.preferences.developmentStyle);
        }
        return {ok:true,json:async()=>({ok:true})};
    };
    const first=f.run('savePreference("developmentStyle","dynamic")');
    await reached;
    const second=f.run('savePreference("developmentStyle","static")');
    const third=f.run('savePreference("developmentStyle","dynamic")');
    release();
    const results=await Promise.allSettled([first,second,third]);
    assert.deepEqual(results.map(result=>result.status),['rejected','fulfilled','fulfilled']);
    assert.equal(stored.at(-1),'dynamic');
    assert.equal(f.run('record().preferences.developmentStyle'),'dynamic','failed earlier save cannot roll back a later selection');
}
{
    const {f}=setup();
    let writes=0;
    f.sandbox.fetch=async()=>{writes++;return {ok:true,json:async()=>({ok:true})};};
    f.run('serverStoreAvailable=false;chatReadyKey="";');
    await assert.rejects(f.run('saveServerChat()'),/채팅을 다시 불러온/);
    assert.equal(writes,0,'a failed hydration must not allow an empty local record to overwrite stored data');
}
{
    const {f}=setup();
    await f.run('runJudge({force:true})');
    f.run('record().lastJudgment.sourceKey="STALE_SOURCE";record().lastJudgment.payload="STALE_PAYLOAD";');
    const receipt=await f.run('applyStoredInjection()');
    assert.equal(receipt.sourceCurrent,false);
    assert.equal(f.run('activeInjectionPayload'),'','stale record cannot become active injection');
}
{
    assert.deepEqual(parseReasonerReply('Here is the result: {"ok":true}'),{ok:true});
    assert.deepEqual(parseReasonerReply('```json\n{"ok":true}'),{ok:true});
    assert.throws(()=>parseReasonerReply('{"ok":true} {"ok":false}'),/여러 개/);
    assert.throws(()=>parseReasonerReply('{"ok":'),/끝나지/);
}
{
    const {f}=setup();
    const nodes=new Map(['sr-owner-card','sr-owner-diagnostic-panel','sr-owner-status','sr-owner-prompt'].map(id=>[id,{hidden:true,textContent:'',value:''}]));
    f.sandbox.document.getElementById=id=>nodes.get(id)||null;
    f.run('settings.ownerUnlocked=true;renderOwnerMode();');
    assert.equal(nodes.get('sr-owner-card').hidden,false,'private controls appear only after unlock');
    const snapshot=f.run('diagnosticSnapshot()');
    assert.ok(snapshot.automatic && snapshot.scene && snapshot.storage && snapshot.retrieval && snapshot.characters && snapshot.injection);
    f.run('settings.ownerUnlocked=false;renderOwnerMode();');
    assert.equal(nodes.get('sr-owner-diagnostic-panel').hidden,true);
}
{
    const f=fixture();
    f.run('serverKeyStatus="저장됨";');
    for(const answers of [{},[]]){
        f.sandbox.fetch=async()=>({ok:true,json:async()=>({answers})});
        await assert.rejects(f.run('callJev({questions:{required:{type:"choice",criteria:{yes:"Yes"}}}})'),/판정 결과/);
    }
}
console.log('Lifecycle races passed: current evidence, shared judgment, cancelled apply, failed hydration, cross-chat and rapid settings saves, stale payload, bounded JSON recovery, developer diagnostics, Jev response validation.');
