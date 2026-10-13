import assert from 'node:assert/strict';
import {installReviewMessage} from '../src/adapters/review-message.js';
import {createCurrentChatReview} from '../src/adapters/current-chat-review.js';
import {currentCharacterReview,validateReviewTemplate} from '../src/character/replacement-prompts.js';
import {reviewHost} from './fixtures/review-host.mjs';
for(const squashed of [false,true])for(const transformed of [false,true]){
 const f=reviewHost(),original=f.host.reviewWindow.SceneReaderHubBeforeGenerate,stored=JSON.stringify(f.host.chat),hook=installReviewMessage(f.host,'PRIVATE audit',event=>f.notes.push(event));
 const core=structuredClone(f.host.chat);
 await f.emit('start','quiet',hook.options,false);
 await f.host.reviewWindow.SceneReaderHubBeforeGenerate(core,10000,()=>assert.fail('unexpected abort'),'quiet');
 assert.deepEqual(core.at(-1),{name:'User',is_user:true,is_system:false,mes:'PRIVATE audit',extra:{}});
 await f.host.reviewWindow.SceneReaderHubBeforeGenerate(core,10000,()=>assert.fail('unexpected abort'),'quiet');
 assert.equal(core.length,2,'one input per request');
 const built=f.assemble(core,{squashed});if(transformed)built.chat[0].content='Rewritten memory';
 await f.emit('prompt',{chat:built.chat,dryRun:false});hook.finish();
 assert.deepEqual(built.chat[3],{role:'user',content:'PRIVATE audit'});assert.equal(built.chat[4].content,'Depth 0 order 0 system');assert.equal(built.chat.at(-1).content,'Late preset');
 assert.deepEqual(f.flatten()[3],built.chat[3]);assert.ok(!JSON.stringify(f.notes).includes('PRIVATE'));assert.deepEqual(f.notes.map(x=>x.phase),['history','assembly']);
 assert.equal(JSON.stringify(f.host.chat),stored);assert.equal(hook.options.quiet_prompt,'');
 hook.dispose();assert.equal(f.count(),0);assert.equal(f.host.reviewWindow.SceneReaderHubBeforeGenerate,original);
}
// No audit input is attached to normal generation, dry runs or another quiet job.
for(const mode of ['normal','dry','other-quiet']){
 const f=reviewHost(),hook=installReviewMessage(f.host,'Private audit'),core=structuredClone(f.host.chat);
 await f.emit('start',mode==='normal'?'normal':'quiet',mode==='other-quiet'?{signal:new AbortController().signal}:hook.options,mode==='dry');
 await f.host.reviewWindow.SceneReaderHubBeforeGenerate(core,10000,()=>assert.fail('unrelated abort'),mode==='normal'?'normal':'quiet');
 assert.equal(core.length,f.host.chat.length);hook.dispose();
}
// Saved chat must never be used as the request-only mutable list.
{
 const f=reviewHost(),hook=installReviewMessage(f.host,'Audit');let aborted=false;await f.emit('start','quiet',hook.options,false);
 await f.host.reviewWindow.SceneReaderHubBeforeGenerate(f.host.chat,10000,()=>aborted=true,'quiet');assert.equal(aborted,true);assert.equal(f.host.chat.length,1);hook.dispose();
}
// Answer delivery must not depend on inspector-format confirmation.
{
 const f=reviewHost();f.host.skipPrompt=true;
 const client=createCurrentChatReview({loadHost:async()=>f.host});assert.match(await client.request('Audit'),/Accepts help/);assert.equal(f.count(),0);
}
for(const mode of ['unsupported','failure','empty']){
 const f=reviewHost();if(mode==='unsupported')f.host.main_api='other';
 if(mode==='failure')f.host.Generate=async()=>{throw new Error('PRIVATE error');};
 if(mode==='empty')f.host.Generate=async()=>'';
 const original=f.host.reviewWindow.SceneReaderHubBeforeGenerate,client=createCurrentChatReview({loadHost:async()=>f.host});
 await assert.rejects(client.request('audit'),{code:mode==='unsupported'?'REVIEW_PLACEMENT_UNSUPPORTED':mode==='failure'?'REVIEW_REQUEST_FAILED':'REVIEW_EMPTY'});
 assert.equal(f.count(),0);assert.equal(client.busy,false);assert.equal(f.host.reviewWindow.SceneReaderHubBeforeGenerate,original);
}
const cancelled=reviewHost(()=>new Promise(r=>finish=r));let finish;
const cancelClient=createCurrentChatReview({loadHost:async()=>cancelled.host}),abort=new AbortController(),waiting=cancelClient.request('audit',{signal:abort.signal});await new Promise(r=>setImmediate(r));abort.abort();await assert.rejects(waiting,{code:'REVIEW_CANCELLED'});assert.equal(cancelClient.busy,true);finish('late');await new Promise(r=>setImmediate(r));assert.equal(cancelled.count(),0);assert.equal(cancelClient.busy,false);
assert.throws(()=>validateReviewTemplate(''),/명령문/);
for(const template of ['Audit {{char}} and {{user}}','Audit the character across all available history.'])assert.equal(currentCharacterReview('Selected persona',template),template);
const quoted='A $& "quoted"';assert.equal(currentCharacterReview(quoted,'Audit {{subject}}'),`Audit ${JSON.stringify(quoted)}`);
assert.equal(currentCharacterReview('Persona','{{char}} / {{user}} / {{CHAR}} / {{USER}} / {{subject}} / {{other}}',true),'{{user}} / {{char}} / {{user}} / {{char}} / "Persona" / {{other}}');
assert.equal(currentCharacterReview('Name {{char}}','{{subject}} {{char}} {{user}}',true),'"Name {{char}}" {{user}} {{char}}');
console.log('Review input passed: request-only user message through the native history path, depth-0 roles after input, no prompt relocation, answer delivery independent of inspector, saved chat and unrelated requests preserved.');
