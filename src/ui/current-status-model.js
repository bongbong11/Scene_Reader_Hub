// A read-only projection of diagnostic events. Never starts requests or changes Hub state.
const ROWS = {
    embedding:'임베딩 생성·확인', search:'관련 기록 검색', scene:'Jev 장면 확인',
    decision:'Jev 인물·전개 판정', profile:'연결모델', storage:'저장소',
    preparation:'주입 준비', delivery:'실제 요청 포함', execution:'판독 실행',
};
const BAD = new Set(['failed','degraded','warning']);
const normalize = value => value==='started'?'running':BAD.has(value)?'failed':value==='succeeded'?'success':value==='cancelled'?'cancelled':'idle';
const errorCode = event => /^[A-Z][A-Z0-9_]{0,70}$/.test(event.errorKind || '') ? event.errorKind : '';

function advice(id,event) {
    const code=errorCode(event);
    if (/CREDENTIAL|AUTH|FORBIDDEN/.test(code) || [401,403].includes(event.httpStatus)) return '설정에서 발급처와 저장된 키를 확인해 주세요.';
    if (/RATE|QUOTA/.test(code) || event.httpStatus===429) return '사용 한도와 요금을 확인한 뒤 잠시 후 다시 시도해 주세요.';
    if(id==='embedding')return '상단 임베딩 재시도로 누락된 기록을 다시 처리하세요. 정상 완료된 기록은 재사용합니다.';
    if(id==='search')return '검색 실패 시 단어 매칭으로 진행합니다. 연결을 확인한 뒤 판독을 다시 시도하세요. 전체 재생성은 필요하지 않을 수 있습니다.';
    if(id==='scene'||id==='decision')return /TIMEOUT/.test(code)?'제브 응답 시간이 초과됐습니다. 잠시 후 판독을 다시 시도해 주세요.':'제브 판정 응답을 확인하지 못했습니다. 연결 확인 또는 전체 로그 복사를 이용하세요.';
    if(id==='profile')return '설정의 확장 연결모델 프로필과 연결을 확인해 주세요.';
    if(id==='storage')return '저장 성공을 확인하지 못했습니다. 저장소 연결을 확인해 주세요.';
    if(id==='delivery'||id==='preparation')return '주입 위치와 프리셋 기준 항목을 확인해 주세요. 상세 원인은 전체 로그로 확인할 수 있습니다.';
    return '이번 실행을 완료하지 못했습니다. 전체 로그를 복사해 실패 원인을 확인해 주세요.';
}

export function createCurrentStatusModel({getProfileUsage = () => ({})} = {}) {
    let entries=new Map(),cycleId='',settled=false,valid=false;
    const pendingFailures=new Map();
    function reset() {entries.clear();pendingFailures.clear();cycleId='';settled=false;valid=false;}
    function rememberFailures(id) {
        for(const row of entries.values())if(row.state==='failed' && (!id||row.id===id))pendingFailures.set(row.id,row);
    }
    function set(id,event,{key='',state=normalize(event.status),message='',sticky=true}={}) {
        const identity=`${id}:${key}`,prior=entries.get(identity);
        // A later small connection test or another bank's success must not hide a failure.
        if(sticky && prior?.state==='failed' && state!=='failed')return;
        entries.set(identity,{id,state,message:message || (state==='failed'?advice(id,event):''),code:errorCode(event),at:event.at || ''});
        if(entries.size>256)entries.delete(entries.keys().next().value);
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
        if(event.code==='INVALIDATED') {valid=false;finishPending('cancelled');return;}
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
            if(event.status==='succeeded')pendingFailures.delete('embedding');
            set('embedding',event,{key:'maintenance',message:event.status==='succeeded'?`확인 완료 · 재사용 ${event.reusedCount || 0}개 · 생성 ${event.generatedCount || 0}개`:''});return;
        }
        if(event.stage==='retrieval_request') {
            if(event.phase==='connection_test')return; // A test does not verify the current record bank.
            const id=event.phase==='query'?'search':'embedding';
            const message=event.status==='succeeded'?(event.phase==='list'?'저장 색인 확인 완료':event.phase==='query'?'관련 기록 검색 완료':event.phase==='insert'?'요청한 기록 저장 응답 확인':'색인 정리 완료'):'';
            set(id,event,{key:`${event.bankHash || ''}:${event.phase}`,message});return;
        }
        if(event.stage==='jev_request') {
            set(event.requestKind==='scene'?'scene':'decision',event,{message:event.status==='degraded'?'일부 판정 응답이 누락되거나 형식이 맞지 않습니다. 전체 로그를 확인해 주세요.':''});return;
        }
        if(event.stage==='profile_request') {if(!event.testing)set('profile',event);return;}
        if(event.stage==='auxiliary_usage') {
            const messages = {
                no_completed_output:'분석할 완성된 응답이 없습니다.', no_rp_output:'이번 출력은 RP 분석 대상이 아닙니다.',
                analysis_disabled:'보조 분석 기능을 사용하지 않습니다.', no_continuity_change:'연속성 추가 분석 조건에 해당하지 않아 호출하지 않았습니다.',
                profile_not_configured:'설정에서 확장 연결모델 프로필을 선택해 주세요.', already_analyzed:'이 출력은 이미 분석했습니다. 중복 호출하지 않습니다.',
                analysis_in_progress:'보조 분석을 이미 진행 중입니다. 중복 호출하지 않습니다.',
            };
            set('profile',event,{state:event.status==='failed'?'failed':event.status==='running'?'running':event.status==='needs_setup'?'needs_setup':'not_needed',message:messages[event.reasonCode] || '이번 실행에서는 추가 분석을 호출하지 않았습니다.'});return;
        }
        if(event.stage==='auxiliary_result' && event.status==='partial') {set('profile',event,{state:'partial',message:'모델은 응답했지만 일부 분석 결과를 확인하지 못했습니다.'});return;}
        if(event.stage==='storage_resolution'&&event.status==='succeeded'){set('storage',event,{key:event.phase||'',sticky:false,message:'실제 저장 완료를 다시 확인했습니다.'});pendingFailures.delete('storage');return;}
        if(event.stage==='storage_request') {set('storage',event,{key:event.phase || ''});return;}
        if(event.code==='PROMPT_REGISTERED') {
            set('preparation',event,{state:'success',message:'주입문 등록 완료 · 실제 요청 포함은 아직 확인 전입니다.'});
            set('delivery',event,{state:event.payloadChars || event.worldChars?'idle':'skipped',message:event.payloadChars || event.worldChars?'생성 요청 전송 시 확인합니다.':'이번 판독에서 추가할 주입문이 없습니다.',sticky:false});return;
        }
        if(event.code==='PROMPT_OBSERVED') {
            const expected=[event.scene,event.world].filter(value=>value && value!=='not_expected');
            const missing=expected.includes('unconfirmed');
            const confirmed=expected.length>0 && expected.every(value=>value==='confirmed');
            set('delivery',event,{state:missing?'failed':event.phase==='request'&&confirmed?'success':'idle',
                message:missing?'요청에서 주입문 전체를 찾지 못했습니다. 주입 위치와 프리셋을 확인해 주세요.':event.phase==='request'&&confirmed?'실제 전송 요청에 주입문 포함 확인':'아직 실제 전송 요청 포함을 확인하지 못했습니다.',sticky:false});return;
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
            if (id === 'profile' && !selected) {
                let usage = {};
                try { usage = getProfileUsage() || {}; } catch { /* Optional extension status cannot break the UI. */ }
                return {id,label,state:usage.enabled && !usage.configured?'needs_setup':usage.enabled?'not_needed':'unused',message:usage.enabled && !usage.configured?'설정에서 확장 연결모델 프로필을 선택해 주세요.':usage.enabled?'이번 실행에서 보조 분석을 호출하지 않았습니다.':'보조 분석 기능을 사용하지 않습니다.'};
            }
            return {id,label,state:'idle',message:'이번 실행에서 아직 확인하지 않았거나 사용하지 않는 항목입니다.',...selected};
        });
        const failed=rows.some(row=>row.state==='failed');
        const delivered=rows.find(row=>row.id==='delivery');
        const complete=valid&&settled&&!rows.some(row=>row.state==='running')&&['success','skipped'].includes(delivered.state);
        if(complete&&!failed)pendingFailures.clear();
        if(pendingFailures.size){
            const previous=pendingFailures.values().next().value;
            rows.push({...previous,id:'previous',label:'이전 실패 · 복구 확인 중',message:`${ROWS[previous.id]} · ${previous.message}`});
        }
        return {tone:failed||pendingFailures.size?'error':complete?'success':'neutral',rows};
    }
    return {accept,snapshot,reset};
}
