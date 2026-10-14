export const main_api='openai',name1='User',chat=window.mock.chat;
export const eventSource=window.eventSource,event_types=new Proxy({},{get:(_,key)=>key}),chat_metadata={};
export function saveSettingsDebounced(){}
export function setExtensionPrompt(key,value){window.mock.prompts[key]=value;}
export function getRequestHeaders(){return {};}
export function isStreamingEnabled(){return Boolean(window.mock.streamingEnabled);}
