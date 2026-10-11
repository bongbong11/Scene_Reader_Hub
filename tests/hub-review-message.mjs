import assert from 'node:assert/strict';
import {installReviewMessage} from '../src/adapters/review-message.js';
import {createCurrentChatReview} from '../src/adapters/current-chat-review.js';
import {DEFAULT_CHARACTER_REVIEW_PROMPT, currentCharacterReview, validateReviewTemplate} from '../src/character/replacement-prompts.js';

function fixture(){
 const listeners=new Map(),notes=[];
 const host={main_api:'openai',isGenerating:()=>false,event_types:{CHAT_COMPLETION_PROMPT_READY:'prompt',CHAT_COMPLETION_SETTINGS_READY:'request'}};
 host.eventSource={makeLast(event,fn){listeners.set(event,[...(listeners.get(event)||[]).filter(x=>x!==fn),fn]);},removeListener(event,fn){listeners.set(event,(listeners.get(event)||[]).filter(x=>x!==fn));}};
 const emit=async(event,data)=>{for(const fn of [...(listeners.get(event)||[])])await fn(data);};
 return {host,emit,notes,count:()=>[...listeners.values()].reduce((n,x)=>n+x.length,0),install:prompt=>installReviewMessage(host,prompt,event=>notes.push(event))};
}
for(const merged of [false,true]){
 const f=fixture(),hook=f.install('PRIVATE audit instruction');
 const memory={role:'system',content:'Older relationship memory'},history={role:'assistant',content:'Latest conflict'},image={type:'image_url',image_url:{url:'synthetic:test'}};
 const own=merged?{role:'system',content:[{type:'text',text:'Preset before\n'+hook.quietPrompt+'\nPreset after'},image]}:{role:'system',content:hook.quietPrompt};
 const messages=[memory,history,own,{role:'system',content:'Late preset'}];
 await f.emit('prompt',{chat:messages,dryRun:false});
 assert.equal(messages.at(-1).role,'user');assert.ok(messages.at(-1).content.includes('PRIVATE audit instruction'));
 assert.equal(messages[0],memory);assert.equal(messages[1],history);
 if(merged){assert.equal(messages[2].content[0].text,'Preset before\n\nPreset after');assert.equal(messages[2].content[1],image);}
 // Another extension adds material after assembly; the request hook moves ours again.
 messages.push({role:'system',content:'Other extension context'});
 await f.emit('request',{messages});hook.verify();
 assert.deepEqual(messages.at(-1),{role:'user',content:'PRIVATE audit instruction'});
 assert.equal(JSON.stringify(messages).match(/PRIVATE audit instruction/g).length,1);
 assert.ok(!JSON.stringify(messages).includes('<sr-review-'));
 assert.ok(!JSON.stringify(f.notes).includes('PRIVATE'));
 assert.deepEqual(f.notes.map(x=>x.phase),['assembly','request']);
 const ordinary=[{role:'system',content:'PRIVATE audit instruction'},{role:'user',content:'Normal chat'}],before=structuredClone(ordinary);
 await f.emit('request',{messages:ordinary});assert.deepEqual(ordinary,before);
 hook.dispose();assert.equal(f.count(),0);
}
const dry=fixture(),dryHook=dry.install('audit'),dryMessages=[{role:'system',content:dryHook.quietPrompt}],dryBefore=structuredClone(dryMessages);
await dry.emit('prompt',{chat:dryMessages,dryRun:true});assert.deepEqual(dryMessages,dryBefore);assert.throws(()=>dryHook.verify(),{code:'REVIEW_PLACEMENT_UNCONFIRMED'});dryHook.dispose();
const concurrent=fixture(),first=concurrent.install('first'),second=concurrent.install('second');
for(const [hook,text] of [[first,'first'],[second,'second']]){const messages=[{role:'system',content:hook.quietPrompt}];await concurrent.emit('prompt',{chat:messages});await concurrent.emit('request',{messages});assert.deepEqual(messages,[{role:'user',content:text}]);hook.verify();}
first.dispose();second.dispose();assert.equal(concurrent.count(),0);
for(const mode of ['failure','missing','unsupported']){
 const f=fixture();let calls=0;
 f.host.generateQuietPrompt=async()=>{calls++;if(mode==='failure')throw new Error('PRIVATE error');return 'model answer';};
 if(mode==='unsupported')f.host.main_api='textgenerationwebui';
 const client=createCurrentChatReview({loadHost:async()=>f.host});
 await assert.rejects(client.request('audit'),{code:{failure:'REVIEW_REQUEST_FAILED',missing:'REVIEW_PLACEMENT_UNCONFIRMED',unsupported:'REVIEW_PLACEMENT_UNSUPPORTED'}[mode]});
 assert.equal(f.count(),0);assert.equal(client.busy,false);if(mode==='unsupported')assert.equal(calls,0);
}
const cancelled=fixture();let finish;
cancelled.host.generateQuietPrompt=async options=>{const messages=[{role:'system',content:options.quietPrompt}];await cancelled.emit('request',{messages});return new Promise(r=>finish=r);};
const cancelClient=createCurrentChatReview({loadHost:async()=>cancelled.host}),abort=new AbortController(),waiting=cancelClient.request('audit',{signal:abort.signal});
await new Promise(r=>setImmediate(r));abort.abort();await assert.rejects(waiting,{code:'REVIEW_CANCELLED'});assert.equal(cancelClient.busy,true);
const unrelated=[{role:'user',content:'unrelated'}];await cancelled.emit('request',{messages:unrelated});assert.deepEqual(unrelated,[{role:'user',content:'unrelated'}]);finish('late');await new Promise(r=>setImmediate(r));assert.equal(cancelled.count(),0);assert.equal(cancelClient.busy,false);
assert.throws(()=>validateReviewTemplate(''),/명령문/);
for(const template of ['Audit {{char}} and {{user}}','Audit the character across all available history.']){
 assert.equal(validateReviewTemplate(template),template);
 assert.equal(currentCharacterReview('Selected persona',template),template,'host macros and plain instructions must not require the optional subject macro');
}
const macros=fixture(),macroHook=macros.install(currentCharacterReview('Selected persona','Audit {{char}} and {{user}}'));
// SillyTavern expands quiet-prompt macros before emitting prompt-ready.
const macroMessages=[{role:'system',content:macroHook.quietPrompt.replaceAll('{{char}}','Chat Actor').replaceAll('{{user}}','Chat Persona')}];
await macros.emit('prompt',{chat:macroMessages});await macros.emit('request',{messages:macroMessages});macroHook.verify();
assert.deepEqual(macroMessages.at(-1),{role:'user',content:'Audit Chat Actor and Chat Persona'});macroHook.dispose();
const quoted='A $& "quoted"';assert.equal(currentCharacterReview(quoted,'Audit {{subject}} and {{subject}}'),`Audit ${JSON.stringify(quoted)} and ${JSON.stringify(quoted)}`);
assert.equal(currentCharacterReview('Persona','{{char}} / {{user}} / {{CHAR}} / {{USER}} / {{subject}} / {{other}}',true),'{{user}} / {{char}} / {{user}} / {{char}} / "Persona" / {{other}}');
assert.equal(currentCharacterReview('Name {{char}}','{{subject}} {{char}} {{user}}',true),'"Name {{char}}" {{user}} {{char}}','swap only template macros, not inserted names');
assert.equal(currentCharacterReview('Actor'),DEFAULT_CHARACTER_REVIEW_PROMPT.replaceAll('{{subject}}','"Actor"'));
console.log('Review placement passed: final user role, preserved history/memory/preset/multimodal content, merged and duplicate ownership, request isolation, cleanup, dry runs, missing placement and editable subject rendering.');
