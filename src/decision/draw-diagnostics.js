export const DRAW_STATUS={
    generation_disabled:'새 생성 꺼짐',selected:'추가 전개 선택',invalid_selection:'신규 선택 응답 오류',blocked_access:'접근 경로 없음',blocked_world:'세계·장면 규칙과 충돌',blocked_user_constraint:'사용자 지시로 제외',blocked_prerequisite:'필요한 사실 근거 없음',request_included:'전송 포함 확인',request_missing:'전송 포함 미확인',request_unobservable:'전송 확인 불가',fulfilled:'본문 반영',partial:'본문 일부 반영',missed:'본문 미반영',
    disabled:'사용 꺼짐',existing_event:'기존 사건 진행 중',judge_declined:'판독에서 새 사건을 선택하지 않음',
    low_confidence:'판정 확신도 기준 미달',context_blocked:'장면 조건에서 제외',element_missing:'사용할 사건 요소 없음',
    budget_deferred:'이번 응답의 다른 진행이 우선됨',chance_failed:'확률 추첨 미통과',
    arrival_not_fit:'현재 장면에 맞는 등장 방식 없음',planned:'주입할 계획 준비 · 실제 발생은 답변 확인 후',
};

export function drawDiagnostics(frame) {
    if(frame.opportunityPlan)return {key:frame.opportunityPlan.key,retry:'같은 응답의 재판독·리롤은 동일 추첨입니다.',...Object.fromEntries(['event','person'].map(feature=>{const item=frame.opportunityPlan[feature];return [feature,{...item,status:item.status==='selected'?'planned':item.reasonCode}];}))};
    const allowed=new Set(frame.finalPlan.allowedCandidateIds);
    const eventRoll=frame.staged.lastEventRoll;
    const currentRoll=eventRoll?.drawKey===frame.rec.drawOpportunityKey?eventRoll:null;
    const route=frame.details.advanced_route;
    let eventStatus=!frame.prefs.advancedEnabled?'disabled':frame.rec.eventProfile?'existing_event'
        :route?.selected!=='create'?'judge_declined':route.fallbackApplied?'low_confidence'
        :frame.beforeBudgetDecisions.advanced_route!=='create'?'context_blocked'
        :frame.beforeBudgetDecisions.advanced_element==='none'?'element_missing'
        :!frame.proposedIds.has('advanced_event')?'budget_deferred'
        :currentRoll?.passed===false?'chance_failed'
        :allowed.has('advanced_event')?'planned':'budget_deferred';
    const offer=frame.rec.appearanceOffer,arrival=frame.details.arrival_mode;
    const personStatus=!offer?.passed?'chance_failed':arrival?.selected==='none'?'arrival_not_fit'
        :arrival?.fallbackApplied?'low_confidence'
        :allowed.has(offer.kind==='villain'?'villain':'npc')&&frame.decisions[offer.kind==='villain'?'villain_route':'npc_route']==='create'?'planned':'budget_deferred';
    return {key:frame.rec.drawOpportunityKey,retry:'새 RP 입력·답변으로 다음 응답이 시작되면 새 기회. 같은 응답 재판독·리롤은 동일 추첨.',
        event:{status:eventStatus,reason:route?.rule||'',chance:currentRoll?.chance??null,roll:currentRoll?.roll??null},
        person:{status:personStatus,kind:offer?.kind||'npc',chance:offer?.chance??null,roll:offer?.roll??null,reason:arrival?.rule||''}};
}

export function drawStatusText(item) {
    if(!item)return '판정 기록 없음';
    return `${DRAW_STATUS[item.status]||item.status}${item.roll!=null?` · 추첨 ${item.roll} / 설정 ${item.chance}%`:''}`;
}
