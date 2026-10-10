import {createReviewPromptEditor} from './review-prompt-editor.js';
import {createReplacementTool} from '../character/replacement-tool.js';
export function bindReplacementTool(deps){
 const trigger=deps.document.getElementById('sr-replacement-open');if(!trigger)return;
 const tool=createReplacementTool(deps);let popup=null,reviewed=null,openingKey='',resizeObserver=null;
 const close=()=>{resizeObserver?.disconnect();resizeObserver=null;tool.cancel();reviewed=null;popup?.close();popup?.remove();popup=null;};
 trigger.addEventListener('click',()=>{
  if(!deps.ownerUnlocked())return;close();openingKey=deps.stateChatKey();
  popup=deps.document.createElement('dialog');popup.className='sr-replacement-dialog';popup.dataset.srTool='replacement';
  popup.innerHTML=`<header><h3>👤 인물기록 업데이트</h3><button type="button" data-close title="닫기" aria-label="닫기">×</button></header><div class="sr-replacement-body"><label>캐릭터·페르소나 원본<select data-person class="text_pole"></select></label><p class="sr-help">현재 채팅 모델이 이야기 속 변화를 확인합니다. 질문과 답은 채팅에 남기지 않으며 파일을 자동으로 바꾸지 않습니다.</p><details data-prompt-editor class="sr-review-prompt-editor"></details><div class="sr-replacement-actions"><button type="button" data-review class="menu_button">현재 인물 변화 확인</button><button type="button" data-copy class="menu_button">교체파일 명령문 복사</button></div><p data-status role="status" class="sr-help">인물을 선택하고 확인하세요.</p><label>확인한 답변 · 영어<textarea data-answer class="text_pole" placeholder="답변을 확인하고 필요한 부분을 수정하세요."></textarea></label><div class="sr-replacement-translation-tools"><button type="button" data-translate class="menu_button" title="한국어 번역 보기" aria-label="한국어 번역 보기"><i class="fa-solid fa-language" aria-hidden="true"></i><span>번역</span></button></div><div data-translation hidden class="sr-replacement-translation" lang="ko"></div><details><summary>사용 방법</summary><p class="sr-help">영어 답변을 확인한 뒤 명령문을 복사해 외부 AI에 붙여 넣으세요. 선택한 인물의 전체 원본 JSON이 포함됩니다. 완성한 .json 파일은 기존 인물 추가 화면에서 검증하고 직접 적용하세요.</p><p class="sr-help">현재 모델에 전달되는 대화와 기억 범위 안에서만 확인합니다. 출력 한도는 현재 모델 설정을 따릅니다. 빠진 내용이나 추측이 있으면 답변을 직접 고쳐 주세요. 번역은 확인용이며 복사에는 영어 답변이 들어갑니다. 창을 닫으면 답변은 지워집니다.</p></details></div>`;
  deps.dialog.append(popup);let working=false;const view=popup,$=s=>view.querySelector(s),select=$('[data-person]'),answer=$('[data-answer]'),status=$('[data-status]'),translation=$('[data-translation]');let translatedSource='',editor=null;
  const clearTranslation=()=>{translatedSource='';translation.textContent='';translation.hidden=true;};
  for(const entry of tool.entries()){const option=deps.document.createElement('option');option.value=entry.id;option.textContent=entry.name;select.append(option);}
  if(deps.characterAnalysisSelection?.id&&[...select.options].some(o=>o.value===deps.characterAnalysisSelection.id))select.value=deps.characterAnalysisSelection.id;
  const current=()=>popup===view&&view.open&&deps.ownerUnlocked()&&openingKey===deps.stateChatKey();
  const size=()=>{answer.style.height='auto';answer.style.height=Math.max(180,answer.scrollHeight)+'px';};
  const controls=()=>{select.disabled=working;$('[data-review]').disabled=working||!select.value;$('[data-copy]').disabled=working||!select.value||!answer.value.trim();$('[data-translate]').disabled=working||!select.value||!answer.value.trim();answer.readOnly=working;editor?.setBusy(working);};
  async function run(action){if(working||!current())return;working=true;controls();try{await action();}catch(error){if(current())status.textContent=error.message||'작업을 완료하지 못했습니다.';}finally{working=false;if(current())controls();}}
  select.addEventListener('change',()=>{tool.cancel();reviewed=null;answer.value='';clearTranslation();status.textContent='선택한 인물의 변화를 확인하세요.';size();controls();});
  answer.addEventListener('input',()=>{clearTranslation();size();controls();});
  $('[data-review]').addEventListener('click',()=>run(async()=>{status.textContent='현재 채팅 모델에 확인 중…';const result=await tool.review(select.value,editor.getTemplate());if(!current())return;reviewed=result;answer.value=result.text;clearTranslation();size();status.textContent='확인 완료 · 내용을 검토한 뒤 명령문을 복사하세요.';}));
  $('[data-translate]').addEventListener('click',()=>run(async()=>{if(reviewed&&!reviewed.valid())throw new Error('대화나 원본이 바뀌었습니다. 다시 확인해 주세요.');const original=answer.value;if(translatedSource===original){translation.hidden=!translation.hidden;return;}status.textContent='한국어로 번역 중…';const text=await tool.translate(select.value,original);if(!current()||answer.value!==original)return;translation.textContent=text;translation.hidden=false;translatedSource=original;status.textContent='번역 완료 · 영어 원문은 그대로 유지됩니다.';}));
  $('[data-copy]').addEventListener('click',()=>run(async()=>{if(reviewed&&!reviewed.valid())throw new Error('대화나 원본이 바뀌었습니다. 다시 확인해 주세요.');status.textContent='전체 원본 파일을 준비하는 중…';const prompt=await tool.prompt(select.value,answer.value);if(!current())return;await deps.copyText(prompt);if(current())status.textContent='복사 완료 · 외부 AI에 붙여 넣어 새 파일을 만드세요.';}));
  editor=createReviewPromptEditor({container:$('[data-prompt-editor]'),deps,run,current,getName:()=>tool.entries().find(entry=>entry.id===select.value)?.name,status});
  $('[data-close]').addEventListener('click',close);view.addEventListener('cancel',e=>{e.preventDefault();close();});
  view.showModal();size();controls();let lastWidth=answer.clientWidth;resizeObserver=new deps.window.ResizeObserver(()=>{if(current()&&answer.clientWidth!==lastWidth){lastWidth=answer.clientWidth;size();editor.resize();}});resizeObserver.observe(answer);if(!select.value)status.textContent='현재 방에 저장된 캐릭터·페르소나 JSON이 없습니다.';
 });
 deps.dialog.addEventListener('close',close);
 // UI locking and room changes discard this transient view, never saved files.
 const observer=new deps.window.MutationObserver(()=>{if(popup&&(!deps.ownerUnlocked()||openingKey!==deps.stateChatKey()))close();});
 observer.observe(deps.dialog,{subtree:true,attributes:true,attributeFilter:['hidden']});
 return {close};
}
