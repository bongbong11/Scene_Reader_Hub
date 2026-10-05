const {encode}=require('./chunks.cjs');
const {digest}=require('./canonical.cjs');
const hash32=text=>{let hash=2166136261;for(const char of String(text)){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}return hash>>>0;};
const hash53=text=>(hash32('left:'+text)&0x1fffff)*0x100000000+hash32('right:'+text);
async function pack(root,bank){
 if(bank.pagedRecords||bank.records.length<512&&Buffer.byteLength(JSON.stringify(bank))<256*1024)return bank;
 const refs=await encode(root,bank.records),terms=Object.create(null),anchors=[],types=new Set();
 for(let index=0;index<bank.records.length;index++){const record=bank.records[index];if(!types.has(record.type)&&JSON.stringify(record).length<16000){types.add(record.type);anchors.push(index);}const text=[record.type,record.target,...(Array.isArray(record.when)?record.when:[record.when]),record.rule,record.modality,record.knowledge_domain,record.knowledge_state].filter(Boolean).join(' · ');
  for(const term of new Set([record.target,record.when,String(record.rule).slice(0,16000),record.type,record.knowledge_domain].join(' ').toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu)||[]))(terms[term]||=[]).push(index);
  (terms['_type:'+record.type]||=[]).push(index);terms['_hash:'+hash53(JSON.stringify(['character',record.id||index,record,text]))]=[index];
 }
 const indexRoot=await encode(root,terms);return {...bank,records:anchors.map(index=>bank.records[index]),recordIds:[],recordIndices:anchors,seedRecords:anchors.map(index=>bank.records[index]),seedIndices:anchors,pagedRecords:{schemaVersion:2,root:refs,indexRoot,count:bank.records.length,bankId:'shared-character-'+digest(bank.records)},storageRefs:[refs,indexRoot]};
}
async function packStore(root,store){const next=structuredClone(store),seen=new Map();const apply=async bank=>{if(!Array.isArray(bank?.records))return bank;const key=digest(bank);if(!seen.has(key))seen.set(key,await pack(root,bank));return seen.get(key);};for(const entry of [...(next.characters||[]),...(next.npcs||[]),...[next.persona].filter(Boolean)])entry.recordBank=await apply(entry.recordBank);for(const group of next.recordGroups||[])for(const version of group.versions||[])version.bank=await apply(version.bank);return next;}
module.exports={pack,packStore};
