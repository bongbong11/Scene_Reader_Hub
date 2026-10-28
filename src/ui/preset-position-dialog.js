import {PRESET_ENTRIES} from '../injection/preset-entry-contract.js';
import {notifySceneReaderToast} from './toasts.js';

export function openPresetPositionDialog(deps,kind,{refresh=()=>{}}={}){
    const document=deps.document,value=deps.placement.read(),stamp=deps.presetEntries.stamp();
    if(!value.available)throw Error('저장된 Chat Completion 프리셋을 먼저 선택해 주세요.');
    document.getElementById('sr-position-dialog')?.remove();
    const dialog=document.createElement('dialog');dialog.id='sr-position-dialog';dialog.className='sr-position-dialog';
    const title=document.createElement('h3');title.textContent=PRESET_ENTRIES[kind].name+' 위치 선택';
    const help=document.createElement('p');help.className='sr-help';help.textContent=value.preset.name+' · 원하는 항목 사이를 선택하세요. 생성 후 프리셋에서 드래그하거나 켜고 끌 수 있습니다.';
    const list=document.createElement('div');list.className='sr-position-list';
    const close=document.createElement('button');close.type='button';close.className='menu_button';close.textContent='취소';close.addEventListener('click',()=>dialog.close());
    for(let index=0;index<=value.preset.prompts.length;index++){
        const button=document.createElement('button');button.type='button';button.className='menu_button';button.textContent='＋ 여기에 넣기';button.dataset.srGap=String(index);button.dataset.srKind=kind;
        button.addEventListener('click',()=>deps.runUiTask((async()=>{
            for(const b of dialog.querySelectorAll('button'))b.disabled=true;
            try{
                await deps.placement.place(kind,index,stamp);
                dialog.close();
                notifySceneReaderToast(deps.window,'success',PRESET_ENTRIES[kind].name+' 항목을 저장했습니다.','씬판독기');
            }finally{for(const b of dialog.querySelectorAll('button'))b.disabled=false;refresh();}
        })(),'주입 항목을 저장하지 못했습니다.'));
        list.append(button);
        if(index<value.preset.prompts.length){const row=document.createElement('p');row.className='sr-help';row.textContent=value.preset.prompts[index].name+(value.preset.prompts[index].enabled?'':' · 꺼짐');list.append(row);}
    }
    dialog.append(title,help,list,close);document.body.append(dialog);
    dialog.addEventListener('close',()=>{dialog.remove();refresh();});
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
    dialog.showModal();return dialog;
}
