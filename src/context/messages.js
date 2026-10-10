import {isMessageHidden} from './visibility.js';
export function isVisibleRoleplayMessage(message) {
    if (!message || message.is_system) return false;
    if (isMessageHidden(message)) return false;
    return Boolean(String(message.mes ?? '').trim());
}

function normalizedPendingText(value) {
    return String(value ?? '').trim();
}

export function appendPendingUserMessage(chat, pendingUserText = '', userName = 'USER') {
    const visible = (Array.isArray(chat) ? chat : []).filter(isVisibleRoleplayMessage);
    const pending = normalizedPendingText(pendingUserText);
    if (!pending) return visible;
    return [...visible, { is_user: true, is_system: false, mes: pending, name: userName, extra: { sceneReaderPending: true } }];
}

export function selectRecentMessages({ chat, pendingUserText = '', turnCount = 3, userName = 'USER' }) {
    const visible = appendPendingUserMessage(chat, pendingUserText, userName);
    const safeTurns = Math.max(1, Math.min(5, Number(turnCount) || 3));
    const userStarts = visible.map((message, index) => message.is_user ? index : -1).filter((index) => index >= 0);
    const start = userStarts.length ? userStarts[Math.max(0, userStarts.length - safeTurns)] : Math.max(0, visible.length - 1);
    return visible.slice(start);
}

const OOC_PREFIX = /(?:ooc|out\s+of\s+character|오오씨|사담)\s*:/iy;

/** Split OOC blocks without changing the original message stored by SillyTavern. */
export function splitOocText(value) {
    const text = String(value ?? '');
    const blocks = [];
    const spans = [];
    let malformed = false;
    let cursor = 0;
    while (cursor < text.length) {
        const open = text.slice(cursor).search(/[\[(]/);
        if (open < 0) break;
        const start = cursor + open;
        OOC_PREFIX.lastIndex = start + 1;
        const match = OOC_PREFIX.exec(text);
        if (!match || match.index !== start + 1) { cursor = start + 1; continue; }
        const closeChar = text[start] === '(' ? ')' : ']';
        const contentStart = OOC_PREFIX.lastIndex;
        let close = -1;
        const stack = [closeChar];
        for (let i = contentStart; i < text.length; i += 1) {
            if (text[i] === '\\') { i += 1; continue; }
            if (text[i] === '(') stack.push(')');
            else if (text[i] === '[') stack.push(']');
            else if (text[i] === stack.at(-1)) { stack.pop(); if (!stack.length) { close = i; break; } }
        }
        const end = close >= 0 ? close + 1 : text.length;
        const content = text.slice(contentStart, close >= 0 ? close : text.length).trim();
        if (content) blocks.push(content);
        spans.push([start, end]);
        if (close < 0) malformed = true;
        cursor = end;
    }
    const standalone = text.match(/^\s*(?:ooc|out\s+of\s+character|오오씨|사담)\s*:\s*([\s\S]*)$/i);
    if (!spans.length && standalone) {
        if (standalone[1].trim()) blocks.push(standalone[1].trim());
        spans.push([0, text.length]);
    }
    let rpText = '';
    let at = 0;
    for (const [start, end] of spans) {
        rpText += text.slice(at, start);
        at = end;
    }
    rpText += text.slice(at);
    return { rpText: rpText.replace(/\n{3,}/g, '\n\n').trim(), oocBlocks: blocks, malformed };
}

export function filterNonRpHistory(chat, nonRpOutputIndices = [], pendingUserText = '') {
    const messages = Array.isArray(chat) ? chat : [];
    const excluded = new Set(Array.isArray(nonRpOutputIndices) ? nonRpOutputIndices : []);
    const preserveLatestUser = !String(pendingUserText || '').trim();
    const latestUserIndex = preserveLatestUser ? messages.findLastIndex((message) => message?.is_user && isVisibleRoleplayMessage(message)) : -1;
    return messages.filter((message, index) => {
        if (excluded.has(index)) return false;
        if (!message?.is_user || index === latestUserIndex) return true;
        if (message?.extra?.ooc_chat === true) return false;
        const split = splitOocText(message.mes);
        return !(split.oocBlocks.length && !split.rpText);
    });
}

function hashText(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
    return `${text.length}:${hash >>> 0}`;
}

export function buildRecentContext({ chat, pendingUserText = '', turnCount = 3, maxChars = 18000, userName = 'USER', characterName = 'CHARACTER' }) {
    const selected = selectRecentMessages({ chat, pendingUserText, turnCount, userName });
    if (!selected.length) throw new Error('판독할 최근 채팅이 없습니다.');
    const latestUserIndex = selected.map((message, index) => message.is_user ? index : -1).filter((index) => index >= 0).at(-1) ?? -1;
    const currentOoc = [];
    const recentOoc = [];
    let malformedOoc = false;
    const chunks = [];
    selected.forEach((message, index) => {
        const markedOoc = Boolean(message?.is_user && message?.extra?.ooc_chat === true);
        const split = markedOoc
            ? { rpText: '', oocBlocks: [String(message.mes || '').trim()].filter(Boolean), malformed: false }
            : splitOocText(message.mes);
        malformedOoc ||= split.malformed;
        if (message.is_user && split.oocBlocks.length) {
            if (index === latestUserIndex) currentOoc.push(...split.oocBlocks);
            else recentOoc.push({ distance: latestUserIndex - index, guidance: split.oocBlocks.join('\n') });
        }
        if (!split.rpText) return;
        const role = message.is_user ? 'USER' : 'CHARACTER';
        const name = String(message.name || (message.is_user ? userName : characterName) || role);
        chunks.push(`[${index + 1}] ${role} (${name})\n${split.rpText}`);
    });
    while (chunks.length > 1 && chunks.join('\n\n').length > maxChars) chunks.shift();
    const joined = chunks.join('\n\n');
    const recentRoleplay = joined.length <= maxChars ? joined : `[older text clipped]\n${joined.slice(-maxChars)}`;
    const latestMessage = latestUserIndex >= 0 ? selected[latestUserIndex] : null;
    const latestCharacter = [...selected].reverse().find((message) => !message.is_user && !message.is_system) || null;
    const latestUser = latestMessage?.extra?.ooc_chat === true
        ? { rpText: '', oocBlocks: [String(latestMessage.mes || '').trim()].filter(Boolean) }
        : latestMessage ? splitOocText(latestMessage.mes) : { rpText: '', oocBlocks: [] };
    return {
        selected,
        recentRoleplay,
        metaGuidance: { current: currentOoc.join('\n\n'), recent: recentOoc },
        oocOnly: Boolean(latestUser.oocBlocks.length && !latestUser.rpText),
        confirmedOoc: Boolean(latestMessage?.extra?.ooc_chat === true),
        malformedOoc,
        observationKey: latestCharacter ? hashText(`C\u0000${String(latestCharacter.mes || '')}`) : '',
        contextKey: hashText(selected.map((message) => `${message.is_user ? 'U' : 'C'}\u0000${String(message.mes || '')}\u0000${message?.extra?.ooc_chat === true ? 'ooc' : ''}`).join('\u0001')),
    };
}

export function buildRecentTranscript(options) {
    return buildRecentContext(options).recentRoleplay;
}

export function latestUserMessageText(chat, pendingUserText = '') {
    const pending = normalizedPendingText(pendingUserText);
    if (pending) return pending;
    const visible = (Array.isArray(chat) ? chat : []).filter(isVisibleRoleplayMessage);
    return String([...visible].reverse().find((message) => message.is_user)?.mes || '');
}

export function buildInputKey(chat, pendingUserText = '', cycleSalt = '') {
    const visible = appendPendingUserMessage(chat, pendingUserText);
    const users = visible.filter((message) => message.is_user);
    const text = String(users.at(-1)?.mes || '');
    return `${users.length}:${hashText(text)}${cycleSalt ? `|${cycleSalt}` : ''}`;
}

export function generationCycleSalt(chat, type, data = {}) {
    const kind = String(type || 'normal');
    if (kind !== 'continue' && !data?.automatic_trigger) return '';
    const visible = (Array.isArray(chat) ? chat : []).filter(isVisibleRoleplayMessage);
    const latest = String(visible.at(-1)?.mes || '');
    let hash = 2166136261;
    for (let index = 0; index < latest.length; index += 1) hash = Math.imul(hash ^ latest.charCodeAt(index), 16777619);
    return `${data?.automatic_trigger ? 'automatic' : kind}:${visible.length}:${latest.length}:${hash >>> 0}:${data?.force_chid ?? ''}`;
}

export function pendingComposerText(type, data, composerValue) {
    if (data?.automatic_trigger) return '';
    if (['regenerate', 'swipe', 'quiet', 'continue', 'impersonate'].includes(String(type || 'normal'))) return '';
    return normalizedPendingText(composerValue);
}
