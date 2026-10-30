import assert from 'node:assert/strict';
import {createStorageHttp} from '../src/storage/http.js';
import {createCurrentStatusModel} from '../src/ui/current-status-model.js';
import {createHydration} from '../src/storage/hydrate.js';
import {createOocLifecycle} from '../src/lifecycle/ooc.js';
import {watchPresetPlacement} from '../src/adapters/preset-placement-events.js';
import {createTransmissionPreview} from '../src/injection/transmission-preview.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// A reachable rejection is a failed operation; cancellation is not a disconnection.
{
 const view=createCurrentStatusModel(),events=[];let status=409,calls=0;
 const deps={serverStoreAvailable:true,STORAGE_API_URL:'/synthetic',getRequestHeaders:()=>({}),pluginError:()=> 'synthetic rejection',
 fetch:async()=>{calls++;return {ok:status===200,status,json:async()=>({ok:status===200})};},
 noteDiagnostic:(stage,event)=>{events.push(event);view.accept({stage,...event});}};
 const {storagePost}=createStorageHttp(deps),a={operationId:'a'},b={operationId:'b'};
 await assert.rejects(storagePost('commit',a));assert.equal(deps.serverStoreAvailable,true);assert.equal(view.snapshot().tone,'error');
 status=200;await storagePost('commit',b);assert.equal(view.snapshot().tone,'error','another operation cannot repair a failed commit');
 await storagePost('commit',a);assert.notEqual(view.snapshot().tone,'error','the exact retry repairs its own failed operation');
 status=409;await assert.rejects(storagePost('commit',a));
 view.accept({code:'RUN_STARTED',cycleId:'retry'});status=200;
 await storagePost('commit',a);assert.notEqual(view.snapshot().tone,'error','verified retry also resolves the previous-cycle storage error');
 const signal=AbortSignal.abort();const before=calls;
 await assert.rejects(storagePost('read',{}, {signal}));assert.equal(calls,before);assert.equal(deps.serverStoreAvailable,true);
 assert.equal(events.at(-1).status,'cancelled');assert.equal(events.at(-1).errorKind,'STORAGE_CANCELLED');
 assert.ok(!JSON.stringify(events).includes('operationId'));
 deps.fetch=async()=>{throw new TypeError('network unavailable');};
 await assert.rejects(storagePost('read'));assert.equal(deps.serverStoreAvailable,false);
 await assert.rejects(storagePost('read',{}, {signal}));assert.equal(deps.serverStoreAvailable,false,'cancellation cannot manufacture a healthy connection');
}

// Exact commit readback repairs only that transaction, including across cycles.
{
 const view=createCurrentStatusModel();
 for(const storageScope of ['a','b'])view.accept({stage:'storage_request',phase:'v2/operations/commit',storageScope,status:'failed'});
 view.accept({stage:'storage_resolution',phase:'v2/operations/commit',storageScope:'a',status:'succeeded'});
 assert.equal(view.snapshot().tone,'error','a different failed commit remains visible');
 view.accept({code:'RUN_STARTED',cycleId:'next'});
 view.accept({stage:'storage_resolution',phase:'v2/operations/commit',storageScope:'b',status:'succeeded'});
 assert.notEqual(view.snapshot().tone,'error');
 view.accept({stage:'storage_request',phase:'read',storageScope:'failed-read',status:'failed'});
 for(let i=0;i<300;i++)view.accept({stage:'storage_request',phase:'part',storageScope:`part-${i}`,status:'succeeded'});
 assert.equal(view.snapshot().tone,'error','many successful upload parts cannot evict an unresolved failure');
}

// Storage migrations finish independently of optional profile UI/module loading.
{
 let ready=false,finish;const data={ok:true,storageVersion:3,migrated:true,settings:{global:{enabled:true}},history:[],characters:{}};
 const deps={settings:{},DEFAULTS:{},hydrateSequence:0,stateChatKey:()=>'synthetic-room',getContext:()=>({chatId:'synthetic-room',chat:[]}),
 companionStorage:{chatLoading(){},chatLoaded(){ready=true;}},storagePost:async()=>data,localStorage:{removeItem(){}},getSavedKey:()=>'',
 chatRecords:new Map(),stateHistoryCache:new Map(),chat_metadata:{},extension_settings:{},MODULE:'test',saveCustomWorlds(){},
 normalizeCharacterStore:value=>value,messageSnapshots:new Map(),messageSnapshot:()=>[],loadReasonerProfiles:()=>new Promise(resolve=>{finish=resolve;})};
 assert.equal(await createHydration(deps).hydrateServerState(),true);assert.equal(ready,true);finish();await tick();
 const events=[];deps.loadReasonerProfiles=async()=>{throw Error('profile UI only');};deps.noteDiagnostic=(stage,event)=>events.push({stage,...event});
 assert.equal(await createHydration(deps).hydrateServerState(),true);await tick();assert.equal(events.at(-1).errorKind,'PROFILE_LIST_FAILED');
}

// Coalesce busy preset changes and discard deferred work when the chat changes.
{
 const handlers=new Map(),timers=[];let signature='one',busy=true,scope='room',clears=0,applied=0;
 watchPresetPlacement({host:{read:()=>({}),stamp:()=>signature},eventSource:{on:(type,fn)=>handlers.set(type,fn)},types:{SETTINGS_UPDATED:'settings'},
 busy:()=>busy,getScope:()=>scope,schedule:fn=>{timers.push(fn);return timers.length;},refresh(){},clearPreview:()=>clears++,reapply:async()=>applied++,report:()=>assert.fail('refresh failed')});
 signature='two';handlers.get('settings')();signature='three';handlers.get('settings')();
 assert.equal(timers.length,1);busy=false;timers.shift()();await tick();assert.equal(applied,1);assert.equal(clears,2);
 busy=true;signature='four';handlers.get('settings')();scope='other-room';busy=false;timers.shift()();await tick();assert.equal(applied,1);
}

// Ownership is rechecked inside the serialized injection writer, not just at dispatch.
{
 let listener,signature='one',validate;const errors=[];
 watchPresetPlacement({host:{read:()=>({}),stamp:()=>signature},eventSource:{on:(_,fn)=>listener=fn},types:{SETTINGS_UPDATED:'settings'},
 busy:()=>false,getScope:()=> 'room',refresh(){},clearPreview(){},report:(...args)=>errors.push(args),
 reapply:async check=>{validate=check;}});
 signature='two';listener();await tick();signature='three';
 assert.throws(validate,{name:'StaleRunError'});assert.equal(errors.length,0);
}

// A repeated skip still ends the current loading state and gives a safe reason.
{
 const activity=[],events=[],deps={handledOocMarkers:[],stateChatKey:()=>'room',clearInjection:async()=>{},updateStatus(){},
 updateActivity:(text,options)=>activity.push(options),noteDiagnostic:(stage,event)=>events.push(event)};
 const ooc=createOocLifecycle(deps);await ooc.handleOocOnlySkip({inputKey:'one'});activity.push({done:false});
 await ooc.handleOocOnlySkip({inputKey:'one'});assert.equal(activity.at(-1).done,true);assert.equal(events.at(-1).reasonCode,'OOC_ALREADY_HANDLED');
}

// A missing emotion block cannot be hidden by successful scene/person receipts.
{
 const view=createCurrentStatusModel();view.accept({code:'PROMPT_OBSERVED',phase:'request',scene:'confirmed',character:'confirmed',state:'unconfirmed'});
 assert.equal(view.snapshot().tone,'error');view.accept({code:'PROMPT_OBSERVED',phase:'request',scene:'confirmed',character:'confirmed',state:'confirmed'});
 assert.equal(view.snapshot().rows.find(row=>row.id==='delivery').state,'success');
 const preview=createTransmissionPreview({isCurrent:()=>true,enabled:()=>true,render:text=>text});
 assert.equal(preview.read(),null);assert.equal(preview.emptyReason(),'');preview.clear('preset_changed');assert.equal(preview.emptyReason(),'preset_changed');
 assert.equal(preview.read(),null,'reset reasons never masquerade as actual transport receipts');
}
console.log('Storage/status links: cancellation, exact recovery, readiness, busy preset changes, repeated OOC and emotion receipts passed.');
