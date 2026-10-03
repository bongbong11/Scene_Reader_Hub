import assert from 'node:assert/strict';
import {createVectorRetrieval} from '../src/retrieval/vectors.js';
import {resolveCharacterPresence} from '../src/character/presence.js';
import {applyCharacterPolicy} from '../src/decision/answers.js';
import {stateRoster} from '../src/character/state-collector.js';
import {collectProfileOutputState} from '../src/character/state-profile-output.js';
import {wholeDiagnosticReport} from '../src/debug/whole-report.js';
import {fixture} from './regression/audit-v012.mjs';

// Native insert appends IDs: a forced replacement must explicitly delete old hashes.
const banks=new Map(),calls=[],progress=[];
let insertCount=0,failAt=2,stringHashes=false;
const retrieval=createVectorRetrieval({getSettings:()=>({retrievalProvider:'transformers'}),getRequestHeaders:()=>({}),onProgress:event=>progress.push(event),
    fetch:async(url,options)=>{
        const route=url.split('/').at(-1),body=JSON.parse(options.body),key=body.source+body.collectionId;
        const stored=banks.get(key)||[];calls.push({route,body});
        if(route==='list')return {ok:true,json:async()=>stored.map(item=>stringHashes?String(item.hash):item.hash)};
        if(route==='insert'){
            if(++insertCount===failAt)return {ok:false,status:503};
            banks.set(key,[...stored,...body.items]);
        } else if(route==='delete')banks.set(key,stored.filter(item=>!body.hashes.includes(item.hash)));
        else throw new Error('maintenance must not query or judge');
        return {ok:true};
    }});
const items=Array.from({length:65},(_,index)=>({id:`R${index}`,type:'core',rule:`Synthetic bounded rule ${index}.`}));
const before=JSON.stringify(items),args={kind:'character',bankId:'synthetic-room:actor',items};
assert.equal((await retrieval.rebuild(args)).status,'fallback');
assert.equal([...banks.values()][0].length,20,'completed batch survives a later failure');
failAt=0;stringHashes=true;
const recovered=await retrieval.rebuild(args);
assert.equal(recovered.reusedCount,20);assert.equal(recovered.generatedCount,45);
const inserts=calls.filter(call=>call.route==='insert').length;
const unchanged=await retrieval.rebuild(args);
assert.equal(unchanged.reusedCount,65);assert.equal(unchanged.generatedCount,0);
assert.equal(calls.filter(call=>call.route==='insert').length,inserts,'repeat retry does not re-embed healthy records');
const changed=items.map((item,index)=>index===5?{...item,rule:'A changed synthetic rule.'}:item);
const updated=await retrieval.rebuild({...args,items:changed});
assert.equal(updated.generatedCount,1);assert.equal(updated.reusedCount,64);
assert.equal([...banks.values()][0].length,65,'changed record replaces its stale hash');
await retrieval.rebuild({...args,items:changed,forceRebuild:true});
assert.equal([...banks.values()][0].length,65,'full replacement cannot accumulate duplicate IDs');
assert.equal(JSON.stringify(items),before,'derived index recovery never alters source records');
assert.ok(progress.some(event=>event.phase==='syncing' && event.generatedCount===0));
const controller=new AbortController();controller.abort();
await assert.rejects(retrieval.rebuild({...args,signal:controller.signal}),error=>error.name==='AbortError');

const plan=[{index:0,id:'a'}];
function presence(answer,evidence){
    const details={character_0_presence:applyCharacterPolicy('character_0_presence',answer,'balanced',['absent','background','active'])};
    resolveCharacterPresence(plan,details,{character_0_participation:evidence});return details.character_0_presence;
}
assert.equal(presence({choice:'active',confidence:0.07},{choice:'direct',confidence:0.9}).effective,'active');
const weak=presence({choice:'absent',confidence:0.1},null);
assert.equal(weak.effective,'background');assert.equal(weak.presenceUncertain,true);
assert.equal(presence({choice:'active',confidence:0.1},{choice:'remote',confidence:0.9}).effective,'active');
assert.equal(presence({choice:'active',confidence:0.8},{choice:'departed',confidence:0.9}).effective,'absent');
assert.equal(presence({choice:'active',confidence:0.1},{choice:'reference',confidence:0.9}).effective,'absent');
assert.equal(presence({choice:'absent',confidence:0.95},null).effective,'absent','clear absence is preserved');
assert.equal(applyCharacterPolicy('character_0_context_access_0',{choice:'observed',confidence:0.4},'active',['observed','none']).effective,'none','participation repair does not loosen private knowledge access');
const store={enabled:true,characters:[{id:'a',kind:'character',name:'Aster'}],npcs:[{id:'b',kind:'npc',name:'Briar',trackArousal:false}]};
const malformedCapture=await collectProfileOutputState({request:async()=>({result:{}}),service:{},profileId:'synthetic',output:'A short synthetic reply.',roster:stateRoster(store,{},null,{recheckOutput:true})});
assert.equal(malformedCapture.error,'format','missing JSON states is a response format error, not a transport failure');
const unknownAbsent=await collectProfileOutputState({request:async()=>({result:{states:[{code:'C99',participation:'absent'}]}}),service:{},profileId:'synthetic',output:'A short synthetic reply.',roster:[{code:'C0',id:'a',name:'Aster',trackArousal:true}]});
assert.equal(unknownAbsent.error,'format','an unknown person cannot establish absence of a registered actor');
const judgment={characterTrace:[{id:'a',presence:'absent'},{id:'b',presence:'absent'}]};
assert.equal(stateRoster(store,{},judgment).length,0);
assert.equal(stateRoster(store,{},judgment,{recheckOutput:true}).length,2,'completed-output collector can recheck earlier routing exclusions');

const f=fixture(),requests=[];
f.ctx.chat=[{is_user:false,mes:'Aster says a short line, adjusts the lamp, and reflects quietly. A phone buzz does not establish its sender participated.'}];
f.sandbox.testStore=store;
f.sandbox.mockCollector=(_service,_profile,system,body)=>new Promise(resolve=>requests.push({system,body,resolve}));
f.run('record(true);characterStore=testStore;settings.reasonerProfileId="synthetic";connectionRequestService={};requestWithConnectionProfile=mockCollector;record().lastJudgment={characterTrace:[{id:"a",presence:"absent"},{id:"b",presence:"absent"}]};');
const first=f.run('collectCurrentEmotion()');await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(requests[0].body.people.length,2);
assert.match(requests[0].system,/Assess|assess ALL requestedFields/);
requests[0].resolve({result:{states:[{code:'C0',a:40,c:80},{code:'C1',participation:'absent'}]}});await first;
assert.equal(f.run('record().characterStateCapture.status'),'incomplete');
assert.equal(f.run('record().characterStateEvents[0].states[0].values.joy'),undefined,'missing mood is not an invented zero');
const second=f.run('collectCurrentEmotion()');await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(requests[1].body.people.length,1,'explicit absent output actor is not repeatedly recollected');
assert.deepEqual(requests[1].body.people[0].requestedFields,['anger','joy','fear','sadness']);
requests[1].resolve({result:{states:[{code:'C0',a:99,c:1,anger:0,joy:25,fear:0,sadness:0}]}});await second;
assert.equal(f.run('record().characterStateCapture.status'),'collected');
assert.equal(f.run('record().characterStateEvents[0].states[0].values.a'),40,'recovery preserves existing arousal');
assert.equal(f.run('record().characterStateEvents[0].states[0].values.c'),80);
assert.equal(f.run('record().characterStateEvents[0].states[0].values.joy'),25);
await f.run('collectCurrentEmotion()');assert.equal(requests.length,2,'completed output has no repeated request');
const record=JSON.parse(f.run('JSON.stringify(record())'));
const report=wholeDiagnosticReport({execution:{},judgment,record,chat:f.ctx.chat,fingerprint:text=>f.run(`stableFingerprint(${JSON.stringify(text)})`)});
assert.equal(report.characterStateCapture.status,'collected');
assert.equal(report.characterStateCapture.source,'profile_output');
assert.deepEqual(report.characterStateCapture.actors[0].returnedFields,['a','c','anger','joy','fear','sadness']);
assert.deepEqual(report.characterStateCapture.actors[0].zeroFields,['anger','fear','sadness']);
assert.ok(!JSON.stringify(report).includes('Aster')&&!JSON.stringify(report).includes('phone buzz'),'whole logs omit names and narrative');
console.log('Recovery and presence passed: incremental index retry, one-record update, forced replacement, cancellation, uncertain presence, direct/remote/departure evidence, independent output roster, missing-mood-only recovery, saved-score preservation, no-op and private diagnostics.');
