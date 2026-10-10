import {bindChangeReviewDialog} from './change-review-dialog.js';
import {reviewContent,changeKind,changeKindLabel} from './change-review-content.js';
import {notifySceneReaderToast} from './toasts.js';
import {stableFingerprint} from '../decision/policy.js';
const sourceLabel={chat:'현재 방 대화',charm_summary:'참메모리 요약 · 캐릭터 공통 참고',lorebook:'연결 로어북 참고'};
const stateLabel=c=>c.location==='history'?'이전 이야기 · 검토 필요':({source_hidden:'숨김 근거 · 적용 제외',source_changed:'근거 변경 · 적용 제외',base_changed:'원본 변경 · 적용 제외',source_unavailable:'근거 없음 · 적용 제외',source_unverified:'근거 확인 필요'})[c.sourceStatus]||(c.status==='needs_review'?'확인 필요 · 적용 대기':c.location==='pending'?'수집 후보 · 확인 대기':'적용 중');
const fitDraft=node=>{if(node?.offsetParent){node.style.height='auto';node.style.height=node.scrollHeight+'px';}};
const kindLabel={character:'인물 변화',memory:'기억할 내용',knowledge:'알게 된 정보'};
export function renderChangeReview({document,window,record,changes,analysis,escapeHtml:esc}){
 bindChangeReviewDialog(document);
 const root=document.getElementById('sr-evolution-results');if(!root||!changes)return;
 const items=record?changes.list():[],signature=stableFingerprint(items);
 const names=new Map(changes.people().map(a=>[a.id,a.name]));
 const show=(level,message)=>notifySceneReaderToast(window,level,message,'씬판독기');
 if(root.srReviewSignature!==signature){
  const opened=new Set([...root.querySelectorAll('[data-sr-change]')].filter(e=>e.open).map(e=>e.dataset.srChange));
  root.srReviewSignature=signature;
  root.innerHTML=['record','state','memory'].filter(kind=>items.some(c=>changeKind(c)===kind)).map(kind=>`<h4 class="sr-change-group">${changeKindLabel[kind]}</h4>`+items.filter(c=>changeKind(c)===kind).map(c=>`<details class="sr-help sr-change-review" data-sr-change="${esc(c.id)}"><summary>${esc(names.get(c.data.actorId)||kindLabel[c.type]||'기억')} · ${stateLabel(c)}</summary><div class="sr-change-content"><p class="sr-explanation">${esc([...new Set(c.evidence.map(e=>sourceLabel[e.identity.sourceKind||'chat']||'이전 방 근거'))].join(' · '))}</p>${reviewContent(c,esc)}</div></details>`).join('')).join('')||'<p class="sr-help sr-explanation">수집된 인물 기록 변경과 기억할 내용이 여기에 표시됩니다.</p>';
  for(const row of root.querySelectorAll('[data-sr-change]')){
   let loading=false;
   row.addEventListener('toggle',()=>fitDraft(row.querySelector('textarea')),true);
   row.querySelector('textarea').addEventListener('input',event=>fitDraft(event.target));
   row.addEventListener('toggle',async()=>{if(!row.open||loading||!row.querySelector('[data-original]'))return;loading=true;try{const c=await changes.describe(row.dataset.srChange);if(!row.isConnected)return;row.querySelector('[data-original]').textContent=c.baseline?.rule||c.prior?.compactRule||c.prior?.stateSummary||c.prior?.label||'새로 추가할 상태 · 대응하는 원본 없음';}catch{row.querySelector('[data-original]').textContent='원본이 바뀌어 다시 확인해야 합니다.';}finally{loading=false;}});
   if(opened.has(row.dataset.srChange))row.open=true;
  }
 }
 if(!root.srReviewBound){root.srReviewBound=true;root.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-change-action]'),row=button?.closest('[data-sr-change]');if(!row)return;
  const id=row.dataset.srChange,action=button.dataset.changeAction,status=row.querySelector('[data-change-status]'),draft=row.querySelector('textarea');
  if(analysis?.busy){show('info','분석 중입니다. 끝난 뒤 확인해 주세요.');return;}
  button.disabled=true;status.textContent='처리 중…';
  try{
   if(action==='translate'||action==='review-translation'){
    const requestedDraft=action==='review-translation'?null:draft.value,request=changes.translate(id,requestedDraft,{reviewOnly:action==='review-translation'});if(request.status!=='accepted'){status.textContent='연결 프로필과 분석 상태를 확인해 주세요.';return;}
    const result=await request.completion;if(action==='review-translation'&&result.status==='translated'){show('success','한글 번역을 저장했습니다.');return;}if(!row.isConnected)return;
    if(action==='translate'&&draft.value!==requestedDraft){status.textContent='변환 중 입력이 바뀌어 결과를 덮어쓰지 않았습니다.';return;}
    if(result.status!=='translated'){status.textContent=result.status==='cancelled'?'채팅이나 자료가 바뀌어 중단했습니다.':'번역 실패 · 입력한 내용은 유지합니다.';show('warning',status.textContent);return;}
    draft.value=result.english;fitDraft(draft);const originalKo=row.querySelector('[data-original-ko]');if(originalKo)originalKo.textContent=result.originalKo||'';row.querySelector('[data-replacement-ko]').textContent=result.replacementKo||'';status.textContent='영문을 확인한 뒤 저장을 눌러 주세요.';
   }else{
    if(action==='save')await changes.save(id,draft.value);else if(action==='approve'){if(!await changes.approve(id))throw new Error('자료가 바뀌었습니다. 다시 확인해 주세요.');}else if(!await changes.exclude(id))throw new Error('자료가 바뀌었습니다. 다시 확인해 주세요.');
    show('success',action==='save'?'변경문을 저장했습니다.':action==='approve'?'확인한 내용을 반영했습니다.':'이 변화를 제외했습니다.');
    status.textContent='완료';
   }
  }catch(error){status.textContent=error.message||'처리하지 못했습니다. 로그를 확인해 주세요.';show('warning',status.textContent);}finally{button.disabled=false;}
 });}
 const clear=document.getElementById('sr-clear-collected');
 if(clear&&!clear.srBound){clear.srBound=true;clear.addEventListener('click',async()=>{
  if(!window.confirm('현재 방에서 수집한 기억·인물 변화와 확인 대기 내용을 모두 삭제할까요? 원본 인물 파일, 대화와 다른 방 자료는 유지됩니다. 자동 수집은 새 답변부터 시작하며, 과거 자료는 직접 다시 읽을 수 있습니다.'))return;
  clear.disabled=true;try{if(!await changes.clearAll())throw new Error('자료가 바뀌었습니다. 다시 확인해 주세요.');show('success','수집 내용을 모두 삭제했습니다. 새 답변부터 다시 모읍니다.');}catch(error){show('warning',error.message||'삭제하지 못했습니다. 기존 자료는 유지합니다.');}finally{clear.disabled=false;}
 });}
 const history=record?.historyAnalysisV1,status=document.getElementById('sr-history-status');
 if(status){const label={empty:'읽을 이전 이야기가 없습니다.',partial:'일부 확인 완료 · 이어 확인 가능',complete:'전체 확인 완료',limited:'읽을 수 있는 자료 확인 · 제외된 자료 있음',failed:'분석 실패 · 저장된 후보 유지',running:'이전 이야기 확인 중'}[history?.status]||'과거 자료는 직접 눌렀을 때만 읽습니다.';const sources=history?.sourceStatus;status.textContent=label+(history?.comparison?' · 원본 '+history.comparison.reviewed+'/'+history.baselineTotal+'개 비교 · 변경 '+history.comparison.changed+' · 유지 '+history.comparison.kept+' · 보류 '+history.comparison.uncertain:'')+(history?.translationMissing?' · 번역 미완료 '+history.translationMissing+'개':'')+(history?.pages?' · '+history.pages+'묶음 확인':'')+(sources?' · '+[['대화',sources.chat],['요약',sources.charm],['로어북',sources.lorebook]].map(([n,v])=>n+': '+({ready:'읽음',empty:'없음',unavailable:'미설치',error:'읽기 실패',timeout:'시간 초과',limited:'일부 읽음',partial:'일부 읽음',stale:'자료 바뀜',unsupported:'지원되지 않음'})[v]).join(' / '):'');}
 const stop=document.getElementById('sr-history-stop');if(stop)stop.hidden=!analysis?.busy;
 const button=document.getElementById('sr-history-now');if(button){button.disabled=!analysis||analysis.busy;button.textContent=history?.status==='partial'?'이전 이야기 이어 확인':'이전 이야기 반영';}
}
