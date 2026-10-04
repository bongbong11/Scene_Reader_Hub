import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanionStorage} from '../src/storage/companions.js';
import {createWriteQueue} from '../src/lifecycle/jobs.js';

async function fixture() {
    let ctx = {chatId:'A',chatMetadata:{}}, key = 'A', saved = {scene:'initial'};
    const writes=[], diagnostics=[];
    const deps = {getContext:()=>ctx,stateChatKey:()=>key,storageVersion:3,chatRecords:new Map(),queueWrite:createWriteQueue(),noteDiagnostic:(_event,data)=>diagnostics.push(data),
        async post(route,body) {
            if (route==='bootstrap') return {ok:true,chat:structuredClone(saved)};
            if (route==='chat' || route==='transaction') { saved=structuredClone(body.value ?? body.chat); writes.push(saved); }
            return {ok:true};
        }};
    const store=createCompanionStorage(deps);
    await store.post('bootstrap',{chatKey:key}); store.chatLoaded(key);
    return {store,deps,ctx,writes,diagnostics,get saved(){return saved;},set saved(value){saved=value;},switchChat(){ctx={chatId:'B',chatMetadata:{}};key='B';return ctx;}};
}

test('migration reads back and stale scene snapshots cannot erase companion data',async()=>{
    const f=await fixture(), namespace='knowledgeVaultV1', legacy={version:1,cards:[{id:'one',text:'synthetic fact'}],actors:[{name:'NPC'}],auditReceipts:['receipt']};
    assert.deepEqual(await f.store.bridge.load(namespace,{metadata:f.ctx.chatMetadata,legacy}),legacy);
    const next={...legacy,cards:[{id:'two',text:'new fact'}]};
    await f.store.bridge.save(namespace,next,{metadata:f.ctx.chatMetadata});
    await f.store.post('bootstrap',{chatKey:'A'});
    assert.deepEqual(await f.store.bridge.load(namespace,{metadata:f.ctx.chatMetadata}),next,'verification reads do not suspend companion storage');
    await f.store.post('transaction',{chatKey:'A',chat:{scene:'new',companionStores:{[namespace]:legacy}},history:[]});
    assert.deepEqual(f.saved.companionStores[namespace],next);
    await f.store.post('chat',{chatKey:'A',value:null});
    assert.deepEqual(f.saved.companionStores[namespace],next,'scene reset retains companion data');
    assert.ok(!JSON.stringify(f.diagnostics).includes('synthetic fact'));
});

test('interleaved scene, companion and history writes preserve the latest scene and each namespace',async()=>{
    const f=await fixture(), queue=f.deps.queueWrite;
    await Promise.all([
        queue('session:A',()=>f.store.post('transaction',{chatKey:'A',chat:{scene:'latest'},history:[]})),
        f.store.bridge.save('first',{cards:[1]},{metadata:f.ctx.chatMetadata}),
        f.store.bridge.save('second',{actors:[2]},{metadata:f.ctx.chatMetadata}),
        queue('session:A',()=>f.store.post('transaction',{chatKey:'A',chat:{scene:'final'},history:[1]})),
    ]);
    assert.equal(f.saved.scene,'final');
    assert.deepEqual(f.saved.companionStores,{first:{cards:[1]},second:{actors:[2]}});
});

test('failed save or migration verification preserves the confirmed view and rejects stale chat writes',async()=>{
    const f=await fixture();
    await f.store.bridge.save('first',{cards:[1]},{metadata:f.ctx.chatMetadata});
    const original=f.deps.post;
    f.deps.post=async(route,body)=>{if(route==='chat')throw Error('unavailable');return original(route,body);};
    await assert.rejects(f.store.bridge.save('first',{cards:[2]},{metadata:f.ctx.chatMetadata}),/unavailable/);
    assert.deepEqual(await f.store.bridge.load('first',{metadata:f.ctx.chatMetadata}),{cards:[1]});
    f.deps.post=async(route,body)=>route==='bootstrap'?{ok:true,chat:{}}:original(route,body);
    await assert.rejects(f.store.bridge.load('new',{metadata:f.ctx.chatMetadata,legacy:{cards:[3]}}),{code:'STORAGE_VERIFY_FAILED'});
    const old=f.ctx.chatMetadata;f.switchChat();
    await assert.rejects(f.store.bridge.save('first',{cards:[4]},{metadata:old}),{code:'STORAGE_STALE_CHAT'});
});

test('backup restore replaces namespaces and pending old writes cannot undo the restore',async()=>{
    const f=await fixture();
    await f.store.bridge.save('first',{cards:[1]},{metadata:f.ctx.chatMetadata});
    let release;
    const blocker=f.deps.queueWrite('session:A',()=>new Promise(resolve=>{release=resolve;}));
    const queued=f.store.bridge.save('first',{cards:[9]},{metadata:f.ctx.chatMetadata});
    await new Promise(resolve=>setTimeout(resolve,0));
    await f.store.post('backup/restore',{});
    f.saved={scene:'restored',companionStores:{first:{cards:[2]}}};
    await f.store.post('bootstrap',{chatKey:'A'});f.store.chatLoaded('A');release();await blocker;
    await assert.rejects(queued,{code:'STORAGE_STALE_CHAT'});
    assert.deepEqual(await f.store.bridge.load('first',{metadata:f.ctx.chatMetadata}),{cards:[2]});
});

test('a delayed verification response cannot replace a newer confirmed companion save',async()=>{
    const f=await fixture();
    await f.store.bridge.save('first',{cards:[1]},{metadata:f.ctx.chatMetadata});
    const original=f.deps.post;let release;
    f.deps.post=async(route,body)=>route==='bootstrap'?new Promise(resolve=>{const old=structuredClone(f.saved);release=()=>resolve({ok:true,chat:old});}):original(route,body);
    const reading=f.store.post('bootstrap',{chatKey:'A'});
    await f.store.bridge.save('first',{cards:[2]},{metadata:f.ctx.chatMetadata});release();await reading;
    await f.store.post('transaction',{chatKey:'A',chat:{scene:'after-read'},history:[]});
    assert.deepEqual(f.saved.companionStores.first,{cards:[2]});
});
