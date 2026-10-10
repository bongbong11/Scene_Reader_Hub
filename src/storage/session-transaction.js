// Shared serialized commit for detached helpers and visibility changes.
export function createSessionTransaction(deps){
 async function commitSession(chatKey,reduce,valid=()=>true){
  return deps.queueWrite('session:'+chatKey,async()=>{
   if(!valid())return false;const current=deps.chatRecords.get(chatKey);if(!current)return false;
   const signature=deps.fingerprint(current),history=structuredClone(await deps.loadStateHistory(chatKey));
   if(deps.fingerprint(deps.chatRecords.get(chatKey))!==signature||!valid())return false;
   const result=reduce({current:structuredClone(current),history});if(!result||!valid())return false;
   await deps.storagePost('transaction',{chatKey,chat:result.chat,history:result.history});
   if(!valid()||deps.fingerprint(deps.chatRecords.get(chatKey))!==signature){
    const latest=deps.chatRecords.get(chatKey);
    if(latest)await deps.storagePost('transaction',{chatKey,chat:structuredClone(latest),history:structuredClone(deps.stateHistoryCache.get(chatKey)||history)});
    return false;
   }
   deps.chatRecords.set(chatKey,result.chat);deps.stateHistoryCache.set(chatKey,result.history);return true;
  });
 }
 return {commitSession};
}
