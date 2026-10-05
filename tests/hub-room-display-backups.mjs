import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {backupSource,backupLabel,backupFilename,backupsForRoom} from '../src/storage/backup-label.js';
import {createResults} from '../src/ui/results.js';
const require=createRequire(import.meta.url);
const labels=require('../server-plugin/storage/backup-label.cjs');
const source=backupSource({name2:'Fallback',characterId:0,characters:[{name:'테스트 인물'}],chatId:'새 이야기 / 2'});
assert.equal(source.characterName,'테스트 인물');
assert.equal(backupSource({groupId:'g',groups:[{id:'g',name:'시험 그룹'}],chatId:'room'}).characterName,'시험 그룹');
const sample={id:'2026-01-01T00-00-00-000-123Z',source};
assert.equal(backupFilename(sample),labels.filename(sample));
assert.ok(!backupFilename(sample).includes('/'));
assert.equal(backupLabel({}),'이름 정보 없는 백업');
assert.equal(labels.source({characterName:'a\r\nb',chatName:'x'.repeat(200)}).characterName,'ab');
assert.equal(labels.source({chatName:'x'.repeat(200)}).chatName.length,100);
const listed=[sample,{id:'unnamed'},{id:'other-room',source:{...source,chatName:'Other room'}},{id:'other-character',source:{...source,characterName:'Other'}}];
const context={name2:source.characterName,chatId:source.chatName};
assert.deepEqual(backupsForRoom(listed,context),[sample]);
assert.deepEqual(backupsForRoom(listed,{chatId:null}),listed);
assert.deepEqual(backupsForRoom(listed,{...context,chatId:'empty'}),[]);
assert.deepEqual(backupsForRoom(listed,{chatId:source.chatName}),[]);

// A loading/failed room must never render even a cached room's result or payload.
let ready=false;
const nodes=new Map(['sr-stored-state','sr-prompt-preview','sr-backup-list','sr-character-preview','sr-character-analysis-result'].map(id=>[id,{innerHTML:'OLD_ROOM',textContent:'OLD_ROOM',hidden:false,srPageToken:{}}]));
const record={relationshipState:{},backgroundEvents:[{title:'CURRENT_ROOM_EVENT'}]};
const views=createResults({document:{getElementById:id=>nodes.get(id)||null},getContext:()=>({chat:[]}),record:()=>record,isRoomReady:()=>ready,
 readState:()=>({settings:{},characterStore:{enabled:false,characters:[],npcs:[]},backupList:[{...sample,createdAt:'2026-01-01T00:00:00Z'}],activeInjectionPayload:'CURRENT_ROOM_PROMPT'}),escapeHtml:String,ownerPrompt:()=>'',selectCharacter:()=>{}});
views.renderAll();
assert.equal(nodes.get('sr-character-preview').hidden,true);assert.equal(nodes.get('sr-character-analysis-result').srPageToken,null);
assert.ok(!nodes.get('sr-stored-state').innerHTML.includes('CURRENT_ROOM_EVENT'));
assert.equal(nodes.get('sr-prompt-preview').textContent,'현재 주입문 없음');
assert.ok(nodes.get('sr-backup-list').innerHTML.includes('테스트 인물 · 새 이야기 / 2'),'account backups remain visible and identify creator');
assert.ok(nodes.get('sr-backup-list').innerHTML.includes('전체 백업'));
ready=true;views.renderAll();
assert.ok(nodes.get('sr-stored-state').innerHTML.includes('CURRENT_ROOM_EVENT'));
assert.equal(nodes.get('sr-prompt-preview').textContent,'CURRENT_ROOM_PROMPT');
ready=false;views.renderAll();assert.equal(nodes.get('sr-prompt-preview').textContent,'현재 주입문 없음');

const root=await mkdtemp(path.join(tmpdir(),'scene-backup-label-')),routes={};
const plugin=require('../server-plugin/index.cjs'),tx=require('../server-plugin/storage/transactions.cjs'),backups=require('../server-plugin/storage/backups.cjs');
await plugin.init({get:(key,fn)=>routes[key]=fn,post:(key,fn)=>routes[key]=fn});
async function call(route,body={}){const res={status(value){this.code=value;return this;},json(value){this.data=value;return this;}};await routes['/storage/'+route]({user:{directories:{root}},body},res);assert.ok(!res.code||res.code===200,JSON.stringify(res.data));return res.data;}
try {
 await call('transaction',{chatKey:'room-a',chat:{marker:'A'},history:[]});
 await call('transaction',{chatKey:'room-b',chat:{marker:'B'},history:[]});
 const legacy=await call('backup/create',{source});assert.deepEqual(legacy.backup.source,source);
 assert.deepEqual((await call('bootstrap',{chatKey:'room-new'})).backups.find(x=>x.id===legacy.backup.id).source,source);
 assert.equal((await call('bootstrap',{chatKey:'room-new'})).chat,null,'global backup list does not load another room');
 assert.equal((await call('bootstrap',{chatKey:'room-a'})).chat.marker,'A');
 assert.equal((await call('bootstrap',{chatKey:'room-b'})).chat.marker,'B');
 const storageRoot=path.join(root,'scene-reader');await tx.writeDocument(storageRoot,'metadata:label-test',{value:true});
 const modern=await call('backup/create',{source,reason:'before_story_link'});assert.deepEqual(modern.backup.source,source);assert.equal(modern.backup.reason,'before_story_link');
 const stored=await backups.get(storageRoot,modern.backup.id);assert.deepEqual(stored.source,source);
 const frames=[];for await(const frame of backups.frames(storageRoot,stored))frames.push(frame);
 assert.deepEqual(JSON.parse(frames[0]).backup.source,source,'portable backup retains origin label');
 const headers={};await backups.stream(storageRoot,stored.id,{set(k,v){headers[k]=v;return this;},write:()=>true,end(){}});
 assert.ok(headers['Content-Disposition'].includes(encodeURIComponent(backupFilename(stored))));
 const converted=await backups.get(storageRoot,legacy.backup.id);assert.deepEqual(converted.source,source);
} finally {await rm(root,{recursive:true,force:true});}
console.log('Room display and backup labels passed: loading isolation, named legacy/modern backups, room separation, portable metadata and download filename.');
