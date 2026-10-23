// Allowlisted presentation shared by console, copied logs and execution flow.
// Never forward model prose, event objects or host errors.
export const PHASE_LABELS={prepare:'준비',request:'요청',response:'응답 확인',items:'항목 처리',storage:'저장',settings:'설정',cleanup:'정리',commit:'저장 확정',read:'읽기',write:'쓰기',render:'화면 표시',query:'검색',list:'목록 확인',insert:'색인 저장',index_check:'색인 확인',index_sync:'색인 준비',connection_test:'연결 시험',send:'전송',assembly:'조립'};
const receipts={confirmed:'포함 확인',unconfirmed:'포함 미확인',unavailable:'확인 불가',unverifiable:'동적 내용 확인 불가',not_expected:'전달 대상 없음'};
const count=v=>Number.isSafeInteger(v)&&v>=0?v:0;
export function activitySummary(e){
 const row=(category,result,detail={})=>({category,result,detail:{...(Number.isSafeInteger(e.outputIndex)&&e.outputIndex>=0?{대상답변:e.outputIndex}:{}),...detail}});
 switch(e.code){
 case 'STARTUP_READY':return row('시작','초기화 완료',{버전:/^\d+\.\d+\.\d+$/.test(e.version)?e.version:'확인 불가'});
 case 'RUN_STARTED':return row('분석','판독 시작',{방식:e.trigger==='manual'?'수동':'자동'});
 case 'RUN_PREPARED':return row('분석','판독 완료 · 주입 준비');
 case 'RUN_SKIPPED':return row('분석','판독 건너뜀');
 case 'RUN_CANCELLED':case 'PREPARATION_CANCELLED':return row('분석','판독 취소');
 case 'INTERCEPTOR_PREPARATION_REUSED':return row('분석','준비된 판독 재사용');
 case 'SCENE_GATE':{
  const unclear=e.confirmation==='unresolved'||e.gateFailed;
  const result=e.route==='paused'?(unclear?'장면 확인 불가 · 이전 NSFW 중단 유지':e.transition==='entered'?'NSFW 중단 진입':'NSFW 중단 유지'):unclear?'장면 확인 불가 · 기존 경로 유지':e.transition==='exited'?'일반 판독 복귀':'일반 판독 경로';
  return row('주입',result,{판정:'Jev 장면 판정',...(unclear?{코드:'SCENE_STATUS_UNCONFIRMED'}:{}),...(Number.isSafeInteger(e.evidenceIndex)?{근거번호:e.evidenceIndex}:{})});
 }
 case 'SCENE_DELIVERY':return row('주입','NSFW 중단 · 일반 시트 분석·매크로 생성 생략',{인물참고문:Number.isSafeInteger(e.referenceCount)?count(e.referenceCount):'미확인',고정지침:'준비',전송:'확인 전'});
 case 'CHARACTER_DELIVERY_PREPARED':return row('주입','일반 인물 분석 준비',{시트반영:count(e.appliedCount),후보:count(e.candidateCount),저장기록:count(e.storedCount)});
 case 'CHARACTER_MACRO_ROUTE':if(e.phase==='prepare'||e.scenePaused)return null;return row('주입',({macro:'인물 매크로 위치로 전달',missing:'매크로 없음 · 기존 위치로 전달',disabled:'매크로 꺼짐 · 기존 위치로 전달',legacy:'분리 자료 없음 · 기존 위치로 전달',empty:'인물 매크로에 전달할 내용 없음',scene_missing:'일반 주입문 확인 불가 · 매크로 분리 생략'})[e.resultStatus]||'인물 전달 확인 불가');
 case 'PROMPT_OBSERVED':if(e.phase!=='request')return null;return row('주입','실제 전송문 확인',{장면:receipts[e.scene]||'확인 불가',세계관:receipts[e.world]||'확인 불가',인물매크로:receipts[e.character]||'전달 대상 없음'});
 case 'ANALYSIS_STARTED':return e.continuityIncluded===false?null:row('분석','연속성 수집 시작');
 case 'ANALYSIS_RESULT':return e.continuityIncluded===false?null:row('분석',e.status==='degraded'?'연속성 일부 반영 · 미확인 값 보존':'연속성 수집 완료',{반영:count(e.acceptedCount),미확인:count(e.invalidCount)});
 case 'ANALYSIS_CANCELLED':return row('분석','연속성 수집 취소');
 case 'AUXILIARY_USAGE':return row('분석',({retry_backoff:'연속성 재시도 대기',already_analyzed:'이미 수집한 답변 · 재사용',analysis_disabled:'연속성 수집 꺼짐',no_rp_output:'연속성 수집 대상 없음'})[e.reasonCode]||'보조 분석 대기');
 }
 if(e.stage==='character_state_capture'){
  const result=({collecting:'감정 수집 중',collected:'감정 수집 완료',empty:'감정 수집 대상 없음',cancelled:'감정 수집 취소',partial:'감정 일부 수집',incomplete:'감정 일부 미확인'})[e.status];
  return result?row('분석',result,{수집인물:count(e.count)}):null;
 }
 if(e.stage==='profile_settings'&&e.status==='succeeded')return row('저장·설정',e.phase==='settings'?'분석 프로필 설정 저장':'프로필 변경 후 정리 완료');
 if(['jev_request','profile_request'].includes(e.stage)&&e.status==='succeeded')return row('연결',e.stage==='jev_request'?'Jev 응답 수신':'확장 연결모델 응답 수신');
 if(e.stage==='storage_request'&&e.phase==='settings'&&e.status==='succeeded')return row('저장·설정','설정 저장 완료');
 if(e.stage==='retrieval_request'&&e.phase==='index_check'&&e.status==='succeeded'&&e.generatedCount>0)return row('분석','필요한 임베딩 준비 완료',{생성:count(e.generatedCount)});
 return null;
}
