// The optional vault retains ownership of its schema, evidence and persistence.
export async function completeVaultAudit({bridge,vault,result,sourceText,request,signal,valid,idle,report}){
 let phase='prepare';
 try{
  if(!valid()||!bridge.analysisCurrent(vault.token))return;
  const repair=bridge.repairAnalysis?.(vault.token,result);
  if(repair){
   try{
    phase='request';
    const corrected=await request(repair.system,{vault_audit:repair.input,source_rp:sourceText},{signal,maxTokens:Math.min(2600,800+repair.cardIds.length*160),timeoutMs:120000});
    await idle(signal);
    if(valid()&&bridge.analysisCurrent(vault.token)&&Array.isArray(corrected.result?.vault_results))result={...result,vault_results:[...(Array.isArray(result?.vault_results)?result.vault_results:[]).filter(item=>!repair.cardIds.includes(item?.card_id)),...corrected.result.vault_results.filter(item=>repair.cardIds.includes(item?.card_id))]};
   }catch(error){if(!valid()||signal.aborted)return;report('analysis_vault',{status:'degraded',phase:'request',reasonCode:'VAULT_REPAIR_REQUEST_FAILED',errorKind:/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code||'')?error.code:'VAULT_REPAIR_REQUEST_FAILED'});}
  }
  if(!valid()||!bridge.analysisCurrent(vault.token))return;
  phase='commit';
  const outcome=await bridge.commitAnalysis(vault.token,result);report('analysis_vault',{status:outcome?.status||'succeeded',phase});
 }catch(error){
  const reasonCode=phase==='commit'?'VAULT_COMMIT_FAILED':'VAULT_PREPARE_FAILED';
  report('analysis_vault',{status:'failed',phase,reasonCode,errorKind:/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code||'')?error.code:reasonCode});
  try{bridge.failAnalysis?.(vault.token,reasonCode);}catch{report('analysis_vault',{status:'failed',phase:'cleanup',reasonCode:'VAULT_FAILURE_HOOK_FAILED'});}
 }
}
