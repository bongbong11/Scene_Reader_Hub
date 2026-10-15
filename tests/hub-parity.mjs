import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const baseline=JSON.parse(await readFile(new URL('./fixtures/upstream-parity.json',import.meta.url),'utf8'));
import {fixture as hubFixture} from './regression/audit-v012.mjs';
const OriginalDate=Date,originalRandom=Math.random;
const fixed=Date.parse('2026-10-02T13:00:00Z');
globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
Math.random=()=>0.2;
function normalize(value){return JSON.parse(JSON.stringify(value));}
// Archived storage domains and identifiers remain compatible. Classification
// changes have explicit end-to-end coverage in the routing and draw tests.
try {

 for(const {scenario,outcome:expected} of baseline.baselines) {  const outcomes=[];
  for(const makeFixture of [hubFixture]) {
   const f=makeFixture(),requests=[],prompts={};
   f.sandbox.Date=globalThis.Date;
   f.ctx.chat=[{is_user:true,mes:'I open the office door and greet Hunter.'}];
   f.sandbox.scenario=normalize(scenario);
   f.sandbox.mockJev=async body=>{
    requests.push(normalize(body));
    return {model:'jev-latest',answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>{
     let choice=Object.keys(q.criteria||{})[0];
     if(key==='scene_status')choice=scenario.phase==='active'?'explicit_begin':scenario.phase==='ended'?'ended':'ordinary';
     else if(key==='scene_level')choice=scenario.level||'0';
     else if(key==='scene_phase')choice=scenario.phase||'normal';
     else if(key==='scene_evidence')choice=Object.keys(q.criteria).find(x=>x!=='none')||'none';
     else if(key==='scene_participants')choice='none';
     else if(q.criteria?.none)choice='none';
     else if(q.criteria?.no)choice='no';
     else if(q.criteria?.hold)choice='hold';
     return [key,q.type==='noul'?{noul:0,confidence:1}:{choice,confidence:1}];
    }))};
   };
   f.sandbox.setExtensionPrompt=async(key,value)=>{prompts[key]=value;};
   f.run('record(true);Object.assign(record().preferences,scenario.preferences);record().preferences.newGenerationEnabled=false;macroAvailable=true;callJev=mockJev;');
   const result=await f.run('runJudge({force:true})');
   assert.ok(result,scenario.name+' completes');
   outcomes.push({judgment:normalize(result),chat:normalize(f.run('record()')),requests,prompts});
  }
  // Transport changes intentionally; compare original judgment/storage semantics.
  const observed=outcomes[0];
  // Classification and injection changed intentionally. Compare the persisted
  // unrelated domains and transport identity against the archived baseline.
  for(const key of ['characterState','backgroundEvents','advancedEntities','continuity','pendingContinuityCandidates','nonRpOutputIndices'])assert.deepEqual(observed.chat[key],expected.chat[key],scenario.name+': preserved '+key);
  assert.equal(observed.judgment.worldPayload,expected.judgment.worldPayload);
  assert.equal(observed.judgment.worldId,expected.judgment.worldId);
  assert.deepEqual(observed.judgment.worldSelection,expected.judgment.worldSelection);
  assert.equal(observed.judgment.sceneIntimacy.route,expected.judgment.sceneIntimacy.route);
  assert.equal(observed.judgment.inputKey,expected.judgment.inputKey);
  assert.equal(observed.judgment.contextKey,expected.judgment.contextKey);
  assert.equal(observed.requests.length,expected.requests.length);
  assert.equal(observed.judgment.decisionContract,3);
  assert.ok(observed.requests[0].questions.scene_status);
  assert.ok(!observed.requests[0].questions.scene_level);
  for(const key of ['scene-reader-router','scene-reader-world'])if(observed.prompts[key])assert.equal(observed.prompts[key],key==='scene-reader-router'?observed.judgment.payload:observed.judgment.worldPayload);

 }
} finally {globalThis.Date=OriginalDate;Math.random=originalRandom;}
console.log('Hub parity passed: normal, advanced, paused and preset paths preserve storage domains, world payload and request identity; classification changes are checked separately.');
