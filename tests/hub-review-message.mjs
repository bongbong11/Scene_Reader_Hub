import assert from 'node:assert/strict';
import {installReviewMessage} from '../src/adapters/review-message.js';
import {createCurrentChatReview} from '../src/adapters/current-chat-review.js';
import {currentCharacterReview,validateReviewTemplate} from '../src/character/replacement-prompts.js';
import {reviewHost} from './fixtures/review-host.mjs';
for(const merged of [false,true])for(const squashed of [false,true]){
 const f=reviewHost(),prepare=f.host.promptManager.preparePrompt,hook=installReviewMessage(f.host,'PRIVATE audit instruction',event=>f.notes.push(event));
 const built=f.assemble(hook.quietPrompt,{merged,squashed}),before=structuredClone(built.chat);
 await f.emit('prompt',{chat:built.chat,dryRun:false});
 assert.deepEqual(built.chat[3],{role:'user',content:hook.quietPrompt});
 built.chat.push({role:'system',content:'Other extension context'});
 await f.emit('request',{messages:built.chat});hook.verify();
 assert.deepEqual(built.chat[3],{role:'user',content:'PRIVATE audit instruction'});
 for(const [i,role] of ['system','user','assistant'].entries())assert.equal(built.chat[i+4].content,'Depth 0 order 0 '+role);
 assert.equal(built.chat.at(-1).content,'Other extension context');
 assert.equal(JSON.stringify(built.chat).match(/PRIVATE audit instruction/g).length,1);
 assert.ok(!JSON.stringify(built.chat).includes('<sr-review-'));
 assert.deepEqual(f.flatten()[3],{role:'user',content:'PRIVATE audit instruction'});
 assert.ok(!JSON.stringify(f.host.promptManager.messages).includes('<sr-review-'));
 for(let i=0;i<3;i++)assert.deepEqual(built.chat[i],before[i]);
 if(merged){const prefix=built.chat.find(m=>Array.isArray(m.content));assert.equal(prefix.content[0].text,'Preset before\n\nPreset after');assert.deepEqual(prefix.content[1],built.image);}
 assert.ok(!JSON.stringify(f.notes).includes('PRIVATE'));assert.ok(f.notes.every(note=>note.position==='last_chat_message'));assert.deepEqual(f.notes.map(x=>x.phase),['assembly','request']);
 const normal=[{role:'user',content:'Normal chat'}],copy=structuredClone(normal);await f.emit('request',{messages:normal});assert.deepEqual(normal,copy);
 hook.dispose();assert.equal(f.count(),0);assert.equal(f.host.promptManager.preparePrompt,prepare);
}
for(const squashed of [false,true]){
 const f=reviewHost(),hook=installReviewMessage(f.host,'Audit after the tool result'),built=f.assemble(hook.quietPrompt,{squashed,tool:true}),before=structuredClone(built.chat);
 await f.emit('prompt',{chat:built.chat});await f.emit('request',{messages:built.chat});hook.verify();
 assert.deepEqual(built.chat.slice(0,4),before.slice(0,4),'tool call and result stay together');assert.deepEqual(built.chat[4],{role:'user',content:'Audit after the tool result'});assert.equal(built.chat[5].content,'Depth 0 order 0 system');assert.deepEqual(f.flatten(),built.chat);hook.dispose();assert.equal(f.count(),0);
}
for(const mode of ['dry','missing-history','unsupported','failure']){
 const f=reviewHost();if(mode==='unsupported')f.host.main_api='other';
 if(mode==='failure')f.host.generateQuietPrompt=async()=>{throw new Error('PRIVATE error');};
 if(['dry','missing-history'].includes(mode))f.host.generateQuietPrompt=async options=>{const built=f.assemble(options.quietPrompt);if(mode==='missing-history')f.host.promptManager.messages.collection=f.host.promptManager.messages.collection.filter(block=>block.identifier!=='chatHistory');await f.emit('prompt',{chat:built.chat,dryRun:mode==='dry'});await f.emit('request',{messages:built.chat});return 'wrongly placed result';};
 const prepare=f.host.promptManager.preparePrompt,client=createCurrentChatReview({loadHost:async()=>f.host});
 await assert.rejects(client.request('audit'),{code:mode==='unsupported'?'REVIEW_PLACEMENT_UNSUPPORTED':mode==='failure'?'REVIEW_REQUEST_FAILED':'REVIEW_PLACEMENT_UNCONFIRMED'});
 assert.equal(f.count(),0);assert.equal(client.busy,false);assert.equal(f.host.promptManager.preparePrompt,prepare);
}
const cancelled=reviewHost();let finish;cancelled.host.generateQuietPrompt=async options=>{const built=cancelled.assemble(options.quietPrompt);await cancelled.emit('prompt',{chat:built.chat});await cancelled.emit('request',{messages:built.chat});return new Promise(r=>finish=r);};
const cancelClient=createCurrentChatReview({loadHost:async()=>cancelled.host}),abort=new AbortController(),waiting=cancelClient.request('audit',{signal:abort.signal});await new Promise(r=>setImmediate(r));abort.abort();await assert.rejects(waiting,{code:'REVIEW_CANCELLED'});assert.equal(cancelClient.busy,true);finish('late');await new Promise(r=>setImmediate(r));assert.equal(cancelled.count(),0);assert.equal(cancelClient.busy,false);
assert.throws(()=>validateReviewTemplate(''),/명령문/);
for(const template of ['Audit {{char}} and {{user}}','Audit the character across all available history.'])assert.equal(currentCharacterReview('Selected persona',template),template);
const quoted='A $& "quoted"';assert.equal(currentCharacterReview(quoted,'Audit {{subject}}'),`Audit ${JSON.stringify(quoted)}`);
assert.equal(currentCharacterReview('Persona','{{char}} / {{user}} / {{CHAR}} / {{USER}} / {{subject}} / {{other}}',true),'{{user}} / {{char}} / {{user}} / {{char}} / "Persona" / {{other}}');
assert.equal(currentCharacterReview('Name {{char}}','{{subject}} {{char}} {{user}}',true),'"Name {{char}}" {{user}} {{char}}');
console.log('Review placement passed: native last chat USER message before ALL depth-0/order-0 roles; wire/inspector agreement, examples, memory, preset and multimodal preservation, squash/merge, source isolation and hook cleanup.');
