import assert from 'node:assert/strict';
import {createPromptObserver,observePromptReceipt} from '../src/injection/receipt.js';
import {makeAppearanceOffer,applyAppearanceOffer} from '../src/scene/appearance.js';
import {fixture} from './regression/audit-v012.mjs';

const failures=[],passed=[];
async function scenario(name,task){try{await task();passed.push(name);console.log('PASS',name);}catch(error){failures.push({name,message:error.message.slice(0,300)});console.error('FAIL',name,error.message.slice(0,300));}}
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
    assert.ok(!t.active(),'failed judgment must clear the active injection');assert.ok(t.messages.some(item=>item.error));
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
    assert.ok(!t.active(),'failed judgment must clear the active injection');assert.equal(t.f.ctx.extensionPrompts['scene-reader-router'].value,'');
    assert.ok(t.messages.some(item=>item.error));assert.ok(!t.messages.some(item=>item.done&&/적용 완료/.test(item.message)));
    t.control.mainFailure=null;t.f.run('hub.endCycle()');await t.generate();applied(t);
});
await scenario('server readback mismatch cannot produce a success toast',async()=>{
    const t=setup();t.control.corrupt=true;await t.generate();assert.ok(!t.active(),'failed judgment must clear the active injection');assert.ok(t.messages.some(item=>item.error));
});
await scenario('quiet and dry-run do not call judgment',async()=>{
    const t=setup();await t.f.run("onBeforeGeneration('quiet',{},false)");await t.f.run("onBeforeGeneration('normal',{},true)");assert.equal(t.calls.length,0);
});
await scenario('OOC-only and malformed OOC clear prior injection',async()=>{
    for(const text of ['(OOC: Explain the prior answer.)','(OOC: incomplete']){
        const t=setup();await t.generate();t.f.run('hub.endCycle()');
        t.f.ctx.chat.push({is_user:true,mes:text});await t.generate();assert.equal(t.calls.length,2);assert.ok(!t.active(),'failed judgment must clear the active injection');
    }
});

await scenario('registration recovery failure is visible',async()=>{
 const t=setup();await t.generate();t.f.ctx.extensionPrompts={};t.control.dropPrompt=true;t.messages.length=0;
 await t.f.run("prepareFallback('normal')");assert.ok(!t.active());assert.ok(t.messages.some(x=>x.error));
});
await scenario('prepared text is distinct from request inclusion',async()=>{
 const t=setup();await t.generate();assert.ok(t.messages.some(x=>/준비/.test(x.message)));assert.ok(!t.messages.some(x=>/적용 완료|전송 요청에/.test(x.message)));
 t.f.sandbox.auditPrompt={prompt:t.active()+'\n'+t.judgment().worldPayload};assert.equal(t.f.run('promptObserver.observe(auditPrompt).scene'),'confirmed');assert.match(t.messages.at(-1).message,/전송 요청에/);
 t.f.sandbox.auditPrompt={prompt:'Host removed text.'};assert.equal(t.f.run('promptObserver.observe(auditPrompt).scene'),'unconfirmed');assert.equal(t.messages.at(-1).error,true);
});
await scenario('regenerate follows actual host deletion ordering',async()=>{
 const t=setup();t.f.ctx.chat.pop();await t.generate();t.f.ctx.chat.push({is_user:false,mes:'Hunter answers at the gate.'});await t.f.run('onCharacterMessageReceived(1)');t.f.run('hub.endCycle()');
 await t.f.run("onBeforeGeneration('regenerate',{},false)");t.f.ctx.chat.pop();await t.f.run("onAssistantOutputChanged(1,'regenerated')");await t.f.run("prepareFallback('regenerate')");applied(t);assert.equal(t.calls.length,2);
});
await scenario('swipe edit and deletion update the next judgment',async()=>{
 for(const kind of ['swiped','edited','deleted']){const t=setup();await t.generate();t.f.run('hub.endCycle()');if(kind==='deleted')t.f.ctx.chat.pop();else t.f.ctx.chat[1].mes='Changed RP at a harbor.';
 await t.f.run(`onAssistantOutputChanged(1,'${kind}')`);await t.generate();applied(t);assert.equal(t.calls.length,4);assert.ok(!t.calls.at(-1).state.recent_roleplay.includes('waits beside the door'));}
});
await scenario('auto disabled cannot reuse changed input',async()=>{
 const t=setup();await t.generate();t.f.run('hub.endCycle();settings.autoJudge=false');t.f.ctx.chat.push({is_user:true,mes:'Different scene.'});await t.generate();await t.f.run("prepareFallback('normal')");assert.equal(t.calls.length,2);assert.ok(!t.active());
});
await scenario('old chat response cannot block or overwrite a new chat',async()=>{
 const t=setup(),fetch=t.f.sandbox.fetch;let release,started;const entered=new Promise(r=>started=r),held=new Promise(r=>release=r);let delayed=false;
 t.f.sandbox.fetch=async(url,options)=>{const body=JSON.parse(options?.body||'{}');if(!delayed&&url.endsWith('/systemone')&&!body.questions.scene_level){delayed=true;started();await held;}return fetch(url,options);};
 const old=t.generate();await entered;t.f.sandbox.currentContext={...t.f.ctx,chatId:'room-B',chat:[{is_user:true,mes:'Discuss the lake.'}]};t.f.run("hub.invalidate('chat_changed');record(true)");
 try{await t.generate();const current=t.active();assert.ok(current);release();await old;assert.equal(t.active(),current);assert.equal(t.f.run('record().lastJudgment.payload'),current);}finally{release();await old;}
});
await scenario('request observer filters auxiliary quiet dry-run and resolves name macros',async()=>{
 const logs=[];let expected={payload:'Hello {{user}}, from {{char}}.',worldPayload:'WORLD'};
 const o=createPromptObserver({getExpected:()=>expected,getNames:()=>({userName:'User',characterName:'Hunter'}),getCycleId:()=> 'audit',report:()=>{},updateActivity:(text,options)=>logs.push({text,...options}),updateStatus:()=>{}});
 const messages=[{role:'system',content:'Hello User, from Hunter.\nWORLD'}];assert.equal(o.observe({prompt:messages}).phase,'assembly');assert.equal(o.observeRequest({messages:[{content:'Auxiliary'}]}),null);
 messages[0].content='WORLD';assert.equal(o.observeRequest({messages}).scene,'unconfirmed');assert.equal(logs.at(-1).error,true);
 o.start('quiet');assert.equal(o.observe({prompt:'quiet'}),null);o.start('normal',{},true);assert.equal(o.observe({prompt:'dry'}),null);o.start('normal');assert.equal(o.observe({prompt:messages},true),null);expected=null;assert.equal(o.observe({prompt:messages}),null);
 assert.equal(observePromptReceipt({messages:[{content:[{type:'text',text:'Guide'},{type:'image_url'}]}]},{payload:'Guide'}).scene,'confirmed');assert.equal(observePromptReceipt({prompt:'changed'},{payload:'{{setvar::x::1}}'}).scene,'unverifiable');
});
await scenario('macro placement must include the prepared payload',async()=>{
 const t=setup();t.f.run("record(true).preferences.injectionMode='macro';macroAvailable=true");await t.generate();assert.equal(t.f.ctx.extensionPrompts['scene-reader-router'].value,'');assert.ok(t.active());
 t.f.sandbox.auditPrompt={prompt:'No macro.'};t.f.run('promptObserver.observe(auditPrompt)');assert.equal(t.messages.at(-1).error,true);t.f.sandbox.auditPrompt={prompt:t.active()+'\n'+t.judgment().worldPayload};t.f.run('promptObserver.observe(auditPrompt)');assert.equal(t.messages.at(-1).done,true);
});
await scenario('accepted arrival reaches budget despite existing cast reuse',async()=>{
 const rec={preferences:{settingsContract:3,appearanceChance:100,villainEnabled:false}};rec.appearanceOffer=makeAppearanceOffer(rec,'candidate',()=>0.1);
 const d={arrival_mode:'visit',npc_route:'reuse',npc_target:'sheet_0'},details={};applyAppearanceOffer(rec,details,d);assert.equal(d.npc_route,'create');assert.equal(d.npc_target,'none');assert.equal(rec.npcProfile,undefined);
 rec.npcProfile={id:'existing',status:'active'};const blocked={arrival_mode:'visit',npc_route:'reuse',npc_target:'stored_generated'};applyAppearanceOffer(rec,details,blocked);assert.equal(blocked.npc_route,'create');assert.equal(rec.npcProfile.id,'existing');assert.equal(makeAppearanceOffer(rec,'occupied',()=>0.1).passed,true);
});

console.log(JSON.stringify({passed:passed.length,failures},null,2));
assert.equal(failures.length,0,'automatic generation audit failures');
