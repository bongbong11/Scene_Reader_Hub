import assert from 'node:assert/strict';
import {minorRoutingChoice} from '../src/decision/routing-policy.js';
import {readFile} from 'node:fs/promises';
const baseline=JSON.parse(await readFile(new URL('./fixtures/upstream-parity.json',import.meta.url),'utf8'));
import {fixture as hubFixture} from './regression/audit-v012.mjs';
const OriginalDate=Date,originalRandom=Math.random;
const fixed=Date.parse('2026-10-02T13:00:00Z');
globalThis.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};
Math.random=()=>0.2;
function normalize(value){return JSON.parse(JSON.stringify(value));}
// 0.1.3 intentionally changes draw identity, sampling and diagnostics. Preserve
// exact baseline parity for all other requests, decisions, storage and prompts;
// the new behavior has end-to-end assertions in hub-draw-opportunities.mjs.
function unchanged(value,parent='') {
 if(Array.isArray(value))return value.map(item=>unchanged(item,parent));
 if(!value||typeof value!=='object')return value==='macro'?'preset':value;
 // The preserved grievance policy is independent of the removed collector.
 if(parent==='accumulated_state'&&value.state_policy==='Preserve unresolved grievances and directed relationships unless supplied RP actually changes them. Calm, sex or cooperation alone is not forgiveness. These states do not authorize forced actions or tell another actor private information.')delete value.state_policy;
 // Creation is now a separate addition path; ordinary behavior and actual
 // injection text must still match. Creation modes have full pipeline tests.
 const excluded=new Set(['visibilityKeyV1','drawOpportunityKey','drawDiagnostics','appearanceOffer','appearance_offer','lastNpcRoll','sourceKey','scenePresetSlot','worldPresetSlot',
 'newGenerationEnabled','spontaneousMode','opportunityPreferences','opportunities','opportunityPlan','opportunityKey','new_opportunities','lastOpportunityVerification','additionBlocks','additions',
 'arrival_mode','advanced_entry','advanced_route','advanced_cause','advanced_element','advanced_move']);
 // Only low-risk expression choices intentionally stop using the old certainty threshold.
 if(minorRoutingChoice(parent,value.selected,[value.selected]))value.threshold=0;
 if(parent==='criteria')for(const key of ['create','replace'])delete value[key];
 if(typeof value.instructions==='string')value.instructions=value.instructions.replace(' This question manages existing people only. A separately offered new person uses arrival_mode; do not require existing-person routing to approve that arrival.','');
 if(typeof value.instructions==='string')value.instructions=value.instructions.replace(' For the offered new candidate, only its bounded general role competence and what it could perceive on arrival are available. A proposed entrance cannot establish prior observation, acquaintance, or hidden scene-specific access.','');
 return Object.fromEntries(Object.entries(value).filter(([key])=>!excluded.has(key)&&!(parent==='rolls'&&key==='npc')).map(([key,item])=>[key,unchanged(item,key)]));
}
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
     if(key==='scene_level')choice=scenario.level||'0';
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
  const observed=unchanged(outcomes[0]),baseline=unchanged(expected);
  if(scenario.preferences?.injectionMode==='macro') {
   delete observed.prompts['scene-reader-state-capture'];delete baseline.prompts['scene-reader-state-capture'];
  }
  assert.deepEqual(observed,baseline,scenario.name+': same Jev input, judgment, persistent state and unchanged direct prompt registrations');

 }
} finally {globalThis.Date=OriginalDate;Math.random=originalRandom;}
console.log('Hub parity passed: normal, advanced and paused judgment/storage match upstream 0.26.2; intentional draw and preset transport changes are tested separately.');
