import {deltaRepairFeedback,applyDeltaRepairs} from './delta-repair.js';
import {checkRecordComparison,checkMergedComparison} from './record-comparison.js';
import {validateDeltaPacket} from './delta-validation.js';
import {mergeDeltaResponses} from './delta-conflicts.js';
const malformed=value=>['memory_changes','knowledge_changes','character_changes','deferred_changes'].some(key=>!Array.isArray(value?.[key]));
function reportRejected(packet,report){
 const counts=new Map();for(const r of packet?.rejections||[])counts.set(r.code,(counts.get(r.code)||0)+1);
 for(const [reasonCode,candidateCount]of counts)report?.('ANALYSIS_ITEM_REJECTED',{status:'deferred',reasonCode,candidateCount});
 return packet;
}
// One format repair. A failed repair never discards valid first-response sections.
export async function validatedDeltaResponse(response,context,{request,valid,report}){
 let packet;
 try{packet=checkRecordComparison(response.result,validateDeltaPacket(response.result,context),context);}catch(error){if(error.code!=='ANALYSIS_INVALID_RESPONSE')throw error;}
 if(packet&&!malformed(response.result)&&!Object.values(packet.invalid).some(Number)&&!packet.comparison?.missing)return {...mergeDeltaResponses(null,packet),repairCount:0};
 if(!valid())throw Object.assign(new Error('분석 취소'),{name:'AbortError'});
 report?.('ANALYSIS_FORMAT_REPAIR',{status:'running'});
 try{
  const feedback=deltaRepairFeedback(response.result,context,packet),repaired=await request(feedback);
  if(!valid())throw Object.assign(new Error('분석 취소'),{name:'AbortError'});
  const repairedRaw=applyDeltaRepairs(response.result,repaired.result,feedback);
  const second=checkRecordComparison(repairedRaw,validateDeltaPacket(repairedRaw,context),context);
  const merged=checkMergedComparison(packet,second,mergeDeltaResponses(packet,second,{formatRepair:true}),context);
  return reportRejected({...merged,repairCount:1},report);
 }catch(error){
  if(!valid()||error.name==='AbortError'||!packet)throw error;
  report?.('ANALYSIS_FORMAT_REPAIR_FAILED',{status:'degraded',reasonCode:error.code==='ANALYSIS_REPAIR_INPUT_LIMIT'?error.code:'REPAIR_FAILED'});
  return reportRejected({...mergeDeltaResponses(null,packet),repairCount:1,repairFailed:true},report);
 }
}
