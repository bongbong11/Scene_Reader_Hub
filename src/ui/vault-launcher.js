const iconUrl = new URL('../../assets/mascot-secret-agent.png', import.meta.url).href;

export function createVaultLauncher({ document, window, isUnlocked, notify }) {
    let lastAccess;
    const canUse = () => isUnlocked() === true;
    function open() {
        try {
            const bridge = window.KnowledgeVaultV1;
            if (canUse() && bridge?.version === '0.1.0' && typeof bridge.open === 'function' && bridge.open() === true) return true;
        } catch { /* A companion UI must not stop the Hub. */ }
        notify('쉿, 업데이트 중');
        return false;
    }
    function refresh() {
        const allowed = canUse();
        if (allowed === lastAccess) return;
        lastAccess = allowed;
        try { window.KnowledgeVaultV1?.refreshAccess?.(); } catch { /* Optional companion. */ }
    }
    function bind() {
        if (document.getElementById('sr-vault-button')) return;
        const anchor = document.getElementById('sr-copy-debug');
        const actions = anchor?.parentElement;
        if (!actions) return;
        const button = document.createElement('button');
        button.id = 'sr-vault-button'; button.type = 'button'; button.className = 'sr-icon-button sr-vault-button';
        button.title = '비밀요원 끼끼'; button.setAttribute('aria-label', button.title);
        const icon = document.createElement('img');
        icon.src = iconUrl; icon.alt = ''; icon.width = 22; icon.height = 22; icon.draggable = false;
        button.append(icon); button.addEventListener('click', open); actions.prepend(button);
        refresh();
    }
    return { bind, open, canUse, refresh };
}
