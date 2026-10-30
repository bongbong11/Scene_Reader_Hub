export function openMacroPreview({document,preview}) {
    document.getElementById('sr-macro-preview')?.close();
    const dialog=document.createElement('dialog');
    dialog.id='sr-macro-preview';dialog.className='sr-story-dialog sr-macro-preview';
    const title=document.createElement('h3');title.textContent='마지막 인물 분석 전송';
    const status=document.createElement('p');status.setAttribute('aria-live','polite');
    const content=document.createElement('pre');
    const note=document.createElement('p');note.className='sr-help';
    note.textContent='마지막 전송 요청에서 확인한 내용입니다. 프롬프트를 수정했다면 새로 전송해 확인하세요. 새 판독·재생성·취소·방 이동 시 비워지며, 모델의 답변 반영 여부와는 별개입니다.';
    const close=document.createElement('button');close.type='button';close.className='menu_button';close.textContent='닫기';
    close.addEventListener('click',()=>dialog.close());
    const refresh=()=>{
        const value=preview.read();
        const labels={included:'매크로 반영 확인',fallback:'기본 판정·전개에 통합',disabled:'주입 항목 꺼짐',unconfirmed:'매크로 반영을 확인하지 못했습니다.',failed:'전송 실패 · 새로 전송한 뒤 확인하세요.'};
        const empty={preset_changed:'프리셋 변경으로 이전 전송 기록을 비웠습니다. 다음 답변을 전송하면 다시 확인합니다.',context_changed:'현재 채팅·프리셋과 다른 전송 기록입니다. 다음 답변을 전송하면 확인합니다.',reset:'새 판독·생성 중단·채팅 변경으로 전송 기록을 비웠습니다. 다음 답변을 전송하면 다시 확인합니다.'};
        status.textContent=value ? labels[value.status]+(['included','fallback'].includes(value.status)?` · ${new Date(value.at).toLocaleTimeString()} · 요청 ${value.messageIndex}번째 메시지 (${value.role})`:'') : empty[preview.emptyReason?.()]||'아직 전송 전 · 새로 판독한 뒤 답변을 생성하세요.';
        content.textContent=value?.text||'';content.hidden=!content.textContent;note.hidden=!['included','fallback'].includes(value?.status);
    };
    const unsubscribe=preview.subscribe(refresh);
    dialog.addEventListener('close',()=>{unsubscribe();dialog.remove();});
    try{dialog.append(title,status,content,note,close);document.body.append(dialog);refresh();dialog.showModal();}
    catch(error){unsubscribe();dialog.remove();throw error;}
}
