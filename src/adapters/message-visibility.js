const OWNER=Symbol.for('scene-reader.visibility-save.v1');
// DOM attributes and host save requests are signals only. State comes from chat.
export function createVisibilityAdapter({window,document,eventSource,event_types,check}) {
 let observer=null,scheduled=false;
 const signal=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;void check().catch(()=>{});});};
 function init(){
  for(const type of [...new Set([event_types?.MESSAGE_UPDATED,event_types?.CHAT_LOADED,event_types?.MORE_MESSAGES_LOADED].filter(Boolean))])eventSource?.on(type,signal);
  const chat=document?.getElementById('chat');
  if(chat&&window?.MutationObserver){observer=new window.MutationObserver(signal);observer.observe(chat,{subtree:true,attributes:true,attributeFilter:['is_system']});}
  const previous=window?.fetch;
  if(typeof previous==='function'&&!previous[OWNER]){
   const wrapped=function(input,options,...rest){
    const url=typeof input==='string'?input:input?.url||'';
    const method=String(options?.method||input?.method||'').toUpperCase();
    if(method==='POST'&&/\/api\/(?:chats\/save|chats\/group\/save)(?:[?#]|$)/.test(url))signal();
    return previous.call(this,input,options,...rest);
   };
   Object.defineProperty(wrapped,OWNER,{value:true});
   const chain=Symbol.for('hyedam.request-injection.hook-chain.v1');if(previous[chain])Object.defineProperty(wrapped,chain,{value:previous[chain]});
   window.fetch=wrapped;
  }
 }
 return {init,signal,dispose(){observer?.disconnect();}};
}
