import {renderChangeReview} from '../change-review.js';
import {renderEvolutionStatus} from '../evolution-status.js';
import {continuityView} from "../../continuity/state-adapter.js";
import {normalizeContinuity} from "../../continuity/engine.js";

export function createContinuityView(deps) {
function renderReasonerProfiles() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    const select = deps.document.getElementById('sr-reasoner-profile');
    if (!select) return;
    select.innerHTML = `<option value="">연결 프로필 선택</option>${reasonerProfiles.map((item) => `<option value="${deps.escapeHtml(item.id)}">${deps.escapeHtml(item.name)} · ${deps.escapeHtml(item.model)}</option>`).join('')}`;
    const active = reasonerProfiles.find((item) => item.id === settings.reasonerProfileId);
    select.value = active?.id || '';
    const status = deps.document.getElementById('sr-reasoner-status');
    if (status) status.textContent = active
        ? `${active.name} · ${active.model} · SillyTavern 연결 설정 사용`
        : reasonerProfileError || (settings.reasonerProfileId ? '선택했던 SillyTavern 연결 프로필을 찾을 수 없습니다.' : 'SillyTavern의 API 연결 메뉴에서 프로필을 만든 뒤 선택하세요.');
}

function renderContinuity() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    renderEvolutionStatus({analysis:deps.getAnalysis?.(),document:deps.document,record:deps.record(),settings,store:characterStore,escapeHtml:deps.escapeHtml});
    renderChangeReview({document:deps.document,window:deps.window,record:deps.record(),changes:deps.getChanges?.(),analysis:deps.getAnalysis?.(),escapeHtml:deps.escapeHtml});
    const root = deps.document.getElementById('sr-continuity-results');
    if (!root) return;
    if (!settings.continuityEnabled) { root.innerHTML = '<p class="sr-help">연속성 추론이 꺼져 있습니다.</p>'; return; }
    const rec = deps.record();
    const trace = rec?.lastContinuityTrace || {};
    const state = normalizeContinuity(rec ? continuityView(rec) : null);
    const status = { saved: '수집 완료 · 저장된 내용 반영', needs_review: '수집 내용 확인 필요', partial: '일부 분석 대기', analyzing: '보조 모델 분석 중', pending_jev: 'Jev 검증 대기', empty: '연결할 후속 상태 없음', verified: 'Jev 검증 완료', error: '보조 모델 실패 · 기본 판독은 계속 실행' }[trace.status] || '새 변화 대기';
    const profile = reasonerProfiles.find((item) => item.id === settings.reasonerProfileId);
    const profileStatus = profile?.name || (settings.reasonerProfileId ? '선택한 프로필을 찾지 못함' : '미선택');
    const rows = [`<div class="sr-decision-row"><span>상태</span><strong>${deps.escapeHtml(status)}</strong></div>`,
        `<div class="sr-decision-row"><span>선택한 연결 프로필</span><strong>${deps.escapeHtml(profileStatus)}</strong></div>`,
        `<div class="sr-decision-row"><span>호출 근거</span><strong>${deps.escapeHtml(deps.resultLabel('continuity_trigger', trace.trigger || 'none'))}</strong></div>`];
    if (trace.error) rows.push(`<p class="sr-help">${deps.escapeHtml(trace.error)}</p>`);
    if(trace.repetitionStatus)rows.push(`<div class="sr-decision-row"><span>소재 편중 확인</span><strong>${deps.escapeHtml(({ready:'편중 발견 · 짧은 절제 지침 준비',balanced:'추가 절제 불필요',insufficient_history:'답변 2개부터 비교',not_returned:'모델 결과 없음 · 일반 판독 유지',invalid_evidence:'비교 근거 부족 · 일반 판독 유지',save_failed:'결과 저장 실패'})[trace.repetitionStatus] || '확인 대기')}</strong></div>`);
    if (trace.verdicts?.length) rows.push(...trace.verdicts.map((item) => `<div class="sr-decision-row"><span>${deps.escapeHtml(deps.continuityLabel(item.type))} · ${deps.escapeHtml(item.label)}</span><strong>${deps.escapeHtml(deps.continuityLabel(item.verdict))}</strong>${settings.showConfidence ? `<small>Jev ${deps.escapeHtml(deps.continuityLabel(item.selected))} → 확신 ${Math.round(item.certainty * 100)}% / 기준 ${Math.round(item.threshold * 100)}% → 최종 ${deps.escapeHtml(deps.continuityLabel(item.verdict))} · ${deps.escapeHtml(item.reason)}</small>` : ''}</div>`));
    else if (trace.candidates?.length) rows.push(...trace.candidates.map((item) => `<div class="sr-decision-row"><span>${deps.escapeHtml(deps.continuityLabel(item.type))} · ${deps.escapeHtml(item.label)}</span><strong>검증 대기</strong></div>`));
    rows.push(`<p class="sr-help">저장된 연속성: 약속·일정·위임 ${state.items.length}개 · 중요 지식 ${state.knowledge.length}개 · 후속 후보 ${state.followups.filter((item) => item.status === 'available').length}개. 압력은 완료·취소와 별도로 저장합니다.</p>`);
    for (const item of state.items.slice(-6)) rows.push(`<div class="sr-decision-row"><span>${deps.escapeHtml(item.label)}</span><strong>${deps.escapeHtml({active:'유효',confirmed:'확정',delegated:'위임됨',contested:'이견 있음',cancel_pending:'취소 여부 미정',resolved:'해결됨',cancelled:'취소됨',completed:'완료'}[item.lifecycle] || '유효')} · 압력 ${deps.escapeHtml({none:'없음',strained:'부담 있음',at_risk:'이행 위험',blocked:'장애 있음'}[item.pressure] || '없음')}</strong></div>`);
    for (const item of state.dependencies.slice(-4)) rows.push(`<div class="sr-decision-row"><span>${deps.escapeHtml(item.stateId)}</span><strong>압력 ${deps.escapeHtml(deps.continuityLabel(item.pressure || 'none'))}</strong></div>`);
    for (const item of state.knowledge.slice(-4)) rows.push(`<div class="sr-decision-row"><span>${deps.escapeHtml(item.character)} · ${deps.escapeHtml(item.summary || item.factId)}</span><strong>${deps.escapeHtml(deps.continuityLabel(item.source))}</strong></div>`);
    for (const item of state.followups.slice(-4)) rows.push(`<div class="sr-decision-row"><span>${deps.escapeHtml(item.action)}</span><strong>${deps.escapeHtml({available:'후속 후보',executed:'실행 확인',expired:'기한 지남',dismissed:'제외됨'}[item.status] || '확인 대기')}${item.lastOffered === rec?.sceneOpportunity ? ' · 이번 계기 사용' : ''}</strong></div>`);
    root.innerHTML = rows.join('');
}
return {renderReasonerProfiles,renderContinuity};
}
