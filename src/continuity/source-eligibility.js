import {validateSourceRefs} from './source-refs.js';
export function sourceEligibility(refs,{record,chatRef,chat,fingerprint,inherited=false,excluded=record?.nonRpOutputIndices||[]}) {
 if(!refs?.length)return 'legacy_unverified';
 for(const ref of refs){
  if(ref.sourceKind&&ref.sourceKind!=='chat'){
   return 'source_unverified';
  }
  const origin=ref.originChatRef??ref.chatKey;
  if(origin!==chatRef){if(inherited&&origin)continue;return 'source_unavailable';}
  if(excluded.includes(ref.messageIndex??ref.assistantIndex))return 'source_excluded';
  if(ref.chatKey&&ref.assistantIndex!==undefined){
   const message=chat?.[ref.assistantIndex];
   if(message?.is_system||message?.is_hidden||message?.hidden||message?.extra?.hidden||message?.extra?.exclude_from_prompt)return 'source_hidden';
   if(!message||message.is_user||ref.outputFingerprint!==fingerprint(String(message.mes||'')))return 'source_changed';
   continue;
  }
  const message=chat?.[ref.messageIndex];
  if(message?.is_system||message?.is_hidden||message?.hidden||message?.extra?.hidden||message?.extra?.exclude_from_prompt)return 'source_hidden';
  if(!validateSourceRefs([ref],{chatRef,chat:chat||[],fingerprint}))return 'source_changed';
 }
 return 'ready';
}
export const eligibleSource=(refs,options)=>['ready','legacy_unverified'].includes(sourceEligibility(refs,options));
