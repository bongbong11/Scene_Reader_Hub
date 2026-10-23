import assert from 'node:assert/strict';
import {fixture} from './regression/audit-v012.mjs';
import {auxiliaryFixture} from './fixtures/auxiliary-runtime.mjs';
const hub=fixture({analysis:true}),requests=[],jev=[];
hub.ctx.name2='Aster';
hub.sandbox.syntheticJev=async body=>{jev.push(body);return {answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>[key,q.type==='noul'?{noul:.9}:{choice:key==='scene_status'?'ordinary':Object.hasOwn(q.criteria,'none')?'none':Object.keys(q.criteria)[0],confidence:1}]))};};
hub.sandbox.syntheticService={getProfile:()=>({name:'Synthetic',model:'fixture'}),validateProfile(){},async sendRequest(_id,messages){requests.push(messages);return {content:JSON.stringify({current_situation:'Aster has left the kitchen after the exchange.',remaining_effects:'Briar still doubts the explanation.'})};}};
hub.run("record(true);settings.continuityEnabled=true;settings.reasonerProfileId='synthetic';connectionRequestService=syntheticService;callJev=syntheticJev;");
for(const text of ['Aster puts the basin away.','Aster closes the drawer.','Aster leaves the kitchen.']){
 hub.ctx.chat.push({is_user:true,mes:'Continue.'});await hub.run("onBeforeGeneration('normal',{},false)");
 hub.ctx.chat.push({is_user:false,mes:text});await hub.run(`onCharacterMessageReceived(${hub.ctx.chat.length-1})`);await hub.run('analysis.completion');
}
assert.equal(requests.length,3,'every completed RP turn collects once');
assert.equal(JSON.parse(requests[0].at(-1).content).current_turn.character,'Aster puts the basin away.');
assert.equal(JSON.parse(requests[1].at(-1).content).previous_context.remaining_effects,'Briar still doubts the explanation.');
hub.ctx.chat.push({is_user:true,mes:'Briar waits near the door.'});await hub.run('runJudge({force:true})');
assert.match(hub.run('activeInjectionPayload'),/Current situation: Aster has left/);assert.match(hub.run('activeInjectionPayload'),/Remaining effects: Briar still doubts/);
assert.doesNotMatch(hub.run('activeInjectionPayload'),/sourceRefs|processedKeys|stateUpdates/);
assert.ok(jev.every(body=>!body.questions.continuity_trigger));
const empty=auxiliaryFixture({chat:[{is_user:true,mes:'Go on.'}]});
for(const text of ['First reply.','Second reply.','Third reply.']){empty.context.chat.push({is_user:false,mes:text});await empty.analysis.queue(empty.context.chat.length-1);}
assert.equal(empty.requests.length,3,'empty-input continuations remain distinct outputs');
console.log('Continuity output passed: host completion event, actual profile adapter, every turn, previous context and actual next-turn RP injection.');