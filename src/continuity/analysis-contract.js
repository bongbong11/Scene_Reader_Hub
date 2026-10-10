export const ANALYSIS_LIMITS = Object.freeze({sourceChars:18000,contextChars:2000,inputChars:40000,maxChanges:8,maxPending:128,maxActive:256,stateBytes:2*1024*1024,maxTokens:8192,timeoutMs:120000,retryMs:30000});
export const COVERAGE_SECTIONS = Object.freeze({memory:'continuity',characters:'evolution',persona:'persona'});
export const clone = value => structuredClone(value);
export function normalizeAnalysisSettings(value={}) {return {interval:Number(value.continuityInterval)===5?5:3,persona:value.collectPersonaChanges===true};}
export function normalizeStoredAnalysisSettings(value) {const normalized=normalizeAnalysisSettings(value);value.continuityInterval=normalized.interval;value.collectPersonaChanges=normalized.persona;return value;}
export function normalizeAnalysisRuntime(value) {
 const v=value&&typeof value==='object'?clone(value):{};
 return {...v,schemaVersion:1,anchor:v.anchor??null,turnRefs:Array.isArray(v.turnRefs)?v.turnRefs:[],rangeLedger:Array.isArray(v.rangeLedger)?v.rangeLedger:[],pendingBatches:Array.isArray(v.pendingBatches)?v.pendingBatches:[],coverageGaps:Array.isArray(v.coverageGaps)?v.coverageGaps:[],openScene:v.openScene??null,
 sections:Object.fromEntries(Object.values(COVERAGE_SECTIONS).map(key=>[key,{scannedThrough:null,settledThrough:null,...v.sections?.[key]}])),retry:{attempts:0,notBefore:0,failureClass:null,...v.retry},lastRun:v.lastRun??null,contractVersion:1};
}
export const analysisBytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
export function assertAnalysisCapacity(record) {
 const runtime=normalizeAnalysisRuntime(record.analysisRuntimeV1);
 if(runtime.pendingBatches.reduce((n,b)=>n+(b.candidates||[]).filter(c=>c.status==='pending').length,0)>ANALYSIS_LIMITS.maxPending || analysisBytes([runtime,record.characterEvolutionV1||null,record.analysisJournalV1||[],record.continuity||null,record.characterState?.knowledge||[],record.historyAnalysisV1||null,record.approvedHistorySourcesV1||[]])>ANALYSIS_LIMITS.stateBytes)throw Object.assign(new Error('누적 자료 저장 한도에 도달했습니다. 기존 자료는 유지합니다.'),{code:'ANALYSIS_CAPACITY'});
}
