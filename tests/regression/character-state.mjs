import assert from 'node:assert/strict';
import { createOutputLifecycle } from '../../src/app/output-lifecycle.js';
import { stateCollectorMode, stateRoster } from '../../src/characters/state-collector.js';
import { mainOutputStatePrompt, collectMainOutputState } from '../../src/characters/state-main-output.js';
import { collectProfileOutputState } from '../../src/characters/state-profile-output.js';
import { latestStateForChat, storeStateEvent, dropStateEventsFrom, extractStateBlock, stateForEntry } from '../../src/characters/state-contract.js';
import { buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from '../../src/characters/live.js';
import { createRecordBank, recordBankIsCurrent } from '../../src/characters/records.js';
import { fixture } from './audit-v012.mjs';

const fingerprint = text => `fp:${text}`;
const store = { enabled: true, characters: [{ id: 'rowan', kind: 'character', name: 'Rowan' }], persona: { id: 'morgan', kind: 'persona', name: 'Morgan' }, npcs: [{ id: 'felix', kind: 'npc', name: 'Felix', trackArousal: false }, { id: 'ellis', kind: 'npc', name: 'Ellis', trackArousal: true }] };
const judgment = { characterTrace: [{ id: 'rowan', presence: 'active' }, { id: 'felix', presence: 'active' }, { id: 'ellis', presence: 'background' }, { id: 'morgan', presence: 'absent' }] };
const roster = stateRoster(store, { allowUserImpersonation: false }, judgment);
assert.deepEqual(roster.map(person => [person.id, person.trackArousal]), [['rowan', true], ['felix', false], ['ellis', true]]);
assert.equal(mainOutputStatePrompt(roster).includes('Felix (moods only)'), true);
const STATE_COLLECTOR_MODE = stateCollectorMode({});
assert.equal(STATE_COLLECTOR_MODE, 'main-output');
assert.equal(stateCollectorMode({profileEmotionJudgment:true}), 'profile-output');
const legacyEntry = { id: 'legacy-rowan', kind: 'character', name: 'Rowan', source: 'Rowan guards his privacy.', selectedLore: [] };
legacyEntry.recordBank = createRecordBank({ entity_type: 'character', entity_name: 'Rowan', intimacy_reference: { text: '', source_ids: [] }, records: [{ type: 'core', target: '', when: ['privacy'], rule: 'Rowan guards his privacy.', modality: 'tendency', basis: 'explicit', source_ids: ['S001'], knowledge_domain: 'none', knowledge_state: 'none' }] }, legacyEntry, 'legacy-test');
legacyEntry.recordBank.coreFingerprint = 'a47ce2f4e7c738b1095044067ff9a33661f2ee5235b00a2fd77891a8d1fbedd6';
legacyEntry.recordBank.compilerVersion = '1.1.0';
assert.equal(recordBankIsCurrent(legacyEntry), true, 'prior release banks remain usable after the compiler prompt update');

const chat = [{ is_user: true, mes: 'Continue.' }, { is_user: false, mes: 'Rowan turns away.\n[[SR_STATE]]\nC0|a38|c60|anger25@Felix|fear40\nC1|anger50@Rowan\n[[/SR_STATE]]' }];
const rec = { pendingPlan: { inputKey: 'input-1' }, preferences: {} };
let saveCount = 0;
const deps = {
    STATE_COLLECTOR_MODE, STATE_CAPTURE_KEY: 'test-state', INJECT_KEY: 'test-main', WORLD_INJECT_KEY: 'test-world', IN_CHAT: 1, SYSTEM_ROLE: 0,
    activeGenerationCycle: { mode: 'rp', chatKey: 'room', inputKey: 'input-1', stateRoster: roster, stateCaptureEnabled: true },
    settings: { enabled: true }, getContext: () => ({ chat }), stateChatKey: () => 'room', record: () => rec,
    collectMainOutputState, storeStateEvent, latestStateForChat, stableFingerprint: fingerprint,
    messageSnapshots: new Map(), messageSnapshot: messages => messages.map(message => message.mes),
    document: {getElementById:()=>null},
    persistChat: async () => { saveCount++; }, renderAll: () => {},
    selectedWorld: () => null, setExtensionPrompt: async () => {}, stateRoster, characterStore: store,
    mainOutputStatePrompt, isStreamingEnabled: () => false,
};
const lifecycle = createOutputLifecycle(deps);
await lifecycle.onCharacterMessageReceived(1);
assert.equal(chat[1].mes, 'Rowan turns away.');
assert.equal(rec.pendingPlan.outputText, chat[1].mes);
assert.equal(rec.characterStateEvents[0].states[0].values.a, 38);
assert.equal(rec.characterStateEvents[0].states[0].targets.anger, 'Felix');
assert.equal(rec.characterStateEvents[0].states[1].values.anger, 50);
assert.equal(saveCount, 1);
assert.equal(latestStateForChat(rec, chat, fingerprint).length, 2);
rec.nonRpOutputIndices = [2];
chat.push({ is_user: false, mes: 'Out of character.' });
assert.equal(latestStateForChat(rec, chat, fingerprint).length, 2, 'OOC output does not replace the last RP state');
chat.pop();

const broken = extractStateBlock('RP text\n[[SR_STATE]]\nC0|a38|c60', roster);
assert.equal(broken.text, 'RP text');
assert.equal(broken.error, 'closing');
assert.equal(extractStateBlock('RP\n[[SR_STATE]]\nC1|a38|c60\n[[/SR_STATE]]', roster).error, 'format');
assert.equal(extractStateBlock('RP\n[[SR_STATE]]\nC0|a38|c60\nC1\n[[/SR_STATE]]', roster).error, '', 'neutral NPC can omit all zero moods');
for (const line of ['C0|a101|c60', 'C0|a38', 'C9|a38|c60', 'C0|a38|a39|c60']) assert.equal(extractStateBlock(`RP\n[[SR_STATE]]\n${line}\n[[/SR_STATE]]`, roster).error, 'format');

const info = '<Scene_Info><small>Time: 14:08</small></Scene_Info>';
for (const line of ['C0 | a38% | c60% | anger25', ' c0 | A: 38 | C = 60 | Anger 25 @ Felix ', 'C0|a38|c60|anger25']) {
    const result = extractStateBlock(`RP\n[[SR_STATE]]\n${line}\n[[/SR_STATE]]\n${info}`, roster);
    assert.equal(result.error, '', 'unambiguous notation variants and preset info after metadata are accepted');
    assert.equal(result.states[0].values.a, 38);
    assert.equal(result.states[0].values.anger, 25);
    assert.equal(result.text, `RP\n${info}`, 'preset info survives metadata removal');
}
const fenced = extractStateBlock('RP\n```text\n[[sr_state]]\nC0|a38|c60\n[[/sr_state]]\n```\n'+info,roster);
assert.equal(fenced.error,'');
assert.equal(fenced.text,'RP\n'+info,'metadata code fences are removed without removing preset content');
for (const line of ['C0|a-1|c60','C0|a38.5|c60','C0|a38|A39|c60','Unknown|a38|c60','C0|a38|c60|unknown25']) {
    const result=extractStateBlock(`RP\n[[SR_STATE]]\n${line}\n[[/SR_STATE]]\n${info}`,roster);
    assert.equal(result.error,'format');
    assert.equal(result.text,`RP\n${info}`,'invalid values do not destroy the following RP info');
}
const doubled=extractStateBlock('RP\n[[SR_STATE]]C0|a38|c60[[/SR_STATE]]\n[[SR_STATE]]C0|a90|c10[[/SR_STATE]]\n'+info,roster);
assert.equal(doubled.error,'trailing','conflicting blocks are not arbitrarily selected');
assert.deepEqual(doubled.states,[]);
assert.equal(doubled.text,'RP\n'+info);
assert.match(mainOutputStatePrompt(roster),/\[\[SR_STATE\]\]\nC0\|a38\|c60\|anger25\n\[\[\/SR_STATE\]\]/,'prompt uses an actual roster code and explicit line breaks');
for (const body of [
    'Rowan | arousal:38% | self_control=60 | anger25',
    '| C0 | a38.0 | c60 | anger25 |',
    JSON.stringify({states:[{code:' c0 ',arousal:'38%',selfControl:60,anger:25}]}),
    JSON.stringify([{id:'rowan',values:{a:38,c:60,anger:25}}]),
    JSON.stringify({name:'Rowan',a:38,c:60,anger:25}),
    '```json\n'+JSON.stringify({states:[{code:'C0',a:38,c:60,anger:25}]})+'\n```',
]) {
    const result=extractStateBlock(`RP\n[[SR_STATE]]\n${body}\n[[/SR_STATE]]`,roster);
    assert.equal(result.error,'',body);
    assert.equal(result.states[0].values.a,38);
    assert.equal(result.states[0].values.anger,25);
}
const partial=extractStateBlock('RP\n[[SR_STATE]]\nC0|a38\nC1|anger25\n[[/SR_STATE]]',roster);
assert.equal(partial.error,'','one invalid actor does not discard another actor');
assert.deepEqual(partial.states.map(state=>state.id),['felix']);
assert.deepEqual(partial.diagnostics.reasons,['missing_fields']);
assert.equal(partial.diagnostics.accepted,1);
assert.equal(partial.diagnostics.rejected,1);
assert.doesNotMatch(JSON.stringify(partial.diagnostics),/Rowan|Felix|RP|a38/,'diagnostics contain structure and reason codes, not raw content');
const duplicatePerson=extractStateBlock('RP\n[[SR_STATE]]C0|a38|c60\nRowan|a90|c10\nC1|joy20[[/SR_STATE]]',roster);
assert.deepEqual(duplicatePerson.states.map(state=>state.id),['felix'],'duplicate identities cannot overwrite one another');
assert.deepEqual(duplicatePerson.diagnostics.reasons,['duplicate_person']);
assert.equal(extractStateBlock('RP\n[[SR_STATE]]C0|a101|c60[[/SR_STATE]]',roster).diagnostics.reasons[0],'out_of_range');

const plan = [{ index: 0, id: 'rowan', name: 'Rowan', kind: 'character', recordMode: true, sourceVisibleToMain: true,
    profileCandidates: [], contextCandidates: [], profileSlotLimit: 4, core: { excerpts: [] }, priorState: rec.characterStateEvents[0].states[0] }];
assert.ok(buildCharacterTurnQuestions(plan).character_0_affect_a);
assert.ok(buildCharacterTurnQuestions(plan).character_0_affect_anger);
const resolved = resolveLiveCharacterPlan(plan, { character_0_presence: 'active', character_0_affect_a: 'visible', character_0_affect_anger: 'inward', character_0_affect_fear: 'none' });
const injected = buildCharacterInjection(resolved);
assert.match(injected.text, /sexual arousal 38%/);
assert.match(injected.text, /anger 25% toward Felix/);
assert.doesNotMatch(injected.text, /fear 40%/);
assert.equal(buildCharacterInjection(resolveLiveCharacterPlan(plan, { character_0_presence: 'absent', character_0_affect_a: 'active' })).text, '');
assert.equal(stateRoster({enabled:true,characters:[store.characters[0]],npcs:[]},{}, {characterTrace:[{id:'rowan',presence:'absent'}]}).length,0,'absent main character does not become an automatic state target');
const optedOut = stateForEntry({id:'felix',values:{a:70,c:40,anger:30},targets:{a:'Rowan',anger:'Ellis'}},store.npcs[0]);
assert.equal(optedOut.values.a,undefined,'disabling NPC arousal blocks previously saved arousal from future judgment');
assert.equal(optedOut.targets.a,undefined);
assert.equal(optedOut.values.anger,30);

let profileCalls = 0;
const alternate = await collectProfileOutputState({
    request: async (_service, profileId, _system, state, options) => {
        profileCalls++;
        assert.equal(profileId, 'profile-1');
        assert.deepEqual(Object.keys(state).sort(), ['output', 'people', 'recent_roleplay_context']);
        assert.deepEqual(state.recent_roleplay_context, []);
        assert.equal(state.output, 'Rowan speaks.');
        assert.equal(options.maxTokens, 1200);
        return { result: { states: [{ code: 'C0', a: 35, c: 70, anger: 10, targets: { anger: 'Felix' } }] } };
    },
    service: {}, profileId: 'profile-1', output: 'Rowan speaks.', roster,
});
assert.equal(profileCalls, 1);
assert.equal(alternate.states[0].targets.anger, 'Felix');
assert.equal(alternate.error, '');
const timeout = await collectProfileOutputState({request:()=>new Promise(()=>{}),service:{},profileId:'profile-1',output:'Reply.',roster,timeoutMs:5});
assert.equal(timeout.error,'timeout','fallback cannot hold the next turn forever');
const failed = await collectProfileOutputState({request:async()=>{throw Error('request failed');},service:{},profileId:'profile-1',output:'Reply.',roster});
assert.equal(failed.error,'request');

// The alternative collector uses the same saved state and next-turn path without
// ever asking the RP model for an extra output block.
const fallback=fixture();
fallback.run('record(true).preferences.profileEmotionJudgment=true; characterStore.enabled=true;');
fallback.sandbox.mockRequest=async()=>({result:{states:[{code:'C0',a:20,c:80,joy:30}]}});
fallback.ctx.chat.push({is_user:false,mes:'Rowan smiles.'});
fallback.run('record(true); settings.reasonerProfileId="p"; connectionRequestService={}; requestWithConnectionProfile=mockRequest;');
fallback.sandbox.roster=roster;
fallback.run('scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Rowan smiles.",roster})');
await fallback.run('pendingProfileStateCollection');
assert.equal(fallback.run('record().characterStateEvents[0].states[0].values.joy'),30,'fallback scheduling persists into the ordinary state ledger');
let resolveLate;
fallback.sandbox.mockRequest=()=>new Promise(resolve=>{resolveLate=resolve;});
fallback.run('requestWithConnectionProfile=mockRequest; scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Rowan smiles.",roster})');
fallback.ctx.chat[0].mes='Edited reply.';
await new Promise(resolve=>setTimeout(resolve,0));
resolveLate({result:{states:[{code:'C0',a:90,c:10}]}});
await fallback.run('pendingProfileStateCollection');
assert.equal(fallback.run('record().characterStateEvents.length'),1,'late fallback cannot attach state to edited text');

fallback.ctx.chat[0].mes='Rowan smiles.';
fallback.run('scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Rowan smiles.",roster})');
fallback.run('record().preferences.profileEmotionJudgment=false;');
await new Promise(resolve=>setTimeout(resolve,0));
resolveLate({result:{states:[{code:'C0',a:90,c:10}]}});
await fallback.run('pendingProfileStateCollection');
assert.equal(fallback.run('record().characterStateEvents.some(event=>event.states.some(state=>state.values.a===90))'),false,'switching off discards a late profile result');

fallback.run('record().preferences.profileEmotionJudgment=true; scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Rowan smiles.",roster})');
let validWaitFinished=false;
const validWait=fallback.run('waitForProfileState()').then(()=>{validWaitFinished=true;});
await Promise.resolve();
assert.equal(validWaitFinished,false,'the next judgment waits for its active collector');
fallback.run('invalidateReasonerJobs(); record().characterStateCapture=null;');
assert.equal(await Promise.race([fallback.run('waitForProfileState()').then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),100))]),true,'cancelled collection does not delay the next judgment');
await new Promise(resolve=>setTimeout(resolve,0));
resolveLate({result:{states:[{code:'C0',a:90,c:10}]}});
await validWait;
assert.equal(fallback.run('record().characterStateEvents.some(event=>event.states.some(state=>state.values.a===90))'),false,'a cancelled capture cannot restore state even when the text is unchanged');

const cancelledToasts=fixture();
const cancelNotices=[];
let finishCancelled;
cancelledToasts.sandbox.window.toastr=Object.fromEntries(['info','success','warning'].map(level=>[level,message=>cancelNotices.push({level,message})]));
cancelledToasts.sandbox.roster=roster;
cancelledToasts.sandbox.requestPending=()=>new Promise(resolve=>{finishCancelled=resolve;});
cancelledToasts.ctx.chat=[{is_user:false,mes:'Reply awaiting collection.'}];
cancelledToasts.run('record(true).preferences.profileEmotionJudgment=true; characterStore.enabled=true; settings.reasonerProfileId="p"; connectionRequestService={}; requestWithConnectionProfile=requestPending; scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Reply awaiting collection.",roster});');
await new Promise(resolve=>setTimeout(resolve,0));
cancelledToasts.run('invalidateReasonerJobs(); record().characterStateEvents=[];');
finishCancelled({result:{states:[{code:'C0',a:10,c:90}]}});
await cancelledToasts.run('pendingProfileStateCollection');
assert.equal(cancelNotices.length,1,'cancelled requests never announce completion after their start notice');
assert.equal(cancelledToasts.run('record().characterStateEvents.length'),0);

const optInRoster=stateRoster(store,{allowUserImpersonation:true},{characterTrace:[{id:'morgan',presence:'active'},{id:'ellis',presence:'active'}]});
assert.deepEqual(optInRoster.map(item=>item.id),['ellis','morgan']);
assert.ok(optInRoster.every(item=>item.trackArousal));
assert.equal(stateRoster({...store,enabled:false},{allowUserImpersonation:true},judgment).length,0);

const ledger={};
for(let index=0;index<40;index++)storeStateEvent(ledger,{outputIndex:index,fingerprint:`fp:reply ${index}`,states:[{id:'rowan',values:{a:index,c:60},targets:{}}]});
assert.equal(ledger.characterStateEvents.length,12,'state history stays bounded');
const roundTrip=JSON.parse(JSON.stringify(ledger));
assert.deepEqual(roundTrip,ledger,'state and recovery history survive JSON storage');
storeStateEvent(ledger,{outputIndex:39,fingerprint:'fp:other swipe',states:[{id:'rowan',values:{a:10,c:70},targets:{}}]});
const swipeChat=Array.from({length:40},(_,index)=>({is_user:index<39,mes:`reply ${index}`}));
assert.equal(latestStateForChat(ledger,swipeChat,fingerprint)[0].values.a,39);
swipeChat[39].mes='other swipe';
assert.equal(latestStateForChat(ledger,swipeChat,fingerprint)[0].values.a,10,'selected swipe uses its own state');
swipeChat[39].mes='manually edited';
assert.deepEqual(latestStateForChat(ledger,swipeChat,fingerprint),[],'edited text cannot reuse the old state');

const alternatives={};
for(let swipeId=0;swipeId<20;swipeId++)storeStateEvent(alternatives,{outputIndex:0,swipeId,fingerprint:'fp:Same reply',states:[{id:'rowan',values:{anger:swipeId},targets:{}}]});
assert.equal(alternatives.characterStateEvents.length,20,'all alternatives of a retained message survive the history bound');
const alternativeChat=[{mes:'Same reply',swipe_id:0,swipes:Array(20).fill('Same reply')}];
assert.equal(latestStateForChat(alternatives,alternativeChat,fingerprint)[0].values.anger,0);
alternativeChat[0].swipe_id=19;
assert.equal(latestStateForChat(alternatives,alternativeChat,fingerprint)[0].values.anger,19,'same-text swipes have independent state');
dropStateEventsFrom(alternatives,0,19);
assert.equal(alternatives.characterStateEvents.length,19,'editing a swipe preserves its siblings');
assert.deepEqual(latestStateForChat(alternatives,alternativeChat,fingerprint),[],'never borrow another swipe state');
alternativeChat[0].swipe_id=0;
assert.equal(latestStateForChat(alternatives,alternativeChat,fingerprint)[0].values.anger,0);

const remoteCandidates=stateRoster(store,{}, {characterTrace:[{id:'rowan',index:0,presence:'active'},{id:'ellis',index:1,presence:'absent'},{id:'felix',index:2,presence:'absent'}],details:{character_1_presence:{selected:'background'},character_2_presence:{selected:'absent'}}});
assert.deepEqual(remoteCandidates.map(item=>item.id),['rowan','ellis'],'an uncertain background participant reaches output collection; confirmed absent people do not');
assert.match(mainOutputStatePrompt(remoteCandidates),/incoming texts and phone-call replies/);
assert.match(mainOutputStatePrompt(remoteCandidates),/predicted feeling/);

const swipeFixture=fixture();
const swipeNotices=[];
swipeFixture.sandbox.window.toastr=Object.fromEntries(['info','success','warning'].map(level=>[level,message=>swipeNotices.push({level,message})]));
const pending=[];
swipeFixture.sandbox.roster=roster;
swipeFixture.sandbox.mockRequest=()=>new Promise(resolve=>pending.push(resolve));
swipeFixture.ctx.chat=[{is_user:false,mes:'Reply A',swipe_id:0,swipes:['Reply A','Reply B']}];
swipeFixture.run('record(true).preferences.profileEmotionJudgment=true; characterStore.enabled=true; settings.reasonerProfileId="p"; connectionRequestService={}; requestWithConnectionProfile=mockRequest; scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Reply A",roster}); globalThis.jobA=pendingProfileStateCollection;');
swipeFixture.ctx.chat[0].swipe_id=1;
swipeFixture.ctx.chat[0].mes='Reply B';
await swipeFixture.run('onAssistantOutputChanged(0,"swiped")');
swipeFixture.run('scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:"Reply B",roster}); globalThis.jobB=pendingProfileStateCollection;');
pending[0]({result:{states:[{code:'C0',a:20,c:80,joy:30}]}});
await swipeFixture.run('jobA');
assert.match(swipeNotices.at(-1).message,/다른 스와이프 감정 저장 완료/,'unselected completion is identified without confusing current values');
assert.equal(swipeFixture.run('record().characterStateEvents.find(event=>event.swipeId===0).states[0].values.joy'),30,'unselected swipe completion is retained after record restoration');
assert.equal(swipeFixture.run('latestStateForChat(record(),getContext().chat,stableFingerprint).length'),0,'unselected completion never appears in the selected swipe');
pending[1]({result:{states:[{code:'C0',a:10,c:90,anger:40}]}});
await swipeFixture.run('jobB');
assert.equal(swipeFixture.run('latestStateForChat(record(),getContext().chat,stableFingerprint)[0].values.anger'),40);
swipeFixture.ctx.chat[0].swipe_id=0;
swipeFixture.ctx.chat[0].mes='Reply A';
await swipeFixture.run('onAssistantOutputChanged(0,"swiped")');
assert.equal(swipeFixture.run('latestStateForChat(record(),getContext().chat,stableFingerprint)[0].values.joy'),30,'returning to a swipe restores its values without another call');
assert.equal(pending.length,2);

// Manual collection needs no additional Jev call, handles old replies, and joins an in-flight call.
const manual=fixture();
const emotionNotices=[];
manual.sandbox.window.toastr=Object.fromEntries(['info','success','warning'].map(level=>[level,message=>emotionNotices.push({level,message})]));
manual.sandbox.testStore=store;
const manualJobs=[];
manual.sandbox.mockRequest=()=>new Promise(resolve=>manualJobs.push(resolve));
manual.ctx.chat=[{is_user:false,mes:'Rowan reads a text from Ellis.',swipe_id:0}];
manual.run('record(true).preferences.profileEmotionJudgment=true; characterStore=testStore; settings.reasonerProfileId="p"; connectionRequestService={}; requestWithConnectionProfile=mockRequest;');
const stateRevisionBefore=manual.run('sourceRevisionKey(record(),null)');
const manualA=manual.run('collectCurrentEmotion()');
const manualB=manual.run('collectCurrentEmotion()');
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(manualJobs.length,1,'manual and pending collection share one request');
assert.equal(emotionNotices.filter(item=>item.message==='감정 수집 중…').length,1,'joined requests show one start toast');
assert.notEqual(manual.run('sourceRevisionKey(record(),null)'),stateRevisionBefore,'manual refresh invalidates judgments prepared with the previous state');
manualJobs[0]({result:{states:[{code:'C0',a:10,c:90},{code:'C1'}]}});
await Promise.all([manualA,manualB]);
assert.equal(emotionNotices.filter(item=>item.level==='success').length,0,'a missing third actor is not announced as complete');
assert.match(emotionNotices.at(-1).message,/일부가 반환되지/);
assert.equal(manual.run('record().characterStateCapture.count'),2);
assert.equal(manual.run('record().characterStateEvents.length'),1);
assert.equal(manual.run('latestStateForChat(record(),getContext().chat,stableFingerprint)[1].values.anger'),0,'neutral NPC states are collected with zero moods');
manual.sandbox.mockFailure=async()=>{throw new Error('MAX_TOKENS');};
manual.run('requestWithConnectionProfile=mockFailure');
await manual.run('collectCurrentEmotion()');
assert.equal(emotionNotices.at(-1).level,'warning','failed collection displays a warning');
assert.match(emotionNotices.at(-1).message,/감정 수집 실패/);
manual.run('record().sceneIntimacy={route:"paused"}');
await assert.rejects(manual.run('collectCurrentEmotion()'),/쉬고/);
assert.equal(manualJobs.length,1,'manual collection respects the scene pause');
manual.run('record().sceneIntimacy=null; settings.enabled=false;');
await assert.rejects(manual.run('collectCurrentEmotion()'),/먼저 켜/);

const slots={};
deps.setExtensionPrompt=async(key,value)=>{slots[key]=value;};
rec.lastJudgment=judgment;
deps.STATE_COLLECTOR_MODE='profile-output';
await lifecycle.applyStoredInjection();
assert.equal(slots['test-state'],'','profile collection removes the main RP state prompt');
let scheduled=0;
let finishCollection;
deps.scheduleProfileStateCollection=()=>{scheduled++; return new Promise(resolve=>{finishCollection=resolve;});};
chat[1].mes='Rowan turns away.';
await lifecycle.onCharacterMessageReceived(1);
assert.equal(scheduled,1,'output hook starts exactly one profile collection without waiting for it');
finishCollection();
deps.STATE_COLLECTOR_MODE='main-output';
await lifecycle.applyStoredInjection();
assert.match(slots['test-state'], /SCENE_READER_STATE_CAPTURE/, 'switching off restores the main RP collector');
rec.lastJudgment={...judgment,sceneIntimacy:{route:'paused',participantIds:['rowan']}};
await lifecycle.applyStoredInjection();
assert.equal(slots['test-state'],'','the scene reader NSFW gate pauses main-model state capture');
assert.equal(deps.activeGenerationCycle.stateCollectionPaused,true);
deps.STATE_COLLECTOR_MODE='profile-output';
await lifecycle.applyStoredInjection();
chat[1].mes='The intimate scene continues.';
await lifecycle.onCharacterMessageReceived(1);
assert.equal(scheduled,1,'the scene reader NSFW gate also pauses profile collection');
assert.equal(rec.characterStateCapture.status,'paused');
rec.lastJudgment=judgment;
deps.STATE_COLLECTOR_MODE='main-output';
await lifecycle.applyStoredInjection();
assert.match(slots['test-state'], /SCENE_READER_STATE_CAPTURE/, 'state collection resumes after the scene reader gate ends');
deps.isStreamingEnabled=()=>true;
await lifecycle.applyStoredInjection();
assert.equal(slots['test-state'],'','streaming never requests hidden output metadata');
deps.isStreamingEnabled=()=>false;
deps.settings.enabled=false;
await lifecycle.applyStoredInjection();
assert.equal(slots['test-state'],'','disabled extension does not leave a state prompt behind');
chat[1].mes='Stopped reply\n[[SR_STATE]]\nC0|a38|c60\n[[/SR_STATE]]';
deps.activeGenerationCycle={mode:'disabled'};
await lifecycle.onCharacterMessageReceived(1);
assert.equal(chat[1].mes,'Stopped reply','a late response still has metadata removed after capture was disabled');
dropStateEventsFrom(rec, 1);
assert.equal(latestStateForChat(rec, chat, fingerprint).length, 0);

console.log('Character state passed: pre-render strip, malformed removal, cast scope, prior-turn Jev use, background collection and cancelled-result rejection.');
