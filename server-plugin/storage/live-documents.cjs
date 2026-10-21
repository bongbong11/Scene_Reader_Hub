const chunks=require('./chunks.cjs');
const {digest}=require('./canonical.cjs');
const {failure}=require('./limits.cjs');
const PREFIX='scene-reader:shared:v1|';
const key=(kind,id)=>PREFIX+kind+'|'+id;
// Logical reachability precedes chunk reachability. Unknown document kinds are
// retained; only well-understood superseded versions are collection candidates.
async function select(root,documents,{recentKeys=new Set(),signal,ownerRef}={}){
    const nodes=chunks.reader(root,{signal}),values=new Map(),keep=new Set(),queue=[],candidates=new Set();
    const value=async id=>{
        if(!values.has(id)){
            const stored=await nodes.value(documents[id].root),doc=stored?.hubDocument;
            if(id.startsWith(PREFIX)&&(!doc||doc.schemaVersion!==1||!doc.data||doc.contentHash!==digest(doc.data)))throw failure('STORAGE_CORRUPT','공유 자료 검증에 실패하여 정리하지 않았습니다.');
            values.set(id,stored);
        }return values.get(id);
    };
    const add=(id,required=false)=>{if(required&&!documents[id])throw failure('STORAGE_PART_MISSING','사용 중인 자료 연결을 확인하지 못해 정리하지 않았습니다.');if(documents[id]&&!keep.has(id)){keep.add(id);queue.push(id);}};
    for(const id of Object.keys(documents)){
        signal?.throwIfAborted();
        const kind=id.startsWith(PREFIX)?id.slice(PREFIX.length).split('|')[0]:'';
        if(id.startsWith('world:version:')||['asset','baseline','baseline_head','original','storyline','story_history','backup_receipt'].includes(kind))candidates.add(id);
        else if(kind==='migration'&&(await value(id))?.hubDocument?.data?.status==='active')candidates.add(id);
        else add(id);
    }
    for(const id of await require('./reclaim-scope.cjs').retainedOutsideScope(documents,ownerRef,value,{signal}))add(id);
    for(const id of recentKeys)add(id);
    async function visit(item){
        if(!item||typeof item!=='object')return;
        if(item.assetId)add(key('asset',item.assetId),true);
        if(item.originalRef)add(key('original',item.originalRef),true);
        if(item.baselineId){
            add(key('baseline_head',item.baselineId));
            const version=item.baselineRevision??(item.revisions?item.revision:undefined);
            if(Number.isInteger(version))add(key('baseline',item.baselineId+':'+version),true);
        }
        if(item.storylineId)add(key('storyline',item.storylineId),true);
        for(const [field,child]of Object.entries(item)){
            if(field==='versions'||field==='revisions')continue;
            if(typeof child==='string'&&child.startsWith('world:version:'))add(child);
            else if(child&&typeof child==='object')await visit(child);
        }
    }
    while(queue.length){
        signal?.throwIfAborted();const id=queue.shift(),stored=await value(id),doc=stored?.hubDocument;
        if(id==='world:catalog'){
            for(const row of Object.values(stored.items||Object.fromEntries((stored.entries||[]).map(row=>[row.id,row]))))if(!row.tombstone)add(row.activeVersion,true);
        }else{
            await visit(doc?.data||stored);
            if(doc?.kind==='catalog')for(const story of doc.data.stories||[])if(story.ready!==false)add(key('storyline',story.id),true);
            if(doc?.kind==='storyline')for(const checkpoint of Object.keys(doc.data.checkpoints||{}))add(key('story_history',doc.id+':'+checkpoint));
        }
        await new Promise(resolve=>setImmediate(resolve));
    }
    const next={...documents};
    for(const id of candidates)if(!keep.has(id))delete next[id];
    // Lists of selectable versions must not retain dangling references.
    for(const id of keep){
        signal?.throwIfAborted();const stored=await value(id),doc=stored?.hubDocument;
        let changed=false;
        if(doc?.kind==='baseline_head'&&Array.isArray(doc.data.revisions)){
            const revisions=doc.data.revisions.filter(revision=>next[key('baseline',doc.data.baselineId+':'+revision)]);
            if(revisions.length!==doc.data.revisions.length){doc.data.revisions=revisions;doc.contentHash=digest(doc.data);changed=true;}
        }
        if(id==='world:catalog'){
            for(const row of Object.values(stored.items||Object.fromEntries((stored.entries||[]).map(row=>[row.id,row])))){
                if(Array.isArray(row.versions)){const versions=row.versions.filter(version=>next[version]);if(versions.length!==row.versions.length){row.versions=versions;changed=true;}}
                if(row.tombstone&&row.activeVersion&&!next[row.activeVersion]){delete row.activeVersion;changed=true;}
            }
        }
        if(changed)next[id]={...next[id],root:await chunks.encode(root,stored),revision:next[id].revision+1,operationId:digest(['maintenance',id,stored])};
    }
    return {documents:next,changed:JSON.stringify(next)!==JSON.stringify(documents)};
}
module.exports={select};
