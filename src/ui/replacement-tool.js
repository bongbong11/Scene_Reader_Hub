import {createReplacementTool} from '../character/replacement-tool.js';
export function bindReplacementTool(deps){
 const trigger=deps.document.getElementById('sr-replacement-open');if(!trigger)return;
 const tool=createReplacementTool(deps);let popup=null,reviewed=null,openingKey='';
 const close=()=>{tool.cancel();reviewed=null;popup?.close();popup?.remove();popup=null;};
 trigger.addEventListener('click',()=>{
  if(!deps.ownerUnlocked())return;close();openingKey=deps.stateChatKey();
  popup=deps.document.createElement('dialog');popup.className='sr-replacement-dialog';popup.dataset.srTool='replacement';
  popup.innerHTML=`<header><h3>교체파일 생성하기</h3><button type="button" data-close title="닫기" aria-label="닫기">×</button></header><div class="sr-replacement-body"><label>캐릭터·페르소나 원본<select data-person class="text_pole"></select></label><p class="sr-help">현재 채팅 모델이 이야기 속 변화를 확인합니다. 질문과 답은 채팅에 남기지 않으며 파일을 자동으로 바꾸지 않습니다.</p><div class="sr-replacement-actions"><button type="button" data-review class="menu_button">현재 인물 변화 확인</button><button type="button" data-copy class="menu_button">교체파일 명령문 복사</button></div><p data-status role="status" class="sr-help">인물을 선택하고 확인하세요.</p><label>확인한 답변<textarea data-answer class="text_pole" placeholder="답변을 확인하고 필요한 부분을 수정하세요."></textarea></label><details><summary>사용 방법</summary><p class="sr-help">답변을 확인한 뒤 명령문을 복사해 외부 AI에 붙여 넣으세요. 선택한 인물의 전체 원본 JSON이 포함됩니다. 완성한 .json 파일은 기존 인물 추가 화면에서 검증하고 직접 적용하세요.</p><p class="sr-help">현재 모델에 전달되는 대화와 기억 범위 안에서만 확인합니다. 빠진 내용이나 추측이 있으면 답변을 직접 고쳐 주세요. 창을 닫으면 이 답변은 지워집니다.</p></details></div>`;
  deps.dialog.append(popup);let working=false;const view=popup,$=s=>view.querySelector(s),select=$('[data-person]'),answer=$('[data-answer]'),status=$('[data-status]');
  for(const entry of tool.entries()){const option=deps.document.createElement('option');option.value=entry.id;option.textContent=entry.name;select.append(option);}
  if(deps.characterAnalysisSelection?.id&&[...select.options].some(o=>o.value===deps.characterAnalysisSelection.id))select.value=deps.characterAnalysisSelection.id;
  const current=()=>popup===view&&view.open&&deps.ownerUnlocked()&&openingKey===deps.stateChatKey();
  const size=()=>{answer.style.height='auto';answer.style.height=Math.max(180,answer.scrollHeight)+'px';};
  const controls=()=>{select.disabled=working;$('[data-review]').disabled=working||!select.value;$('[data-copy]').disabled=working||!select.value||!answer.value.trim();};
  async function run(action){if(working||!current())return;working=true;controls();try{await action();}catch(error){if(current())status.textContent=error.message||'작업을 완료하지 못했습니다.';}finally{working=false;if(current())controls();}}
  select.addEventListener('change',()=>{tool.cancel();reviewed=null;answer.value='';status.textContent='선택한 인물의 변화를 확인하세요.';size();controls();});
  answer.addEventListener('input',()=>{size();controls();});
  $('[data-review]').addEventListener('click',()=>run(async()=>{status.textContent='현재 채팅 모델에 확인 중…';const result=await tool.review(select.value);if(!current())return;reviewed=result;answer.value=result.text;size();status.textContent='확인 완료 · 내용을 검토한 뒤 명령문을 복사하세요.';}));
  $('[data-copy]').addEventListener('click',()=>run(async()=>{if(reviewed&&!reviewed.valid())throw new Error('대화나 원본이 바뀌었습니다. 다시 확인해 주세요.');status.textContent='전체 원본 파일을 준비하는 중…';const prompt=await tool.prompt(select.value,answer.value);if(!current())return;await deps.copyText(prompt);if(current())status.textContent='복사 완료 · 외부 AI에 붙여 넣어 새 파일을 만드세요.';}));
  $('[data-close]').addEventListener('click',close);view.addEventListener('cancel',e=>{e.preventDefault();close();});
  view.showModal();size();controls();if(!select.value)status.textContent='현재 방에 저장된 캐릭터·페르소나 JSON이 없습니다.';
 });
 deps.dialog.addEventListener('close',close);
 // UI locking and room changes discard this transient view, never saved files.
 const observer=new deps.window.MutationObserver(()=>{if(popup&&(!deps.ownerUnlocked()||openingKey!==deps.stateChatKey()))close();});
 observer.observe(deps.dialog,{subtree:true,attributes:true,attributeFilter:['hidden']});
 return {close};
}
