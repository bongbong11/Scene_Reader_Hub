import { normalizeCharacterStore } from './store.js';
import { allEntries } from './versions.js';

export function characterDeletionTarget(store, kind, id) {
    if (!['character', 'persona', 'npc'].includes(kind) || !id) throw new Error('삭제할 인물을 찾지 못했습니다.');
    const entry = allEntries(store).find(item => item.kind === kind && item.id === id);
    const versions = (store.recordGroups || []).filter(group => group.kind === kind)
        .flatMap(group => group.versions).filter(version => version.entryId === id);
    if (!entry && !versions.length) throw new Error('삭제할 인물을 찾지 못했습니다.');
    return { name: entry?.name || versions[0]?.entityName || versions[0]?.entrySnapshot?.name || '선택한 인물', count: versions.length };
}

export function characterDeletionNotice(target) {
    return `“${target.name}” 인물을 삭제할까요? 이 인물의 등록 정보와 모든 저장본 ${target.count}개를 함께 삭제합니다. 같은 묶음의 다른 인물과 기존 백업은 유지됩니다.`;
}

export function deleteCharacterRecords(store, kind, id) {
    characterDeletionTarget(store, kind, id);
    const next = normalizeCharacterStore(structuredClone(store));
    if (kind === 'persona') {
        if (next.persona?.id === id) next.persona = null;
    } else {
        const key = kind === 'npc' ? 'npcs' : 'characters';
        next[key] = next[key].filter(entry => entry.id !== id);
    }
    next.recordGroups = next.recordGroups.map(group => group.kind === kind
        ? { ...group, versions: group.versions.filter(version => version.entryId !== id) }
        : group).filter(group => group.versions.length);
    return next;
}
