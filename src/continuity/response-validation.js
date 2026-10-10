import {validateDeltaPacket} from './delta-validation.js';
import {mergeDeltaResponses} from './delta-conflicts.js';
const malformed=value=>['memory_changes','knowledge_changes','character_changes','deferred_changes'].some(key=>!Array.isArray(value?.[key]));
// One format repair. A failed repair never discards valid first-response sections.
export async function validatedDeltaResponse(response,context,{request,valid,report}){
 let packet;
 try{packet=validateDeltaPacket(response.result,context);}catch(error){if(error.code!=='ANALYSIS_INVALID_RESPONSE')throw error;}
 if(packet&&!malformed(response.result)&&!Object.values(packet.invalid).some(Number))return {...mergeDeltaResponses(null,packet),repairCount:0};
 if(!valid())throw Object.assign(new Error('분석 취소'),{name:'AbortError'});
 report?.('ANALYSIS_FORMAT_REPAIR',{status:'running'});
 try{
  const repaired=await request();
  if(!valid())throw Object.assign(new Error('분석 취소'),{name:'AbortError'});
  return {...mergeDeltaResponses(packet,validateDeltaPacket(repaired.result,context)),repairCount:1};
 }catch(error){
  if(!valid()||error.name==='AbortError'||!packet)throw error;
  report?.('ANALYSIS_FORMAT_REPAIR_FAILED',{status:'degraded',reasonCode:'REPAIR_FAILED'});
  return {...mergeDeltaResponses(null,packet),repairCount:1,repairFailed:true};
 }
}
