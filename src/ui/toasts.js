const poseUrl = name => new URL(`../../assets/toasts/${name}.webp`, import.meta.url).href;
const POSES = Object.freeze({
    info: poseUrl('director'), working: poseUrl('reading'), success: poseUrl('success'),
    warning: poseUrl('warning'), error: poseUrl('error'), paused: poseUrl('cover'), resumed: poseUrl('wave'),
});
const PEEK = poseUrl('peek');
const DURATIONS = Object.freeze({ info: 4000, success: 4000, warning: 7000, error: 8000, paused: 6000, resumed: 5000 });

function toastNode(toast) { return toast?.[0] || (toast?.nodeType === 1 ? toast : null); }
function placeContainer(container) {
    const document=container.ownerDocument;
    const dialog=document.getElementById('scene-reader-dialog');
    if(dialog && !dialog.dataset.srToastCloseBound) {
        dialog.dataset.srToastCloseBound='true';
        dialog.addEventListener('close',()=>{
            const current=document.getElementById('scene-reader-toast-container');
            if(current?.parentElement===dialog)document.body.append(current);
        });
    }
    const review=document.getElementById('sr-change-dialog');
    const target=review?.open?review:dialog?.open?dialog:document.body;
    if(container.parentElement!==target)target.append(container);
}

function decorate(toast, message, { level = 'info', title = '씬판독기', sceneState } = {}) {
    const node = toastNode(toast);
    if (!node || node.dataset.srDismissed === 'true') return;
    const state = Object.hasOwn(POSES, sceneState) ? sceneState : Object.hasOwn(POSES, level) ? level : 'info';
    node.classList.add('sr-scene-toast');
    node.dataset.srState = state;
    node.dataset.srLevel = level;
    const document = node.ownerDocument;
    let mascot = node.querySelector('.sr-toast-mascot');
    if (!mascot) {
        mascot = document.createElement('span');
        mascot.className = 'sr-toast-mascot';
        mascot.setAttribute('aria-hidden', 'true');
        for (const className of ['sr-toast-pose', 'sr-toast-peek']) {
            const image = document.createElement('img');
            image.className = className; image.alt = ''; image.width = 75; image.height = 75;
            mascot.append(image);
        }
        node.prepend(mascot);
    }
    mascot.querySelector('.sr-toast-pose').src = POSES[state];
    const peek = mascot.querySelector('.sr-toast-peek');
    peek.src = PEEK; peek.hidden = state !== 'paused';
    let titleNode = node.querySelector('.sr-toast-title');
    if (!titleNode) { titleNode = document.createElement('div'); titleNode.className = 'sr-toast-title'; node.append(titleNode); }
    titleNode.textContent = String(title || '씬판독기');
    let messageNode = node.querySelector('.sr-toast-message');
    if (!messageNode) { messageNode = document.createElement('div'); messageNode.className = 'sr-toast-message'; node.append(messageNode); }
    messageNode.textContent = String(message ?? '');
    let rating = node.querySelector('.sr-toast-rating');
    if (state === 'paused') {
        if (!rating) { rating = document.createElement('span'); rating.className = 'sr-toast-rating'; rating.textContent = '🔞'; rating.setAttribute('aria-hidden', 'true'); }
        titleNode.prepend(rating);
    } else rating?.remove();
    let detail = node.querySelector('.sr-toast-detail');
    if (state === 'paused') {
        if (!detail) { detail = document.createElement('div'); detail.className = 'sr-toast-detail'; node.append(detail); }
        detail.textContent = 'Ⅱ 동적 주입 쉬는 중';
    } else detail?.remove();
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', `${titleNode.textContent}. ${messageNode.textContent}${detail ? `. ${detail.textContent}` : ''}. 알림 닫기`);
    if (!node.dataset.srDismissBound) {
        node.dataset.srDismissBound = 'true';
        const dismiss = () => { node.dataset.srDismissed = 'true'; toast.remove?.(); if (node.isConnected) node.remove(); };
        node.addEventListener('click', dismiss);
        node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); dismiss(); } });
    }
}

// Use independent markup so host toast icons, pseudo-elements and themes cannot leak in.
export function notifySceneReaderToast(host, level, message, title = '씬판독기', options = {}) {
    const { sceneState, timeOut: requestedTimeOut } = options;
    const duration = DURATIONS[sceneState] || DURATIONS[level] || DURATIONS.info;
    const timeOut = sceneState === 'working' || requestedTimeOut === 0 ? requestedTimeOut ?? duration : Math.max(Number(requestedTimeOut) || 0, duration);
    const document = host?.document;
    // Hosts without a DOM can still receive diagnostics (including headless integrations).
    if (!document?.createElement) return host?.toastr?.[level]?.(message, title, { ...options, timeOut, closeButton: false, escapeHtml: true });
    let container = document.getElementById('scene-reader-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'scene-reader-toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-relevant', 'additions text');
    }
    placeContainer(container);
    const node = document.createElement('div');
    let timer;
    const toast = { 0: node, remove() {
        host.clearTimeout(timer);
        node.dataset.srDismissed = 'true';
        node.remove();
    } };
    decorate(toast, message, { level, title, sceneState });
    container.append(node);
    if (timeOut > 0) timer = host.setTimeout(() => toast.remove(), timeOut);
    return toast;
}

export function updateSceneReaderToast(toast, message, options) {
    const node = toastNode(toast);
    const document = node?.ownerDocument;
    const container = document?.getElementById('scene-reader-toast-container');
    if (container) placeContainer(container);
    decorate(toast, message, options);
}
