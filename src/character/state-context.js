import { isVisibleRoleplayMessage, splitOocText } from '../context/messages.js';
import { extractStateBlock } from './state-contract.js';

// Read two earlier completed RP exchanges plus the current incoming message.
// Context supplies expression/relationship continuity, never state rows itself.
export function buildEmotionContext(chat, outputIndex, { nonRpOutputIndices = [], maxChars = 8000 } = {}) {
    const excluded = new Set(nonRpOutputIndices), rows = [];
    let earlierReplies = 0, used = 0;
    for (let index = outputIndex - 1; index >= 0; index--) {
        const message = chat?.[index];
        if (!isVisibleRoleplayMessage(message) || excluded.has(index) || message.extra?.ooc_chat) continue;
        if (!message.is_user && earlierReplies >= 2) break;
        let text = splitOocText(message.mes).rpText.trim();
        text = extractStateBlock(text, []).text.trim();
        if (!text) continue;
        const row = { role: message.is_user ? 'user' : 'assistant', speaker: String(message.name || (message.is_user ? 'USER' : 'CHARACTER')), text };
        const size = JSON.stringify(row).length;
        if (used + size > maxChars) break; // Never clip a sentence or skip a newer exchange to read older evidence.
        used += size; rows.unshift(row);
        if (!message.is_user) earlierReplies++;
    }
    return { messages: rows, earlierReplies, chars: used };
}
