// Explicitly bounded diagnostics: never retain provider messages or RP content.
const phases=new Set(['prepare','request','response','items','storage','vault','cleanup']);
const modules=new Set(['src/continuity/auxiliary-runtime.js','src/adapters/connection-profile.js','src/continuity/json-parser.js','src/continuity/response.js','src/storage/session-transaction.js']);
const fields=new Set(['source_type','source_indices','kind','label','lifecycle','state_id','relation','pressure','character','source','summary','related_state_id','action','new_items','affected','knowledge_updates','possible_followups']);
const counts=['httpStatus','durationMs','requestMs','inputChars','outputChars','maxTokens','timeoutMs','groupCount','messageCount','candidateCount','acceptedCount','invalidCount','reusedCount','sectionCount','retryAfter','firstMessageIndex','lastMessageIndex'];
export function safeAnalysisInfo(value={}) {
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    const safe={};
    for(const key of counts)if(Number.isFinite(value[key])&&value[key]>=0)safe[key]=value[key];
    if(phases.has(value.phase))safe.phase=value.phase;
    if(modules.has(value.module))safe.module=value.module;
    if(typeof value.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value.code))safe.code=value.code;
    for(const key of ['at','startedAt'])if(typeof value[key]==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value[key]))safe[key]=value[key];
    for(const key of ['modelHash','profileHash','inputHash'])if(typeof value[key]==='string'&&/^[a-zA-Z0-9:_-]{1,100}$/.test(value[key]))safe[key]=value[key];
    if(['string','object','array','null','undefined','number','boolean'].includes(value.responseKind))safe.responseKind=value.responseKind;
    if(['stop','length','max_tokens','content_filter','tool_calls','end_turn','unknown'].includes(value.finishReason))safe.finishReason=value.finishReason;
    if(['running','succeeded','partial','fallback','failed','cancelled','deferred'].includes(value.status))safe.status=value.status;
    for(const key of ['persisted','responseReceived','windowPartial','continuityIncluded'])if(typeof value[key]==='boolean')safe[key]=value[key];
    if(['ready','balanced','insufficient_history','not_returned','invalid_evidence','save_failed','model_unavailable'].includes(value.repetitionStatus))safe.repetitionStatus=value.repetitionStatus;
    if(Array.isArray(value.sourceIndices))safe.sourceIndices=value.sourceIndices.filter(index=>Number.isSafeInteger(index)&&index>=0).slice(0,64);
    if(value.sectionCounts&&typeof value.sectionCounts==='object')safe.sectionCounts=Object.fromEntries(['new_items','affected','knowledge_updates','possible_followups'].filter(key=>Number.isSafeInteger(value.sectionCounts[key])&&value.sectionCounts[key]>=0).map(key=>[key,value.sectionCounts[key]]));
    if(Array.isArray(value.rejections))safe.rejections=value.rejections.slice(0,64).filter(item=>['new_item','affected','knowledge','followup','section'].includes(item?.type)&&Number.isSafeInteger(item.index)&&item.index>=0&&/^(invalidShapeCount|invalidEvidenceTypeCount|invalidEvidenceCount|invalidStateCount|invalidLifecycleCount|invalidActorCount)$/.test(item.reason)).map(({type,index,reason,field})=>({type,index,reason,...(fields.has(field)?{field}:{})}));
    return safe;
}
export function analysisFailure(error,phase='prepare',details={}) {
    return safeAnalysisInfo({...details,...error?.diagnostic,phase:error?.diagnostic?.phase||phase,
        module:error?.diagnostic?.module||(phase==='storage'?'src/storage/session-transaction.js':phase==='items'?'src/continuity/response.js':'src/continuity/auxiliary-runtime.js'),
        code:typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)?error.code:'ANALYSIS_FAILED',httpStatus:Number(error?.httpStatus||error?.status||error?.cause?.status||error?.diagnostic?.httpStatus)||0,at:new Date().toISOString()});
}
export function recordAnalysisDiagnostic(record,attempt,failure=null) {
    const previous=record.continuityDiagnosticsV1||{};
    const entry={...safeAnalysisInfo(attempt),...(failure?{failure:safeAnalysisInfo(failure)}:{})};
    const history=Array.isArray(previous.history)?previous.history:[];
    record.continuityDiagnosticsV1={attempt:entry,lastFailure:failure?safeAnalysisInfo(failure):previous.lastFailure?safeAnalysisInfo(previous.lastFailure):null,
        history:[...history.slice(-5).map(item=>({...safeAnalysisInfo(item),...(item?.failure?{failure:safeAnalysisInfo(item.failure)}:{})})),entry]};
}
export function analysisDiagnosticReport(record) {
    const saved=record?.continuityDiagnosticsV1;
    if(!saved)return null;
    const project=entry=>({...safeAnalysisInfo(entry),...(entry?.failure?{failure:safeAnalysisInfo(entry.failure)}:{})});
    return {attempt:project(saved.attempt),lastFailure:saved.lastFailure?safeAnalysisInfo(saved.lastFailure):null,history:(Array.isArray(saved.history)?saved.history:[]).slice(-6).map(project)};
}
export function analysisFailureTitle(failure) {
    return ({request:'모델 요청 실패',response:'모델 응답 해석 실패',items:'연속성 항목 처리 실패',storage:'연속성 저장 실패',prepare:'연속성 준비 실패',vault:'추가 자료 처리 실패',cleanup:'분석 후 정리 실패'})[failure?.phase]||'이전 실패 · 원인 기록 없음';
}
export function analysisFailureReason(failure) {
    const code=failure?.code||'';
    const reasons={PROFILE_UNAVAILABLE:'선택한 연결 프로필을 읽거나 사용할 수 없습니다.',PROFILE_TIMEOUT:'모델 응답 대기 시간이 초과됐습니다.',PROFILE_NETWORK_ERROR:'모델 요청 중 네트워크 오류가 발생했습니다.',PROFILE_REQUEST_FAILED:'모델 요청이 실패했지만 호스트에서 구체적인 원인을 제공하지 않았습니다.',PROFILE_AUTH_FAILED:'모델 요청의 키 인증이 거절됐습니다.',PROFILE_FORBIDDEN:'모델 요청 권한이 거절됐습니다.',PROFILE_RATE_LIMIT:'모델 요청 한도를 초과했습니다.',PROFILE_BILLING:'모델 사용·결제 한도에 걸렸습니다.',PROFILE_NOT_FOUND:'요청한 모델 또는 연결 주소를 찾지 못했습니다.',PROFILE_SERVER_ERROR:'모델 서버가 오류를 반환했습니다.',PROFILE_REQUEST_REJECTED:'모델 서버가 요청을 거절했습니다.',PROFILE_REQUEST_TOO_LARGE:'요청 크기가 모델 서버의 한도를 초과했습니다.',PROFILE_EMPTY_RESPONSE:'모델 응답이 비어 있습니다.',PROFILE_TRUNCATED_RESPONSE:'모델 응답이 출력 한도에서 잘렸습니다.',PROFILE_UNFINISHED_JSON:'응답의 JSON이 끝나지 않았습니다. 출력 한도 초과 여부는 확인되지 않았습니다.',PROFILE_MULTIPLE_JSON:'응답에 JSON 결과가 여러 개 있어 사용할 결과를 정하지 못했습니다.',PROFILE_JSON_NOT_FOUND:'응답에서 JSON 결과를 찾지 못했습니다.',PROFILE_INVALID_JSON:'응답의 JSON 문법을 읽지 못했습니다.',PROFILE_RESPONSE_NOT_OBJECT:'응답이 필요한 JSON 객체 형식이 아닙니다.',PROFILE_INVALID_RESPONSE:'응답이 필요한 형식과 다릅니다.',CONTINUITY_SECTIONS_MISSING:'응답은 읽었지만 연속성 결과 배열이 없습니다.',CONTINUITY_PARTIAL_RESULT:'일부 연속성 항목을 처리하지 못했습니다. 아래 제외 사유를 확인하세요.'};
    const reason=reasons[code]||(failure?.phase==='storage'?'분석 결과를 저장하지 못했습니다.':failure?.phase==='items'?'응답을 연속성 기록으로 처리하는 중 오류가 발생했습니다.':'확장 처리 중 오류가 발생했습니다. 전체 로그의 실패 단계를 확인하세요.');
    return reason+(failure?.httpStatus?` HTTP ${failure.httpStatus}.`:'');
}
