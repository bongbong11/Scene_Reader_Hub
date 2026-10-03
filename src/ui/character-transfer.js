import { setCharacterImportMode, characterImportMode } from './character-import-mode.js';
import { notifySceneReaderToast } from './toasts.js';
import { castCompilerPrompt, importRecordBundle, validateRecordBundle } from "../character/bundles.js";
import { buildSources, promptText } from '../vendor/character-reasoner/index.js';
import { applyRecordVersion, deleteRecordVersion, bankOutput, allEntries } from "../character/versions.js";

export { renderRecordBundles as renderRecordVersions } from "./record-bundles.js";

export function bindCharacterTransfer(deps, {characterForm, invalidatePreparedJudgment, downloadJson, ensureLoreLoaded, captureCharacterError, showVersionEditor, showVersionPreview}) {
    const el=id=>deps.document.getElementById(id);
    const status=text=>{if(el('sr-character-import-status'))el('sr-character-import-status').textContent=text;};
    deps.document.querySelectorAll('[data-character-import-mode]').forEach(button=>button.addEventListener('click',()=>{
        if(busy)return;
        setCharacterImportMode(deps.document,button.dataset.characterImportMode);
        el('sr-character-import-json').value='';
        el('sr-character-import-preview').innerHTML='';
        el('sr-character-file-summary').textContent='선택한 파일 없음 · .json';
        status('선택한 탭의 분석 명령문을 복사하고 완성된 파일을 올리세요.');
    }));
    let busy=false;
    const task=(fn,stage='parse')=>deps.runUiTask((async()=>{
        if(busy) return;
        busy=true;
        try {await fn();} catch(error){captureCharacterError(error,error.characterStage||stage,{inputLength:el('sr-character-import-json')?.value?.length||0,saved:Boolean(error.characterSaved),applied:Boolean(error.characterApplied)});status(`${error.characterSaved?'저장은 완료됐지만 화면 반영 실패':'저장되지 않음'} · ${error.message}`);throw error;} finally{busy=false;}
    })(),'인물 기록 작업을 완료하지 못했습니다.');
    async function persist(next, entry) {
        const job=deps.jobs.begin('character-transfer'), chat=deps.stateChatKey();
        let saved=false,applied=false;
        try {
            await deps.saveCharacterStore(chat,next);
            saved=true;
            if(chat!==deps.stateChatKey())return false;
            job.assert();
            deps.characterStore=deps.normalizeCharacterStore(next);
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
        await ensureLoreLoaded();
        const form=characterForm();
        let prompt;
        if(form.kind==='npc'){
            const hasLore=form.selectedLore.length>0;
            const sources=hasLore?buildSources('npc','',form.selectedLore):buildSources('npc','[Completed NPC sheet supplied alongside this instruction]',[]);
            const preface=hasLore?'Use the selected lorebook sheet below as the NPC source. Use its stated name as entity_name.':'The completed NPC sheet is supplied separately with this instruction. Use its stated name as entity_name and treat its contents as source S001.';
            prompt=preface+'\n\n'+promptText({entity_type:'npc',entity_name:'the name written in the supplied NPC sheet',npc_role:form.npcRole==='villain'?'antagonist':form.npcRole,sources});
        } else {
            if(!form.name)throw new Error('먼저 현재 시트를 가져오세요.');
            prompt=castCompilerPrompt(form);
        }
        await deps.copyText(prompt);
        status('분석 명령문을 복사했습니다. 완성한 JSON 파일을 업로드하세요.');
        if(!el('sr-character-import-name').value.trim())el('sr-character-import-name').value=form.name;
    }),'prompt');
    el('sr-character-import')?.addEventListener('click',()=>task(async()=>{
        await ensureLoreLoaded();
        const form=characterForm();
        const sourceHash=form.source ? await deps.sha256Hex(form.source) : '';
        const result=importRecordBundle(deps.characterStore,el('sr-character-import-json').value,el('sr-character-import-name').value,{...form,sourceHash});
        if(!await persist(result.store,result.entry))return;
        const label=result.entries.map(entry=>entry.name).join(", ");
        status(`${label} · ${result.entries.length}명을 묶음으로 저장하고 각각 적용했습니다.`);
        el('sr-character-editor-cancel')?.click();
        notifySceneReaderToast(deps.window, 'success', `${label} 판독시트를 저장·적용했습니다.`, '씬판독기');
    },'validate'));
    async function readFile(file) {
        if(!file)return;
        el('sr-character-import-json').value='';
        if(el('sr-character-import-preview'))el('sr-character-import-preview').innerHTML='';
        el('sr-character-file-summary').textContent=`${file.name} · 아직 저장되지 않음`;
        if(!/\.json$/i.test(file.name))throw new Error('.json 파일을 선택하세요.');
        const chat=deps.stateChatKey(),raw=await file.text();
        if(chat!==deps.stateChatKey())throw new Error('채팅이 바뀌었습니다. 현재 채팅에서 파일을 다시 불러오세요.');
        const {outputs}=validateRecordBundle(raw);
        if(characterImportMode(deps.document)==='single' && outputs.length>1)throw new Error('여러 인물이 있는 파일입니다. 다인 캐릭터 탭에서 불러오세요.');
        if(characterImportMode(deps.document)==='multi' && outputs.length<2)throw new Error('다인 캐릭터 파일에는 2명 이상이 필요합니다.');
        if(deps.characterEditorKind && outputs.some(output=>output.entity_type!==deps.characterEditorKind))throw new Error('선택한 인물 종류와 JSON의 인물 종류가 다릅니다.');
        el('sr-character-import-json').value=raw;
        const preview=el('sr-character-import-preview'),esc=deps.escapeHtml;
        if(preview)preview.innerHTML=outputs.map(output=>`<details class="sr-import-person-preview"><summary>${esc(output.entity_name)} · ${output.records.length}개 기록 확인</summary><ul>${output.records.map(record=>`<li>${esc(record.rule)}</li>`).join('')}</ul>${output.intimacy_reference?.text?`<p>${esc(output.intimacy_reference.text)}</p>`:''}</details>`).join('');
        el('sr-character-file-summary').textContent=`${file.name} · ${outputs.length}명 · ${outputs.reduce((sum,output)=>sum+output.records.length,0)}개 기록`;
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
            const group=deps.characterStore.recordGroups.find(g=>g.id===groupId), version=group?.versions.find(v=>v.id===versionId);
            if(!version)throw new Error('저장한 버전을 찾지 못했습니다.');
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
        });
    });
    function entriesForVersion(store,version,kind){return allEntries(store).find(entry=>entry.id===version.entryId&&entry.kind===kind)||version.entrySnapshot||null;}
}
