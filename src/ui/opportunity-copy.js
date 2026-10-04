export const UI = {
  generationLabel:'새 사건·인물 생성',
  generationHelp:'켜면 설정한 확률에 따라 새 사건·새 인물을 추가합니다. 꺼도 현재 대화·감정·관계 전개, 진행 중인 사건과 기존 인물의 행동은 유지됩니다.',
  generationOff:'새 사건·인물 생성이 꺼져 있습니다. 돌발 선택은 저장되며 생성을 켰을 때 적용됩니다.',
  label:'돌발 추가',options:{off:'꺼짐',event:'사건',person:'인물',both:'사건·인물 모두'},
  help:'선택한 항목은 복선이나 진행 정체가 없어도 현재 장면에 맞게 발생할 수 있습니다. 발생 빈도는 사건·인물의 확률 설정을 따릅니다.',
  saved:'선택은 저장되며 다음 자동·수동 판독부터 적용됩니다. 선택만으로 판독하거나 답변을 생성하지 않습니다.',
  off:'돌발 추가만 끕니다. 진행 중인 사건·인물과 기존 전개 기능은 유지됩니다.',
  chance:'발생 가능한 응답 기회에 한 번 적용합니다. 같은 응답의 재판독·리롤은 다시 추첨하지 않습니다. 본문 반영은 모델의 응답을 확인한 뒤 표시합니다.',
  frequencyLabel:'사건 확률',frequencyHelp:'돌발 사건과 고급 사건이 공유하는 확률입니다. 중복 추첨하지 않습니다.',
  advancedFrequencyHelp:'발생 확률은 자동 전개 탭의 새 사건·인물 생성에서 조절합니다.',
  compactHelp:'꺼도 현재 대화·관계와 진행 중인 사건·인물은 유지됩니다. 돌발은 복선 없이 가능한 새 사건·등장을 허용합니다.',
  base:'기본 응답: 현재 상호작용에 반응',none:'추가 전개: 없음',
};
export function opportunityFailureMessage(plan) {
  const failed=['event','person'].filter(feature=>plan?.[feature]?.reasonCode==='invalid_selection');
  return failed.length?`새 ${failed.map(x=>x==='event'?'사건':'인물').join('·')} 선택 응답 오류 · 이번 추가는 제외했습니다. 로그 복사에서 원인을 확인해 주세요.`:'';
}
