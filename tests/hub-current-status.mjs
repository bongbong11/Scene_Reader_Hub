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
assert.ok(model.snapshot().rows.filter(item=>item.id!=='continuity').every(item=>item.state==='idle'));
assert.equal(row('continuity').state,'not_run');
assert.equal(row('profile'),undefined);assert.equal(row('emotion'),undefined);
{
    let enabled=true;
    const view=createCurrentStatusModel({getContinuityEnabled:()=>enabled});
    const get=id=>view.snapshot().rows.find(row=>row.id===id);
    view.accept({code:'RUN_STARTED'});
    for(const event of [
        {stage:'profile_request',status:'succeeded',testing:true},
        {stage:'profile_request',status:'failed',errorKind:'PROFILE_NETWORK_ERROR'},
        {stage:'character_state_capture',status:'collected'},
        {stage:'character_state_capture',status:'failed'},
        {stage:'history_analysis',status:'failed'},
        {stage:'auxiliary_usage',status:'waiting',reasonCode:'interval_pending',turnCount:2,requiredTurns:3},
        {stage:'analysis_manual',status:'running'},
    ])view.accept(event);
    assert.equal(get('continuity').state,'waiting');
    assert.equal(get('delivery').state,'idle');
    assert.equal(view.snapshot().tone,'neutral','unrelated calls cannot become continuity or injection errors');
    for(const stage of ['analysis_started','analysis_result','analysis_failed'])view.accept({stage,status:'succeeded',continuityIncluded:false});
    assert.equal(get('continuity').state,'waiting','vault-only calls cannot replace continuity waiting state');
    view.accept({stage:'analysis_started',continuityIncluded:true});
    assert.equal(get('continuity').state,'running');
    view.accept({stage:'analysis_result',status:'succeeded',acceptedCount:0,continuityIncluded:true});
    assert.equal(get('continuity').state,'success','valid zero findings is still completed analysis');
    assert.equal(get('delivery').state,'idle','analysis completion cannot prove injection');
    view.accept({stage:'auxiliary_usage',status:'not_needed',reasonCode:'already_analyzed'});
    assert.equal(get('continuity').state,'success','duplicate notice cannot erase completion');
    view.accept({code:'RUN_STARTED'});
    assert.equal(get('continuity').state,'not_run','new execution does not reuse old success');
    view.accept({code:'PROMPT_REGISTERED',payloadChars:1});view.accept({code:'RUN_PREPARED'});
    view.accept({code:'PROMPT_OBSERVED',phase:'assembly',scene:'confirmed',character:'unconfirmed'});
    assert.equal(get('delivery').state,'idle');
    view.accept({code:'PROMPT_OBSERVED',phase:'request',scene:'confirmed',character:'unconfirmed'});
    assert.equal(get('delivery').state,'failed','scene inclusion cannot hide missing character block');
    view.accept({code:'PROMPT_OBSERVED',phase:'request',scene:'confirmed',character:'confirmed'});
    assert.equal(get('delivery').state,'success');assert.equal(get('continuity').state,'not_run');
    view.accept({stage:'analysis_started',continuityIncluded:true});
    assert.equal(get('delivery').state,'success');assert.equal(get('continuity').state,'running');
    for(const [code,label] of [
        ['PROFILE_NETWORK_ERROR','연결모델 오류'],['PROFILE_TIMEOUT','연결모델 오류'],
        ['PROFILE_INVALID_RESPONSE','응답 확인 오류'],['CONTINUITY_INVALID_RESPONSE','응답 확인 오류'],
        ['AUXILIARY_STORAGE_FAILED','저장 오류'],['ANALYSIS_CAPACITY','확장 처리 오류'],
        ['ANALYSIS_INPUT_CAPACITY','확장 처리 오류'],['ANALYSIS_BUSY_TIMEOUT','확장 처리 오류'],
        ['ANALYSIS_FAILED','원인 확인 필요'],
    ]){
        view.accept({stage:'analysis_failed',reasonCode:code});
        assert.equal(get('continuity').state,'failed');assert.equal(get('continuity').message,label);
        assert.equal(get('delivery').state,'success','analysis error cannot claim missing injection');
        view.accept({stage:'auxiliary_usage',status:'waiting',reasonCode:'retry_backoff'});
        assert.equal(get('continuity').state,'failed','waiting cannot hide actual error');
    }
    view.accept({stage:'analysis_started'});assert.equal(get('continuity').state,'running');
    view.accept({stage:'analysis_cancelled'});assert.equal(get('continuity').state,'cancelled');
    view.accept({stage:'analysis_started'});
    view.accept({stage:'analysis_result',status:'degraded',reasonCode:'CONTINUITY_INVALID_RESPONSE'});
    assert.equal(get('continuity').state,'failed');
    view.accept({code:'RUN_STARTED'});
    assert.equal(get('continuity').state,'not_run');
    assert.ok(!view.snapshot().rows.some(row=>row.id.startsWith('previous')),'no stale auxiliary errors in new run');
    enabled=false;
    view.accept({stage:'analysis_started'});assert.equal(get('continuity').state,'unused');
    view.reset();enabled=true;assert.equal(get('continuity').state,'not_run');
    view.accept({stage:'auxiliary_usage',status:'needs_setup',reasonCode:'profile_not_configured',continuityIncluded:true});
    assert.equal(get('continuity').state,'failed');assert.equal(get('continuity').message,'연결모델 설정 필요');
}
console.log('Current status: separate injection/continuity evidence, scoped errors, cancellation, repair, privacy and reset passed.');

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
