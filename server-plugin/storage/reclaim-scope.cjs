const PREFIX='scene-reader:shared:v1|';
// Keep logical versions belonging to other characters, even if those versions
// are not selected there. Physical orphan chunks are checked account-wide later.
async function retainedOutsideScope(documents,ownerRef,value,{signal}={}){
    if(ownerRef===undefined)return new Set(); // low-level account maintenance/tests
    const retained=new Set(),foreignBases=new Set(),foreignStories=new Set(),foreignRooms=new Set();
    if(ownerRef===null)return new Set(Object.keys(documents));
    const rows=Object.keys(documents).filter(key=>key.startsWith(PREFIX));
    const data=async key=>(await value(key))?.hubDocument?.data;
    for(const key of rows){
        signal?.throwIfAborted();
        if(key.startsWith(PREFIX+'catalog|')){
            const catalog=await data(key);
            if(catalog?.ownerRef===ownerRef)continue;
            for(const story of catalog?.stories||[]){foreignStories.add(story.id);if(story.baselineId)foreignBases.add(story.baselineId);}
            for(const room of catalog?.rooms||[])foreignRooms.add(room.chatRef);
        }
        if(key.startsWith(PREFIX+'baseline|')){
            const baseline=await data(key);
            if(baseline?.ownerRef&&baseline.ownerRef!==ownerRef)foreignBases.add(baseline.id);
        }
    }
    for(const key of rows)if(key.startsWith(PREFIX+'storyline|')){
        const story=await data(key);if(foreignBases.has(story?.baselineId))foreignStories.add(story.id);
    }
    for(const key of Object.keys(documents)){
        signal?.throwIfAborted();
        // Common world documents are managed separately from character cleanup.
        if(key.startsWith('world:')){retained.add(key);continue;}
        if(!key.startsWith(PREFIX))continue;
        const [kind,id]=key.slice(PREFIX.length).split('|');
        if(kind==='baseline'&&foreignBases.has(id.slice(0,id.lastIndexOf(':'))))retained.add(key);
        if(kind==='baseline_head'&&foreignBases.has(id))retained.add(key);
        if(kind==='storyline'&&foreignStories.has(id))retained.add(key);
        if(kind==='story_history'&&foreignStories.has(id.split(':')[0]))retained.add(key);
        if(['original','migration'].includes(kind)&&foreignRooms.has(id.split(':')[0]))retained.add(key);
    }
    return retained;
}
module.exports={retainedOutsideScope};
