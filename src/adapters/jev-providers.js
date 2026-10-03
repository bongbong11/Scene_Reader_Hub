export const JEV_PROVIDERS = Object.freeze({
    typesafe: { label: '공홈 · TypeSafe' },
    openrouter: { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1/systemone', model: 'jev-latest' },
    vercel: { label: 'Vercel AI Gateway', url: 'https://ai-gateway.vercel.sh/typesafe/v1/systemone', model: 'typesafe-ai/jev' },
});
export const JEV_BROWSER_KEY_STORAGE = 'sceneReader.jevBrowserKey';
export function detectJevProvider(key) {
    const value = String(key || '').trim();
    if (/^sk-or-v1-[A-Za-z0-9_-]+$/.test(value)) return 'openrouter';
    if (/^vck_[A-Za-z0-9_-]+$/.test(value)) return 'vercel';
    return '';
}
export function resolveJevKeyProvider(key, selection = 'auto') {
    const detected = detectJevProvider(key);
    if (selection === 'auto') {
        if (!detected) throw new Error('이 키는 형식만으로 발급처를 구분할 수 없습니다. 발급처를 한 번 선택하세요. 키는 아직 전송하거나 저장하지 않았습니다.');
        return detected;
    }
    const provider = jevProvider({jevProvider:selection});
    if (detected && detected !== provider) throw new Error('선택한 발급처와 키 형식이 다릅니다. 키를 발급받은 서비스를 선택하세요.');
    return provider;
}
export function jevProvider(settings) {
    const id = settings?.jevProvider || 'typesafe';
    if (!Object.hasOwn(JEV_PROVIDERS, id)) throw new Error('Jev 연결 서비스를 다시 선택하세요.');
    return id;
}
export function browserJevKey(storage, provider) {
    try {
        const saved = JSON.parse(storage?.getItem(JEV_BROWSER_KEY_STORAGE) || 'null');
        return saved?.provider === provider ? String(saved.key || '').trim() : '';
    } catch { return ''; }
}
export function saveBrowserJevKey(storage, provider, key) {
    if (!JEV_PROVIDERS[provider]?.url) throw new Error('브라우저 키를 저장할 서비스를 선택하세요.');
    if (key) storage.setItem(JEV_BROWSER_KEY_STORAGE, JSON.stringify({ provider, key }));
    else storage.removeItem(JEV_BROWSER_KEY_STORAGE);
}
export function jevKeyStatus(deps, provider = jevProvider(deps.settings)) {
    if (provider === 'typesafe') return deps.serverKeyStatus || '저장된 키 없음';
    const key = browserJevKey(deps.localStorage, provider);
    return key ? `이 브라우저에 저장됨 ····${key.slice(-4)}` : '이 브라우저에 저장된 키 없음';
}
