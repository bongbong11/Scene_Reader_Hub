import assert from 'node:assert/strict';
import {fixture} from './regression/audit-v012.mjs';
import {ADVANCED_ELEMENTS} from '../src/world/advanced-library.js';
import {STORY_DIRECTIONS,storyElements,storyDirectionBeat,storyDirectionQuestion,resolveStoryDirection,buildStoryDirection} from '../src/world/story-direction.js';
import {makeOpportunities} from '../src/scene/opportunities.js';
import {resolveOpportunities,additionVerificationQuestions} from '../src/scene/opportunity-policy.js';
import {castBeats,castQuestions,resolveCastBindings} from '../src/scene/cast-binding.js';
import {createRecordBank} from '../src/character/records.js';
import {FALLBACKS} from '../src/decision/answers.js';
import {wholeDiagnosticReport} from '../src/debug/whole-report.js';
import {createPromptObserver} from '../src/injection/receipt.js';
import {createDecisionVerification} from '../src/decision/verification.js';
import {buildVerificationQuestions} from '../src/decision/policy.js';

assert.deepEqual(Object.keys(STORY_DIRECTIONS),Object.keys(ADVANCED_ELEMENTS));
const all=Object.keys(ADVANCED_ELEMENTS);
let longest=0, combinations=0;
for(const advancedEnabled of [false,true])for(const newGenerationEnabled of [false,true])for(const spontaneousMode of ['off','event','person','both'])for(const advancedStyle of ['off','balanced','very_active'])for(const appearanceChance of [0,35,100])for(const advancedElements of [[],['relationship'],all]){
    const settings={settingsContract:3,advancedEnabled,newGenerationEnabled,spontaneousMode,advancedStyle,appearanceChance,advancedElements};
    const elements=storyElements(settings), rec={preferences:settings};
    const offers=makeOpportunities(rec,'stable-direction-test'), repeated=makeOpportunities(rec,'stable-direction-test');
    assert.deepEqual(offers.event.candidates,repeated.event.candidates);
    assert.equal(offers.event.roll,repeated.event.roll);
    assert.equal(offers.person.roll,repeated.person.roll);
    const additions=resolveOpportunities(offers,{event_opportunity:{choice:'candidate_1'},person_opportunity:{choice:'candidate_1'}});
    if(!newGenerationEnabled||advancedStyle==='off')assert.ok(!additions.some(x=>x.feature==='event'));
    if(!newGenerationEnabled||appearanceChance===0)assert.ok(!additions.some(x=>x.feature==='person'));
    const direction=resolveStoryDirection(elements,'relationship');
    const text=buildStoryDirection(settings,direction);
    assert.equal(Boolean(text),advancedEnabled&&advancedElements.length>0);
    if(text){assert.equal((text.match(/<STORY_DIRECTION>/g)||[]).length,1);longest=Math.max(longest,text.length);}
    combinations++;
}
for(const focus of all){
    const text=buildStoryDirection({advancedEnabled:true,advancedElements:all},resolveStoryDirection(all,focus));
    assert.equal(all.filter(key=>text.includes(STORY_DIRECTIONS[key].prompt)).length,1);
    assert.ok(text.length<1000);
}
assert.equal(buildStoryDirection({advancedEnabled:false,advancedElements:all},resolveStoryDirection(all,'relationship')),'');
assert.equal(resolveStoryDirection(all,undefined).reason,'missing_answer');
assert.equal(storyDirectionQuestion(all).criteria.none,'No extra emphasis needed in this interaction.');

function npc(index){
    const entry={id:`npc-${index}`,name:`Rival${index}`,kind:'npc',npcRole:'mixed',source:`Name: Rival${index}`};
    entry.recordBank=createRecordBank({entity_type:'npc',entity_name:entry.name,records:[{type:'relationship',target:'Morgan',when:['general'],rule:'Competes for Morgan’s attention through invitations, jealousy and pointed demands.',modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]},entry,'test');
    return entry;
}
const rival=npc(0);
for(const scenario of ['routine','no_generation','record_off','no_elements','advanced_off','all_elements','missing_answer','no_move','full_capacity']){
    const f=fixture(), requests=[];
    f.ctx.name2='Morgan';f.ctx.chat=[{is_user:true,name:'User',mes:'Morgan and I discuss the reception.'}];
    f.sandbox.people=Array.from({length:7},(_,index)=>npc(index));
    f.sandbox.options={advanced:scenario!=='advanced_off',enabled:scenario!=='record_off',generation:scenario!=='no_generation',elements:scenario==='no_elements'?[]:scenario==='all_elements'?all:['relationship']};
    if(scenario==='full_capacity')f.ctx.chat[0].mes+=' '+f.sandbox.people.slice(0,6).map(x=>x.name).join(' ');
    f.run(`record(true);Object.assign(record().preferences,{advancedEnabled:options.advanced,advancedElements:options.elements,newGenerationEnabled:options.generation,advancedStyle:'off',appearanceChance:0,worldAgencyEnabled:false,socialEnabled:false}); characterStore={enabled:options.enabled,characters:[],npcs:people,persona:null};`);
    f.sandbox.reply=async body=>{
        requests.push(body);
        const answers=Object.fromEntries(Object.entries(body.questions).map(([key,q])=>{
            if(q.type==='noul')return [key,{type:'noul',noul:0.95}];
            let choice=Object.hasOwn(q.criteria,FALLBACKS[key])?FALLBACKS[key]:Object.keys(q.criteria)[0];
            if(key.startsWith('scene_participant_')||key.endsWith('_participation'))choice='direct';
            if(key==='story_element')choice='relationship';
            if(/^event_cast_\d+$/.test(key))choice=scenario==='no_move'?'none':scenario==='record_off'?'scene_existing':'sheet_0';
            if(/^event_cast_\d+_action$/.test(key))choice='seduction';
            return [key,{choice,confidence:0}];
        }));
        if(scenario==='missing_answer')delete answers.story_element;
        return {answers};
    };
    f.run('callJev=reply');
    await f.run('runJudge({force:true,pendingUserText:"What do you want to do?"})');
    const result=JSON.parse(f.run('JSON.stringify(record().lastJudgment)')), request=requests.at(-1);
    assert.ok(result,scenario);assert.equal(requests.length,2,'only the existing scene and main decision requests');
    assert.equal(result.opportunityPlan.additions.length,0,'no new event or identity despite direction');
    if(['advanced_off','no_elements'].includes(scenario)){
        assert.equal(request.questions.story_element,undefined);assert.equal(result.storyDirection,null);
        assert.doesNotMatch(result.payload,/<STORY_DIRECTION>|Ongoing actor:/);continue;
    }
    assert.ok(result.payload.includes('<STORY_DIRECTION>'));
    assert.equal(result.details.story_element.threshold,0,'no extra approval threshold');
    assert.ok((request.state.character_profiles?.people.length||0)<=6);
    assert.ok(!request.questions.event_cast_0.criteria.new_person);
    if(scenario==='missing_answer'){
        assert.equal(result.storyDirection.focus,'none');assert.equal(result.storyDirection.reason,'missing_answer');assert.equal(result.cast.length,0);continue;
    }
    assert.equal(result.storyDirection.focus,'relationship');
    if(scenario==='no_move'){assert.equal(result.cast.length,0);continue;}
    assert.match(result.payload,/Ongoing actor:/);assert.match(result.payload,/tempting approach/);
    if(scenario==='record_off'){
        assert.equal(request.state.character_profiles,null);assert.equal(result.storyDirection.actorSource,'established');
        assert.equal(Object.keys(request.questions.event_cast_0.criteria).filter(key=>key.startsWith('sheet_')).length,0);
    }else{
        assert.ok(result.payload.includes(rival.recordBank.records[0].rule),scenario+JSON.stringify({counts:result.castRecordCounts,cast:result.cast,characters:result.characterTrace.map(x=>({id:x.id,presence:x.presence,ids:x.injectedRuleIds}))}));
        if(scenario!=='full_capacity')assert.equal(result.characterTrace.length,0,'prospective NPC does not become a present participant');
        assert.equal(result.storyDirection.actorSource,'registered');
    }
    const report=wholeDiagnosticReport({execution:{},judgment:result,record:{}});
    assert.ok(!JSON.stringify(report).includes('Rival0'));assert.equal(report.storyDirection.actorRef,undefined);
    assert.ok(!JSON.stringify(report).includes(rival.recordBank.records[0].rule));
    // Same input, changed settings: replace undelivered pending direction too.
    f.run('record().preferences.advancedEnabled=false');
    await f.run('runJudge({force:true,pendingUserText:"What do you want to do?"})');
    assert.equal(f.run('record().lastJudgment.storyDirection'),null);
    assert.equal(f.run('record().pendingPlan.storyDirection'),null);
}

const directionBeat=storyDirectionBeat(['relationship']);
const offered={event:{passed:true,candidates:[{id:'A_relationship_01',element:'relationship',action:'External rival intervenes.'}]}};
const beats=[...castBeats(offered),directionBeat];
assert.equal(castQuestions(beats,[rival],[]).event_cast_0.criteria.current_cast,undefined);
const additions=[{feature:'event',templateId:'A_relationship_01',candidate:{action:'External rival intervenes.',effect:'External intervention'}}];
const bindings=resolveCastBindings({beats,sheets:[rival],additions,decisions:{story_element:'relationship'},answers:{event_cast_0:{choice:'sheet_0'},event_cast_0_action:{choice:'obstruction'},event_cast_1:{choice:'sheet_0'},event_cast_1_action:{choice:'seduction'}}});
assert.equal(bindings.length,1,'event owns this move rather than two competing actions');
assert.equal(bindings[0].action,'obstruction');
assert.match(additionVerificationQuestions({outputText:'A reply',additions}).verification_addition_0.instructions,/external relationship rival/);

// Receipt and actual output remain separate from prepared/saved directions.
const direction=resolveStoryDirection(['relationship'],'relationship',[{kind:'sheet',actorId:rival.id,action:'obstruction',beatKey:'direction'}]);
const rec={lastJudgment:{inputKey:'test',payload:'Synthetic direction',storyDirection:direction},pendingPlan:{inputKey:'test',storyDirection:structuredClone(direction),judgment:{payload:'Synthetic direction'},effects:[],decisions:{},additions:[],cast:[{beatKey:'direction',kind:'sheet',actorId:rival.id,name:rival.name,action:'obstruction'}]}};
const log=[];
const observer=createPromptObserver({getExpected:()=>rec.lastJudgment,getNames:()=>({}),getCycleId:()=> 'c',getRecord:()=>rec,report:(stage,code,detail)=>log.push({stage,code,...detail}),updateStatus(){},updateActivity(){}});
observer.start('normal');observer.inspectPrepared({messages:[{role:'system',content:'Synthetic direction'}]});
assert.equal(rec.pendingPlan.storyDirection.delivery,'prepared');
observer.verifyRequest({messages:[{role:'system',content:'Synthetic direction'}]});
assert.equal(rec.pendingPlan.storyDirection.delivery,'request_included');
assert.equal(rec.lastJudgment.storyDirection.delivery,'prepared');
assert.ok(log.some(item=>item.code==='STORY_DIRECTION_INCLUDED'));
Object.assign(rec.pendingPlan,{outputText:'Synthetic output',outputIndex:1});
assert.ok(buildVerificationQuestions(rec.pendingPlan).verification_event_actor_0);
const verifier=createDecisionVerification({stateChatKey:()=> 'synthetic',verificationSummary:()=>({}),reversibleStateSnapshot:()=>({}),commitVerifiedPlan:()=>({committed:false,committedEffects:{}}),loadStateHistory:async()=>[],saveStateHistory:async()=>{},noteDiagnostic:(stage,detail)=>log.push({stage,...detail})});
await verifier.commitPriorVerification(rec,{verification_event_actor_0:'missed'});
assert.equal(rec.lastVerification.storyDirection.verification,'missed');assert.equal(rec.pendingPlan,null);
assert.ok(!JSON.stringify(log).includes('Rival0'));
console.log(`Story direction passed: ${combinations} setting combinations, eight concise directions (matrix max ${longest} chars), live pipeline/off switches, candidate limits, no extra calls, receipts and output verification.`);
