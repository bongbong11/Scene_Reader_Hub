// A read-only projection of diagnostic events. Never starts requests or changes Hub state.
import {analysisFailureTitle} from '../continuity/failure.js';
const ROWS = {
    embedding:'임베딩 생성·확인', search:'관련 기록 검색', scene:'Jev 장면 확인',
    decision:'Jev 인물·전개 판정', continuity:'연속성 추론', storage:'저장소',
    preparation:'주입 준비', delivery:'실제 주입', execution:'판독 실행',
};
const BAD = new Set(['failed','degraded','warning']);
const AUXILIARY = new Set(['continuity']);
const normalize = value => value==='started'?'running':BAD.has(value)?'failed':value==='succeeded'?'success':value==='cancelled'?'cancelled':'idle';
const errorCode = event => /^[A-Z][A-Z0-9_]{0,70}$/.test(event.errorKind || '') ? event.errorKind : '';

function advice(id,event) {
    const code=errorCode(event);
    if(code==='EMBEDDING_BUSY')return '앞선 임베딩 작업이 아직 끝나지 않았습니다. 잠시 후 다시 시도하세요.';
    if(code==='EMBEDDING_DIMENSION_MISMATCH')return '현재 모델과 저장된 벡터의 차원이 다릅니다. 해당 자료의 임베딩을 다시 준비하세요.';
    if (/CREDENTIAL|AUTH|FORBIDDEN/.test(code) || [401,403].includes(event.httpStatus)) return '설정에서 발급처와 저장된 키를 확인해 주세요.';
    if (/RATE|QUOTA/.test(code) || event.httpStatus===429) return '사용 한도와 요금을 확인한 뒤 잠시 후 다시 시도해 주세요.';
    if(id==='embedding')return '상단 임베딩 재시도로 누락된 기록을 다시 처리하세요. 정상 완료된 기록은 재사용합니다.';
    if(id==='search')return '검색 실패 시 단어 매칭으로 진행합니다. 연결을 확인한 뒤 판독을 다시 시도하세요. 전체 재생성은 필요하지 않을 수 있습니다.';
    if(id==='scene'||id==='decision')return /TIMEOUT/.test(code)?'제브 응답 시간이 초과됐습니다. 잠시 후 판독을 다시 시도해 주세요.':'제브 판정 응답을 확인하지 못했습니다. 연결 확인 또는 전체 로그 복사를 이용하세요.';
    if(id==='storage')return event.httpStatus===409?'저장 내용이 변경되어 충돌했습니다. 최신 저장 상태를 확인한 뒤 다시 시도하세요.':event.httpStatus?'저장소가 요청을 처리하지 못했습니다. 오류 코드와 저장 상태를 확인해 주세요.':'저장소 응답을 확인하지 못했습니다. 연결과 저장 상태를 확인해 주세요.';
    if(id==='delivery'||id==='preparation')return '주입 위치와 프리셋 기준 항목을 확인해 주세요. 상세 원인은 전체 로그로 확인할 수 있습니다.';
    return '이번 실행을 완료하지 못했습니다. 전체 로그를 복사해 실패 원인을 확인해 주세요.';
}

function continuityError(event) {
    const code=event.reasonCode || errorCode(event);
    if(code==='CONTINUITY_PARTIAL_RESULT')return '일부 항목 처리 필요 · 정상 항목은 반영';
    if(event.phase)return analysisFailureTitle(event);
    if (/STORAGE|SAVE/.test(code)) return '저장 오류';
    if (/INVALID_RESPONSE|INVALID_JSON|RESPONSE_FORMAT/.test(code)) return '응답 확인 오류';
    if (/^PROFILE_/.test(code)) return '연결모델 오류';
    if (/^ANALYSIS_(?:INPUT_CAPACITY|CAPACITY|BUSY_TIMEOUT)$/.test(code)) return '확장 처리 오류';
    return '원인 확인 필요';
}

export function createCurrentStatusModel({getContinuityEnabled = () => true} = {}) {
    let entries=new Map(),cycleId='',settled=false,valid=false,sharedSearch='';
    const pendingFailures=new Map();
    function reset() {entries.clear();pendingFailures.clear();cycleId='';settled=false;valid=false;sharedSearch='';}
    function rememberFailures(id) {
        for(const [key,row] of entries)if(row.state==='failed' && !AUXILIARY.has(row.id) && (!id||row.id===id))pendingFailures.set(key,row);
        while(pendingFailures.size>256)pendingFailures.delete(pendingFailures.keys().next().value);
    }
    function set(id,event,{key='',state=normalize(event.status),message='',sticky=true}={}) {
        const identity=`${id}:${key}`,prior=entries.get(identity);
        // A later small connection test or another bank's success must not hide a failure.
        if(sticky && prior?.state==='failed' && state!=='failed')return;
        entries.set(identity,{id,state,message:message || (state==='failed'?advice(id,event):''),code:errorCode(event),scope:event.storageScope||'',phase:event.phase||'',at:event.at || ''});
        if(entries.size>256)entries.delete([...entries].find(([,row])=>row.state!=='failed'&&row.state!=='running')?.[0]||entries.keys().next().value);
    }
    function finishPending(state) {
        for(const [key,value] of entries)if(value.state==='running')entries.set(key,{...value,state,message:state==='cancelled'?'이번 작업이 중단됐습니다.':'이후 단계는 실행하지 않았습니다.'});
    }
    function accept(event) {
        if(event.code==='RUN_STARTED') {
            rememberFailures();entries.clear();settled=false;cycleId=event.cycleId;valid=true;
            set('execution',event,{state:'running'});return;
        }
        if(cycleId && event.cycleId && event.cycleId!==cycleId)return;
        if(event.code==='INVALIDATED') {
            valid=false;settled=false;finishPending('cancelled');
            for(const [key,row] of entries)if(['delivery','preparation','continuity'].includes(row.id)&&!['failed','partial'].includes(row.state))entries.delete(key);
            return;
        }
        if(event.code==='RUN_CANCELLED') {valid=false;finishPending('cancelled');set('execution',event,{state:'cancelled',sticky:false});return;}
        if(event.code==='RUN_SKIPPED') {valid=false;finishPending('skipped');set('execution',event,{state:'skipped',message:'이번 입력은 판독 대상이 아닙니다.',sticky:false});return;}
        if(event.code==='RUN_PREPARED') {
            settled=true;set('execution',event,{state:'success',message:'판독 완료 · 실제 요청 포함 여부는 아래에서 별도 확인합니다.'});return;
        }
        if(event.stage==='embedding_rebuild') {
            if(event.status==='started'){
                rememberFailures('embedding');
                for(const [key,row] of entries)if(row.id==='embedding')entries.delete(key);
            }
            if(event.status==='succeeded')for(const [key,row] of pendingFailures)if(row.id==='embedding')pendingFailures.delete(key);
            set('embedding',event,{key:'maintenance',message:event.status==='succeeded'?`확인 완료 · 재사용 ${event.reusedCount || 0}개 · 생성 ${event.generatedCount || 0}개`:''});return;
        }
        if(event.stage==='retrieval_request') {
            if(event.phase==='shared_search'){sharedSearch=event.code==='SHARED_VECTOR_ENABLED'?'공유 검색':'기존 검색 · 공유 검색은 플러그인 업데이트와 호스트 지원이 필요합니다.';return;}
            if(event.phase==='scene_vector'){set('embedding',event,{key:'scene-vector',message:event.cache==='miss'?'장면 임베딩 생성 완료':'장면 임베딩 재사용'});return;}
            if(event.phase==='connection_test')return; // A test does not verify the current record bank.
            if(event.phase==='index_sync'&&event.status==='deferred') {
                if(event.code==='EMBEDDING_PREPARE_ON_SEARCH'){set('embedding',event,{key:`${event.bankHash||''}:pending`,state:'idle',message:'해당 자료를 검색할 때 필요한 임베딩을 확인하고 준비합니다.'});return;}
                set('embedding',event,{key:`${event.bankHash||''}:pending`,state:'needs_setup',message:'임베딩 재시도로 준비할 기록이 있습니다. 이번 판독은 기록 매칭으로 진행합니다.'});return;
            }
            const id=event.phase==='query'?'search':'embedding';
            const message=event.status==='succeeded'?(event.phase==='list'?'저장 색인 확인 완료':event.phase==='query'?`관련 기록 검색 완료${sharedSearch?' · '+sharedSearch:''}`:event.phase==='insert'?'요청한 기록 저장 응답 확인':'색인 정리 완료'):'';
            set(id,event,{key:`${event.bankHash || ''}:${event.phase}`,message});return;
        }
        if(event.stage==='jev_request') {
            set(event.requestKind==='scene'?'scene':'decision',event,{message:event.status==='degraded'?'일부 판정 응답이 누락되거나 형식이 맞지 않습니다. 전체 로그를 확인해 주세요.':''});return;
        }
        if(['history_analysis','profile_request','character_state_capture','auxiliary_result','analysis_vault'].includes(event.stage))return;
        if(event.stage==='visibility') {set('preparation',event,{state:event.status==='failed'?'failed':'skipped',sticky:false,message:event.status==='failed'?'숨김 반영 실패 · 다음 실행 전에 확인해 주세요.':'가시성 변경 반영 · 이전 주입은 해제했습니다.'});return;}
        // Transport/capture events cannot prove that continuity actually ran.
        if(event.stage?.startsWith('analysis_') || event.stage==='auxiliary_usage') {
            if(event.continuityIncluded===false || !getContinuityEnabled())return;
            if(event.stage==='analysis_started') {
                set('continuity',event,{state:'running',sticky:false});return;
            }
            if(event.stage==='analysis_failed' || event.stage==='analysis_result' && event.status==='degraded') {
                if(event.reasonCode==='ANALYSIS_CANCELLED') {
                    set('continuity',event,{state:'cancelled',sticky:false});return;
                }
                set('continuity',{...event,errorKind:event.reasonCode || event.errorKind},{state:event.reasonCode==='CONTINUITY_PARTIAL_RESULT'?'partial':'failed',sticky:false,message:continuityError(event)});return;
            }
            if(event.stage==='analysis_result') {
                set('continuity',event,{state:event.status==='succeeded'?'success':'cancelled',sticky:false});return;
            }
            if(event.stage==='analysis_cancelled') {
                set('continuity',event,{state:'cancelled',sticky:false});return;
            }
            if(event.stage==='auxiliary_usage' && event.reasonCode==='profile_not_configured') {
                set('continuity',event,{state:'failed',message:'연결모델 설정 필요'});return;
            }
            if(event.stage==='auxiliary_usage'&&event.status==='waiting'){set('continuity',event,{state:'waiting',sticky:event.reasonCode!=='awaiting_completed_turn',message:event.reasonCode==='awaiting_completed_turn'?'미처리 내용 대기 · 다음 답변 완료 시 수집':'재시도 대기 · 이전 자료 보존'});return;}
            // Duplicate notices do not replace an actual result.
            return;
        }
        if(event.stage==='storage_resolution'&&event.status==='succeeded'){
            // Commit readback verifies this operation, not every failed storage request.
            const key=event.storageScope||event.phase||'';
            for(const [identity,row] of entries)if(row.id==='storage'&&(event.storageScope?row.scope===event.storageScope:!row.scope&&row.phase===event.phase))entries.delete(identity);
            for(const [identity,row] of pendingFailures)if(row.id==='storage'&&(event.storageScope?row.scope===event.storageScope:!row.scope&&row.phase===event.phase))pendingFailures.delete(identity);
            set('storage',event,{key,sticky:false,message:'실제 저장 완료를 다시 확인했습니다.'});return;
        }
        if(event.stage==='storage_request') {
            const recovered=event.status==='succeeded'&&Boolean(event.storageScope);
            if(recovered)for(const [key,row] of pendingFailures)if(row.id==='storage'&&row.scope===event.storageScope)pendingFailures.delete(key);
            set('storage',event,{key:event.storageScope||event.phase||'',sticky:!recovered});return;
        }
        if(event.code==='PROMPT_REGISTERED') {
            set('preparation',event,{state:'success',message:'주입문 등록 완료 · 실제 요청 포함은 아직 확인 전입니다.'});
            set('delivery',event,{state:event.payloadChars || event.worldChars?'idle':'skipped',message:event.payloadChars || event.worldChars?'생성 요청 전송 시 확인합니다.':'이번 판독에서 추가할 주입문이 없습니다.',sticky:false});return;
        }
        if(event.code==='PROMPT_OBSERVED') {
            const expected=[event.scene,event.world,event.character,event.state].filter(value=>value && value!=='not_expected');
            const missing=event.phase==='request'&&expected.includes('unconfirmed');
            const confirmed=expected.length>0 && expected.every(value=>value==='confirmed');
            set('delivery',event,{state:missing?'failed':event.phase==='request'&&confirmed?'success':'idle',
                message:expected.length===0&&(event.sceneSuppressed||event.worldSuppressed)?'주입 항목 꺼짐 · 전달 제외':missing?'요청에서 주입문 전체를 찾지 못했습니다. 주입 위치와 프리셋을 확인해 주세요.':event.phase==='request'&&confirmed?'실제 전송 요청에 주입문 포함 확인':'아직 실제 전송 요청 포함을 확인하지 못했습니다.',sticky:false});return;
        }
        if(event.stage==='injection.slot' && (event.resultStatus==='missing'||event.code==='PRESET_SLOT_SEND_ERROR')) {
            set('preparation',event,{state:'failed'});return;
        }
        if(event.code==='ADDITION_RECEIPT' && event.status==='degraded') {set('delivery',event,{state:'failed'});return;}
        if(event.code==='STAGE_STARTED'||event.code==='STAGE_FINISHED')return;
        // The UI catch logs the same request failure again. Keep it on its own
        // repairable row, so a successful embedding retry can resolve it.
        if(event.stage==='ui_task' && errorCode(event) && [...entries.values()].some(row=>row.state==='failed'&&row.code===errorCode(event)))return;
        if(event.status==='failed'||event.status==='degraded')set('execution',event,{key:event.stage,state:'failed'});
    }
    function snapshot() {
        const values=[...entries.values()];
        const rows=Object.entries(ROWS).map(([id,label])=>{
            const matches=values.filter(value=>value.id===id);
            const selected=matches.find(value=>value.state==='failed') || matches.find(value=>value.state==='running') || matches.at(-1);
            if(id==='continuity')return {id,label,state:'not_run',message:'',...selected,...(!getContinuityEnabled()?{state:'unused',message:'',code:''}:{})};
            if(id==='delivery' && !selected)return {id,label,state:'idle',message:''};
            return {id,label,state:'idle',message:'이번 실행에서 아직 확인하지 않았거나 사용하지 않는 항목입니다.',...selected};
        });
        const failed=rows.some(row=>row.state==='failed');
        const delivered=rows.find(row=>row.id==='delivery');
        const complete=valid&&settled&&!rows.some(row=>row.id!=='continuity'&&row.state==='running')&&['success','skipped'].includes(delivered.state);
        if(complete&&!failed)for(const [key,row] of pendingFailures)if(!AUXILIARY.has(row.id)&&row.id!=='storage')pendingFailures.delete(key);
        let unresolved=false;
        for(const previous of pendingFailures.values()){
            unresolved=true;
            rows.push({...previous,id:'previous',label:'이전 오류 · 복구 확인 전',message:`${ROWS[previous.id]} · ${previous.message}`});
        }
        return {tone:failed||unresolved?'error':complete?'success':'neutral',rows};
    }
    return {accept,snapshot,reset};
}
