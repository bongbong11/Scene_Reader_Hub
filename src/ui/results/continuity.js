import {continuityView} from "../../continuity/state-adapter.js";
import {normalizeContinuity,continuityValidationCounts,CONTINUITY_VALIDATION_LABELS} from "../../continuity/engine.js";
import {confirmedContinuity} from '../../continuity/selection.js';

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
    const root = deps.document.getElementById('sr-continuity-results');
    if (!root) return;
    if (!settings.continuityEnabled) { root.innerHTML = '<p class="sr-help">연속성 추론이 꺼져 있습니다.</p>'; return; }
    const rec = deps.record();
    const trace = rec?.lastContinuityTrace || {};
    const stored = normalizeContinuity(rec ? continuityView(rec) : null);
    const state=deps.stateChatKey?.()?confirmedContinuity(stored,{record:rec,chatRef:deps.stateChatKey(),chat:deps.getContext().chat||[],fingerprint:deps.stableFingerprint,inherited:Boolean(rec?.sharedReference||rec?.legacyCarryReferenceV1)}):stored;
    const status = { saved: '수집 완료 · 저장된 내용 반영', needs_review: '수집 내용 확인 필요', partial: '일부 항목 처리 필요 · 정상 항목은 반영', fallback: '연결모델 오류 · 코드 대체 실행', analyzing: '보조 모델 분석 중', pending_jev: '이전 분석 자료 반영 대기', empty: '분석 완료 · 변경 없음', verified: '분석 완료 · 기록 반영', error: '보조 모델 실패 · 기본 판독은 계속 실행' }[trace.status] || '새 변화 대기';
    const profile = reasonerProfiles.find((item) => item.id === settings.reasonerProfileId);
    const profileStatus = profile?.name || (settings.reasonerProfileId ? '선택한 프로필을 찾지 못함' : '미선택');
    const rows = [`<div class="sr-decision-row"><span>상태</span><strong>${deps.escapeHtml(status)}</strong></div>`,
        `<div class="sr-decision-row"><span>선택한 연결 프로필</span><strong>${deps.escapeHtml(profileStatus)}</strong></div>`,
        `<div class="sr-decision-row"><span>호출 근거</span><strong>${deps.escapeHtml(trace.trigger==='periodic'?'완성된 답변 3개마다 확인':trace.trigger?'저장된 이전 분석':'아직 분석 전')}</strong></div>`];
    if(trace.status==='fallback')rows.push(`<p class="sr-help">관련 대화 ${Number(trace.referenceCount)||0}개를 임시 맥락으로 보존했습니다. 확정된 상태 변경과 구분해 전달하며 다음 분석에서 다시 확인합니다.</p>`);
    if(trace.invalidCount)rows.push(`<p class="sr-help">이번 판독에서 ${Number(trace.acceptedCount)||0}개를 새로 저장했습니다. 확인하지 못한 항목은 아래 사유로 구분합니다.</p>`);
    if(trace.reusedCount)rows.push(`<p class="sr-help">이미 저장한 ${Number(trace.reusedCount)}개는 중복 저장하지 않았습니다.</p>`);
    if(trace.retryPending)rows.push('<p class="sr-help">확인하지 못한 대화 구간은 다음 판독에 다시 포함합니다. 기존 기록과 이번에 확인한 내용은 유지합니다.</p>');
    const reasons=Object.entries(continuityValidationCounts(trace)).map(([key,count])=>`${CONTINUITY_VALIDATION_LABELS[key]} ${count}건`);
    if(reasons.length)rows.push(`<p class="sr-help">제외 사유: ${deps.escapeHtml(reasons.join(' · '))}</p>`);
    if (trace.error) rows.push(`<p class="sr-help">${deps.escapeHtml(trace.error)}</p>`);
    if(trace.repetitionStatus)rows.push(`<div class="sr-decision-row"><span>소재 편중 확인</span><strong>${deps.escapeHtml(({ready:'편중 발견 · 짧은 절제 지침 준비',balanced:'추가 절제 불필요',insufficient_history:'답변 2개부터 비교',not_returned:'모델 결과 없음 · 일반 판독 유지',invalid_evidence:'비교 근거 부족 · 일반 판독 유지',save_failed:'결과 저장 실패',model_unavailable:'연결모델 오류 · 반복 억제 추가 안 함'})[trace.repetitionStatus] || '확인 대기')}</strong></div>`);
    if (trace.verdicts?.length) rows.push(...trace.verdicts.map((item) => `<div class="sr-decision-row"><span>${deps.escapeHtml(deps.continuityLabel(item.type))}${item.label ? ` · ${deps.escapeHtml(item.label)}` : ''}</span><strong>${deps.escapeHtml(deps.continuityLabel(item.verdict))}</strong>${item.reason ? `<small>${deps.escapeHtml(item.reason)}</small>` : ''}</div>`));
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
