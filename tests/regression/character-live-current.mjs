import assert from 'node:assert/strict';
import { fixture } from './audit-v012.mjs';
import { createRecordBank } from '../../src/characters/records.js';
import { FALLBACKS } from '../../src/scene/policy.js';

function person(kind, name) {
    const entry = { id:kind, kind, name, npcRole:kind==='npc'?'mixed':'', source:`Name: ${name}. RAW_SOURCE_SENTINEL`, sourceHash:'saved', sourceVisibleToMain:true,
        coreEnglish:'OLD_CORE_SENTINEL', profile:{version:2,items:[{rule:'OLD_PROFILE_SENTINEL'}]} };
    entry.recordBank=createRecordBank({entity_type:kind,entity_name:name,records:[{
        type:'knowledge',target:'self',when:['before confirmation'],rule:`${name} suspects the invitation is a trap.`,modality:'possibility',basis:'explicit',source_ids:['S001'],knowledge_domain:'event',knowledge_state:'suspects',
    }]},entry,'current');
    return entry;
}
function setup({style='balanced',advanced=false,impersonate=false}={}) {
    const f=fixture(), seen=[];
    f.ctx.name2='Hunter'; f.ctx.chat=[{is_user:true,name:'User',mes:'Hunter and Rowan discuss the invitation with User.'}];
    f.sandbox.people=[person('character','Hunter'),person('npc','Rowan'),person('persona','User')];
    f.sandbox.options={style,advanced,impersonate};
    f.run(`record(true); Object.assign(record().preferences,{developmentStyle:options.style,advancedEnabled:options.advanced,allowUserImpersonation:options.impersonate,appearanceChance:0});
        characterStore={enabled:true,characters:[people[0]],npcs:[people[1]],persona:people[2]};`);
    f.sandbox.replyMode='select';
    f.sandbox.mockJev=async body=>{
        if(Object.hasOwn(body.state,'character_profiles'))seen.push(body);
        const answers={};
        for(const [key,q] of Object.entries(body.questions)) {
            if(q.type==='noul') { answers[key]={type:'noul',noul:f.sandbox.replyMode==='none'?0.1:f.sandbox.replyMode==='unknown'?'invalid':0.85};continue; }
            let choice=Object.hasOwn(q.criteria,FALLBACKS[key])?FALLBACKS[key]:Object.keys(q.criteria)[0];
            if(key==='progress_need')choice='stalled';
            if(key==='basic_move')choice=style==='dynamic'?'action':'emotion';
            if(/^character_\d+_presence$/.test(key))choice=f.sandbox.replyMode==='absent'?'absent':'active';
            if(key.startsWith('scene_participant_')||/^character_\d+_participation$/.test(key))choice=f.sandbox.replyMode==='weak'?f.sandbox.participationBasis:f.sandbox.replyMode==='absent'?'departed':'direct';
            answers[key]={choice,confidence:f.sandbox.replyMode==='weak'&&/^character_\d+_presence$/.test(key)?0.07:0.95};
        }
        return {answers};
    };
    f.run('callJev=mockJev');
    return {f,seen};
}
let runs=0;
for(const style of ['static','balanced','dynamic']) for(const advanced of [false,true]) for(const impersonate of [false,true]) {
    const {f,seen}=setup({style,advanced,impersonate});
    await f.run('runJudge({force:true})');
    const req=seen[0], people=req.state.character_profiles.people;
    assert.equal(req.state.controls.settingsContract,4);
    assert.equal(req.state.controls.developmentStyle,style);
    assert.ok(req.questions.basic_move && req.questions.progress_need);
    assert.equal(Boolean(req.questions.advanced_world_rules),advanced);
    assert.equal(people.length,impersonate?3:2);
    assert.equal(people.some(p=>p.kind==='persona'),impersonate);
    assert.ok(people.every(p=>p.recordMode && p.recordStatus==='current'));
    assert.ok(people.every(p=>!Object.hasOwn(p,'sourceExcerpt') && !Object.hasOwn(p,'personaReference') && !Object.hasOwn(p,'core') && !Object.hasOwn(p,'recordBank')));
    assert.doesNotMatch(JSON.stringify(req),/OLD_CORE_SENTINEL|RAW_SOURCE_SENTINEL|OLD_PROFILE_SENTINEL/);
    assert.ok(!Object.keys(req.questions).some(key=>/response_direction|response_basis/.test(key)));
    const judgment=JSON.parse(f.run('JSON.stringify(record().lastJudgment)'));
    assert.match(judgment.payload,/BASIC_DEVELOPMENT/);
    assert.match(judgment.payload,/CHARACTER_EXECUTION/);
    assert.ok(req.questions.character_0_record_0?.instructions.includes('invitation is a trap'));
    for(const p of people) {
        assert.ok(judgment.payload.includes(`${p.name} suspects the invitation is a trap.`));
        const trace=judgment.characterTrace.find(t=>t.id===p.id);
        assert.equal(trace.presence,'active','scene action budget must not clamp the third character');
        assert.equal(trace.injectedRuleIds.length,1);
    }
    assert.match(judgment.payload,/knowledge=suspects/);
    assert.doesNotMatch(judgment.payload,/RAW_SOURCE_SENTINEL|OLD_CORE_SENTINEL|OLD_PROFILE_SENTINEL|Direction:/);
    runs++;
}
// Low-confidence routing must reach the real selection, assembly and save path.
for(const evidence of ['direct','remote','reference','departed']) {
    const {f,seen}=setup();f.sandbox.replyMode='weak';f.sandbox.participationBasis=evidence;
    await f.run('runJudge({force:true})');
    const judgment=JSON.parse(f.run('JSON.stringify(record().lastJudgment)'));
    const participating=['direct','remote'].includes(evidence);
    assert.equal(seen.length,1,'participation observation shares the existing decision call');
    assert.equal(judgment.details.character_0_presence.participationEvidence,evidence);
    for(const actor of judgment.characterTrace) {
        assert.equal(actor.presence,participating?'active':'absent');
        assert.equal(actor.injectedRuleIds.length,participating?1:0);
    }
    assert.equal(judgment.payload.includes('suspects the invitation'),participating);
}
for(const mode of ['none','unknown','absent']) {
    const {f}=setup();f.sandbox.replyMode=mode;
    await f.run('runJudge({force:true})');
    assert.doesNotMatch(f.run('record().lastJudgment.payload'),/suspects the invitation/);
}
for(const mode of ['legacy','stale','version']) {
    const {f,seen}=setup();
    f.run(mode==='legacy'?'delete characterStore.characters[0].recordBank;':mode==='stale'?'characterStore.characters[0].source="Changed source";':'characterStore.characters[0].recordBank.recordVersion=999;');
    await f.run('runJudge({force:true})');
    const hunter=seen[0].state.character_profiles.people.find(p=>p.name==='Hunter');
    assert.equal(hunter.profileCandidates.length,0);
    assert.equal(hunter.recordStatus,mode==='legacy'?'legacy':'stale');
    assert.doesNotMatch(f.run('record().lastJudgment.payload'),/Hunter suspects|OLD_PROFILE_SENTINEL/);
    assert.ok(seen[0].state.registered_sheet_cast.some(p=>p.name==='Hunter'));
}
{
    const {f,seen}=setup();
    await f.run('runJudge({force:true})');
    await f.run('runJudge()');assert.equal(seen.length,1,'unchanged input reuses current judgment');
    f.run('characterStore.characters[0].source="Changed without updating sourceHash";');
    await f.run('runJudge()');assert.equal(seen.length,2,'source change must invalidate cached rules');
    assert.doesNotMatch(f.run('record().lastJudgment.payload'),/Hunter suspects/);
    f.run('characterStore.enabled=false;');
    await f.run('runJudge()');assert.equal(seen.length,3);
    assert.equal(seen[2].state.character_profiles,null);
    assert.doesNotMatch(f.run('record().lastJudgment.payload'),/CHARACTER_EXECUTION/);
    f.run('characterStore.enabled=true; record().preferences.allowUserImpersonation=true;');
    await f.run('runJudge()');assert.equal(seen.length,4);
    assert.ok(seen[3].state.character_profiles.people.some(p=>p.kind==='persona'));
    f.run('record().preferences.settingsContract=2; record().lastJudgment.payload="OLD_CACHED_SENTINEL";');
    await f.run('runJudge()');assert.equal(seen.length,5);
    assert.doesNotMatch(f.run('record().lastJudgment.payload'),/OLD_CACHED_SENTINEL/);
}
{
    const {f,seen}=setup();
    await f.run('runJudge({force:true})');
    f.sandbox.replacement=person('character','Hunter');
    f.sandbox.replacement.recordBank.records[0].rule='Hunter suspects the invitation was forged.';
    f.run('characterStore.characters[0]=replacement;');
    await f.run('runJudge()');
    assert.equal(seen.length,2,'replacing saved records invalidates the previous selection');
    assert.match(f.run('record().lastJudgment.payload'),/Hunter suspects the invitation was forged/);
    assert.doesNotMatch(f.run('record().lastJudgment.payload'),/Hunter suspects the invitation is a trap/);
    f.run('characterStore.characters[0].recordBank.records[0].source_ids=["BAD"];');
    await f.run('runJudge()');
    assert.equal(seen.length,3);
    assert.doesNotMatch(f.run('record().lastJudgment.payload'),/Hunter suspects/);
}
for (const style of ['static','dynamic']) for (const intensity of [0.5,1.5]) {
    const {f,seen}=setup({style,advanced:true,impersonate:false});
    f.ctx.chat.unshift({is_user:false,mes:'Hunter and Rowan remain in conversation.'});
    f.sandbox.intensity=intensity;
    f.run(`record().preferences.progressIntensity=intensity; characterStore.npcs[0].trackArousal=true;
        storeStateEvent(record(),{outputIndex:0,fingerprint:stableFingerprint(getContext().chat[0].mes),states:people.map(person=>({id:person.id,values:{a:35,c:70,anger:25,joy:0,fear:0,sadness:0},targets:{}}))});`);
    const original=f.sandbox.mockJev;
    let calls=0;
    f.sandbox.affectJev=async body=>{
        calls++;
        const result=await original(body);
        for(const key of Object.keys(body.questions)) {
            if(key.endsWith('_affect_a'))result.answers[key]={choice:'active',confidence:0.95};
            if(key.endsWith('_affect_anger'))result.answers[key]={choice:'inward',confidence:0.95};
        }
        return result;
    };
    f.run('callJev=affectJev');
    await f.run('runJudge({force:true})');
    assert.equal(calls,2,'state choices do not add a Jev call');
    const judgment=JSON.parse(f.run('JSON.stringify(record().lastJudgment)'));
    assert.doesNotMatch(judgment.payload,/Prior state sexual arousal 35%/,'stored arousal no longer competes with the independent physical-conduct router');
    assert.match(judgment.payload,/<SEXUAL_CONDUCT pace="medium">/,'physical conduct is injected independently of ordinary progression');
    assert.ok(!Object.keys(seen.at(-1).questions).some(key=>key.endsWith('_affect_a')),'the old arousal-expression question is suppressed for router-managed people');
    assert.match(judgment.payload,/Prior state anger 25%/,'different feelings coexist');
    assert.ok(seen[0].state.prior_output_character_states.every(person=>person.id!=='persona'),'persona state stays private when impersonation is off');
    f.run('characterStore.npcs[0].trackArousal=false;');
    await f.run('runJudge()');
    const npcState=seen.at(-1).state.prior_output_character_states.find(person=>person.id==='npc');
    assert.equal(npcState.values.a,undefined,'NPC opt-out removes the old value before Jev sees it');
    assert.equal(npcState.values.anger,25,'NPC ordinary emotion remains available');
}
console.log(`Current character runtime passed: ${runs} style/event/persona combinations, scoped prior states at both intensity limits, two Jev calls, canonical-only requests, selected-rule injection, legacy/stale/unknown rejection and cache invalidation.`);
