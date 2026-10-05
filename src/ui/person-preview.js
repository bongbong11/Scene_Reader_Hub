import { RECORD_LABELS } from "../character/records.js";
import {downloadCharacterBank} from './character-download.js';
import {loadBankRecords} from '../storage/character-pages.js';

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
    const records=Array.isArray(bank?.records)?bank.records.slice(0,50):[];
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
    recordPanel.innerHTML=`<p class="sr-help">${version?'선택한 날짜의 저장본':'현재 적용된 기록'} · ${bank?.pagedRecords?.count??bank?.records?.length??0}개 판독 기록</p>${reference?`<details class="sr-record-group"><summary>추가 인물 참고 정보</summary><p>${esc(reference)}</p></details>`:''}${groups || '<p class="sr-help">저장된 판독 기록이 없습니다.</p>'}`;
    if(bank?.pagedRecords||bank?.records?.length>50){const token={};recordPanel.srPageToken=token;let offset=0;const pager=document.createElement('div');pager.className='sr-preview-pages';const content=document.createElement('div'),previous=document.createElement('button'),next=document.createElement('button'),label=document.createElement('small');previous.className=next.className='menu_button';previous.textContent='이전 50개';next.textContent='다음 50개';const count=bank.pagedRecords?.count??bank.records.length;
        const render=async at=>{previous.disabled=next.disabled=true;try{const page=bank.pagedRecords?await loadBankRecords(bank,{offset:at}):{records:bank.records.slice(at,at+50)};if(recordPanel.srPageToken!==token)return;offset=at;content.innerHTML=page.records.map(record=>`<article class="sr-record-card"><strong>${esc(RECORD_LABELS[record.type]||record.type)}</strong><p>${esc(String(record.rule||'').slice(0,16000))}</p></article>`).join('');label.textContent=`${offset+1}–${Math.min(count,offset+50)} / ${count}`;}catch{if(recordPanel.srPageToken===token)content.textContent='기록을 읽지 못했습니다. 이전·다음 버튼으로 다시 시도하거나 로그를 확인해 주세요.';}finally{previous.disabled=offset===0;next.disabled=offset+50>=count;}};
        previous.addEventListener('click',()=>void render(Math.max(0,offset-50)));next.addEventListener('click',()=>void render(offset+50));pager.append(previous,label,next);recordPanel.replaceChildren(pager,content);void render(0);
    }else recordPanel.srPageToken=null;
    if(bank){const download=document.createElement('button');download.type='button';download.className='menu_button';download.textContent='인물 JSON 내려받기';download.addEventListener('click',async()=>{download.disabled=true;try{await downloadCharacterBank(document,bank);}catch(error){download.textContent='내려받기 실패 · 다시 시도';download.title=error.message;}finally{download.disabled=false;}});recordPanel.prepend(download);}
    const showSource=sourceOnly && hasSource;
    sourcePanel.hidden=!showSource;
    recordPanel.hidden=showSource;
    sourceTab.classList.toggle('active',showSource);
    recordTab.classList.toggle('active',!showSource);
    modal.hidden=false;
}
