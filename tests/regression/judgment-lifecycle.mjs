import assert from 'node:assert/strict';
import { fixture } from './audit-v012.mjs';

function setup() {
    const f = fixture(), calls = [], prompts = new Map();
    const server = {chat:null, history:[], writes:0, corrupt:false};
    f.ctx.chat = [{is_user:true, mes:'Hunter continues the conversation.'}];
    f.sandbox.fetch = async (url, options) => {
        const body = JSON.parse(options?.body || '{}');
        if (url.endsWith('/transaction')) { server.chat = body.chat; server.history = body.history; server.writes++; }
        if (url.endsWith('/chat')) { server.chat = body.value; server.writes++; }
        if (url.endsWith('/history')) server.history = body.value;
        return {ok:true, json:async () => url.endsWith('/bootstrap')
            ? {ok:true, storageVersion:3, migrated:true, settings:{global:{enabled:true,autoJudge:true}}, chat:server.corrupt ? null : structuredClone(server.chat), history:server.history, characters:null}
            : {ok:true}};
    };
    f.sandbox.setExtensionPrompt = async (key, text) => prompts.set(key, text);
    f.sandbox.testJev = async request => {
        calls.push(request);
        return {answers:Object.fromEntries(Object.entries(request.questions).map(([key,q]) => [key,q.type === 'noul'
            ? {type:'noul',noul:0.9}
            : {choice:key === 'scene_level' ? '0' : key === 'scene_phase' ? 'normal' : Object.keys(q.criteria)[0],confidence:1}]))};
    };
    f.run('record(true); settings.recentTurns=1; storageVersion=3; callJev=testJev;');
    return {f,calls,prompts,server};
}

// Opening the panel after automatic generation must not erase its result.
// The old contract-3 migration ran again in setFormValues -> preferences -> record(true).
for (const mode of ['automatic','manual']) {
    const {f,calls,server} = setup();
    f.run('record().preferences.settingsContract=3;');
    if (mode === 'manual') f.run('setFormValues()');
    await f.run(mode === 'automatic' ? "onBeforeGeneration('normal',{},false)" : 'runJudge({force:true})');
    const judgment = f.run('record().lastJudgment');
    assert.ok(judgment?.payload, `${mode}: judgment completed`);
    assert.equal(calls.length,2, `${mode}: gate and main judgment ran`);
    f.run('setFormValues(); setFormValues();');
    assert.equal(f.run('record().lastJudgment'),judgment, `${mode}: opening the panel preserves judgment`);
    assert.equal(f.run('activeInjectionPayload'),judgment.payload);
    assert.deepEqual(JSON.parse(f.run('JSON.stringify(record().lastJudgment)')),server.chat.lastJudgment);
    if (mode === 'automatic') {
        f.ctx.chat.push({is_user:false,mes:'Hunter answers the question.'});
        await f.run('onCharacterMessageReceived(1)');
        f.run('setFormValues()');
        assert.equal(f.run('record().lastJudgment'),judgment,'receiving the automatic response preserves its judgment');
        assert.equal(server.chat.pendingPlan.outputText,'Hunter answers the question.');
        assert.equal(server.chat.lastJudgment.payload,f.run('activeInjectionPayload'));
    }
    const events=JSON.parse(f.run('JSON.stringify(diagnosticEvents)'));
    const started=events.find(event=>event.stage==='judge_started');
    const applied=events.find(event=>event.stage==='injection_applied');
    assert.equal(started.inputKey,applied.inputKey);
    assert.ok(started.runKey && started.runKey !== started.inputKey);
}

for (const preferences of [{settingsContract:2},{settingsContract:3,characterVolume:'basic'},{settingsContract:4},{}]) {
    const {f,server}=setup();
    server.chat={preferences,lastJudgment:{payload:'obsolete'},eventProfile:{title:'keep event'},pendingPlan:{outputText:'keep completed output'}};
    await f.run('hydrateServerState()');
    assert.equal(server.chat.preferences.settingsContract,4);
    assert.ok(server.chat.preferences.characterVolume);
    assert.equal(server.chat.lastJudgment,null);
    assert.equal(server.chat.eventProfile.title,'keep event');
    assert.equal(server.chat.pendingPlan.outputText,'keep completed output');
    const writes=server.writes;
    await f.run('hydrateServerState()');
    assert.equal(server.writes,writes,'migration is persisted once');
}

{
    const {f,server,prompts}=setup();
    server.corrupt=true;
    await assert.rejects(f.run('runJudge({force:true})'),/서버에 저장된 판정/);
    assert.equal(f.run('activeInjectionPayload'),'');
    assert.equal(prompts.get(f.run('INJECT_KEY')),'');
    assert.equal(f.run("diagnosticEvents.some(event=>event.stage==='judge_finished')"),false);
}

for (const kind of ['edited','swiped','deleted']) {
    const {f,server}=setup();
    await f.run("onBeforeGeneration('normal',{},false)");
    f.ctx.chat.push({is_user:false,mes:'Hunter answers.'});
    await f.run('onCharacterMessageReceived(1)');
    const payload=f.run('record().lastJudgment.payload');
    if(kind==='deleted')f.ctx.chat.pop(); else f.ctx.chat[1].mes='Hunter gives an alternative answer.';
    await f.run(`onAssistantOutputChanged(1,'${kind}')`);
    if(kind==='deleted') {
        assert.equal(f.run('record().lastJudgment'),null);
        assert.equal(f.run('activeInjectionPayload'),'');
    } else {
        assert.equal(f.run('record().lastJudgment.payload'),payload,'changing only the new output preserves the input verdict');
        assert.equal(server.chat.pendingPlan.outputText,f.ctx.chat[1].mes);
    }
    if(kind!=='deleted') {
        f.ctx.chat[0].mes='A different user request.';
        await f.run("onAssistantOutputChanged(0,'edited')");
        assert.equal(f.run('record().lastJudgment'),null,'edited source invalidates the verdict');
        assert.equal(f.run('activeInjectionPayload'),'');
        assert.equal(server.chat.lastJudgment,null);
    }
}

{
    const {f,prompts}=setup();
    await f.run('runJudge({force:true})');
    let release,entered,first=true;
    const reached=new Promise(resolve=>entered=resolve);
    f.sandbox.setExtensionPrompt=async(key,text)=>{
        prompts.set(key,text);
        if(first){first=false;entered();await new Promise(resolve=>release=resolve);}
    };
    const applying=f.run('applyStoredInjection()');
    await reached;
    f.run('record().lastJudgment=null;');
    release();
    await assert.rejects(applying,{name:'StaleRunError'});
    assert.equal(f.run('activeInjectionPayload'),'');
    assert.equal(prompts.get(f.run('INJECT_KEY')),'','interrupted partial prompt is removed');
}

{
    const {f,prompts}=setup();
    await f.run('runJudge({force:true})');
    f.run('record().lastJudgment=null;');
    assert.equal(await f.run('reconcileInjection()'),true);
    assert.equal(f.run('activeInjectionPayload'),'');
    assert.equal(prompts.get(f.run('INJECT_KEY')),'');
    assert.equal(f.run("diagnosticEvents.at(-1).stage"),'orphaned_injection_cleared');
}

{
    const {f,server}=setup();
    let release,entered,first=true;
    const reached=new Promise(resolve=>entered=resolve), fetch=f.sandbox.fetch;
    f.sandbox.fetch=async(url,options)=>{
        if(url.endsWith('/transaction')&&first){first=false;entered();await new Promise(resolve=>release=resolve);}
        return fetch(url,options);
    };
    const saving=f.run('saveSession(stateChatKey(),record(),[])');
    await reached;
    f.run('record().preferences.characterVolume="detailed";');
    const newer=f.run('persistChat()');
    release();
    await Promise.all([saving,newer]);
    assert.equal(server.chat.preferences.characterVolume,'detailed');
    assert.equal(f.run('record().preferences.characterVolume'),'detailed','late save completion preserves newer memory');
}

{
    const {f,prompts}=setup();
    await f.run('runJudge({force:true})');
    f.sandbox.fetch=async()=>({ok:false,status:500,json:async()=>({error:'save failed'})});
    await assert.rejects(f.run('endActiveEvent()'),/save failed/);
    assert.equal(f.run('record().lastJudgment'),null);
    assert.equal(f.run('activeInjectionPayload'),'','save failure cannot leave an orphan injection');
    assert.equal(prompts.get(f.run('INJECT_KEY')),'');
}

{
    const {f}=setup();
    f.run('record().eventProfile={title:"old event"};');
    let release,entered,first=true;
    const reached=new Promise(resolve=>entered=resolve), judge=f.sandbox.testJev;
    f.sandbox.testJev=async request=>{
        if(first){first=false;entered();await new Promise(resolve=>release=resolve);}
        return judge(request);
    };
    f.run('callJev=testJev;');
    const automatic=f.run("onBeforeGeneration('normal',{},false)");
    await reached;
    await f.run('endActiveEvent()');
    release();
    await automatic;
    assert.equal(f.run('record().eventProfile'),null);
    assert.equal(f.run('record().lastJudgment'),null,'in-flight automatic judgment cannot resurrect a reset state');
    assert.equal(f.run('activeInjectionPayload'),'');
}

{
    const {f}=setup();
    let release,entered,first=true;
    const reached=new Promise(resolve=>entered=resolve), judge=f.sandbox.testJev;
    f.sandbox.testJev=async request=>{
        if(first){first=false;entered();await new Promise(resolve=>release=resolve);}
        return judge(request);
    };
    f.run('callJev=testJev;');
    const cancelled=f.run('runJudge()');
    await reached;
    f.run('jobs.invalidate();');
    const restarted=f.run('runJudge()');
    release();
    assert.equal(await cancelled,null);
    assert.ok((await restarted)?.payload,'a cancelled same-input promise cannot swallow a new run');
}

{
    const {f,server}=setup();
    await f.run('runJudge({force:true})');
    let release,entered,first=true;
    const reached=new Promise(resolve=>entered=resolve), fetch=f.sandbox.fetch;
    f.sandbox.fetch=async(url,options)=>{
        if(url.endsWith('/chat')&&first){first=false;entered();await new Promise(resolve=>release=resolve);return {ok:false,status:500,json:async()=>({error:'first preference failed'})};}
        return fetch(url,options);
    };
    const failing=f.run('savePreference("characterVolume","detailed")');
    await reached;
    const succeeding=f.run('savePreference("developmentStyle","dynamic")');
    release();
    const result=await Promise.allSettled([failing,succeeding]);
    assert.deepEqual(result.map(item=>item.status),['rejected','fulfilled']);
    assert.equal(f.run('record().preferences.developmentStyle'),'dynamic');
    assert.equal(f.run('record().lastJudgment'),null,'failure of one preference cannot resurrect a judgment invalidated by another');
    assert.equal(f.run('activeInjectionPayload'),'');
    assert.equal(server.chat.preferences.characterVolume,f.run('record().preferences.characterVolume'),'queued settings must agree with the failure rollback');
}

{
    const {f}=setup();
    f.run('record().marker="preserve";');
    f.sandbox.fetch=async()=>({ok:false,status:500,json:async()=>({error:'transaction failed'})});
    await assert.rejects(f.run('saveSession(stateChatKey(),{marker:"failed reset"},[])'),/transaction failed/);
    assert.equal(f.run('record().marker'),'preserve','failed transaction restores the prior unchanged memory');
}

console.log('Judgment lifecycle passed: automatic/manual panel reads, output/source changes, migration, server readback, partial applies, orphan cleanup, late saves, failed saves, reset cancellation and same-input restart.');
