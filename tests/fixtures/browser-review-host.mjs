export const main_api='openai',name1='User',chat=window.mock.chat;
export const eventSource=window.eventSource,event_types=new Proxy({},{get:(_,key)=>key}),chat_metadata={};
export function saveSettingsDebounced(){}
export function setExtensionPrompt(key,value){window.mock.prompts[key]=value;}
export function getRequestHeaders(){return {};}
export function isStreamingEnabled(){return Boolean(window.mock.streamingEnabled);}
export function isGenerating(){return Boolean(window.mock.mainBusy);}
export function substituteParams(text){return text.replaceAll('{{char}}',ctx.name2).replaceAll('{{user}}',ctx.name1);}
export function removeReasoningFromString(value){return value;}
export async function Generate(type,options){
 (mock.quietRequests ||= []).push(options);
 await mock.emit('GENERATION_AFTER_COMMANDS',type,options,false);
 const core=[{name:ctx.name2,is_user:false,mes:'Latest story scene'}];
 let aborted=false;
 await window.SceneReaderHubBeforeGenerate(core,100000,()=>aborted=true,type);
 if(aborted)return;
 const history=core.map((message,index)=>({identifier:'chatHistory-'+(index+1),role:message.is_user?'user':'assistant',content:message.mes}));
 const depth=['system','user','assistant'].map((role,i)=>({identifier:'chatHistory-'+(history.length+i+1),role,content:'Depth 0 order 0 '+role}));
 mock.promptManager.messages={identifier:'root',collection:[{identifier:'main',collection:[{identifier:'main',role:'system',content:mock.reviewPrefixRewrite?'Updated earlier relationship memory':'Preset and older relationship memory'}]},{identifier:'chatHistory',collection:[...history,...depth]},{identifier:'jailbreak',collection:[{identifier:'jailbreak',role:'system',content:'Final preset instruction'}]}]};
 const messages=mock.promptManager.messages.collection.flatMap(block=>block.collection.map(({role,content})=>({role,content})));
 if(!mock.reviewSkipObservation)await mock.emit('CHAT_COMPLETION_PROMPT_READY',{chat:messages,dryRun:false});
 messages.push({role:'system',content:'Other extension context'});
 await mock.emit('CHAT_COMPLETION_SETTINGS_READY',{messages});
 const response=await fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify({type,messages})});
 const sent=await response.json();(mock.reviewMessages ||= []).push(sent.messages);
 if(mock.reviewError)throw new Error('Synthetic model failure');
 return mock.reviewAnswer||'Original: Guarded.\nChange: Guarded, but accepts help from one person.';
}
export async function generateRaw(options){
 (window.mock.rawRequests ||= []).push(options);
 return '- 신뢰: 이전: 경계함 -> 현재: 경계심은 남지만 한 사람의 도움은 받아들임.';
}
