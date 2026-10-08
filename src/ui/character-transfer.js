import { setCharacterImportMode, characterImportMode } from './character-import-mode.js';
import { notifySceneReaderToast } from './toasts.js';
import { castCompilerPrompt, importRecordBundle, validateRecordBundle } from "../character/bundles.js";
import { characterCopyNotice } from './compiler-copy.js';
import {digest} from '../storage/shared-document.js';
import {downloadStoredFile} from '../storage/backup-stream.js';
import {readCharacterFile} from '../storage/character-file.js';
import { applyRecordVersion, deleteRecordVersion, bankOutput, allEntries } from "../character/versions.js";
import { characterDeletionTarget, characterDeletionNotice, deleteCharacterRecords } from '../character/deletion.js';

export { renderRecordBundles as renderRecordVersions } from "./record-bundles.js";

export function bindCharacterTransfer(deps, {characterForm, invalidatePreparedJudgment, downloadJson, ensureLoreLoaded, captureCharacterError, showVersionEditor, showVersionPreview}) {
    const el=id=>deps.document.getElementById(id);
    const status=text=>{if(el('sr-character-import-status'))el('sr-character-import-status').textContent=text;};
    deps.document.querySelectorAll('[data-character-import-mode]').forEach(button=>button.addEventListener('click',()=>{
        if(busy)return;
        uploadedOutputs=null;
        setCharacterImportMode(deps.document,button.dataset.characterImportMode);
        el('sr-character-import-json').value='';
        el('sr-character-import-preview').innerHTML='';
        el('sr-character-file-summary').textContent='선택한 파일 없음 · .json';
        status('선택한 탭의 분석 명령문을 복사하고 완성된 파일을 올리세요.');
    }));
    let busy=false,uploadedOutputs=null,uploadedSourceSignature='';
    const task=(fn,stage='parse',showEditor=true)=>deps.runUiTask((async()=>{
        if(busy) return;
        busy=true;
        try {await fn();} catch(error){captureCharacterError(error,error.characterStage||stage,{showEditor,inputLength:error.characterInputLength ?? (el('sr-character-import-json')?.value?.length||0),saved:Boolean(error.characterSaved),applied:Boolean(error.characterApplied)});status(`${error.characterSaved?'저장은 완료됐지만 화면 반영 실패':'저장되지 않음'} · ${error.message}`);throw error;} finally{busy=false;}
    })(),'인물 기록 작업을 완료하지 못했습니다.');
    async function persist(next, entry) {
        const job=deps.jobs.begin('character-transfer'), chat=deps.stateChatKey();
        let saved=false,applied=false;
        try {
            const result=await deps.saveCharacterStore(chat,next);
            saved=true;
            if(chat!==deps.stateChatKey())return false;
            job.assert();
            deps.characterStore=deps.normalizeCharacterStore(result?.characters||next);
            applied=true;
            job.finish();
            invalidatePreparedJudgment();
            const rec=deps.record(true);
            await deps.clearInjection({chatKey:chat});await deps.persistChat(chat,rec);
            if(chat!==deps.stateChatKey())return false;
            if(entry)deps.characterAnalysisSelection={kind:entry.kind,id:entry.id};
            deps.renderCharacterStore();
            return true;
        } catch(error){error.characterSaved=saved;error.characterApplied=applied;error.characterStage=saved?'apply':'save';throw error;} finally {job.finish();}
    }
    const npcSheet=`NPC 시트\n이름: \n역할·소속: \n주요 관계: \n원하는 것과 우선순위: \n평소 행동·대사: \n확인된 지식·능력·접근 범위: \n조건별 반응과 제한: \n지속적인 감정·충동 경향과 자제 방식(있는 경우만): `;
    el('sr-character-npc-template')?.addEventListener('click',()=>task(async()=>{await deps.copyText(npcSheet);status('NPC 시트 서식을 복사했습니다.');},'template'));
    el('sr-character-copy-prompt')?.addEventListener('click',()=>task(async()=>{
        // No selected lore means no dependency on a background lorebook request.
        if(characterForm().selectedLore?.length)await ensureLoreLoaded();
        const form=characterForm();
        const prompt=castCompilerPrompt(form);
        await deps.copyText(prompt);
        const notice=characterCopyNotice(deps.document,form.selectedLore);
        const message=notice.included?'선택한 원문을 포함해 분석 명령문을 복사했습니다.':'기본 분석 명령문만 복사했습니다. 사용할 시트·로어북 원문을 함께 넣어 주세요.';
        status(message+' 완성한 JSON 파일을 업로드하세요.');
        notifySceneReaderToast(deps.window,'success',message,'씬판독기');
        if(!el('sr-character-import-name').value.trim())el('sr-character-import-name').value=form.name;
    }),'prompt');
    el('sr-character-import')?.addEventListener('click',()=>task(async()=>{
        if(!el('sr-character-import-json').value.trim()) {
            status('저장할 인물 JSON이 없습니다. 파일 업로드 단계의 오류 안내를 확인하고 JSON 파일을 다시 선택하세요.');
            notifySceneReaderToast(deps.window,'warning','JSON 파일 업로드 후 형식 검사 완료 안내를 확인해 주세요.','씬판독기');
            return;
        }
        if(characterForm().selectedLore?.length)await ensureLoreLoaded();
        const form=characterForm();
        if(form.kind==='character' && form.importMode==='multi' && !form.cardCast && !form.name) {
            const context=deps.getContext(),card=context.characters?.[context.characterId];
            form.cardCast={cardName:card?.data?.name || card?.name || context.name2 || ''};
        }
        const sourceHash=form.source ? await deps.sha256Hex(form.source) : '';
        if(uploadedOutputs&&uploadedSourceSignature!==digest([form.source,form.selectedLore]))throw new Error('파일 확인 후 원문이 바뀌었습니다. 인물 JSON 파일을 다시 불러와 주세요.');
        const result=importRecordBundle(deps.characterStore,el('sr-character-import-json').value,el('sr-character-import-name').value,{...form,sourceHash});
        if(uploadedOutputs)for(const entry of result.entries){const packed=uploadedOutputs.find(value=>value.entity_name===entry.name);if(!packed?.pagedRecords)continue;Object.assign(entry.recordBank,{pagedRecords:packed.pagedRecords,storageRefs:packed.storageRefs,recordIndices:packed.recordIndices,seedRecords:packed.seedRecords,seedIndices:packed.seedIndices,recordIds:[]});const version=result.store.recordGroups.flatMap(group=>group.versions).find(version=>version.id===entry.appliedRecordVersion);if(version)version.bank=structuredClone(entry.recordBank);}
        if(!await persist(result.store,result.entry))return;
        const label=result.entries.map(entry=>entry.name).join(", ");
        status(`${label} · ${result.entries.length}명을 묶음으로 저장하고 각각 적용했습니다.`);
        el('sr-character-editor-cancel')?.click();
        notifySceneReaderToast(deps.window, 'success', `${label} 판독시트를 저장·적용했습니다.`, '씬판독기');
    },'validate'));
    async function readFile(file) {
        if(!file)return;
        el('sr-character-import-json').value='';
        uploadedOutputs=null;
        if(el('sr-character-import-preview'))el('sr-character-import-preview').innerHTML='';
        el('sr-character-file-summary').textContent=`${file.name} · 아직 저장되지 않음`;
        if(!/\.json$/i.test(file.name))throw new Error('.json 파일을 선택하세요.');
        const chat=deps.stateChatKey(),form=characterForm(),sourceSignature=digest([form.source,form.selectedLore,form.kind,form.importMode]),job=deps.jobs.begin('character-file');let loaded;try{loaded=await readCharacterFile(file,deps.storagePost,form,{signal:job.controller.signal,onProgress:(done,total)=>status(`파일 확인 중 · ${Math.round(done/total*100)}%`)});job.assert();}finally{job.finish();}const raw=loaded.raw;
        const currentForm=characterForm();if(sourceSignature!==digest([currentForm.source,currentForm.selectedLore,currentForm.kind,currentForm.importMode]))throw new Error('파일 확인 중 원문이나 인물 종류가 바뀌었습니다. 파일을 다시 불러와 주세요.');
        if(chat!==deps.stateChatKey())throw new Error('채팅이 바뀌었습니다. 현재 채팅에서 파일을 다시 불러오세요.');
        let outputs;
        try { ({outputs}=validateRecordBundle(raw));if(loaded.outputs){uploadedOutputs=loaded.outputs;uploadedSourceSignature=digest([form.source,form.selectedLore]);outputs=loaded.outputs;} }
        catch(error) { error.characterInputLength=raw.length; error.characterStage='parse'; throw error; }
        if(characterImportMode(deps.document)==='single' && outputs.length>1)throw new Error('여러 인물이 있는 파일입니다. 다인 캐릭터 탭에서 불러오세요.');
        if(characterImportMode(deps.document)==='multi' && outputs.length<2)throw new Error('다인 캐릭터 파일에는 2명 이상이 필요합니다.');
        if(deps.characterEditorKind && outputs.some(output=>output.entity_type!==deps.characterEditorKind))throw new Error('선택한 인물 종류와 JSON의 인물 종류가 다릅니다.');
        el('sr-character-import-json').value=raw;
        const preview=el('sr-character-import-preview'),esc=deps.escapeHtml;
        if(preview)preview.innerHTML=outputs.map(output=>`<details class="sr-import-person-preview"><summary>${esc(output.entity_name)} · ${output.pagedRecords?.count||output.records.length}개 기록 확인</summary><ul>${output.records.slice(0,50).map(record=>`<li>${esc(record.rule)}</li>`).join('')}</ul>${(output.pagedRecords?.count||output.records.length)>50?'<p>전체 기록을 확인했습니다. 미리보기에는 일부 기록만 표시합니다.</p>':''}${output.intimacy_reference?.text?`<p>${esc(output.intimacy_reference.text)}</p>`:''}</details>`).join('');
        el('sr-character-file-summary').textContent=`${file.name} · ${outputs.length}명 · ${outputs.reduce((sum,output)=>sum+(output.pagedRecords?.count||output.records.length),0)}개 기록`;
        if(!el('sr-character-import-name').value.trim())el('sr-character-import-name').value=file.name.replace(/\.json$/i,'');
        status(`형식 검사 완료 · ${outputs.map(output=>output.entity_name).join(', ')} — ${outputs.length}명으로 나눠 저장합니다. 묶음 이름을 확인한 뒤 저장하세요.`);
    }
    el('sr-character-import-file-button')?.addEventListener('click',()=>el('sr-character-import-file').click());
    el('sr-character-import-file')?.addEventListener('change',event=>task(async()=>{try{await readFile(event.target.files?.[0]);}finally{event.target.value='';}}));
    el('sr-character-import-json')?.addEventListener('dragover',event=>event.preventDefault());
    el('sr-character-import-json')?.addEventListener('drop',event=>{event.preventDefault();const file=event.dataTransfer.files?.[0];task(()=>readFile(file));});
    el('sr-character-versions')?.addEventListener('click',event=>{
        const button=event.target.closest('[data-record-action]');if(!button)return;
        task(async()=>{
            const {recordGroup:groupId,recordVersion:versionId,recordAction:action}=button.dataset;
            if(action==='delete-person') {
                const {personKind:kind,personId:id}=button.dataset;
                const target=characterDeletionTarget(deps.characterStore,kind,id);
                if(!deps.window.confirm(characterDeletionNotice(target)))return;
                if(!await persist(deleteCharacterRecords(deps.characterStore,kind,id)))return;
                el('sr-character-preview').hidden=true;
                if(el('sr-character-analysis-result'))el('sr-character-analysis-result').srPageToken=null;
                deps.renderCharacterStore();
                status('인물과 해당 인물의 저장본을 삭제했습니다.');
                notifySceneReaderToast(deps.window,'success','인물과 해당 인물의 저장본을 삭제했습니다.','씬판독기');
                return;
            }
            const group=deps.characterStore.recordGroups.find(g=>g.id===groupId), version=group?.versions.find(v=>v.id===versionId);
            if(!version)throw new Error('저장한 버전을 찾지 못했습니다.');
            if(action==='download'&&version.bank.pagedRecords){const operationId=digest(['character-export',version.id,Date.now()]);await deps.storagePost('v2/character/export',{operationId,bank:version.bank});downloadStoredFile(deps.document,'character/download',{id:operationId},'characters.json');return;}
            if(action==='copy'&&version.bank.pagedRecords)throw new Error('큰 인물 파일은 복사 대신 JSON 내려받기를 사용해 주세요.');
            const output=bankOutput(version.bank);
            if(action==='copy'){await deps.copyText(JSON.stringify(output,null,2));status('판독시트를 복사했습니다.');}
            if(action==='download')downloadJson(`${group.name.replace(/[<>:"/\\|?*]/g,'_')}.json`,output);
            if(action==='view')showVersionPreview(group,version);
            if(action==='apply'){const result=applyRecordVersion(deps.characterStore,groupId,versionId);if(!await persist(result.store,result.entry))return;status('선택한 버전을 적용했습니다. 다음 판독부터 사용합니다.');notifySceneReaderToast(deps.window, 'success', '선택한 날짜의 판독시트를 적용했습니다.','씬판독기');}
            if(action==='edit'){
                const entry=entriesForVersion(deps.characterStore,version,group.kind);
                showVersionEditor(group.kind,entry,group,version);
            }
            if(action==='delete'){
                if(!deps.window.confirm('이 날짜의 판독시트를 삭제할까요? 적용 중인 버전이면 이번 인물의 기록 적용도 해제됩니다.'))return;
                if(!await persist(deleteRecordVersion(deps.characterStore,groupId,versionId)))return;
                el('sr-character-preview').hidden=true;status('해당 버전을 삭제했습니다.');
                notifySceneReaderToast(deps.window, 'success', '해당 날짜의 판독시트를 삭제했습니다.','씬판독기');
            }
        },'apply',button.dataset.recordAction!=='delete-person');
    });
    function entriesForVersion(store,version,kind){return allEntries(store).find(entry=>entry.id===version.entryId&&entry.kind===kind)||version.entrySnapshot||null;}
}
