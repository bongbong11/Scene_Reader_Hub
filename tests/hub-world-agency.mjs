import assert from 'node:assert/strict';
import {buildInjection} from '../prompt-library.js';
import {activityQuestions} from '../src/decision/activity-questions.js';
import {applyPolicy} from '../src/decision/answers.js';
import {buildVerificationQuestions} from '../src/decision/policy.js';
import {coordinateDecisions,coordinateActionBudget} from '../src/scene/coordinator.js';
import {emptyProgress,normalizeProgress,progressComparison,observeProgress,progressVerification,invalidateProgressFrom,stopProgress,completeProgress} from '../src/scene/progress-tracking.js';
import {worldAgencyParts,PROGRESS_BOOST,INITIATIVE,NPC_ACTIVITY,PHYSICAL_OPPOSITION,GROUP_ARRIVAL} from '../src/injection/world-agency.js';
import {additionBlocks,incorporateAdditions} from '../src/injection/opportunity.js';
import {observePromptReceipt,createPromptObserver} from '../src/injection/receipt.js';
import {makeOpportunities} from '../src/scene/opportunities.js';
import {resolveOpportunities} from '../src/scene/opportunity-policy.js';
import {genreNpcPrompt} from '../src/injection/assemble.js';
import {confirmedStory,splitRuntime,resolveRecord} from '../src/storyline/projector.js';
import {roomPreferences} from '../src/storage/common-preferences.js';
import {buildRecentContext} from '../src/context/messages.js';
import {LEGACY_PROMPTS} from '../src/decision/legacy-prompts.js';
import {fixture} from './regression/audit-v012.mjs';

const settings={settingsContract:4,developmentStyle:'balanced',worldAgencyEnabled:true,advancedEnabled:false,newGenerationEnabled:false,appearanceChance:0,socialEnabled:false,negativePriority:false,advancedElements:[],relationshipPace:'medium',resolutionPace:'medium'};
assert.deepEqual(activityQuestions(false),{});
assert.equal(Object.keys(activityQuestions(true)).length,2);
assert.ok(!JSON.stringify(activityQuestions(true)).includes('nonhuman'));
const decisions={primary_focus:'relationship',relationship_pacing:'hold',basic_move:'continue',direct_execution:'yes',npc_route:'reuse',npc_weight:'supporting',npc_presence:'multiple',npc_role:'participant',world_npc_activity:'active',world_physical_opposition:'active',progress_boost:'yes'};
for(const key of Object.keys(activityQuestions(true)))assert.equal(applyPolicy(key,{choice:'active',confidence:0},'conservative',Object.keys(activityQuestions(true)[key].criteria)).effective,'active');
const record={preferences:settings,pacingState:{relationship:{},event:{}},progressionState:{...emptyProgress()}};
const coordinated={...decisions};coordinateDecisions(record,{},coordinated,{presentNpc:true});assert.equal(coordinated.npc_weight,'supporting');
coordinateActionBudget(record,{},coordinated);assert.equal(coordinated.progress_boost,'yes');assert.equal(coordinated.world_physical_opposition,'active');
const payload=buildInjection({settings,decisions:coordinated});
for(const text of [INITIATIVE,NPC_ACTIVITY,PHYSICAL_OPPOSITION,PROGRESS_BOOST])assert.equal(payload.split(text).length-1,1);
assert.doesNotMatch(payload,/WORLD_AGENCY|NONHUMAN|one or two reactions|offstage/);
assert.ok(payload.indexOf(INITIATIVE)<payload.indexOf('</BASIC_DEVELOPMENT>'));
assert.ok(payload.indexOf(NPC_ACTIVITY)<payload.indexOf('</NPC_SCENE_EXECUTION>'));
assert.ok(payload.indexOf(PHYSICAL_OPPOSITION)<payload.indexOf('</CONFLICT_PROGRESSION>'));
assert.ok(!payload.includes(LEGACY_PROMPTS.CONFLICT_EXECUTION),'physical guidance alone does not pull in the full legacy conflict prompt');
assert.ok(!buildInjection({settings:{...settings,worldAgencyEnabled:false},decisions}).includes(INITIATIVE));
assert.ok(buildInjection({settings:{...settings,developmentStyle:'static'},decisions}).includes(PROGRESS_BOOST),'static allows a different quiet response after semantic repetition');
const conflict=buildInjection({settings:{...settings,socialEnabled:true},decisions:{...decisions,npc_autonomy:'yes',fight_sustain:'yes'}});
assert.ok(conflict.includes(LEGACY_PROMPTS.AUTONOMOUS_NPC_DYNAMICS));
assert.ok(conflict.includes(LEGACY_PROMPTS.SUSTAINED_INTERPERSONAL_CONFLICT));

for(const newGenerationEnabled of [true,false])for(const appearanceChance of [0,100]) {
 const prefs={...settings,newGenerationEnabled,appearanceChance};
 const offers=makeOpportunities({preferences:prefs},'group-test');
 const additions=resolveOpportunities(offers,{person_opportunity:{choice:'candidate_1'},event_opportunity:{choice:'candidate_1'}},prefs);
 if(!newGenerationEnabled||!appearanceChance)assert.ok(!additions.some(x=>x.feature==='person'));
 const person=additions.find(x=>x.feature==='person');
 if(person){assert.equal(person.profile.composition,'individual_or_connected_group');assert.match(genreNpcPrompt(person.profile,'reuse'),/do not collapse a group/);}
 const blocks=additionBlocks(additions,prefs,false);
 const final=incorporateAdditions(buildInjection({settings:prefs,decisions,hasAdditions:blocks.length>0}),blocks,prefs);
 assert.equal(final.includes(GROUP_ARRIVAL),Boolean(person));
 for(const block of blocks)assert.ok(final.includes(block.text));
}

const chat=[];
function pair(user='Wait here.',reply='They hesitate again.') {chat.push({is_user:true,mes:user},{is_user:false,mes:reply,swipe_id:0});}
pair();pair();
const rec={preferences:{...settings}};
for(let i=0;i<3;i++) {
 if(i)pair();
 const comp=progressComparison(chat);
 const status=observeProgress(rec,comp,'stalled',chat);
 assert.equal(status.count,i+1);assert.equal(status.boost,i===2);
 assert.equal(observeProgress(rec,comp,'stalled',chat).count,i+1,'same reply never counted twice');
 assert.equal(comp.turns.length,Math.min(6,i+2));
}
// Same text in different completed replies still counts; a swipe replaces a reply.
chat.at(-1).swipe_id=1;chat.at(-1).mes='They hesitate once more.';
assert.equal(observeProgress(rec,progressComparison(chat),'stalled',chat).count,3);
assert.equal(observeProgress(rec,progressComparison(chat),'flowing',chat).count,0);
assert.equal(observeProgress(rec,progressComparison(chat),'holding',chat).count,0);
const comp=progressComparison(chat),pending={outputIndex:comp.target.index,outputText:chat.at(-1).mes};
assert.equal(progressVerification(comp,'holding',pending),'not_applicable');
assert.equal(progressVerification(comp,'flowing',{...pending,outputIndex:1}),'unavailable');
assert.equal(progressVerification(comp,'flowing',pending),'fulfilled');
assert.equal(buildVerificationQuestions({...pending,effects:['progress','npc']}).verification_progress,undefined);
assert.ok(buildVerificationQuestions({...pending,effects:['progress','npc']}).verification_npc);
// No fabricated continuity across an unjudged reply or hidden/OOC source.
pair();pair();assert.equal(observeProgress(rec,progressComparison(chat),'stalled',chat).count,1);
chat.at(-1).is_hidden=true;invalidateProgressFrom(rec,chat.length-1);assert.equal(rec.progressionState.turnsSinceMeaningfulProgress,0);
chat.at(-1).is_hidden=false;chat.at(-2).mes='(OOC: Explain a rule.)';assert.equal(progressComparison(chat).target,null);
chat.at(-2).mes='Wait here.';stopProgress(rec,chat,'continue');assert.equal(progressComparison(chat,{blockedTurn:rec.progressionState.blockedTurn}).target,null);
completeProgress(rec,chat.length-1);assert.ok(progressComparison(chat,{blockedTurn:rec.progressionState.blockedTurn}).target);
const current=buildRecentContext({chat,pendingUserText:'A new action not yet answered.',turnCount:3});
const referenced=progressComparison(chat,{selected:current.selected,transcript:current.recentRoleplay});
assert.ok(referenced.turns.at(-1).reply.reference);
assert.ok(!JSON.stringify(referenced).includes('A new action not yet answered.'));
assert.equal(progressComparison(chat,{maxChars:1}).sufficient,false);
assert.equal(normalizeProgress({turnsSinceMeaningfulProgress:8}).turnsSinceMeaningfulProgress,0);
assert.equal(roomPreferences(settings).worldAgencyEnabled,true);
assert.equal(confirmedStory({...rec,progressionState:{...emptyProgress(),turnsSinceMeaningfulProgress:3}}).progressionState.turnsSinceMeaningfulProgress,0);

const summary={ids:worldAgencyParts(settings,decisions).ids,progressBoost:true};
const rendered=payload.replaceAll('{{char}}','Actor').replaceAll('{{user}}','Player');
const receipt=observePromptReceipt({messages:[{role:'system',content:rendered}]},{payload,activity:summary,characterName:'Actor',userName:'Player'});
assert.ok(receipt.activity.every(item=>item.status==='confirmed'));
assert.ok(!JSON.stringify(receipt.activity).includes('Let characters'));
assert.ok(observePromptReceipt({messages:[{role:'system',content:'Other text'}]},{payload,activity:summary,characterName:'Actor',userName:'Player'}).activity.every(item=>item.status==='unconfirmed'));
const events=[];const expected={payload,activity:summary};
const observer=createPromptObserver({getExpected:()=>expected,getNames:()=>({}),getCycleId:()=>1,report:(stage,code,data)=>events.push({stage,code,data}),updateStatus(){},updateActivity(){}});
observer.start('normal');observer.verifyRequest({messages:[{role:'system',content:payload}]});
assert.equal(events.filter(x=>x.code==='SCENE_ACTIVITY_RECEIPT').length,4);

// Full pipeline: no extra request and no second progress approval; flags survive routing.
const f=fixture();f.ctx.chat=[{is_user:true,mes:'Talk in the shared workshop.'},{is_user:false,mes:'The workers go about their tasks.'},{is_user:true,mes:'Continue the discussion.'},{is_user:false,mes:'The same workers hesitate.'}];
f.run('record(true).preferences.worldAgencyEnabled=true; record().preferences.newGenerationEnabled=false; record().preferences.appearanceChance=0;');
const requests=[];
f.sandbox.agencyJev=async body=>{
 requests.push(body);
 return {answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>[key,q.type==='noul'?{type:'noul',noul:0}:{choice:key==='progress_need'?'stalled':key.startsWith('world_')&&q.criteria.active?'active':key==='scene_status'?'ordinary':Object.keys(q.criteria)[0],confidence:0.01}]))};
};
f.run('callJev=agencyJev;');
await f.run('runJudge({force:true})');
const normal=requests.filter(r=>r.questions.world_npc_activity);
assert.equal(normal.length,1);assert.ok(normal[0].state.progress_comparison);
assert.equal(normal[0].questions.verification_progress,undefined);
assert.ok(f.run('record().lastJudgment.payload').includes(NPC_ACTIVITY));
assert.equal(f.run('record().progressionState.turnsSinceMeaningfulProgress'),1);
assert.equal(f.run('record().preferences.worldAgencyEnabled'),true);
for(let i=2;i<=3;i++) {
 f.ctx.chat.push({is_user:true,mes:'Continue the discussion.'},{is_user:false,mes:'The same workers hesitate.'});
 await f.run('runJudge({force:true})');
 assert.equal(f.run('record().progressionState.turnsSinceMeaningfulProgress'),i);
 assert.equal(f.run('record().lastJudgment.payload').includes(PROGRESS_BOOST),i===3);
}
await f.run('runJudge({force:true})');
assert.equal(f.run('record().progressionState.turnsSinceMeaningfulProgress'),3);
const saved=structuredClone(f.run('record()'));
const checkpoint={id:'check',state:confirmedStory(saved)};
const local=splitRuntime(saved,checkpoint.state);
const baseline={defaultPreferences:settings};
assert.equal(normalizeProgress(resolveRecord({},baseline,{},checkpoint,local).progressionState,'balanced').turnsSinceMeaningfulProgress,3);
assert.equal(normalizeProgress(resolveRecord({},baseline,{},checkpoint,{}).progressionState,'balanced').turnsSinceMeaningfulProgress,0);
assert.equal(normalizeProgress(saved.progressionState,'static').turnsSinceMeaningfulProgress,0);
f.run("record().preferences.developmentStyle='static';");
await f.run('runJudge({force:true})');
assert.equal(f.run('record().progressionState.turnsSinceMeaningfulProgress'),1);
assert.ok(!f.run('record().lastJudgment.payload').includes(PROGRESS_BOOST));
for(let i=2;i<=3;i++) {
 f.ctx.chat.push({is_user:true,mes:`A different proposal ${i}.`},{is_user:false,mes:`A differently worded dismissal ${i}.`});
 await f.run('runJudge({force:true})');
 assert.equal(f.run('record().progressionState.turnsSinceMeaningfulProgress'),i);
 assert.equal(f.run('record().lastJudgment.payload').includes(PROGRESS_BOOST),i===3);
}
assert.equal(requests.filter(r=>r.questions.world_npc_activity).length,7);
console.log('World agency passed: independent low-confidence selection, scoped injection, probability boundaries, groups, progress lifecycle, continuation, final-request receipts and full pipeline.');
