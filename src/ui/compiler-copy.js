import { storedWorldToJson } from '../world/advanced.js';

export function characterCopyNotice(document, lore = []) {
    const sheet=Boolean(document.getElementById('sr-character-source')?.value?.trim());
    const count=lore.filter(item=>String(item.content || '').trim()).length;
    const included=[sheet?'시트 원문':'',count?`선택한 로어북 ${count}개`:''].filter(Boolean);
    const text=included.length ? `${included.join('과 ')}를 포함해 분석 명령문이 복사됩니다.` : '기본 분석 명령문만 복사됩니다. 사용할 시트·로어북 원문을 함께 넣어 주세요.';
    const node=document.getElementById('sr-character-copy-note');
    if(node)node.textContent=text;
    return {text,included:included.length>0};
}

export function worldCopySource(document, worlds = []) {
    const el=id=>document.getElementById(id);
    if(el('sr-world-editor')?.hidden===false) {
        const text=el('sr-world-edit-prompt')?.value?.trim() || '';
        return text ? {name:el('sr-world-edit-name')?.value?.trim() || '작성 중인 세계관',text} : null;
    }
    const editId=el('sr-world-advanced-edit-id')?.value;
    if(editId) {
        const text=el('sr-world-advanced-json')?.value?.trim() || '';
        return text ? {name:worlds.find(world=>world.id===editId)?.name || '수정 중인 세계관',text} : null;
    }
    const world=worlds.find(world=>world.id===el('sr-world-profile')?.value);
    if(!world || world.id==='current')return null;
    const text=world.advanced ? JSON.stringify(storedWorldToJson(world),null,2) : String(world.prompt || '').trim();
    return text ? {name:world.name,text} : null;
}

export function worldCopyNotice(document, worlds = []) {
    const source=worldCopySource(document,worlds);
    const text=source ? `‘${source.name}’ 세계관 원문을 포함해 분석 명령문이 복사됩니다.` : '기본 분석 명령문만 복사됩니다. 사용할 세계관 원문을 함께 넣어 주세요.';
    const node=document.getElementById('sr-world-copy-note');
    if(node)node.textContent=text;
    return {text,source};
}
