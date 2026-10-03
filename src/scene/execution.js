import {createPipeline} from '../hub/pipeline.js';
import {createSourceRevision} from '../context/source-revision.js';
import {createInjectionVerification} from '../injection/verification.js';
import {createContinuityRuntime} from '../continuity/runtime.js';
import {createDecisionVerification} from '../decision/verification.js';
import {createContextStage} from '../context/prepare.js';
import {createGateStage} from './gate-stage.js';
import {createDecisionPreparation} from '../decision/prepare.js';
import {createDecisionRequest} from '../decision/request.js';
import {createDecisionResolution} from '../decision/resolve.js';
import {createInjectionPreparation} from '../injection/prepare.js';
import {createJudgmentCommit} from '../storage/judgment.js';
import {selectCapabilities} from '../shared/capabilities.js';

export function createSceneExecution(deps) {
 const services=Object.create(deps);
 services.appearanceOffers=new Map();
const {sourceRevisionKey,stagedRecord}=createSourceRevision(selectCapabilities(services,["characterStore","getContext","linkedCharacterBooks","lorebookRevisions","settings","stableFingerprint","worldInfoModule"]));
const {verifyAppliedJudgment}=createInjectionVerification(selectCapabilities(services,["activeInjectionPayload","noteDiagnostic","record","storagePost","storageVersion"]));
const {sourceIdentityForPending,pendingExternalCandidates,sourceUserRpForOutput,postVerifiedCharacterOutput,commitContinuityCandidates}=createContinuityRuntime(selectCapabilities(services,["REASONER_SYSTEM","activePendingCandidates","applyContinuityVerdicts","assignContinuity","connectionRequestService","continuityView","getContext","judgeCompletionPromise","judgeInFlight","loadStateHistory","normalizeContinuity","persistChat","reasonerGeneration","reasonerJobs","record","renderAll","requestWithConnectionProfile","saveStateHistory","selectedWorld","settings","sourceRevisionKey","splitOocText","stableFingerprint","stateChatKey","validateReasonerResult"]));
const {registerSceneOpportunity,commitPriorVerification}=createDecisionVerification(selectCapabilities(services,["commitVerifiedPlan","loadStateHistory","postVerifiedCharacterOutput","reversibleStateSnapshot","saveStateHistory","stateChatKey","updateProgressionPressure","verificationSummary"]));
const {prepareContext}=createContextStage(selectCapabilities(services,["StaleRunError","applyStoredInjection","clearInjection","currentInputKey","getContext","handleOocOnlySkip","judgeCompletionPromise","judgeInFlight","loadStateHistory","mergeMemory","readCharacterLorebooks","readCharm","reasonerJobs","recentContext","record","selectedWorld","settings","showActivity","sourceRevisionKey","stableFingerprint","stagedRecord","stateChatKey","updateActivity","updateStatus","verifyAppliedJudgment","waitForOutputChanges","waitForProfileState","window","worldInfoModule"]));
const {prepareGate}=createGateStage(selectCapabilities(services,["JEV_MODEL","STATE_HISTORY_LIMIT","StaleRunError","addCharacterNeedsQuestions","applyStoredInjection","buildPausedInjection","callJev","characterStore","chatRecords","currentInputKey","document","getContext","judgeCompletionPromise","judgeInFlight","lastDebugFrame","latestStateForChat","memoryStatusText","noteDiagnostic","ownerPrompt","persistChat","queueWrite","recentContext","record","renderAll","resolveJudgeCompletion","selectActiveEntries","selectedWorld","setBusy","sourceRevisionKey","stableFingerprint","storagePost","storageVersion","updateActivity","updateStatus","vectorRetrieval","verifyAppliedJudgment","window"]));
const {prepareQuestions}=createDecisionPreparation(selectCapabilities(services,["pendingGenerationType","noteDiagnostic","CHARACTER_LIVE_SYSTEM","appearanceOffers","buildCharacterTurnQuestions","buildLiveCharacterPlan","buildPendingCandidateQuestions","buildQuestions","buildVerificationQuestions","characterCategoryHints","characterStore","continuityView","getContext","isFranchiseWorld","judgeCompletionPromise","judgeInFlight","pendingExternalCandidates","resolveJudgeCompletion","selectActiveEntries","selectContinuityContext","setBusy","settings","stableFingerprint","updateActivity","updateStatus","vectorRetrieval"]));
const {requestDecision}=createDecisionRequest(selectCapabilities(services,["JEV_MODEL","StaleRunError","callJev","characterStore","currentInputKey","lastDebugFrame","noteDiagnostic","recentContext","record","selectedWorld","settings","sourceRevisionKey","sourceUserRpForOutput","updateActivity","updateStatus"]));
const {resolveDecision}=createDecisionResolution(selectCapabilities(services,["noteDiagnostic","actionPlanSummary","applyCharacterPolicy","applyPolicy","applyRecordRelevance","commitContinuityCandidates","commitObservedState","commitPriorVerification","coordinateActionBudget","coordinateDecisions","deriveDependentDecisions","effectiveMap","nextDeferredRoutes","overrideDecision","prepareProfiles","registerSceneOpportunity","reversibleStateSnapshot","selectActionPlan","stagedRecord","verifiedSecondaryCandidates"]));
const {prepareInjection}=createInjectionPreparation(selectCapabilities(services,["noteDiagnostic","JEV_MODEL","actionPlanSummary","buildCharacterInjection","buildContinuityInjection","buildInjection","characterStore","continuityView","fixedDecision","getContext","isVisibleRoleplayMessage","ownerPrompt","pendingPlanEffects","resolveLiveCharacterPlan","reversibleStateSnapshot","selectContinuityContext","settings","stableFingerprint"]));
const {commitJudgment}=createJudgmentCommit(selectCapabilities(services,["STATE_HISTORY_LIMIT","StaleRunError","applyStoredInjection","chatRecords","noteDiagnostic","persistChat","postVerifiedCharacterOutput","queueWrite","renderAll","saveStateHistory","stateHistoryCache","storagePost","storageVersion","updateActivity","updateStatus","verifyAppliedJudgment","window"]));
 Object.assign(services,{sourceRevisionKey,stagedRecord,verifyAppliedJudgment,sourceIdentityForPending,pendingExternalCandidates,sourceUserRpForOutput,postVerifiedCharacterOutput,registerSceneOpportunity,commitPriorVerification,commitContinuityCandidates});
function releaseBusy(run) {
 for(const resolve of [run.resolveGate,run.resolveDecision].filter(Boolean)) {
  resolve();
  if(deps.resolveJudgeCompletion===resolve){deps.judgeInFlight=false;deps.resolveJudgeCompletion=null;deps.setBusy(false);}
 }
}
async function runJudge(options={}) {
 const inputKey=deps.currentInputKey(options.pendingUserText||'',options.cycleSalt||'');
 const key=deps.stableFingerprint({chatKey:deps.stateChatKey(),inputKey,force:Boolean(options.force)});
 return deps.hub.run({key,inputKey,trigger:options.trigger||'manual'},async run=>{
  run.controller.signal.addEventListener('abort',()=>releaseBusy(run),{once:true});
  deps.noteDiagnostic?.('judge_started',{runKey:key,inputKey,force:Boolean(options.force)});
  try {const result=await executeJudge(run,options);if(run.timeout)throw run.timeout;deps.noteDiagnostic?.(result?'judge_finished':'judge_skipped',{runKey:key,inputKey});return result;}
  catch(error){if(!run.owns()||(!run.timeout&&(error instanceof deps.StaleRunError||!run.valid()))){deps.noteDiagnostic?.('judge_cancelled',{runKey:key,inputKey});return null;}deps.noteDiagnostic?.('judge_failed',{runKey:key,inputKey,error:String(error.message||error)});if(!error.activityReported){await deps.clearInjection({chatKey:run.identity,owns:run.owns});if(!run.owns())return null;deps.updateActivity('판독 실패 · '+error.message,{error:true});error.activityReported=true;}throw run.timeout||error;}
 });
}
const executeJudge=createPipeline({stages:[{stage:'context',module:'src/context/prepare.js',timeoutMs:90000,execute:prepareContext},
{stage:'scene',module:'src/scene/gate-stage.js',timeoutMs:180000,execute:prepareGate},
{stage:'retrieval',module:'src/decision/prepare.js',timeoutMs:75000,execute:prepareQuestions},
{stage:'decision',module:'src/decision/request.js',timeoutMs:35000,execute:requestDecision},
{stage:'policy',module:'src/decision/resolve.js',timeoutMs:0,execute:resolveDecision},
{stage:'injection.assemble',module:'src/injection/prepare.js',timeoutMs:0,execute:prepareInjection},
{stage:'storage.inject',module:'src/storage/judgment.js',timeoutMs:55000,execute:commitJudgment}],
 onError:async(error,run)=>{if(!run.owns()||(!run.timeout&&(error instanceof deps.StaleRunError||!run.valid())))return null;await deps.clearInjection({chatKey:run.identity,owns:run.owns});if(!run.owns())return null;deps.updateStatus(error.message);deps.updateActivity('판독·저장 실패 · 이번 주입을 건너뜁니다. '+error.message,{error:true});error.activityReported=true;throw run.timeout||error;},
 finalize:releaseBusy
});
return {sourceRevisionKey,stagedRecord,sourceIdentityForPending,pendingExternalCandidates,sourceUserRpForOutput,postVerifiedCharacterOutput,registerSceneOpportunity,commitPriorVerification,commitContinuityCandidates,runJudge,executeJudge};
}
