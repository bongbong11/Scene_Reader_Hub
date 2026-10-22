import {encodeTree} from './tree-codec.js';
import {recordHashes} from '../retrieval/record-hashes.js';
import {digest} from './shared-document.js';
import {ensureNpcIndex} from '../character/npc-index.js';
let storage,report;
export function bindCharacterPages(post,noteDiagnostic){storage=post;report=noteDiagnostic;}
const words=text=>[...new Set(String(text||'').toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu)||[])];
export async function packCharacterStore(store,emit,{signal}={}) {
 const next=structuredClone(store),banks=new Map();
 async function bank(value) {
  ensureNpcIndex(value);
  if(!value?.records||value.pagedRecords||value.records.length<512&&JSON.stringify(value).length<256*1024)return value;
  const signature=digest([value.analysisId,value.records]);if(banks.has(signature))return banks.get(signature);
  const root=await encodeTree(value.records,emit,{signal}),terms=Object.create(null),anchors=[],types=new Set();
  for(let index=0;index<value.records.length;index++){
   const record=value.records[index];if(!types.has(record.type)&&JSON.stringify(record).length<16000){types.add(record.type);anchors.push(index);}
   for(const word of words([record.target,record.when,String(record.rule).slice(0,16000),record.type,record.knowledge_domain].join(' ')))(terms[word]||=[]).push(index);
   (terms['_type:'+record.type]||=[]).push(index);
   for(const vectorHash of recordHashes('character',record,index))terms['_hash:'+vectorHash]=[index];
   if(index%512===0){signal?.throwIfAborted();await new Promise(resolve=>setTimeout(resolve,0));}
  }
  const indexRoot=await encodeTree(terms,emit,{signal}),result={...value,records:anchors.map(index=>value.records[index]),recordIds:[],recordIndices:anchors,seedRecords:anchors.map(index=>value.records[index]),seedIndices:anchors,pagedRecords:{schemaVersion:2,root,indexRoot,count:value.records.length,bankId:'shared-character-'+digest(value.records)},storageRefs:[root,indexRoot]};banks.set(signature,result);return result;
 }
 for(const entry of [...(next.characters||[]),...(next.npcs||[]),...[next.persona].filter(Boolean)])entry.recordBank=await bank(entry.recordBank);
 for(const group of next.recordGroups||[])for(const version of group.versions||[])version.bank=await bank(version.bank);
 return next;
}
export async function loadBankRecords(bank,{query='',hashes=[],all=false,offset,purpose,signal}={}) {
 if(!bank?.pagedRecords)return {records:bank?.records||[],indices:bank?.records?.map((_,index)=>index)||[]};
 if(!storage)throw new Error('인물 자료 저장 연결을 불러오지 못했습니다.');
 const result=await storage('v2/character/records',{...bank.pagedRecords,terms:words(query).slice(0,24),hashes,all,offset,purpose,anchors:bank.recordIndices||[]},{signal});
 if(result.status==='fallback')report?.('character_pages',{module:'src/storage/character-pages.js',status:'degraded',errorKind:result.code});
 return result;
}
// Older paged term indexes may only know the original property-order hash.
// The vector's bounded record position still addresses the same immutable bank.
export async function completeBankMatches(bank,loaded,indices,{signal}={}) {
 const records=new Map(loaded.indices.map((index,at)=>[index,loaded.records[at]]));
 const wanted=[...new Set(indices)].filter(index=>Number.isSafeInteger(index)&&index>=0&&index<bank.pagedRecords.count);
 for(const index of wanted){
  if(records.has(index))continue;
  const page=await loadBankRecords(bank,{offset:index,purpose:'embedding',signal});
  for(let at=0;at<page.indices.length;at++)if(wanted.includes(page.indices[at]))records.set(page.indices[at],page.records[at]);
  if(!records.has(index))throw Object.assign(new Error('검색된 인물 기록을 불러오지 못했습니다.'),{code:'CHARACTER_RECORD_READ_FAILED'});
 }
 return {...loaded,indices:[...records.keys()],records:[...records.values()]};
}
export async function expandBank(bank,options={}) {const {records}=await loadBankRecords(bank,{...options,all:true});const copy={...bank,records};for(const key of ['pagedRecords','storageRefs','recordIndices','seedRecords','seedIndices'])delete copy[key];return copy;}
export async function expandCharacterStore(store,options={}){if(!store)return store;const next=structuredClone(store),cache=new Map(),expand=async bank=>{if(!bank?.pagedRecords)return bank;const key=bank.pagedRecords.root+':'+bank.analysisId;if(!cache.has(key))cache.set(key,await expandBank(bank,options));return cache.get(key);};for(const entry of [...(next.characters||[]),...(next.npcs||[]),...[next.persona].filter(Boolean)])entry.recordBank=await expand(entry.recordBank);for(const group of next.recordGroups||[])for(const version of group.versions||[])version.bank=await expand(version.bank);return next;}

export async function *bankPages(bank,{signal}={}){let offset=0;while(offset!==null){signal?.throwIfAborted();const page=await loadBankRecords(bank,{offset,purpose:'embedding',signal});if(page.nextOffset!==null&&(!Number.isInteger(page.nextOffset)||page.nextOffset<=offset))throw new Error('인물 기록 페이지 순서가 올바르지 않습니다.');yield page;offset=page.nextOffset;}}

export async function exportBank(bank){if(!storage)throw new Error('저장 연결을 먼저 불러와 주세요.');const operationId=digest(['character-export',bank.pagedRecords.root,Date.now(),Math.random()]);await storage('v2/character/export',{operationId,bank});return operationId;}
