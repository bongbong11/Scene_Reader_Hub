// Optional sibling extension. Scene Reader keeps working when it is absent.
export function prepareKnowledgeVault(frame, bridge) {
    if (!bridge || bridge.version !== '0.1.0' || typeof bridge.getSceneInput !== 'function') return [];
    let input;
    try { input = bridge.getSceneInput(); } catch { return []; }
    const cards = (Array.isArray(input) ? input : []).slice(0, 12).filter(item => item?.secret_id && item?.text && Array.isArray(item.knownBy));
    cards.forEach((card, index) => {
        frame.questions[`vault_${index}`] = {
            type: 'choice',
            instructions: `For restricted item ${card.secret_id}, use recent RP only. Decide whether its boundary matters for the next response. Holders are a closed list: ${card.knownBy.join(', ') || 'no character'}. World truth does not grant character knowledge. Do not disclose the restricted fact in your answer or add holders. If unsure who can hear, treat the scene as mixed or uncertain.`,
            criteria: {
                none: 'This item has no bearing on the immediate scene; no boundary note is needed this turn.',
                holders_only: 'Relevant, and only listed holders can participate in or perceive the next response.',
                mixed_or_uncertain: 'Relevant, and at least one unlisted person can participate or perceive, or access is uncertain.',
            },
        };
    });
    return cards;
}

export function publishKnowledgeVault(bridge, cards, answers) {
    if (!bridge || typeof bridge.publishSceneResult !== 'function' || !cards?.length) return;
    const knowledge_vault = [];
    const vault_injections = [];
    cards.forEach((card, index) => {
        const choice = answers?.[`vault_${index}`]?.choice;
        const relevant = choice === 'holders_only' || choice === 'mixed_or_uncertain';
        knowledge_vault.push({ secret_id: card.secret_id, relevant, scene_access: choice === 'holders_only' ? 'holders_only' : 'uncertain' });
        vault_injections.push({ secret_id: card.secret_id, inject: relevant, mode: 'masked_boundary' });
    });
    try { bridge.publishSceneResult({ knowledge_vault, vault_injections }); }
    catch { /* A sibling extension must not stop Scene Reader. */ }
}
