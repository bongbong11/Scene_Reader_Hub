import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createVectorRetrieval} from '../src/retrieval/vectors.js';
import {createCurrentStatusModel} from '../src/ui/current-status-model.js';
import {createConsoleReporter} from '../src/debug/console-reporter.js';
import {safeDetail} from '../src/debug/events.js';
const {registerRetrieval}=createRequire(import.meta.url)('../server-plugin/retrieval/routes.cjs');
const realTimer=globalThis.setTimeout,timers=[];
// Scale production deadlines, retaining their relative ordering. No live service.
globalThis.setTimeout=(fn,ms,...args)=>{timers.push(ms);return realTimer(fn,ms>=1000?ms/1000:ms,...args);};
try {
 const routes=new Map(),events=[],bank=new Map();let delay=0,hang=false,auth=false;
 registerRetrieval({post:(url,handler)=>routes.set(url,handler)},{host:{sources:['nanogpt','palm'],prepare:async req=>({scope:[req.body.source,req.body.model],embed:async()=>{await new Promise(r=>realTimer(r,delay));return [1];},query:async()=>({metadata:bank.get(req.body.collectionId)||[]})})}});
 const fetch=async(url,{body,signal})=>{
  const b=JSON.parse(body);
  if(url.endsWith('/capabilities'))return {ok:true,json:async()=>({version:1,sharedSceneVector:true,sources:['nanogpt','palm']})};
  if(url.endsWith('/api/secrets/read'))return {ok:true,json:async()=>({api_key_nanogpt:true,api_key_makersuite:true})};
  if(url.includes('/retrieval/query')){
   let status=200,data;
   await routes.get('/retrieval/query')({body:b,user:{directories:{root:'synthetic',vectors:'synthetic'}}},{status(n){status=n;return this;},json(value){data=value;}});
   return {ok:status===200,status,json:async()=>data};
  }
  const route=url.split('/').at(-1);
  if(route==='list')return {ok:true,json:async()=> (bank.get(b.collectionId)||[]).map(x=>x.hash)};
  if(route==='insert'){
   if(auth)return {ok:false,status:401};
   if(hang)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
   bank.set(b.collectionId,b.items);return {ok:true};
  }
  if(route==='delete')return {ok:true};
  if(route==='query'&&hang)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  if(route==='query')return {ok:true,json:async()=>({metadata:bank.get(b.collectionId)||[]})};
  throw Error('Unexpected synthetic request');
 };
 const settings={retrievalProvider:'nanogpt',retrievalModel:'qwen/qwen3-embedding-8b'};
 const make=(extra={})=>createVectorRetrieval({fetch,getRequestHeaders:()=>({}),getSettings:()=>settings,onDiagnostic:e=>events.push(e),...extra});
 const args={kind:'character',bankId:'slow',items:[{id:'a',type:'core',rule:'A character record.'}],transcript:'cue',sharedTranscript:'scene'};
 const retrieval=make();
 assert.equal((await retrieval.search(args)).status,'ready');
 delay=25;
 assert.equal((await retrieval.search({...args,sharedTranscript:'slow scene'})).status,'ready','response beyond former 14/15 seconds succeeds');
 assert.ok(timers.includes(60000)&&timers.includes(65000)&&timers.includes(90000));
 delay=75;
 const failure=await retrieval.search({...args,sharedTranscript:'timeout scene'});
 assert.equal(failure.code,'RETRIEVAL_TIMEOUT');assert.match(failure.error,/나노GPT.*검색.*60초/);
 const event=events.findLast(e=>e.status==='failed');
 assert.equal(event.timeoutMs,60000);assert.equal(event.httpStatus,504);
 const model=createCurrentStatusModel();model.accept({code:'RUN_STARTED'});model.accept({stage:'retrieval_request',...event});
 assert.match(model.snapshot().rows.find(x=>x.id==='search').message,/나노GPT.*검색.*60초/);
 const lines=[];createConsoleReporter({console:{error:(...args)=>lines.push(args)}}).accept({stage:'retrieval_request',...event});
 assert.match(lines[0][1].결과,/나노GPT.*검색.*60초/);
 assert.equal(safeDetail(event).timeoutMs,60000);
 await new Promise(r=>realTimer(r,25));delay=0;
 assert.equal((await retrieval.search({...args,sharedTranscript:'after timeout'})).status,'ready');
 hang=true;
 const nativeTimeout=await retrieval.search({...args,bankId:'native-timeout'});
 assert.equal(nativeTimeout.code,'RETRIEVAL_TIMEOUT');assert.match(nativeTimeout.error,/생성·등록.*60초/);
 const cancelled=new AbortController();const pending=retrieval.search({...args,bankId:'cancelled',signal:cancelled.signal});
 realTimer(()=>cancelled.abort(new Error('User cancelled')),5);
 await assert.rejects(pending,/User cancelled/);hang=false;
 auth=true;
 const denied=await retrieval.search({...args,bankId:'auth'});assert.equal(denied.code,'RETRIEVAL_AUTH_FAILED');assert.match(denied.error,/나노GPT.*생성·등록.*인증 실패/);auth=false;
 hang=true;
 const total=await make({timeoutMs:8}).search({...args,sharedTranscript:''});
 assert.equal(total.code,'RETRIEVAL_TOTAL_TIMEOUT');assert.match(total.error,/전체.*시간.*초과/);hang=false;
 settings.retrievalProvider='palm';delay=22;
 const google=await make().search({...args,bankId:'google',sharedTranscript:'google scene'});
 assert.equal(google.code,'RETRIEVAL_TIMEOUT','Google keeps its original 14-second plugin budget');
 assert.ok(timers.includes(14000)&&timers.includes(15000)&&timers.includes(45000));
 await new Promise(r=>realTimer(r,25));
 const authRoutes=new Map();let sharedStatus;
 registerRetrieval({post:(url,handler)=>authRoutes.set(url,handler)},{host:{sources:['nanogpt'],prepare:async()=>{throw Object.assign(new Error('PRIVATE_UPSTREAM_BODY'),{httpStatus:401});}}});
 await authRoutes.get('/retrieval/query')({body:{source:'nanogpt',collectionId:'scene-reader-world-1',searchText:'cue',topK:1,threshold:.01},user:{directories:{root:'synthetic',vectors:'synthetic'}}},{status(n){sharedStatus=n;return this;},json(value){assert.doesNotMatch(JSON.stringify(value),/PRIVATE/);}});
 assert.equal(sharedStatus,401,'shared route preserves known authentication status without upstream body');
 console.log('Embedding deadlines passed: slow success, shared timeout, retry, cancel, auth, overall timeout, UI/console/log evidence and unchanged Google budgets.');
} finally {globalThis.setTimeout=realTimer;}
