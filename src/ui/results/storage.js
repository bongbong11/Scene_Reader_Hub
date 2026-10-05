import { DECISION_LABELS } from "../../../prompt-library.js";
import { displayValue, verificationText } from "../presentation.js";

export function createStorageView(deps) {
function renderStoredState() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    const root = deps.document.getElementById('sr-stored-state');
    if (!root) return;
    const rec = deps.record();
    if (!rec) { root.innerHTML = '<div class="sr-empty-small">저장된 상태 없음</div>'; return; }
    const state = rec.relationshipState || {};
    const label = (key, value) => displayValue(DECISION_LABELS,key,value);
    const rows = [
        `<div class="sr-decision-row"><span>관계 움직임</span><strong>${deps.escapeHtml(label('relationship_motion', state.motion))}</strong></div>`,
        `<div class="sr-decision-row"><span>신뢰</span><strong>${deps.escapeHtml(label('trust_signal', state.trust))}</strong></div>`,
        `<div class="sr-decision-row"><span>친밀감</span><strong>${deps.escapeHtml(label('intimacy_signal', state.intimacy))}</strong></div>`,
        `<div class="sr-decision-row"><span>로맨틱 근거</span><strong>${deps.escapeHtml(label('romance_evidence', state.romance))}</strong></div>`,
        `<div class="sr-decision-row"><span>마지막 관계 비트</span><strong>${deps.escapeHtml(label('relationship_beat', state.lastBeat))}</strong></div>`,
        `<div class="sr-decision-row"><span>장면의 미해결 요소</span><strong>${deps.escapeHtml(label('unresolved', rec.sceneState?.unresolved))}</strong></div>`,
        `<div class="sr-decision-row"><span>누적된 의미 있는 변화</span><strong>가까움 ${Number(rec.pacingState?.relationship?.closer) || 0} · 거리 ${Number(rec.pacingState?.relationship?.distant) || 0}</strong></div>`,
    ];
    if (rec.backgroundEvents?.length) rows.push(`<div class="sr-decision-row"><span>완료·보관 사건</span><strong>${deps.escapeHtml(rec.backgroundEvents.map((event) => event.title).join(' · '))}</strong></div>`);
    root.innerHTML = rows.join('');
}

function renderBackups() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    const root = deps.document.getElementById('sr-backup-list');
    if (!root) return;
    root.innerHTML = backupList.map((item) => `<div class="sr-backup-item"><span><strong>${deps.escapeHtml(new Date(item.createdAt).toLocaleString())}</strong><small>${deps.escapeHtml(({manual:'수동 백업',before_restore:'복원 전 자동 백업',before_import:'가져오기 전 자동 백업'})[item.reason] || '저장소 백업')} · ${Number(item.fileCount) || 0}개 파일</small></span><div><button type="button" class="menu_button" data-backup-action="restore" data-backup-id="${deps.escapeHtml(item.id)}">복원</button><button type="button" class="menu_button" data-backup-action="download" data-backup-id="${deps.escapeHtml(item.id)}">다운로드</button><button type="button" class="menu_button" data-backup-action="characters" data-backup-id="${deps.escapeHtml(item.id)}">인물만 내보내기</button><button type="button" class="menu_button" data-backup-action="delete" data-backup-id="${deps.escapeHtml(item.id)}">삭제</button></div></div>`).join('') || '<div class="sr-empty-small">저장된 백업 없음</div>';
}
return {renderStoredState,renderBackups};
}
