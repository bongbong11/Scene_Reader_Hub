export function appearanceRollText(roll) {
    if(roll?.reasonCode==='generation_disabled')return '새 생성이 꺼져 있습니다. 기존 인물의 행동은 유지됩니다.';
    if(roll?.status==='selected')return '새 인물 주입 준비 · 실제 등장은 본문 확인 후 확정됩니다.';
    if(roll?.reasonCode?.startsWith('blocked_'))return '장면의 구체적 제약으로 이번 제안이 제외되었습니다. 전체 로그에서 원인을 확인할 수 있습니다.';
    if(roll?.reasonCode==='invalid_selection')return '신규 인물 선택 응답이 누락되거나 올바르지 않아 이번 주입에서 제외되었습니다.';
    if(roll?.reason==='stored_actor_active')return '저장된 생성 인물이 아직 활동 중이어서 새 인물 추첨이 보류되었습니다. 기존 인물이 종료된 뒤 새 등장 기회를 판정합니다.';
    if(roll?.passed)return '등장 추첨은 통과했지만, 이번 판정에서는 새 인물을 등장시키지 않았습니다. 등장 방식·확신도·기존 인물 조건을 판정 기록에서 확인하세요.';
    return '이번 적합한 계기의 추첨은 통과하지 않아 다음 새 RP 진행에서 다시 확인합니다.';
}
