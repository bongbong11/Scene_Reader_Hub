const text = value => String(value || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 100).replace(/[\uD800-\uDFFF]/gu, '');
export function backupSource(context = {}) {
    const card = context.characters?.[context.characterId];
    const group = context.groups?.find(item => String(item.id) === String(context.groupId));
    const owner=context.groupId?`group:${context.groupId}`:card?.avatar?`character-avatar:${card.avatar}`:`character:${context.characterId??context.name2??'unknown'}`;
    return {characterName:text(context.groupId ? group?.name || context.name2 || '그룹 채팅' : card?.data?.name || card?.name || context.name2),chatName:text(context.chatId),...(context.chatId?{chatKey:`${owner}|chat:${context.chatId}`}:{})};
}
export function backupLabel(backup = {}) {
    return [text(backup.source?.characterName),text(backup.source?.chatName)].filter(Boolean).join(' · ') || '이름 정보 없는 백업';
}
// Source names are supported by existing plugins. Filtering changes only the
// list, never the contents or restore scope of an account snapshot.
export function backupsForRoom(backups, context = {}) {
    const rows = Array.isArray(backups) ? backups : [];
    if (!context.chatId) return rows;
    const source = backupSource(context);
    if (!source.characterName || !source.chatName) return [];
    return rows.filter(item => item?.source?.characterName === source.characterName && item?.source?.chatName === source.chatName);
}
export function backupsForCharacter(backups,context={}){
    const source=backupSource(context),identity=source.chatKey?.split('|chat:')[0];
    // Reimporting a card can change its avatar ID. Names help find the backup,
    // but the restore endpoint still checks identity and requests confirmation.
    return (Array.isArray(backups)?backups:[]).filter(item=>
        Boolean(identity&&item?.source?.chatKey?.split('|chat:')[0]===identity)||
        Boolean(source.characterName&&item?.source?.characterName===source.characterName));
}
export function backupFilename(backup = {}, extension = 'srbackup') {
    const name = Array.from(backupLabel(backup).replace(/[<>:"/\\|?*]/g, '_')).slice(0,40).join('');
    return `${name} · 전체 백업 · ${text(backup.id) || 'backup'}.${extension}`;
}
