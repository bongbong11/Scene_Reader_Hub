const hubBindings = Object.assign({}, ...await Promise.all(["src/retrieval/maintenance.js","src/injection/preset-request.js","src/debug/diagnostics.js","src/character/emotion-runtime.js","src/lifecycle/job-control.js","src/storage/identity.js","src/storage/owner.js","src/ui/activity.js","src/ui/owner.js","src/ui/clipboard.js","src/shared/html.js","src/storage/record.js","src/world/selection.js","src/context/runtime.js","src/lifecycle/ooc.js","src/adapters/jev-client.js","src/lifecycle/snapshots.js","src/ui/status.js","src/ui/shell.js","src/lifecycle/generation.js","src/lifecycle/startup.js","src/injection/reconcile.js","src/storage/contract.js","src/hub/state.js","src/hub/orchestrator.js","src/adapters/generation-interceptor.js","src/injection/receipt.js","src/ui/trace.js","src/ui/toasts.js","src/ui/mascot.js","src/context/memory.js","src/storage/repository.js","src/app/output-lifecycle.js","src/scene/execution.js","src/ui/controller.js","src/continuity/state-adapter.js","src/decision/answers.js","src/retrieval/vectors.js","src/scene/coordinator.js","src/scene/draws.js","src/ui/results.js","src/ui/dialog-template.js","src/character/prompts.js","src/character/npc-sheet.js","src/character/state-collector.js","src/character/state-main-output.js","src/character/state-profile-output.js","src/character/state-contract.js","prompt-library.js","src/world/seasonal.js","src/world/advanced-library.js","src/world/catalog.js","src/context/messages.js","src/decision/policy.js","src/scene/state-effects.js","src/decision/action-budget.js","src/continuity/candidates.js","src/continuity/engine.js","src/adapters/connection-profile.js","src/shared/security.js","src/character/index.js","src/character/sexual-conduct.js","src/lifecycle/jobs.js","src/context/message-identity.js"].map(file => import('../../'+file))));
import * as legacyProfiles from '../fixtures/legacy-profiles.mjs';
import {createUiController} from '../../src/ui/controller.js';
import {createSceneExecution} from '../../src/scene/execution.js';
import {createOutputLifecycle} from '../../src/app/output-lifecycle.js';
import {createRepository} from '../../src/storage/repository.js';
import * as knowledge from '../../src/storage/knowledge.js';
import * as memory from '../../src/memory/context.js';
import * as policy from '../../src/scene/policy.js';
import * as coordinator from '../../src/scene/coordinator.js';
import { createDraws } from '../../src/scene/draws.js';
import { createResults } from '../../src/ui/results.js';
import * as presentation from '../../src/ui/presentation.js';
import { dialogTemplate } from '../../src/ui/dialog-template.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as prompt from '../../prompt-library.js';
import * as advanced from '../../advanced-library.js';
import * as world from '../../world-library.js';
import * as seasonal from '../../src/world/seasonal.js';
import * as runtime from '../../runtime-utils.js';
import * as decision from '../../decision-engine.js';
import * as state from '../../state-engine.js';
import * as action from '../../action-coordinator.js';
import * as hooks from '../../continuity-hooks.js';
import * as continuity from '../../continuity-engine.js';
import * as profile from '../../st-profile-reasoner.js';
import * as character from '../../character-library.js';
import * as characterPrompts from '../../src/characters/prompts.js';
import * as npcSheet from '../../src/characters/npc-sheet.js';
import * as security from '../../security-utils.js';
import * as stateContract from '../../src/characters/state-contract.js';
import * as stateCollector from '../../src/characters/state-collector.js';
import * as stateMainOutput from '../../src/characters/state-main-output.js';
import * as stateProfileOutput from '../../src/characters/state-profile-output.js';
import * as sexualConduct from '../../src/characters/sexual-conduct.js';
import { createVectorRetrieval, RETRIEVAL_PROVIDERS } from '../../src/retrieval/vectors.js';

import * as jobs from '../../src/app/jobs.js';
import * as identity from '../../src/input/message-identity.js';
import * as toasts from '../../src/ui/toasts.js';
import { MASCOT_ICON_URL } from '../../src/ui/mascot.js';
const source = (await readFile(new URL('../../src/app/bootstrap.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\r?\n/gm, '');
export function fixture() {
    const ctx = { characterId: 1, chatId: 'room-A', name1: 'User', name2: 'Hunter', chat: [], saveMetadata: async () => {} };
    const sandbox = {
        ...hubBindings, createUiController,createSceneExecution,createOutputLifecycle,createRepository, createVectorRetrieval, RETRIEVAL_PROVIDERS, ...knowledge, ...memory, createResults, createDraws, ...policy, ...coordinator, dialogTemplate, ...presentation, ...characterPrompts, ...npcSheet, ...jobs, ...identity, ...toasts, ...prompt, ...advanced, ...world, ...seasonal, ...runtime, ...decision, ...state, ...action, ...hooks, ...continuity, ...profile, ...character, ...legacyProfiles, ...security, ...stateContract, ...stateCollector, ...stateMainOutput, ...stateProfileOutput, ...sexualConduct,
        currentContext: ctx, chat_metadata: {}, extension_settings: {}, MASCOT_ICON_URL,
        console, structuredClone, setTimeout, clearTimeout, AbortController, AbortSignal,
        jQuery() {}, document: { getElementById() { return null; } },
        fetch: async () => ({ok:true,json:async()=>({ok:true})}),
        window: {}, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        saveSettingsDebounced() {}, setExtensionPrompt: async () => {}, getRequestHeaders() { return {}; }, isStreamingEnabled() { return false; },
        eventSource: {}, event_types: {},
    };
    sandbox.SillyTavern = { getContext: () => sandbox.currentContext };
    vm.createContext(sandbox);
    vm.runInContext(source,sandbox);
    const hubRuntime=vm.runInContext('runtime',sandbox);
    for(const key of Object.keys(hubRuntime))Object.defineProperty(sandbox,key,{configurable:true,get:()=>hubRuntime[key],set:value=>{hubRuntime[key]=value}});
    vm.runInContext(`settings = {...DEFAULTS}; serverStoreAvailable = true; storageVersion = 2; renderAll = () => {}; updateStatus = () => {}; globalThis.actualUpdateActivity = updateActivity; globalThis.actualShowActivity = showActivity; showActivity = () => {}; updateActivity = () => {}; setBusy = () => {};`, sandbox);
    return { sandbox, ctx, run: (script) => vm.runInContext(script, sandbox) };
}
const results = [];
function result(id, detail) { results.push({ id, ...detail }); }

// Regression assertions enforce the corrected outcomes of all fourteen audit cases.
{
    const f = fixture();
    f.run(`record(true); settings.enabled = false;`);
    f.ctx.chat = [{ is_user: true, mes: 'I open the door.' }];
    await f.run(`onBeforeGeneration('normal', {}, false)`);
    f.ctx.chat.push({ is_user: false, mes: 'Hunter enters the room.' });
    await f.run(`onCharacterMessageReceived(1)`);
    const excluded = f.run('JSON.stringify(record().nonRpOutputIndices)');
    assert.equal(excluded, '[]');
    f.run('settings.enabled = true;');
    result('disabled_rp_excluded', { storedExcludedIndices: excluded, rpAfterReenable: f.run(`recentContext().recentRoleplay`) });
}
{
    const f = fixture();
    f.run(`var rec = record(true); rec.eventProfile = {title:'event'}; rec.npcProfile = {role:'witness'}; rec.villainProfile = {motive:'revenge'};
        var d = {...FALLBACKS, event_route:'retire', npc_route:'retire', villain_route:'retire', event_state:'aftermath'};
        var staged = stagedRecord(rec); var details = {}; prepareProfiles(staged,d,details); coordinateActionBudget(rec,details,d,staged);`);
    const routes = f.run(`JSON.stringify({event:d.event_route,npc:d.npc_route,villain:d.villain_route,effects:pendingPlanEffects(d)})`);
    const parsed = JSON.parse(routes);
    assert.equal(parsed.npc, 'retire'); assert.equal(parsed.villain, 'retire'); assert.equal(parsed.event, 'retire');
    result('retirement_cancelled', parsed);
}
{
    const f = fixture();
    f.run(`var rec = record(true); rec.preferences.advancedEnabled = true;
        var d = {...FALLBACKS, primary_focus:'transition'}; coordinateActionBudget(rec,{},d,rec);
        var payload = buildInjection({settings:rec.preferences,decisions:d});`);
    const actual = f.run(`JSON.stringify({focus:d.primary_focus,direct:d.direct_execution,hasAdvanced:payload.includes('<ADVANCED_PROGRESSION'),hasBasic:payload.includes('<RP_PROGRESSION'),hasDirect:payload.includes('<DIRECT_SCENE_EXECUTION'),hasTransition:payload.includes('<SCENE_TRANSITION>')})`);
    assert.equal(JSON.parse(actual).hasTransition, true);
    result('advanced_transition_empty', JSON.parse(actual));
}
{
    const f = fixture();
    f.run(`var rec = record(true); rec.progressionState.turnsSinceMeaningfulProgress = 4;
        var questions = buildQuestions({preferences:rec.preferences,pacingState:{...rec.pacingState,progression:rec.progressionState}});`);
    assert.equal(f.run(`questions.primary_focus.instructions.includes('no accumulated verified progression stall')`), false);
    result('stall_pressure_not_supplied', {storedStalls: 4, jevToldNoStall: true});
}
{
    const f = fixture();
    f.ctx.chat = [{is_user:true,mes:'Enter.'},{is_user:false,mes:'Alternative B: Hunter opens the vault.'}];
    f.run(`var rec = record(true); rec.pendingPlan = {inputKey:'old',outputIndex:1,chatCount:2,outputText:'Alternative A',outputFingerprint:'old',effects:['event']};`);
    await f.run(`rollbackChangedOutput(1,'swiped')`);
    assert.equal(f.run('record().pendingPlan.outputText'), f.ctx.chat[1].mes);
    result('existing_swipe_not_captured', {actualSelectedOutput: f.ctx.chat[1].mes, pendingOutput: f.run('record().pendingPlan.outputText'), verificationQuestions: Object.keys(f.run('buildVerificationQuestions(record().pendingPlan)'))});
}
{
    const store = character.normalizeCharacterStore({ enabled:true, characters:[{id:'main',name:'Hunter',source:'Hunter is a lawyer.'}],npcs:[{id:'wade',name:'웨이드',source:'유저의 아버지. 사업가.'}] });
    const korean = character.selectActiveEntries(store, 'Hunter watches. 웨이드는 서류를 내려놓았다.', 'Hunter');
    assert.equal(korean.some(x=>x.id==='wade'), true);
    store.npcs = ['Alan','Beth','Carl'].map(name=>({id:name,name,source:name+' is a witness.'}));
    const large = character.selectActiveEntries(store, 'Hunter speaks. '+('x'.repeat(15000))+' Alan Beth Carl', 'Hunter');
    assert.equal(large.some(x=>x.id==='main'), true);
    result('active_character_selection', {koreanParticipants:korean.map(x=>x.name),longContextParticipants:large.map(x=>x.name)});
}
{
    const parsed = runtime.buildRecentContext({chat:[{is_user:true,mes:'(OOC: Marcus는 문서(금고 안의 것)의 존재를 몰라.)'}]});
    assert.equal(parsed.oocOnly,true);
    result('nested_ooc_leaks', {oocOnly:parsed.oocOnly,rp:parsed.recentRoleplay,meta:parsed.metaGuidance.current});
}
{
    const event = advanced.rollAdvancedEvent('horror',{worldId:'realistic-killer',worldName:'초자연 없는 현실 살인마물',random:()=>0.99});
    const injection = advanced.buildAdvancedInjection({decisions:{advanced_route:'create',advanced_move:'reveal'},eventProfile:event});
    assert.doesNotMatch(injection,/ritual/);
    result('world_blind_roll', {world:event.worldName,rolledTitle:event.title,trigger:event.trigger});
}
{
    const f = fixture();
    f.ctx.chat=[{is_user:true,mes:'Speak.'},{is_user:false,mes:'Hunter agrees.'},{is_user:true,mes:'Go on.'}];
    let release, started;
    const ready=new Promise(r=>{started=r});
    f.sandbox.mockJev = async (body) => { started(); return await new Promise(r=>{release=()=>r({answers:Object.fromEntries(Object.entries(body.questions).map(([k,q])=>[k,{choice:Object.keys(q.criteria)[0],confidence:1}]))})}); };
    f.run(`var recA = record(true); recA.pendingPlan={inputKey:'previous',outputText:'Hunter agrees.',outputFingerprint:stableFingerprint('Hunter agrees.'),outputIndex:1,effects:['progress'],decisions:{},stateSnapshot:reversibleStateSnapshot(recA),preparedStateSnapshot:reversibleStateSnapshot(recA)}; callJev=mockJev;`);
    const pending=f.run('runJudge({force:true})');
    await ready;
    f.sandbox.currentContext={characterId:2,chatId:'room-B',name1:'User',name2:'Other',chat:[{is_user:true,mes:'Another story.'}],saveMetadata:async()=>{}};
    f.sandbox.chat_metadata={}; f.run('record(true)');
    release(); await pending;
    const history=await f.run('loadStateHistory()');
    assert.equal(history.length,0);
    result('late_judgment_crosses_chat', {currentRoom:'room-B',historyFromDifferentRoom:history[0]?.plan?.outputText});
}

{
    const f = fixture();
    f.sandbox.fetch = async () => ({ok:true,json:async()=>({settings:{global:{enabled:true},owner:{prompt:''}},chat:null,history:[],characters:null,backups:[]})});
    f.run(`record(true).eventProfile = {title:'Should disappear after empty backup restore'};
        privateOwnerPrompt = 'old private prompt'; stateHistoryCache.set(stateChatKey(),[{assistantIndex:1}]);
        storagePost = async () => ({settings:{global:{...DEFAULTS},owner:{prompt:''}},chat:null,history:[],characters:null,backups:[]});
        loadReasonerProfiles = async () => {};`);
    await f.run(`hydrateServerState({migrate:false})`);
    const remaining = f.run(`JSON.stringify({event:record()?.eventProfile?.title,historyLength:stateHistoryCache.get(stateChatKey()).length,privatePrompt:privateOwnerPrompt})`);
    assert.equal(JSON.parse(remaining).historyLength,0); assert.equal(JSON.parse(remaining).privatePrompt,''); assert.equal(JSON.parse(remaining).event,undefined);
    result('empty_backup_retains_old_state',JSON.parse(remaining));
}
{
    const c=continuity.emptyContinuity();
    c.items=[{id:'continuity:meeting',label:'Attend council meeting',owners:['Wade'],lifecycle:'confirmed',pressure:'none'}];
    c.followups=[{id:'f',relatedStateId:'continuity:meeting',action:'Wade asks his aide to prepare for the council meeting',reason:'An obligation exists',status:'available',executed:false,expiry:5,lastOffered:null}];
    const selected=continuity.selectContinuityContext(c,'Wade enters the room and mentions the council meeting.',{opportunity:1});
    assert.equal(selected.items.length,1);assert.equal(selected.followups.length,1);
    result('stored_followup_not_relevant_by_owner',{selectedItems:selected.items.length,selectedFollowups:selected.followups.length});
}

{
    const f=fixture();
    f.run(`var rec = record(true); rec.eventProfile = {title:'Event caused by the deleted output'};
        stateHistoryCache.set(stateChatKey(),[{assistantIndex:1,before:reversibleStateSnapshot(rec)}]);`);
    // SillyTavern emits the NEW chat length, not the removed index, for middle deletion.
    f.ctx.chat=Array.from({length:5},(_,i)=>({is_user:i%2===0,mes:'remaining '+i}));
    await f.run(`rollbackChangedOutput(5,'deleted')`);
    assert.equal((await f.run('loadStateHistory()')).length,0);
    result('middle_delete_wrong_boundary',{removedIndex:1,eventArgument:5,historyStillPresent:true});
}
console.log(`Audit regression: ${results.length} scenarios passed.`);
