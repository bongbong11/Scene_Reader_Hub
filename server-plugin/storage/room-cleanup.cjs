const {hash,read,writer}=require('./paths.cjs');
const {digest}=require('./canonical.cjs');
const {failure}=require('./limits.cjs');
const tx=require('./transactions.cjs'),chunks=require('./chunks.cjs'),backups=require('./backups.cjs');
const PREFIX='scene-reader:shared:v1|',LABEL='metadata:room-label:';
function identity(chatKey){if(typeof chatKey!=='string'||chatKey.length>512||!chatKey.includes('|chat:')||chatKey.endsWith('|chat:unsaved'))throw failure('STORAGE_INVALID_ID','저장된 채팅방을 선택해 주세요.');return {ref:hash(chatKey),ownerRef:hash(chatKey.split('|chat:')[0]),title:chatKey.slice(chatKey.indexOf('|chat:')+6),chatKey};}
async function remember(root,chatKey){
    if(!chatKey?.includes('|chat:')||chatKey.endsWith('|chat:unsaved'))return;
    const item=identity(chatKey),key=LABEL+item.ref;
    if(!await tx.entry(root,key)&&(await tx.entry(root,'legacy:sessions/'+item.ref+'.json')||await tx.entry(root,'legacy:characters/'+item.ref+'.json')))try{await tx.writeDocument(root,key,item,{expectedRevision:0});}catch(error){if(error.code!=='STORAGE_CONFLICT')throw error;}
}
async function rememberCommitted(root,chatKey,operation){
    if(typeof chatKey!=='string'||!chatKey.includes('|chat:'))return;
    const ref=hash(chatKey);
    if(['sessions','characters'].some(folder=>operation?.results?.['legacy:'+folder+'/'+ref+'.json']))await remember(root,chatKey);
}
async function inventory(root,{chatKey,deletedName}={}){
    const documents=await backups.allDocuments(root),nodes=chunks.reader(root),rows=new Map();
    for(const [key,meta]of Object.entries(documents)){
        if(key.startsWith(LABEL)){const row=await nodes.value(meta.root);if(row?.chatKey)rows.set(row.ref,row);}
        if(key.startsWith(PREFIX+'catalog|')){
            const catalog=(await nodes.value(meta.root))?.hubDocument?.data;
            for(const room of catalog?.rooms||[])if(room.chatKey)rows.set(room.chatRef,{...identity(room.chatKey),title:room.title||identity(room.chatKey).title});
        }
    }
    const current=chatKey?identity(chatKey):null;if(current)rows.set(current.ref,current);
    const result=[];
    for(const row of rows.values()){
        if(!['sessions','characters','chats','history'].some(folder=>documents['legacy:'+folder+'/'+row.ref+'.json']))continue;
        if(deletedName!==undefined){if(identity(row.chatKey).title!==deletedName)continue;}
        else if(current&&row.ownerRef!==current.ownerRef)continue;
        result.push(row);
    }
    return {rooms:result};
}
async function inspect(root,request){
    const room=identity(request.chatKey),pointer=await read(tx.headFile(root)),documents=await backups.allDocuments(root),nodes=chunks.reader(root);
    const keys=['sessions','characters','chats','history'].map(folder=>'legacy:'+folder+'/'+room.ref+'.json').filter(key=>documents[key]);
    if(!keys.length)throw failure('STORAGE_NOT_FOUND','이 방에 저장된 확장 자료가 없어요.',404);
    const session=documents['legacy:sessions/'+room.ref+'.json'];
    const stored=session?await nodes.value(session.root):null,storylineId=stored?.chat?.sharedLinkV1?.storylineId;
    return {room,keys,storylineId,pointer,documents,token:digest([room.ref,pointer?.hash])};
}
async function preview(root,request){const info=await inspect(root,request);return {room:info.room,token:info.token};}
async function remove(root,request){
    if(request.confirm!==true)throw failure('STORAGE_CONFIRM_REQUIRED','방 자료 삭제를 확인해 주세요.');
    return writer(root,async()=>{
        const info=await inspect(root,request);if(info.token!==request.token)throw failure('STORAGE_CONFLICT','저장 자료가 바뀌었어요. 삭제할 방을 다시 확인해 주세요.',409);
        // Verify an independent backup before publishing any deletion.
        const backup=await backups.capture(root,'before_room_delete',request.source);
        await require('./backup-archive.cjs').verifyStored(root,backup);
        const next={...info.documents},nodes=chunks.reader(root);
        for(const key of info.keys)delete next[key];delete next[LABEL+info.room.ref];delete next['metadata:legacy-mode:'+info.room.ref];
        let shared=false;
        if(info.storylineId)for(const [key,meta]of Object.entries(next)){
            if(!key.startsWith('legacy:sessions/'))continue;
            if((await nodes.value(meta.root))?.chat?.sharedLinkV1?.storylineId===info.storylineId){shared=true;break;}
        }
        // Another character/catalog can also keep a story available for use.
        for(const [key,meta]of Object.entries(next))if(key.startsWith(PREFIX+'catalog|')&&key!==PREFIX+'catalog|'+info.room.ownerRef){
            if((await nodes.value(meta.root))?.hubDocument?.data?.stories?.some(row=>row.id===info.storylineId))shared=true;
        }
        const catalogKey=PREFIX+'catalog|'+info.room.ownerRef;
        if(next[catalogKey]){
            const stored=await nodes.value(next[catalogKey].root),data=stored.hubDocument.data;
            data.rooms=(data.rooms||[]).filter(row=>row.chatRef!==info.room.ref);
            if(info.storylineId&&!shared)data.stories=(data.stories||[]).filter(row=>row.id!==info.storylineId);
            data.deferred=(data.deferred||[]).filter(ref=>ref!==info.room.ref);
            stored.hubDocument.contentHash=digest(data);
            next[catalogKey]={...next[catalogKey],root:await chunks.encode(root,stored),revision:next[catalogKey].revision+1};
        }
        // Staging journals for this explicitly deleted room must not resurrect it.
        for(const key of Object.keys(next))if(key.startsWith(PREFIX+'migration|'+info.room.ref+':'))delete next[key];
        if(info.storylineId&&!shared){
            delete next[PREFIX+'storyline|'+info.storylineId];
            for(const key of Object.keys(next))if(key.startsWith(PREFIX+'story_history|'+info.storylineId+':'))delete next[key];
        }
        await require('./reclaim.cjs').replaceIndex(root,next,info.pointer.hash,{locked:true});
        return {roomDeleted:true,backupId:backup.id,sharedStoryPreserved:shared};
    });
}
module.exports={remember,rememberCommitted,inventory,preview,remove};
