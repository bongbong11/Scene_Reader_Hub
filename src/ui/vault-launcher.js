const iconUrl = new URL('../../assets/mascot-secret-agent.png', import.meta.url).href;

export function createVaultLauncher({ document, window, notify }) {
    let lastAccess;
    // Companion compatibility API; feature enablement belongs to the Vault.
    const canUse = () => true;
    function open() {
        try {
            const bridge = window.KnowledgeVaultV1;
            if (bridge?.version === '0.1.0' && typeof bridge.open === 'function' && bridge.open() === true) return true;
        } catch { /* A companion UI must not stop the Hub. */ }
        notify('정보금고 확장을 설치·활성화한 뒤 새로고침해 주세요.');
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
        const actions = document.querySelector('.sr-header h2');
        if (!actions) return;
        const button = document.createElement('button');
        button.id = 'sr-vault-button'; button.type = 'button'; button.className = 'sr-icon-button sr-vault-button';
        button.title = '비밀요원 끼끼'; button.setAttribute('aria-label', button.title);
        const icon = document.createElement('img');
        icon.src = iconUrl; icon.alt = ''; icon.width = 22; icon.height = 22; icon.draggable = false;
        button.append(icon); button.addEventListener('click', open); actions.append(button);
        refresh();
    }
    return { bind, open, canUse, refresh };
}
