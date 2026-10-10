import {notifySceneReaderToast} from './toasts.js';

export const analysisMessages={
 accepted:['info','확인 요청을 받았습니다. 준비가 끝나면 확장 연결 모델로 분석합니다.'],
 disabled:['warning','설정에서 씬판독기와 연속성 추론을 켜 주세요.'],
 needs_setup:['warning','설정에서 확장 연결 프로필을 선택하고 연결 확인을 해 주세요.'],
 busy:['info','이미 분석 중이거나 취소를 마무리하고 있습니다. 잠시 후 확인해 주세요.'],
 no_source:['info','분석할 완성된 RP 답변이 없습니다. 대화를 진행한 뒤 눌러 주세요.'],
 needs_review:['success','수집 완료 · 기억·인물 변화에서 후보를 확인하세요. 확인 대기 항목을 검토해 주세요.'],
 saved:['success','수집 완료 · 저장한 기억과 변화를 다음 판독부터 참고합니다.'],
 empty:['success','분석 완료 · 새로 저장할 변화는 없습니다.'],
 already_analyzed:['info','새로 분석할 대화가 없습니다. 이미 수집한 구간은 다시 호출하지 않습니다.'],
 source_unavailable:['warning','숨김·수정으로 읽을 수 없는 구간이 있습니다. 원문 상태를 확인해 주세요.'],
 partial:['warning','일부 내용을 분석하지 못했습니다. 확인된 내용은 유지합니다.'],
 cancelled:['info','분석을 중단했습니다. 채팅이나 설정이 바뀌었으면 다시 눌러 주세요.'],
 failed:['error','변화 분석에 실패했습니다. 상단 상태 버튼과 전체 진단 로그를 확인해 주세요.'],
};

// Feedback belongs to the UI; the analysis service returns only safe outcomes.
export function bindAnalysisActions(deps,{notify=(level,message)=>notifySceneReaderToast(deps.window,level,message,'씬판독기')}={}) {
 const button=deps.document.getElementById('sr-analysis-now');
 button?.addEventListener('click',async()=>{
  const key=deps.stateChatKey(),analysis=deps.analysis;
  const show=outcome=>{if(outcome?.status==='needs_review'&&outcome.collected===false){notify('info','이미 수집한 후보가 확인을 기다리고 있습니다. 수집 내용 보기에서 확인하세요.');return;}const [level,message]=analysisMessages[outcome?.status]||analysisMessages.failed;notify(level,message);};
  try{
   if(deps.checkVisibility)await deps.checkVisibility();const request=analysis?.requestManual();show(request);
   if(request?.status!=='accepted')return;
   const result=await request.completion;
   if(key===deps.stateChatKey()&&analysis===deps.analysis)show(result);
  }catch{if(key===deps.stateChatKey())show({status:'failed'});}
 });
 const historyButton=deps.document.getElementById('sr-history-now');
 historyButton?.addEventListener('click',async()=>{
  const key=deps.stateChatKey();try{if(deps.checkVisibility)await deps.checkVisibility();const request=deps.historyAnalysis?.request({books:deps.document.getElementById('sr-history-book-list')?.dataset.loaded==='true'?[...deps.document.querySelectorAll('[data-history-book]')].filter(e=>e.checked).map(e=>e.dataset.historyBook):undefined});
   if(request?.status!=='accepted'){const [level,message]=analysisMessages[request?.status]||analysisMessages.failed;notify(level,message);return;}
   notify('info','이전 기억을 읽습니다.');const result=await request.completion;if(key!==deps.stateChatKey())return;
   const messages={history_ready:'이전 이야기 확인 완료 · 변경 후보를 검토해 주세요.',history_partial:'일부 확인 완료 · 후보는 유지하며 이어 확인할 수 있습니다.',no_history:'읽을 이전 이야기가 없습니다.'};
   if(messages[result?.status])notify('info',messages[result.status]);else {const [level,message]=analysisMessages[result?.status]||analysisMessages.failed;notify(level,message);}
  }catch{if(key===deps.stateChatKey())notify(...analysisMessages.failed);}
 });
 deps.document.getElementById('sr-history-stop')?.addEventListener('click',()=>{deps.analysis?.cancel('history_manual_stop');notify('info','분석을 중단합니다. 완료한 내용은 유지합니다.');});
 const books=deps.document.getElementById('sr-history-books');books?.addEventListener('toggle',()=>{if(!books.open)return;const root=deps.document.getElementById('sr-history-book-list');const prior=new Map([...root.querySelectorAll('[data-history-book]')].map(e=>[e.dataset.historyBook,e.checked]));root.dataset.loaded='true';root.replaceChildren();for(const name of deps.historyAnalysis?.books()||[]){const label=deps.document.createElement('label'),input=deps.document.createElement('input');label.className='checkbox_label';input.type='checkbox';input.dataset.historyBook=name;input.checked=prior.get(name)??true;label.append(input,deps.document.createTextNode(name));root.append(label);}});
}

export function notifyAutomaticAnalysis(window,outcome,{notify=(level,message)=>notifySceneReaderToast(window,level,message,'씬판독기')}={}){if(outcome?.collected!==false&&['saved','needs_review','failed','partial','needs_setup'].includes(outcome?.status)){const [level,message]=analysisMessages[outcome.status];notify(level,message);}}
