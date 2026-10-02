export const hash32 = text => {
    let hash = 2166136261;
    for (const char of String(text)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
};
export const hash53 = text => (hash32(`left:${text}`) & 0x1fffff) * 0x100000000 + hash32(`right:${text}`);
export const queryText = text => String(text || '').slice(-4500).trim();
export const recordText = (kind, item) => kind === 'world'
    ? [item.category, item.when, ...(item.keywords || []), item.rule].join(' · ')
    : [item.type, item.target, ...(Array.isArray(item.when) ? item.when : [item.when]), item.rule, item.modality, item.knowledge_domain, item.knowledge_state].filter(Boolean).join(' · ');
