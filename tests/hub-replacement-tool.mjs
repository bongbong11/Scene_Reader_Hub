import assert from 'node:assert/strict';
import {createCurrentChatReview} from '../src/adapters/current-chat-review.js';
import {createReplacementTool} from '../src/character/replacement-tool.js';
import {currentCharacterReview,replacementFilePrompt,reviewTranslationPrompt} from '../src/character/replacement-prompts.js';
import {stableFingerprint} from '../src/decision/policy.js';
function contextualHost(respond){
 const listeners=new Map(),host={main_api:'openai',event_types:{CHAT_COMPLETION_PROMPT_READY:'ready',CHAT_COMPLETION_SETTINGS_READY:'request'},isGenerating:()=>false};
 host.eventSource={makeLast(name,fn){const set=listeners.get(name)||[];listeners.set(name,[...set.filter(item=>item!==fn),fn]);},removeListener(name,fn){listeners.set(name,(listeners.get(name)||[]).filter(item=>item!==fn));}};
 host.generateQuietPrompt=async options=>{const chat=[{role:'system',content:'Preset'},{role:'assistant',content:'Recent story'},{role:'system',content:options.quietPrompt}];for(const fn of [...(listeners.get('ready')||[])])await fn({chat,dryRun:false});for(const fn of [...(listeners.get('request')||[])])await fn({messages:chat});host.sent=chat;return respond(options);};
 host.listenerCount=()=>[...listeners.values()].reduce((sum,list)=>sum+list.length,0);return host;
}
let calls=[],release;
const delayedHost=contextualHost(options=>{calls.push(options);return new Promise(r=>release=r);});
const client=createCurrentChatReview({timeoutMs:15,loadHost:async()=>delayedHost});
await assert.rejects(client.request('review'),{code:'REVIEW_TIMEOUT'});assert.equal(client.busy,true);await assert.rejects(client.request('duplicate'),{code:'REVIEW_BUSY'});assert.equal(calls.length,1);
release('Late answer');await new Promise(r=>setImmediate(r));assert.equal(client.busy,false);assert.deepEqual(delayedHost.sent.at(-1),{role:'user',content:'review'});assert.equal(delayedHost.listenerCount(),0);assert.equal(calls[0].skipWIAN,false);
for(const mode of ['busy','unsupported','empty','failure']){const c=createCurrentChatReview({loadHost:async()=>mode==='unsupported'?{}:{...contextualHost(async()=>{if(mode==='failure')throw new Error('PRIVATE_RAW_ERROR');return '';}),isGenerating:()=>mode==='busy'}});await assert.rejects(c.request('x'),e=>e.code===({busy:'REVIEW_HOST_BUSY',unsupported:'REVIEW_UNSUPPORTED',empty:'REVIEW_EMPTY',failure:'REVIEW_REQUEST_FAILED'})[mode]&&!e.message.includes('PRIVATE'));assert.equal(c.busy,false);}
function fixture(){const store={characters:[{id:'a',name:'Actor',recordBank:{entity_type:'character',entity_name:'Actor',records:Array.from({length:12},(_,i)=>({id:'r'+i,rule:'Original disposition '+i,source_ids:['S001']}))}}],npcs:[],persona:null};const context={chatId:'room',chat:[{is_user:true,mes:'A question'},{is_user:false,mes:'A response'}]},notes=[],requests=[];let unlocked=true,key='room';const deps={characterStore:store,getContext:()=>context,stateChatKey:()=>key,ownerUnlocked:()=>unlocked,stableFingerprint,noteDiagnostic:(_stage,d)=>notes.push(d)};const api={request:async prompt=>{requests.push(prompt);return '사람에 따른 예외가 생겼지만 경계심은 남아 있다.';}};const tool=createReplacementTool(deps,{client:api,expand:async bank=>structuredClone(bank)});return {deps,tool,api,store,context,notes,requests,lock:()=>unlocked=false,switch:()=>key='other'};}
const f=fixture(),before=JSON.stringify(f.store),chatBefore=JSON.stringify(f.context.chat),answer=await f.tool.review('a');assert.equal(answer.valid(),true);assert.equal(f.requests.length,1);assert.ok(!f.requests[0].includes('Original disposition'));
const prompt=await f.tool.prompt('a',answer.text);for(let i=0;i<12;i++)assert.ok(prompt.includes('Original disposition '+i));assert.equal(JSON.stringify(f.store),before);assert.equal(JSON.stringify(f.context.chat),chatBefore);assert.ok(!JSON.stringify(f.notes).includes('경계심'));
f.lock();assert.equal(answer.valid(),true,'developer lock does not invalidate a public review');assert.equal((await f.tool.review('a')).valid(),true);assert.match(await f.tool.prompt('a','x'),/Original disposition/);
delete f.deps.ownerUnlocked;assert.ok(f.tool.reviewInstruction('a'),'public tool has no developer-mode dependency');
for(const kind of ['edit','hide','switch','cancel','file']){const g=fixture();let ready;g.api.request=()=>new Promise(r=>ready=r);const pending=g.tool.review('a');await new Promise(r=>setImmediate(r));if(kind==='edit')g.context.chat[0].mes='edited';if(kind==='hide')g.context.chat[1].is_hidden=true;if(kind==='switch')g.switch();if(kind==='cancel')g.tool.cancel();if(kind==='file')g.store.characters[0].recordBank.records[0].rule='replaced';ready('Late result');await assert.rejects(pending,{code:'REVIEW_STALE'});}
const paged=fixture();paged.store.characters[0].recordBank.pagedRecords={count:100};await assert.rejects(paged.tool.prompt('a','Reviewed'),/전부/);
assert.match(currentCharacterReview('Actor'),/scene retelling/);assert.match(currentCharacterReview('Actor'),/Do not invent events/);assert.match(currentCharacterReview('Actor'),/English only/);assert.match(currentCharacterReview('Actor'),/Original: [\s\S]*Change:/);assert.match(currentCharacterReview('Actor'),/Only record LASTING change/);assert.doesNotMatch(currentCharacterReview('Actor'),/at most \d+ words|supported lasting changes|stable core/);

assert.match(replacementFilePrompt(f.store.characters[0].recordBank,'review'),/record order\/count/);assert.match(prompt,/no Markdown/);assert.match(prompt,/downloadable UTF-8 .json FILE/);assert.match(prompt,/leave the file unchanged/);
console.log('Replacement tool passed: public access, quiet contextual request, timeout single-flight, privacy, no chat/file mutation, full original export and stale guards.');

const scope=fixture();scope.store.npcs=[{...scope.store.characters[0],id:'npc',kind:'npc'}];scope.store.persona={...scope.store.characters[0],id:'persona',kind:'persona'};assert.deepEqual(scope.tool.entries().map(e=>e.id),['a','persona']);await assert.rejects(scope.tool.review('npc'),/원본/);
const macroTemplate='Audit {{char}} with {{user}}. Target {{subject}}.';
const scopedBefore=JSON.stringify(scope.store),scopedChat=JSON.stringify(scope.context.chat);
for(const id of ['a','persona','a']){
 const expected=id==='persona'?'Audit {{user}} with {{char}}. Target "Actor".':'Audit {{char}} with {{user}}. Target "Actor".';
 assert.equal(scope.tool.reviewInstruction(id,macroTemplate),expected);
 await scope.tool.review(id,macroTemplate);assert.equal(scope.requests.at(-1),expected);
}
assert.equal(JSON.stringify(scope.store),scopedBefore);assert.equal(JSON.stringify(scope.context.chat),scopedChat);

let rawOptions;
const rawClient=createCurrentChatReview({loadHost:async()=>({isGenerating:()=>false,generateRaw:async options=>{rawOptions=options;return '한국어 번역';}})});
assert.equal(await rawClient.request(reviewTranslationPrompt('Before: guarded -> Now: guarded, with one exception.'),{raw:true}),'한국어 번역');
assert.equal('responseLength' in rawOptions,false,'respect the model output budget instead of imposing a truncating cap');assert.equal(rawOptions.trimNames,false);assert.ok(!('quietPrompt' in rawOptions));assert.match(rawOptions.prompt,/Return ONLY the translation/);
const translation=fixture(),translationBefore=JSON.stringify(translation.store);let options;
translation.api.request=async (_prompt,opts)=>{options=opts;return '경계심은 유지하되 특정 상대에게 예외가 있음';};
assert.match(await translation.tool.translate('a','Guarded, with one exception.'),/경계심/);assert.equal(options.raw,true);assert.equal(JSON.stringify(translation.store),translationBefore);assert.ok(!JSON.stringify(translation.notes).includes('경계심'));
await translation.tool.translate('a','A complete finding. '.repeat(1200));
const staleTranslation=fixture();let finishTranslation;staleTranslation.api.request=()=>new Promise(r=>finishTranslation=r);const outstanding=staleTranslation.tool.translate('a','Before -> Now');staleTranslation.switch();finishTranslation('늦은 번역');await assert.rejects(outstanding,{code:'REVIEW_STALE'});
console.log('Review brevity and translation passed: English-only compact prompt, host output budget, raw text-only translation, source isolation, no mutation or private log text.');

const completeLongAnswer='Original: A prior detail. Change: A complete revised detail.\n'.repeat(500)+'FINAL_COMPLETE_SENTENCE.';
let longOptions;
const longClient=createCurrentChatReview({loadHost:async()=>contextualHost(async options=>{longOptions=options;return completeLongAnswer;})});
assert.equal(await longClient.request('Review'),completeLongAnswer,'full model response survives without character/word clipping');assert.equal(Object.hasOwn(longOptions,'responseLength'),false,'host output limit remains authoritative');
console.log('Output limit preservation passed: no lower per-request cap and no clipping of long model answers.');
