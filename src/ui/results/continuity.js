import {COMPACT_CONTRACT,compactContext} from '../../continuity/compact-context.js';
import {analysisFailureTitle,analysisFailureReason} from '../../continuity/failure.js';
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
    const {settings,reasonerProfiles}=deps.readState();
    const root=deps.document.getElementById('sr-continuity-results');if(!root)return;
    if(!settings.continuityEnabled){root.innerHTML='<p class="sr-help">연속성 추론이 꺼져 있습니다.</p>';return;}
    const rec=deps.record(),trace=rec?.lastContinuityTrace?.contract===COMPACT_CONTRACT?rec.lastContinuityTrace:{};
    const context=compactContext(rec,{record:rec,chatRef:deps.stateChatKey?.(),chat:deps.getContext().chat||[],fingerprint:deps.stableFingerprint,inherited:Boolean(rec?.sharedReference||rec?.legacyCarryReferenceV1)});
    const runtime=deps.getAnalysisState?.(),active=runtime?.chatKey===deps.stateChatKey?.()?runtime:null;
    const pending=rec?.auxiliaryStateV1?.pending?.turns||[];
    const waiting=pending.some(turn=>turn.outputIndex>=(trace.outputIndex??-1));
    const newer=pending.some(turn=>turn.outputIndex>(trace.outputIndex??-1));
    const invalidSource=Object.values(context?.fieldStatus||{}).includes('unavailable');
    const status=active?.status==='running'?'수집 중':active?.status==='cancelled'?'수집 중단':invalidSource?'원문 변경 · 재수집 대기':waiting&&(active?.status==='waiting'||newer)?'수집 대기 · 이전 자료 보존':({verified:'수집 완료',partial:'일부 반영 · 미확인 값은 이전 자료 보존',error:'수집 오류 · 이전 자료 보존'})[trace.status]||'아직 수집 전';
    const escape=deps.escapeHtml,row=(label,value)=>`<div class="sr-decision-row"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`;
    const profile=reasonerProfiles.find(item=>item.id===settings.reasonerProfileId);
    const rows=[row('상태',status),row('선택한 연결 프로필',profile?.name||'미선택'),row('수집 주기','완성된 롤플 답변마다')];
    if(trace.failure)rows.push(`<p class="sr-help">${escape(analysisFailureTitle(trace.failure))} · ${escape(analysisFailureReason(trace.failure))} (${escape(trace.failure.code)})</p>`);
    if(rec?.continuityDiagnosticsV1?.attempt?.persisted===false)rows.push('<p class="sr-help">오류 기록도 저장하지 못했습니다. 새로고침 전에 전체 로그를 복사해 주세요.</p>');
    if(pending.length)rows.push('<p class="sr-help">확인하지 못한 구간은 보존합니다. 새 답변 처리는 계속하며, 가능한 다음 수집에서 함께 확인합니다.</p>');
    for(const [field,label]of [['current_situation','현재 상황'],['remaining_effects','남은 여파']]){
        const text=context?.[field],fieldStatus=context?.fieldStatus?.[field];
        const value=fieldStatus==='unavailable'?'원문 변경 · 재수집 대기':fieldStatus==='uncollected'?'아직 수집 전':typeof text==='string'?(text||'남길 내용 없음'):'아직 수집 전';
        rows.push(`<div class="sr-decision-row"><span>${escape(label)}</span><strong>${escape(value)}</strong></div>`);
    }
    root.innerHTML=rows.join('');
}
return {renderReasonerProfiles,renderContinuity};
}
