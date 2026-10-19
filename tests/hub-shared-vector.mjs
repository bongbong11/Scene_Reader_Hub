import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createVectorRetrieval} from '../src/retrieval/vectors.js';
const require=createRequire(import.meta.url);
const {createSceneCache}=require('../server-plugin/retrieval/scene-cache.cjs');
const {registerRetrieval}=require('../server-plugin/retrieval/routes.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let generated=0,clock=0;
const cache=createSceneCache({maxEntries:3,perUser:2,ttlMs:100,now:()=>clock});
const embed=async()=>{generated++;await sleep(8);return [1,0,0];};
const first=await Promise.all([cache.get('user-a',['palm','model','key-1'],'scene',embed),cache.get('user-a',['palm','model','key-1'],'scene',embed)]);
assert.equal(generated,1);assert.deepEqual(first.map(item=>item.cache),['miss','joined']);
assert.equal((await cache.get('user-a',['palm','model','key-1'],'scene',embed)).cache,'hit');
await cache.get('user-b',['palm','model','key-1'],'scene',embed);assert.equal(generated,2,'users never share');
await cache.get('user-a',['palm','model','key-2'],'scene',embed);assert.equal(generated,3,'changed key invalidates');
await cache.get('user-a',['palm','model-2','key-2'],'scene',embed);assert.equal(generated,4,'model scope invalidates');
await cache.get('user-a',['palm','model','key-1'],'scene',embed);assert.equal(generated,5,'bounded LRU');
clock=101;await cache.get('user-a',['palm','model','key-1'],'scene',embed);assert.equal(generated,6,'expiry');
for(let i=0;i<2;i++)await assert.rejects(cache.get('bad',['palm'],'bad',async()=>[NaN]),{code:'EMBEDDING_INVALID_VECTOR'});
let settle;const blocked=createSceneCache();
const inFlight=blocked.get('u',['transformers'],'s',()=>new Promise(resolve=>settle=resolve));
await sleep(0);await assert.rejects(blocked.get('u2',['transformers'],'another',embed),{code:'EMBEDDING_BUSY'});settle([1]);await inFlight;

const routes=new Map(),bank=new Map(),events=[];let hostEmbeds=0,queries=0,fail=false,supported=true;
registerRetrieval({post:(name,fn)=>routes.set(name,fn)},{host:{sources:['palm','transformers'],prepare:async req=>({scope:[req.body.source,'test-model'],embed:async()=>{hostEmbeds++;await sleep(5);return [1,0];},query:async(_vector,topK)=>{queries++;if(fail)throw Error('private upstream error');return {metadata:[...(bank.get(req.body.collectionId)||[])].slice(0,topK)};}})}});
const user={directories:{root:'isolated-user',vectors:'isolated-index'}};
async function invoke(route,body,caller=user){let code=200,data;await routes.get(route)({body,user:caller},{status(value){code=value;return this;},json(value){data=value;return this;}});return {ok:code===200,status:code,json:async()=>data};}
const fetch=async(url,{body})=>{
    const data=JSON.parse(body);
    if(url.endsWith('/capabilities')&&!supported)return {ok:false,status:404};
    if(url.includes('/retrieval/'))return invoke(url.slice(url.indexOf('/retrieval/')),data);
    if(url==='/api/secrets/read')return {ok:true,json:async()=>({api_key_makersuite:true})};
    const route=url.split('/').at(-1);
    if(route==='list')return {ok:true,json:async()=>[...(bank.get(data.collectionId)||[])].map(item=>item.hash)};
    if(route==='insert'){bank.set(data.collectionId,[...(bank.get(data.collectionId)||[]),...data.items]);return {ok:true};}
    if(route==='delete'){bank.set(data.collectionId,(bank.get(data.collectionId)||[]).filter(item=>!data.hashes.includes(item.hash)));return {ok:true};}
    if(route==='query')return {ok:true,json:async()=>({metadata:(bank.get(data.collectionId)||[]).slice(0,data.topK)})};
    throw Error('unexpected route');
};
const settings={retrievalProvider:'palm'};
const make=()=>createVectorRetrieval({fetch,getRequestHeaders:()=>({}),getSettings:()=>settings,onDiagnostic:event=>events.push(event)});
const retrieval=make(),items=Array.from({length:3},(_,id)=>({id,type:'core',rule:`role ${id}`}));
const search=(kind,bankId,scene='common scene')=>({kind,bankId,items,transcript:`${scene} person-specific cue`,sharedTranscript:scene,limit:2});
const world=await retrieval.search(search('world','w'));
const people=await Promise.all(['a','b','c'].map(id=>retrieval.search(search('character',id))));
assert.equal(world.sharedVector,true);assert.ok(people.every(item=>item.indices.length===2));
assert.equal(hostEmbeds,1,'world then selected people use one embedding');assert.equal(queries,4,'topK is per bank');
await retrieval.search(search('character','a'));assert.equal(hostEmbeds,1,'same scene reuse');
await retrieval.search({...search('character','a'),items:items.slice(0,1)});assert.equal(hostEmbeds,1,'file replacement reuses vector, not old hits');
await retrieval.search(search('character','a','edited or hidden context'));assert.equal(hostEmbeds,2,'changed source text regenerates');
fail=true;assert.equal((await retrieval.search(search('character','b','failure'))).status,'fallback');fail=false;
assert.doesNotMatch(JSON.stringify(events),/private upstream error|common scene|person-specific cue/);
assert.ok(events.some(event=>event.phase==='scene_vector'&&event.cache==='hit'));
supported=false;assert.equal((await make().search(search('character','old-plugin'))).status,'ready','old plugin uses native search');
supported=true;
const paged=await make().searchPaged({kind:'character',bankId:'b',count:3,transcript:'individual cue',sharedTranscript:'common scene'});
assert.equal(paged.sharedVector,true);assert.equal(paged.hashes.length,3);
const invalid=await invoke('/retrieval/query',{source:'palm',collectionId:'other-extension',searchText:'x',topK:1,threshold:.01});assert.equal(invalid.status,400);
assert.equal((await invoke('/retrieval/capabilities',{},null)).status,401);

// A timed-out waiter must neither free an unfinished inference slot nor run a
// late index query after reporting failure.
const slowRoutes=new Map();let release,lateQueries=0;
registerRetrieval({post:(name,fn)=>slowRoutes.set(name,fn)},{timeoutMs:4,host:{sources:['palm'],prepare:async()=>({scope:['palm'],embed:()=>new Promise(resolve=>release=resolve),query:async()=>{lateQueries++;return {metadata:[]};}})}});
let status;await slowRoutes.get('/retrieval/query')({user,body:{source:'palm',collectionId:'scene-reader-world-1',searchText:'x',topK:1,threshold:.01}},{status(value){status=value;return this;},json(){}});
assert.equal(status,504);release([1]);await sleep(10);assert.equal(lateQueries,0);
console.log('Shared vector checks passed: single generation, per-bank quotas, user/model/key isolation, bounded reuse, failure and timeout, old-plugin fallback.');
