import {drawStatusText} from '../../decision/draw-diagnostics.js';
import { DECISION_LABELS } from "../../../prompt-library.js";
import { selectExecutionCorrectionKeys } from "../../scene/correction-selection.js";
import { displayValue, verificationText } from "../presentation.js";
import {appearanceRollText} from '../appearance-status.js';
import {opportunityRows} from '../opportunity-results.js';

export function createJudgmentView(deps) {
function decisionTitle(key) {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    const context = deps.getContext();
    const user = context.name1 || '유저';
    const character = context.name2 || '캐릭터';
    return {
        scene_state: '현재 장면의 진행 상태', conflict_state: '인물 간 실제 갈등 상태', relationship_motion: `${character}↔${user} 관계 움직임`, trust_signal: `${character}가 보인 신뢰 근거`, intimacy_signal: `${character}가 보인 친밀감 근거`, romance_evidence: `${character}가 보인 로맨틱 근거`, counterevidence: '관계 진전의 반대 근거', unresolved: '현재 남은 핵심 문제', context_change_source: '새 장면 기회의 확정 출처', continuity_trigger: '연속성 추론 호출 근거', event_state: '현재 중심 사건 단계', event_valence: '현재 사건 방향', event_blocker: '현재 사건의 주된 방해', resolution_readiness: '현재 사건의 해결 준비', npc_presence: '현재 NPC 참여 상태', npc_valence: '현재 NPC 방향', hesitation_drag: `${character}의 과도한 망설임`, refusal_stall: `${character}의 거절 반복 정체`, circularity: '최근 대화의 내용 반복', user_handoff: `${character}가 질문으로 턴을 넘김`, input_echo: '유저 입력 에코·되풀이', repetitive_ending: '최근 응답의 종결 구조 반복', action_evasion: '필요한 행동 실행 회피', directive_followthrough: '직전 전체 지시 이행', scene_cutoff: '행동 전 장면 종료·생략', progress_need:'최근 흐름의 진행 필요', arrival_mode:'새 인물 등장 방식', basic_move: '이번 장면의 기본 진행', response_cadence: '이번 응답의 서술 호흡', world_direction: '세계 반응', relationship_direction: `${character}→${user} 관계 방향`, negative_priority: '부정 편향 우선순위', relationship_pacing: `${character}↔${user} 관계 변화`, relationship_beat: '관계·로맨스 표현 비트', primary_focus: '이번 응답의 주요 초점', secondary_focus: '이번 응답의 보조 진행', direct_execution: '현재 장면 직접 실행', resolution_pacing: '중심 사건 해결 범위', event_route: '중심 사건 유지·생성', npc_autonomy: '갈등 속 NPC', fight_sustain: '실제 싸움 유지', villain_route: '빌런 개입', world_hostility: '세계 적대성', npc_guard: 'NPC 특별취급 방지', misfortune: '유저 불운', progression_move: '사건·장면 진행 기능', npc_route: '일반 NPC 필요·연결', npc_target: '이번 NPC의 대상', npc_role: 'NPC의 이번 장면 역할', npc_weight: 'NPC의 이번 장면 비중', npc_knowledge: 'NPC가 사용할 수 있는 지식', npc_disclosure: 'NPC의 정보 사용 태도', npc_followthrough: '직전 NPC 지시 이행', npc_knowledge_fit: 'NPC 지식 범위 적합성', npc_identity_route: 'NPC 정체 경로', advanced_entry: '고급 전개 진입 가능성', advanced_route: '고급 사건 사용', advanced_cause: '고급 전개의 원인 경로', advanced_element: '선택된 고급 요소', advanced_move: '이번 고급 실행 단계', verification_progress: '직전 출력의 실질 진행', verification_relationship: '직전 관계 계획 이행', verification_event: '직전 사건 계획 이행', verification_npc: '직전 NPC 계획 이행', verification_conflict: '직전 갈등 계획 이행', verification_direct: '직전 직접 실행 이행',
    }[key] || (key.startsWith('verification_') ? '직전 출력의 실제 이행' : '추가 판정');
}

function resultLabel(key, value) {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    return displayValue(DECISION_LABELS, key, value);
}

function renderJudgment() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    const summary = deps.document.getElementById('sr-turn-summary');
    const roots = Object.fromEntries(Object.keys(deps.RESULT_GROUPS).map((id) => [id, deps.document.getElementById(id)]));
    if (!summary || Object.values(roots).some((root) => !root)) return;
    const judgment = deps.record()?.lastJudgment;
    if (!judgment?.details) {
        summary.innerHTML = '<div class="sr-empty-small">아직 판독 결과가 없습니다.</div>';
        for (const root of Object.values(roots)) root.innerHTML = '<div class="sr-empty-small">판독 후 세부 결과를 표시합니다.</div>';
        for (const id of ['sr-caption-scene', 'sr-caption-event', 'sr-caption-advanced', 'sr-caption-quality']) { const node = deps.document.getElementById(id); if (node) node.textContent = '판독 대기'; }
        return;
    }
    if (judgment.sceneIntimacy?.route === 'paused') {
        summary.innerHTML = `<div class="sr-empty-small">${judgment.sceneIntimacy.error ? '장면 확인 실패 · 이전 중단 상태 유지' : '현재 장면 · 일반 판독 주입 쉬는 중'} · 고정 지침과 저장된 인물 참고문만 적용했습니다.</div>`;
        for (const root of Object.values(roots)) root.innerHTML = '<div class="sr-empty-small">현재 장면에서는 이 항목의 판독을 쉬고 있습니다.</div>';
        for (const id of ['sr-caption-scene', 'sr-caption-event', 'sr-caption-advanced', 'sr-caption-quality']) { const node = deps.document.getElementById(id); if (node) node.textContent = '판독 쉬는 중'; }
        return;
    }
    const card = ([key, value]) => {
        const targetLabel = (choice) => key === 'npc_target' ? choice === 'none' ? '이번 턴 지정 없음' : choice === 'stored_generated' ? '저장된 생성 NPC' : choice === 'scene_existing' ? '기존 RP 인물' : /^sheet_\d+$/.test(choice || '') ? (judgment.npcTargetName || '등록 인물') : resultLabel(key, choice) : resultLabel(key, choice);
        const label = targetLabel(value.effective);
        const selectedLabel = targetLabel(value.selected);
        const policyLabel = resultLabel(key, value.policyEffective || value.effective);
        const score = Math.round((Number(value.certainty) || 0) * 100);
        const threshold = Math.round((Number(value.threshold) || 0) * 100);
        const policy = { observation: '관찰', routing: '라우팅', diagnostic: '진단', verification: '이행 검증' }[value.policy] || '확장 계산';
        const reason = value.rule || (value.fallbackApplied ? '확신도 부족·안전 기본값' : 'Jev 선택 유지');
        const rollKey = key === 'event_route' || key === 'advanced_route' ? 'event' : key === 'npc_route' ? 'npc' : key === 'villain_route' ? 'villain' : '';
        const roll = rollKey ? judgment.rolls?.[rollKey] : null;
        const rollText = roll ? ` · 추첨 ${Number(roll.roll)} / ${Number(roll.chance)}% → ${Number(roll.roll) <= Number(roll.chance) ? '통과' : '미통과'}` : '';
        const extra = value.fixed ? `<small>확장 계산/사용자 고정${value.rule ? ` · ${deps.escapeHtml(value.rule)}` : ''}</small>` : value.conditional ? '<small>NPC 존재·등장 조건 자동 연결</small>' : (settings.showConfidence ? `<small>Jev ${deps.escapeHtml(selectedLabel || '응답 없음')} → 확신 ${score}% / 기준 ${threshold}%${value.progressIntensity && value.progressIntensity !== 1 ? ` (기본 ${Math.round(value.baseAcceptanceThreshold * 100)}% · 적극성 ${value.progressIntensity.toFixed(1)})` : ''} → 기준 적용 ${deps.escapeHtml(policyLabel)} → 최종 적용 ${deps.escapeHtml(label)} · ${deps.escapeHtml(reason)}${deps.escapeHtml(rollText)}</small>` : '');
        return `<div class="sr-decision-row"><span>${deps.escapeHtml(decisionTitle(key))}</span><strong>${deps.escapeHtml(label)}</strong>${extra ? `<details class="sr-trace"><summary>적용 이유·확신도</summary>${extra}</details>` : ''}</div>`;
    };
    for (const [id, keys] of Object.entries(deps.RESULT_GROUPS)) roots[id].innerHTML = keys.filter((key) => judgment.details[key]).map((key) => card([key, judgment.details[key]])).join('') || '<div class="sr-empty-small">이번 판독에 해당 항목이 없습니다.</div>';
    const verificationKeys = Object.keys(judgment.details).filter((key) => key.startsWith('verification_'));
    if (verificationKeys.length) roots['sr-conflict-quality'].insertAdjacentHTML('beforeend', verificationKeys.map((key) => card([key, judgment.details[key]])).join(''));

    const d = judgment.decisions || {};
    const correctionSelection = judgment.correctionSelection || selectExecutionCorrectionKeys(d, judgment.details);
    const correctionIssues = correctionSelection.detectedKeys.length;
    const appliedCorrections = correctionSelection.selectedKeys.length;
    const npcText = ['create', 'reuse'].includes(d.npc_route) ? `${judgment.npcTargetName ? `${judgment.npcTargetName} · ` : ''}${resultLabel('npc_route', d.npc_route)} · ${resultLabel('npc_weight', d.npc_weight)} · ${resultLabel('npc_valence', d.npc_valence)}` : '미사용';
    const conflictApplied = [];
    if (d.negative_priority === 'on') conflictApplied.push('부정 편향 우선');
    if (d.fight_sustain === 'yes') conflictApplied.push('싸움 유지');
    if (['create', 'continue'].includes(d.villain_route)) conflictApplied.push(`빌런 ${resultLabel('villain_route', d.villain_route)}`);
    if (d.npc_autonomy === 'yes') conflictApplied.push('갈등 NPC');
    if (d.world_hostility === 'yes') conflictApplied.push('세계 적대성');
    if (d.npc_guard === 'yes') conflictApplied.push('NPC 특별취급 방지');
    if (d.misfortune === 'yes') conflictApplied.push('유저 불운');
    if (deps.record()?.preferences?.privatePromptEnabled && deps.ownerPrompt()) conflictApplied.push('제작자 전용');
    const actionPlan = judgment.actionPlan || d.action_plan || {};
    const excludedRoutes = (actionPlan.excluded || []).map((item) => `${item.label}: ${item.reason}`).join(' / ');
    summary.innerHTML = [
        ...opportunityRows(judgment,deps.record()?.lastOpportunityVerification||[]),
        [judgment.opportunityPlan ? '기존 진행' : '중심 전개', actionPlan.primary?.label || resultLabel('primary_focus', d.primary_focus)],
        ['함께 넣는 변화', actionPlan.secondary?.label || '없음'],
        ['같은 장면 안의 반응', (actionPlan.overlays || []).map(item=>item.label).join(' · ') || '중심 전개에 포함'],
        ['이번에 넣지 않은 내용', excludedRoutes || '없음'],
        ['관계', `${resultLabel('relationship_pacing', d.relationship_pacing)}${d.relationship_beat && d.relationship_beat !== 'none' ? ` · ${resultLabel('relationship_beat', d.relationship_beat)}` : ''}`],
        ['사건', `${resultLabel('progression_move', d.progression_move)} · ${resultLabel('resolution_pacing', d.resolution_pacing)} · ${resultLabel('event_valence', d.event_valence)}`],
        ...(deps.record()?.preferences?.advancedEnabled ? [['고급 전개', `${resultLabel('advanced_route', d.advanced_route)} · ${resultLabel('advanced_element', d.advanced_element)} · ${resultLabel('advanced_move', d.advanced_move)}`]] : []),
        ['NPC', npcText],
        ['갈등용', conflictApplied.length ? conflictApplied.join(' · ') : '미적용'],
        ['기본 진행', resultLabel('basic_move', d.basic_move)],
        ['실행 교정', correctionIssues ? `${correctionIssues}개 감지 · ${appliedCorrections}개 우선 적용` : '문제 없음'],
        ...(correctionSelection.omittedKeys.length ? [['이번 교정에서 제외', correctionSelection.omittedKeys.map(decisionTitle).join(' · ')]] : []),
        ['실질 진행 압력', `${Number(deps.record()?.progressionState?.turnsSinceMeaningfulProgress) || 0}회 연속 미이행`],
        ['상태 반영', deps.record()?.pendingPlan ? (deps.record().pendingPlan.status === 'awaiting_verification' ? '출력 있음 · 다음 판독에서 검증 대기' : '출력 대기') : deps.record()?.lastVerification ? verificationText(deps.record().lastVerification) : '검증할 계획 없음'],
    ].map(([name, value]) => `<div class="sr-summary-item"><span>${deps.escapeHtml(name)}</span><strong>${deps.escapeHtml(value)}</strong></div>`).join('');

    const setCaption = (id, text) => { const node = deps.document.getElementById(id); if (node) node.textContent = text; };
    setCaption('sr-caption-scene', `${resultLabel('scene_state', d.scene_state)} · ${resultLabel('relationship_pacing', d.relationship_pacing)}`);
    setCaption('sr-caption-event', `${resultLabel('progression_move', d.progression_move)} · NPC ${npcText}`);
    setCaption('sr-caption-advanced', deps.record()?.preferences?.advancedEnabled ? `${resultLabel('advanced_route', d.advanced_route)} · ${resultLabel('advanced_move', d.advanced_move)}` : '사용 안 함');
    setCaption('sr-caption-quality', correctionIssues ? `${correctionIssues}개 감지 · ${appliedCorrections}개 우선 적용` : '문제 없음');
}

function renderProfiles() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    const root = deps.document.getElementById('sr-profile-status');
    if (!root) return;
    const rec = deps.record();
    const display = rec?.pendingPlan?.preparedStateSnapshot || rec;
    const pendingLabel = rec?.pendingPlan ? ' · 검증 대기' : '';
    const decisions = rec?.lastJudgment?.decisions || {};
    const rows = [];
    const phaseLabels = { introduced: '도입', active: '진행 중', turning: '전환점', aftermath: '해결 후 여파' };
    const eventRouteLabels = { create: '이번 턴 새로 도입', continue: '이번 턴 진행', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const npcRouteLabels = { create: '이번 턴 새로 등장', reuse: '이번 턴 행동', background: '배경 유지', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const villainRouteLabels = { create: '이번 턴 새로 등장', continue: '이번 턴 행동', waiting: '추첨 대기', none: '저장만 유지', retire: '종료', replace: '교체' };
    const eventDirection = resultLabel('event_valence', decisions.event_valence || 'neutral');
    const npcDirection = resultLabel('npc_valence', decisions.npc_valence || 'neutral');
    if (display?.eventProfile) rows.push(`<div class="sr-roll-card"><strong>현재 중심 사건${deps.escapeHtml(pendingLabel)} · ${deps.escapeHtml(display.eventProfile.title)}</strong><span>상태: ${deps.escapeHtml(display.eventProfile.source === 'advanced' ? resultLabel('advanced_route', decisions.advanced_route) : eventRouteLabels[decisions.event_route] || '저장만 유지')} · 방향: ${deps.escapeHtml(eventDirection)}</span>${display.eventProfile.worldName ? `<span>세계관: ${deps.escapeHtml(display.eventProfile.worldName)} · 요소: ${deps.escapeHtml(resultLabel('advanced_element', display.eventProfile.element))}</span>` : ''}<span>계기: ${deps.escapeHtml(display.eventProfile.trigger)}</span><span>목표: ${deps.escapeHtml(display.eventProfile.goal)}</span><span>압박: ${deps.escapeHtml(display.eventProfile.pressure)}</span><span>해결 조건: ${deps.escapeHtml(display.eventProfile.resolution)}</span>${display.eventProfile.entity ? `<span>인물·존재: ${deps.escapeHtml(display.eventProfile.entity.label)} · ${deps.escapeHtml(display.eventProfile.entity.purpose)} · ${deps.escapeHtml(display.eventProfile.entityReused ? '저장 인물 재사용' : '새 추첨')}</span>` : ''}${rec?.eventProfile ? '<div class="sr-action-row"><button id="sr-end-active-event" class="menu_button">사건 끝내기</button></div>' : ''}</div>`);
    else if (decisions.event_state && !['none', 'unclear'].includes(decisions.event_state)) rows.push(`<div class="sr-roll-card"><strong>현재 장면 사건 · 확장 추첨 외</strong><span>상태: ${deps.escapeHtml(eventRouteLabels[decisions.event_route] || '장면에서 감지')} · 방향: ${deps.escapeHtml(eventDirection)}</span><span>현재 단계: ${deps.escapeHtml(resultLabel('event_state', decisions.event_state))}</span></div>`);
    else if (display?.lastEventRoll && !rec?.lastJudgment?.drawDiagnostics) rows.push('<div class="sr-roll-card"><strong>새 사건</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 새 RP 진행에서 다시 확인합니다.</span></div>');
    if (display?.villainProfile) rows.push(`<div class="sr-roll-card"><strong>현재 빌런${deps.escapeHtml(pendingLabel)} · 부정</strong><span>상태: ${deps.escapeHtml(villainRouteLabels[decisions.villain_route] || '저장만 유지')}</span><span>동기: ${deps.escapeHtml(display.villainProfile.motive)}</span><span>수단: ${deps.escapeHtml(display.villainProfile.method)}</span><span>접근: ${deps.escapeHtml(display.villainProfile.access)}</span><span>영향력: ${deps.escapeHtml(display.villainProfile.leverage)}</span><span>능력: ${deps.escapeHtml(display.villainProfile.competence)}</span></div>`);
    else if (display?.lastVillainRoll && !rec?.lastJudgment?.drawDiagnostics) rows.push('<div class="sr-roll-card"><strong>새 빌런</strong><span>이번 적합한 계기의 추첨은 통과하지 않아 다음 새 RP 진행에서 다시 확인합니다.</span></div>');
    if (display?.npcProfile) rows.push(`<div class="sr-roll-card"><strong>현재 일반 NPC${deps.escapeHtml(pendingLabel)} · ${deps.escapeHtml(display.npcProfile.role)} · ${deps.escapeHtml(npcDirection)}</strong><span>상태: ${deps.escapeHtml(npcRouteLabels[decisions.npc_route] || display.npcProfile.status || '저장만 유지')} · 갈등 NPC 지시: ${decisions.npc_autonomy === 'yes' ? '적용' : '미적용'}</span><span>목적: ${deps.escapeHtml(display.npcProfile.aim)}</span><span>이해관계: ${deps.escapeHtml(display.npcProfile.stake || '현재 목적과 연결')}</span><span>제약: ${deps.escapeHtml(display.npcProfile.constraint || '설정된 능력과 접근 범위')}</span><span>기능: ${deps.escapeHtml(display.npcProfile.contribution)}</span><span>입장 변화 조건: ${deps.escapeHtml(display.npcProfile.turningCondition || '구체적인 장면 원인 필요')}</span><span>신뢰성: ${deps.escapeHtml(display.npcProfile.reliability)}</span></div>`);
    else if (['present', 'entering', 'multiple'].includes(decisions.npc_presence)) rows.push(`<div class="sr-roll-card"><strong>현재 장면 NPC · ${deps.escapeHtml(npcDirection)}</strong><span>상태: ${deps.escapeHtml(npcRouteLabels[decisions.npc_route] || '장면 참여')} · 갈등 NPC 지시: ${decisions.npc_autonomy === 'yes' ? '적용' : '미적용'}</span><span>확장이 새로 추첨한 인물이 아니라 현재 채팅에 이미 존재하는 NPC입니다.</span></div>`);
    else if (display?.lastNpcRoll) rows.push(`<div class="sr-roll-card"><strong>새 일반 NPC</strong><span>${deps.escapeHtml(appearanceRollText(display.lastNpcRoll))}</span></div>`);
    if(rec?.generatedCast?.length)rows.push(`<div class="sr-roll-card"><strong>이전 생성 인물 기록</strong><span>${rec.generatedCast.length}개 기록 보관 · 현재 장면에 맞는 인물을 다시 사용할 수 있습니다.</span></div>`);
    const draws=rec?.lastJudgment?.drawDiagnostics;
    if(draws)rows.push(`<div class="sr-roll-card"><strong>이번 사건·인물 등장 기회</strong><span>사건: ${deps.escapeHtml(drawStatusText(draws.event))}</span><span>인물: ${deps.escapeHtml(drawStatusText(draws.person))}</span><span>${deps.escapeHtml(draws.retry)}</span></div>`);
    root.innerHTML = rows.length ? rows.join('') : '<div class="sr-empty-small">저장된 사건·인물 추첨 결과 없음</div>';
}
return {decisionTitle,resultLabel,renderJudgment,renderProfiles};
}
