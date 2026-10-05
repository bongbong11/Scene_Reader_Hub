import { allEntries } from '../character/versions.js';

export function recordBundleRows(store, kind) {
    const entries = allEntries(store).filter(entry => entry.kind === kind);
    const covered = new Set();
    const rows = (store.recordGroups || []).filter(group => group.kind === kind && group.versions.length).map(group => {
        const people = new Map();
        for (const version of group.versions) {
            const id = version.entryId;
            covered.add(id);
            if (!people.has(id)) people.set(id, { id, entry: entries.find(entry => entry.id === id), name: version.entityName || version.entrySnapshot?.name || group.name, versions: [] });
            people.get(id).versions.push(version);
        }
        return { id: group.id, name: group.name, people: [...people.values()].sort((a,b)=>entries.findIndex(entry=>entry.id===a.id)-entries.findIndex(entry=>entry.id===b.id)) };
    });
    for (const entry of entries.filter(entry => !covered.has(entry.id))) rows.push({ id: `unversioned:${entry.id}`, name: entry.name, people: [{ id: entry.id, name: entry.name, entry, versions: [] }] });
    return rows;
}

export function renderRecordBundles(document, store, esc) {
    const root = document.getElementById('sr-character-versions');
    if (!root) return;
    const kind = root.dataset.kind || 'character';
    document.querySelectorAll('[data-record-kind]').forEach(button => { button.classList.toggle('active', button.dataset.recordKind === kind); button.setAttribute('aria-selected', String(button.dataset.recordKind === kind)); });
    const previous = new Map(Array.from(root.querySelectorAll?.('[data-record-bundle]') || []).map(node => [node.dataset.recordBundle, node.open]));
    root.innerHTML = recordBundleRows(store, kind).map(bundle => {
        const people = bundle.people.map(person => {
            const versions = person.versions.map(version => {
                const applied = person.entry?.appliedRecordVersion === version.id;
                const actions = [['view', '보기'], ['edit', '수정'], ['download','JSON'], ...(applied ? [] : [['apply', '적용']]), ['delete', '삭제']];
                return `<div class="sr-record-version"><span>${esc(new Date(version.savedAt).toLocaleString('ko-KR'))}${applied ? ' · 적용 중' : ''}</span><div class="sr-version-actions">${actions.map(([action, label]) => `<button type="button" class="menu_button" data-record-action="${action}" data-record-group="${esc(bundle.id)}" data-record-version="${esc(version.id)}">${label}</button>`).join('')}</div></div>`;
            }).join('');
            const nameAction = person.entry ? `data-character-view-kind="${esc(kind)}" data-character-view-id="${esc(person.id)}"` : `data-record-action="view" data-record-group="${esc(bundle.id)}" data-record-version="${esc(person.versions[0].id)}"`;
            const npcToggle = kind === 'npc' && person.entry ? `<label class="sr-npc-affect-toggle"><input type="checkbox" data-npc-affect-id="${esc(person.id)}" ${person.entry.trackArousal ? 'checked' : ''}><span>성적 충동·자제력 추가 판독</span></label>` : '';
            return `<div class="sr-record-person"><button type="button" class="sr-record-person-name" ${nameAction}>${esc(person.name)}</button><small>${person.versions.length ? `${person.versions.length}개 저장본` : '저장된 판독시트 없음'}</small>${npcToggle}<div class="sr-record-person-versions">${versions}</div></div>`;
        }).join('');
        return `<details class="sr-record-bundle" data-record-bundle="${esc(bundle.id)}" ${previous.get(bundle.id) !== false ? 'open' : ''}><summary><span>${esc(bundle.name)}</span><small>${bundle.people.length}명</small></summary><div class="sr-record-bundle-people">${people}</div></details>`;
    }).join('') || '<p class="sr-help">저장된 인물이 없습니다.</p>';
}
