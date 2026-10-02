// Display-only descriptions. These never change a decision or call a model.
const COMMON = { fulfilled:'실행 확인', partial:'일부 실행', missed:'미이행', none: '해당 변화 없음', unclear: '근거가 부족해 판단 보류', not_applicable: '이번 장면의 판정 대상 아님', yes: '감지됨', no: '감지되지 않음', hold: '현재 흐름 유지', unknown: '확인되지 않음' };
export function displayValue(labels, key, value) {
    if (value == null || value === '') return '판독 결과 없음';
    return labels[key]?.[value] || COMMON[value] || '표시 설명 미등록 · 상세 확인 필요';
}

export function verificationText(verification) {
    if (!verification) return '확인할 이전 출력 없음';
    const labels = { relationship: '관계', event: '사건', npc: '인물', conflict: '갈등', direct: '직접 반응', progress: '실질 진행' };
    const status = { fulfilled: '실행 확인', executed: '실행 확인', partial: '일부 실행', missed: '미이행', unclear: '확인 보류', not_applicable: '해당 없음', meaningful: '변화 확인', none: '변화 없음', stalled: '정체', yes: '확인', no: '미확인' };
    return Object.entries(verification.verification || {}).map(([key, value]) => `${labels[key.replace('verification_', '')] || '이전 계획'}: ${status[value] || '확인 보류'}`).join(' · ') || '검증 완료 · 적용 가능한 변화만 저장';
}
