import {backupSource} from '../storage/backup-label.js';
import {digest} from '../storage/shared-document.js';

export async function openBackupRestore({document,post,getContext,invalidate},id){
    const source=backupSource(getContext()),targetChatKey=source.chatKey;
    const features=(await post('v2/capabilities',{}, {allowFailure:true}))?.features||[];
    const supportsRoom=features.includes('room-backup-restore');
    const data=targetChatKey&&supportsRoom?await post('v2/backup/rooms',{id,targetChatKey}):null;
    const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
    const dialog=node('dialog');dialog.className='sr-story-dialog';
    dialog.append(node('h3','백업 복원'));
    const explanation=node('p',targetChatKey?'백업의 어느 방 자료를 현재 방으로 가져올지 선택하세요. 다른 방은 바뀌지 않아요.':'채팅방을 먼저 열면 그 방만 복구할 수 있어요. 전체 복원은 모든 방의 자료를 되돌립니다.');
    explanation.className='sr-help sr-explanation';dialog.append(explanation);
    const error=node('p');error.setAttribute('role','alert');dialog.append(error);
    let busy=false;
    return new Promise(resolve=>{
        const finish=result=>{dialog.close();dialog.remove();resolve(result);};
        const button=(text,task)=>{
            const el=node('button',text);el.type='button';el.className='menu_button';
            el.addEventListener('click',async()=>{
                if(busy)return;busy=true;el.disabled=true;error.textContent='';
                try{
                    if(backupSource(getContext()).chatKey!==targetChatKey)throw new Error('채팅방이 바뀌었어요. 현재 방에서 다시 복원해 주세요.');
                    invalidate();
                    finish(await task());
                }catch(cause){error.textContent=cause.message;}
                finally{busy=false;el.disabled=false;}
            });return el;
        };
        if(data?.rooms?.length){
            const select=node('select');select.className='text_pole';select.setAttribute('aria-label','복구할 원본 방');
            const placeholder=node('option','가져올 방의 인물 자료를 선택하세요');placeholder.value='';placeholder.disabled=true;select.append(placeholder);
            for(const row of data.rooms){
                const people=row.characterNames?.length?' · '+row.characterNames.slice(0,2).join(', '):'';
                const count=Number.isInteger(row.fileCount)?' · 파일 '+row.fileCount+'개':'';
                const option=node('option',row.title+people+count+(row.sameOwner?' · 같은 캐릭터':''));option.value=row.ref;select.append(option);
            }
            select.value=data.rooms.some(row=>row.ref===data.preferredRef)?data.preferredRef:data.rooms.length===1?data.rooms[0].ref:'';
            const notice=node('p');notice.className='sr-help sr-explanation';
            const contents=node('p');contents.className='sr-help sr-explanation';contents.setAttribute('data-restore-contents','');
            const confirm=node('label'),check=node('input');confirm.className='checkbox_label';check.type='checkbox';
            confirm.append(check,document.createTextNode('선택한 자료를 현재 캐릭터로 가져옵니다.'));
            const update=()=>{
                check.checked=false;const row=data.rooms.find(row=>row.ref===select.value);confirm.hidden=!row||row.sameOwner;
                notice.textContent=!row?'백업 안의 자료를 선택하세요. 삭제한 채팅방을 다시 열 필요는 없어요.':row.sameOwner?'방 이름이나 ID가 달라도 복구할 수 있어요.':'캐릭터 식별자가 다르거나 확인되지 않아요. 가져올 자료가 맞는지 확인해 주세요.';
                contents.textContent=!row?'':row.unavailable?'이 방의 연결 자료가 백업에서 확인되지 않아요.':Number.isInteger(row.fileCount)?
                    (row.characterNames?.length?'인물: '+row.characterNames.join(', ')+' · ':'')+'보관 파일 '+row.fileCount+'개.'+(row.fileCount===0?' 이 자료를 복원해도 인물 파일은 가져오지 않습니다.':''):
                    '인물 목록을 미리 보려면 서버 플러그인을 업데이트해 주세요.';
            };
            select.addEventListener('change',update);update();
            let requestId=digest([id,targetChatKey,Date.now(),Math.random()]);
            dialog.append(select,notice,contents,confirm,button('이 방으로 복원',async()=>{
                if(!select.value)throw new Error('가져올 방의 자료를 먼저 선택해 주세요.');
                try{return await post('v2/backup/restore-room',{id,targetChatKey,sourceRef:select.value,confirmOwner:check.checked,operationId:requestId,source});}
                catch(cause){
                    // A confirmed conflict is retryable with a fresh snapshot.
                    // A lost response reuses its ID to avoid restoring twice.
                    if(['STORAGE_CONFLICT','STORAGE_CANCELLED'].includes(cause.code))requestId=digest([id,targetChatKey,Date.now(),Math.random()]);
                    throw cause;
                }
            }));
        }else if(targetChatKey)dialog.append(node('p',supportsRoom?'이 백업에서 복구할 방 자료를 찾지 못했어요.':'이 방만 복구하려면 서버 플러그인을 업데이트해 주세요.'));
        const all=node('details'),summary=node('summary','모든 방을 함께 복원');
        const warning=node('p','현재 방뿐 아니라 모든 방의 씬판독기 자료와 공통 설정을 이 백업 시점으로 되돌립니다. 복원 직전 상태는 별도로 백업해요.');
        warning.className='sr-help sr-explanation';
        all.append(summary,warning,button('모든 방 복원',()=>post('backup/restore',{id,source})));dialog.append(all);
        const close=node('button','닫기');close.type='button';close.className='menu_button';close.addEventListener('click',()=>{if(!busy)finish(null);});dialog.append(close);
        dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)finish(null);});
        document.body.append(dialog);dialog.showModal();
    });
}
