const {digest}=require('./canonical.cjs');
const tx=require('./transactions.cjs');
const {reader}=require('./chunks.cjs');
const {failure}=require('./limits.cjs');
const CATALOG='world:catalog';
async function catalog(root){const meta=await tx.entry(root,CATALOG);if(!meta)return {schemaVersion:2,entries:[]};const value=await reader(root).value(meta.root);return {...value,entries:value.items?Object.values(value.items):value.entries};}
async function project(root,settings){
 const previous=await catalog(root),entries=new Map(previous.entries.map(row=>[row.id,row]));
 for(const world of settings.worlds||[]){
  if(!world||typeof world.id!=='string'||!world.id){await tx.writeDocument(root,'world:legacy-invalid:'+digest(world),world,{immutable:true});continue;}
  const contentHash=digest(world),key='world:version:'+digest([world.id,contentHash]),prior=entries.get(world.id);
  await tx.writeDocument(root,key,world,{immutable:true});
  entries.set(world.id,{id:world.id,name:world.name||world.id,hint:world.hint||'',franchise:Boolean(world.franchise),advanced:Boolean(world.advanced),activeVersion:key,contentHash,versions:[...new Set([...(prior?.versions||[]),key])],tombstone:false});
 }
 const present=new Set((settings.worlds||[]).map(world=>world.id));for(const row of entries.values())if(!present.has(row.id))row.tombstone=true;
 await tx.writeDocument(root,CATALOG,{schemaVersion:2,items:Object.fromEntries(entries)});
 const next={...settings,worldCatalog:true};delete next.worlds;return next;
}
module.exports={catalog,project,CATALOG};
