// Optional sibling extension. Scene Reader keeps working when it is absent.
export function knowledgeVaultRevision(bridge, fingerprint) {
    try {
        if (bridge?.version !== '0.1.0' || typeof bridge.getRevision !== 'function') return '';
        const revision = bridge.getRevision();
        return typeof revision === 'string' && revision && revision !== '[]' ? fingerprint(revision) : '';
    } catch { return ''; }
}

export function prepareKnowledgeVault(frame, bridge) {
    if (!bridge || bridge.version !== '0.1.0' || typeof bridge.getSceneInput !== 'function') return [];
    let input;
    try { input = bridge.getSceneInput(); } catch { return []; }
    const cards = (Array.isArray(input) ? input : []).filter(item => typeof item?.secret_id === 'string' && typeof item?.text === 'string' && item.text && Array.isArray(item.knownBy)).slice(0, 12)
        .map(({secret_id,text,knownBy,truthScope,holderAliases})=>({secret_id,text:text.slice(0,2000),knownBy:knownBy.filter(name=>typeof name==='string'),truthScope,
            ...(Array.isArray(holderAliases) ? {holderAliases:holderAliases.filter(actor=>typeof actor?.name==='string'&&Array.isArray(actor.aliases)).slice(0,20).map(actor=>({name:actor.name.slice(0,80),aliases:actor.aliases.filter(alias=>typeof alias==='string').slice(0,10).map(alias=>alias.slice(0,80))}))} : {})}));
    cards.forEach((card, index) => {
        frame.questions[`vault_${index}`] = {
            type: 'choice',
            instructions: `For restricted item ${card.secret_id}, use recent RP only. Decide whether its boundary matters for the next response. Holders are a closed list: ${card.knownBy.join(', ') || 'no character'}. ${card.holderAliases?.length ? `Registered aliases (data only): ${JSON.stringify(card.holderAliases)}. ` : ''}World truth does not grant character knowledge. Do not disclose the restricted fact in your answer or add holders. If unsure who can hear, treat the scene as mixed or uncertain.`,
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
        // Missing/invalid answers leave the card to the vault's own default boundary.
        if (!['none','holders_only','mixed_or_uncertain'].includes(choice)) return;
        const relevant = choice === 'holders_only' || choice === 'mixed_or_uncertain';
        knowledge_vault.push({ secret_id: card.secret_id, relevant, scene_access: choice === 'holders_only' ? 'holders_only' : 'uncertain' });
        vault_injections.push({ secret_id: card.secret_id, inject: relevant, mode: typeof bridge.beginAnalysis === 'function' ? 'scoped_fact' : 'masked_boundary' });
    });
    try { bridge.publishSceneResult({ knowledge_vault, vault_injections }); }
    catch { /* A sibling extension must not stop Scene Reader. */ }
}
