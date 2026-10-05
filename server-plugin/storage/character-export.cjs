const {hash}=require('./paths.cjs');
const {reader}=require('./chunks.cjs');
const {get}=require('./backups.cjs');
const {failure}=require('./limits.cjs');
const output=bank=>({entity_type:bank.entity_type,entity_name:bank.entity_name,...(bank.source_set_id?{source_set_id:bank.source_set_id}:{}),intimacy_reference:bank.intimacy_reference||{text:'',source_ids:[]},records:bank.records});
async function inventory(root,id) {
 const backup=await get(root,id),nodes=reader(root),snapshot=await nodes.value(backup.root),rows=[],seen=new Set();
 const keys=Object.keys(snapshot.documents).sort((a,b)=>Number(!a.includes('|asset|'))-Number(!b.includes('|asset|')));
 for(const key of keys){if(!key.includes('|asset|')&&!/^legacy:characters\//.test(key))continue;const value=await nodes.value(snapshot.documents[key].root),store=key.includes('|asset|')?value.hubDocument?.data?.characters:value;if(!store)continue;
  const banks=[...(store.characters||[]),...(store.npcs||[]),...[store.persona].filter(Boolean)].filter(entry=>entry.recordBank).map(entry=>({personId:entry.id,name:entry.name,kind:entry.kind,bank:entry.recordBank,versionId:entry.appliedRecordVersion||'active',bundle:''}));
  for(const group of store.recordGroups||[])for(const version of group.versions||[])banks.push({personId:version.entryId,name:version.entityName,kind:group.kind,bank:version.bank,versionId:version.id,bundle:group.name});
  for(const item of banks){const signature=hash(JSON.stringify([item.personId,item.versionId,item.bank.analysisId]));if(seen.has(signature))continue;seen.add(signature);rows.push({...item,selectionId:hash(JSON.stringify([id,key,item.personId,item.versionId])),recordCount:item.bank.pagedRecords?.count||item.bank.records?.length||0});}
 }return rows;
}
async function select(root,id,selections) {
 if(!Array.isArray(selections)||!selections.length||selections.length>6)throw failure('STORAGE_INVALID_SELECTION','내보낼 인물을 1~6명 선택하세요.');const rows=await inventory(root,id),chosen=selections.map(selection=>rows.find(row=>row.selectionId===selection));if(chosen.some(item=>!item))throw failure('STORAGE_INVALID_SELECTION','백업의 인물을 찾지 못했습니다.');
 const nodes=reader(root),outputs=[];for(const item of chosen){const bank=item.bank;const records=bank.pagedRecords?await nodes.value(bank.pagedRecords.root):bank.records;outputs.push(output({...bank,records}));}
 const {validateImport}=await import('../vendor/character-core.mjs');for(const output of outputs)validateImport(output);const value=outputs.length===1?outputs[0]:{entities:outputs};return value;
}
async function selectedBanks(root,id,selections){if(!Array.isArray(selections)||!selections.length||selections.length>6)throw failure('STORAGE_INVALID_SELECTION','내보낼 인물을 1~6명 선택하세요.');const rows=await inventory(root,id);return selections.map(selection=>{const row=rows.find(row=>row.selectionId===selection);if(!row)throw failure('STORAGE_INVALID_SELECTION','백업의 인물을 찾지 못했습니다.');return row.bank;});}
module.exports={inventory,select,output,selectedBanks};
