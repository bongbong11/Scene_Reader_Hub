const path=require('node:path');
const {readJson,writeJsonAtomic}=require('../storage.cjs');
const {entry,writeDocument}=require('./transactions.cjs');
const {reader}=require('./chunks.cjs');
async function active(root) {const meta=await entry(root,'metadata:migration-v2');if(!meta)return false;const state=await reader(root).value(meta.root);return ['completed','cleaned'].includes(state.status);}
const key=(root,file)=>'legacy:'+path.relative(root,file).replaceAll('\\','/');
async function load(root,file,fallback) {
 if(await active(root)){const meta=await entry(root,key(root,file));return meta?((await reader(root).value(meta.root))??fallback):fallback;}
 return readJson(file,fallback);
}
async function save(root,file,value) {if(await active(root))return writeDocument(root,key(root,file),value);return writeJsonAtomic(file,value);}
// One bootstrap sees one committed snapshot and reuses its bounded chunk reader.
async function readContext(root) {
 const state=await require('./transactions.cjs').snapshot(root),nodes=reader(root),metadata=new Map();
 async function lookup(documentKey){if(!metadata.has(documentKey)){const ref=state.buckets[require('./paths.cjs').id(documentKey).slice(0,2)];metadata.set(documentKey,ref?await nodes.select(ref,[documentKey]):null);}return metadata.get(documentKey);}
 const migration=await lookup('metadata:migration-v2'),modern=migration&&['completed','cleaned'].includes((await nodes.value(migration.root)).status);
 return {active:Boolean(modern),entry:file=>lookup(key(root,file)),load:async(file,fallback)=>{if(!modern)return readJson(file,fallback);const meta=await lookup(key(root,file));return meta?((await nodes.value(meta.root))??fallback):fallback;}};
}
module.exports={active,load,save,key,readContext};
