import assert from 'node:assert/strict';
import {fixture} from './regression/audit-v012.mjs';

const failures=[],passed=[];
async function scenario(name,task){try{await task();passed.push(name);console.log('PASS',name);}catch(error){failures.push({name,message:error.message});console.error('FAIL',name,error.message);}}
function setup(){
    const f=fixture(),calls=[],messages=[],server=new Map(),control={mainFailure:null,dropPrompt:false,corrupt:false,scene:'normal'};
    f.ctx.chat=[{is_user:true,mes:'We discuss the garden.'},{is_user:false,mes:'Hunter waits beside the door.'}];
    f.ctx.extensionPrompts={};
    f.sandbox.auditMessages=messages;
    f.sandbox.setExtensionPrompt=async(key,value,position,depth,scan,role)=>{
        if(!control.dropPrompt||!value)f.ctx.extensionPrompts[key]={value,position,depth,scan,role};
    };
    f.sandbox.fetch=async(url,options={})=>{
        const body=JSON.parse(options.body||'{}');
        if(url.endsWith('/systemone')){
            calls.push(body);
            const gate=Boolean(body.questions.scene_level);
            if(!gate&&control.mainFailure){
                if(control.mainFailure==='network')throw new TypeError('offline');
                if(control.mainFailure==='timeout')throw Object.assign(new Error('timeout'),{name:'AbortError'});
                if(typeof control.mainFailure==='number')return {ok:false,status:control.mainFailure,json:async()=>({error:'test service failure'})};
                if(control.mainFailure==='empty')return {ok:true,json:async()=>({answers:{}})};
                if(control.mainFailure==='invalid')return {ok:true,json:async()=>({answers:{wrong:{choice:'wrong'}}})};
            }
            const answers=Object.fromEntries(Object.entries(body.questions).map(([key,q])=>[key,q.type==='noul'?{type:'noul',noul:0.9}:{choice:key==='scene_level'?(control.scene==='paused'?'4':'0'):key==='scene_phase'?(control.scene==='paused'?'active':'ended'):key==='scene_evidence'?Object.keys(q.criteria).filter(x=>x!=='none').at(-1)||'none':key.startsWith('scene_participant_')?'yes':Object.keys(q.criteria)[0],confidence:1}]));
            return {ok:true,json:async()=>({model:'audit-jev',answers})};
        }
        if(url.endsWith('/transaction'))server.set(body.chatKey,{chat:structuredClone(body.chat),history:structuredClone(body.history)});
        const saved=server.get(body.chatKey)||{};
        return {ok:true,json:async()=>url.endsWith('/bootstrap')?{ok:true,storageVersion:3,migrated:true,settings:{global:{enabled:true,autoJudge:true}},chat:control.corrupt?null:structuredClone(saved.chat),history:saved.history||[],characters:null}:{ok:true}};
    };
    f.run(`record(true);storageVersion=3;serverKeyStatus='저장됨 · audit';settings.recentTurns=3;
        updateActivity=(message,options={})=>auditMessages.push({message,...options});showActivity=message=>auditMessages.push({message});`);
    const generate=()=>f.run("onBeforeGeneration('normal',{},false)");
    const judgment=()=>f.run('record().lastJudgment');
    const active=()=>f.run('activeInjectionPayload');
    return {f,calls,messages,server,control,generate,judgment,active};
}
function applied(t){
    const j=t.judgment();assert.ok(j?.payload);assert.equal(t.active(),j.payload);
    assert.equal(t.f.ctx.extensionPrompts['scene-reader-router'].value,j.payload);
    assert.deepEqual(JSON.parse(JSON.stringify(j)),t.server.get(t.f.run('stateChatKey()')).chat.lastJudgment);
}

await scenario('normal typed input: primary before MESSAGE_SENT, then interceptor',async()=>{
    const t=setup(),text='I open the garden gate.';
    t.f.sandbox.document.getElementById=id=>id==='send_textarea'?{value:text}:null;
    await t.generate();
    t.f.ctx.chat.push({is_user:true,mes:text});
    t.f.sandbox.document.getElementById=()=>null;
    await t.f.run('onUserMessageSent(2);');
    await t.f.run("prepareFallback('normal')");
    applied(t);assert.equal(t.calls.length,2,'the same input needs only a scene check and one main judgment');
    assert.ok(t.calls.every(call=>(call.state.recent_roleplay.match(/I open the garden gate/g)||[]).length===1));
});
await scenario('empty send reads the latest assistant output',async()=>{
    const t=setup();await t.generate();t.f.run('hub.endCycle()');
    t.f.ctx.chat.push({is_user:false,mes:'We are now at the train station.'});
    await t.generate();applied(t);assert.equal(t.calls.length,4);assert.match(t.calls.at(-1).state.recent_roleplay,/train station/);
});
await scenario('fallback without primary performs a real judgment',async()=>{
    const t=setup();await t.f.run("prepareFallback('normal')");applied(t);assert.equal(t.calls.length,2);
});
await scenario('fallback cannot reuse a preparation from changed RP context',async()=>{
    const t=setup();await t.generate();
    t.f.ctx.chat.push({is_user:false,mes:'The scene changes to a quiet library.'});
    await t.f.run("prepareFallback('normal')");
    assert.equal(t.calls.length,4,'missing primary/end events must not hide changed assistant context');
    assert.match(t.calls.at(-1).state.recent_roleplay,/quiet library/);applied(t);
});
await scenario('lost host registration is restored at the interceptor',async()=>{
    const t=setup();await t.generate();t.f.ctx.extensionPrompts={};
    await t.f.run("prepareFallback('normal')");applied(t);assert.equal(t.calls.length,2,'restore the valid judgment without another API call');
});
await scenario('silent host registration failure never reports applied',async()=>{
    const t=setup();t.control.dropPrompt=true;await t.generate();
    assert.equal(t.active(),'');assert.ok(t.messages.some(item=>item.error));
    assert.ok(!t.messages.some(item=>item.done&&/적용 완료/.test(item.message)));
});
await scenario('NSFW entry, paused reuse, and normal return',async()=>{
    const t=setup();t.control.scene='paused';await t.generate();applied(t);
    assert.equal(t.calls.length,1);assert.equal(t.judgment().sceneIntimacy.route,'paused');
    assert.deepEqual(Object.keys(t.judgment().decisions),[]);
    t.f.run('hub.endCycle()');await t.generate();assert.equal(t.calls.length,1,'same paused input reuses the fixed guide');
    t.f.ctx.chat.push({is_user:false,mes:'The interaction has ended. They discuss tomorrow.'});
    t.control.scene='normal';t.f.run('hub.endCycle()');await t.generate();applied(t);
    assert.equal(t.calls.length,3);assert.equal(t.judgment().sceneIntimacy.route,'normal');
});
for(const failure of [401,429,500,'network','timeout','empty','invalid'])await scenario('main judgment failure: '+failure,async()=>{
    const t=setup();await t.generate();t.f.run('hub.endCycle()');
    t.f.ctx.chat.push({is_user:true,mes:'A different situation needs a new judgment.'});
    t.messages.length=0;t.control.mainFailure=failure;await t.generate();
    assert.equal(t.active(),'');assert.equal(t.f.ctx.extensionPrompts['scene-reader-router'].value,'');
    assert.ok(t.messages.some(item=>item.error));assert.ok(!t.messages.some(item=>item.done&&/적용 완료/.test(item.message)));
    t.control.mainFailure=null;t.f.run('hub.endCycle()');await t.generate();applied(t);
});
await scenario('server readback mismatch cannot produce a success toast',async()=>{
    const t=setup();t.control.corrupt=true;await t.generate();assert.equal(t.active(),'');assert.ok(t.messages.some(item=>item.error));
});
await scenario('quiet and dry-run do not call judgment',async()=>{
    const t=setup();await t.f.run("onBeforeGeneration('quiet',{},false)");await t.f.run("onBeforeGeneration('normal',{},true)");assert.equal(t.calls.length,0);
});
await scenario('OOC-only and malformed OOC clear prior injection',async()=>{
    for(const text of ['(OOC: Explain the prior answer.)','(OOC: incomplete']){
        const t=setup();await t.generate();t.f.run('hub.endCycle()');
        t.f.ctx.chat.push({is_user:true,mes:text});await t.generate();assert.equal(t.calls.length,2);assert.equal(t.active(),'');
    }
});
console.log(JSON.stringify({passed:passed.length,failures},null,2));
assert.equal(failures.length,0,'automatic generation audit failures');
