import {createAuxiliaryRuntime} from '../../src/continuity/auxiliary-runtime.js';
import {stableFingerprint} from '../../src/decision/policy.js';
export const emptyResponse=()=>({result:{new_items:[],affected:[],knowledge_updates:[],possible_followups:[],topic_fixation:null}});
export function auxiliaryFixture({chat=[],settings={},fingerprint=stableFingerprint}={}){
 const context={chat,name2:'Actor'},records=new Map([['room-A',{continuity:{items:[],knowledge:[],dependencies:[],followups:[]}}]]),requests=[],events=[],histories=new Map(),stored=[];
 const deps={window:{},hub:{snapshot:()=>({state:{status:'prepared'}})},stateChatKey:()=> 'room-A',getContext:()=>context,settings:{enabled:true,continuityEnabled:true,reasonerProfileId:'synthetic',recentTurns:3,...settings},characterStore:{enabled:true,characters:[],npcs:[]},record:()=>records.get(deps.stateChatKey()),chatRecords:records,stateHistoryCache:histories,queueWrite:(_k,task)=>task(),loadStateHistory:async key=>histories.get(key)||[],storagePost:async(_route,payload)=>stored.push(structuredClone(payload)),fingerprint,sourceRevisionKey:()=> 'source',selectedWorld:()=>null,renderAll(){},noteDiagnostic:(code,detail)=>events.push({code,...detail}),connectionRequestService:{},requestWithConnectionProfile:async(...args)=>{requests.push(args);return emptyResponse();},clearInjection:async()=>{}};
 const analysis=createAuxiliaryRuntime(deps);
 const turn=async(text='Actor answers.')=>{context.chat.push({is_user:true,mes:'A question.'},{is_user:false,mes:text});return analysis.queue(context.chat.length-1);};
 return {deps,analysis,context,records,requests,events,histories,stored,turn};
}
