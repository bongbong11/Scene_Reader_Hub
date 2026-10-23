import assert from 'node:assert/strict';
import {buildInjection} from '../src/injection/assemble.js';
import {CHAT_DEFAULTS} from '../src/storage/contract.js';
import {createRequestOwnership} from '../src/injection/request-ownership.js';
import {finalRequestFixture,requestText,occurrences} from './fixtures/final-request.mjs';

function value(label) {
    const characterDelivery={};
    return {payload:buildInjection({settings:{...CHAT_DEFAULTS},decisions:{},characterBlock:`CHARACTER_${label}`,continuityBlock:`CONTEXT_${label}`,delivery:characterDelivery}),characterDelivery};
}
const old=value('OLD'),current=value('CURRENT');
function staleGone(f) {
    const text=requestText(f.sent.at(-1).body);
    assert.ok(!text.includes('CHARACTER_OLD')&&!text.includes('CONTEXT_OLD'));
    assert.ok(text.includes('SYNTHETIC_PRESET')&&text.includes('Synthetic current turn.'));
    assert.equal(occurrences(text,'SYNTHETIC_WORLD'),0);
    assert.equal(occurrences(text,'SYNTHETIC_CAPTURE'),0);
    assert.ok(f.events.some(e=>e[1]==='INJECTION_INVALIDATED'&&e[2].removedCount>0));
}
for(const macro of [false,true])for(const preset of [false,true])for(const worldPreset of [false,true])for(const asRequest of [false,true])for(const kind of ['reset','new-cycle','finish-before-send']) {
    const f=await finalRequestFixture();const body=f.prepare(old,{macro,preset,worldPreset});
    if(kind==='finish-before-send')f.runtime.finish();else f.runtime.reset();
    f.setKey('other-room');f.setCycle({injection:null});
    let next;
    if(kind==='new-cycle')next=f.prepare(current,{macro,preset,worldPreset});
    await f.send(body,{asRequest});staleGone(f);
    if(next){
        await f.send(next,{asRequest});const text=requestText(f.sent.at(-1).body);
        assert.equal(occurrences(text,'CHARACTER_CURRENT'),1);assert.equal(occurrences(text,'CONTEXT_CURRENT'),1);
        assert.ok(!text.includes('CHARACTER_OLD'));
    }
}
// A Request body can be read across a reset or a newer prepared generation.
for(const newCycle of [false,true]) {
    const f=await finalRequestFixture(),body=f.prepare(old,{preset:true,worldPreset:true});
    const raw=JSON.stringify(body);let release;
    const read=new Promise(resolve=>release=resolve);
    const input=new Request('https://synthetic.invalid/api/backends/chat-completions/generate',{method:'POST',body:raw});
    input.clone=()=>({text:()=>read});
    const sending=f.send(body,{input});
    f.runtime.reset();f.setCycle({injection:null});
    if(newCycle)f.prepare(current,{preset:true,worldPreset:true});
    release(raw);await sending;staleGone(f);
}
{
    const f=await finalRequestFixture(),body=f.prepare(old);
    await f.send(body);const original=structuredClone(f.sent.at(-1).body);
    f.runtime.finish();
    await f.send(body);assert.deepEqual(f.sent.at(-1).body,original,'completed receipts are released; normal completion is not cancellation');
}
{
    const f=await finalRequestFixture(),body=f.prepare(old);
    f.runtime.reset();
    async function generateQuietPrompt(){return f.send(body);}
    await generateQuietPrompt();
    assert.equal(occurrences(requestText(f.sent.at(-1).body),'CHARACTER_OLD'),1,'auxiliary callers are not rewritten by retired main ownership');
    await f.send({...body,type:'quiet'});
    assert.equal(occurrences(requestText(f.sent.at(-1).body),'CHARACTER_OLD'),1);
}
{
    const registry=createRequestOwnership(2),owner={};
    registry.remember('one',owner,[]);registry.reset();registry.remember('two',{},[]);registry.reset();registry.remember('three',{},[]);
    assert.equal(registry.get('one'),undefined);assert.equal(registry.get('two').cancelled,true);assert.equal(registry.get('three').cancelled,false);
}
console.log('Request ownership: 48 cancellation combinations, current-cycle preservation, asynchronous Request reads, normal completion, auxiliary isolation and bounded retention passed.');
