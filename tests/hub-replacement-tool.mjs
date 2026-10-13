import assert from 'node:assert/strict';
import {createCurrentChatReview} from '../src/adapters/current-chat-review.js';
import {createReplacementTool} from '../src/character/replacement-tool.js';
import {currentCharacterReview,replacementFilePrompt} from '../src/character/replacement-prompts.js';
import {requestWithConnectionProfile} from '../src/adapters/connection-profile.js';
import {stableFingerprint} from '../src/decision/policy.js';
import {reviewHost} from './fixtures/review-host.mjs';
import {cleanReviewText} from '../src/character/review-text.js';
let release;
const delayed=reviewHost(()=>new Promise(r=>release=r)),client=createCurrentChatReview({timeoutMs:15,loadHost:async()=>delayed.host});
await assert.rejects(client.request('review'),{code:'REVIEW_TIMEOUT'});assert.equal(client.busy,true);await assert.rejects(client.request('duplicate'),{code:'REVIEW_BUSY'});release('Late answer');await new Promise(r=>setImmediate(r));assert.equal(client.busy,false);assert.equal(delayed.count(),0);assert.equal(delayed.host.sent[3].content,'review');assert.equal(delayed.host.options.skipWIAN,false);
function fixture(){
 const store={characters:[{id:'a',kind:'character',name:'Actor',recordBank:{entity_type:'character',entity_name:'Actor',records:Array.from({length:12},(_,i)=>({id:'r'+i,rule:'Original disposition '+i,source_ids:['S001']}))}}],npcs:[],persona:null};
 const context={chatId:'room',chatMetadata:{room:'room'},chat:[{is_user:true,mes:'A question'},{is_user:false,mes:'A response'}]},notes=[],requests=[],saved=new Map(),profileRequests=[];let key='room',failSave=false;
 const deps={characterStore:store,settings:{reasonerProfileId:'extension-profile'},getContext:()=>context,stateChatKey:()=>key,stableFingerprint,noteDiagnostic:(_stage,d)=>notes.push(d),requestWithConnectionProfile,
 companionStorage:{load:async(_ns,{metadata})=>structuredClone(saved.get(metadata.room)||null),save:async(_ns,value,{metadata})=>{if(failSave)throw new Error('Synthetic storage failure');saved.set(metadata.room,structuredClone(value));}},
 connectionRequestService:{getProfile:id=>({id}),validateProfile(){},sendRequest:async(id,messages,maxTokens,options)=>{profileRequests.push({id,messages,maxTokens,options});return {content:'원래 성격은 유지하되 한 사람에게 예외가 생겼습니다.'};}}};
 const api={request:async prompt=>{requests.push(prompt);return 'Original: Guarded.\nChange: Guarded, but accepts help from one person.';}};
 const tool=createReplacementTool(deps,{client:api,expand:async bank=>structuredClone(bank)});
 return {deps,tool,api,store,context,notes,requests,saved,profileRequests,fail:value=>failSave=value,switch:room=>{key=room;context.chatId=room;context.chatMetadata={room};}};
}
const f=fixture(),before=JSON.stringify(f.store),chat=JSON.stringify(f.context.chat),first=await f.tool.review('a');
assert.equal(first.valid(),true);assert.doesNotMatch(f.requests[0],/\[PREVIOUS AUDIT\]/);assert.equal((await f.tool.loadAnswer('a')).text,first.text);
const prompt=await f.tool.prompt('a',first.text);for(let i=0;i<12;i++)assert.ok(prompt.includes('Original disposition '+i));assert.equal(JSON.stringify(f.store),before);assert.equal(JSON.stringify(f.context.chat),chat);
assert.match(prompt,/downloadable UTF-8 .json FILE/);assert.match(prompt,/already represented/);assert.match(prompt,/opposite/);
f.api.request=async text=>{f.requests.push(text);return 'Original: Guarded.\nChange: Guarded with a trusted partner; now works as an engineer.';};
const second=await f.tool.review('a');assert.match(f.requests.at(-1),/\[PREVIOUS AUDIT\]/);assert.ok(f.requests.at(-1).includes(first.text));assert.equal((await f.tool.loadAnswer('a')).text,second.text);
await f.tool.review('a');assert.ok(f.requests.at(-1).includes(second.text));assert.ok(!f.requests.at(-1).includes(first.text));
f.store.characters[0].recordBank.records[0].rule='Updated JSON';assert.equal((await f.tool.loadAnswer('a')).text,second.text,'replacing JSON retains the same person reference');
f.switch('other');assert.equal((await f.tool.loadAnswer('a')).text,'');assert.doesNotMatch(f.tool.reviewInstruction('a'),/\[PREVIOUS AUDIT\]/);f.switch('room');assert.equal((await f.tool.loadAnswer('a')).text,second.text);
for(const mode of ['error','empty','storage']){f.api.request=async()=>{if(mode==='error')throw new Error('Synthetic model failure');return mode==='empty'?'':'Replacement answer';};f.fail(mode==='storage');await assert.rejects(f.tool.review('a'));f.fail(false);assert.equal((await f.tool.loadAnswer('a')).text,second.text);}
f.api.request=async()=> 'No further revisions.';assert.equal((await f.tool.review('a')).text,second.text);
await f.tool.saveAnswer('a','Manually corrected cumulative answer.');assert.equal((await f.tool.loadAnswer('a')).text,'Manually corrected cumulative answer.');
assert.match(await f.tool.translate('a',second.text),/성격/);assert.equal(f.profileRequests[0].id,'extension-profile');assert.equal(f.profileRequests[0].options.includePreset,false);assert.equal(f.profileRequests[0].options.stream,false);assert.ok(f.profileRequests[0].messages[0].content.includes(JSON.stringify(second.text)));
assert.equal((await f.tool.loadAnswer('a')).text,'Manually corrected cumulative answer.','translation does not overwrite English audit');
assert.ok(!JSON.stringify(f.notes).includes('Guarded'));assert.ok(!JSON.stringify(f.notes).includes('성격'));assert.equal(JSON.stringify(f.context.chat),chat);
await f.tool.clearAnswer('a');assert.equal((await f.tool.loadAnswer('a')).text,'');
for(const kind of ['edit','hide','switch','cancel','file']){const g=fixture();let finish;g.api.request=()=>new Promise(r=>finish=r);const pending=g.tool.review('a');await new Promise(r=>setImmediate(r));if(kind==='edit')g.context.chat[0].mes='edited';if(kind==='hide')g.context.chat[1].is_hidden=true;if(kind==='switch')g.switch('other');if(kind==='cancel')g.tool.cancel();if(kind==='file')g.store.characters[0].recordBank.records[0].rule='replaced';finish('Late result');await assert.rejects(pending,{code:'REVIEW_STALE'});assert.equal(g.saved.size,0);}
const scoped=fixture();scoped.store.npcs=[{...scoped.store.characters[0],id:'npc'}];scoped.store.persona={...scoped.store.characters[0],id:'persona',kind:'persona'};assert.deepEqual(scoped.tool.entries().map(e=>e.id),['a','persona']);await assert.rejects(scoped.tool.review('npc'),/원본/);
const template='Audit {{char}} with {{user}}. Target {{subject}}.';for(const id of ['a','persona','a']){const prefix=id==='persona'?'Audit {{user}} with {{char}}. Target "Actor".':'Audit {{char}} with {{user}}. Target "Actor".';await scoped.tool.review(id,template);assert.ok(scoped.requests.at(-1).startsWith(prefix));}
assert.doesNotMatch(currentCharacterReview('Actor'),/\[PREVIOUS AUDIT\]/);assert.match(currentCharacterReview('Actor'),/ONE complete, up-to-date answer/);assert.match(currentCharacterReview('Actor'),/English only/);assert.match(currentCharacterReview('Actor'),/No scene retellings/);
const prior='Original: Literal {{char}}.\nChange: Literal {{user}}.';assert.ok(currentCharacterReview('Persona',template,true,prior).includes(prior),'prior text is not re-swapped by persona macros');
assert.match(replacementFilePrompt(scoped.store.characters[0].recordBank,'review'),/record order\/count/);
const paged=fixture();paged.store.characters[0].recordBank.pagedRecords={count:100};await assert.rejects(paged.tool.prompt('a','Reviewed'),/전부/);
const translation=fixture();let finishTranslation;translation.deps.connectionRequestService.sendRequest=()=>new Promise(r=>finishTranslation=r);const waiting=translation.tool.translate('a','Before -> Now');await new Promise(r=>setImmediate(r));translation.switch('other');finishTranslation({content:'늦은 번역'});await assert.rejects(waiting,{code:'REVIEW_STALE'});
for(const response of [{content:''},{content:'partial',finish_reason:'length'}]){const g=fixture();g.deps.connectionRequestService.sendRequest=async()=>response;await assert.rejects(g.tool.translate('a','English answer'),{code:response.finish_reason?'PROFILE_TRUNCATED_RESPONSE':'PROFILE_INVALID_RESPONSE'});}
const long='Original: Guarded.\nChange: A person-specific exception.\n'.repeat(500)+'FINAL_COMPLETE_SENTENCE.';const native=reviewHost(async()=>long),longClient=createCurrentChatReview({loadHost:async()=>native.host});assert.equal(await longClient.request('Review'),long);assert.equal(Object.hasOwn(native.host.options,'responseLength'),false);
console.log('Replacement passed: one cumulative audit per room/person, current JSON export, regeneration, reopen, failure/cancellation retention, scope and privacy, native latest user placement, full output, extension-profile text translation.');

const body='Original: Guarded.\nChange: Accepts help from a trusted person.';
for(const noise of ['<charm-now>Foreign state</charm-now>','<Other_Block data-label="a > b"><nested>Foreign state</nested></Other_Block>','&lt;foreign-state&gt;Foreign state&lt;/foreign-state&gt;','<!-- Foreign state -->','<foreign-state/>','<foreign-state>Foreign state','<foreign-state']){
 assert.equal(cleanReviewText(body+'\n'+noise),body);
 assert.equal(cleanReviewText(cleanReviewText(body+'\n'+noise)),body);
}
assert.equal(cleanReviewText('<p>Original: <b>Guarded.</b></p><p>Change: Accepts help from a trusted person.</p>'),body.replace('\n','\n\n'));
assert.equal(cleanReviewText('Original: Trust < 5.\nChange: Trust > 5.'),'Original: Trust < 5.\nChange: Trust > 5.');
assert.equal(cleanReviewText('<other><b>discard</b></other>\n'+body),body);
assert.equal(cleanReviewText('<other><b>discard</other>\n'+body),body);
const redo=fixture();await redo.tool.saveAnswer('a','BASELINE_A');
const instructions='Audit {{char}}; partner {{user}}. CUSTOM_BASELINE';
redo.api.request=async prompt=>{redo.requests.push(prompt);return body+'<foreign>remove</foreign>';};
const accepted=await redo.tool.review('a',instructions),samePrompt=redo.requests.at(-1);
assert.equal(accepted.text,body);assert.equal(accepted.retry.previous,'BASELINE_A');
await redo.tool.saveAnswer('a','BAD_MANUAL_ANSWER');
redo.api.request=async prompt=>{redo.requests.push(prompt);return 'BETTER_ANSWER';};
const retried=await redo.tool.retry('a');assert.equal(redo.requests.at(-1),samePrompt);assert.equal(retried.text,'BETTER_ANSWER');
const reopened=createReplacementTool(redo.deps,{client:redo.api,expand:async bank=>structuredClone(bank)});
assert.equal((await reopened.loadAnswer('a')).retry.previous,'BASELINE_A');await reopened.retry('a');assert.equal(redo.requests.at(-1),samePrompt,'retry survives reopening and does not use its own last result');
for(const output of ['', '<other>foreign only</other>']){redo.api.request=async()=>output;await assert.rejects(reopened.retry('a'),{code:'REVIEW_EMPTY'});assert.equal((await reopened.loadAnswer('a')).text,'BETTER_ANSWER');}
redo.fail(true);redo.api.request=async()=>body;await assert.rejects(reopened.retry('a'));redo.fail(false);assert.equal((await reopened.loadAnswer('a')).text,'BETTER_ANSWER');
redo.api.request=async prompt=>{redo.requests.push(prompt);return body;};await reopened.review('a',instructions+' NEW');assert.ok(redo.requests.at(-1).includes('BETTER_ANSWER'));assert.ok(redo.requests.at(-1).startsWith(instructions.replace('{{subject}}','Actor')+' NEW'));
await reopened.clearAnswer('a');assert.deepEqual((({text,retry})=>({text,retry}))(await reopened.loadAnswer('a')),{text:'',retry:null});await assert.rejects(reopened.retry('a'),/다시 받을 요청/);await reopened.review('a');assert.doesNotMatch(redo.requests.at(-1),/\[PREVIOUS AUDIT\]/);
redo.saved.get('room').answers[0].text=body+'<foreign>legacy noise</foreign>';
assert.equal((await reopened.loadAnswer('a')).text,body);assert.ok(!(await reopened.prompt('a',body+'<foreign>export noise</foreign>')).includes('export noise'));
redo.deps.connectionRequestService.sendRequest=async()=>({content:'번역 본문<alien>번역 잡음</alien>'});assert.equal(await reopened.translate('a',body+'<alien>입력 잡음</alien>'),'번역 본문');
console.log('Review answer cleanup and frozen retry passed: nested/unknown/escaped tags, prior answers, export/translation, reopen, errors, deletion and same request reference.');
