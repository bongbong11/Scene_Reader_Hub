const numeric=new Set(['turnCount','messageCount','candidateCount','acceptedCount','pendingCount','inputChars','outputChars','durationMs','baselineCount','baselineTotal','repairCount','invalidCount']);
export function analysisFailureCode(error){return typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)?error.code:error?.name==='AbortError'?'ANALYSIS_CANCELLED':'ANALYSIS_FAILED';}
export function analysisDiagnostic(note,code,details={}) {
 const safe={module:'src/continuity/analysis-runtime.js',status:details.status||'info'};
 for(const [key,value]of Object.entries(details))if(numeric.has(key)&&Number.isFinite(value))safe[key]=value;
 if(typeof details.reasonCode==='string'&&/^[A-Z_a-z0-9]{1,80}$/.test(details.reasonCode)){safe.reasonCode=details.reasonCode;if(['failed','degraded'].includes(safe.status))safe.errorKind=details.reasonCode.toUpperCase();}
 note?.(code,safe);
}
