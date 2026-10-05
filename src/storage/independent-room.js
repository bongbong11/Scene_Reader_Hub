import {clone,chatRef,fail} from './shared-document.js';

// Rooms without a shared storyline still use the same version-checked storage.
export function createIndependentRoomStorage({paged,serial,current}) {
    return async function save(view,chatKey,route,body,options) {
        return serial('room:'+chatRef(chatKey),async()=>{
            if(current(chatKey)!==view)throw fail('STORAGE_STALE_CHAT','자료가 바뀌었습니다. 다시 불러온 뒤 저장하세요.');
            const characters=route==='characters',key=characters?'legacy:characters/'+chatRef(chatKey)+'.json':'legacy:sessions/'+chatRef(chatKey)+'.json';
            const session={chat:clone(view.legacy.chat),history:clone(view.legacy.history||[])};
            if(route==='transaction'){session.chat=body.chat;session.history=body.history;}
            if(route==='chat')session.chat=body.value;
            if(route==='history')session.history=body.value;
            const result=await paged.writeMany([{key,value:characters?body.value:session,expectedRevision:characters?view.charactersRevision:view.sessionRevision}],options);
            if(characters){view.charactersRevision=result.results[key].revision;view.legacy.characters=clone(body.value);}
            else{view.sessionRevision=result.results[key].revision;Object.assign(view.legacy,clone(session));}
            return {ok:true};
        });
    };
}
