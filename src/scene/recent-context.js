import {isVisibleRoleplayMessage,splitOocText} from '../context/messages.js';

// One visible exchange for intimacy classification only. Other judgments keep their configured history.
export function recentSceneRoleplay({chat=[],pendingUserText='',nonRpOutputIndices=[],userName='USER',characterName='CHARACTER',maxChars=18000}={}){
 const messages=Array.isArray(chat)?chat:[],pending=String(pendingUserText||'').trim(),excluded=new Set(nonRpOutputIndices||[]),selected=[];
 // Read backwards and stop at one exchange; never parse the whole long-running chat again.
 for(let index=messages.length-(pending?0:1);index>=0;index--){
  const message=index===messages.length?{is_user:true,mes:pending,name:userName}:messages[index];
  if(index<messages.length&&excluded.has(index)||!isVisibleRoleplayMessage(message)||message.extra?.ooc_chat===true)continue;
  if(selected.length&&Boolean(message.is_user)===Boolean(selected[0].message.is_user))continue;
  const text=splitOocText(message.mes).rpText;if(!text)continue;
  selected.unshift({message,text});if(selected.length===2)break;
 }
 // Before generation: latest assistant reply + current user input. After generation: latest user input + reply.
 const chunks=selected.map(({message,text},index)=>`[${index+1}] ${message.is_user?'USER':'CHARACTER'} (${message.name||(message.is_user?userName:characterName)})\n${text}`);
 while(chunks.length>1&&chunks.join('\n\n').length>maxChars)chunks.shift();
 const result=chunks.join('\n\n');if(result.length<=maxChars)return result;
 const header=result.slice(0,result.indexOf('\n')),marker='\n[older text clipped]\n';
 return header+marker+result.slice(-Math.max(1,maxChars-header.length-marker.length));
}
