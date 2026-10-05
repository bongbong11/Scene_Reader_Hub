import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createSharedRouter} from '../src/storage/shared-router.js';
import {createSharedService} from '../src/migration/shared-service.js';
import {createWriteQueue} from '../src/lifecycle/jobs.js';
import {createCompanionStorage} from '../src/storage/companions.js';
import {digest,clone,SHARED_LINK,documentKey,chatRef} from '../src/storage/shared-document.js';
import {storylineReference,storylineInjection} from '../src/context/storyline-reference.js';
import {bankIdentity} from '../src/retrieval/bank-identity.js';

const require=createRequire(import.meta.url),plugin=require('../server-plugin/index.cjs');
const directory=await mkdtemp(join(tmpdir(),'hub-shared-'));
const routes={};await plugin.init({get:(name,fn)=>{routes['GET '+name]=fn;},post:(name,fn)=>{routes['POST '+name]=fn;}});
const user={directories:{root:directory,vectors:join(directory,'vectors')}};
let failRoute='',failOnce=false,blocked=false,failMessage='synthetic failure',failAfterOnce=false;
const calls=[],events=[];
async function rawPost(route,body={}) {
    calls.push({route,body:clone(body)});
    if(failOnce && route===failRoute){failOnce=false;throw Object.assign(Error(failMessage),{code:'SYNTHETIC_STORAGE_FAILURE'});}
    const response={statusCode:200,status(code){this.statusCode=code;return this;},json(value){this.value=value;return this;}};
    await routes['POST /storage/'+route]({user,body},response);
    if(failAfterOnce && route===failRoute){failAfterOnce=false;throw Object.assign(Error('accepted write, lost response'),{code:'SYNTHETIC_LOST_RESPONSE'});}
    if(response.statusCode!==200)throw Object.assign(Error(response.value?.error || 'storage failed'),{code:'STORAGE_HTTP_ERROR'});
    return response.value;
}
let ctx={chatId:'A',chat:[{is_user:true,mes:'A synthetic opening.'}],chatMetadata:{},characters:[{avatar:'Fixture.png'}],characterId:0};
let currentCharacters={enabled:true,characters:[{id:'actor',name:'Fixture',source:'Synthetic character source',recordBank:{sourceHash:'kept',records:[{id:'R1',rule:'Keep a promise.'}]}}],npcs:[],persona:null};
const records=new Map(),queue=createWriteQueue();
const key=()=>`character-avatar:Fixture.png|chat:${ctx.chatId}`;
const deps={post:rawPost,getContext:()=>ctx,stateChatKey:key,queueWrite:queue,chatRecords:records,stableFingerprint:digest,noteDiagnostic:(phase,data)=>events.push({phase,...data}),
    get record(){return ()=>records.get(key());},get characterStore(){return currentCharacters;},get chatReadyKey(){return key();},
    selectedWorld:()=>({id:'custom',name:'Synthetic world',prompt:'A fixed world rule.'}),clearInjection:async()=>{},invalidateReasonerJobs:()=>{},isStorageActionBlocked:()=>blocked};
const router=createSharedRouter(deps),service=createSharedService(deps,router);
async function load(room) {
    ctx={...ctx,chatId:room,chatMetadata:{},chat:[{is_user:true,mes:'Continue the current conversation.'}]};
    const data=await router.post('bootstrap',{chatKey:key()});records.set(key(),data.chat || {});currentCharacters=clone(data.characters);return data;
}
try {
    const original={preferences:{settingsContract:4,selectedWorldId:'custom',developmentStyle:'steady'},relationshipState:{motion:'closer'},eventProfile:{title:'An unfinished delivery'},characterState:{knowledge:[{character:'actor',factId:'F1',scope:'private'}]},continuity:{items:[{id:'F1',text:'The package has not arrived.'}],knowledge:[],followups:[],revision:1},companionStores:{knowledgeVaultV1:{cards:[{id:'secret',text:'Synthetic hidden information',knownBy:['user','npc:test'],acquisitions:[{method:'told',sceneDate:'2025-01-02'}]}]}}};
    await rawPost('transaction',{chatKey:key(),chat:original,history:[{assistantIndex:0,marker:'old-room-history'}]});
    await rawPost('characters',{chatKey:key(),value:currentCharacters});
    await load('A');blocked=true;
    await assert.rejects(service.migrate(),{code:'SHARED_GENERATION_BUSY'});blocked=false;
    failRoute='backup/create';failOnce=true;
    await assert.rejects(service.migrate(),{code:'SYNTHETIC_STORAGE_FAILURE'});
    assert.deepEqual((await rawPost('bootstrap',{chatKey:key()})).chat,original);
    assert.equal(service.isBusy(),false);
    await service.migrate({summary:'Continue waiting for the package.'});
    const migrated=await load('A'),storyId=migrated.chat.sharedSource.storylineId,baselineId=migrated.chat.sharedSource.baselineId;
    assert.equal(migrated.chat.characterState.knowledge[0].factId,'F1');
    assert.equal(migrated.characters.characters[0].id,'actor');
    assert.ok(storylineReference(migrated.chat));assert.match(storylineInjection(migrated.chat),/package/);
    const storedA=await rawPost('bootstrap',{chatKey:key()});
    assert.ok(storedA.chat[SHARED_LINK]);assert.equal(storedA.chat.eventProfile,undefined);
    assert.deepEqual((await router.required('original',storedA.chat.originalRef)).chat,original);
    const assetCount=calls.filter(item=>item.route==='chat' && item.body.chatKey.startsWith(documentKey('asset',''))).length;
    await load('B');await service.connect({storylineId:storyId,mode:'continue'});
    const continued=await load('B');
    assert.equal(continued.chat.sharedSource.storylineId,storyId);assert.equal(continued.chat.sharedSource.baselineId,baselineId);
    assert.equal(continued.chat.pendingPlan,null);assert.equal(continued.chat.characterStateEvents.length,0);
    assert.equal(continued.history.length,0);assert.equal(continued.chat.eventProfile.title,original.eventProfile.title);
    assert.equal(continued.chat.companionStores.knowledgeVaultV1.cards[0].acquisitions[0].sceneDate,'2025-01-02');
    assert.equal(calls.filter(item=>item.route==='chat' && item.body.chatKey.startsWith(documentKey('asset',''))).length,assetCount,'continue reuses source assets');
    records.get(key()).relationshipState.motion='distant';
    await router.post('transaction',{chatKey:key(),chat:records.get(key()),history:[]});
    const freshB=await load('B');assert.equal(freshB.chat.relationshipState.motion,'distant');
    await load('A');assert.equal(records.get(key()).sharedSource.active,false);assert.equal(records.get(key()).relationshipState.motion,'closer');
    records.get(key()).relationshipState.motion='edited-old-room';
    await router.post('transaction',{chatKey:key(),chat:records.get(key()),history:[]});
    await load('B');assert.equal(records.get(key()).relationshipState.motion,'distant','old room edit does not rewind shared head');
    const companion=createCompanionStorage({...deps,post:router.post,storageVersion:3,ready:()=>Promise.resolve()});
    await companion.post('bootstrap',{chatKey:key()});companion.chatLoaded(key());
    const cards=await companion.bridge.load('knowledgeVaultV1',{metadata:ctx.chatMetadata});
    cards.cards[0].knownBy.push('character');
    await companion.bridge.save('knowledgeVaultV1',cards,{metadata:ctx.chatMetadata});
    assert.equal((await load('B')).chat.companionStores.knowledgeVaultV1.cards[0].knownBy.includes('character'),true);
    const items=[{id:'R1',rule:'A source record'}];
    assert.equal(bankIdentity('character','A:actor',items,true),bankIdentity('character','B:actor',items,true));
    assert.notEqual(bankIdentity('character','A:actor',items,true),bankIdentity('character','A:actor',[{id:'R1',rule:'Changed'}],true));
    const pending=clone(records.get(key()));pending.pendingPlan={stateSnapshot:{relationshipState:{motion:'distant'},characterState:pending.characterState,continuity:pending.continuity},outputText:'An unconfirmed proposed event.',outputIndex:99};pending.eventProfile={title:'Unconfirmed event'};
    await router.post('chat',{chatKey:key(),value:pending});
    const confirmed=(await router.required('storyline',storyId,{fresh:true}));assert.notEqual(confirmed.checkpoints[confirmed.headCheckpointId].state.eventProfile?.title,'Unconfirmed event');
    records.get(key()).pendingPlan=null;
    await load('C');await service.connect({storylineId:storyId,mode:'new'});
    const clean=await load('C');assert.notEqual(clean.chat.sharedSource.storylineId,storyId);assert.equal(clean.chat.sharedSource.baselineId,baselineId);
    assert.equal(clean.chat.eventProfile,undefined);assert.equal(clean.chat.characterState,undefined);assert.deepEqual(clean.chat.companionStores || {},{});
    await companion.post('bootstrap',{chatKey:key()});companion.chatLoaded(key());
    assert.equal(await companion.bridge.load('knowledgeVaultV1',{metadata:ctx.chatMetadata,legacy:{cards:[{id:'old-secret'}]}}),null,'fresh story never reimports old host knowledge');
    const unchangedVersion=clean.chat.sharedSource.baselineRevision;
    await router.post('characters',{chatKey:key(),value:currentCharacters});
    assert.equal((await load('C')).chat.sharedSource.baselineRevision,unchangedVersion,'unchanged character save reuses baseline');
    currentCharacters.characters[0].source='Revision in independent story C';
    await router.post('characters',{chatKey:key(),value:currentCharacters});
    assert.equal((await load('C')).chat.sharedSource.baselineRevision,2);
    await load('B');currentCharacters.characters[0].source='Different revision in original story B';
    await router.post('characters',{chatKey:key(),value:currentCharacters});
    assert.equal((await load('B')).chat.sharedSource.baselineRevision,3,'other story cannot overwrite immutable version 2');
    await load('C');assert.equal(currentCharacters.characters[0].source,'Revision in independent story C');
    await load('A');assert.equal(currentCharacters.characters[0].source,'Synthetic character source','old room retains pinned baseline');
    await load('B');await service.updateBaseline({restoreRevision:1});
    assert.equal((await load('B')).chat.sharedSource.baselineRevision,4);assert.equal(currentCharacters.characters[0].source,'Synthetic character source');
    await load('D');failRoute='transaction';failOnce=true;
    await assert.rejects(service.connect({storylineId:storyId,mode:'continue'}),{code:'SYNTHETIC_STORAGE_FAILURE'});
    assert.equal((await rawPost('bootstrap',{chatKey:key()})).chat,null,'failed activation leaves target original');
    const interrupted=await router.required('storyline',storyId,{fresh:true});assert.equal(interrupted.pendingHandoff,undefined);
    await load('B');assert.equal(records.get(key()).sharedSource.active,true,'failed target activation keeps source writable');
    await load('D');failRoute='transaction';failAfterOnce=true;
    await assert.rejects(service.connect({storylineId:storyId,mode:'continue'}),{code:'SYNTHETIC_LOST_RESPONSE'});
    await load('D');assert.equal(records.get(key()).sharedSource.active,true,'accepted target with lost response recovers handoff');
    assert.equal((await router.required('storyline',storyId,{fresh:true})).pendingHandoff,undefined);
    await load('C');
    for(let turn=0;turn<35;turn++){records.get(key()).relationshipState={motion:'step-'+turn};await router.post('chat',{chatKey:key(),value:records.get(key())});}
    const bounded=await router.required('storyline',records.get(key()).sharedSource.storylineId,{fresh:true});assert.ok(Object.keys(bounded.checkpoints).length<=13);
    assert.equal(bounded.checkpoints[bounded.headCheckpointId].state.relationshipState.motion,'step-34','every confirmed turn updates the shared head without requiring a reload');
    assert.equal(router.views.get(key()).link.active,true);
    const safetyKey=chatRef(key());failRoute='backup/create';failMessage='Scene Reader storage record is too large.';failOnce=true;
    await service.restore();failMessage='synthetic failure';const legacy=await rawPost('bootstrap',{chatKey:key()});assert.equal(legacy.chat[SHARED_LINK],undefined);assert.equal(legacy.chat.relationshipState.motion,'step-34');assert.equal(legacy.characters.characters[0].id,'actor');
    assert.ok((await router.required('rollback_safety',safetyKey)).chat[SHARED_LINK],'oversized full backup still has verified per-room recovery');
    await load('B');await service.restore({originalOnly:true});assert.equal((await rawPost('bootstrap',{chatKey:key()})).chat,null,'new room original can be an empty legacy session');
    await load('A');const beforeRollback=await rawPost('bootstrap',{chatKey:key()});
    const corruptId=beforeRollback.chat[SHARED_LINK].baselineId+':'+beforeRollback.chat[SHARED_LINK].baselineRevision;
    await rawPost('chat',{chatKey:documentKey('baseline',corruptId),value:{broken:true}});router.clear();
    assert.ok((await router.post('bootstrap',{chatKey:key()})).chat.sharedSource,'legacy reserved-file writes cannot shadow the verified v2 document');
    await service.restore({originalOnly:true});assert.deepEqual((await rawPost('bootstrap',{chatKey:key()})).chat,original,'original rollback does not depend on readable shared references');
    await load('E');await service.connect({storylineId:storyId,mode:'continue'});await load('E');
    await service.restore({allRooms:true});
    for(const room of ['D','E']){await load(room);assert.equal((await rawPost('bootstrap',{chatKey:key()})).chat[SHARED_LINK],undefined,'all-room preparation removes shared markers');}
    assert.ok(events.every(event=>!JSON.stringify(event).includes('Synthetic hidden information')));
    console.log('Shared storage compatibility passed: backup-before-migration, failure preservation, exact original recovery, shared continuation, fresh story, portable knowledge, isolated runtime/history, old-room edits, companion writes, index reuse, unconfirmed exclusion, bounded checkpoints and corrupt-reference rollback.');
}finally{await rm(directory,{recursive:true,force:true});}
