import { prepareProfileItems, createProfile } from '../fixtures/legacy-profiles.mjs';
import assert from 'node:assert/strict';
import { fixture } from './audit-v012.mjs';
import { CHARACTER_LIVE_SYSTEM, ACCESS_CHOICES } from '../../src/characters/prompts.js';
import {
    currentProfileItems, normalizeCharacterStore,
    buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan,
    buildCharacterInjection,
} from '../../character-library.js';
import { applyCharacterPolicy } from '../../src/scene/policy.js';
import { buildInjection } from '../../prompt-library.js';
import { suggestNpcAliases } from '../../src/characters/npc-sheet.js';
import { wholeDiagnosticReport } from '../../src/debug/whole-report.js';

assert.match(CHARACTER_LIVE_SYSTEM, /up to the number of available slots/);
assert.ok(ACCESS_CHOICES.inferred);

const source = 'Name: Wade\nRole: Family patriarch.\nHe controls his son on family decisions.';
const candidate = {
    id: 'c1', kind: 'relationship', topic: 'family_decisions', target: 'son',
    rule: 'On family decisions, Wade tends to control his son.',
};
const prepared = prepareProfileItems({ items: [candidate] });
assert.equal(prepared.items.length, 1);
assert.equal(prepareProfileItems({ items: [{ ...candidate, id: 'c2', rule: '가족을 통제한다.' }] }).items.length, 0);
const options = { characterId: 'wade', sourceHash: 'hash-v2', source, analysisId: 'run-v2' };
const profile = createProfile(prepared.items, options);
assert.equal(profile.items.length, 1);
const entry = normalizeCharacterStore({
    enabled: true, npcs: [{ id: 'wade', name: 'Wade', source, sourceHash: 'hash-v2', profile }],
}).npcs[0];
assert.equal(entry.npcRole, 'mixed');
assert.equal(normalizeCharacterStore({npcs:[{name:'Legacy villain',antagonist:true}]}).npcs[0].npcRole, 'villain');
assert.equal(normalizeCharacterStore({npcs:[{name:'Helper',npcRole:'ally',antagonist:true}]}).npcs[0].antagonist, false);
assert.equal(currentProfileItems(entry).length, 1);
assert.equal(currentProfileItems({ ...entry, source: source + ' changed' }).length, 0);
const plan = buildLiveCharacterPlan([entry], {
    selected: [
        { is_user: false, name: 'Olivia', mes: 'Maybe Marcus stole it.', send_date: 'Friday' },
        { is_user: true, name: 'User', mes: 'Wade enters.', send_date: 'Saturday' },
    ],
    transcript: 'Maybe Marcus stole it. Wade enters.',
});
assert.equal(plan[0].profileCandidates.length, 1);
assert.equal(plan[0].npcRole, 'mixed');
assert.ok(plan[0].contextCandidates.some(item => item.text === 'Maybe Marcus stole it.' && item.speaker === 'Olivia'));
const questions = buildCharacterTurnQuestions(plan);
assert.match(questions.character_0_profile_slot_1.criteria[plan[0].profileCandidates[0].id], /family decisions/);
const rumor = plan[0].contextCandidates.find(item => item.text === 'Maybe Marcus stole it.');
const accessSlot = plan[0].contextCandidates.indexOf(rumor);
const denied = resolveLiveCharacterPlan(plan, {
    character_0_presence: 'active', character_0_context_slot_1: rumor.id,
    [`character_0_context_access_${accessSlot}`]: 'none',
    character_0_response_direction: 'confront', character_0_response_basis: rumor.id,
});
assert.equal(denied[0].contextItems.length, 0);
assert.equal(denied[0].direction, 'none', 'an action depending on denied information is removed');
assert.doesNotMatch(buildCharacterInjection(denied).text, /Marcus stole it/);
const independent = resolveLiveCharacterPlan(plan, {
    character_0_presence: 'active', character_0_context_slot_1: rumor.id,
    [`character_0_context_access_${accessSlot}`]: 'none',
    character_0_response_direction: 'confront', character_0_response_basis: 'scene',
});
assert.equal(independent[0].direction, 'confront', 'a separately grounded live response survives an unrelated denied item');
const accessPolicy = applyCharacterPolicy(
    `character_0_context_access_${accessSlot}`,
    { choice: 'private_access', confidence: .7 }, 'active',
    Object.keys(questions[`character_0_context_access_${accessSlot}`].criteria));
assert.equal(accessPolicy.effective, 'none', 'active routing cannot lower information access threshold');
const selected = resolveLiveCharacterPlan(plan, {
    character_0_presence: 'active',
    character_0_profile_slot_1: plan[0].profileCandidates[0].id,
    character_0_response_direction: 'none',
});
const injection = buildCharacterInjection(selected).text;
assert.match(injection, /On family decisions/);
assert.match(injection, /Family patriarch/);
assert.doesNotMatch(injection, /가족/u);
const castPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', progressionMode: 'natural', roleplayPace: 'medium' },
    decisions: { response_cadence: 'natural', primary_focus: 'npc', relationship_pacing: 'hold', relationship_beat: 'none', npc_route: 'reuse', npc_weight: 'brief', npc_role: 'participant' },
    npcProfile: { name: 'Wade', role: 'father', mode: 'natural', status: 'active' }, sheetCastNames: ['Wade'],
});
assert.match(castPayload, /NPC_CAST_SCOPE/);
assert.doesNotMatch(castPayload, /<RP_NPC_ROUTING|<NPC_SCENE_EXECUTION/);
const castOffPayload = buildInjection({
    settings: { worldDirection: 'natural', relationshipDirection: 'dynamic', progressionMode: 'off', roleplayPace: 'medium', npcToUser: true },
    decisions: { response_cadence: 'natural', npc_route: 'none', npc_autonomy: 'no' }, sheetCastNames: ['Wade'],
});
assert.match(castOffPayload, /Registered Sheet Cast retain their established identity/, 'ownership survives disabled individual analysis');
assert.deepEqual(suggestNpcAliases('Wade Ashford', 'Alias: Mr. Ashford\nRole: family head'), ['Wade', 'Mr. Ashford']);
assert.deepEqual(suggestNpcAliases('Wade Ashford', 'Alias: Mr. Ashford', ['Wade', 'Mr. Ashford']), []);
assert.deepEqual(suggestNpcAliases('민수', '역할: 동료'), []);
const debugText = JSON.stringify(wholeDiagnosticReport({judgment:{payload:'Secret private text',request:{state:{recent_roleplay:'Contact me@example.com or 010-1234-5678; key sk-abcdefghijk12345.'}}}}));
assert.doesNotMatch(debugText,/me@example.com|010-1234-5678|sk-abcdefghijk12345|Secret private text/);

// A saved sheet is not replaced by a stale analysis response.
{
    const f = fixture();
    const fields = new Map();
    f.sandbox.document.getElementById = id => {
        if (!fields.has(id)) fields.set(id, { value: '', checked: false, hidden: false, textContent: '', dataset: {}, scrollIntoView() {} });
        return fields.get(id);
    };
    f.sandbox.window.toastr = { success() {}, error() {} };
    f.run('renderCharacterStore=()=>{}; persistChat=async()=>{}; clearInjection=async()=>{}; loadReasonerProfiles=async()=>{}; saveCharacterStore=async()=>{}; record(true); showCharacterEditor("npc")');
    fields.get('sr-character-name').value = 'Wade';
    fields.get('sr-character-source').value = source;
    let modelCalls = 0;
    f.sandbox.mockExtract = async () => { modelCalls++; return { result: { entity_type:'npc',entity_name:'Wade',records:[{type:'relationship',target:'son',when:['family decisions'],rule:candidate.rule,modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}] } }; };
    f.run('requestWithConnectionProfile=mockExtract; settings.reasonerProfileId="p"; connectionRequestService={}');
    await f.run('saveCharacterEntry()');
    assert.equal(modelCalls, 0);
    await f.run('analyzeAndSaveCharacter()');
    assert.equal(modelCalls, 1, 'saving rules needs one normal-model call and no Jev save validation');
    assert.equal(f.run('characterStore.npcs[0].recordBank.records.length'), 1);
}

// Canonical records supply hidden-NPC identity; no second legacy interpretation call.
{
    const f = fixture();
    const fields = new Map();
    f.sandbox.document.getElementById = id => {
        if (!fields.has(id)) fields.set(id, { value: '', checked: false, hidden: false, textContent: '', dataset: {}, scrollIntoView() {} });
        return fields.get(id);
    };
    f.sandbox.window.toastr = { success() {}, error() {} };
    f.run('renderCharacterStore=()=>{}; persistChat=async()=>{}; clearInjection=async()=>{}; loadReasonerProfiles=async()=>{}; saveCharacterStore=async()=>{}; record(true); showCharacterEditor("npc")');
    fields.get('sr-character-name').value = '웨이드';
    fields.get('sr-character-source').value = '이름: 웨이드\n역할: 유저의 아버지이자 사업가.';
    let calls = 0;
    f.sandbox.mockExtract = async (_service, _profile, prompt) => {
        calls++;
        return { result: prompt.includes('minimum identity') ? { core: 'The user persona\'s father and a businessman.' } : { entity_type:'npc',entity_name:'웨이드',records:[] } };
    };
    f.run('requestWithConnectionProfile=mockExtract; settings.reasonerProfileId="p"; connectionRequestService={}');
    await f.run('saveCharacterEntry()');
    await f.run('analyzeAndSaveCharacter()');
    assert.equal(calls, 1);
    assert.equal(f.run('characterStore.npcs[0].coreEnglish'), '');
}

const longPeople = Array.from({length:4},(_,index)=>({index,id:`p${index}`,name:`Person${index}`,kind:'npc',presence:'active',sourceVisibleToMain:true,
    core:{excerpts:[]},coreEnglish:'',antagonist:false,denied:[],profileIds:[`p${index}a`,`p${index}b`],contextIds:[],contextItems:[],direction:'none',
    profileItems:[{id:`p${index}a`,rule:'A'.repeat(350)},{id:`p${index}b`,rule:'B'.repeat(350)}]}));
const bounded = buildCharacterInjection(longPeople,{volume:'basic'});
assert.ok(bounded.text.length<=3000);
assert.ok(bounded.traces.some(item=>item.omittedRuleIds.length>0));
assert.ok(!bounded.text.includes('B'.repeat(175)) || bounded.text.includes('B'.repeat(350)), 'long rules are included or omitted whole');

console.log('Character rule extraction and live-selection regression passed.');
