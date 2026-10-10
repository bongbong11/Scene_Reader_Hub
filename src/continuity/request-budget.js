// One user operation has a finite total budget, including optional repairs.
export function analysisRequestBudget(request,{maxRequests=3,totalMs=180000,now=()=>Date.now()}={}){
 let started=null,count=0;
 return (...args)=>{
  started??=now();const remaining=totalMs-(now()-started);
  if(count>=maxRequests||remaining<=0)throw Object.assign(new Error('추가 분석 한도에 도달했습니다. 확인한 내용은 유지합니다.'),{code:'ANALYSIS_REQUEST_BUDGET'});
  count++;const options=args[4]||{};
  return request(...args.slice(0,4),{...options,timeoutMs:Math.min(options.timeoutMs||120000,remaining)});
 };
}
