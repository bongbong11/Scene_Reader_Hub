import assert from 'node:assert/strict';
import {createVectorRetrieval} from '../src/retrieval/vectors.js';
import {bankIdentity} from '../src/retrieval/bank-identity.js';
import {recordHashes,requirePreparedIndex} from '../src/retrieval/record-hashes.js';
import {hash53,recordText} from '../src/retrieval/identity.js';
import {searchCharacterRecords} from '../src/retrieval/character-search.js';
import {createRecordBank} from '../src/character/records.js';
import {bindCharacterPages,completeBankMatches} from '../src/storage/character-pages.js';

const items=Array.from({length:44},(_,i)=>({type:'core',target:'self',when:['general'],rule:`Workshop duty ${i}.`,modality:'habit',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}));
const sorted=items.map(item=>Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))));
assert.equal(bankIdentity('character','room',items,true),bankIdentity('character','room',sorted,true));
assert.notEqual(hash53(JSON.stringify(['character',0,items[0],recordText('character',items[0])])),hash53(JSON.stringify(['character',0,sorted[0],recordText('character',sorted[0])])),'reproduce the old order-dependent record hash');
function fixture(){
 const banks=new Map(),calls=[],events=[];let failBatch=0,batches=0,discard=false,empty=false;
 const make=()=>createVectorRetrieval({getSettings:()=>({retrievalProvider:'transformers'}),getRequestHeaders:()=>({}),onDiagnostic:e=>events.push(e),fetch:async(url,{body,signal})=>{
  signal?.throwIfAborted();const data=JSON.parse(body),route=url.split('/').at(-1);calls.push({route,data});
  const key=data.collectionId;if(!banks.has(key))banks.set(key,new Map());const bank=banks.get(key);
  if(route==='list')return {ok:true,json:async()=>[...bank.keys()]};
  if(route==='insert'){if(++batches===failBatch)return {ok:false,status:503};if(!discard)for(const item of data.items)bank.set(item.hash,item);return {ok:true};}
  if(route==='delete'){for(const hash of data.hashes)bank.delete(hash);return {ok:true};}
  if(route==='query')return {ok:true,json:async()=>({metadata:empty?[]:[...bank.values()].slice(0,data.topK)})};
  throw new Error(route);
 }});
 return {make,banks,calls,events,set failBatch(n){failBatch=n;},set discard(value){discard=value;},set empty(value){empty=value;}};
}
const f=fixture(),retrieval=f.make(),args={kind:'character',bankId:bankIdentity('character','room',items,true),items,transcript:'Workshop duties.'};
assert.equal((await retrieval.search(args)).status,'ready');
assert.equal(f.calls.filter(call=>call.route==='insert').length,3);
const firstQuery=f.calls.findIndex(call=>call.route==='query');
assert.equal(f.calls[firstQuery-1].route,'list','query waits for persisted-index verification');
assert.deepEqual([...([...f.banks.values()][0].keys())],items.map((item,index)=>recordHashes('character',item,index)[0]),'existing hash identifiers remain unchanged');
f.calls.length=0;
assert.equal((await f.make().search({...args,items:sorted,transcript:'A later scene.'})).status,'ready');
assert.equal(f.calls.filter(call=>call.route==='insert').length,0,'reloaded schema/sorted layouts reuse installed vectors');
assert.equal(f.calls.filter(call=>call.route==='delete').length,0);
const reversed=fixture();await reversed.make().search({...args,items:sorted});reversed.calls.length=0;
await reversed.make().search(args);assert.equal(reversed.calls.filter(call=>call.route==='insert').length,0,'reverse layout also reuses vectors');
// A genuinely missing record is prepared, without touching the other 43.
[...f.banks.values()][0].delete(recordHashes('character',items[7],7)[0]);f.calls.length=0;
await retrieval.search({...args,transcript:'Next scene.'});
assert.equal(f.calls.filter(call=>call.route==='insert').flatMap(call=>call.data.items).length,1);
// Failed batches stop search; retry only adds the records not already stored.
const broken=fixture();broken.failBatch=2;const engine=broken.make();
const failed=await engine.search(args);assert.equal(failed.preparationFailed,true);assert.throws(()=>requirePreparedIndex(failed));
assert.equal(broken.calls.filter(call=>call.route==='query').length,0);assert.equal([...broken.banks.values()][0].size,20);
broken.failBatch=0;broken.calls.length=0;assert.equal((await engine.search(args)).status,'ready');
assert.equal(broken.calls.filter(call=>call.route==='insert').flatMap(call=>call.data.items).length,24);
// HTTP success without persistence cannot advance to search or Jev.
const lost=fixture();lost.discard=true;
const unverified=await lost.make().search(args);assert.equal(unverified.code,'EMBEDDING_VERIFY_FAILED');assert.equal(unverified.preparationFailed,true);
assert.equal(lost.calls.filter(call=>call.route==='query').length,0);
const actor={id:'person',name:'Aster',kind:'character',source:'Workshop staff.',selectedLore:[]};actor.recordBank=createRecordBank({entity_type:'character',entity_name:'Aster',records:items},actor,'test');
await assert.rejects(searchCharacterRecords({entries:[actor],priorStates:new Map(),identity:'room',transcript:'workshop',retrieval:{search:async()=>unverified}}),{code:'EMBEDDING_VERIFY_FAILED'});
// Paged banks prepare only when list confirms missing entries. An empty match
// against a healthy bank is not a missing-index signal and never embeds again.
const paged=fixture(),pagedEngine=paged.make();let pageReads=0;
const request={kind:'character',bankId:'paged',count:items.length,transcript:'workshop',pages:async function*(){pageReads++;yield {records:items,indices:items.map((_,i)=>i)};}};
assert.equal((await pagedEngine.searchPaged(request)).status,'ready');assert.equal(pageReads,1);
paged.empty=true;paged.calls.length=0;
const noMatch=await pagedEngine.searchPaged(request);assert.equal(noMatch.status,'ready');assert.equal(noMatch.hashes.length,0);
assert.equal(pageReads,1);assert.equal(paged.calls.filter(call=>call.route==='insert').length,0);
let offsetReads=0;
bindCharacterPages(async(_route,request)=>{offsetReads++;assert.equal(request.offset,7);return {records:[items[7]],indices:[7]};});
const legacyPage=await completeBankMatches({pagedRecords:{count:44}},{records:[items[0]],indices:[0]},[7]);
assert.deepEqual(legacyPage.indices,[0,7]);assert.equal(legacyPage.records[1].rule,items[7].rule);assert.equal(offsetReads,1);
await completeBankMatches({pagedRecords:{count:44}},legacyPage,[7]);assert.equal(offsetReads,1,'healthy paged matches need no extra read');
// Same-bank overlap prepares each record once. Cancellation starts no work.
const overlap=fixture(),same=overlap.make();await Promise.all([same.search(args),same.search(args)]);
assert.equal(overlap.calls.filter(call=>call.route==='insert').flatMap(call=>call.data.items).length,44);
const abort=new AbortController();abort.abort();const calls=overlap.calls.length;
await assert.rejects(same.search({...args,signal:abort.signal}),{name:'AbortError'});assert.equal(overlap.calls.length,calls);
console.log('Embedding preparation passed: unchanged/reordered reuse, confirmed missing-only writes, wait/verify before query, partial retry, failed preparation stops routing, paged empty matches and concurrent deduplication.');
