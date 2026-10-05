const text=value=>typeof value==='string'?value.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,100).replace(/[\uD800-\uDFFF]/gu,''):'';
function source(value){return {characterName:text(value?.characterName),chatName:text(value?.chatName)};}
function filename(backup){
 const value=source(backup.source),name=[value.characterName,value.chatName].filter(Boolean).join(' · ')||'이름 정보 없는 백업';
 return `${Array.from(name.replace(/[<>:"/\\|?*]/g,'_')).slice(0,40).join('')} · 전체 백업 · ${text(backup.id)||'backup'}.srbackup`;
}
const reasons=new Set(['manual','before_story_link','before_room_migration','before_room_restore','before_baseline_update']);
const reason=value=>reasons.has(value)?value:'manual';
module.exports={source,filename,reason};
