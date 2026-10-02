import assert from 'node:assert/strict';
import {fixture} from './audit-v012.mjs';
import {createRecordBank} from '../../src/characters/records.js';

function setup() {
    const f=fixture(), requests=[];
    const entry={id:'wade',kind:'npc',name:'Wade',npcRole:'mixed',source:'Wade keeps personal wishes private.',selectedLore:[],sourceVisibleToMain:false};
    entry.recordBank=createRecordBank({entity_type:'npc',entity_name:'Wade',records:[],intimacy_reference:{text:'Wade keeps personal wishes private.',source_ids:['S001']}},entry,'audit');
    f.sandbox.auditEntry=entry;
    f.run('record(true); settings.recentTurns=1; characterStore=normalizeCharacterStore({enabled:true,npcs:[auditEntry]});');
    const scenario={level:'3',phase:'active',participant:'yes'};
    f.sandbox.auditJev=async request=>{
        requests.push(request);
        const answers={};
        for(const [key,question] of Object.entries(request.questions)) {
            const choice=key==='scene_level'?scenario.level:key==='scene_phase'?scenario.phase:key==='scene_evidence'?Object.keys(question.criteria).find(value=>value!=='none')||'none':key.startsWith('scene_participant_')?scenario.participant:Object.keys(question.criteria)[0];
            answers[key]={choice,confidence:1};
        }
        return {answers};
    };
    f.run('callJev=auditJev;');
    f.ctx.chat=[{is_user:true,mes:'Wade remains in the current interaction.'}];
    return {f,requests,scenario};
}

const failures=[];
{
    const {f,requests,scenario}=setup();
    await f.run('runJudge({force:true})');
    assert.match(f.run('record().lastJudgment.payload'),/Wade keeps personal wishes private/);
    f.ctx.chat.push({is_user:false,mes:'He answers briefly.'},{is_user:true,mes:'They continue.'});
    await f.run('runJudge({force:true})');
    if(!requests.at(-1).state.registered_people?.some(person=>person.id==='wade'))failures.push('continuing participant lost when only pronouns remain');
    scenario.participant='unclear';
    await f.run('runJudge({force:true})');
    assert.match(f.run('record().lastJudgment.payload'),/Wade keeps personal wishes private/,'uncertain participation preserves a previously confirmed participant');
    scenario.participant='yes';scenario.level='0';scenario.phase='ended';
    await f.run('runJudge({force:true})');
    assert.ok(requests.at(-1).state.character_profiles?.people.some(person=>person.id==='wade'),'a continuing participant reaches the ordinary selector when injection resumes');
    f.ctx.chat.push({is_user:true,mes:'Wade leaves the interaction.'});
    scenario.participant='no';scenario.level='3';scenario.phase='active';
    await f.run('runJudge({force:true})');
    if(f.run('record().lastJudgment.payload').includes('Wade keeps personal wishes private'))failures.push('explicitly absent participant reference retained');
}
{
    const {f}=setup();
    await f.run('runJudge({force:true})');
    const before=f.run('record().lastJudgment.payload');
    f.ctx.chat.push({is_user:false,mes:'A newly generated alternative.'});
    await f.run("rollbackChangedOutput(1,'swiped')");
    assert.equal(f.run('record().sceneIntimacy.route'),'paused','swiping only a new output preserves the unchanged input judgment');
    assert.equal(f.run('record().lastJudgment.payload'),before);
    f.run('characterStore.enabled=false;');
    await f.run('runJudge({force:true})');
    assert.doesNotMatch(f.run('record().lastJudgment.payload'),/Wade keeps personal wishes private/,'disabled character analysis contributes no stored reference');
}
for(const kind of ['edited','deleted','swiped']) {
    const {f}=setup();
    await f.run('runJudge({force:true})');
    f.run('messageSnapshots.set(stateChatKey(),messageSnapshot(getContext().chat));');
    if(kind==='deleted')f.ctx.chat=[];
    else f.ctx.chat[0].mes='An ordinary conversation without the earlier activity.';
    await f.run(`rollbackChangedOutput(0,'${kind}')`);
    if(f.run('record().sceneIntimacy?.route')==='paused')failures.push(`${kind} source kept the previous paused state`);
    if(f.run('record().lastJudgment?.payload'))failures.push(`${kind} source kept stale injection`);
}
assert.deepEqual(failures,[]);
{
    const {f}=setup();
    await f.run('runJudge({force:true})');
    f.run('stateHistoryCache.set(stateChatKey(),[{assistantIndex:0,before:reversibleStateSnapshot(record())}]);');
    f.ctx.chat[0].mes='Changed source';
    await f.run("rollbackChangedOutput(0,'edited')");
    assert.equal(f.run('record().sceneIntimacy'),null,'history restoration must not resurrect invalid scene evidence');
}
console.log('Scene gate runtime passed: participant continuity, explicit absence, and source edit/delete/swipe invalidation.');
