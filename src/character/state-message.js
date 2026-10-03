import { isVisibleRoleplayMessage, splitOocText } from '../context/messages.js';

export function isStateOutput(message, index, excluded = []) {
    const ignored = Array.isArray(excluded) ? excluded : [];
    return isVisibleRoleplayMessage(message) && !message.is_user && !message.extra?.ooc_chat &&
        !ignored.includes(index) && Boolean(splitOocText(message.mes).rpText.trim());
}

export function latestStateOutputIndex(chat, excluded = []) {
    return (Array.isArray(chat) ? chat : []).findLastIndex((message,index) => isStateOutput(message,index,excluded));
}
