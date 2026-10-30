import assert from 'node:assert/strict';
import {fixture} from './regression/audit-v012.mjs';
import {createRecordBank} from '../src/character/records.js';
import {FALLBACKS} from '../src/decision/answers.js';
const f=fixture(),requests=[];
f.ctx.name2='Morgan';f.ctx.chat=[{is_user:false,mes:'Morgan opens the window.',swipe_id:0},{is_user:true,mes:'I ask Morgan to stay.'}];
const actor={id:'m',kind:'character',name:'Morgan',source:'Morgan values family.',selectedLore:[]};
actor.recordBank=createRecordBank({entity_type:'character',entity_name:'Morgan',records:[{type:'value',when:['family'],target:'',rule:'Morgan values family.',modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]},actor,'independent');
let events=[{outputIndex:0,swipeId:0,fingerprint:f.run('stableFingerprint(getContext().chat[0].mes)'),states:[{id:'m',values:{anger:0,joy:24,interest:30},coverageVersion:2}],capture:{status:'collected'}}];
f.sandbox.actor=actor;
f.sandbox.storageView={enabled:()=>true,view:rec=>rec?{...rec,characterStateEvents:structuredClone(events),characterStateCapture:null}:rec,strip:rec=>{const out={...rec};delete out.characterStateEvents;delete out.characterStateCapture;return out;}};
let changeDuringGate=true;
f.sandbox.mockJudge=async request=>{
 requests.push(request);
 if(changeDuringGate){changeDuringGate=false;events=structuredClone(events);events[0].states[0].values.joy=67;}
 return {answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>{
  if(q.type==='noul')return [key,{type:'noul',noul:.9}];
  let choice=key.startsWith('scene_participant_')?'direct':key==='scene_status'?'ordinary':key==='scene_evidence'?'0':FALLBACKS[key];
  if(!Object.hasOwn(q.criteria,choice))choice=Object.keys(q.criteria)[0];
  return [key,{choice,confidence:1}];
 }))};
};
f.run('record(true); characterStore.enabled=true;characterStore.characters=[actor];emotionStorage=storageView;callJev=mockJudge;');
await f.run('runJudge({force:true})');
assert.match(f.run('record().lastJudgment.payload'),/joy 24%/,'one frozen emotion view reaches actual character injection');
assert.doesNotMatch(f.run('record().lastJudgment.payload'),/joy 67%/,'late emotion cannot replace only the later half of a judgment');
assert.equal(f.run('Object.hasOwn(record(),"characterStateEvents")'),false,'judgment commit does not move the emotion snapshot back into the live session');
const before=requests.length;await f.run('runJudge()');
assert.ok(requests.length>before,'new emotions invalidate reuse at the next preparation');assert.match(f.run('record().lastJudgment.payload'),/joy 67%/);
const noChange=requests.length;await f.run('runJudge()');assert.equal(requests.length,noChange,'unchanged independent emotions allow normal prepared reuse');
assert.equal(requests[0].state.prior_output_character_states[0].values.joy,24,'scene interpretation sees the captured values too');
console.log('Independent emotion preparation passed: real Hub preparation/selection/assembly/commit, late-arrival isolation and cache reuse.');
