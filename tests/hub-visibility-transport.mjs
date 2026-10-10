import assert from 'node:assert/strict';
import {createPresetRequest} from '../src/injection/preset-request.js';
import {createVisibilityAdapter} from '../src/adapters/message-visibility.js';
import {createPromptObserver} from '../src/injection/receipt.js';
import {captureOwnedBlocks,stripOwnedBlocks} from '../src/injection/source-validity.js';
import {messageSnapshot,firstChangedMessage} from '../src/context/message-identity.js';
import {visibilityKey} from '../src/context/visibility.js';
// Full owned-message matching survives reordering and other-extension suffixes.
const initial={messages:[{role:'system',content:'Host prefix. Hub own block. Other extension.'},{role:'user',content:'User input.'}]};
const manifest=captureOwnedBlocks(initial,['Hub own block.']);
const reordered=structuredClone(initial);reordered.messages.unshift({role:'system',content:'Another extension goes first.'});reordered.messages[1].content+=' Tail from another extension.';
assert.equal(stripOwnedBlocks(reordered,manifest),1);assert.match(reordered.messages[1].content,/Other extension.*Tail/);assert.ok(!reordered.messages[1].content.includes('Hub own block'));
const duplicate={messages:[...structuredClone(initial.messages),structuredClone(initial.messages[0])]};assert.throws(()=>stripOwnedBlocks(duplicate,manifest),{code:'HUB_STALE_INJECTION'});
const repeated={messages:[{role:'system',content:'Hub own block. Hub own block.'}]};const repeatedManifest=captureOwnedBlocks(repeated,['Hub own block.']);assert.equal(repeatedManifest.length,1);assert.throws(()=>stripOwnedBlocks(repeated,repeatedManifest),{code:'HUB_STALE_INJECTION'},'ambiguous duplicate blocks cannot leave stale injection silently');
for(const preset of [false,true]){
 const chat=[{is_user:true,mes:'Input'},{is_user:false,mes:'Output'}],sent=[],events=[];
 const context={chat,name1:'Player',name2:'Actor',characterId:1};
 const manager={serviceSettings:{prompts:[{identifier:'main',name:'Main',content:'Main host rule.'}],prompt_order:[{character_id:1,order:[{identifier:'main',enabled:true}]}]},activeCharacter:{id:1},getPromptOrderForCharacter(){return this.serviceSettings.prompt_order[0].order},preparePrompt:p=>({...p})};
 let cycle={injection:{chatKey:'room',visibilityKeyV1:visibilityKey(chat),payload:'Hub protects {{user}}.',worldPayload:'World rule.',capturePayload:'',scenePreset:preset,worldPreset:false,sceneSlot:{identifier:'main',side:'after'}}};
 const window={Request,fetch:async(_input,options)=>{sent.push(JSON.parse(options.body));return {ok:true};}};
 const transport=createPresetRequest({window,getContext:()=>context,getChatKey:()=> 'room',getCycle:()=>cycle,isEnabled:()=>true,loadHost:async()=>({promptManager:manager}),verifyRequest:()=>{},report:(...e)=>events.push(e)});await transport.init();transport.start('normal');manager.preparePrompt({identifier:'main',content:'Main host rule.'});
 const messages=[{role:'system',content:'Main host rule.'},...(!preset?[{role:'system',content:'Hub protects Player.'}]:[]),{role:'system',content:'World rule.'},{role:'user',content:'Input'}],body={type:'normal',messages};
 transport.observeAssembly({prompt:messages});assert.equal(transport.observeRequest(body),true);
 transport.invalidate(cycle.injection);chat[0].is_system=true;cycle={mode:'cancelled'};
 // The host mutates the original request after SETTINGS_READY.
 body.messages.unshift({role:'system',content:'Another extension.'});body.messages.at(-1).content+=' Non-Hub suffix.';
 async function sendOpenAIRequest(){return window.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});}
 async function sendGenerationRequest(){return sendOpenAIRequest();}
 await sendGenerationRequest();const text=JSON.stringify(sent[0]);assert.ok(!text.includes('Hub protects'));assert.ok(!text.includes('World rule'));assert.match(text,/Main host rule/);assert.match(text,/Another extension/);assert.match(text,/Non-Hub suffix/);assert.ok(events.some(e=>e[1]==='INJECTION_INVALIDATED'));
}
// Signals read host state; the wrapper preserves other extension hook ownership.
const chain=Symbol.for('hyedam.request-injection.hook-chain.v1'),owner=Symbol('other'),window={fetch:async()=>({ok:true})};Object.defineProperty(window.fetch,chain,{value:[owner]});let checks=0;
const adapter=createVisibilityAdapter({window,document:{getElementById:()=>null},event_types:{},check:async()=>{checks++;}});adapter.init();const hooked=window.fetch;adapter.init();assert.equal(window.fetch,hooked);assert.deepEqual(window.fetch[chain],[owner]);await window.fetch('/api/chats/save',{method:'POST'});await new Promise(r=>setImmediate(r));assert.equal(checks,1);
const chat=[{is_user:false,mes:'Source',send_date:'same'}],before=messageSnapshot(chat);chat[0].is_system=true;assert.equal(firstChangedMessage(before,messageSnapshot(chat)),-1,'hide is not a destructive content rollback');chat[0].mes='Edited';assert.equal(firstChangedMessage(before,messageSnapshot(chat)),0);
let confirmed=0;const observer=createPromptObserver({getExpected:()=>({chatKey:'room',payload:'Hub own block.',visibilityKeyV1:'visible'}),getContext:()=>({chat}),getChatKey:()=> 'room',getNames:()=>({}),getCycleId:()=> 'c',report:()=>confirmed++,updateActivity(){},updateStatus(){}});observer.verifyRequest(initial);assert.equal(confirmed,0,'a hidden-source receipt cannot report inclusion success');
console.log('Visibility transport passed: ordinary/preset final request removal, macro names, reorder/suffix preservation, ambiguous ownership, shared hook chains, isolated signals, hide versus edit, and invalid receipt rejection.');
