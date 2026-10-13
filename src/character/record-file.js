import {normalizeCharacterStore} from './store.js';
import {validateRecordBundle} from './bundles.js';
import {createImportedRecordBank} from './records.js';
import {allEntries,archiveRecordVersion} from './versions.js';

// The user explicitly chooses the owner. A spelling change never creates a new person.
export function addRecordFile(store,groupId,personId,input,packed=[]){
 const next=normalizeCharacterStore(structuredClone(store)),entry=allEntries(next).find(person=>person.id===personId);
 const group=next.recordGroups.find(item=>item.id===groupId);
 if(!entry||(!group&&groupId!==`unversioned:${personId}`)||group&&!group.versions.some(version=>version.entryId===personId))throw new Error('파일을 추가할 인물을 찾지 못했습니다. 다시 열어 주세요.');
 const {outputs}=validateRecordBundle(input);
 if(outputs.length!==1)throw new Error('선택한 인물 한 명의 JSON 파일을 올려 주세요. 다인 파일은 기존 다인 캐릭터 추가에서 등록할 수 있습니다.');
 const output=outputs[0];
 if(output.entity_type!==entry.kind)throw new Error('선택한 인물 종류와 JSON의 인물 종류가 다릅니다.');
 const normalized=name=>String(name||'').trim().toLocaleLowerCase();
 if(allEntries(next).some(other=>other.id!==entry.id&&[other.name,...other.aliases].some(name=>normalized(name)===normalized(output.entity_name))))throw new Error('이 파일 이름은 다른 저장 인물의 이름입니다. 파일을 추가할 인물을 다시 확인하세요.');
 if(output.entity_name!==entry.name)entry.aliases=[...new Set([...entry.aliases,output.entity_name])];
 entry.recordBank=createImportedRecordBank({...output,entity_name:entry.name},entry,globalThis.crypto.randomUUID());
 const pages=packed.find(item=>item.entity_name===output.entity_name);
 if(pages?.pagedRecords)Object.assign(entry.recordBank,{pagedRecords:pages.pagedRecords,storageRefs:pages.storageRefs,recordIndices:pages.recordIndices,seedRecords:pages.seedRecords,seedIndices:pages.seedIndices,recordIds:[]});
 if(entry.profile){entry.legacyProfile=entry.profile;delete entry.profile;}
 entry.updatedAt=new Date().toISOString();
 archiveRecordVersion(next,entry,group?.name||entry.name,group?.id);
 return {store:next,entry};
}
