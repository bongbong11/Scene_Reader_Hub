import assert from 'node:assert/strict';
import {createVectorRetrieval} from '../src/retrieval/vectors.js';
import {searchCharacterRecords} from '../src/retrieval/character-search.js';
import {createRecordBank,currentRecords} from '../src/character/records.js';
import {buildLiveCharacterPlan,buildCharacterTurnQuestions} from '../src/character/live.js';
import {createRetrievalSchedule} from '../src/retrieval/scheduling.js';
import {bindCharacterPages} from '../src/storage/character-pages.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(source='vertexai',delay=35) {
    const settings={retrievalProvider:source},collections=new Map(),calls=[],events=[];
    let active=0,peak=0,fail=false,metadataReads=0;
    const fetch=async(url,{body,signal})=>{
        if(url==='/api/secrets/read'){metadataReads++;await sleep(2);return {ok:true,json:async()=>({api_key_vertexai:true,api_key_nanogpt:true,api_key_makersuite:true})};}
        const data=JSON.parse(body),route=url.split('/').at(-1),key=JSON.stringify([data.source,data.model,data.collectionId]);
        if(!collections.has(key))collections.set(key,new Map());
        const bank=collections.get(key),call={route,key,data};calls.push(call);
        const write=route==='insert'||route==='delete';
        if(write||data.source==='transformers')assert.equal(active,0,'writes and local inference are exclusive');
        active++;peak=Math.max(peak,active);assert.ok(active<=2,'at most two vector requests');
        try {
            if(route==='query')await sleep(delay);
            signal?.throwIfAborted();
            if(fail && route==='query')return {ok:false,status:429};
            if(route==='list')return {ok:true,json:async()=>[...bank.keys()]};
            if(route==='insert'){data.items.forEach(item=>bank.set(item.hash,item));return {ok:true};}
            if(route==='delete'){data.hashes.forEach(hash=>bank.delete(hash));return {ok:true};}
            if(route==='query')return {ok:true,json:async()=>({metadata:[...bank.values()].slice().reverse().slice(0,data.topK).map(item=>({index:item.index,hash:item.hash}))})};
            throw Error(route);
        } finally {active--;}
    };
    const retrieval=createVectorRetrieval({fetch,getRequestHeaders:()=>({}),getSettings:()=>settings,onDiagnostic:event=>events.push(event)});
    return {settings,collections,calls,events,retrieval,get metadataReads(){return metadataReads;},get peak(){return peak;},get active(){return active;},set fail(value){fail=value;}};
}
const entries=Array.from({length:4},(_,i)=>{
    const entry={id:`person-${i}`,kind:'npc',npcRole:'mixed',name:`Person ${i}`,source:'Established workshop staff.',selectedLore:[]};
    entry.recordBank=createRecordBank({entity_type:'npc',entity_name:entry.name,records:[0,1,2].map(n=>({type:'core',target:'self',when:['general'],rule:`Knows workshop duty ${n}.`,modality:'fact',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}))},entry,'test');
    return entry;
});
const options={entries,priorStates:new Map(),transcript:'Workshop staff discuss their duties.',identity:'room'};
for (const code of ['EMBEDDING_DIMENSION_MISMATCH','EMBEDDING_INDEX_MISSING','EMBEDDING_INVALID_VECTOR','CHARACTER_RECORD_READ_FAILED']) {
    let calls=0;
    const isolated=await searchCharacterRecords({...options,retrieval:{config:()=>({source:'transformers'}),search:async()=>++calls===1?{status:'fallback',code,indices:[]}:{status:'ready',indices:[0]}}});
    assert.equal(calls,entries.length,`${code} is a bank failure, not evidence that all other banks are unavailable`);
    assert.equal(isolated.get(entries[1].id).status,'ready');
}
async function seed(f) {
    for(const entry of entries)assert.equal((await f.retrieval.rebuild({kind:'character',bankId:`room:${entry.id}`,items:currentRecords(entry)})).status,'rebuilt');
    f.calls.length=0;
}

// Identical record choices/questions with bounded parallel reads; timing is
// recorded as synthetic evidence, not a promised real-provider speedup.
const sequential=fixture(),parallel=fixture();await seed(sequential);await seed(parallel);
const beforeSerial=performance.now();
const expected=await searchCharacterRecords({...options,retrieval:{search:sequential.retrieval.search}});
const serialMs=performance.now()-beforeSerial;
const beforeParallel=performance.now();
const actual=await searchCharacterRecords({...options,retrieval:parallel.retrieval});
const parallelMs=performance.now()-beforeParallel;
assert.deepEqual(actual,expected);assert.equal(sequential.peak,1);assert.equal(parallel.peak,2);
const makePlan=results=>buildLiveCharacterPlan(entries,{canonicalOnly:true,transcript:options.transcript,retrievalResults:results});
assert.deepEqual(buildCharacterTurnQuestions(makePlan(actual)),buildCharacterTurnQuestions(makePlan(expected)));
assert.equal(parallel.calls.filter(call=>call.route==='query').length,4);
assert.equal(parallel.calls.filter(call=>call.route==='insert').length,0);
const cached=await searchCharacterRecords({...options,retrieval:parallel.retrieval});
assert.ok([...cached.values()].every(item=>item.status==='cached'));
assert.equal(parallel.calls.filter(call=>call.route==='query').length,4);
assert.equal(parallel.events.filter(event=>event.phase==='query_cache').length,4);
await searchCharacterRecords({...options,transcript:'A different workshop question.',retrieval:parallel.retrieval});
assert.equal(parallel.calls.filter(call=>call.route==='query').length,8,'changed context must query again');
await parallel.retrieval.rebuild({kind:'character',bankId:'unrelated',items:currentRecords(entries[0])});
const beforeUnrelated=parallel.calls.filter(call=>call.route==='query').length;
await searchCharacterRecords({...options,retrieval:parallel.retrieval});
assert.equal(parallel.calls.filter(call=>call.route==='query').length,beforeUnrelated,'updating one bank must not discard other banks’ cached searches');
const beforeEmpty=parallel.calls.length;
assert.equal((await searchCharacterRecords({...options,entries:[],retrieval:parallel.retrieval})).size,0);
assert.equal(parallel.calls.length,beforeEmpty,'no entries means no retrieval requests');

// Parallel banks share credential metadata without sharing cancellation owners.
const metadata=fixture();
await Promise.all(entries.slice(0,2).map(entry=>metadata.retrieval.search({kind:'character',bankId:entry.id,items:currentRecords(entry),transcript:'workshop'})));
assert.equal(metadata.metadataReads,1);

// Same-bank concurrent callers never insert twice and get the same answer.
const same=fixture();
const request={kind:'character',bankId:'same',items:currentRecords(entries[0]),transcript:'workshop'};
const pair=await Promise.all([same.retrieval.search(request),same.retrieval.search(request)]);
assert.deepEqual(pair[0].indices,pair[1].indices);assert.equal(pair[1].status,'cached');
assert.equal(same.calls.filter(call=>call.route==='insert').length,1);
assert.equal(same.calls.filter(call=>call.route==='query').length,1);
pair[1].indices.length=0;
assert.equal((await same.retrieval.search(request)).indices.length,3,'callers cannot corrupt cached results');
const changed={...request,items:request.items.map((item,i)=>i?item:{...item,rule:'Changed responsibility.'})};
await same.retrieval.search(changed);await same.retrieval.search(request);
assert.equal([...same.collections.values()][0].size,3,'A-B-A keeps exactly the current records');
same.retrieval.clear();const beforeClear=same.calls.length;await same.retrieval.search(request);
assert.ok(same.calls.slice(beforeClear).some(call=>call.route==='query'));
same.settings.retrievalProvider='palm';await same.retrieval.search(request);
assert.equal(same.collections.size,2,'provider changes cannot reuse previous vectors');

// Local inference remains serial; failures do not launch the remaining batch.
const local=fixture('transformers');await seed(local);
await searchCharacterRecords({...options,retrieval:local.retrieval});assert.equal(local.peak,1);
const failure=fixture();await seed(failure);failure.fail=true;
const failed=await searchCharacterRecords({...options,retrieval:failure.retrieval});
assert.ok([...failed.values()].every(item=>item.status==='fallback'));
assert.equal(failure.calls.filter(call=>call.route==='query').length,2,'no retry storm after the first batch fails');
failure.fail=false;const recovered=await searchCharacterRecords({...options,retrieval:failure.retrieval});
assert.ok([...recovered.values()].every(item=>item.status==='ready'),'failed answers were not cached');

// Cancelled cycles settle their active batch and cannot launch further people.
const cancelled=fixture('vertexai',70);await seed(cancelled);
const controller=new AbortController();
const pending=searchCharacterRecords({...options,retrieval:cancelled.retrieval,signal:controller.signal});
await sleep(10);controller.abort();await assert.rejects(pending,{name:'AbortError'});
await sleep(80);assert.equal(cancelled.calls.filter(call=>call.route==='query').length,2);assert.equal(cancelled.active,0);
assert.ok((await searchCharacterRecords({...options,retrieval:cancelled.retrieval})).size===4);

// Abort a same-bank waiter without disturbing the owner or subsequent callers.
const waiter=fixture('vertexai',70),waitAbort=new AbortController();
const owner=waiter.retrieval.search(request);
const waiting=waiter.retrieval.search({...request,signal:waitAbort.signal});waitAbort.abort();
await assert.rejects(waiting,{name:'AbortError'});assert.equal((await owner).status,'ready');
assert.equal((await waiter.retrieval.search(request)).status,'cached');

// Read/write overlap across banks still serializes all mutation requests.
const mixed=fixture('vertexai',40);await seed(mixed);
await Promise.all([
    mixed.retrieval.search({kind:'character',bankId:'room:person-0',items:currentRecords(entries[0]),transcript:'different'}),
    mixed.retrieval.rebuild({kind:'character',bankId:'new-bank',items:currentRecords(entries[1])}),
]);
assert.equal(mixed.active,0);
// Clearing while a query is in flight must not repopulate the old cache.
const clearing=fixture('vertexai',50);await seed(clearing);
const clearRequest={kind:'character',bankId:'room:person-0',items:currentRecords(entries[0]),transcript:'workshop'};
const inFlight=clearing.retrieval.search(clearRequest);await sleep(10);clearing.retrieval.clear();await inFlight;
assert.equal((await clearing.retrieval.search(clearRequest)).status,'ready');

// A cancelled exclusive waiter cannot block later reads or run a late write.
const scheduler=createRetrievalSchedule(),exclusiveAbort=new AbortController();
let finishRead,lateWrite=false,secondRead=false;
const firstRead=scheduler.request(()=>new Promise(resolve=>{finishRead=resolve;}));
await new Promise(resolve=>setImmediate(resolve));
const exclusiveWait=scheduler.request(()=>{lateWrite=true;},{exclusive:true,signal:exclusiveAbort.signal});
const nextRead=scheduler.request(()=>{secondRead=true;});
exclusiveAbort.abort();await assert.rejects(exclusiveWait,{name:'AbortError'});await nextRead;
assert.equal(secondRead,true);assert.equal(lateWrite,false);finishRead();await firstRead;

// Paged banks retain serialized loading of their mutable record windows.
const pagedEntry=structuredClone(entries[0]);
pagedEntry.recordBank.pagedRecords={count:3,bankId:'paged',root:'root',indexRoot:'index'};
bindCharacterPages(async()=>({records:pagedEntry.recordBank.records,indices:[0,1,2]}));
let pageActive=0,pagePeak=0;
const pageSearch=async()=>{pagePeak=Math.max(pagePeak,++pageActive);await sleep(5);pageActive--;return {status:'ready',indices:[0],hashes:[]};};
await searchCharacterRecords({...options,entries:[pagedEntry,entries[1]],retrieval:{config:()=>({source:'vertexai'}),search:pageSearch,searchPaged:pageSearch}});
assert.equal(pagePeak,1);
console.log(`Retrieval scheduling passed: same records/questions, remote max two, local/write serialization, cache/invalidation, cancellation and failure recovery. Synthetic four-person search: ${Math.round(serialMs)}ms serial / ${Math.round(parallelMs)}ms bounded parallel.`);
