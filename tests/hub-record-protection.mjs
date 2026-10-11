import assert from 'node:assert/strict';
import { createRecordBank, currentRecords } from '../src/character/records.js';
import { buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from '../src/character/live.js';
import { budgetProtectionQuestions, recordCandidateMetadata } from '../src/character/record-questions.js';
import { supplementRecordCandidates } from '../src/character/record-protection.js';

const ordinary = i => ({type:'core',target:'self',when:['always'],rule:`Uses established habit number ${i}.`,modality:'habit',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'});
const guard = (type, rule, state='does_not_know') => ({...ordinary(0),type,target:'Zorven',when:['sealed archives'],rule,
    modality:type==='boundary'?'negation':'fact',knowledge_domain:type==='knowledge'?'secret':'none',knowledge_state:type==='knowledge'?state:'none'});
function entry(id='a', kind='character', guards=[guard('knowledge','Does not know the sealed archive password.'),guard('boundary','Never discloses the sealed archive seal.')]) {
    const item={id,kind,name:`Actor${id}`,source:`Actor${id} has established habits and specific limits.`,selectedLore:[],sourceVisibleToMain:true};
    item.recordBank=createRecordBank({entity_type:kind,entity_name:item.name,records:[...Array.from({length:26},(_,i)=>ordinary(i)),...guards]},item,'fixture');
    return item;
}
const options={canonicalOnly:true,transcript:'Actors enter hallway.'};
const answer = (plan, count=2, presence='active', extras='yes') => {
    const decisions={},details={};
    for(const p of plan) {
        decisions[`character_${p.index}_presence`]=presence;
        p.profileCandidates.forEach((item,i)=>{
            const key=`character_${p.index}_record_${i}`;
            decisions[key]=p.protectedCandidateIds.includes(item.id)?extras:(i<count?'yes':'no');
            details[key]={certainty:(i%5)/10+0.5};
        });
    }
    return {decisions,details};
};
const projectRequest=(plan,questions)=>({questions,state:{character_profiles:{people:plan.map(p=>({index:p.index,id:p.id,name:p.name,profileCandidates:p.profileCandidates.map(recordCandidateMetadata)}))}}});

let comparisons=0;
for(const volume of ['basic','generous','detailed']) for(const indices of [[],Array.from({length:20},(_,i)=>i)]) {
    const e=entry(), saved=JSON.stringify(e);
    const opts={...options,volume,retrievalResults:new Map([[e.id,{indices,status:indices.length?'ready':'fallback'}]])};
    const base=buildLiveCharacterPlan([e],{...opts,protection:false});
    const plan=buildLiveCharacterPlan([e],opts);
    const baseQ=buildCharacterTurnQuestions(base), q=buildCharacterTurnQuestions(plan);
    assert.equal(base[0].profileCandidates.some(r=>r.type==='knowledge'||r.type==='boundary'),false,'reproduce zero-overlap omission');
    assert.equal(plan[0].protectedCandidateIds.length,2);
    assert.deepEqual(plan[0].profileCandidates.slice(0,base[0].profileCandidates.length),base[0].profileCandidates,'baseline identity, content and order');
    for(const [key,value] of Object.entries(baseQ))assert.deepEqual(q[key],value,'baseline questions remain byte equivalent');
    assert.equal(new Set(plan[0].profileCandidates.map(r=>r.id)).size,plan[0].profileCandidates.length);
    assert.ok(plan[0].profileCandidates.length<=Math.min(base[0].profileCandidates.length+2,20));
    assert.ok(plan[0].prefilterStats.candidateChars<=plan[0].prefilterStats.maxChars);
    const requestDelta=JSON.stringify(projectRequest(plan,q)).length-JSON.stringify(projectRequest(base,baseQ)).length;
    assert.equal(requestDelta,plan[0].prefilterStats.protectedRequestChars,'actual serialized question plus metadata growth');
    assert.ok(requestDelta<=6000);
    for(const count of [0,2,4,6,8,20]) for(const presence of ['active','absent','background']) {
        const a=answer(plan,count,presence), before=buildCharacterInjection(resolveLiveCharacterPlan(base,a.decisions,a.details),{volume});
        const after=buildCharacterInjection(resolveLiveCharacterPlan(plan,a.decisions,a.details),{volume});
        const baselineIds=new Set(base[0].profileCandidates.map(r=>r.id));
        for(const id of after.traces[0].profileIds.filter(id=>baselineIds.has(id)))assert.ok(before.traces[0].profileIds.includes(id),'no unselected baseline record is introduced');
        for(const id of after.traces[0].injectedRuleIds.filter(id=>baselineIds.has(id)))assert.ok(before.traces[0].injectedRuleIds.includes(id),'no unselected baseline content is injected');
        for(const id of after.traces[0].injectedRuleIds.filter(id=>baselineIds.has(id)))assert.ok(after.text.includes(base[0].profileCandidates.find(record=>record.id===id).rule),'selected record content remains intact');
        assert.ok(after.traces[0].profileIds.length<=plan[0].profileSlotLimit,'protected and baseline records share the same slot budget');
        if(presence!=='active')assert.equal(after.text,'');
        assert.ok(after.charCount<=after.charLimit); comparisons++;
    }
    const rejected=answer(plan,0,'active','no');
    assert.equal(buildCharacterInjection(resolveLiveCharacterPlan(plan,rejected.decisions,rejected.details),{volume}).traces[0].protection.notApproved,2);
    const missing=answer(plan,0,'active',undefined); // delete explicitly; the default helper otherwise says yes.
    for(const [key] of Object.entries(missing.decisions))if(/_record_/.test(key))delete missing.decisions[key];
    assert.equal(resolveLiveCharacterPlan(plan,missing.decisions)[0].profileIds.length,0,'missing answers never auto-approve');
    assert.equal(JSON.stringify(e),saved,'no bank/source/identifier migration');
    assert.equal(currentRecords(e).length,28);
    assert.deepEqual(buildCharacterTurnQuestions(plan),q,'budgeting is idempotent');
    const extraQ=q[`character_0_record_${base[0].profileCandidates.length}`].instructions;
    assert.match(extraQ,/Lack of topical overlap/);assert.match(extraQ,/later RP explicitly taught/);assert.match(extraQ,/matching target, time, condition/);
}

// Six actors share the whole request cap, without one actor monopolizing it.
const six=Array.from({length:6},(_,i)=>entry(String(i)));
const sixBase=buildLiveCharacterPlan(six,{...options,protection:false}), sixPlan=buildLiveCharacterPlan(six,options);
const sixBaseQ=buildCharacterTurnQuestions(sixBase), sixQ=buildCharacterTurnQuestions(sixPlan);
const growth=JSON.stringify(projectRequest(sixPlan,sixQ)).length-JSON.stringify(projectRequest(sixBase,sixBaseQ)).length;
assert.ok(growth<=6000);
assert.ok(sixPlan.every(p=>p.protectedCandidateIds.length>=1),'every actor gets a first review when their whole questions fit');
assert.ok(sixPlan.some(p=>p.prefilterStats.protectedOmittedByRequest>0),'over-budget supplemental reviews reported');
const sixA=answer(sixPlan,2), sixBefore=buildCharacterInjection(resolveLiveCharacterPlan(sixBase,sixA.decisions,sixA.details)),sixAfter=buildCharacterInjection(resolveLiveCharacterPlan(sixPlan,sixA.decisions,sixA.details));
for(let i=0;i<6;i++) {
    const ids=new Set(sixBase[i].profileCandidates.map(r=>r.id));
    assert.deepEqual(sixAfter.traces[i].injectedRuleIds.filter(id=>ids.has(id)),sixBefore.traces[i].injectedRuleIds,'early actor extras cannot displace later baseline');
}
for(let i=0;i<6;i++) for(const id of sixAfter.traces[i].injectedRuleIds) {
    assert.ok(sixAfter.text.includes(sixPlan[i].profileCandidates.find(record=>record.id===id).rule),'each injected record remains whole after priority packing');
}
assert.ok(sixAfter.charCount<=sixAfter.charLimit,'all six actors share the existing whole-injection cap');

// Several knowledge limits are independent candidates, not one per type.
const twoKnowledge=entry('k','character',[guard('knowledge','Does not know the vault code.'),guard('knowledge','Misunderstands the archive seal.','misunderstands')]);
const kp=buildLiveCharacterPlan([twoKnowledge],options);buildCharacterTurnQuestions(kp);
assert.equal(kp[0].protectedCandidateIds.length,2);
for(const slots of [2,3,4]) {
    const npc=buildLiveCharacterPlan([entry('n','npc')],{...options,npcSlots:slots});buildCharacterTurnQuestions(npc);
    const a=answer(npc,20), resolved=resolveLiveCharacterPlan(npc,a.decisions,a.details), injection=buildCharacterInjection(resolved);
    assert.equal(resolved[0].profileIds.length,slots);
    assert.equal(injection.traces[0].protection.omittedBySlots,0,'approved knowledge and boundary records take priority within the same NPC slot cap');
    assert.ok(resolved[0].protectedCandidateIds.every(id=>resolved[0].profileIds.includes(id)));
}

// Oversized records are omitted whole at each distinct budget stage.
const long=entry('long','character',[guard('knowledge','x'.repeat(15000)),guard('knowledge','A short independent ignorance constraint.')]);
const lp=buildLiveCharacterPlan([long],options);buildCharacterTurnQuestions(lp);
assert.equal(lp[0].prefilterStats.protectedOmittedByChars,1);assert.equal(lp[0].protectedCandidateIds.length,1);
const tooMuchRequest=buildLiveCharacterPlan([entry('request','character',[guard('knowledge','x'.repeat(6500))])],options);buildCharacterTurnQuestions(tooMuchRequest);
assert.equal(tooMuchRequest[0].prefilterStats.protectedOmittedByRequest,1);assert.equal(tooMuchRequest[0].protectedCandidateIds.length,0);
const noRoom=buildLiveCharacterPlan([entry('room')],options);
budgetProtectionQuestions(noRoom,0);
assert.equal(noRoom[0].protectedCandidateIds.length,0);assert.equal(noRoom[0].prefilterStats.protectedOmittedByRequest,2);
const baseRecords=Array.from({length:6},(_,i)=>({...ordinary(i),rule:'B'.repeat(660)}));
const custom=entry('packed'); custom.recordBank=createRecordBank({entity_type:'character',entity_name:custom.name,records:[...baseRecords,...Array.from({length:20},(_,i)=>ordinary(i+6)),guard('knowledge','PROTECTED WHOLE LINE '.repeat(60))]},custom,'large');
const packed=buildLiveCharacterPlan([custom],{...options,volume:'generous'});buildCharacterTurnQuestions(packed);
const pa=answer(packed,5), packedInjection=buildCharacterInjection(resolveLiveCharacterPlan(packed,pa.decisions,pa.details));
const protectedRecord=packed[0].profileCandidates.find(item=>packed[0].protectedCandidateIds.includes(item.id));
assert.equal(packedInjection.text.includes(protectedRecord.rule),packedInjection.traces[0].injectedRuleIds.includes(protectedRecord.id),'a protected constraint is either whole or omitted');
assert.ok(packedInjection.charCount<=packedInjection.charLimit);

// Identity shortening must not turn uncertain background presence into an entrance.
const uncertainPlan=buildLiveCharacterPlan([entry('uncertain','npc')],options);
uncertainPlan[0].sourceVisibleToMain=false;
uncertainPlan[0].profileCandidates=[{...uncertainPlan[0].profileCandidates[0],rule:'Stored identity '.repeat(200)}];
uncertainPlan[0].protectedCandidateIds=[];
const uncertainAnswers=answer(uncertainPlan,0,'background');
uncertainAnswers.details.character_0_presence={presenceUncertain:true,participationEvidence:'unknown'};
const conditional=buildCharacterInjection(resolveLiveCharacterPlan(uncertainPlan,uncertainAnswers.decisions,uncertainAnswers.details),{maxChars:700});
assert.ok(conditional.charCount<=700);
assert.equal(conditional.traces[0].identityFallback,true);
assert.match(conditional.text,/If Actoruncertain participates/);
assert.match(conditional.text,/does not introduce or summon/);

// A supplement-only preparation failure leaves the established path usable.
const brokenHints=[];brokenHints.includes=()=>{throw Error('supplement-only failure');};
const fb=buildLiveCharacterPlan([entry('fallback')],{...options,categoryHints:brokenHints});
assert.equal(fb[0].prefilterStats.protectionFallback,'candidate');assert.equal(fb[0].protectedCandidateIds.length,0);assert.ok(Object.keys(buildCharacterTurnQuestions(fb)).length);
const requestFailure=buildLiveCharacterPlan([entry('fallbackq')],options),extra=requestFailure[0].profileCandidates.at(-1);
Object.defineProperty(extra,'rule',{get(){throw Error('supplement-only serialization failure');}});
buildCharacterTurnQuestions(requestFailure);
assert.equal(requestFailure[0].prefilterStats.protectionFallback,'request');assert.equal(requestFailure[0].protectedCandidateIds.length,0);
assert.equal(supplementRecordCandidates(entry(),[],options.transcript,{limit:20,maxChars:0,stats:{candidateChars:0}}).length,0);
console.log(`Record protection passed: ${comparisons} baseline preservation comparisons, zero-score retrieval, fair serialized 6k budget, scoped questions, slot/length/presence omissions, whole records, no migration, local fallback.`);
