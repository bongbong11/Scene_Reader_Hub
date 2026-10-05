const text = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 100).replace(/[\uD800-\uDFFF]/gu, '');
export function backupSource(context = {}) {
    const card = context.characters?.[context.characterId];
    const group = context.groups?.find(item => String(item.id) === String(context.groupId));
    return {characterName:text(context.groupId ? group?.name || context.name2 || '그룹 채팅' : card?.data?.name || card?.name || context.name2),chatName:text(context.chatId)};
}
export function backupLabel(backup = {}) {
    return [text(backup.source?.characterName),text(backup.source?.chatName)].filter(Boolean).join(' · ') || '이름 정보 없는 백업';
}
export function backupFilename(backup = {}, extension = 'srbackup') {
    const name = Array.from(backupLabel(backup).replace(/[<>:"/\\|?*]/g, '_')).slice(0,40).join('');
    return `${name} · 전체 백업 · ${text(backup.id) || 'backup'}.${extension}`;
}
