import assert from 'node:assert/strict';
import {createInjectionPlacement,PLACEMENT_KEY} from '../src/storage/injection-placement.js';
let key='openai:A',settings={characterMacroEnabled:true,commonPreferences:{injectionMode:'depth',worldInjectionMode:'preset',worldPresetSlot:{identifier:'world',side:'after'}}},fail=false;
const original=structuredClone(settings);let calls=0;
const host={read:()=>({key,available:true,prompts:[]}),keys:()=>['openai:A','openai:B'],place:async()=>{}};
const runtime=createInjectionPlacement({host,getSettings:()=>settings,getPreferences:()=>settings.commonPreferences,saveSettings:async()=>{calls++;if(fail)throw Error('save failed');}});
fail=true;await assert.rejects(runtime.save('scene','depth'),/save failed/);assert.deepEqual(settings,original);fail=false;
await runtime.save('world','depth');await runtime.character(false);
key='openai:B';assert.equal(runtime.read().characterMacroEnabled,true);assert.equal(runtime.read().world,'legacy','other preset keeps its original location');
await assert.rejects(runtime.cleanup(),/남아/);
await runtime.save('world','depth');await runtime.character(true);
key='openai:A';assert.equal(runtime.read().characterMacroEnabled,false);
await runtime.cleanup();assert.equal(settings[PLACEMENT_KEY].retired,true);assert.equal(settings.characterMacroEnabled,undefined);assert.deepEqual(settings.commonPreferences,{});
await runtime.cleanup();assert.equal(runtime.read().scene,'depth');assert.equal(runtime.read().characterMacroEnabled,false);
key='openai:B';assert.equal(runtime.read().characterMacroEnabled,true);
assert.ok(calls>0);
console.log('Placement settings passed: per-preset independence, legacy preservation, failed saves, guarded exact-key cleanup, idempotence and retained character choice.');

// A native preset save may succeed before the Hub routing save fails.
key='openai:A';settings={};let writes=0,nativeWrites=0;
const recovery=createInjectionPlacement({host:{...host,place:async()=>{nativeWrites++;}},getSettings:()=>settings,getPreferences:()=>({}),saveSettings:async()=>{if(++writes===2)throw Error('routing save lost');}});
await assert.rejects(recovery.place('scene',0,'stamp'),/routing save lost/);
assert.equal(nativeWrites,1);assert.equal(recovery.read().scene,'depth');assert.equal(recovery.read().pendingKind,'scene');
await recovery.place('scene',0,'stamp');assert.equal(recovery.read().scene,'entry');assert.equal(recovery.read().pendingKind,undefined);

const {cleanGlobalSettings}=await import('../src/storage/obsolete-settings.js');
const {migrateCommonPreferences}=await import('../src/storage/common-preferences.js');
const oldCommon={injectionMode:'preset',other:'keep'},old={injectionPlacementsV1:{version:1,retired:true,profiles:{}},commonPreferences:oldCommon,characterMacroEnabled:true};
cleanGlobalSettings(old);assert.deepEqual(old.commonPreferences,{other:'keep'});assert.equal(oldCommon.injectionMode,'preset','snapshot cleanup does not mutate a shared source');assert.equal(migrateCommonPreferences(old,{injectionMode:'preset'}),null);
const {createHydration}=await import('../src/storage/hydrate.js');
const retained={version:1,retired:true,profiles:{'openai:A':{scene:'entry',world:'depth',characterMacroEnabled:true}}};
const restored={settings:{global:{enabled:false,commonPreferences:{injectionMode:'preset'},characterMacroEnabled:true}},history:[],characters:{characters:[],npcs:[]},storageVersion:3,migrated:true};
const savedSettings=[];
const deps={settings:{injectionPlacementsV1:retained},DEFAULTS:{enabled:true,characterMacroEnabled:false},hydrateSequence:0,stateChatKey:()=> 'restore-room',getContext:()=>({chatId:'restore-room',chat:[]}),jobs:{invalidate(){}},stateHistoryCache:new Map(),chatRecords:new Map(),chat_metadata:{},MODULE:'sceneReader',localStorage:{removeItem(){}},getSavedKey:()=>'',saveCustomWorlds(){},clearInjection:async()=>{},normalizeCharacterStore:value=>value,extension_settings:{},STATE_HISTORY_LIMIT:12,saveStateHistory:async()=>{},saveServerChat:async()=>{},messageSnapshots:new Map(),messageSnapshot:()=> 'snapshot',loadReasonerProfiles:async()=>{},storagePost:async(route,body)=>{if(route==='bootstrap')return structuredClone(restored);if(route==='settings')savedSettings.push(body.settings);return {ok:true};}};
await createHydration(deps).hydrateServerState({migrate:false});
assert.deepEqual(deps.settings.injectionPlacementsV1,retained);assert.equal(deps.settings.enabled,false,'other restored settings still apply');assert.equal(deps.settings.characterMacroEnabled,undefined);assert.equal(deps.settings.commonPreferences.injectionMode,undefined);assert.deepEqual(savedSettings.at(-1).global.injectionPlacementsV1,retained);
console.log('Old-backup restoration preserves current placement and removes retired routing fields while restoring unrelated settings.');

key='openai:A';settings={characterMacroEnabled:true};
const modes=createInjectionPlacement({host,getSettings:()=>settings,getPreferences:()=>({}),saveSettings:async()=>{}});
assert.equal(modes.read().character,'weave');
await modes.place('character',0,'stamp');assert.equal(modes.read().character,'entry');assert.equal(modes.read().characterMacroEnabled,false);
await modes.character('depth');assert.equal(modes.read().character,'depth');
key='openai:B';assert.equal(modes.read().character,'weave','other preset retains legacy macro choice');
await modes.character('weave');settings[PLACEMENT_KEY].profiles[key].pendingKind='character';
await modes.character('depth');assert.equal(modes.read().pendingKind,undefined,'choosing depth abandons incomplete character placement');
await assert.rejects(modes.place('unknown',0,'stamp'),/주입 종류/);
console.log('Three character modes passed: old boolean migration, per-preset choice, native separation and abandoned placement cleanup.');
