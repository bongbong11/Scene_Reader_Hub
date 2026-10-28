import assert from 'node:assert/strict';
import {createPresetEntryHost} from '../src/adapters/preset-entry-host.js';
import {PRESET_ENTRIES,entryText} from '../src/injection/preset-entry-contract.js';

const settings={preset_settings_openai:'A',model:'keep-model',prompts:[{identifier:'main',name:'Main',content:'Keep original',role:'system'},{identifier:'history',marker:true}],prompt_order:[{character_id:100001,order:[{identifier:'main',enabled:false},{identifier:'history',enabled:true}]}]};
const disk={A:structuredClone(settings)},presets=[structuredClone(settings)],names={A:0};
let fail=false,release=null;
const manager={serviceSettings:settings,activeCharacter:{id:100001},getPromptOrderForCharacter:()=>settings.prompt_order[0].order,saveServiceSettings:async()=>{},render:async()=>{}};
const service={getPresetList:()=>({presets,preset_names:names}),savePreset:async(name,value)=>{if(fail)throw Error('save failed');if(release)await new Promise(r=>release=r);disk[name]=structuredClone(value);}};
const adapter=createPresetEntryHost({getContext:()=>({mainApi:'openai',promptManager:manager}),loadHost:async()=>({promptManager:manager,getChatCompletionPreset:structuredClone}),loadManager:async()=>({getPresetManager:()=>service})});
await adapter.init();const original=JSON.stringify(settings);
fail=true;await assert.rejects(adapter.place('scene',1,adapter.stamp()),/save failed/);assert.equal(JSON.stringify(settings),original);fail=false;
await adapter.place('scene',1,adapter.stamp());
assert.deepEqual(settings.prompt_order[0].order.map(p=>p.identifier),['main',PRESET_ENTRIES.scene.identifier,'history']);
assert.equal(settings.model,'keep-model');assert.equal(settings.prompts[0].content,'Keep original');assert.equal(settings.prompt_order[0].order[0].enabled,false);
assert.match(disk.A.prompts.at(-1).content,/\{\{\/\/ .*\}\}\n\{\{scene-reader-hub\}\}/u);
assert.equal(settings.prompts.at(-1).injection_position,0);
settings.prompt_order[0].order[1].enabled=false;
await adapter.place('scene',0,adapter.stamp());assert.equal(settings.prompt_order[0].order[0].enabled,false,'moving does not enable a disabled entry');
assert.equal(settings.prompts.filter(p=>p.identifier===PRESET_ENTRIES.scene.identifier).length,1);
await adapter.place('world',settings.prompt_order[0].order.length,adapter.stamp());
assert.equal(settings.prompts.length,4);assert.match(settings.prompts.at(-1).content,/scene-reader-hub-world/);
const stale=adapter.stamp();settings.prompts[0].content+=' user edit';await assert.rejects(adapter.place('scene',1,stale),/바뀌/);
settings.prompts.find(p=>p.identifier===PRESET_ENTRIES.scene.identifier).content='User changed content';const untouched=JSON.stringify(settings);
await assert.rejects(adapter.place('scene',1,adapter.stamp()),/덮어쓰지/);assert.equal(JSON.stringify(settings),untouched);
console.log('Native preset entry host passed: persistent create/move, unchanged original settings, disabled neighbors, markers, duplicate prevention, failed saves and stale/user-edited protection.');

settings.prompts.find(p=>p.identifier===PRESET_ENTRIES.scene.identifier).content=entryText('scene');
release=true;const delayed=adapter.place('scene',1,adapter.stamp());while(typeof release!=='function')await Promise.resolve();
const orderBeforeSwitch=JSON.stringify(settings.prompt_order);settings.preset_settings_openai='B';release();await assert.rejects(delayed,/바뀌/);
assert.equal(settings.preset_settings_openai,'B');assert.equal(JSON.stringify(settings.prompt_order),orderBeforeSwitch,'late completion does not apply the old preset order to a newly selected preset');assert.ok(disk.A.prompts.some(p=>p.identifier===PRESET_ENTRIES.scene.identifier));
console.log('In-flight preset switching preserves the newly selected view and records the original named save.');

release=null;settings.preset_settings_openai='A';settings.prompt_order[0].order.unshift({identifier:'old-missing-definition',enabled:false});
const displayed=adapter.read().prompts;assert.equal(displayed[0].missing,true);
const visibleGap=displayed.findIndex(p=>p.identifier==='main')+1;await adapter.place('world',visibleGap,adapter.stamp());
const actualOrder=settings.prompt_order[0].order.map(r=>r.identifier);assert.equal(actualOrder.indexOf(PRESET_ENTRIES.world.identifier),actualOrder.indexOf('main')+1,'gaps still match the real order when a stale preset row has no definition');
