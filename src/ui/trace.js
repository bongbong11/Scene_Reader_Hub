import { executionReport } from '../debug/execution-report.js';
const LABELS={context:'입력 확인',scene:'장면·세계관 확인',retrieval:'인물 기록 검색',decision:'장면 판독',policy:'사건·인물 선택', 'injection.assemble':'주입문 조립','storage.inject':'저장·주입 등록','injection.consume':'전송문 확인','injection.slot':'프리셋 위치 주입',complete:'준비 완료',lifecycle:'실행 관리'};
const SLOT_REASONS={prompt_missing:'기준 항목 없음',prompt_disabled:'기준 항목 꺼짐',content_not_found:'기준 내용 못 찾음',ambiguous_content:'기준 내용 중복'};
const slotText=item=>`${item.kind==='scene'?'장면':'세계관'} ${item.identifier} ${item.side==='before'?'앞':'뒤'} · ${item.resultStatus==='missing'?(SLOT_REASONS[item.reason] || '주입 실패'):item.phase==='send'?'전송문 포함':'삽입 준비'}`;
const STATES={idle:'대기',running:'진행 중',prepared:'주입 준비됨',skipped:'건너뜀',cancelled:'취소됨',failed:'확인 필요'};
const RECEIPTS={confirmed:'포함 확인',unconfirmed:'포함 미확인',unavailable:'요청 확인 불가',unverifiable:'동적 매크로 확인 불가',not_expected:'주입 없음'};
export function createTraceView({hub,document,copyText,judgmentFailureState=()=>null,getSettings=()=>({}),isDeveloperMode=()=>false,version='0.1.19-storage2-recovery'}) {
    function render() {
        const warning=document.getElementById('sr-failure-stop'),failure=judgmentFailureState();
        if(warning){warning.hidden=!failure;warning.textContent=failure?.message || '';}
        const panel=document.getElementById('sr-hub-trace-panel');
        if(panel){panel.hidden=!isDeveloperMode();if(panel.hidden)panel.open=false;}
        const status=document.getElementById('sr-hub-run-status'),output=document.getElementById('sr-hub-run-trace');
        if(!status||!output)return;
        const {state,events}=hub.snapshot();
        status.textContent=`${STATES[state.status]||state.status} · ${LABELS[state.stage]||state.stage||'판독 대기'}${state.cycleId?' · '+state.cycleId:''}`;
        output.textContent=events.slice(-45).map(e=>`${e.at.slice(11,19)} ${e.cycleId||'-'} ${LABELS[e.stage]||e.stage} · ${e.code}${e.module?' · '+e.module:''}${e.durationMs?' · '+e.durationMs+'ms':''}${e.scene?' · 장면 '+(RECEIPTS[e.scene]||e.scene):''}${e.world?' · 세계관 '+(RECEIPTS[e.world]||e.world):''}${e.stage==='injection.slot' && e.kind?' · '+slotText(e):''}${e.error?' · '+e.error:''}${e.exclusions?' · '+e.exclusions.join(' / '):''}`).join('\n')||'아직 실행 기록이 없습니다.';
    }
    function bind() {
        document.getElementById('sr-hub-copy-trace')?.addEventListener('click',()=>{void copyText(JSON.stringify(executionReport({hub,failureStop:judgmentFailureState(),settings:getSettings(),version}),null,2)).catch(()=>{const status=document.getElementById('sr-hub-run-status');if(status)status.textContent='실행 기록을 복사하지 못했습니다.';});});
        render();
    }
    const unsubscribe=hub.subscribe(render);
    return {bind,render,dispose:unsubscribe};
}
