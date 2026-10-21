export const NANO_JEV_MODELS = ['typesafe/jev-1.14', 'typesafe/jev-1.13'];
export const OFFICIAL_JEV_MODELS = ['jev-latest', 'jev-1.14.0', 'jev-1.13.0'];
export function jevConnection(settings = {}, override = null) {
    const provider = (override ? override.provider : settings.jevConnection) === 'nanogpt' ? 'nanogpt' : 'typesafe';
    const model = override?.model || settings.jevNanoModel || NANO_JEV_MODELS[0];
    if (provider === 'nanogpt' && !NANO_JEV_MODELS.includes(model)) throw new Error('나노GPT Jev 1.14 또는 1.13을 선택하세요.');
    const official = override?.model || settings.jevOfficialModel || 'jev-latest';
    if(provider==='typesafe' && !OFFICIAL_JEV_MODELS.includes(official))throw new Error('공홈 Jev 최신 자동, 1.14 또는 1.13을 선택하세요.');
    return {provider, model:provider === 'nanogpt' ? model : official};
}
