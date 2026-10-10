import {evolutionMatchesBase} from '../character/evolution.js';
import {stableFingerprint} from '../decision/policy.js';
import {RECORD_LABELS} from '../character/records.js';
export function renderEvolutionStatus({document,record,settings,store,escapeHtml,analysis}) {
 const status=document.getElementById('sr-analysis-status'),root=document.getElementById('sr-evolution-results');
 const runtime=record?.analysisRuntimeV1,savedRun=runtime?.lastRun,run=savedRun?.status==='running'&&!analysis?.busy?{...savedRun,status:'interrupted'}:savedRun;
 const reviewCount=(runtime?.pendingBatches||[]).flatMap(b=>b.candidates||[]).filter(c=>c.status==='needs_review').length;
 const label={interrupted:'분석 중단 · 다시 확인 가능',waiting:'다음 수집까지 대기',queued:'분석 준비 중',running:'별도 분석 중 · 롤플은 계속 진행',pending_jev:'수집 완료 · 다음 판독에서 검증',saved:'검증 완료 · 변경 항목 반영',reviewed:'검증 완료',empty:'확인 완료 · 새 변화 없음',partial:'일부 분석 대기 · 확인한 내용은 유지',failed:'분석 실패 · 기본 판독 유지'}[run?.status]||'새 답변부터 수집';
 if(status)status.textContent=!settings.continuityEnabled?'연속성 추론 꺼짐':!settings.reasonerProfileId?'설정에서 확장 연결 프로필을 선택하세요.':label+(run?.status==='waiting'?runtime?.openScene?' · 장면 종료 후 확인':` · ${run.turnCount||0}/${Number(settings.continuityInterval)===5?5:3}턴`:'')+(reviewCount?' · 확인 필요 '+reviewCount+'개 · 해당 원본 유지':'')+(runtime?.coverageGaps?.length?' · 숨김·수정으로 확인 못한 구간 있음':'');
 if(!root)return;
 const names=new Map([...(store?.characters||[]),...(store?.npcs||[]),...[store?.persona].filter(Boolean)].map(a=>[a.id,a.name]));
 const people=[...(store?.characters||[]),...(store?.npcs||[]),...[store?.persona].filter(Boolean)];
 const originalText=e=>{const bank=people.find(p=>p.id===e.actorId)?.recordBank;const original=bank?.records?.find((r,i)=>(bank.recordIndices?.[i]??i)===e.baseRef?.index&&stableFingerprint(r)===e.baseRef?.recordDigest);return original?.rule||'등록된 파일의 해당 기록';};
 const entries=(record?.characterEvolutionV1?.entries||[]).filter(e=>['active','needs_review'].includes(e.status)&&evolutionMatchesBase(e,store));
 root.innerHTML=entries.slice(-6).map(e=>`<details class="sr-help"><summary>${escapeHtml(names.get(e.actorId)||'인물')} · ${escapeHtml(RECORD_LABELS[e.category]||e.category)} · ${e.status==='needs_review'?'길이 한도 · 적용 대기':e.baseRef?'변경 기록으로 대체':'현재 상태 반영'}</summary>${e.baseRef?'<p>원본: '+escapeHtml(originalText(e))+'</p>':''}<p>${escapeHtml(e.compactRule||e.stateSummary||'')}</p><p>근거: ${escapeHtml((e.evidenceRefs||[]).map(r=>r.quote).filter(Boolean).join(' · '))}</p><button type="button" class="menu_button" data-sr-exclude-change="${escapeHtml(e.id)}">이 변화 제외</button></details>`).join('');
 const button=document.getElementById('sr-analysis-now');if(button)button.disabled=!settings.enabled||!settings.continuityEnabled||!settings.reasonerProfileId||Boolean(analysis?.busy);
}
