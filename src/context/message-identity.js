import { stableFingerprint } from "../decision/policy.js";

export function messageSnapshot(chat) {
    return (Array.isArray(chat) ? chat : []).map((message) => ({
        role: message?.is_user ? 'user' : message?.is_system ? 'system' : 'character',
        fingerprint: stableFingerprint(String(message?.mes || '')),
        swipe: message?.swipe_id ?? null,
        explicitId: message?.extra?.sceneReaderMessageId || message?.send_date || null,
        ooc: message?.extra?.ooc_chat === true,
    }));
}

export function firstChangedMessage(before, after) {
    if (!Array.isArray(before)) return 0;
    const count = Math.min(before.length, after.length);
    for (let index = 0; index < count; index += 1) {
        if (JSON.stringify(before[index]) !== JSON.stringify(after[index])) return index;
    }
    return before.length === after.length ? -1 : count;
}

export function attachSelectedOutput(plan, chat, index) {
    const message = chat?.[index];
    if (!plan || !message || message.is_user || message.is_system || !String(message.mes || '').trim()) return false;
    plan.outputIndex = index;
    plan.outputText = String(message.mes);
    plan.outputFingerprint = stableFingerprint(plan.outputText);
    plan.outputSwipe = message.swipe_id ?? null;
    plan.status = 'awaiting_verification';
    return true;
}
