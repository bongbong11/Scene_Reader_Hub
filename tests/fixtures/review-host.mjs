// Native host collection shape, deliberately including preset blocks AFTER history.
// Assertions inspect both collections and the outgoing wire messages.
export function reviewHost(respond=async()=> 'Original: Guarded.\nChange: Accepts help from one person.'){
 const listeners=new Map(),notes=[],host={main_api:'openai',isGenerating:()=>false,event_types:{CHAT_COMPLETION_PROMPT_READY:'prompt',CHAT_COMPLETION_SETTINGS_READY:'request'},promptManager:{messages:null,preparePrompt:prompt=>({...prompt})}};
 host.eventSource={makeLast(event,fn){listeners.set(event,[...(listeners.get(event)||[]).filter(x=>x!==fn),fn]);},removeListener(event,fn){listeners.set(event,(listeners.get(event)||[]).filter(x=>x!==fn));}};
 const emit=async(event,data)=>{for(const fn of [...(listeners.get(event)||[])])await fn(data);};
 function assemble(quietPrompt,{merged=false,squashed=false,injections=true,tool=false}={}){
  const memory={identifier:'main',role:'system',content:'Older relationship memory'},example={identifier:'dialogueExamples-1',role:'assistant',content:'Latest conflict'},history={identifier:'chatHistory-1',role:'assistant',content:'Latest conflict'},image={type:'image_url',image_url:{url:'synthetic:test'}};
  const own={identifier:'quietPrompt',role:'system',content:merged?[{type:'text',text:'Preset before\n'+quietPrompt+'\nPreset after'},image]:quietPrompt};
  host.promptManager.preparePrompt({...history,name:'Actor'});
  const results=tool?[{identifier:'call-1',role:'tool',content:'Tool result'}]:[];if(tool){history.identifier='toolCall-chatHistory-1';history.tool_calls=[{id:'call-1',type:'function',function:{name:'lookup',arguments:'{}'}}];}
  const injected=injections?['system','user','assistant'].map((role,index)=>({identifier:`chatHistory-${index+2}`,role,content:`Depth 0 order 0 ${role}`})):[];
  for(const message of injected)host.promptManager.preparePrompt(message);
  const blocks=[{identifier:'main',collection:[memory]},{identifier:'dialogueExamples',collection:[example]},{identifier:'chatHistory',collection:[history,...results,...injected]},{identifier:'jailbreak',collection:[{identifier:'jailbreak',role:'system',content:'Late preset'}]},{identifier:'controlPrompts',collection:[own]}];
  host.promptManager.messages={identifier:'root',collection:squashed?blocks.flatMap(block=>block.collection):blocks};
  return {memory,example,history,image,own,chat:flatten(),blocks};
 }
 function flatten(root=host.promptManager.messages){return (root?.collection||[]).flatMap(node=>Array.isArray(node.collection)?flatten(node):[{role:node.role,content:node.content,...(node.name?{name:node.name}:{}),...(node.tool_calls?{tool_calls:node.tool_calls}:{}),...(node.role==='tool'?{tool_call_id:node.identifier}:{})}]);}
 host.generateQuietPrompt=async options=>{host.options=options;const built=assemble(options.quietPrompt);await emit('prompt',{chat:built.chat,dryRun:false});built.chat.push({role:'system',content:'Other extension context'});await emit('request',{messages:built.chat});host.sent=structuredClone(built.chat);return respond(options);};
 return {host,emit,notes,assemble,flatten,count:()=>[...listeners.values()].reduce((n,x)=>n+x.length,0)};
}
