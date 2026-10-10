// The optional vault retains ownership of its schema, evidence and persistence.
export async function completeVaultAudit({bridge,vault,result,sourceText,request,signal,valid,idle,report}){
 if(!valid()||!bridge.analysisCurrent(vault.token))return;
 try{
  const repair=bridge.repairAnalysis?.(vault.token,result);
  if(repair){
   try{
    const corrected=await request(repair.system,{vault_audit:repair.input,source_rp:sourceText},{signal,maxTokens:Math.min(2600,800+repair.cardIds.length*160),timeoutMs:120000});
    await idle(signal);
    if(valid()&&bridge.analysisCurrent(vault.token)&&Array.isArray(corrected.result?.vault_results))result={...result,vault_results:[...(Array.isArray(result?.vault_results)?result.vault_results:[]).filter(item=>!repair.cardIds.includes(item?.card_id)),...corrected.result.vault_results.filter(item=>repair.cardIds.includes(item?.card_id))]};
   }catch{if(!valid()||signal.aborted)return;}
  }
  if(!valid()||!bridge.analysisCurrent(vault.token))return;
  const outcome=await bridge.commitAnalysis(vault.token,result);report('analysis_vault',{status:outcome.status||'succeeded'});
 }catch{bridge.failAnalysis?.(vault.token,'VAULT_STORAGE_FAILED');report('analysis_vault',{status:'failed',reasonCode:'VAULT_STORAGE_FAILED'});}
}
