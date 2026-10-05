import { WORLD_COMPILER_PROMPT, parseAdvancedWorld, advancedWorldToStored, storedWorldToJson } from "../../world/advanced.js";
import { worldCopyNotice } from '../compiler-copy.js';

export function createWorldForm(deps) {
async function worldTask(action) {
    if (deps.worldBusy) return;
    deps.worldBusy = true;
    const controls = ['sr-world-new','sr-world-save','sr-world-delete','sr-world-cancel','sr-world-advanced-save','sr-world-advanced-delete','sr-world-advanced-file','sr-world-advanced-cancel'].map(id=>deps.document.getElementById(id)).filter(Boolean);
    controls.forEach(control=>{control.disabled=true;});
    try { return await action(); }
    catch (error) {
        if (deps.document.getElementById('sr-world-advanced')?.open) deps.document.getElementById('sr-world-advanced-status').textContent = `처리 실패 · ${error.message}`;
        throw error;
    } finally { deps.worldBusy=false; controls.forEach(control=>{control.disabled=false;}); }
}

function renderWorldControls() {
    const worlds = deps.availableWorlds();
    const current = deps.preferences().selectedWorldId;
    const select = deps.document.getElementById('sr-world-profile');
    if (select) {
        select.innerHTML = worlds.map((world) => `<option value="${deps.escapeHtml(world.id)}">${deps.escapeHtml(world.name)}</option>`).join('');
        select.value = worlds.some((world) => world.id === current) ? current : 'current';
    }
    const manager = deps.document.getElementById('sr-world-manager-list');
    if (manager) manager.innerHTML = deps.loadCustomWorlds().map((world) => `<button type="button" class="sr-world-item" data-world-id="${deps.escapeHtml(world.id)}"><span>${deps.escapeHtml(world.name)}${world.franchise ? ' · 원작 세계' : ''}${world.advanced||world.advancedStub ? ' · 고급' : ''}</span><i class="fa-solid fa-pen" aria-hidden="true"></i></button>`).join('') || '<div class="sr-empty-small">저장한 커스텀 세계관 없음</div>';
    worldCopyNotice(deps.document,worlds);
}

function showWorldEditor(world = null) {
    if (deps.worldBusy) return;
    deps.worldEditorRevision++;
    if (world?.advanced) { showAdvancedWorldEditor(world); return; }
    const listView = deps.document.getElementById('sr-world-list-view');
    const editor = deps.document.getElementById('sr-world-editor');
    if (!listView || !editor) return;
    listView.hidden = true;
    editor.hidden = false;
    deps.document.getElementById('sr-world-edit-id').value = world?.id || '';
    deps.document.getElementById('sr-world-edit-name').value = world?.name || '';
    deps.document.getElementById('sr-world-edit-hint').value = world?.hint || '';
    deps.document.getElementById('sr-world-edit-prompt').value = world?.prompt || '';
    deps.document.getElementById('sr-world-edit-franchise').checked = Boolean(world?.franchise);
    deps.document.getElementById('sr-world-editor-title').textContent = world ? `세계관 수정 · ${world.name}` : '새 세계관 작성';
    worldCopyNotice(deps.document,deps.availableWorlds());
}

function showAdvancedWorldEditor(world) {
    const panel = deps.document.getElementById('sr-world-advanced');
    panel.open = true;
    deps.document.getElementById('sr-world-list-view').hidden = true;
    deps.document.getElementById('sr-world-editor').hidden = true;
    deps.document.getElementById('sr-world-advanced-edit-id').value = world.id;
    deps.document.getElementById('sr-world-advanced-json').value = JSON.stringify(storedWorldToJson(world), null, 2);
    deps.document.getElementById('sr-world-advanced-status').textContent = `${world.name} · 기록 ${world.advanced.records.length}개`;
    deps.document.getElementById('sr-world-advanced-delete').hidden = false;
    deps.document.getElementById('sr-world-advanced-cancel').hidden = false;
    worldCopyNotice(deps.document,deps.availableWorlds());
}

function showWorldList() {
    deps.worldEditorRevision++;
    const listView = deps.document.getElementById('sr-world-list-view');
    const editor = deps.document.getElementById('sr-world-editor');
    if (listView) listView.hidden = false;
    if (editor) editor.hidden = true;
    const advanced = deps.document.getElementById('sr-world-advanced');
    if (advanced) advanced.open = false;
    const id = deps.document.getElementById('sr-world-advanced-edit-id');
    if (id) id.value = '';
    const deleteButton = deps.document.getElementById('sr-world-advanced-delete');
    if (deleteButton) deleteButton.hidden = true;
    const cancelButton = deps.document.getElementById('sr-world-advanced-cancel');
    if (cancelButton) cancelButton.hidden = true;
    renderWorldControls();
}
return {worldTask,renderWorldControls,showWorldEditor,showAdvancedWorldEditor,showWorldList};
}
