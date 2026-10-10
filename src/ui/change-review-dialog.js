// Presentation only: opening the review never starts model work.
export function bindChangeReviewDialog(document) {
 const dialog=document.getElementById('sr-change-dialog'),opener=document.getElementById('sr-change-list');
 if(!dialog||!opener||dialog.srBound)return;
 dialog.srBound=true;
 const parent=document.getElementById('scene-reader-dialog');
 parent.append(dialog);
 const syncToasts=()=>{
  const target=dialog.open?dialog:parent.open?parent:document.body;
  for(const id of ['toast-container','scene-reader-toast-container']){
   const container=document.getElementById(id);if(container&&container.parentElement!==target)target.append(container);
  }
 };
 opener.addEventListener('click',()=>{if(!dialog.open)dialog.showModal();
  for(const draft of dialog.querySelectorAll('textarea'))if(draft.offsetParent){draft.style.height='auto';draft.style.height=draft.scrollHeight+'px';}
  syncToasts();});
 dialog.querySelector('[data-change-close]').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',syncToasts);
 parent.addEventListener('close',()=>{if(dialog.open)dialog.close();syncToasts();});
}
