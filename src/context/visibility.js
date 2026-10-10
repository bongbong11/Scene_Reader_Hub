// Content identity and prompt visibility are independent.
const fallbackIds=new WeakMap();let nextId=0;
function visibilityId(message){if(!message||typeof message!=='object')return null;const explicit=message.extra?.sceneReaderMessageId||message.send_date;if(explicit)return explicit;if(!fallbackIds.has(message))fallbackIds.set(message,'local:'+(++nextId));return fallbackIds.get(message);}
export function isMessageHidden(message) {
 return Boolean(message?.is_system || message?.is_hidden || message?.hidden || message?.extra?.hidden || message?.extra?.exclude_from_prompt);
}
export function visibilitySnapshot(chat=[]) {
 return chat.map((message,index)=>({index,id:visibilityId(message),hidden:isMessageHidden(message)}));
}
export function visibilityKey(chat=[]) {
 // Visible output additions do not invalidate the input judgment for a swipe.
 const hidden=chat.flatMap((message,index)=>isMessageHidden(message)?[[index,visibilityId(message)]]:[]);
 return hidden.length?JSON.stringify(hidden):'visible';
}
export function visibilityChanges(before,after) {
 if(!before)return [];
 return after.filter((item,index)=>before[index]&&before[index].id===item.id&&before[index].hidden!==item.hidden);
}
export function judgmentVisibilityCurrent(judgment,chat) {
 return Boolean(judgment)&&(judgment.visibilityKeyV1??'visible')===visibilityKey(chat);
}
