import {CONTINUITY_VALIDATION_LABELS} from '../continuity/engine.js';
import {safeAnalysisInfo} from '../continuity/failure.js';
const numeric=new Set([...Object.keys(CONTINUITY_VALIDATION_LABELS),'reusedCount','referenceCount','turnCount','requiredTurns','retrySeconds','messageCount','candidateCount','acceptedCount','pendingCount','inputChars','outputChars','durationMs','baselineCount','baselineTotal','repairCount','invalidCount','translationMissing','comparedCount','missingComparison','recordChangeCount']);
export function analysisFailureCode(error){return typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)?error.code:error?.name==='AbortError'?'ANALYSIS_CANCELLED':'ANALYSIS_FAILED';}
export function analysisDiagnostic(note,code,details={}) {
 const safe={module:'src/continuity/auxiliary-runtime.js',...safeAnalysisInfo(details),status:details.status||'info'};
 // Structured details are exported separately in the retained report.
 delete safe.sectionCounts;delete safe.rejections;delete safe.code;
 if(typeof details.codeFallback==='boolean')safe.codeFallback=details.codeFallback;
 if(typeof details.continuityIncluded==='boolean')safe.continuityIncluded=details.continuityIncluded;
 for(const [key,value]of Object.entries(details))if(numeric.has(key)&&Number.isFinite(value))safe[key]=value;
 if(typeof details.reasonCode==='string'&&/^[A-Z_a-z0-9]{1,80}$/.test(details.reasonCode)){safe.reasonCode=details.reasonCode;if(['failed','degraded'].includes(safe.status))safe.errorKind=details.reasonCode.toUpperCase();}
 note?.(code,safe);
}
