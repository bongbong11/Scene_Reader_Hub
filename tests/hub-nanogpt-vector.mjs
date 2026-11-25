import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createVectorRetrieval,RETRIEVAL_PROVIDERS} from '../src/retrieval/vectors.js';
const require=createRequire(import.meta.url);
const {registerRetrieval}=require('../server-plugin/retrieval/routes.cjs');
const {validate}=require('../server-plugin/retrieval/native-vectors.cjs');
const entries=new Map(),urls=[],calls=[];
let liveEmbeds=0;
const index={
    async listItems(){return [...entries.values()];},
    async listItemsByMetadata(query){return [...entries.values()].filter(item=>query.hash.$in.includes(item.metadata.hash));},
    async beginUpdate(){},
    async endUpdate(){},
    async upsertItem(item){const hash=item.metadata.hash;entries.set(hash,{...item,id:String(hash)});},
    async deleteItem(id){entries.delete(Number(id));},
    async queryItems(vector,topK){assert.deepEqual(vector,[1,0,0]);return [...entries.values()].slice(0,topK).map(item=>({score:0.9,item}));},
};
const host={sources:['nanogpt'],async prepare(req,options){
    assert.equal(req.body.model,'qwen/qwen3-embedding-8b');
    assert.equal(options?.createIndex,true);
    return {index,embedBatch:async texts=>{liveEmbeds++;assert.ok(texts.length<=10);return texts.map(()=>[1,0,0]);}};
}};
const handlers=new Map();
registerRetrieval({post:(route,handler)=>handlers.set(route,handler)},{host});
const user={directories:{root:'synthetic-user',vectors:'synthetic-vectors'}};
async function invoke(action,body,auth=user){
    const handler=handlers.get('/retrieval/vector/:action');
    let status=200,payload=null;
    const response={status(v){status=v;return this;},sendStatus(v){status=v;return this;},json(v){payload=v;return this;}};
    await handler({params:{action},body,user:auth},response);
    return {ok:status===200,status,json:async()=>payload};
}
const settings={retrievalProvider:'nanogpt',retrievalModel:'qwen/qwen3-embedding-8b'};
assert.equal(RETRIEVAL_PROVIDERS.nanogpt.model,settings.retrievalModel);
const fetch=async(url,{body})=>{
    urls.push(url);
    if(url==='/api/secrets/read')return {ok:true,json:async()=>({api_key_nanogpt:true})};
    if(url.startsWith('/api/plugins/scene-reader-jev/retrieval/vector/'))return invoke(url.split('/').at(-1),JSON.parse(body));
    if(url.startsWith('/api/vector/'))throw Error('Do not use the old ST NanoGPT transport when the plugin is installed');
    if(url.endsWith('/retrieval/capabilities'))return {ok:true,json:async()=>({version:1,sharedSceneVector:false,sources:[]})};
    throw Error('Unexpected URL: '+url);
};
const engine=createVectorRetrieval({fetch,getRequestHeaders:()=>({'Content-Type':'application/json'}),getSettings:()=>settings});
assert.match(await engine.test(),/연결 성공/);
const items=[{type:'core',target:'self',rule:'A synthetic rule.',source_ids:['S001']},{type:'core',target:'self',rule:'Another synthetic rule.',source_ids:['S001']}];
const first=await engine.search({kind:'character',bankId:'synthetic-bank',items,transcript:'synthetic scene',sharedTranscript:''});
assert.equal(first.status,'ready');
assert.equal(first.indices.length,2);
assert.ok(urls.filter(url=>url.endsWith('/insert')).length>=2);
assert.ok(urls.some(url=>url.endsWith('/query')));
assert.ok(liveEmbeds>=3);
assert.equal((await invoke('insert',{source:'nanogpt',model:'qwen/qwen3-embedding-8b',collectionId:'other-extension',items:[{hash:1,index:0,text:'x'}]})).status,400);
assert.equal((await invoke('list',{source:'nanogpt',model:'qwen/qwen3-embedding-8b',collectionId:'scene-reader-character-1'},null)).status,401);
assert.throws(()=>validate({source:'nanogpt',collectionId:'scene-reader-world-1',model:'qwen/qwen3-embedding-8b',items:[{hash:1,index:0,text:'x'.repeat(16001)}]},'insert'),{code:'RETRIEVAL_INVALID_INPUT'});
assert.ok(!urls.some(url=>url.includes('api.nano-gpt.com')),'credentials and upstream URLs never leak into browser');
console.log('NanoGPT plugin transport passed: default 8B, connection test, record indexing, querying, isolation and validation.');
