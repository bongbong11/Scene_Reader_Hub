const {hash}=require('./paths.cjs');
const {failure}=require('./limits.cjs');
const backups=require('./backups.cjs'),chunks=require('./chunks.cjs'),tx=require('./transactions.cjs');
const PREFIX='scene-reader:shared:v1|';
const owner=key=>hash(key.split('|chat:')[0]);
const sessionKey=ref=>'legacy:sessions/'+ref+'.json';
async function restoreWorld(root,saved,chat,values,currentState){
    const selected=chat.preferences?.selectedWorldId;if(!selected)return;
    const priorCatalog=await saved.value('world:catalog');
    const row=priorCatalog?.items?.[selected]||priorCatalog?.entries?.find(row=>row.id===selected);
    let world=row&&!row.tombstone?await saved.value(row.activeVersion):(await saved.value('legacy:settings.json'))?.worlds?.find(item=>item.id===selected);
    if(!world){if(row&&!row.tombstone)throw failure('STORAGE_PART_MISSING','백업의 세계관 자료가 빠져 있습니다.');return;}
    const meta=await tx.entry(root,'world:catalog',currentState),catalog=meta?await chunks.reader(root).value(meta.root):{schemaVersion:2,items:{}};
    const items={...(catalog.items||Object.fromEntries((catalog.entries||[]).map(item=>[item.id,item])))},existing=items[selected];
    if(existing&&!existing.tombstone){
        const stored=await tx.entry(root,existing.activeVersion,currentState);
        const current=stored&&await chunks.reader(root).value(stored.root);
        if(JSON.stringify(current)===JSON.stringify(world))return;
        const next='custom-restored-'+hash(JSON.stringify(world)).slice(0,24);
        world={...world,id:next,name:world.name+' (복구)'};chat.preferences.selectedWorldId=next;
    }
    const key='world:version:'+hash(JSON.stringify(world));
    values[key]=world;
    items[world.id]={id:world.id,name:world.name,hint:world.hint||'',franchise:Boolean(world.franchise),advanced:Boolean(world.advanced),activeVersion:key,versions:[key],tombstone:false};
    values['world:catalog']={schemaVersion:2,items};
    const settingsMeta=await tx.entry(root,'legacy:settings.json',currentState);
    const settings=settingsMeta?await chunks.reader(root).value(settingsMeta.root):{};
    // Projection of existing legacy worlds must precede enabling this catalog.
    if(!settings.worldCatalog&&settings.worlds?.length)throw failure('STORAGE_NOT_READY','공용 세계관 자료 이사를 먼저 완료해 주세요.');
    values['legacy:settings.json']={...settings,worldCatalog:true};delete values['legacy:settings.json'].worlds;
}
function validTarget(key){if(typeof key!=='string'||key.length>512||!/^(?:character-avatar:|character:|group:).+\|chat:.+$/.test(key)||key.endsWith('|chat:unsaved'))throw failure('STORAGE_INVALID_ID','복구할 채팅방을 먼저 열어 주세요.');}
async function load(root,id){
    const backup=await backups.get(root,id),nodes=chunks.reader(root),snapshot=await nodes.value(backup.root);
    const value=async key=>snapshot.documents[key]?nodes.value(snapshot.documents[key].root):null;
    return {backup,nodes,documents:snapshot.documents,value};
}
async function sharedValue(saved,key){
    const direct=await saved.value(key);
    if(direct)return direct.hubDocument?.data;
    // Earlier shared records were stored as reserved chat documents.
    const ref=hash(key),session=await saved.value(sessionKey(ref));
    return (session?.chat||await saved.value('legacy:chats/'+ref+'.json'))?.hubDocument?.data;
}
async function sharedRoom(saved,link){
    const story=await sharedValue(saved,PREFIX+'storyline|'+link.storylineId);
    const active=story?.activeChatRef===link.chatRef&&story?.epoch===link.epoch;
    const baseline=await sharedValue(saved,PREFIX+'baseline|'+link.baselineId+':'+(active?story.baselineRevision:link.baselineRevision));
    const asset=baseline&&await sharedValue(saved,PREFIX+'asset|'+baseline.assetId);
    const checkpoint=story?.checkpoints?.[active?story.headCheckpointId:link.checkpointId];
    if(!baseline||!asset||!checkpoint)throw failure('STORAGE_PART_MISSING','이야기의 인물 자료나 진행 기준점이 없습니다.');
    return {baseline,asset,checkpoint};
}
function characterSummary(store){
    const entries=[...(store?.characters||[]),...(store?.npcs||[]),...[store?.persona].filter(Boolean)];
    const versions=(store?.recordGroups||[]).flatMap(group=>group.versions||[]).filter(version=>version.bank);
    const named=[...entries.map(entry=>entry.name),...(store?.recordGroups||[]).map(group=>group.name)];
    const characterNames=[...new Set(named.filter(name=>typeof name==='string'&&name.trim()).map(name=>name.trim()))];
    const fileCount=versions.length+entries.filter(entry=>entry.recordBank&&!versions.some(version=>
        version.id===entry.appliedRecordVersion||Boolean(entry.recordBank.analysisId&&version.bank.analysisId===entry.recordBank.analysisId))).length;
    return {characterNames,characterCount:entries.length,fileCount};
}
async function inventory(root,{id,targetChatKey},loaded){
    validTarget(targetChatKey);
    const saved=loaded||await load(root,id),names=new Map(),rows=[];
    const addCatalog=catalog=>{for(const room of catalog?.rooms||[])if(room.chatRef)names.set(room.chatRef,{title:room.title,chatKey:room.chatKey,ownerRef:catalog.ownerRef});};
    for(const key of Object.keys(saved.documents).filter(key=>key.startsWith(PREFIX+'catalog|'))){
        addCatalog(await sharedValue(saved,key));
    }
    const refs=new Set(Object.keys(saved.documents).flatMap(key=>/^legacy:(?:sessions|chats|characters)\/([a-f0-9]{64})\.json$/.exec(key)?.[1]||[])),sessions=new Map();
    for(const ref of refs){
        const session=await saved.value(sessionKey(ref))||{chat:await saved.value('legacy:chats/'+ref+'.json')};
        // Reserved shared documents are not user rooms.
        if(session.chat?.hubDocument){if(session.chat.hubDocument.kind==='catalog')addCatalog(session.chat.hubDocument.data);continue;}
        sessions.set(ref,session);
    }
    const source=saved.backup.source||{};
    let preferredRef=source.chatKey?hash(source.chatKey):null;
    if(source.chatKey)names.set(hash(source.chatKey),{title:source.chatName,chatKey:source.chatKey,ownerRef:owner(source.chatKey)});
    // Old backups have names only. Match the full owner + room key, never names alone.
    if(source.chatName){const candidate=targetChatKey.split('|chat:')[0]+'|chat:'+source.chatName;if(sessions.has(hash(candidate))){names.set(hash(candidate),{title:source.chatName,chatKey:candidate,ownerRef:owner(candidate)});preferredRef ||=hash(candidate);}}
    for(const [ref,session] of sessions){
        const named=names.get(ref),identity=session.chat?.sharedLinkV1?.ownerRef||named?.ownerRef;
        let summary,unavailable=false;
        try{const store=session.chat?.sharedLinkV1?(await sharedRoom(saved,session.chat.sharedLinkV1)).asset.characters:await saved.value('legacy:characters/'+ref+'.json');summary=characterSummary(store);}
        catch(error){if(error.code!=='STORAGE_PART_MISSING')throw error;unavailable=true;}
        rows.push({ref,title:named?.title||'방 이름 없음 · '+ref.slice(0,8),sameOwner:identity===owner(targetChatKey),ownerKnown:Boolean(identity),...summary,unavailable});
    }
    if(!rows.some(row=>row.ref===preferredRef))preferredRef=null;
    return {rooms:rows.sort((a,b)=>Number(b.ref===preferredRef)-Number(a.ref===preferredRef)||Number(b.sameOwner)-Number(a.sameOwner)),preferredRef,backup:saved.backup};
}
async function restore(root,{id,sourceRef,targetChatKey,confirmOwner=false,operationId,source}){
    validTarget(targetChatKey);
    if(!/^[a-f0-9]{64}$/.test(sourceRef)||!/^[a-f0-9]{64}$/.test(operationId))throw failure('STORAGE_INVALID_ID','선택한 복구 자료를 확인하지 못했습니다.');
    const requestHash=hash(JSON.stringify([id,sourceRef,targetChatKey,operationId]));
    const prior=await tx.status(root,requestHash);
    if(prior?.status==='committed')return {restored:true,reused:true,backups:await backups.list(root)};
    const saved=await load(root,id),choices=await inventory(root,{id,targetChatKey},saved),row=choices.rooms.find(row=>row.ref===sourceRef);
    if(!row)throw failure('STORAGE_BACKUP_MISSING','백업에서 선택한 방을 찾지 못했습니다.');
    if(!row.sameOwner&&!confirmOwner)throw failure('RESTORE_OWNER_CONFIRMATION','캐릭터 식별자가 달라요. 선택한 자료를 이 캐릭터로 가져올지 확인해 주세요.',409);
    const session=await saved.value(sessionKey(sourceRef))||{chat:await saved.value('legacy:chats/'+sourceRef+'.json'),history:[]};
    let chat=structuredClone(session.chat||{}),characters=await saved.value('legacy:characters/'+sourceRef+'.json');
    const link=chat.sharedLinkV1;
    if(link){
        const {baseline,asset,checkpoint}=await sharedRoom(saved,link);
        const state=structuredClone(checkpoint.state||{});
        chat={...state,...chat.overlay,...chat.runtime,preferences:{...baseline.defaultPreferences,...chat.runtime?.preferences},
            companionStores:{...state.companionStores,...chat.overlay?.companionStores,...chat.runtime?.companionStores},
            legacyCarryReferenceV1:{scene:state.continuationContext||{},characterStates:state.inheritedCharacterStates||[],summary:link.summary||'',sourceCheckpoint:checkpoint.id}};
        delete chat.inheritedCharacterStates;delete chat.continuationContext;delete chat.continuationPreferences;
        characters=structuredClone(asset.characters);
    }
    // Recovered facts remain; old generation payloads and room-local turn indices do not.
    for(const key of ['sharedLinkV1','sharedSource','sharedReference','sharedWorld','originalRef','runtime','overlay'])delete chat[key];
    Object.assign(chat,{lastJudgment:null,pendingPlan:null,nonRpOutputIndices:[],characterStateEvents:[],characterStateCapture:null});
    if(chat.sceneIntimacy)for(const key of ['contextEndIndex','contextKey','inputKey'])delete chat.sceneIntimacy[key];
    if(chat.opportunities)chat.opportunities.current=null;
    for(const card of chat.companionStores?.knowledgeVaultV1?.cards||[])for(const acquisition of card.acquisitions||[])if(acquisition.sourceIdentity&&!acquisition.sourceIdentity.originChatRef)acquisition.sourceIdentity.originChatRef=sourceRef;
    await require('./migration.cjs').migrate(root,{source});
    const currentState=await tx.snapshot(root);
    const target=hash(targetChatKey),values={[sessionKey(target)]:{chat,history:[]},['legacy:characters/'+target+'.json']:characters||{enabled:false,characters:[],npcs:[],persona:null}};
    const emotion={characterStateEvents:[],characterStateCapture:null};
    values[PREFIX+'emotion|'+target]={hubDocument:{schemaVersion:1,kind:'emotion',id:target,revision:1,operationId:'',contentHash:require('./canonical.cjs').digest(emotion),data:emotion}};
    await restoreWorld(root,saved,chat,values,currentState);
    const writes=[];
    for(const [key,value]of Object.entries(values))writes.push({key,value,expectedRevision:(await tx.entry(root,key,currentState))?.revision||0});
    const protection=await backups.capture(root,'before_restore',source);
    try{
        await tx.begin(root,{operationId:requestHash,writes:writes.map(({key,expectedRevision})=>({key,expectedRevision}))});
        const roots={};for(const {key,value}of writes)roots[key]=await chunks.encode(root,value);
        await tx.commit(root,requestHash,roots);
    }catch(error){
        // Preserve uncertain commits for recovery; cancel only a known draft.
        if((await tx.status(root,requestHash))?.status==='preparing')await tx.cancel(root,requestHash);
        throw error;
    }
    return {restored:true,backupId:protection.id,backups:await backups.list(root)};
}
module.exports={inventory,restore};
