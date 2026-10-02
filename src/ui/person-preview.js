import { RECORD_LABELS } from "../character/records.js";

const readable = value => ({fact:'확정 서술',habit:'습관',preference:'선호',tendency:'경향',conditional:'조건부',possibility:'가능성',negation:'부정·금지',explicit:'원문에 명시',direct_inference:'원문에서 직접 도출',knows:'알고 있음',believes:'믿고 있음',suspects:'의심함',doubts:'확신하지 못함',misunderstands:'잘못 이해함',does_not_know:'모름',none:'해당 없음',self:'자기 자신',person:'다른 인물',relationship:'관계',history:'과거',event:'사건',secret:'비밀',professional:'전문 분야',organization:'조직',world:'세계',current:'현재 상황'}[value] || value || '');

export function openPersonPreview(document, esc, {entry, version=null, title='', sourceOnly=false}) {
    const snapshot=version ? version.entrySnapshot || {} : entry || {};
    const bank=sourceOnly?null:version?.bank || entry?.recordBank || null;
    const source=String(snapshot.source || '').trim();
    const lore=Array.isArray(snapshot.selectedLore)?snapshot.selectedLore:[];
    const hasSource=Boolean(source || lore.length);
    const modal=document.getElementById('sr-character-preview');
    const sourceTab=document.getElementById('sr-character-preview-source-tab');
    const recordTab=document.getElementById('sr-character-preview-record-tab');
    const sourcePanel=document.getElementById('sr-character-preview-source');
    const recordPanel=document.getElementById('sr-character-analysis-result');
    document.getElementById('sr-character-preview-title').textContent=title || snapshot.name || bank?.entity_name || '인물 기록';
    sourceTab.hidden=!hasSource;
    recordTab.hidden=sourceOnly;
    sourcePanel.innerHTML=(source?`<section><strong>시트 원문</strong><pre>${esc(source)}</pre></section>`:'')+lore.map(item=>`<section><strong>${esc(item.book || '로어북')} · ${esc(item.title || item.uid || '엔트리')}</strong><pre>${esc(item.content || '')}</pre></section>`).join('');
    const records=Array.isArray(bank?.records)?bank.records:[];
    const groups=Object.entries(RECORD_LABELS).map(([type,label])=>{
        const rows=records.filter(record=>record.type===type);
        if(!rows.length)return '';
        return `<details class="sr-record-group" open><summary>${esc(label)} · ${rows.length}</summary>${rows.map(record=>{
            const scope=[record.target,...(Array.isArray(record.when)?record.when:[])].filter(Boolean).join(' · ');
            const epistemic=record.type==='knowledge'?` · ${readable(record.knowledge_domain)} / ${readable(record.knowledge_state)}`:'';
            const sources=(record.source_ids || []).map(id=>bank?.sources?.find(item=>item.id===id)).filter(Boolean);
            return `<article class="sr-record-card"><p>${esc(record.rule || '')}</p><div class="sr-record-meta">${esc(scope || '일반')}</div><details><summary>근거·상태·원문</summary><p class="sr-help">${esc(readable(record.modality))} · ${esc(readable(record.basis))}${esc(epistemic)}</p>${sources.map(item=>`<div class="sr-record-source"><strong>${esc(item.id)} · ${esc(item.label || '')}</strong><p>${esc(item.text || '')}</p></div>`).join('')}</details></article>`;
        }).join('')}</details>`;
    }).join('');
    const reference=String(bank?.intimacy_reference?.text || '').trim();
    recordPanel.innerHTML=`<p class="sr-help">${version?'선택한 날짜의 저장본':'현재 적용된 기록'} · ${records.length}개 판독 기록</p>${reference?`<details class="sr-record-group"><summary>추가 인물 참고 정보</summary><p>${esc(reference)}</p></details>`:''}${groups || '<p class="sr-help">저장된 판독 기록이 없습니다.</p>'}`;
    const showSource=sourceOnly && hasSource;
    sourcePanel.hidden=!showSource;
    recordPanel.hidden=showSource;
    sourceTab.classList.toggle('active',showSource);
    recordTab.classList.toggle('active',!showSource);
    modal.hidden=false;
}
