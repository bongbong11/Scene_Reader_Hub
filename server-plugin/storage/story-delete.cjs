const {hash,read}=require('./paths.cjs');
const {digest}=require('./canonical.cjs');
const chunks=require('./chunks.cjs'),tx=require('./transactions.cjs'),backups=require('./backups.cjs');
const {replaceIndex}=require('./reclaim.cjs');
const {failure}=require('./limits.cjs');
const PREFIX='scene-reader:shared:v1|';
async function inspect(root,{storylineId,chatKey}){
    if(typeof chatKey!=='string'||!chatKey.includes('|chat:')||!/^[a-zA-Z0-9:_-]{1,180}$/.test(storylineId))throw failure('STORAGE_INVALID_ID','삭제할 이야기를 확인하지 못했습니다.');
    const pointer=await read(tx.headFile(root)),nodes=chunks.reader(root);
    const documents=await backups.allDocuments(root,pointer?await nodes.value(pointer.hash):{buckets:{}});
    const catalogKey=PREFIX+'catalog|'+hash(chatKey.split('|chat:')[0]),meta=documents[catalogKey];
    const catalog=meta&&await nodes.value(meta.root),item=catalog?.hubDocument?.data?.stories?.find(item=>item.id===storylineId);
    if(!item)throw failure('STORAGE_NOT_FOUND','이 캐릭터의 이야기 목록에서 찾지 못했습니다.',404);
    const rooms=[],keys=[PREFIX+'storyline|'+storylineId];
    for(const [key,entry]of Object.entries(documents)){
        if(key.startsWith(PREFIX+'migration|')){
            const journal=(await nodes.value(entry.root))?.hubDocument?.data;
            if(journal?.storylineId===storylineId)keys.push(key);
        }
        if(!/^legacy:sessions\/[a-f0-9]{64}\.json$/.test(key))continue;
        const session=await nodes.value(entry.root);
        if(session.chat?.sharedLinkV1?.storylineId!==storylineId)continue;
        const ref=key.slice('legacy:sessions/'.length,-5);
        rooms.push({ref,title:catalog.hubDocument.data.rooms?.find(room=>room.chatRef===ref)?.title||'이름 없는 방'});
        keys.push(key,'legacy:characters/'+ref+'.json','legacy:chats/'+ref+'.json','legacy:history/'+ref+'.json');
    }
    return {title:item.title,rooms,token:digest([storylineId,pointer?.hash]),pointer,documents,catalog,catalogKey,keys};
}
async function preview(root,request){const {title,rooms,token}=await inspect(root,request);return {title,rooms,token};}
async function remove(root,request){
    if(request.confirm!==true)throw failure('STORAGE_CONFIRM_REQUIRED','이야기 자료 삭제를 확인해 주세요.');
    const info=await inspect(root,request);
    if(info.token!==request.token)throw failure('STORAGE_CONFLICT','자료가 바뀌었어요. 삭제할 방 목록을 다시 확인해 주세요.',409);
    const backup=await backups.capture(root,'before_story_delete',request.source);
    const next={...info.documents};
    for(const key of info.keys)delete next[key];
    for(const key of Object.keys(next))if(key.startsWith(PREFIX+'story_history|'+request.storylineId+':'))delete next[key];
    const data=info.catalog.hubDocument.data;
    data.stories=data.stories.filter(row=>row.id!==request.storylineId);
    data.rooms=(data.rooms||[]).filter(row=>row.storylineId!==request.storylineId);
    info.catalog.hubDocument.contentHash=digest(data);
    next[info.catalogKey]={...next[info.catalogKey],root:await chunks.encode(root,info.catalog),revision:next[info.catalogKey].revision+1};
    await replaceIndex(root,next,info.pointer.hash);
    return {deleted:true,backupId:backup.id,backups:await backups.list(root)};
}
module.exports={preview,remove};
