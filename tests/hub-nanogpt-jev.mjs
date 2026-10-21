import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createJevClient} from '../src/adapters/jev-client.js';
import {jevConnection} from '../src/adapters/jev-connection.js';
const require=createRequire(import.meta.url),{decide,register}=require('../server-plugin/nanogpt-jev.cjs');
const body={model:'typesafe/jev-1.14',state:{scene:'Synthetic scene'},questions:{q:{type:'choice',instructions:'Select.',criteria:{yes:'Yes',no:'No'}},n:{type:'noul',instructions:'True?'}}};
const answers={q:{type:'choice',choice:'yes',confidence:0.9,probabilities:{yes:0.9,no:0.1}},n:{type:'noul',noul:0.7}};
const calls=[];let usage={routing:{paidSpendPolicyAllowsBalance:false,recommendedMode:'subscription'}},failStatus=0;
const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/usage'))return {ok:true,json:async()=>usage};
    return {ok:!failStatus,status:failStatus||200,json:async()=>({choices:[{message:{content:JSON.stringify({answers})}}]})};
};
assert.deepEqual(await decide({key:'synthetic-nano',body,fetchImpl}),{model:body.model,answers});
assert.equal(calls.length,2);
const sent=JSON.parse(calls[1].options.body);
assert.deepEqual(Object.keys(sent).sort(),['messages','model','response_format','stream']);
assert.deepEqual(sent.response_format,{type:'questions',questions:body.questions});
assert.deepEqual(sent.messages,[{role:'user',content:JSON.stringify(body.state)}]);
assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic-nano');
assert.equal(calls[1].options.redirect,'error');
assert.match(calls[1].url,/^https:\/\/nano-gpt.com\/api\/subscription\/v1\/chat\/completions$/);
// Accept direct typed answers as well as the native-style wrapper, without
// accepting unrelated JSON or relaxing the Hub's per-answer validation.
for (const content of [answers, {answers}, {...answers,unrequested:{noul:1}}]) {
    const directFetch=async(url,options)=>url.endsWith('/usage')?fetchImpl(url,options):{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(content)}}]})};
    const result=await decide({key:'synthetic',body,fetchImpl:directFetch});
    assert.deepEqual(result.answers,answers);
}
for (const content of ['invalid', '{}', '[]', '{"answers":{}}', '{"q":0.5}', '{"other":{"noul":1}}']) {
    const invalidFetch=async(url,options)=>url.endsWith('/usage')?fetchImpl(url,options):{ok:true,json:async()=>({choices:[{message:{content}}]})};
    await assert.rejects(decide({key:'synthetic',body,fetchImpl:invalidFetch}),{code:'NANO_INVALID_RESPONSE',phase:'response',status:502});
}
for (const phase of ['subscription','decision']) {
    for (const kind of ['network','upstream','json']) {
        const brokenFetch=async(url,options)=>{
            if(phase==='decision' && url.endsWith('/usage'))return fetchImpl(url,options);
            if(kind==='network')throw Object.assign(new Error('secret must not escape'),{code:'SECRET'});
            return {ok:kind!=='upstream',status:502,json:async()=>{throw new Error('raw response');}};
        };
        await assert.rejects(decide({key:'synthetic',body,fetchImpl:brokenFetch}),error=>{
            assert.equal(error.code,{network:'NANO_CONNECTION_FAILED',upstream:'NANO_UPSTREAM_ERROR',json:'NANO_INVALID_RESPONSE'}[kind]);
            assert.equal(error.phase,phase);assert.equal(error.status,502);
            assert.doesNotMatch(error.message,/secret|raw response/);return true;
        });
    }
}
for(const policy of [true,undefined]){
    usage={routing:{paidSpendPolicyAllowsBalance:policy,recommendedMode:'subscription'}};calls.length=0;
    await assert.rejects(decide({key:'synthetic',body,fetchImpl}),{code:'NANO_SUBSCRIPTION_ONLY_REQUIRED'});assert.equal(calls.length,1);
}
for(const mode of ['paygo','unavailable',undefined]){
    usage={routing:{paidSpendPolicyAllowsBalance:false,recommendedMode:mode}};calls.length=0;
    await assert.rejects(decide({key:'synthetic',body,fetchImpl}),{code:'NANO_SUBSCRIPTION_UNAVAILABLE'});assert.equal(calls.length,1);
}
usage={routing:{paidSpendPolicyAllowsBalance:false,recommendedMode:'subscription'}};
for(const status of [400,401,403,404,429,500]){
    failStatus=status;calls.length=0;await assert.rejects(decide({key:'synthetic',body,fetchImpl}),{code:'NANO_UPSTREAM_ERROR',status});
    assert.equal(calls.length,2,'No fallback to paid/native endpoint or another model');
}
failStatus=0;calls.length=0;
await assert.rejects(decide({key:'synthetic',body:{...body,model:'unknown'},fetchImpl}),{code:'NANO_MODEL_INVALID'});assert.equal(calls.length,0);
await assert.rejects(decide({key:'',body,fetchImpl}),{code:'NANO_KEY_MISSING'});
const controller=new AbortController();controller.abort();
await assert.rejects(decide({key:'synthetic',body,fetchImpl,signal:controller.signal}),{name:'AbortError'});
const events=[],transport=[];
const settings={jevConnection:'nanogpt',jevNanoModel:'typesafe/jev-1.13'};
const deps={settings,getSavedKey:()=>{throw new Error('Must not read TypeSafe key for NanoGPT');},JEV_API_URL:'/api/plugins/scene-reader-jev/systemone',getRequestHeaders:()=>({'X-CSRF-Token':'host'}),noteDiagnostic:(_,event)=>events.push(event),StaleRunError:class extends Error{},fetch:async(url,options)=>{transport.push({url,options});return {ok:true,json:async()=>({answers})};}};
const client=createJevClient(deps);
assert.equal((await client.callJev(body)).answers.n.noul,0.7);
assert.equal(JSON.parse(transport[0].options.body).model,'typesafe/jev-1.13');
assert.equal(transport[0].options.headers['X-Jev-Key'],undefined);
assert.equal(transport[0].url,'/api/plugins/scene-reader-jev/nanogpt/systemone');
await client.callJev(body,1000,null,{provider:'nanogpt',key:'synthetic-nano-key'});
assert.equal(transport.at(-1).options.headers['X-NanoGPT-Key'],'synthetic-nano-key');
assert.ok(!JSON.stringify(events).includes('synthetic-nano-key'));
for(const code of ['NANO_INVALID_RESPONSE','NANO_CONNECTION_FAILED','NANO_UPSTREAM_ERROR','NANO_TIMEOUT']){
    const failing=createJevClient({...deps,fetch:async()=>({ok:false,status:502,json:async()=>({code,error:'Safe diagnostic',phase:'response'})})});
    await assert.rejects(failing.callJev(body),{code,httpStatus:502,phase:'response'});
    assert.equal(events.at(-1).errorKind,code);assert.equal(events.at(-1).phase,'response');
}
settings.jevOfficialModel='jev-1.14.0';
await client.callJev(body,1000,null,{key:'synthetic-official-key'});
assert.equal(transport.at(-1).url,deps.JEV_API_URL);
assert.equal(JSON.parse(transport.at(-1).options.body).model,'jev-1.14.0');
assert.equal(transport.at(-1).options.headers['X-NanoGPT-Key'],undefined);
for(const model of ['jev-latest','jev-1.14.0','jev-1.13.0'])assert.equal(jevConnection({jevOfficialModel:model}).model,model);
assert.throws(()=>jevConnection({jevOfficialModel:'unknown'}));
// New key storage must preserve the official key; deleting NanoGPT only removes NanoGPT.
let secret={jevKey:'official'};const routes={};
register({post:(url,fn)=>{routes[url]=fn;}},{pathsFor:()=>({root:'synthetic',secret:'secrets.json'}),load:async()=>secret,save:async(_root,_file,value)=>{secret=value;},storageHandler:fn=>fn});
const res={json:()=>{}};
await routes['/storage/nanogpt/key']({body:{key:'nano'}},res);assert.deepEqual(secret,{jevKey:'official',nanoJevKey:'nano'});
await routes['/storage/nanogpt/key']({body:{key:''}},res);assert.deepEqual(secret,{jevKey:'official'});
// Exercise the server route, not only the parser: a successful upstream result
// must reach the client; internal and upstream failures must remain distinct.
const originalFetch=globalThis.fetch;
try {
    for(const direct of [true,false]){
        globalThis.fetch=async url=>({ok:true,json:async()=>url.endsWith('/usage')?usage:{choices:[{message:{content:JSON.stringify(direct?answers:{answers})}}]}});
        let delivered,status=200;
        const response={on(){},off(){},status(value){status=value;return this;},json(value){delivered=value;}};
        await routes['/nanogpt/systemone']({body,get:()=> 'synthetic'},response);
        assert.equal(status,200);assert.deepEqual(delivered,{model:body.model,answers});
    }
    const brokenRoutes={};
    register({post:(url,fn)=>{brokenRoutes[url]=fn;}},{pathsFor:()=>{throw Object.assign(new Error('private path and key'),{code:'ENOENT'});},storageHandler:fn=>fn});
    let delivered,status;
    const response={on(){},off(){},status(value){status=value;return this;},json(value){delivered=value;}};
    await brokenRoutes['/nanogpt/systemone']({body,get:()=>''},response);
    assert.equal(status,502);assert.equal(delivered.code,'NANO_CONNECTION_FAILED');assert.doesNotMatch(JSON.stringify(delivered),/private|ENOENT/);
} finally {globalThis.fetch=originalFetch;}
console.log('NanoGPT Jev passed: typed requests, strict subscription policy, no paid fallback, model selection, separate credentials, cancellation and response normalization.');
