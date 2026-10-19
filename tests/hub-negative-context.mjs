import assert from 'node:assert/strict';
import {negativeContext} from '../src/decision/negative-context.js';
import {LEGACY_PROMPTS} from '../src/decision/legacy-prompts.js';
import {coordinateDecisions} from '../src/scene/coordinator.js';
import {commitObservedState} from '../src/scene/state-effects.js';
import {normalizeDevelopmentPreferences,buildInjection} from '../prompt-library.js';
import {fixture} from './regression/audit-v012.mjs';
assert.deepEqual(negativeContext({negativePriority:true}),{},'priority does not enable other settings');
for(const direction of ['dynamic','positive','hostile'])for(const priority of [true,false]){
    const context=negativeContext({relationshipDirection:direction,negativePriority:priority});
    if(direction==='hostile')assert.deepEqual(context.active_negative_directives.originals,{CHARACTER_TO_USER_DEFAULT:LEGACY_PROMPTS.CHARACTER_TO_USER_DEFAULT});else assert.deepEqual(context,{});
}
for(const counter of ['clear','limited','mixed','unclear','none'])for(const pace of ['closer_incremental','closer_significant','hold']){
    const preferences=normalizeDevelopmentPreferences({relationshipDirection:'hostile',negativePriority:true});
    const rec={preferences,pacingState:{relationship:{closer:4,distant:0,evidence:[]}},relationshipState:{romance:'established'},sceneState:{}};
    const decisions={relationship_pacing:pace,counterevidence:counter,relationship_beat:'repair',relationship_motion:'closer'};
    coordinateDecisions(rec,{},decisions);
    assert.equal(decisions.relationship_beat,'repair','repair attempt survives');
    if(counter==='clear'&&pace.startsWith('closer'))assert.equal(decisions.relationship_pacing,'hold');
    if(['none','unclear'].includes(counter))assert.equal(decisions.relationship_pacing,pace,'uncertainty is not a gate');
    commitObservedState(rec,decisions,'evidence');assert.equal(rec.relationshipState.romance,'established','do not erase existing affection');
    assert.equal(rec.pacingState.relationship.closer,counter==='clear'?4:5);
    const payload=buildInjection({settings:preferences,decisions});
    assert.ok(payload.includes(LEGACY_PROMPTS.CHARACTER_TO_USER_DEFAULT));
    assert.match(payload,/repair/i);
}
const f=fixture(),requests=[];
f.ctx.chat=[{is_user:true,mes:'We still disagree about that promise.'}];
f.run("record(true);record().preferences.relationshipDirection='hostile';record().preferences.negativePriority=true;");
f.sandbox.capture=async request=>{requests.push(request);return {answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>[key,q.type==='noul'?{noul:.3}:{choice:Object.keys(q.criteria)[0]}]))};};
f.run('callJev=capture');await f.run('runJudge({force:true})');
const main=requests.find(request=>request.state.character_profiles!==undefined);
assert.equal(main.state.active_negative_directives.originals.CHARACTER_TO_USER_DEFAULT,LEGACY_PROMPTS.CHARACTER_TO_USER_DEFAULT);
assert.equal(requests.length,2,'no additional reviewer calls');
console.log('Negative-context checks passed: actual original supplied, scoped settings, no extra calls, uncertainty allows action, repair is not automatic acceptance.');
