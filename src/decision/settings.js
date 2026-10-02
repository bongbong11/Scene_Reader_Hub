

export const WORLD_DIRECTIONS = {
    natural: '자연스럽게',
    positive: '긍정적으로',
    hostile: '적대적으로',
};

export const RELATIONSHIP_DIRECTIONS = {
    dynamic: '상황에 따라 변화',
    positive: '호의적',
    hostile: '적대적',
};

export const PROGRESSION_MODES = {
    off: '사용 안 함',
    natural: '자연 진행',
    daily: '일상·생활 진행',
    adventure: '모험·임무 진행',
    investigation: '조사·미스터리 진행',
    survival: '위협·생존 진행',
    intrigue: '세력·암투 진행',
    military: '전쟁·작전 진행',
};

export const JUDGMENT_STYLES = {
    conservative: '보수적',
    balanced: '균형',
    active: '적극적',
};

export const DEVELOPMENT_STYLES = { static: '정적', balanced: '균형', dynamic: '동적' };

export const DEVELOPMENT_GUIDANCE = {
    static: 'Favor staying with the current scene through meaningful dialogue, emotional nuance, and small relational or practical changes. Static does not mean repetition, passivity, or avoiding a necessary action. Favor the two people’s relationship, emotions, thoughts, and dialogue. Natural arrivals and small happenings remain possible; quietness alone does not forbid them.',
    balanced: 'Balance the current exchange with supported actions, choices, and external developments. Choose the movement that best fits the current scene without favoring either stillness or disruption.',
    dynamic: 'Favor supported actions, decisions, external responses, and consequences that change the immediate situation. Dynamic does not require a new event, larger stakes, a time jump, faster relationship change, or premature resolution.',
};

export const BASIC_MOVES = {
    continue: 'Continue the meaningful current exchange without repetition or an unrelated new incident.',
    dialogue: 'Let a relevant line or interpersonal response change the current exchange without inventing feelings or knowledge.',
    action: 'Carry out one supported action already available to this person; preserve any outcome requiring another participant.',
    choice: 'Let the responsible character make a supported choice or refusal and show its immediate implication.',
    emotion: 'Let a character-consistent feeling, thought, or relational tension become a specific response or expression; do not dictate the user’s inner state.',
    movement: 'Attempt or propose a practical movement, shared activity, or change of place when it fits; preserve others’ decisions and do not force a transition.',
    consequence: 'Let an established action produce a supported immediate reaction or consequence, without inventing a separate event.',
};

export function normalizeDevelopmentPreferences(value = {}) {
    const developmentStyle = Object.hasOwn(DEVELOPMENT_STYLES, value.developmentStyle) ? value.developmentStyle
        : value.progressionMode === 'off' || value.judgmentStyle === 'conservative' ? 'static'
            : value.judgmentStyle === 'active' ? 'dynamic' : 'balanced';
    // Legacy routing consumers use derived values; these are no longer independent controls.
    const result = { ...value, settingsContract:Math.max(3, Number(value.settingsContract) || 3), developmentStyle, progressionMode: 'natural',
        judgmentStyle: 'balanced' };
    const intensity = Number(value.progressIntensity);
    result.progressIntensity = Number.isFinite(intensity) && intensity > 0 ? Math.round(Math.max(0.5, Math.min(1.5, intensity)) * 10) / 10 : 1;
    delete result.roleplayPace;
    delete result.eventChance;
    return result;
}

export const PACE_OPTIONS = {
    slow: '느리게',
    medium: '중간',
    fast: '빠르게',
};

export const DECISION_LABELS = {
    progress_need: {flowing:'의미 있는 변화가 이어짐',stalled:'반복을 벗어날 움직임 필요',unclear:'비교 근거 부족'},
    arrival_mode: {none:'이번 등장 없음',visit:'직접 방문',encounter:'자연스러운 마주침',participate:'현재 활동에 참여',background:'주변 인물의 개입',contact:'연락·메시지'},
    basic_move: {emotion:'감정·생각의 표현',movement:'이동·활동 시도',continue:'현재 교류 이어가기',dialogue:'대화로 변화',action:'행동 실행',choice:'선택·거절',consequence:'기존 행동의 결과'},
    world_direction: WORLD_DIRECTIONS,
    negative_priority: { off: '사용 안 함', on: '부정 편향 최우선' },
    scene_state: { active: '활발히 진행 중', normal: '정상 진행', stalled: '정체·반복', transition_ready: '전환 가능', unclear: '불명확' },
    conflict_state: { none: '갈등 없음', tension: '긴장만 있음', active: '실제 갈등 진행 중', resolving: '해소 과정', unclear: '불명확' },
    relationship_motion: { none: '비교 근거 없음', stable: '유지', closer: '가까워짐', distant: '멀어짐', mixed: '상반된 움직임', unclear: '실제로 판별 불가' },
    trust_signal: { none: '뚜렷한 근거 없음', positive: '신뢰 증가 근거', negative: '불신 증가 근거', mixed: '상반된 근거', unclear: '불명확' },
    intimacy_signal: { none: '뚜렷한 근거 없음', positive: '친밀감 증가 근거', negative: '거리 증가 근거', mixed: '상반된 근거', unclear: '불명확' },
    romance_evidence: { none: '로맨틱 근거 없음', attraction: '끌림·성적 긴장만 있음', established: '명시적 로맨틱 근거', counter: '반대 근거', mixed: '상반된 근거', unclear: '불명확' },
    counterevidence: { none: '관계 진전의 반대 근거 없음', limited: '진전 폭을 제한할 근거', clear: '가까워짐을 반박하는 근거', mixed: '지지·반대 근거 혼재', unclear: '근거 부족', not_applicable: '가까워짐 판정 대상 아님' },
    unresolved: { none: '뚜렷한 미해결 없음', relationship: '관계 문제', conflict: '갈등', goal: '목표·행동', information: '정보·비밀', danger: '위협·위기', multiple: '여러 요소', unclear: '불명확' },
    context_change_source: { none: '새 장면 기회 없음', user_established: '유저가 새 상황 확정', character_established: '캐릭터 출력이 새 상황 확정', both: '양쪽에서 새 상황 확정', unclear: '변화 출처 불명확' },
    continuity_trigger: { none: '연결 변화 없음', commitment: '약속·일정·의무', delegation: '위임·책임', knowledge_transfer: '중요 정보 전달', major_status_change: '중요 상태 변화' },
    event_state: { none: '진행 중인 중심 사건 없음', introduced: '사건 도입', active: '사건 진행 중', turning: '전환점', resolution_ready: '해결 조건 마련됨', aftermath: '해결 후 여파', unclear: '불명확' },
    event_valence: { positive: '긍정', negative: '부정', mixed: '양쪽', neutral: '중립', unclear: '불명확' },
    event_blocker: { none: '뚜렷한 방해 없음', information: '정보·단서 부족', action: '실제 행동 필요', choice: '결정·선택 필요', resource: '시간·자원 부족', resistance: '인물·세력의 저항', external: '외부 방해', unclear: '불명확' },
    resolution_readiness: { none: '해결 근거 없음', partial: '일부 조건 충족', core: '핵심 조건 충족', decisive: '결정적 행동 실행됨', unclear: '불명확' },
    npc_presence: { none: '활성 NPC 없음', mentioned: '언급만 됨', present: 'NPC가 장면에 참여 중', entering: 'NPC의 등장·접촉이 확정됨', multiple: '여러 NPC가 참여 중', unclear: '불명확' },
    npc_valence: { positive: '긍정', negative: '부정', mixed: '양쪽', neutral: '중립', unclear: '불명확' },
    hesitation_drag: { no: '과도한 망설임 없음', yes: '망설임이 진행을 방해함' },
    refusal_stall: { no: '거절이 서술을 막지 않음', yes: '거절 반복으로 상호작용 정체' },
    circularity: { no: '의미 있는 새 내용 있음', yes: '같은 내용이 반복됨' },
    user_handoff: { no: '캐릭터가 자기 몫을 실행함', yes: '질문만 하며 진행을 유저에게 넘김' },
    action_evasion: { no: '필요한 행동이 구체적으로 실행됨', yes: '행동을 분위기·말로만 얼버무림' },
    input_echo: { no: '유저 입력을 되풀이하지 않음', yes: '유저 입력을 반복·바꿔 말함' },
    repetitive_ending: { no: '종결 구조 반복 없음', yes: '비슷한 종결 구조 반복' },
    npc_identity_route: { none: '선택 없음', reuse_existing: '기존 인물 재사용', canon_natural: '자연스러운 원작 인물', original_major: '주요 오리지널 인물', original_minor: '일시적 오리지널 인물', group: '군중·집단' },
    directive_followthrough: { not_applicable: '직전 필수 실행 없음', fulfilled: '직전 지시 이행됨', partial: '일부만 이행됨', missed: '필요한 지시가 이행되지 않음' },
    relationship_direction: RELATIONSHIP_DIRECTIONS,
    relationship_pacing: { hold: '관계 상태 유지', closer_incremental: '조금 가까워짐', closer_significant: '분명히 가까워짐', distant_incremental: '조금 멀어짐', distant_significant: '분명히 멀어짐' },
    direct_execution: { no: '별도 직접 실행 없음', yes: '현재 장면에서 구체적으로 실행' },
    relationship_beat: { none: '추가 관계 비트 없음', avoidance: '회피·미루기', rejection: '거절·경계 설정', confession: '고백·직접 공개', inner_outer_gap: '속마음과 행동의 불일치', vulnerability: '취약성·신뢰 공개', jealousy_friction: '질투·마찰', repair: '회복·화해 시도', commitment: '관계를 바꾸는 선택' },
    resolution_pacing: { continue: '미해결 상태 유지', partial: '부분 해결·단계 진전', resolve: '실질적 해결 허용' },
    npc_autonomy: { no: '미적용', yes: '갈등 속 NPC 활성화' },
    fight_sustain: { no: '미적용', yes: '싸움 유지' },
    villain_route: { none: '미적용', waiting: '확률 추첨 대기', create: '새 빌런 생성', continue: '기존 빌런 유지', retire: '기존 빌런 종료', replace: '기존 빌런 교체 추첨' },
    world_hostility: { no: '미적용', yes: '세계 적대성' },
    npc_guard: { no: '미적용', yes: 'NPC 특별취급 방지' },
    misfortune: { no: '미적용', yes: '유저 불운 적용' },
    progression_move: { hold: '현재 흐름 유지', advance: '기존 행동·목표 진전', complication: '장애물·압박', positive: '유리한 기회·성과', reveal: '정보·단서', consequence: '기존 행동의 결과', turning_point: '국면 전환', transition: '장면·시간 전환' },
    event_route: { none: '새 사건 없음', waiting: '사건 추첨 대기', continue: '현재 사건 유지', create: '새 사건 추첨·도입', retire: '현재 사건 종료', replace: '현재 사건 종료·새 추첨' },
    primary_focus: { direct: '현재 대화·행동에 직접 응답', relationship: '관계·로맨스 진행', event: '현재 사건 진행', conflict: '갈등 실행', npc: 'NPC·빌런 개입', new_event: '새 사건 도입', transition: '장면 전환' },
    secondary_focus: { none: '보조 진행 없음', relationship: '관계·로맨스 보조 진행', event: '사건·결과 보조 진행', conflict: '갈등 보조 실행', npc: '일반 NPC 보조 개입', villain: '빌런 보조 개입', continuity: '연속성 후속 결과' },
    npc_route: { none: '미적용', waiting: '확률 추첨 대기', reuse: '기존 NPC 행동·재등장', create: '새 일반 NPC 생성', background: 'NPC를 배경으로 전환', retire: '기존 NPC 종료', replace: '기존 NPC 교체 추첨' },
    npc_role: { none: '역할 없음', participant: '사건 당사자', witness: '목격자', information: '정보 보유자', support: '도움·자원 제공자', gatekeeper: '접근 통제자', opposition: '방해·반대 인물', mediator: '중재자', authority: '권한 행사자', exploiter: '갈등 이용자', consequence: '결과 전달자', protector: '보호·구조 인물', self_directed: '자기 목적 추구자' },
    npc_weight: { none: '미적용', background: '배경 유지', brief: '짧은 반응', supporting: '보조 역할', primary: '이번 턴 주요 역할', exit: '퇴장·후퇴' },
    npc_knowledge: { none: '관련 지식 없음', direct: '직접 경험한 정보', reported: '전달받은 정보', role_based: '직업·지위 기반 정보', public: '공개·일반 정보', partial: '관찰 단서 기반 제한 추론', privileged: '근거 있는 내부 정보' },
    npc_disclosure: { none: '정보 사용 없음', open: '솔직히 공개', selective: '필요한 만큼 공개', conditional: '조건·대가 요구', withhold: '자기 이유로 숨김', distort: '근거 있는 왜곡', uncertain: '불확실성을 구분함' },
    npc_followthrough: { not_applicable: '직전 NPC 지시 없음', fulfilled: 'NPC 지시 이행됨', partial: 'NPC 지시 일부만 이행', missed: 'NPC 지시 미이행' },
    npc_knowledge_fit: { not_applicable: '판정할 NPC 지식 없음', fit: '지식 범위가 타당함', overreach: '알 수 없는 정보를 사용함', unclear: '판정 근거 불충분' },
    scene_cutoff: { no: '현재 비트가 실행됨', yes: '행동 직전에 장면을 끊음' },
    response_cadence: { compress: '부수 내용 압축', natural: '핵심 중심 자연 호흡', linger: '중요한 순간 확대' },
    advanced_entry: { closed: '진입 근거 없음', latent: '잠재적 진입 가능', open: '즉시 진입 가능' },
    advanced_route: { none: '고급 전개 없음', continue: '저장 사건 진행', create: '새 고급 사건 추첨' },
    advanced_cause: { none: '원인 없음', existing: '기존 사건·실마리', world: '세계 규칙', location: '장소·환경', faction: '인물·세력', consequence: '이전 행동의 결과', chance: '맥락상 가능한 우연' },
    advanced_element: { none: '사용 안 함', social: '일상·교류', exploration: '탐험·발견', objective: '사건·목표', investigation: '추리·수사', threat: '위협·전투', horror: '공포·초자연', intrigue: '암투·공작', relationship: '관계·치정' },
    advanced_move: { quiet: '이번 응답은 대기', seed: '첫 징후·압력', advance: '한 단계 진전', obstacle: '장애·비용', reveal: '제한된 정보', contact: '직접 접촉', attack: '직접 공격', aftermath: '결과·후속 영향' },
};
