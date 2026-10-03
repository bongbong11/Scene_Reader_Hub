import assert from 'node:assert/strict';
import { createJevClient } from '../src/adapters/jev-client.js';
import { JEV_PROVIDERS, JEV_BROWSER_KEY_STORAGE, browserJevKey, saveBrowserJevKey, detectJevProvider, resolveJevKeyProvider } from '../src/adapters/jev-providers.js';
const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
const request={model:'jev-latest',state:{text:'Synthetic scene'},questions:{q:{type:'choice',criteria:{yes:'Yes',no:'No'}}}};
assert.equal(detectJevProvider('sk-or-v1-synthetic'),'openrouter');assert.equal(detectJevProvider('vck_synthetic'),'vercel');
assert.equal(detectJevProvider('sk-unidentified'),'');assert.throws(()=>resolveJevKeyProvider('sk-unidentified'),/発給|발급처/);
assert.throws(()=>resolveJevKeyProvider('sk-or-v1-synthetic','vercel'),/다릅니다/);
let calls=[];
for(const provider of Object.keys(JEV_PROVIDERS)){
 if(provider!=='typesafe')saveBrowserJevKey(storage,provider,'synthetic-'+provider);
 const deps={settings:{jevProvider:provider},localStorage:storage,serverKeyStatus:'저장됨',getSavedKey:()=>'',JEV_API_URL:'/api/plugins/scene-reader-jev/systemone',getRequestHeaders:()=>({'X-CSRF-Token':'host-only-token'}),StaleRunError:class extends Error{},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({answers:{q:{choice:'yes'}}})};}};
 const client=createJevClient(deps);
 assert.equal((await client.callJev(request)).answers.q.choice,'yes');
 const {url,options}=calls.at(-1);
 assert.equal(url,JEV_PROVIDERS[provider].url||deps.JEV_API_URL);
 if(provider==='typesafe')assert.equal(options.headers['X-CSRF-Token'],'host-only-token');
 else {assert.equal(options.headers.Authorization,'Bearer synthetic-'+provider);assert.equal(options.headers['X-CSRF-Token'],undefined);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(JSON.parse(options.body).model,JEV_PROVIDERS[provider].model);}
 for(const status of [401,403,429,500]){
  deps.fetch=async()=>({ok:false,status,json:async()=>({error:'failure'})});
  await assert.rejects(()=>client.callJev(request),error=>error.httpStatus===status && error.code.startsWith('JEV_') && !error.message.includes('failure'));
 }
 deps.fetch=async()=>({ok:true,json:async()=>({answers:{}})});await assert.rejects(()=>client.callJev(request),/판정 결과/);
 deps.fetch=async()=>{throw new TypeError('network');};await assert.rejects(()=>client.callJev(request),/연결/);
 deps.fetch=async(_url,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));
 await assert.rejects(()=>client.callJev(request,5),/초과/);
 const controller=new AbortController(),running=client.callJev(request,1000,controller.signal);controller.abort();await assert.rejects(()=>running,deps.StaleRunError);
}
saveBrowserJevKey(storage,'openrouter','synthetic-openrouter');assert.equal(browserJevKey(storage,'vercel'),'');
let contacted=false;
const client=createJevClient({settings:{jevProvider:'vercel'},localStorage:storage,serverKeyStatus:'저장됨',getSavedKey:()=> 'direct-site-key',fetch:async()=>{contacted=true;},StaleRunError:Error});
await assert.rejects(()=>client.callJev(request),/먼저 저장/);assert.equal(contacted,false,'never forward a different provider key');
assert.equal(values.has(JEV_BROWSER_KEY_STORAGE),true);
saveBrowserJevKey(storage,'openrouter','');assert.equal(browserJevKey(storage,'openrouter'),'');
console.log('Jev providers passed: prefix recognition, unknown-key stop, explicit fallback, provider-scoped credential, unchanged relay, direct headers/models, no host-token leak, API failures, timeout and cancellation.');
