// Move the request-owned quiet instruction into the native chatHistory collection.
// Updating only the flattened API array leaves the host inspector in controlPrompts.
let sequence=0;
const wire=node=>({role:node.role,content:node.content,...(node.name?{name:node.name}:{}),...(node.tool_calls?{tool_calls:node.tool_calls}:{}),...(node.role==='tool'?{tool_call_id:node.identifier}:{})});
const same=(a,b)=>a?.role===b?.role&&JSON.stringify(a?.content)===JSON.stringify(b?.content)&&JSON.stringify(a?.tool_calls)===JSON.stringify(b?.tool_calls);
function leaves(root,result=[]){
 for(const node of root?.collection||[]){
  if(Array.isArray(node?.collection))leaves(node,result);
  else if(node&&(node.content||node.tool_calls))result.push({node,parent:root.collection});
 }
 return result;
}
export function installReviewMessage(host,prompt,report=()=>{}){
 const bus=host.eventSource,events=host.event_types,manager=host.promptManager;
 if(host.main_api!=='openai'||!bus?.makeLast||!bus?.removeListener||typeof manager?.preparePrompt!=='function'||!events?.CHAT_COMPLETION_PROMPT_READY||!events?.CHAT_COMPLETION_SETTINGS_READY){
  throw Object.assign(new Error('마지막 사용자 입력으로 확인하려면 SillyTavern의 채팅 완성 연결을 사용하세요.'),{code:'REVIEW_PLACEMENT_UNSUPPORTED'});
 }
 const id=`${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}`;
 const start=`<sr-review-${id}>`,end=`</sr-review-${id}>`,wrapped=`${start}\n${prompt}\n${end}`;
 let confirmed=false,historyPrefix=null,reviewNode=null,active=true;const historyIds=new Set();
 // Native chat messages carry a speaker name before Message conversion. Depth
 // injections do not, even when they use user/assistant roles and order zero.
 // Observe identifiers only; never alter the prompt, card or preset settings.
 const prepare=manager.preparePrompt;
 function observe(prompt,...args){if(active&&/^chatHistory-\d+$/.test(prompt?.identifier||'')&&typeof prompt.name==='string'&&prompt.name.trim())historyIds.add(prompt.identifier);return prepare.call(this,prompt,...args);}
 manager.preparePrompt=observe;
 const marked=text=>typeof text==='string'&&text.includes(start)&&text.includes(end);
 const owns=node=>Array.isArray(node?.content)?node.content.some(part=>part?.type==='text'&&marked(part.text)):marked(node?.content);
 function strip(content){
  const text=value=>{let from=value.indexOf(start);while(from>=0){const to=value.indexOf(end,from+start.length);if(to<0)break;value=value.slice(0,from)+value.slice(to+end.length);from=value.indexOf(start);}return value;};
  return Array.isArray(content)?content.flatMap(part=>{if(part?.type!=='text'||!marked(part.text))return [part];const clean=text(part.text);return clean.trim()?[{...part,text:clean}]:[];}):text(content);
 }
 function instruction(messages){
  for(const node of messages){const content=Array.isArray(node?.content)?node.content.filter(part=>part?.type==='text').map(part=>part.text):[node?.content];for(const value of content)if(marked(value))return value.slice(value.indexOf(start)+start.length,value.indexOf(end,value.indexOf(start)+start.length)).trim();}
  return null;
 }
 // Match the native prefix in order, so identical example/history text cannot
 // redirect the instruction to an example, memory or post-history preset block.
 function anchor(messages){
  if(!historyPrefix)return -1;let cursor=-1;
  for(const original of historyPrefix){let next=cursor+1;while(next<messages.length&&!same(messages[next],original))next++;if(next===messages.length)return -1;cursor=next;}
  return cursor;
 }
 function relocate(messages,final){
  if(!Array.isArray(messages))return false;
  const text=instruction(messages);if(text===null)return false;
  const next=messages.flatMap(node=>{if(!owns(node))return [node];const content=strip(node.content);return (Array.isArray(content)?content.length:String(content||'').trim())||node.tool_calls?[{...node,content}]:[];});
  const index=anchor(next);if(index<0)return false;
  next.splice(index+1,0,{role:'user',content:final?text:`${start}\n${text}\n${end}`});
  messages.splice(0,messages.length,...next);
  if(final){reviewNode.content=text;confirmed=true;}
  try{report({code:final?'REVIEW_USER_MESSAGE_READY':'REVIEW_USER_MESSAGE_PREPARED',status:'info',phase:final?'request':'assembly',role:'user',position:'last_chat_message',messageIndex:index+1,messageCount:messages.length});}catch{/* diagnostic only */}
  return true;
 }
 async function onPrompt(data){
  if(data?.dryRun||!Array.isArray(data?.chat)||instruction(data.chat)===null)return;
  const refs=leaves(manager.messages),owned=refs.filter(ref=>owns(ref.node));let last=refs.findLastIndex(ref=>historyIds.has(ref.node.identifier)||historyIds.has(String(ref.node.identifier||'').replace(/^toolCall-/,'')));
  while(last>=0&&refs[last+1]?.node.role==='tool')last++;
  if(!owned.length||last<0)return;
  historyPrefix=refs.slice(0,last+1).filter(ref=>!owns(ref.node)).map(ref=>wire(ref.node));
  // Confirm the real request boundary before changing the inspector tree.
  if(anchor(data.chat)<0){historyPrefix=null;return;}
  const target=refs[last],original=owned[0].node;
  const content=`${start}\n${instruction(data.chat)}\n${end}`,identifier=`chatHistory-sr-review-${id}`;
  reviewNode=typeof original.constructor.createAsync==='function'?await original.constructor.createAsync('user',content,identifier):Object.assign(Object.create(Object.getPrototypeOf(original)),original,{role:'user',content,identifier,name:undefined});
  for(const {node,parent} of owned){const content=strip(node.content);if((Array.isArray(content)?content.length:String(content||'').trim())||node.tool_calls)node.content=content;else parent.splice(parent.indexOf(node),1);}
  target.parent.splice(target.parent.indexOf(target.node)+1,0,reviewNode);
  if(relocate(data.chat,false))bus.makeLast(events.CHAT_COMPLETION_SETTINGS_READY,onRequest);
 }
 const onRequest=data=>{if(relocate(data?.messages,true))try{manager.populateTokenCounts?.(manager.messages);}catch{/* inspector counts only */}};
 const dispose=()=>{active=false;if(manager.preparePrompt===observe)manager.preparePrompt=prepare;bus.removeListener(events.CHAT_COMPLETION_PROMPT_READY,onPrompt);bus.removeListener(events.CHAT_COMPLETION_SETTINGS_READY,onRequest);};
 try{bus.makeLast(events.CHAT_COMPLETION_PROMPT_READY,onPrompt);bus.makeLast(events.CHAT_COMPLETION_SETTINGS_READY,onRequest);}catch(error){dispose();throw error;}
 return {quietPrompt:wrapped,dispose,verify(){if(!confirmed)throw Object.assign(new Error('확인 명령의 마지막 사용자 입력 배치를 확인하지 못했습니다. 결과를 적용하지 않았습니다.'),{code:'REVIEW_PLACEMENT_UNCONFIRMED'});}};
}
