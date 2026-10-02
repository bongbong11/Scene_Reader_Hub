// Reserved wiring for future creator-only memory experiments; not active in RP.
export const MEMORY_REFERENCE_ENABLED = false;
import { stableFingerprint } from "../decision/policy.js";
export const MEMORY_POLICY = 'External memory is authorial reference, never automatic character knowledge or proof of current action. Preserve source and uncertainty. Missing summary details do not prove absence. Recent explicit RP corrections take precedence; unresolved contradictions remain uncertain. Do not repeat memory text in the injection. Only use relevant continuity to validate current routes and individual knowledge boundaries.';

export function boundedText(text, limit) {
    text = String(text || '');
    if (text.length <= limit) return text;
    const half = Math.floor((limit - 40) / 2);
    return `${text.slice(0, half)}\n[중간 생략 · 요약의 부재는 사실의 부재가 아님]\n${text.slice(-half)}`;
}
export async function readCharm(bridge, { identity, isCurrent, timeoutMs = 1200, maxChars = 6000 } = {}) {
    if (typeof bridge?.getStoryContext !== 'function') return { status: 'unavailable', entries: [] };
    let timer;
    try {
        const result = await Promise.race([
            Promise.resolve().then(() => bridge.getStoryContext({ maxChars })),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
        ]);
        if (!isCurrent()) return { status: 'stale', entries: [] };
        // Only the documented story string, not arbitrary bridge objects or embedding collections.
        if (typeof result !== 'string') return { status: 'unsupported', entries: [] };
        if (!result.trim()) return { status: 'empty', entries: [] };
        return { status: result.length > maxChars ? 'limited' : 'ready', entries: [{ sourceKind: 'charm', sourceId: 'story-context', identity, contentHash: stableFingerprint(result), nature: 'summary_reference', text: boundedText(result, maxChars), acquiredAt: new Date().toISOString() }] };
    } catch (error) { return { status: error.message === 'timeout' ? 'timeout' : 'error', entries: [] }; }
    finally { clearTimeout(timer); }
}
export function linkedCharacterBooks(context, worldInfo) {
    const character = context?.characters?.[context.characterId];
    if (!character) return [];
    const primary = character.data?.extensions?.world;
    // SillyTavern stores auxiliary links under the avatar filename without its extension.
    const characterKey = String(character.avatar || '').replace(/\.[^/.]+$/, '');
    const auxiliary = worldInfo?.charLore?.find(link => link.name === characterKey)?.extraBooks || [];
    return [...new Set([primary, ...(Array.isArray(auxiliary) ? auxiliary : [])].filter(name => typeof name === 'string' && name.trim()))];
}

function matchesKey(key, text, entry, options) {
    key = String(key || '').trim().replace(/\{\{(char|user)\}\}/gi, (_, name) => options[name.toLowerCase()] || '');
    if (!key) return false;
    const literal = key.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/);
    if (literal) {
        try { return new RegExp(literal[1], literal[2]).test(text); }
        catch { return false; }
    }
    if (!(entry.caseSensitive ?? options.caseSensitive)) { key = key.toLowerCase(); text = text.toLowerCase(); }
    if ((entry.matchWholeWords ?? options.matchWholeWords) && !/\s/.test(key)) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`).test(text);
    }
    return text.includes(key);
}

function matchesEntry(entry, text, options) {
    const keys = Array.isArray(entry.key) ? entry.key : [entry.key];
    if (!keys.some(key => matchesKey(key, text, entry, options))) return false;
    const secondary = Array.isArray(entry.keysecondary) ? entry.keysecondary.filter(Boolean) : [];
    if (!entry.selective || !secondary.length) return true;
    const matches = secondary.map(key => matchesKey(key, text, entry, options));
    switch (Number(entry.selectiveLogic) || 0) {
        case 1: return !matches.every(Boolean);
        case 2: return !matches.some(Boolean);
        case 3: return matches.every(Boolean);
        default: return matches.some(Boolean);
    }
}

function allowsCharacter(entry, { characterKey, characterTags = [] }) {
    const filter = entry.characterFilter;
    if (!filter) return true;
    for (const [required, current] of [[filter.names, [characterKey]], [filter.tags, characterTags]]) {
        if (!Array.isArray(required) || !required.length) continue;
        const matches = required.some(value => current.includes(value));
        if (filter.isExclude ? matches : !matches) return false;
    }
    return true;
}

export function selectCharacterLoreEntries(entries, identity, recentRoleplay, { maxChars = 6000, maxEntries = 8, ...options } = {}) {
    const current = String(recentRoleplay || '');
    const eligible = (entries || []).filter(entry => entry && !entry.disable && typeof entry.content === 'string' && entry.content.trim() && allowsCharacter(entry, options));
    const ranked = eligible.map((entry, index) => ({ entry, index, rank: matchesEntry(entry, current, options) ? 3 : entry.constant ? 2 : 0 }))
        .filter(item => item.rank > 0)
        .sort((a, b) => b.rank - a.rank || Number(b.entry.order || 0) - Number(a.entry.order || 0) || a.index - b.index);
    const result = []; let remaining = maxChars; let truncated = false;
    for (const { entry } of ranked) {
        if (result.length >= maxEntries || remaining < 80) break;
        const entryLimit = Math.min(1600, remaining);
        const text = boundedText(entry.content, entryLimit);
        if (entry.content.length > entryLimit) truncated = true;
        result.push({ sourceKind: 'lorebook', sourceId: `${entry.world}:${entry.uid}`, identity, contentHash: stableFingerprint(entry.content), nature: 'linked_character_reference', text });
        remaining -= text.length;
    }
    return { entries: result, limited: truncated || ranked.length > result.length };
}

export async function readCharacterLorebooks(worldInfoModule, context, { identity, recentRoleplay, isCurrent, timeoutMs = 2000 } = {}) {
    if (typeof worldInfoModule?.loadWorldInfo !== 'function') return { status: 'unavailable', entries: [] };
    const books = linkedCharacterBooks(context, worldInfoModule.world_info);
    if (!books.length) return { status: 'empty', entries: [] };
    const contents = await Promise.all(books.map(async name => {
        let timer;
        try {
            const data = await Promise.race([
                Promise.resolve().then(() => worldInfoModule.loadWorldInfo(name)),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
            ]);
            if (!data?.entries || typeof data.entries !== 'object') return { status: 'error', entries: [] };
            return { status: 'ready', entries: Object.entries(data.entries).filter(([, entry]) => entry && typeof entry === 'object').map(([uid, entry]) => ({ ...entry, uid: entry.uid ?? uid, world: name })) };
        } catch (error) { return { status: error.message === 'timeout' ? 'timeout' : 'error', entries: [] }; }
        finally { clearTimeout(timer); }
    }));
    if (!isCurrent()) return { status: 'stale', entries: [] };
    const character = context.characters[context.characterId];
    const available = contents.flatMap(book => book.entries);
    const selected = selectCharacterLoreEntries(available, identity, recentRoleplay, {
        char: context.name2, user: context.name1,
        caseSensitive: worldInfoModule.world_info_case_sensitive,
        matchWholeWords: worldInfoModule.world_info_match_whole_words,
        characterKey: String(character.avatar || '').replace(/\.[^/.]+$/, ''),
        characterTags: context.tagMap?.[character.avatar] || [],
    });
    const failed = contents.filter(book => book.status !== 'ready');
    const status = failed.length ? (failed.length < books.length ? 'partial' : failed.some(book => book.status === 'timeout') ? 'timeout' : 'error')
        : selected.limited ? 'limited' : selected.entries.length ? 'ready' : available.some(entry => !entry.disable && String(entry.content || '').trim()) ? 'unmatched' : 'empty';
    return { status, entries: selected.entries };
}

export function memoryStatusText(preferences = {}, status = {}) {
    const labels = { off:'사용 안 함', ready:'참고함', limited:'길이 제한 후 참고함', partial:'일부 책 읽기 실패 · 읽은 자료만 참고', empty:'읽을 내용 없음', unmatched:'현재 장면과 맞는 항목 없음', unavailable:'읽기 기능 사용 불가', unsupported:'지원되지 않는 응답', timeout:'응답 시간 초과', error:'읽기 실패', stale:'채팅 변경으로 취소' };
    const label = (enabled, value) => enabled ? labels[value] || '다음 판독에서 확인' : labels.off;
    return `참메모리: ${label(preferences.charmMemory, status.charm)} · 로어북: ${label(preferences.lorebookMemory, status.lorebook)}`;
}
export function mergeMemory(charm, lore, identity) {
    const seen = new Set();
    const entries = [...(charm?.entries || []), ...(lore?.entries || [])].filter(entry => {
        if (entry.identity !== identity || seen.has(entry.contentHash)) return false;
        seen.add(entry.contentHash); return true;
    });
    return { identity, policy: MEMORY_POLICY, status: { charm: charm?.status || 'off', lorebook: lore?.status || 'off' }, entries };
}
