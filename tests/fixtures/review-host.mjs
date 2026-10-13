export function reviewHost(respond=async()=> 'Original: Guarded.\nChange: Accepts help from one person.') {
 const listeners=new Map(),notes=[],host={main_api:'openai',name1:'User',isGenerating:()=>false,event_types:{GENERATION_STARTED:'start',CHAT_COMPLETION_PROMPT_READY:'prompt'},chat:[{name:'Actor',is_user:false,mes:'Latest conflict'}],removeReasoningFromString:value=>value};
 host.eventSource={makeLast(event,fn){listeners.set(event,[...(listeners.get(event)||[]).filter(x=>x!==fn),fn]);},removeListener(event,fn){listeners.set(event,(listeners.get(event)||[]).filter(x=>x!==fn));}};
 const emit=async(event,...args)=>{for(const fn of [...(listeners.get(event)||[])])await fn(...args);};
 host.reviewWindow={SceneReaderHubBeforeGenerate:async()=>{host.fallbackCount=(host.fallbackCount||0)+1;}};
 function assemble(core,{squashed=false}={}) {
  const history=core.map((message,index)=>({identifier:`chatHistory-${index+1}`,role:message.is_user?'user':'assistant',content:message.mes}));
  const depth=['system','user','assistant'].map((role,index)=>({identifier:`chatHistory-${history.length+index+1}`,role,content:`Depth 0 order 0 ${role}`}));
  const blocks=[{identifier:'main',collection:[{role:'system',content:'Older relationship memory'}]},{identifier:'dialogueExamples',collection:[{role:'assistant',content:'Latest conflict'}]},{identifier:'chatHistory',collection:[...history,...depth]},{identifier:'jailbreak',collection:[{role:'system',content:'Late preset'}]}];
  host.promptManager={messages:{identifier:'root',collection:squashed?blocks.flatMap(block=>block.collection):blocks}};
  return {chat:flatten(),blocks};
 }
 function flatten(root=host.promptManager.messages){return(root?.collection||[]).flatMap(node=>Array.isArray(node.collection)?flatten(node):[{role:node.role,content:node.content}]);}
 host.Generate=async(type,options)=>{
  host.options=options;await emit('start',type,options,false);
  let aborted=false;const core=structuredClone(host.chat);
  await host.reviewWindow.SceneReaderHubBeforeGenerate(core,100000,()=>aborted=true,type);
  if(aborted)return;
  host.core=core;const built=assemble(core);
  if(!host.skipPrompt)await emit('prompt',{chat:built.chat,dryRun:false});
  host.sent=structuredClone(built.chat);return respond(options);
 };
 return {host,emit,notes,assemble,flatten,count:()=>[...listeners.values()].reduce((n,x)=>n+x.length,0)};
}
