export function appearanceRollText(roll) {
    if(roll?.reason==='stored_actor_active')return '저장된 생성 인물이 아직 활동 중이어서 새 인물 추첨이 보류되었습니다. 기존 인물이 종료된 뒤 새 등장 기회를 판정합니다.';
    if(roll?.passed)return '등장 추첨은 통과했지만, 이번 판정에서는 새 인물을 등장시키지 않았습니다. 등장 방식·확신도·기존 인물 조건을 판정 기록에서 확인하세요.';
    return '이번 적합한 계기의 추첨은 통과하지 않아 다음 새 RP 진행에서 다시 확인합니다.';
}
