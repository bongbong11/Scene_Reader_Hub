import assert from 'node:assert/strict';
import {createCurrentChatReview} from '../src/adapters/current-chat-review.js';
import {createReplacementTool} from '../src/character/replacement-tool.js';
import {currentCharacterReview,replacementFilePrompt,reviewTranslationPrompt} from '../src/character/replacement-prompts.js';
import {stableFingerprint} from '../src/decision/policy.js';
let calls=[],release;
const client=createCurrentChatReview({timeoutMs:15,loadHost:async()=>({isGenerating:()=>false,generateQuietPrompt:options=>{calls.push(options);return new Promise(r=>release=r);}})});
await assert.rejects(client.request('review'),{code:'REVIEW_TIMEOUT'});assert.equal(client.busy,true);await assert.rejects(client.request('duplicate'),{code:'REVIEW_BUSY'});assert.equal(calls.length,1);
release('Late answer');await new Promise(r=>setImmediate(r));assert.equal(client.busy,false);assert.deepEqual(calls[0],{quietPrompt:'review',quietToLoud:false,skipWIAN:false,removeReasoning:true});
for(const mode of ['busy','unsupported','empty','failure']){const c=createCurrentChatReview({loadHost:async()=>mode==='unsupported'?{}:{isGenerating:()=>mode==='busy',generateQuietPrompt:async()=>{if(mode==='failure')throw new Error('PRIVATE_RAW_ERROR');return '';}}});await assert.rejects(c.request('x'),e=>e.code===({busy:'REVIEW_HOST_BUSY',unsupported:'REVIEW_UNSUPPORTED',empty:'REVIEW_EMPTY',failure:'REVIEW_REQUEST_FAILED'})[mode]&&!e.message.includes('PRIVATE'));assert.equal(c.busy,false);}
function fixture(){const store={characters:[{id:'a',name:'Actor',recordBank:{entity_type:'character',entity_name:'Actor',records:Array.from({length:12},(_,i)=>({id:'r'+i,rule:'Original disposition '+i,source_ids:['S001']}))}}],npcs:[],persona:null};const context={chatId:'room',chat:[{is_user:true,mes:'A question'},{is_user:false,mes:'A response'}]},notes=[],requests=[];let unlocked=true,key='room';const deps={characterStore:store,getContext:()=>context,stateChatKey:()=>key,ownerUnlocked:()=>unlocked,stableFingerprint,noteDiagnostic:(_stage,d)=>notes.push(d)};const api={request:async prompt=>{requests.push(prompt);return '사람에 따른 예외가 생겼지만 경계심은 남아 있다.';}};const tool=createReplacementTool(deps,{client:api,expand:async bank=>structuredClone(bank)});return {deps,tool,api,store,context,notes,requests,lock:()=>unlocked=false,switch:()=>key='other'};}
const f=fixture(),before=JSON.stringify(f.store),chatBefore=JSON.stringify(f.context.chat),answer=await f.tool.review('a');assert.equal(answer.valid(),true);assert.equal(f.requests.length,1);assert.ok(!f.requests[0].includes('Original disposition'));
const prompt=await f.tool.prompt('a',answer.text);for(let i=0;i<12;i++)assert.ok(prompt.includes('Original disposition '+i));assert.equal(JSON.stringify(f.store),before);assert.equal(JSON.stringify(f.context.chat),chatBefore);assert.ok(!JSON.stringify(f.notes).includes('경계심'));
f.lock();await assert.rejects(f.tool.review('a'),/개발자/);await assert.rejects(f.tool.prompt('a','x'),/개발자/);
for(const kind of ['edit','hide','switch','lock','cancel','file']){const g=fixture();let ready;g.api.request=()=>new Promise(r=>ready=r);const pending=g.tool.review('a');await new Promise(r=>setImmediate(r));if(kind==='edit')g.context.chat[0].mes='edited';if(kind==='hide')g.context.chat[1].is_hidden=true;if(kind==='switch')g.switch();if(kind==='lock')g.lock();if(kind==='cancel')g.tool.cancel();if(kind==='file')g.store.characters[0].recordBank.records[0].rule='replaced';ready('Late result');await assert.rejects(pending,{code:'REVIEW_STALE'});}
const paged=fixture();paged.store.characters[0].recordBank.pagedRecords={count:100};await assert.rejects(paged.tool.prompt('a','Reviewed'),/전부/);
assert.match(currentCharacterReview('Actor'),/scene retelling/);assert.match(currentCharacterReview('Actor'),/Do not invent changes/);assert.match(currentCharacterReview('Actor'),/ENGLISH only/);assert.match(currentCharacterReview('Actor'),/Original: [\s\S]*Change:/);assert.match(currentCharacterReview('Actor'),/Do not require a change to be permanent/);assert.ok(currentCharacterReview('Actor').split(/\s+/).length<500);assert.doesNotMatch(currentCharacterReview('Actor'),/at most \d+ words|supported lasting changes|stable core/);

assert.match(replacementFilePrompt(f.store.characters[0].recordBank,'review'),/record order\/count/);assert.match(prompt,/no Markdown/);assert.match(prompt,/downloadable UTF-8 .json FILE/);assert.match(prompt,/leave the file unchanged/);
console.log('Replacement tool passed: quiet contextual request, timeout single-flight, privacy, no chat/file mutation, full original export, lock and stale guards.');

const scope=fixture();scope.store.npcs=[{...scope.store.characters[0],id:'npc',kind:'npc'}];scope.store.persona={...scope.store.characters[0],id:'persona',kind:'persona'};assert.deepEqual(scope.tool.entries().map(e=>e.id),['a','persona']);await assert.rejects(scope.tool.review('npc'),/원본/);

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
const longClient=createCurrentChatReview({loadHost:async()=>({isGenerating:()=>false,generateQuietPrompt:async options=>{longOptions=options;return completeLongAnswer;}})});
assert.equal(await longClient.request('Review'),completeLongAnswer,'full model response survives without character/word clipping');assert.equal(Object.hasOwn(longOptions,'responseLength'),false,'host output limit remains authoritative');
console.log('Output limit preservation passed: no lower per-request cap and no clipping of long model answers.');
