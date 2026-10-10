import {bindWindowSize} from './window-size.js';
// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createShell(deps) {
function optionsHtml(items) {
    return Object.entries(items).map(([value, label]) => `<option value="${deps.escapeHtml(value)}">${deps.escapeHtml(label)}</option>`).join('');
}

function createDialog() {
    deps.dialog = deps.document.createElement('dialog');
    deps.dialog.id = 'scene-reader-dialog';
    deps.dialog.innerHTML = deps.dialogTemplate({optionsHtml, escapeHtml: deps.escapeHtml, WORLD_DIRECTIONS: deps.WORLD_DIRECTIONS, RELATIONSHIP_DIRECTIONS: deps.RELATIONSHIP_DIRECTIONS, PROGRESSION_MODES: deps.PROGRESSION_MODES, JUDGMENT_STYLES: deps.JUDGMENT_STYLES, DEVELOPMENT_STYLES: deps.DEVELOPMENT_STYLES, PACE_OPTIONS: deps.PACE_OPTIONS, PHYSICAL_PACES: deps.PHYSICAL_PACES, ADVANCED_STYLES: deps.ADVANCED_STYLES, ADVANCED_ELEMENTS: deps.ADVANCED_ELEMENTS});
    deps.document.body.append(deps.dialog);
    bindWindowSize({dialog:deps.dialog,window:deps.window});
    // A modal dialog sits in the browser's top layer. Body-level toasts would
    // render behind it regardless of z-index, so keep the shared toast container
    // inside the dialog only while the dialog is open.
    const syncToastLayer = () => {
        const review=deps.document.getElementById('sr-change-dialog');
        const target = review?.open ? review : deps.dialog.open ? deps.dialog : deps.document.body;
        for (const id of ['toast-container', 'scene-reader-toast-container']) {
            const container = deps.document.getElementById(id);
            if (container && container.parentElement !== target) target.append(container);
        }
    };
    new MutationObserver(syncToastLayer).observe(deps.document.body, { childList: true });
    deps.dialog.addEventListener('close', syncToastLayer);
    deps.dialog.addEventListener('toggle', syncToastLayer);
    deps.bindForm();
    deps.setFormValues();
    deps.renderAll();
    deps.bindHubTrace?.();
}

function createWandEntry() {
    if (deps.document.getElementById('scene-reader-wand')) return;
    const wrapper = deps.document.createElement('div');
    wrapper.className = 'extension_container interactable';
    wrapper.id = 'scene-reader-wand';
    wrapper.tabIndex = 0;
    wrapper.innerHTML = `<div class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="씬판독기 열기"><img class="extensionsMenuExtensionButton sr-wand-mascot" src="${deps.MASCOT_ICON_URL}" width="20" height="20" alt="">씬판독기</div>`;
    deps.document.getElementById('extensionsMenu')?.append(wrapper);
    wrapper.addEventListener('click', openSceneReader);
    wrapper.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') openSceneReader(); });
}

function createExtensionSettings() {
    if (deps.document.getElementById('scene-reader-extension-settings')) return;
    const host = deps.document.getElementById('extensions_settings') || deps.document.getElementById('extensions_settings2');
    if (!host) return;
    const section = deps.document.createElement('details');
    section.id = 'scene-reader-extension-settings';
    section.innerHTML = '<summary>씬판독기</summary><div class="sr-extension-controls"><label class="checkbox_label"><input id="sr-extension-enabled" type="checkbox"><span>씬판독기 사용</span></label><label class="checkbox_label"><input id="sr-extension-icon" type="checkbox"><span>채팅창 아이콘 표시</span></label><button id="sr-extension-open" type="button" class="menu_button">씬판독기 열기</button></div>';
    host.append(section);
    section.querySelector('#sr-extension-open').addEventListener('click', openSceneReader);
}

function openSceneReader() {
    deps.setFormValues();
    deps.renderAll();
    if (!deps.dialog.open) deps.dialog.showModal();
    deps.refreshCurrentStatus?.();
    const toastContainer = deps.document.getElementById('toast-container');
    if (toastContainer && toastContainer.parentElement !== deps.dialog) deps.dialog.append(toastContainer);
    const sceneToastContainer = deps.document.getElementById('scene-reader-toast-container');
    if (sceneToastContainer && sceneToastContainer.parentElement !== deps.dialog) deps.dialog.append(sceneToastContainer);
    void deps.loadReasonerProfiles();
}

function createQuickEntry() {
    if (deps.document.getElementById('scene-reader-quick-button')) return true;
    const extensionButton = deps.document.getElementById('extensionsMenuButton');
    const holder = extensionButton?.parentElement || deps.document.getElementById('leftSendForm') || deps.document.getElementById('rightSendForm');
    if (!holder) return false;
    const button = deps.document.createElement('div');
    button.id = 'scene-reader-quick-button';
    button.className = 'interactable';
    button.tabIndex = 0;
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', '씬판독기 열기');
    button.title = '씬판독기';
    const icon = deps.document.createElement('img');
    icon.src = deps.MASCOT_ICON_URL; icon.alt = ''; icon.width = 26; icon.height = 26;
    button.append(icon);
    button.hidden = !deps.settings.showChatIcon;
    button.addEventListener('click', openSceneReader);
    button.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') openSceneReader(); });
    extensionButton?.nextSibling ? holder.insertBefore(button, extensionButton.nextSibling) : holder.append(button);
    deps.refreshCurrentStatus?.();
    return true;
}

function ensureQuickEntry() {
    if (createQuickEntry()) return;
    const observer = new MutationObserver(() => {
        if (createQuickEntry()) observer.disconnect();
    });
    observer.observe(deps.document.body, { childList: true, subtree: true });
}
return {optionsHtml, createDialog, createWandEntry, createExtensionSettings, openSceneReader, createQuickEntry, ensureQuickEntry};
}
