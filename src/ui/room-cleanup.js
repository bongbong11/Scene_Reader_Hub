// A host deletion event carries a name, not a reliable current-room identity.
// Resolve saved identities first and always let the user confirm the target.
export function createRoomCleanupUi({document,service,notify,onChanged}){
    let dialog,busy=false;const pending=new Set();
    const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
    function close(){dialog?.close();}
    function button(text,task){const el=node('button',text);el.type='button';el.className='menu_button';el.onclick=()=>{if(!busy)void Promise.resolve().then(task).catch(error=>notify(error.message));};return el;}
    async function show(rooms,deleted=false){
        const account=service.scope?.(),current=()=>account===service.scope?.();
        if(!rooms.length){if(!deleted)notify('정리할 방 자료가 없어요.');return;}
        if(dialog?.open){if(deleted)rooms.forEach(row=>pending.add(row.chatKey));return;}
        if(!dialog){dialog=node('dialog');dialog.className='sr-story-dialog';document.body.append(dialog);dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('close',()=>{if(pending.size){const keys=[...pending];pending.clear();void Promise.all(keys.map(chatKey=>service.previewRoom(chatKey).then(info=>info.room).catch(()=>null))).then(rows=>show(rows.filter(Boolean),true));}});}
        dialog.replaceChildren(node('h3',deleted?'삭제한 채팅의 확장 자료':'방 자료 삭제'));
        const help=node('p',deleted?'채팅은 삭제됐지만 씬판독기 자료는 남아 있어요. 보관하거나, 백업한 뒤 삭제할 수 있어요.':'선택한 방의 씬판독기 자료를 백업한 뒤 삭제해요. 실리태번 대화와 다른 방에서 이어 쓰는 자료는 유지합니다.');help.className='sr-help sr-explanation';
        const select=node('select');select.className='text_pole';select.id='sr-room-cleanup-select';
        for(const room of rooms){const option=node('option',room.title+' · '+room.chatKey.split('|chat:')[0].replace(/^character-avatar:/,'').replace(/^character:/,'').replace(/^group:/,'그룹 '));option.value=room.chatKey;select.append(option);}
        const label=node('label','삭제할 방 ');label.append(select);
        const alert=node('p');alert.setAttribute('role','alert');
        const confirm=node('input');confirm.type='checkbox';const check=node('label');check.className='checkbox_label';check.append(confirm,node('span','선택한 방 자료를 삭제할게요.'));
        select.onchange=()=>{confirm.checked=false;};
        const remove=button('백업 후 삭제',async()=>{
            if(!confirm.checked){alert.textContent='삭제할 방을 확인하고 체크해 주세요.';return;}
            busy=true;select.disabled=true;remove.disabled=true;keep.disabled=true;
            try{if(!current())throw new Error('사용자가 바뀌었어요. 다시 열어 주세요.');const info=await service.previewRoom(select.value);if(!current())throw new Error('사용자가 바뀌었어요. 다시 열어 주세요.');await service.deleteRoom(info.room.chatKey,info.token);close();if(current()){notify('방 자료를 삭제했어요. 삭제 전 백업은 백업 목록에 남아 있어요.');await onChanged();}}
            catch(error){alert.textContent=error.message;}
            finally{busy=false;select.disabled=false;remove.disabled=false;keep.disabled=false;}
        });remove.id='sr-room-cleanup-delete';
        const keep=button(deleted?'자료 남기기':'취소',close);
        dialog.append(help,label,check,alert,remove,keep);dialog.showModal();
    }
    async function deleted(name){if(typeof name!=='string'||!name)return;const account=service.scope?.(),{rooms}=await service.deletedRooms(name);if(account===service.scope?.())await show(rooms,true);}
    return {open:async()=>{const account=service.scope?.(),{rooms}=await service.listRooms();if(account===service.scope?.())await show(rooms);},watch:(events,types)=>{
        if(types.CHAT_DELETED)events.on(types.CHAT_DELETED,name=>void deleted(name).catch(error=>notify(error.message)));
    }};
}
