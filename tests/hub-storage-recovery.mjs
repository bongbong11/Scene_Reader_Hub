import assert from 'node:assert/strict';
import {createSettingsRepository} from '../src/storage/settings.js';
import {createInjectionVerification} from '../src/injection/verification.js';
import {encodeTree,decodeTree} from '../src/storage/tree-codec.js';
import {changeAnalysisProfile} from '../src/ui/profile-settings.js';

let unavailable=true,calls=0;
const repository=createSettingsRepository({serverStoreAvailable:false,settings:{enabled:true},loadCustomWorlds:()=>[],ownerUnlocked:()=>false,ownerPrompt:()=>'',queueWrite:(_key,task)=>task(),storagePost:async()=>{calls++;if(unavailable)throw Object.assign(new Error('Synthetic outage'),{code:'STORAGE_NETWORK_ERROR'});}});
await assert.rejects(repository.saveServerSettings(),{code:'STORAGE_NETWORK_ERROR'});
unavailable=false;await repository.saveServerSettings();assert.equal(calls,2,'a previous outage must allow an explicit write to recover');

const expected={inputKey:'synthetic',payload:'x'.repeat(260*1024),details:{first:1,second:[2,3]}};
const parts=new Map();
const ref=await encodeTree(expected,async(key,text)=>{parts.set(key,JSON.parse(text));return key;});
let saved=await decodeTree(ref,async key=>parts.get(key));
const verifier=createInjectionVerification({record:()=>({lastJudgment:expected}),activeInjectionPayload:expected.payload,storageVersion:3,storagePost:async()=>({chat:{lastJudgment:saved}})});
const run={assert(){},identity:'synthetic'},receipt={payloadChars:expected.payload.length};
await verifier.verifyAppliedJudgment(run,expected,receipt);
saved={...saved,details:{first:1,second:[3,2]}};
await assert.rejects(verifier.verifyAppliedJudgment(run,expected,receipt),/서버/,'a real saved value change must still block verification');

const settings={reasonerProfileId:'old'},events=[];let persisted=false,cleaned=false;
const deps={settings,stateChatKey:()=> 'synthetic',invalidateReasonerJobs(){},saveGlobal:async(key,value)=>{settings[key]=value;},record:()=>({}),persistChat:async()=>{persisted=true;throw Object.assign(new Error('Synthetic outage'),{code:'STORAGE_NETWORK_ERROR'});},clearInjection:async()=>{cleaned=true;},renderReasonerProfiles(){},noteDiagnostic:(_code,event)=>events.push(event)};
await assert.rejects(changeAnalysisProfile(deps,'new'),error=>error.code==='PROFILE_CLEANUP_FAILED'&&error.settingsSaved===true);
assert.equal(settings.reasonerProfileId,'new');assert.equal(persisted,true);assert.equal(cleaned,false);
assert.deepEqual(events.map(({phase,status})=>[phase,status]),[['settings','succeeded'],['cleanup','failed']]);
deps.saveGlobal=async()=>{throw Object.assign(new Error('Synthetic settings outage'),{code:'STORAGE_HTTP_ERROR'});};
await assert.rejects(changeAnalysisProfile(deps,'other'),{code:'STORAGE_HTTP_ERROR'});
assert.equal(settings.reasonerProfileId,'new','an unsuccessful selection cannot replace the saved profile');
console.log('Storage recovery passed: retry after outage, large structural readback, changed-value rejection, profile save versus cleanup failures.');
