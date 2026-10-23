export function openMacroPreview({document,preview}) {
    document.getElementById('sr-macro-preview')?.close();
    const dialog=document.createElement('dialog');
    dialog.id='sr-macro-preview';dialog.className='sr-story-dialog sr-macro-preview';
    const title=document.createElement('h3');title.textContent='마지막 인물 매크로 전송';
    const status=document.createElement('p');status.setAttribute('aria-live','polite');
    const content=document.createElement('pre');
    const note=document.createElement('p');note.className='sr-help';
    note.textContent='마지막 전송 요청에서 확인한 내용입니다. 프롬프트를 수정했다면 새로 전송해 확인하세요. 새 판독·재생성·취소·방 이동 시 비워지며, 모델의 답변 반영 여부와는 별개입니다.';
    const close=document.createElement('button');close.type='button';close.className='menu_button';close.textContent='닫기';
    close.addEventListener('click',()=>dialog.close());
    const refresh=()=>{
        const value=preview.read();
        const labels={included:'매크로 반영 확인',fallback:'매크로 미사용 · 기존 위치로 전달',unconfirmed:'매크로 반영을 확인하지 못했습니다.',failed:'전송 실패 · 새로 전송한 뒤 확인하세요.'};
        status.textContent=value ? labels[value.status]+(value.status==='included'?` · ${new Date(value.at).toLocaleTimeString()} · 요청 ${value.messageIndex}번째 메시지 (${value.role})`:'') : '아직 전송 전 · 새로 판독한 뒤 답변을 생성하세요.';
        content.textContent=value?.text||'';content.hidden=!content.textContent;note.hidden=value?.status!=='included';
    };
    const unsubscribe=preview.subscribe(refresh);
    dialog.addEventListener('close',()=>{unsubscribe();dialog.remove();});
    try{dialog.append(title,status,content,note,close);document.body.append(dialog);refresh();dialog.showModal();}
    catch(error){unsubscribe();dialog.remove();throw error;}
}
