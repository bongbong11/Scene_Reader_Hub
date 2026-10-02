import { normalizeCharacterStore } from "./store.js";
export function chunkSheet(source, maxChars = 1400) {
    const paragraphs = String(source || '').split(/\n\s*\n/).map((v) => v.trim()).filter(Boolean);
    const chunks = [];
    let current = '';
    for (const paragraph of paragraphs) {
        if (current && current.length + paragraph.length + 2 > maxChars) { chunks.push(current); current = ''; }
        if (paragraph.length > maxChars) {
            if (current) { chunks.push(current); current = ''; }
            for (let at = 0; at < paragraph.length; at += maxChars) chunks.push(paragraph.slice(at, at + maxChars));
        } else current += `${current ? '\n\n' : ''}${paragraph}`;
    }
    if (current) chunks.push(current);
    return chunks;
}

function terms(value) {
    return new Set(String(value || '').toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []);
}

export function selectRelevantChunks(source, query, limit = 2) {
    const chunks = chunkSheet(source);
    const safeLimit = Math.max(1, Number(limit) || 1);
    if (chunks.length <= safeLimit) return chunks;
    const queryTerms = terms(query);
    const ranked = chunks.map((text, index) => {
        const textTerms = terms(text);
        let score = 0;
        for (const term of queryTerms) if (textTerms.has(term)) score += term.length > 4 ? 2 : 1;
        if (/occupation|profession|education|background|relationship|family|skill|ability|직업|학력|교육|배경|관계|가족|능력|기술/i.test(text)) score += 3;
        return { text, index, score };
    }).sort((a, b) => b.score - a.score || a.index - b.index);
    return ranked.slice(0, safeLimit).map((v) => v.text);
}

export function selectActiveEntries(store, transcript, primaryCharacterName = '', carriedEntryIds = [], { allowUserImpersonation = false } = {}) {
    const normalized = normalizeCharacterStore(store);
    if (!normalized.enabled) return [];
    const haystack = String(transcript || '').toLocaleLowerCase();
    const primary = String(primaryCharacterName || '').trim().toLocaleLowerCase();
    const carried = new Set((Array.isArray(carriedEntryIds) ? carriedEntryIds : []).map(String));
    const names = (entry) => [entry.name, ...(entry.aliases || [])].map((name) => String(name || '').trim().toLocaleLowerCase()).filter(Boolean);
    const isPrimary = (entry) => Boolean(primary && names(entry).includes(primary));
    const mentionIndex = (name) => {
        if (!name) return -1;
        if (!/^[\p{L}\p{N}_]+$/u.test(name)) return haystack.lastIndexOf(name);
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_]|(?:은|는|이|가|을|를|에게|한테|께|의|와|과|도|만|에서|으로|로)(?=$|[^\\p{L}\\p{N}_]))`, 'giu');
        let latest = -1;
        for (const match of haystack.matchAll(pattern)) latest = Math.max(latest, match.index + match[1].length);
        return latest;
    };
    const latestMention = (entry) => Math.max(-1, ...names(entry).map(mentionIndex));
    const all = [...normalized.characters, ...normalized.npcs, ...(allowUserImpersonation && normalized.persona ? [normalized.persona] : [])];
    const soleCharacterId = normalized.characters.length === 1 ? normalized.characters[0].id : null;
    const scored = all.map((entry, order) => {
        const latest = latestMention(entry);
        let score = latest >= 0 ? 2000 + (latest / Math.max(1, haystack.length)) * 500 : 0;
        if (carried.has(entry.id)) score = Math.max(score, 1000);
        if (isPrimary(entry)) score = Math.max(score, 4000);
        if (entry.id === soleCharacterId) score = Math.max(score, 4000);
        if (allowUserImpersonation && entry.kind === 'persona') score = Math.max(score, 3900);
        return { entry, order, score };
    }).filter((item) => item.score > 0);
    if (!scored.length && normalized.characters.length === 1) scored.push({ entry: normalized.characters[0], order: 0, score: 500 });
    return scored
        .sort((a, b) => b.score - a.score || b.order - a.order)
        .map((item) => item.entry)
        .slice(0, 6);
}
