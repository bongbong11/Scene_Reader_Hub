import {clone,digest} from './shared-document.js';
// Compatibility conversion is explicit. Ordinary continuation never copies assets.
export function legacyPayload(record,characters,history=[]) {
    const chat=clone(record || {});
    if(chat.sharedReference)chat.legacyCarryReferenceV1=clone(chat.sharedReference);
    const world=clone(chat.sharedWorld);
    delete chat.sharedSource;delete chat.sharedReference;delete chat.sharedWorld;
    return {chat,characters:clone(characters),history:clone(history),world};
}
export async function materializeLegacy(post,chatKey,value,signal) {
    const payload=clone(value);
    if(payload.world?.id) {
        const current=await post('bootstrap',{chatKey},{signal});
        const settings=current.settings || {},worlds=settings.worlds || [];
        const existing=worlds.find(world=>world.id===payload.world.id);
        // Preserve the original global entry when a pinned world differs. An
        // explicit rollback may create a compatible snapshot with a distinct ID.
        if(existing && digest(existing)!==digest(payload.world)) {
            const id='shared-restore-'+digest(payload.world).slice(0,20);
            payload.chat.preferences={...payload.chat.preferences,selectedWorldId:id};
            if(!worlds.some(world=>world.id===id))await post('settings',{settings:{...settings,worlds:[...worlds,{...payload.world,id}]}},{signal});
        } else if(!existing && String(payload.world.id).startsWith('custom')) {
            await post('settings',{settings:{...settings,worlds:[...worlds,payload.world]}},{signal});
        }
    }
    await post('characters',{chatKey,value:payload.characters},{signal});
    if(payload.chat)await post('transaction',{chatKey,chat:payload.chat,history:payload.history},{signal});
    else {await post('chat',{chatKey,value:null},{signal});await post('history',{chatKey,value:payload.history},{signal});}
    const saved=await post('bootstrap',{chatKey},{signal});
    return {saved,payload};
}
