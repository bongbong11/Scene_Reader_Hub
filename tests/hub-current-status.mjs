import assert from 'node:assert/strict';
import {createCurrentStatusModel} from '../src/ui/current-status-model.js';

const model=createCurrentStatusModel();
let cycleId='hub-1';
const emit=(detail)=>model.accept({cycleId,at:'2025-01-01T12:00:00Z',...detail});
const row=id=>model.snapshot().rows.find(item=>item.id===id);
const begin=()=>emit({stage:'lifecycle',code:'RUN_STARTED'});
const prepared=()=>{
    emit({code:'PROMPT_REGISTERED',payloadChars:20,worldChars:0});
    emit({code:'RUN_PREPARED'});
};
const receipt=phase=>emit({code:'PROMPT_OBSERVED',phase,scene:'confirmed',world:'not_expected'});
assert.equal(model.snapshot().tone,'neutral');
begin();
emit({stage:'retrieval_request',phase:'insert',bankHash:'a',status:'succeeded'});
emit({stage:'retrieval_request',phase:'query',bankHash:'a',status:'failed',errorKind:'RETRIEVAL_TIMEOUT'});
emit({stage:'retrieval_request',phase:'query',bankHash:'b',status:'succeeded'});
emit({stage:'jev_request',requestKind:'decision',status:'succeeded'});
prepared();receipt('request');
assert.equal(model.snapshot().tone,'error','fallback failure survives successful judgment/injection and another bank');
assert.match(row('search').message,/단어 매칭/);
assert.equal(row('embedding').state,'success');
emit({stage:'retrieval_request',phase:'connection_test',status:'succeeded'});
assert.equal(model.snapshot().tone,'error','connection tests cannot erase current run failures');
cycleId='hub-2';begin();prepared();
assert.equal(model.snapshot().tone,'error','a retry retains the failed face until recovery is verified');
receipt('assembly');assert.equal(model.snapshot().tone,'error');
receipt('request');assert.equal(model.snapshot().tone,'success');
emit({code:'INVALIDATED'});assert.equal(model.snapshot().tone,'neutral','an invalidated injection cannot stay green');
cycleId='hub-3';begin();
emit({stage:'jev_request',requestKind:'decision',status:'failed',errorKind:'JEV_TIMEOUT'});
emit({stage:'jev_request',requestKind:'decision',status:'succeeded',questionCount:1});
assert.equal(row('decision').state,'failed','a tiny later test does not erase failed judgment');
assert.match(row('decision').message,/응답 시간/);
model.reset();cycleId='hub-4';begin();
emit({stage:'retrieval_request',phase:'insert',status:'started'});
emit({code:'RUN_CANCELLED'});
assert.equal(model.snapshot().tone,'neutral','user cancellation is not a failure');
assert.equal(row('embedding').state,'cancelled');
cycleId='hub-5';begin();
emit({stage:'retrieval_request',phase:'insert',status:'failed',errorKind:'RETRIEVAL_SERVER_ERROR',error:'secret raw chat'});
emit({stage:'embedding_rebuild',status:'failed',errorKind:'RETRIEVAL_SERVER_ERROR'});
emit({stage:'ui_task',status:'failed',errorKind:'RETRIEVAL_SERVER_ERROR'});
assert.match(row('embedding').message,/임베딩 재시도/);
assert.ok(!JSON.stringify(model.snapshot()).includes('secret raw chat'));
emit({stage:'embedding_rebuild',status:'started'});
assert.equal(model.snapshot().tone,'error','maintenance start alone does not clear the failure');
emit({stage:'retrieval_request',phase:'insert',status:'succeeded'});
emit({stage:'embedding_rebuild',status:'succeeded',reusedCount:20,generatedCount:3});
assert.equal(row('embedding').state,'success','explicit maintenance retry can repair the embedding result');
assert.equal(model.snapshot().tone,'neutral','embedding alone does not imply a completed judgment');
prepared();
emit({code:'PROMPT_OBSERVED',phase:'request',scene:'unconfirmed',world:'not_expected'});
assert.equal(model.snapshot().tone,'error');
receipt('request');assert.equal(model.snapshot().tone,'success','a verified final receipt may resolve an earlier assembly mismatch');
model.reset();assert.equal(model.snapshot().tone,'neutral');
assert.ok(model.snapshot().rows.filter(item=>item.id!=='profile').every(item=>item.state==='idle'));
assert.equal(row('profile').state,'unused');
let profileUsage={enabled:true,configured:false};
const profileModel=createCurrentStatusModel({getProfileUsage:()=>profileUsage});
assert.equal(profileModel.snapshot().rows.find(item=>item.id==='profile').state,'needs_setup');
assert.equal(profileModel.snapshot().tone,'neutral','missing optional profile is setup, not a failed request');
profileUsage={enabled:true,configured:true};
assert.equal(profileModel.snapshot().rows.find(item=>item.id==='profile').state,'idle','absence of request events is not proof of no eligible targets');
profileModel.accept({stage:'auxiliary_usage',status:'not_needed',reasonCode:'no_continuity_change'});
assert.match(profileModel.snapshot().rows.find(item=>item.id==='continuity').message,/조건/);
for (const [status, expected] of [['succeeded','success'],['cancelled','cancelled'],['failed','failed']]) {
    profileModel.reset();
    profileModel.accept({stage:'profile_request',status:'started'});
    profileModel.accept({stage:'auxiliary_usage',status:'running',reasonCode:'analysis_in_progress'});
    profileModel.accept({stage:'profile_request',status});
    assert.equal(profileModel.snapshot().rows.find(item=>item.id==='profile').state,expected,'terminal request clears duplicate-running notice');
}
console.log('Current status: embedding/search separation, retained failures, request receipt, cancellation, repair, privacy and reset passed.');

for(const code of ['ANALYSIS_CAPACITY','ANALYSIS_INPUT_CAPACITY','ANALYSIS_BUSY_TIMEOUT','PROFILE_TIMEOUT']){const analysisStatus=createCurrentStatusModel();analysisStatus.accept({stage:'analysis_failed',status:'failed',reasonCode:code});const text=analysisStatus.snapshot().rows.find(r=>r.id==='continuity').message;assert.match(text,code.includes('CAPACITY')?/한도/:code==='ANALYSIS_BUSY_TIMEOUT'?/대기를 종료/:/응답 시간이 초과/);}

{
    const view=createCurrentStatusModel({getProfileUsage:()=>({enabled:true,configured:true})});
    const get=id=>view.snapshot().rows.find(row=>row.id===id);
    view.accept({code:'RUN_STARTED'});
    view.accept({stage:'auxiliary_usage',status:'waiting',reasonCode:'interval_pending',turnCount:2,requiredTurns:3});
    assert.equal(get('continuity').state,'waiting');assert.match(get('continuity').message,/2\/3/);
    view.accept({stage:'character_state_capture',status:'collecting',participantCount:2});
    assert.equal(get('emotion').state,'running');assert.equal(get('continuity').state,'waiting');
    view.accept({stage:'profile_request',status:'failed',errorKind:'PROFILE_NETWORK_ERROR'});
    view.accept({stage:'character_state_capture',status:'request'});
    assert.equal(get('emotion').state,'failed');assert.equal(view.snapshot().tone,'error');
    view.accept({code:'RUN_STARTED'});
    assert.equal(view.snapshot().tone,'neutral','historical optional failure does not mark a new main judgment as failed');
    assert.equal(get('previous-profile').state,'previous_failure');
    view.accept({code:'PROMPT_REGISTERED',payloadChars:1});view.accept({code:'RUN_PREPARED'});
    view.accept({code:'PROMPT_OBSERVED',phase:'assembly',scene:'confirmed',character:'unconfirmed'});
    assert.equal(get('delivery').state,'idle','assembly is not the final macro check');
    view.accept({code:'PROMPT_OBSERVED',phase:'request',scene:'confirmed',character:'unconfirmed'});
    assert.equal(get('delivery').state,'failed','scene inclusion cannot hide a missing character block');
    view.accept({code:'PROMPT_OBSERVED',phase:'request',scene:'confirmed',character:'confirmed'});
    assert.equal(view.snapshot().tone,'success');assert.ok(get('previous-profile'),'main success does not claim recovery of an uncalled model');
    view.accept({stage:'profile_request',status:'succeeded',testing:true});assert.ok(get('previous-profile'),'connection test is not analysis recovery');
    view.accept({stage:'profile_request',status:'succeeded'});assert.equal(get('previous-profile'),undefined);
    assert.ok(get('previous-emotion'),'transport success alone is not valid emotion data');
    view.accept({stage:'character_state_capture',status:'collected',count:2});assert.equal(get('previous-emotion'),undefined);
    view.accept({stage:'character_state_capture',status:'skipped',skipReason:'no_capture_targets'});
    assert.match(get('emotion').message,/명단이 비었습니다/);
    view.accept({stage:'character_state_capture',status:'missing',collectorMode:'main-output'});
    assert.equal(get('emotion').state,'failed');assert.match(get('emotion').message,/주 답변에서 수집/);
}
{
    const view=createCurrentStatusModel();
    view.accept({stage:'retrieval_request',phase:'shared_search',code:'SHARED_VECTOR_UNAVAILABLE',status:'fallback'});
    view.accept({stage:'retrieval_request',phase:'query',status:'succeeded'});
    assert.match(view.snapshot().rows.find(row=>row.id==='search').message,/기존 검색/);
    view.accept({stage:'retrieval_request',phase:'shared_search',code:'SHARED_VECTOR_ENABLED',status:'ready'});
    view.accept({stage:'retrieval_request',phase:'scene_vector',status:'succeeded',cache:'hit'});
    assert.match(view.snapshot().rows.find(row=>row.id==='embedding').message,/재사용/);
    view.accept({stage:'retrieval_request',phase:'query',status:'failed',errorKind:'EMBEDDING_BUSY',httpStatus:429});
    assert.doesNotMatch(view.snapshot().rows.find(row=>row.id==='search').message,/요금|키/);
}
