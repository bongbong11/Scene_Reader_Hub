import {cleanReviewText} from '../character/review-text.js';

export function createReviewReference(container,getState){
 container.innerHTML='<p data-reference-status class="sr-help"></p><details><summary>참고할 이전 답변 보기</summary><p class="sr-help">현재 인물 변화 확인에 보낼 답변</p><div data-previous class="sr-review-reference-text"></div><section data-retry-reference hidden><p class="sr-help">재시도에 사용할 이전 답변 · 방금 받은 답변은 포함하지 않습니다.</p><div data-retry-previous class="sr-review-reference-text"></div></section><details data-wire><summary>실제 전송 명령문 보기</summary><p class="sr-help">현재 인물 변화 확인</p><div data-next-prompt class="sr-review-reference-text"></div><section data-retry-wire hidden><p class="sr-help">재시도 · 이 답변을 받을 때의 명령문</p><div data-retry-prompt class="sr-review-reference-text"></div></section></details></details>';
 const $=s=>container.querySelector(s);
 function update(){
  const {text,retry,ready,instruction}=getState(),previous=cleanReviewText(text);
  $('[data-reference-status]').textContent=!ready?'':previous?'다음 확인 · 이전 답변 반영':'처음 확인 · 이전 답변 없이 확인합니다';
  $('[data-previous]').textContent=previous||'이전 답변 없음';
  $('[data-retry-reference]').hidden=!retry;
  $('[data-retry-previous]').textContent=retry?.previous||'이전 답변 없음';
  $('[data-retry-wire]').hidden=!retry;
  if($('[data-wire]').open&&ready){
   try{$('[data-next-prompt]').textContent=instruction();}catch(error){$('[data-next-prompt]').textContent=error.message;}
   $('[data-retry-prompt]').textContent=retry?instruction(retry):'';
  }
 }
 $('[data-wire]').addEventListener('toggle',update);
 return {update};
}
