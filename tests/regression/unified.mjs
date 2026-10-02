import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fixture } from './audit-v012.mjs';
import { readCharm, readCharacterLorebooks, linkedCharacterBooks, selectCharacterLoreEntries, mergeMemory, memoryStatusText } from '../../src/memory/context.js';
import { migrateKnowledge, continuityView, assignContinuity } from '../../src/storage/knowledge.js';
import { displayValue } from '../../src/ui/presentation.js';
const require=createRequire(import.meta.url);
const storage=require('../../server-plugin/storage.cjs');

assert.equal(displayValue({},'new','new_internal_code').includes('new_internal_code'),false);

let calls=0;
const charm=await readCharm({getStoryContext:async()=>{calls++;return 'Earlier promise.\n'+ 'Long memory. '.repeat(1000)+'\nUnresolved obligation.';}},{identity:'A',isCurrent:()=>true,maxChars:800});
assert.equal(calls,1);assert.equal(charm.status,'limited');assert.ok(charm.entries[0].text.length<=800);assert.match(charm.entries[0].text,/Unresolved obligation/);
assert.equal((await readCharm({},{})).status,'unavailable');
assert.equal((await readCharm({getStoryContext:()=>''},{identity:'A',isCurrent:()=>true})).status,'empty');
assert.equal((await readCharm({getStoryContext:()=>new Promise(()=>{})},{identity:'A',isCurrent:()=>true,timeoutMs:5})).status,'timeout');
assert.equal((await readCharm({getStoryContext:()=> 'old room'},{identity:'A',isCurrent:()=>false})).status,'stale');
const loreContext={characterId:1,characters:[null,{avatar:'Hunter.png',data:{extensions:{world:'Main Book'}}}]};
const loreModule={world_info:{charLore:[{name:'Hunter',extraBooks:['Side Book','Main Book']}]},loadWorldInfo:async name=>({entries:name==='Main Book'?{1:{uid:1,key:['council'],content:'The council meets tomorrow.'},2:{uid:2,key:['secret'],content:'Unrelated secret.'}}:{3:{uid:3,constant:true,content:'The house belongs to Hunter.'},4:{uid:4,constant:true,content:'Disabled.',disable:true}}})};
assert.deepEqual(linkedCharacterBooks(loreContext,loreModule.world_info),['Main Book','Side Book']);
assert.equal(selectCharacterLoreEntries([{uid:1,world:'test',content:'One fact.',key:['council']},{uid:2,world:'test',content:'Secret.',disable:true,constant:true}],'A','Visit the council').entries.length,1);
const lore=await readCharacterLorebooks(loreModule,loreContext,{identity:'A',recentRoleplay:'The council convenes.',isCurrent:()=>true});
assert.equal(lore.status,'ready');assert.equal(lore.entries.length,2);assert.ok(lore.entries.every(e=>e.nature==='linked_character_reference'));
assert.equal((await readCharacterLorebooks({...loreModule,world_info:{charLore:[]}},loreContext,{identity:'A',recentRoleplay:'Nothing relevant.',isCurrent:()=>true})).status,'unmatched');
assert.equal(mergeMemory(charm,lore,'B').entries.length,0);
assert.equal((await readCharacterLorebooks(loreModule,loreContext,{identity:'A',recentRoleplay:'council',isCurrent:()=>false})).status,'stale');
assert.equal((await readCharacterLorebooks({...loreModule,loadWorldInfo:()=>new Promise(()=>{})},loreContext,{identity:'A',recentRoleplay:'council',isCurrent:()=>true,timeoutMs:5})).status,'timeout');

// Linked books use key conditions and character filters without losing healthy books to a failed read.
{
    const select = (entry, text, options={}) => selectCharacterLoreEntries([{uid:1,world:'book',content:'Reference',key:['council'],...entry}], 'A', text, options).entries.length;
    assert.equal(select({keysecondary:['secret'],selective:true},'council'),0);
    assert.equal(select({keysecondary:['secret'],selective:true},'council secret'),1);
    assert.equal(select({keysecondary:['secret'],selective:true,selectiveLogic:2},'council secret'),0);
    assert.equal(select({keysecondary:['secret','door'],selective:true,selectiveLogic:3},'council secret'),0);
    assert.equal(select({keysecondary:['secret','door'],selective:true,selectiveLogic:1},'council secret'),1);
    assert.equal(select({key:['/council/i']},'COUNCIL'),1);
    assert.equal(select({caseSensitive:true},'COUNCIL'),0);
    assert.equal(select({matchWholeWords:true},'councillor'),0);
    assert.equal(select({key:['{{char}}']},'Hunter arrives',{char:'Hunter'}),1);
    assert.equal(select({constant:true,characterFilter:{names:['Hunter'],isExclude:true}},'',{characterKey:'Hunter'}),0);
    assert.equal(select({constant:true,characterFilter:{tags:['students']}},'',{characterTags:['staff']}),0);
    const partial = await readCharacterLorebooks({...loreModule,loadWorldInfo:async name=> name==='Main Book' ? loreModule.loadWorldInfo(name) : null},loreContext,{identity:'A',recentRoleplay:'council',isCurrent:()=>true});
    assert.equal(partial.status,'partial'); assert.equal(partial.entries.length,1);
    assert.match(memoryStatusText({lorebookMemory:true},{lorebook:partial.status}),/일부 책 읽기 실패/);
    assert.match(memoryStatusText({}, {lorebook:'ready'}),/로어북: 사용 안 함/);
    assert.match(memoryStatusText({lorebookMemory:true}),/다음 판독에서 확인/);
}

// Preference changes invalidate future routing, but retain an output that still needs verification.
{
    const f=fixture();f.ctx.chat=[{is_user:true,mes:'Open it.'},{is_user:false,mes:'He opens it.'}];
    f.run('record(true).pendingPlan={inputKey:"old",outputText:"He opens it.",status:"awaiting_verification"};');
    await f.run('savePreference("judgmentStyle","active")');
    assert.equal(f.run('record().pendingPlan.outputText'),'He opens it.');
    f.run('activeGenerationCycle={mode:"rp",inputKey:"new"};');
    f.ctx.chat.push({is_user:true,mes:'Continue.'},{is_user:false,mes:'Unjudged later output.'});
    await f.run('onCharacterMessageReceived(3)');
    assert.equal(f.run('record().pendingPlan.outputText'),'He opens it.');
    f.run('record().pendingPlan={inputKey:"new",status:"awaiting_output"};');
    await f.run('savePreference("judgmentStyle","balanced")');
    assert.equal(f.run('record().pendingPlan'),null);
}

// Reserved memory wiring ignores book changes without invalidating RP judgment.
{
    const f=fixture();f.ctx.characters=loreContext.characters;
    f.sandbox.loreModule=loreModule;
    f.run('worldInfoModule=loreModule; record(true).preferences.lorebookMemory=true; record().lastJudgment={inputKey:"old"}; record().pendingPlan={outputText:"Actual output"};');
    const before=f.run('sourceRevisionKey(record(),selectedWorld())');
    await f.run('onLorebookUpdated("Main Book",{entries:{1:{content:"Updated fact"}}})');
    assert.equal(f.run('sourceRevisionKey(record(),selectedWorld())'),before);
    assert.equal(f.run('record().lastJudgment.inputKey'),'old');
    assert.equal(f.run('record().pendingPlan.outputText'),'Actual output');
}
const personState={continuity:{knowledge:[{factId:'letter',character:'Alice',source:'observed'}]}};
migrateKnowledge(personState);assert.equal(personState.continuity.knowledge.length,0);assert.equal(continuityView(personState).knowledge[0].character,'Alice');
assignContinuity(personState,{items:[],knowledge:[{factId:'letter',character:'Alice',source:'observed'},{factId:'rumor',character:'Bob',source:'reported'}]});assert.equal(personState.characterState.knowledge.length,2);assert.equal(personState.continuity.knowledge.length,0);

const directory=await mkdtemp(join(tmpdir(),'scene-reader-v013-'));
try {
    const file=join(directory,'test.json');await writeFile(file,'broken');await assert.rejects(storage.readJson(file,{}),/잘못된 JSON/);assert.equal(await readFile(file,'utf8'),'broken');
    for(const path of ['../x.json','..\\x.json','C:\\x.json','settings.json/child.json','backups/a.json','settings.json:stream','reasoner-secret:stream.json','reasoner-foo\\..\\secrets.json'])assert.throws(()=>storage.validateSnapshot({schemaVersion:1,files:[{path,text:'{}'}]}));
    assert.throws(()=>storage.validateSnapshot({schemaVersion:1,files:[{path:'settings.json',text:'bad'}]}));
    const exported=storage.portableSnapshot({schemaVersion:1,files:[{path:'secrets.json',text:'{"jevKey":"secret"}'},{path:'settings.json',text:'{"owner":{"prompt":"private text","unlocked":true}}'},{path:'sessions/'+ 'a'.repeat(64)+'.json',text:'{"chat":{"lastJudgment":{"payload":"private text"},"other":"private text"}}'}]});
    assert.equal(JSON.stringify(exported).includes('secret'),false);assert.equal(JSON.stringify(exported).includes('private text'),false);
    await storage.writeJsonAtomic(file,{valid:true});assert.equal((await readdir(directory)).some(f=>f.endsWith('.tmp')),false);
} finally {await rm(directory,{recursive:true,force:true});}

// Actual orchestrator: Jev -> coordinator -> injection -> next-output verification -> commit.
{
    const f=fixture(); f.ctx.chat=[{is_user:true,mes:'Open the door.'}];
    f.sandbox.mockJev=async body=>({answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>[key,{choice:key.startsWith('verification_')?'fulfilled':({primary_focus:'direct',direct_execution:'yes',scene_state:'active',event_state:'none',npc_presence:'none',context_change_source:'none'}[key] || Object.keys(q.criteria)[0]),confidence:1}]))});
    f.run('callJev=mockJev; record(true);');
    await f.run('runJudge({force:true})');
    assert.equal(f.run('record().pendingPlan.status'),'awaiting_output');
    assert.equal(f.run('record().lastVerification'),undefined);
    f.ctx.chat.push({is_user:false,mes:'Hunter opens the door and enters.'});await f.run('onCharacterMessageReceived(1)');
    assert.equal(f.run('record().pendingPlan.status'),'awaiting_verification');
    f.ctx.chat.push({is_user:true,mes:'She follows him inside.'});await f.run('runJudge({force:true})');
    assert.equal(f.run('record().lastVerification.verification.direct'),'fulfilled');
    assert.equal((await f.run('loadStateHistory()')).length,1);
    const saved=f.run('JSON.stringify(record().relationshipState)');
    f.ctx.chat.push({is_user:true,mes:'(OOC: Explain the injection.)',extra:{ooc_chat:true,ooc_instruction:'not the body'}});
    await f.run("onBeforeGeneration('normal',{},false)");
    f.ctx.chat.push({is_user:false,mes:'This is an explanation, not RP.'});await f.run('onCharacterMessageReceived(4)');
    assert.equal(f.run('JSON.stringify(record().relationshipState)'),saved);
}
console.log('Unified regression passed: source-grounded profiles, memory, per-person knowledge, backup safety, complete decision lifecycle.');
// Failed scene persistence cannot commit staged observations or leave the previous injection active.
{
    const f=fixture();f.ctx.chat=[{is_user:true,mes:'She enters the station.'}];
    f.run('record(true).relationshipState.trust="old-trust"; activeInjectionPayload="old injection";');
    f.sandbox.mockJev=async body=>({answers:Object.fromEntries(Object.entries(body.questions).map(([k,q])=>[k,{choice:Object.keys(q.criteria)[0],confidence:1}]))});
    f.run('callJev=mockJev;');
    f.sandbox.fetch=async()=>{throw Error('disk unavailable');};
    await assert.rejects(f.run('runJudge({force:true})'),/disk unavailable/);
    assert.equal(f.run('record().relationshipState.trust'),'old-trust');
    assert.equal(f.run('record().pendingPlan'),null);assert.equal(f.run('activeInjectionPayload'),'');
}
// Editing before retained history invalidates derived facts, but preserves user configuration.
{
    const f=fixture();f.ctx.chat=Array.from({length:30},(_,i)=>({is_user:i%2===0,mes:'message '+i}));
    f.run('var r=record(true); r.preferences.developmentStyle="dynamic"; r.relationshipState.trust="invalid"; stateHistoryCache.set(stateChatKey(),[{assistantIndex:21,plan:{chatCount:21},before:{relationshipState:{trust:"also invalid"}}}]);');
    await f.run('rollbackChangedOutput(1,"edited")');
    assert.equal(f.run('record().preferences.developmentStyle'),'dynamic');
    assert.equal(f.run('record().relationshipState'),undefined);
    assert.equal((await f.run('loadStateHistory()')).length,0);
}
// Independent long operations own their toast; old completion timers cannot erase new progress.
{
    const f=fixture();let seq=0;const timers=new Map();
    f.sandbox.setTimeout=(fn)=>{timers.set(++seq,fn);return seq;};f.sandbox.clearTimeout=id=>timers.delete(id);
    const toast=()=>({remove(){this.removed=true;},find(){return {text(){}}},toggleClass(){}});
    f.sandbox.window.toastr={info:toast,success:toast,error:toast};
    f.run('actualUpdateActivity("scene"); actualUpdateActivity("sheet",{owner:"sheet"}); actualUpdateActivity("done",{done:true}); actualUpdateActivity("next scene");');
    assert.equal(timers.size,0);assert.equal(f.run('activityToasts.size'),2);
    f.run('actualUpdateActivity("saved",{done:true,owner:"sheet"});');
    [...timers.values()][0]();assert.equal(f.run('activityToasts.has("scene")'),true);assert.equal(f.run('activityToasts.has("sheet")'),false);
}
console.log('Failure/rollback/UI regression passed: failed writes, expired snapshots, edited sheets, overlapping progress.');
// Reuse is tied to the original USER/OOC, selected range, settings and sources.
{
    const f=fixture();f.ctx.chat=[{is_user:true,mes:'Enter. (OOC: No reconciliation.)'}];
    f.run('var r=record(true); r.pendingPlan={chatCount:1}; r.lastJudgment={inputKey:currentInputKey(),contextKey:recentContext().contextKey,sourceKey:sourceRevisionKey(r,selectedWorld(r))};');
    f.ctx.chat.push({is_user:false,mes:'A different swipe.'});
    assert.equal(f.run('cachedJudgmentMatches(record(),recentContext(),currentInputKey(),true)'),true);
    f.ctx.chat[0].mes='Enter. (OOC: Reconcile this time.)';
    assert.equal(f.run('cachedJudgmentMatches(record(),recentContext(),currentInputKey(),true)'),false);
    f.ctx.chat[0].mes='Enter. (OOC: No reconciliation.)';
    f.run('record().preferences.relationshipPace="fast";');
    assert.equal(f.run('cachedJudgmentMatches(record(),recentContext(),currentInputKey(),true)'),false);
}
console.log('Reuse/source regression passed: same swipe, changed OOC, changed pacing, separate person knowledge.');
