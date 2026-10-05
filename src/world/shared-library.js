import {digest,fail} from '../storage/shared-document.js';
import {loadCustomWorlds,saveCustomWorlds,CUSTOM_WORLD_STORAGE} from './catalog.js';
const KEY='world:catalog';
let active;
// The public list contains descriptions; only the selected or edited world is loaded.
export function createWorldLibrary({paged,post,noteDiagnostic}){
 let catalogRevision=null,epoch=0;
 async function catalog({signal}={}){const value=await paged.read(KEY,{signal});return value?{...value,entries:value.items?Object.values(value.items):value.entries}:null;}
 function rows(value,loaded){const prior=new Map(loadCustomWorlds().map(world=>[world.id,world]));return value.entries.filter(row=>!row.tombstone).map(row=>{const cached=prior.get(row.id);if(loaded?.id===row.id)return {...loaded,worldRef:row.activeVersion};if(cached?.worldRef===row.activeVersion&&!cached.worldStub)return cached;return {id:row.id,name:row.name,hint:row.hint,franchise:row.franchise,prompt:'',worldRef:row.activeVersion,worldStub:true,advancedStub:row.advanced};});}
 async function hydrate(settings,selectedId,{signal}={}){
  if(!settings.worldCatalog)return settings;const started=epoch,value=await catalog({signal});if(!value)throw fail('WORLD_CATALOG_MISSING','공용 세계관 목록을 읽지 못했습니다.');
  const row=value.entries.find(row=>row.id===selectedId&&!row.tombstone),world=row?await paged.read(row.activeVersion,{signal}):null;if(row&&!world)throw fail('WORLD_SOURCE_MISSING','선택한 세계관 원본이 없습니다. 다른 세계관을 선택해 주세요.');
  if(started!==epoch)throw fail('STORAGE_STALE_CHAT','세계관 자료가 바뀌었습니다.');catalogRevision=paged.revision(KEY);return {...settings,worlds:rows(value,world)};
 }
 async function ensure(id,{signal,fresh=true}={}){
  if((await paged.capabilities())?.schemaVersion!==2)return null;
  const started=epoch;let row=await paged.select(KEY,['items',id],{signal});if(!row){const isCatalog=await paged.select(KEY,['schemaVersion'],{signal});if(!isCatalog)return null;}if(row?.tombstone)row=null;
  let world=null;if(row){const cached=loadCustomWorlds().find(world=>world.id===id&&world.worldRef===row.activeVersion&&!world.worldStub);world=cached||await paged.read(row.activeVersion,{signal});if(!world)throw fail('WORLD_SOURCE_MISSING','선택한 세계관 자료가 없습니다. 다른 세계관을 선택해 주세요.');}
  if(started!==epoch)throw fail('STORAGE_STALE_CHAT','세계관 자료가 바뀌었습니다.');const current=loadCustomWorlds().map(world=>world.worldRef&&world.id!==id?{id:world.id,name:world.name,hint:world.hint,franchise:world.franchise,prompt:'',worldRef:world.worldRef,worldStub:true,advancedStub:Boolean(world.advanced||world.advancedStub)}:world),next=row?current.some(item=>item.id===id)?current.map(item=>item.id===id?{...world,worldRef:row.activeVersion}:item):[...current,{...world,worldRef:row.activeVersion}]:current.filter(item=>item.id!==id);if(!saveCustomWorlds(next))throw fail('WORLD_CACHE_FAILED','세계관 목록을 화면에 반영하지 못했습니다.');
  if(!row&&(String(id||'').startsWith('custom-')||String(id||'').startsWith('advanced-'))){noteDiagnostic?.('world_storage',{module:'src/world/shared-library.js',status:'degraded',errorKind:'WORLD_REMOVED'});throw fail('WORLD_REMOVED','선택한 세계관이 삭제되었습니다. 일반 배경이나 다른 세계관을 선택해 주세요.');}return world;
 }
 async function save(settings,{signal}={}){
  const existing=await catalog({signal});if(!existing)return post('settings',{settings},{signal});
  if(catalogRevision!==null&&paged.revision(KEY)!==catalogRevision)throw fail('WORLD_REVISION_CONFLICT','다른 기기에서 세계관 목록이 바뀌었습니다. 다시 불러온 뒤 저장하세요.');
  const entries=new Map(existing.entries.map(row=>[row.id,row])),present=new Set(),worlds=settings.worlds||[];
  for(const world of worlds){present.add(world.id);const prior=entries.get(world.id);if(world.worldRef&&prior&&world.worldRef!==prior.activeVersion)throw fail('WORLD_REVISION_CONFLICT','다른 기기에서 세계관을 수정했습니다. 다시 불러와 주세요.');if(world.worldStub){if(!prior||prior.tombstone||world.worldRef!==prior.activeVersion)throw fail('WORLD_REVISION_CONFLICT','세계관 목록을 다시 불러와 주세요.');continue;}
   const raw={...world};for(const key of ['worldRef','worldStub','advancedStub'])delete raw[key];const contentHash=digest(raw),key='world:version:'+digest([world.id,contentHash]);
   if(!prior||prior.activeVersion!==key){await paged.read(key,{signal});await paged.write(key,raw,{signal,immutable:true});}
   entries.set(world.id,{id:world.id,name:world.name,hint:world.hint||'',franchise:Boolean(world.franchise),advanced:Boolean(world.advanced),activeVersion:key,contentHash,versions:[...new Set([...(prior?.versions||[]),key])],tombstone:false});
  }
  for(const row of entries.values())if(!present.has(row.id))row.tombstone=true;
  const next={...settings,worldCatalog:true};delete next.worlds;await paged.read('legacy:settings.json',{signal});
  await paged.writeMany([{key:KEY,value:{schemaVersion:2,items:Object.fromEntries(entries)},expectedRevision:catalogRevision??paged.revision(KEY)},{key:'legacy:settings.json',value:next,expectedRevision:paged.revision('legacy:settings.json')}],{signal});
  catalogRevision=paged.revision(KEY);const loaded=new Map(worlds.filter(world=>!world.worldStub).map(world=>[world.id,{...world,worldRef:entries.get(world.id).activeVersion}]));saveCustomWorlds(rows({entries:[...entries.values()]},null).map(world=>loaded.get(world.id)||world));noteDiagnostic?.('world_storage',{module:'src/world/shared-library.js',status:'succeeded',phase:'commit'});return {ok:true};
 }
 async function importLegacyBrowser({signal}={}){
  signal?.throwIfAborted();
  let text;try{text=globalThis.localStorage?.getItem(CUSTOM_WORLD_STORAGE);}catch{return {imported:0};}if(!text)return {imported:0};
  let source;try{source=JSON.parse(text);}catch{return {imported:0,unrecognized:true};}if(!Array.isArray(source))return {imported:0,unrecognized:true};
  const receipt='metadata:browser-world-import:'+digest(text);if(await paged.read(receipt))return {imported:0};
  const current=await catalog()||{schemaVersion:2,entries:[]};catalogRevision=paged.revision(KEY);
  await paged.write('world:browser-original:'+digest(text),{format:'legacy-browser',text},{immutable:true});await post('v2/backup/create');
  const settings=await paged.read('legacy:settings.json'),combined=rows(current,null);let imported=0;
  for(const world of source){if(!world?.id||!world.name||!world.prompt||world.worldStub)continue;const prior=current.entries.find(row=>row.id===world.id&&!row.tombstone);
   if(prior){const existing=await paged.read(prior.activeVersion);if(existing?.prompt===world.prompt&&digest(existing?.advanced||null)===digest(world.advanced||null))continue;}
   const copy={...world,...(prior?{id:'custom-imported-'+digest(world).slice(0,24),name:world.name+' (브라우저 자료)'}:{})};for(const key of ['worldRef','worldStub','advancedStub'])delete copy[key];if(!combined.some(item=>item.id===copy.id)){combined.push(copy);imported++;}
  }
  signal?.throwIfAborted();if(imported)await save({...settings,worlds:combined},{signal});signal?.throwIfAborted();await paged.write(receipt,{imported,originalPreserved:true},{signal});return {imported};
 }
 const library={hydrate,ensure,save,importLegacyBrowser,clear(){epoch++;catalogRevision=null;}};active=library;return library;
}
export async function ensureSharedWorld(id,options){return active?.ensure(id,options);}
export async function importLegacyBrowserWorlds(options){return active?.importLegacyBrowser(options);}
