export function opportunityRows(judgment,previous=[]) {
    const plan=judgment?.opportunityPlan;if(!plan)return [];
    const labels={prepared:'주입 준비',request_included:'전송 포함 확인',request_missing:'전송 포함 미확인',request_unobservable:'전송 확인 불가',awaiting_output:'출력 대기',fulfilled:'본문 반영',partial:'본문 일부 반영',missed:'본문 미반영',not_applicable:'본문 확인 불가'};
    const selected=(plan.additions||[]).map(x=>`${x.feature==='event'?'사건':'인물'} · ${labels[x.delivery]||'주입 준비'}`);
    return [['기본 응답','현재 상호작용에 반응'],['추가 전개',selected.length?selected.join(' / '):'없음'],
        ...(previous.length?[['직전 추가 전개',previous.map(x=>`${x.feature==='event'?'사건':'인물'} · ${labels[x.verification]||'본문 확인 대기'}`).join(' / ')]]:[])];
}
