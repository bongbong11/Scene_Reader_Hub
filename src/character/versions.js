import { normalizeCharacterStore } from "./store.js";
import { createImportedRecordBank, createRecordBank, recordBankIsCurrent } from "./records.js";
import { validateImport } from "../vendor/character-reasoner/index.js";

const uid = () => globalThis.crypto?.randomUUID?.() || `version-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const normalized = name => String(name || '').trim().replace(/\s+/g,' ').toLocaleLowerCase();
export const allEntries = store => [...store.characters, ...store.npcs, ...[store.persona].filter(Boolean)];
function putEntry(store, entry) {
    if (entry.kind === 'persona') store.persona = entry;
    else {
        const list = entry.kind === 'npc' ? store.npcs : store.characters;
        const index = list.findIndex(item=>item.id===entry.id);
        if (index < 0) list.push(entry); else list[index] = entry;
    }
}
export function bankOutput(bank) {
    return {entity_type:bank.entity_type,entity_name:bank.entity_name,...(bank.source_set_id?{source_set_id:bank.source_set_id}:{}),intimacy_reference:structuredClone(bank.intimacy_reference || {text:'',source_ids:[]}),records:structuredClone(bank.records)};
}
export function archiveRecordVersion(store, entry, saveName) {
    const name=String(saveName || '').trim();
    if (!name) throw new Error('저장 이름을 입력하세요.');
    store.recordGroups ||= [];
    let group=store.recordGroups.find(g=>g.kind===entry.kind && normalized(g.name)===normalized(name));
    if (!group) { group={id:uid(),kind:entry.kind,name,versions:[]}; store.recordGroups.push(group); }
    const entrySnapshot=Object.fromEntries(['id','kind','name','aliases','source','sourceHash','selectedLore','sourceVisibleToMain','npcRole','antagonist','trackArousal','provenance','cardCast'].filter(key=>Object.hasOwn(entry,key)).map(key=>[key,structuredClone(entry[key])]));
    const version={id:uid(),savedAt:new Date().toISOString(),entryId:entry.id,entityName:entry.name,entrySnapshot,bank:structuredClone(entry.recordBank)};
    group.versions.unshift(version);
    entry.appliedRecordVersion=version.id;
    return version;
}
export function importRecordVersion(store, input, saveName, form = null) {
    const {output}=validateImport(input);
    if (form?.kind && form.kind !== output.entity_type) throw new Error('선택한 인물 종류와 JSON의 인물 종류가 다릅니다.');
    if (form?.name && form.kind !== 'npc' && form.name !== output.entity_name) throw new Error('가져온 시트 이름과 JSON의 인물 이름이 다릅니다.');
    saveName=String(saveName||'').trim()||output.entity_name;
    const next=normalizeCharacterStore(structuredClone(store));
    const matches=allEntries(next).filter(entry=>entry.kind===output.entity_type && [entry.name,...entry.aliases].some(name=>normalized(name)===normalized(output.entity_name)));
    if (matches.length>1) throw new Error('같은 이름이나 별칭을 가진 인물이 여러 명입니다. 등록 이름을 먼저 정리하세요.');
    const existing=matches[0];
    const conflict=allEntries(next).find(entry=>entry.kind!==output.entity_type && [entry.name,...entry.aliases].some(name=>normalized(name)===normalized(output.entity_name)));
    if (conflict) throw new Error(`“${output.entity_name}”은 이미 다른 인물 종류로 등록돼 있습니다. 기존 등록을 확인하세요.`);
    const entry={...(existing || {}),id:existing?.id || uid(),kind:output.entity_type,name:output.entity_name,
        source:form?.source || existing?.source || '',selectedLore:form?.selectedLore || existing?.selectedLore || [],aliases:[...new Set([...(existing?.aliases || []),...(existing && existing.name!==output.entity_name?[existing.name]:[])])],
        sourceVisibleToMain:form?.sourceVisibleToMain ?? existing?.sourceVisibleToMain ?? output.entity_type!=='npc',npcRole:form?.npcRole || existing?.npcRole || (output.entity_type==='npc'?'mixed':''),updatedAt:new Date().toISOString()};
    if(form?.sourceHash)entry.sourceHash=form.sourceHash;
    if(form?.cardCast)entry.cardCast=structuredClone(form.cardCast);
    entry.antagonist=entry.npcRole==='villain';
    entry.recordBank=form?.source ? createRecordBank(input,entry,uid()) : createImportedRecordBank(input,entry,uid());
    if (entry.profile) {entry.legacyProfile=entry.profile;delete entry.profile;}
    putEntry(next,entry);
    archiveRecordVersion(next,entry,saveName);
    return {store:next,entry};
}
export function applyRecordVersion(store, groupId, versionId) {
    const next=normalizeCharacterStore(structuredClone(store));
    const group=next.recordGroups.find(g=>g.id===groupId), version=group?.versions.find(v=>v.id===versionId);
    if (!version) throw new Error('저장한 버전을 찾지 못했습니다.');
    let entry=allEntries(next).find(e=>e.id===version.entryId);
    if (!entry) {
        const sameName=allEntries(next).find(e=>[e.name,...e.aliases].some(name=>normalized(name)===normalized(version.entityName)));
        if (sameName && sameName.kind!==group.kind) throw new Error('같은 인물이 다른 종류로 등록돼 있습니다. 등록 이름을 먼저 확인하세요.');
        entry=sameName || (version.entrySnapshot ? structuredClone(version.entrySnapshot) : null);
        if (!entry) throw new Error('이 인물의 원본 등록이 없습니다. 버전을 복사한 뒤 다시 가져오세요.');
    }
    if (!recordBankIsCurrent({...entry,recordBank:version.bank})) throw new Error('원문 또는 판독 기준이 바뀌었습니다. 결과를 다시 검증해 가져오거나 새로 판독하세요.');
    entry.recordBank=structuredClone(version.bank);entry.appliedRecordVersion=version.id;
    putEntry(next,entry);
    return {store:next,entry};
}
export function deleteRecordVersion(store, groupId, versionId) {
    const next=normalizeCharacterStore(structuredClone(store));
    const group=next.recordGroups.find(g=>g.id===groupId);
    if (!group) throw new Error('저장 항목을 찾지 못했습니다.');
    group.versions=group.versions.filter(v=>v.id!==versionId);
    next.recordGroups=next.recordGroups.filter(g=>g.versions.length);
    for (const entry of allEntries(next)) if (entry.appliedRecordVersion===versionId) {
        delete entry.recordBank;delete entry.appliedRecordVersion;
    }
    return next;
}
