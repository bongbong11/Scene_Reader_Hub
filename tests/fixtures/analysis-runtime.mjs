import {createAnalysisRuntime} from '../../src/continuity/analysis-runtime.js';
import {stableFingerprint} from '../../src/decision/policy.js';
export const emptyResponse=()=>({result:{protocol:1,coverage:{memory:'complete',characters:'complete',persona:'not_requested'},memory_changes:[],knowledge_changes:[],character_changes:[],deferred_changes:[],topic_fixation:null}});
export function analysisFixture({chat=[{is_user:true,mes:'Synthetic question.'},{is_user:false,mes:'Synthetic answer.'}],settings={},fingerprint=stableFingerprint}={}){
 const context={chat,name2:'Actor'},records=new Map([['room-A',{}]]),requests=[],events=[],histories=new Map(),stored=[];
 const deps={window:{},hub:{snapshot:()=>({state:{status:'prepared'}})},stateChatKey:()=> 'room-A',getContext:()=>context,settings:{enabled:true,continuityEnabled:true,reasonerProfileId:'synthetic',continuityInterval:3,...settings},characterStore:{enabled:true,characters:[],npcs:[]},record:()=>records.get(deps.stateChatKey()),chatRecords:records,stateHistoryCache:histories,queueWrite:(_k,task)=>task(),loadStateHistory:async key=>histories.get(key)||[],storagePost:async(_route,payload)=>stored.push(structuredClone(payload)),fingerprint,renderAll(){},selectActiveEntries:()=>[],noteDiagnostic:(code,detail)=>events.push({code,...detail}),connectionRequestService:{},requestWithConnectionProfile:async(...args)=>{requests.push(args);return emptyResponse();},clearInjection:async()=>{}};
 const analysis=createAnalysisRuntime(deps);deps.analysis=analysis;return {deps,analysis,context,records,requests,events,histories,stored};
}
