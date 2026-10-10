import {validateSourceRefs} from './source-refs.js';
export function sourceEligibility(refs,{record,chatRef,chat,fingerprint,inherited=false}) {
 if(!refs?.length)return 'legacy_unverified';
 for(const ref of refs){
  if(ref.sourceKind&&ref.sourceKind!=='chat'){
   return 'source_unverified';
  }
  if(ref.originChatRef!==chatRef){if(inherited)continue;return 'source_unavailable';}
  const message=chat?.[ref.messageIndex];
  if(message?.is_system||message?.is_hidden||message?.hidden||message?.extra?.hidden||message?.extra?.exclude_from_prompt)return 'source_hidden';
  if(!validateSourceRefs([ref],{chatRef,chat:chat||[],fingerprint}))return 'source_changed';
 }
 return 'ready';
}
export const eligibleSource=(refs,options)=>['ready','legacy_unverified'].includes(sourceEligibility(refs,options));
