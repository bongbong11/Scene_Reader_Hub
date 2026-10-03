import { setCharacterImportMode, characterImportMode } from "../character-import-mode.js";
import { characterCopyNotice } from '../compiler-copy.js';
import { notifySceneReaderToast } from "../toasts.js";
import { characterErrorReport } from "../character-error.js";
import { compilerRequest, createRecordBank } from "../../character/records.js";
import { archiveRecordVersion } from "../../character/versions.js";
import { openPersonPreview } from "../person-preview.js";

export function createCharacterForm(deps) {
function captureCharacterError(error,stage,meta={}) {
    deps.lastCharacterError=characterErrorReport(error,{stage,...meta});
    const button=deps.document.getElementById('sr-character-error-copy');
    if(button)button.hidden=false;
    const modal=deps.document.getElementById('sr-character-modal');
    if(modal)modal.hidden=false;
}

function characterFormSignature() {
    return JSON.stringify([deps.editorLore, ...['sr-character-name', 'sr-character-aliases', 'sr-character-source', 'sr-character-npc-role', 'sr-character-cast-names'].map(id => deps.document.getElementById(id)?.value || ''), Boolean(deps.document.getElementById('sr-character-source-visible')?.checked)]);
}

function characterEntries(kind) {
    if (kind === 'persona') return deps.characterStore.persona ? [deps.characterStore.persona] : [];
    return kind === 'npc' ? deps.characterStore.npcs : deps.characterStore.characters;
}

function updateSheetButton() {
    const hasSource=Boolean(deps.document.getElementById('sr-character-source')?.value.trim());
    deps.document.getElementById('sr-character-read-sheet').textContent=hasSource?'시트 확인하기':'시트 가져오기';
    deps.document.getElementById('sr-character-sheet-refresh').hidden=!hasSource;
}

function showCharacterEditor(kind, entry = null) {
    deps.characterEditorRevision++;
    deps.lastCharacterError=null;
    deps.document.getElementById('sr-character-error-copy').hidden=true;
    const errorPreview=deps.document.getElementById('sr-character-error-preview');
    errorPreview.hidden=true;
    errorPreview.value='';
    deps.editorLore = structuredClone(entry?.selectedLore || []);
    deps.availableEditorLore=[];
    deps.initialEditorLoreKeys=new Set(deps.editorLore.map(loreKey));
    deps.characterEditorKind = kind;
    deps.characterEditorId = entry?.id || '';
    const editor = deps.document.getElementById('sr-character-editor');
    if (!editor) return;
    deps.document.getElementById('sr-character-modal').hidden=false;
    editor.hidden = false;
    deps.document.getElementById('sr-character-editor-title').textContent = `${kind === 'persona' ? '페르소나' : kind === 'npc' ? 'NPC' : '캐릭터'} ${entry ? '수정' : '추가'}`;
    deps.document.getElementById('sr-character-name').value = entry?.name || (kind === 'persona' ? deps.getContext().name1 || '페르소나' : '');
    deps.document.getElementById('sr-character-sheet-step').hidden=kind==='npc';
    const cast=deps.document.getElementById('sr-character-cast-names');
    if(cast){cast.value=entry?.cardCast ? entry.name : '';cast.dataset.cardName=entry?.cardCast?.cardName || '';cast.dataset.member=String(Boolean(entry?.cardCast)); }
    const castRow=deps.document.getElementById('sr-character-cast-row');
    if(castRow)castRow.hidden=true;
    const modes=deps.document.getElementById('sr-character-import-modes');
    if(modes)modes.hidden=kind!=='character';
    setCharacterImportMode(deps.document,'single');
    const preview=deps.document.getElementById('sr-character-import-preview');
    if(preview)preview.innerHTML='';
    deps.document.getElementById('sr-character-npc-step').hidden=kind!=='npc';
    deps.document.getElementById('sr-character-npc-ai-note').hidden=kind!=='npc';
    deps.document.getElementById('sr-character-sheet-ai-note').hidden=kind==='npc';
    deps.document.getElementById('sr-character-lore-heading').textContent=kind==='npc'?'연결 로어북 선택 · 선택 사항':'2 · 연결 로어북과 분석 명령문';
    deps.document.getElementById('sr-character-npc-lore-note').hidden=kind!=='npc';
    deps.document.getElementById('sr-character-upload-title').textContent=kind==='npc'?'4 · 완성한 판독 JSON':'3 · 완성한 판독 JSON';
    deps.document.getElementById('sr-character-file-summary').textContent='선택한 파일 없음 · .json';
    const lorePicker=deps.document.querySelector?.('.sr-character-lore-picker');
    if(lorePicker)lorePicker.open=false;
    deps.document.getElementById('sr-character-import-json').value='';
    deps.document.getElementById('sr-character-import-name').value=entry?.name||'';
    deps.document.getElementById('sr-character-import-status').textContent='파일을 올린 뒤 마지막 버튼에서 저장합니다.';
    deps.document.getElementById('sr-character-aliases').value = (entry?.aliases || []).join(', ');
    const sourceInput = deps.document.getElementById('sr-character-source');
    sourceInput.value = entry?.source || '';
    updateSheetButton();
    deps.document.getElementById('sr-character-sheet-summary').textContent=entry?.source?'시트 원문을 보관 중입니다. 현재 시트를 다시 가져올 수 있습니다.':'현재 시트를 가져오세요.';
    sourceInput.placeholder = kind === 'npc'
        ? 'NPC 시트에 적어 주세요:\n· 역할·소속, 주요 관계\n· 원하는 것과 우선순위, 행동·거절 방식\n· 평소 말투와 설명하는 정도\n· 실제 지식·능력·접근권 및 한계\n· 확인된 과거와 성격의 모순\n빈칸을 억지로 채우거나 시트에 없는 비밀·전문성·접근권을 만들 필요는 없습니다.'
        : '이 인물 한 명의 시트를 붙여 넣으세요.';
    const visibleToggle = deps.document.getElementById('sr-character-source-visible');
    if (visibleToggle) visibleToggle.checked = entry ? Boolean(entry.sourceVisibleToMain) : kind !== 'npc';
    const roleSelect = deps.document.getElementById('sr-character-npc-role');
    if (roleSelect) roleSelect.value = entry?.npcRole || (entry?.antagonist ? 'villain' : 'mixed');
    const status = deps.document.getElementById('sr-character-task-status');
    if (status) status.textContent = entry ? deps.profileStatus(entry) : '원문을 넣고 분석 명령문을 복사하세요. 완성된 JSON은 아래에서 바로 가져올 수 있습니다.';
    renderEditorLore('연결 로어북을 읽는 중…');
    beginLoreRefresh();
    editor.scrollTop=0;
}

function showVersionEditor(kind,entry,group,version){
    showCharacterEditor(kind,version.entrySnapshot || entry);
    deps.document.getElementById('sr-character-editor-title').textContent=`${kind==='npc'?'NPC':kind==='persona'?'페르소나':'캐릭터'} · 저장본 수정`;
    deps.document.getElementById('sr-character-import-name').value=group.name;
    deps.document.getElementById('sr-character-import-json').value=JSON.stringify({entity_type:version.bank.entity_type,entity_name:version.bank.entity_name,intimacy_reference:version.bank.intimacy_reference,records:version.bank.records},null,2);
    deps.document.getElementById('sr-character-file-summary').textContent=`${new Date(version.savedAt).toLocaleString('ko-KR')} 저장본 · 새 JSON을 업로드하면 새 날짜로 저장됩니다.`;
}

function closeCharacterEditor() {
    deps.characterEditorRevision++;
    deps.characterEditorKind = '';
    deps.characterEditorId = '';
    const editor = deps.document.getElementById('sr-character-editor');
    if (editor) editor.hidden = true;
    const modal=deps.document.getElementById('sr-character-modal');
    if(modal)modal.hidden=true;
}

function showSavedPerson(kind,id) {
    const entry=characterEntries(kind).find(item=>item.id===id);
    if(!entry)return;
    const versions=(deps.characterStore.recordGroups||[]).filter(group=>group.kind===kind).flatMap(group=>group.versions.map(version=>({group,version}))).filter(item=>item.version.entryId===id);
    const picked=versions.find(item=>item.version.id===entry.appliedRecordVersion) || versions.sort((a,b)=>b.version.savedAt.localeCompare(a.version.savedAt))[0];
    const label=picked?`${entry.name} · ${new Date(picked.version.savedAt).toLocaleString('ko-KR')}${picked.version.id===entry.appliedRecordVersion?' · 적용 중':' · 최근 저장본'}`:entry.name;
    openPersonPreview(deps.document,deps.escapeHtml,{entry,version:picked?.version,title:label});
}

function showVersionPreview(group,version) {
    const entry=characterEntries(group.kind).find(item=>item.id===version.entryId);
    openPersonPreview(deps.document,deps.escapeHtml,{entry,version,title:`${group.name} · ${new Date(version.savedAt).toLocaleString('ko-KR')}${entry?.appliedRecordVersion===version.id?' · 적용 중':''}`});
}

function loreKey(item) { return JSON.stringify([item.book,String(item.uid)]); }

function renderEditorLore(message='') {
    const node=deps.document.getElementById('sr-character-lore-status');
    const books=[...new Set(deps.availableEditorLore.map(item=>item.book))];
    const selected=new Set(deps.editorLore.map(loreKey));
    const count=deps.document.getElementById('sr-character-lore-count');
    if(count)count.textContent=`${selected.size}개 엔트리 선택됨`;
    const options=deps.document.getElementById('sr-character-lore-options');
    if(options?.replaceChildren && deps.document.createElement){
        options.replaceChildren();
        for(const book of books){
            const entries=deps.availableEditorLore.filter(item=>item.book===book);
            const group=deps.document.createElement('details');group.className='sr-character-lore-book';
            const summary=deps.document.createElement('summary');summary.textContent=`${book} · ${entries.filter(item=>selected.has(loreKey(item))).length}/${entries.length}개 선택`;group.append(summary);
            for(const item of entries){
                const label=deps.document.createElement('label');const box=deps.document.createElement('input');
                box.type='checkbox';box.value=loreKey(item);box.checked=selected.has(box.value);
                const span=deps.document.createElement('span');span.textContent=item.title || `엔트리 ${item.uid}`;
                label.append(box,span);group.append(label);
            }
            options.append(group);
        }
    }
    if(node)node.textContent=message || (books.length ? `연결 로어북 ${books.length}개 · 책을 펼쳐 필요한 엔트리만 고르세요.` : '연결된 로어북 없음');
    characterCopyNotice(deps.document,deps.editorLore);
}

async function refreshEditorLore() {
    const revision=deps.characterEditorRevision, kind=deps.characterEditorKind;
    const world=deps.worldInfoModule, context=deps.getContext();
    const personaModule=kind==='persona'||kind==='npc'?await import('/scripts/personas.js').catch(()=>null):null;
    if(revision!==deps.characterEditorRevision || kind!==deps.characterEditorKind)throw new deps.StaleRunError();
    const personas=context.powerUserSettings?.persona_descriptions||{};
    const avatar=personaModule?.user_avatar || context.user_avatar;
    const activePersona=personas[avatar]||Object.values(personas).find(item=>item?.name===context.name1);
    const personaNames=[context.powerUserSettings?.persona_description_lorebook,activePersona?.lorebook].filter(Boolean);
    const characterNames=deps.linkedCharacterBooks(context,world?.world_info);
    const names=[...new Set(kind==='persona'?personaNames:kind==='npc'?[...characterNames,...personaNames]:characterNames)];
    if(!names.length){deps.availableEditorLore=[];deps.editorLore=[];renderEditorLore('연결된 로어북 없음');return;}
    if(!world?.loadWorldInfo)throw new Error('연결 로어북을 읽을 수 없습니다.');
    renderEditorLore('연결 로어북을 읽는 중…');
    const loaded=await Promise.all(names.map(async book=>{
        const data=await world.loadWorldInfo(book);
        if(!data?.entries)throw new Error('연결 로어북을 읽지 못했습니다.');
        return Object.entries(data.entries).filter(([,entry])=>!entry?.disable && typeof entry?.content==='string' && entry.content.trim())
            .map(([uid,entry])=>({book,uid,title:entry.comment||(entry.key||[]).join(', ')||uid,content:entry.content}));
    }));
    if(revision!==deps.characterEditorRevision || kind!==deps.characterEditorKind)throw new deps.StaleRunError();
    const previous=deps.editorLore;
    deps.availableEditorLore=loaded.flat();
    const chosen=deps.initialEditorLoreKeys || new Set();
    deps.editorLore=deps.availableEditorLore.filter(item=>chosen.has(loreKey(item)));
    const missing=[...chosen].filter(key=>!deps.availableEditorLore.some(item=>loreKey(item)===key));
    const changed=previous.filter(item=>chosen.has(loreKey(item)) && deps.availableEditorLore.some(next=>loreKey(next)===loreKey(item) && next.content!==item.content));
    renderEditorLore(missing.length?`이전에 선택한 엔트리 ${missing.length}개를 찾지 못했습니다. 새로 선택한 뒤 분석 명령문을 복사하세요.`:changed.length?`선택한 엔트리 ${changed.length}개의 원문이 달라졌습니다. 확인한 뒤 분석 명령문을 복사하세요.`:'');
}

function beginLoreRefresh() {
    deps.loreLoadingPromise=refreshEditorLore().catch(error=>{renderEditorLore('로어북 읽기 실패 · '+error.message);throw error;});
    deps.loreLoadingPromise.catch(()=>{});
    return deps.loreLoadingPromise;
}

async function ensureLoreLoaded(){if(deps.loreLoadingPromise)await deps.loreLoadingPromise;}

function characterForm() {
    return { kind: deps.characterEditorKind,
        selectedLore: structuredClone(deps.editorLore),
        importMode: characterImportMode(deps.document),
        castNames: characterImportMode(deps.document)==='multi' ? deps.document.getElementById('sr-character-cast-names')?.value || '' : '',
        cardCast: (characterImportMode(deps.document)==='multi' || deps.document.getElementById('sr-character-cast-names')?.dataset.member==='true') && deps.document.getElementById('sr-character-cast-names')?.dataset.cardName ? {cardName:deps.document.getElementById('sr-character-cast-names').dataset.cardName} : null,
        name: String(deps.document.getElementById('sr-character-name')?.value || '').trim(),
        source: String(deps.document.getElementById('sr-character-source')?.value || '').trim(),
        aliases: String(deps.document.getElementById('sr-character-aliases')?.value || '').split(',').map(v => v.trim()).filter(Boolean),
        sourceVisibleToMain: Boolean(deps.document.getElementById('sr-character-source-visible')?.checked),
        npcRole: deps.characterEditorKind === 'npc' ? deps.document.getElementById('sr-character-npc-role')?.value || 'mixed' : '',
        antagonist: deps.characterEditorKind === 'npc' && deps.document.getElementById('sr-character-npc-role')?.value === 'villain' };
}

function taskStatus(message, error = false) {
    const node = deps.document.getElementById('sr-character-task-status');
    if (node) { node.textContent = message; node.dataset.error = error ? 'true' : 'false'; }
}

async function saveCharacterEntry() {
    const chatKey = deps.stateChatKey();
    await ensureLoreLoaded();
    if(chatKey!==deps.stateChatKey())return null;
    const form = characterForm();
    const targetId = deps.characterEditorId;
    const current = characterEntries(form.kind).find(item => item.id === targetId);
    if (!form.kind || !form.name || (form.kind !== 'npc' && !form.source && !current)) throw new Error('이름과 시트 원문을 입력하세요.');
    if (form.kind === 'npc' && !form.aliases.length) {
        const blocked = deps.characterStore.npcs.filter(item => item.id !== targetId).flatMap(item => [item.name, ...(item.aliases || [])]);
        form.aliases = deps.suggestNpcAliases(form.name, form.source, blocked);
        deps.document.getElementById('sr-character-aliases').value = form.aliases.join(', ');
    }
    const sourceHash = form.source ? await deps.sha256Hex(form.source) : '';
    if(chatKey!==deps.stateChatKey())return null;
    const entry = { ...current, ...form, id: targetId || `${form.kind}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, sourceHash, updatedAt: new Date().toISOString(),
        coreEnglish: form.kind === 'npc' && current?.source === form.source ? current.coreEnglish || '' : form.kind === 'npc' ? deps.deriveEnglishCore(form.source, form.name) : '',
        provenance: current?.provenance || null };
    const next = deps.normalizeCharacterStore(deps.characterStore);
    if (form.kind === 'persona') next.persona = entry;
    else {
        const key = form.kind === 'npc' ? 'npcs' : 'characters';
        const index = next[key].findIndex(item => item.id === entry.id);
        if (index < 0) next[key].push(entry); else next[key][index] = entry;
    }
    await deps.saveCharacterStore(chatKey, next);
    if(chatKey!==deps.stateChatKey())return null;
    deps.characterStore = deps.normalizeCharacterStore(next);
    deps.characterEditorId = entry.id;
    deps.characterEditorRevision++;
    deps.invalidatePreparedJudgment();
    const rec=deps.record(true);
    await deps.persistChat(chatKey,rec); await deps.clearInjection({chatKey});
    if(chatKey!==deps.stateChatKey())return entry;
    deps.renderCharacterStore();
    taskStatus(deps.profileStatus(entry));
    notifySceneReaderToast(deps.window, 'success', '시트를 저장했습니다.', '씬판독기');
    return entry;
}

async function analyzeAndSaveCharacter() {
    await ensureLoreLoaded();
    const kind = deps.characterEditorKind;
    const targetId = deps.characterEditorId;
    if (!targetId) { taskStatus('시트를 먼저 저장하세요.', true); throw new Error('시트를 먼저 저장하세요.'); }
    const chatKey = deps.stateChatKey();
    const original = characterEntries(kind).find((item) => item.id === targetId);
    if (!original?.source?.trim() && !original?.selectedLore?.length) { taskStatus('판독할 원문이 없습니다.', true); throw new Error('판독할 원문이 없습니다.'); }
    if (!deps.settings.reasonerProfileId) { taskStatus('설정에서 시트 분석용 연결 프로필을 선택하세요.', true); throw new Error('설정에서 시트 분석에 사용할 연결 프로필을 선택하세요.'); }
    const originalHash = original ? deps.stableFingerprint(original) : '';
    const job = deps.jobs.begin(`sheet:${kind}:${targetId || 'new'}`);
    const revision = deps.characterEditorRevision;
    const signature = characterFormSignature();
    const activityOwner = `sheet:${job.id || Date.now()}`;
    let failureStage='model';
    let saved=false,applied=false;
    const assertEditor = () => {
        job.assert();
        if (revision !== deps.characterEditorRevision || signature !== characterFormSignature()) throw new deps.StaleRunError();
    };
    try {
    const { name, source } = characterForm();
    if (JSON.stringify(deps.editorLore) !== JSON.stringify(original.selectedLore || [])) throw new Error('수정한 로어북 선택을 먼저 저장하세요.');
    if (source !== original.source || name !== original.name || characterForm().sourceVisibleToMain !== original.sourceVisibleToMain || characterForm().aliases.join('|') !== (original.aliases || []).join('|') || (kind === 'npc' && characterForm().npcRole !== (original.npcRole || (original.antagonist ? 'villain' : 'mixed')))) throw new Error('수정한 시트를 먼저 저장하세요.');
    taskStatus('연결 모델이 인물 시트를 해석하고 있습니다…');
    deps.updateActivity(`${name} 인물 시트 해석 중…`, { owner: activityOwner });
    await deps.loadReasonerProfiles(); job.assert();
    const compilation = compilerRequest(original);
    const extraction = await deps.requestWithConnectionProfile(deps.connectionRequestService, deps.settings.reasonerProfileId, compilation.prompt,
        { task: 'Compile the supplied sources using the system contract.' }, { maxTokens: 12000 });
    assertEditor();
    failureStage='validate';
    const analysisId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
    const recordBank = createRecordBank(extraction.result, original, analysisId);
    taskStatus(`시트 해석 완료 · 인물 기록 ${recordBank.records.length}개`);
    deps.updateActivity(`${name} · 규칙 저장 중…`, { owner: activityOwner });
    const sourceHash = await deps.sha256Hex(source);
    assertEditor();
    const currentEntry = characterEntries(kind).find((item) => item.id === targetId);
    if (targetId && (!currentEntry || deps.stableFingerprint(currentEntry) !== originalHash)) throw new deps.StaleRunError();
    if (deps.characterEditorKind === kind && deps.characterEditorId === targetId && String(deps.document.getElementById('sr-character-source')?.value || '').trim() !== source) throw new deps.StaleRunError();
    const entry = { ...original, recordBank, coreEnglish:'', sourceHash, updatedAt: new Date().toISOString() };
    // Preserve the old profile for recovery only; it is never converted into records.
    if (entry.profile) { entry.legacyProfile = entry.profile; delete entry.profile; }
    const next = deps.normalizeCharacterStore(deps.characterStore);
    if (kind === 'persona') next.persona = entry;
    else {
        const key = kind === 'npc' ? 'npcs' : 'characters';
        const index = next[key].findIndex((item) => item.id === entry.id);
        if (index >= 0) next[key][index] = entry; else next[key].push(entry);
    }
    archiveRecordVersion(next,entry,entry.name);
    // Replace the old analysis only after the new profile and server persistence succeed.
    failureStage='save';
    await deps.saveCharacterStore(chatKey, next);
    saved=true;
    failureStage='apply';
    job.assert();
    deps.characterStore = next;
    applied=true;
    job.finish();
    deps.invalidatePreparedJudgment();
    const rec=deps.record(true);
    await deps.persistChat(chatKey,rec);
    await deps.clearInjection({chatKey});
    if(chatKey!==deps.stateChatKey())return;
    if (deps.characterEditorId === targetId && deps.characterEditorKind === kind) closeCharacterEditor();
    deps.characterAnalysisSelection = { kind, id: entry.id };
    deps.renderCharacterStore();
    deps.document.getElementById('sr-character-analysis-result')?.scrollIntoView?.({ block: 'nearest' });
    deps.updateActivity(`${name} · ${deps.profileStatus(entry)}`, { done: true, owner: activityOwner });
    } catch (error) {
        if(!(error instanceof deps.StaleRunError))captureCharacterError(error,failureStage,{saved,applied});
        taskStatus(`${saved?'인물 기록 저장 완료 · 후속 반영 실패':'판정 실패 · 기존 결과 보관'} · ${error.message}`, !(error instanceof deps.StaleRunError));
        deps.updateActivity(error.message, { error: !(error instanceof deps.StaleRunError), done: error instanceof deps.StaleRunError, owner: activityOwner });
        if (!(error instanceof deps.StaleRunError)) { error.activityReported = true; throw error; }
    } finally { job.finish(); }
}

async function deleteCharacterEntry(kind=deps.characterEditorKind,id=deps.characterEditorId) {
    const chatKey=deps.stateChatKey();
    if (!kind || !id) return;
    const entry=characterEntries(kind).find(item=>item.id===id);
    if(!entry)return;
    if(!deps.window.confirm(`“${entry.name}” 인물 등록을 삭제할까요? 날짜별 저장본은 남고, 다시 적용하면 인물이 복원될 수 있습니다.`))return;
    const next = deps.normalizeCharacterStore(deps.characterStore);
    if (kind === 'persona') next.persona = null;
    else {
        const key = kind === 'npc' ? 'npcs' : 'characters';
        next[key] = next[key].filter((item) => item.id !== id);
    }
    await deps.saveCharacterStore(chatKey,next);
    if(chatKey!==deps.stateChatKey())return;
    deps.characterStore=next;
    deps.invalidatePreparedJudgment();
    const rec=deps.record(true);
    await deps.persistChat(chatKey,rec);
    await deps.clearInjection({chatKey});
    if(chatKey!==deps.stateChatKey())return;
    closeCharacterEditor();
    deps.renderCharacterStore();
    notifySceneReaderToast(deps.window, 'success', '인물 시트를 삭제했습니다.', '씬판독기');
}
return {captureCharacterError,characterFormSignature,characterEntries,updateSheetButton,showCharacterEditor,showVersionEditor,closeCharacterEditor,showSavedPerson,showVersionPreview,loreKey,renderEditorLore,refreshEditorLore,beginLoreRefresh,ensureLoreLoaded,characterForm,taskStatus,saveCharacterEntry,analyzeAndSaveCharacter,deleteCharacterEntry};
}
