import {recordBundleRows} from './record-bundles.js';
import {readCharacterFile} from '../storage/character-file.js';
import {validateRecordBundle} from '../character/bundles.js';
import {addRecordFile} from '../character/record-file.js';
import {notifySceneReaderToast} from './toasts.js';

export function openRecordFile(deps,groupId,persist){
 if(deps.dialog.querySelector('.sr-record-file-dialog'))return;
 const kind=deps.document.getElementById('sr-character-versions').dataset.kind||'character';
 const bundle=recordBundleRows(deps.characterStore,kind).find(item=>item.id===groupId);
 const people=bundle?.people.filter(person=>person.entry)||[];
 if(!people.length)throw new Error('파일을 추가할 인물이 없습니다. 인물을 먼저 등록하세요.');
 const room=deps.stateChatKey(),metadata=deps.getContext().chatMetadata,view=deps.document.createElement('dialog');
 view.className='sr-replacement-dialog sr-record-file-dialog';
 view.innerHTML='<header><h3></h3><button type="button" data-close aria-label="닫기">×</button></header><div class="sr-replacement-body"><label>파일을 추가할 인물<select data-person class="text_pole"></select></label><p class="sr-help">이 묶음 안에 새 날짜로 저장하고 적용합니다. 이전 파일은 남아 있습니다. JSON의 이름 표기가 달라도 선택한 인물 아래에 저장합니다.</p><input data-file type="file" accept=".json,application/json" hidden><div class="sr-replacement-actions"><button type="button" data-pick class="menu_button">JSON 파일 선택</button><button type="button" data-save class="menu_button" disabled>저장·적용</button></div><p data-status class="sr-help" role="status">선택한 인물 한 명의 JSON 파일을 올려 주세요.</p></div>';
 const $=s=>view.querySelector(s),select=$('[data-person]'),note=$('[data-status]');
 $('h3').textContent=bundle.name+' · 파일 추가';
 for(const person of people){const option=deps.document.createElement('option');option.value=person.id;option.textContent=person.entry.name;select.append(option);}
 let loaded=null,controller=null,working=false,stage='character_file_read';
 const report=(status,code)=>deps.noteDiagnostic?.(stage,{module:'src/ui/record-file.js',status,code});
 const valid=()=>view.open&&room===deps.stateChatKey()&&metadata===deps.getContext().chatMetadata;
 const controls=()=>{select.disabled=working||people.length===1;$('[data-pick]').disabled=working;$('[data-save]').disabled=working||!loaded;};
 const observer=new deps.window.MutationObserver(()=>{if(view.open&&!valid())close();});
 const close=()=>{controller?.abort();observer.disconnect();deps.dialog.removeEventListener('close',close);view.close();view.remove();};
 const run=async fn=>{if(working||!valid())return;working=true;controller=new AbortController();controls();try{await fn();}catch(error){report('failed',error.characterSaved?'CHARACTER_FILE_SAVED_REFRESH_FAILED':'CHARACTER_FILE_FAILED');if(valid())note.textContent=(error.characterSaved?'파일은 저장됐지만 화면 반영을 마치지 못했습니다. 다시 열어 확인하세요. · ':'저장되지 않음 · ')+(error.message||'다시 시도하세요.');}finally{working=false;controller=null;if(valid())controls();}};
 select.addEventListener('change',()=>{loaded=null;note.textContent='선택한 인물의 JSON 파일을 올려 주세요.';controls();});
 $('[data-pick]').addEventListener('click',()=>$('[data-file]').click());
 $('[data-file]').addEventListener('change',()=>void run(async()=>{
  const file=$('[data-file]').files?.[0];$('[data-file]').value='';if(!file)return;
  stage='character_file_read';loaded=null;if(!/\.json$/i.test(file.name))throw new Error('.json 파일을 선택하세요.');
  report('started','CHARACTER_FILE_READ');
  note.textContent='파일 확인 중…';
  const result=await readCharacterFile(file,deps.storagePost,{kind,source:'',selectedLore:[],importMode:'single'}, {signal:controller.signal,onProgress:(done,total)=>{if(valid())note.textContent=`파일 확인 중 · ${Math.round(done/total*100)}%`;}});
  if(!valid())return;
  // Validate both the file and its selected destination before offering Save.
  addRecordFile(deps.characterStore,groupId,select.value,result.raw,result.outputs);
  const {outputs}=validateRecordBundle(result.raw);
  loaded=result;note.textContent=`${file.name} · ${outputs[0].entity_name} → ${select.selectedOptions[0].textContent} · 저장 전`;report('succeeded','CHARACTER_FILE_READY');
 }));
 $('[data-save]').addEventListener('click',()=>void run(async()=>{
  if(!loaded)return;
  stage='character_file_save';const result=addRecordFile(deps.characterStore,groupId,select.value,loaded.raw,loaded.outputs);
  report('started','CHARACTER_FILE_SAVE');
  note.textContent='저장 중…';
  if(!await persist(result.store,result.entry))return;
  report('succeeded','CHARACTER_FILE_SAVED');if(valid()){notifySceneReaderToast(deps.window,'success',`${result.entry.name} · 새 파일을 저장·적용했습니다.`,'씬판독기');close();}
 }));
 $('[data-close]').addEventListener('click',close);view.addEventListener('cancel',event=>{event.preventDefault();close();});deps.dialog.addEventListener('close',close);
 deps.dialog.append(view);view.showModal();controls();observer.observe(deps.dialog,{subtree:true,attributes:true,attributeFilter:['hidden']});
}
