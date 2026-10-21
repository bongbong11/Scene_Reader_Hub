import assert from 'node:assert/strict';
import {characterBehaviorPrompt,normalizeBehaviorMode,GLM_CHARACTER_BEHAVIOR,GEMINI_CHARACTER_BEHAVIOR} from '../src/injection/character-behavior.js';
import {buildInjection} from '../src/injection/assemble.js';
import {routeCharacterMacro} from '../src/injection/character-macro.js';
import {effectivePreferences,roomPreferences} from '../src/storage/common-preferences.js';
import {createSourceRevision} from '../src/context/source-revision.js';
import {CHAT_DEFAULTS,DEFAULTS} from '../src/storage/contract.js';
import {createSettingsForm} from '../src/ui/forms/settings.js';
import {createWriteQueue} from '../src/lifecycle/jobs.js';

assert.equal(DEFAULTS.characterBehaviorMode,'glm');
for(const bad of [undefined,null,'other','Gemini'])assert.equal(normalizeBehaviorMode(bad),'glm');
const count=(text,needle)=>text.split(needle).length-1;
const variants=['glm','gemini'].map(mode=>buildInjection({settings:{...CHAT_DEFAULTS,characterBehaviorMode:mode,worldAgencyEnabled:true},decisions:{primary_focus:'direct'}}).replace(characterBehaviorPrompt(mode),''));
assert.equal(variants[0],variants[1],'switch changes only the behavior prompt');
for(const mode of ['glm','gemini'])for(const agency of [false,true]) {
    const prompt=characterBehaviorPrompt(mode),delivery={};
    assert.doesNotMatch(prompt,/[가-힣]|\{\{\/\/|\(Meta:/);
    assert.equal(count(prompt,'[CHARACTER RESPONSE GUIDANCE]'),1);
    assert.doesNotMatch(prompt,/<CHARACTER_BEHAVIOR>|GEMINI_CHARACTER_BALANCE/);
    assert.ok(prompt.includes(mode==='gemini'?GEMINI_CHARACTER_BEHAVIOR:GLM_CHARACTER_BEHAVIOR));
    assert.equal(prompt.includes('INTENSITY:'),mode==='gemini');
    assert.equal(prompt.includes('NO AUTOMATIC SOFTENING:'),mode==='glm');
    const payload=buildInjection({settings:{...CHAT_DEFAULTS,characterBehaviorMode:mode,worldAgencyEnabled:agency},decisions:{primary_focus:'direct',relationship_pacing:'hold'},delivery});
    assert.equal(count(payload,prompt),1);
    assert.equal(count(delivery.text,prompt),1);
    assert.equal(count(delivery.scenePayload,prompt),0);
    assert.ok(!payload.includes(mode==='gemini'?GLM_CHARACTER_BEHAVIOR:GEMINI_CHARACTER_BEHAVIOR));
    for(const enabled of [false,true])for(const anchor of [false,true]) {
        const body={messages:[{role:'system',content:anchor?'[BEHAVIOR_TEST]':'preset'},{role:'system',content:payload},{role:'user',content:'Continue.'}]};
        const value={payload,characterDelivery:structuredClone(delivery)};
        routeCharacterMacro(body,value,{marker:'[BEHAVIOR_TEST]',enabled});
        routeCharacterMacro(body,value,{marker:'[BEHAVIOR_TEST]',enabled});
        const sent=body.messages.map(m=>m.content).join('\n');
        assert.equal(count(sent,prompt),1,'whole prompt once after repeated routing or fallback');
    }
}
const room={...CHAT_DEFAULTS,characterBehaviorMode:'glm'};
const settings={characterBehaviorMode:'gemini'};
assert.equal(effectivePreferences(room,settings).characterBehaviorMode,'gemini');
assert.equal(roomPreferences(effectivePreferences(room,settings)).characterBehaviorMode,undefined);
const revision=createSourceRevision({settings,stableFingerprint:JSON.stringify,characterStore:{enabled:false,characters:[],npcs:[]},getContext:()=>({chat:[]})});
const before=revision.sourceRevisionKey({preferences:room},null);
settings.characterBehaviorMode='glm';
assert.notEqual(before,revision.sourceRevisionKey({preferences:room},null),'global mode invalidates even an old room snapshot');

// Saving is transactional and does not run a model, edit a room, or rebuild vectors.
let failure=false,refreshed=0,invalidated=0,saved=0;
const buttons=['gemini','glm'].map(mode=>({dataset:{srBehavior:mode},setAttribute(){}}));
const deps={settings,queueWrite:createWriteQueue(),invalidateReasonerJobs(){invalidated++;},
    saveServerSettings:async()=>{if(failure)throw new Error('save failed');saved++;},saveSettingsDebounced(){},
    applyStoredInjection:async()=>{refreshed++;},
    document:{querySelectorAll:()=>buttons,getElementById:()=>null},preferences:()=>({...CHAT_DEFAULTS}),
    renderReasonerProfiles(){},updateKeyStatus(){},updateStatus(){},renderWorldControls(){},renderOwnerMode(){},
    ADVANCED_ELEMENTS:{},RETRIEVAL_PROVIDERS:{},availableWorlds:()=>[],ownerUnlocked:()=>false};
const forms=createSettingsForm(deps);
await forms.saveGlobal('characterBehaviorMode','gemini');
assert.equal(settings.characterBehaviorMode,'gemini');assert.equal(saved,1);assert.equal(refreshed,1);
failure=true;
await assert.rejects(forms.saveGlobal('characterBehaviorMode','glm'),/save failed/);
assert.equal(settings.characterBehaviorMode,'gemini');assert.equal(refreshed,2);assert.equal(invalidated,2);
console.log('Behavior switch: exact variants, macro/integrated routing, common scope, stale source invalidation and failed-save rollback passed.');
