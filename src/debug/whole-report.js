import {latestStateEventForChat,STATE_MOODS} from '../character/state-contract.js';
import {continuityValidationCounts} from '../continuity/engine.js';
import {safeOpportunityPlan, safeOpportunityVerification} from './opportunity-events.js';
import {analysisDiagnosticReport,safeAnalysisInfo} from '../continuity/failure.js';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const symbol = value => typeof value === 'string' && /^[a-z0-9_]{1,80}$/.test(value) ? value : null;
// Copy diagnostic structure, never names, file contents, explanations or model prose.
export function wholeDiagnosticReport({execution,judgment,record,chat,fingerprint}) {
    const details=Object.entries(judgment?.details || {}).filter(([key])=>symbol(key));
    const event=Array.isArray(chat)?latestStateEventForChat(record,chat,fingerprint):null;
    const capture=event?.capture || (Array.isArray(chat)?null:record?.characterStateCapture);
    const fields=['a','c',...STATE_MOODS];
    const direction=record?.pendingPlan?.inputKey===judgment?.inputKey ? record?.pendingPlan?.storyDirection||judgment?.storyDirection : judgment?.storyDirection;
    return {...execution,opportunities:safeOpportunityPlan(judgment?.opportunityPlan),opportunityVerification:safeOpportunityVerification(record?.lastOpportunityVerification),status:judgment?'judgment_available':'no_judgment',
        judgedAt:judgment?.judgedAt || null,
        storyDirection:direction?{contract:number(direction.contract),enabledElements:(direction.enabledElements||[]).map(symbol).filter(Boolean),focus:symbol(direction.focus),actorSource:symbol(direction.actorSource),action:symbol(direction.action),origin:symbol(direction.origin),reason:symbol(direction.reason),delivery:symbol(direction.delivery),verification:symbol(direction.verification)}:null,
        storyDirectionVerification:symbol(record?.lastVerification?.storyDirection?.verification),
        sharedStorage:record?.sharedSource?{linked:true,active:record.sharedSource.active===true,baselineRevision:number(record.sharedSource.baselineRevision),epoch:number(record.sharedSource.epoch),hasContinuationReference:Boolean(record.sharedReference)}:{linked:false},
        scene:judgment?.sceneIntimacy ? {route:symbol(judgment.sceneIntimacy.route),level:number(judgment.sceneIntimacy.level),phase:symbol(judgment.sceneIntimacy.phase),confirmation:symbol(judgment.sceneIntimacy.confirmation),hasError:Boolean(judgment.sceneIntimacy.error)} : null,
        sceneDelivery:judgment?.sceneDelivery?{route:symbol(judgment.sceneDelivery.route),transition:symbol(judgment.sceneDelivery.transition),previousRoute:symbol(judgment.sceneDelivery.previousRoute),gateFailed:Boolean(judgment.sceneDelivery.gateFailed),referenceCount:number(judgment.sceneDelivery.referenceCount),characterAnalysisSkipped:judgment.sceneDelivery.characterAnalysisSkipped===true,characterMacroSkipped:judgment.sceneDelivery.characterMacroSkipped===true,fixedGuidancePrepared:judgment.sceneDelivery.fixedGuidancePrepared===true,delivery:'see_injection_consume_events'}:null,
        jevOriginalChoices:Object.fromEntries([...new Set([...details.map(([key])=>key),...Object.keys(judgment?.rawChoices||{}).filter(symbol)])].map(key=>{const answer=judgment.rawChoices?.[key] || {};return [key,{choice:symbol(answer.choice),noul:number(answer.noul),confidence:number(answer.confidence)}];})),
        decisions:Object.fromEntries(details.map(([key,value])=>[key,{original:symbol(value.selected),confidence:number(value.certainty),final:symbol(value.effective),policyFinal:symbol(value.policyEffective),threshold:number(value.threshold),fallbackApplied:Boolean(value.fallbackApplied),...(key.endsWith('_presence')?{uncertain:Boolean(value.presenceUncertain),evidence:symbol(value.participationEvidence),resolution:symbol(value.presenceResolution)}:{})}])),
        characters:(judgment?.characterTrace || []).map((person,index)=>({index,kind:symbol(person.kind),presence:symbol(person.presence),storedRecordCount:number(person.storedRecordCount),candidateCount:number(person.candidateCount),reviewStatus:symbol(person.reviewStatus),unreviewedCount:number(person.unreviewedRecordCount),retrievalStatus:symbol(person.prefilterStats?.retrievalStatus),retrievalCode:symbol(person.prefilterStats?.retrievalCode),appliedCount:person.injectedRuleIds?.length || 0,omittedCount:person.omittedRuleIds?.length || 0})),
        eventCastVerification:(record?.lastVerification?.cast||[]).slice(0,4).map(({kind,action,delivery,verification})=>({kind:symbol(kind),action:symbol(action),delivery:symbol(delivery),verification:symbol(verification)})),
        eventCast:(record?.pendingPlan?.inputKey===judgment?.inputKey?record?.pendingPlan?.cast||judgment?.cast||[]:judgment?.cast||[]).slice(0,4).map((actor,index)=>({index,kind:symbol(actor.kind),action:symbol(actor.action),reason:symbol(actor.reason),delivery:symbol(actor.delivery),verification:symbol(actor.verification),recordCount:judgment?.castRecordCounts?.find(item=>item.id===actor.actorId)?.injected||0})),
        injection:{sceneChars:judgment?.payload?.length || 0,worldChars:judgment?.worldPayload?.length || 0,delivery:'see_injection_consume_events'},
        auxiliary:{...continuityValidationCounts(record?.lastContinuityTrace),mode:symbol(record?.lastContinuityTrace?.mode),referenceCount:number(record?.lastContinuityTrace?.referenceCount),candidateCount:number(record?.lastContinuityTrace?.candidateCount),invalidCount:number(record?.lastContinuityTrace?.invalidCount),status:symbol(record?.lastContinuityTrace?.status),groupCount:number(record?.lastContinuityTrace?.groupCount),acceptedCount:number(record?.lastContinuityTrace?.acceptedCount),reusedCount:number(record?.lastContinuityTrace?.reusedCount),pendingGroupCount:record?.auxiliaryStateV1?.pending?.turns?.length||0,partial:Boolean(record?.lastContinuityTrace?.partial),pendingCount:record?.pendingContinuityCandidates?.length||0,retryPending:Boolean(record?.auxiliaryStateV1?.pending?.turns?.length)||(record?.auxiliaryStateV1?.retryAfter||0)>Date.now()},
        continuityDiagnostics:analysisDiagnosticReport(record),
        continuityFailure:record?.lastContinuityTrace?.failure?safeAnalysisInfo(record.lastContinuityTrace.failure):record?.lastContinuityTrace?.errorCode?safeAnalysisInfo({code:record.lastContinuityTrace.errorCode}):null,
        continuityPriorFailure:record?.lastContinuityTrace?.modelFailure?safeAnalysisInfo(record.lastContinuityTrace.modelFailure):null,
        continuityDiagnosticWriteFailure:record?.lastContinuityTrace?.diagnosticWriteFailure?safeAnalysisInfo(record.lastContinuityTrace.diagnosticWriteFailure):null,
        visibility:{status:symbol(record?.visibilityStateV1?.status)},
        characterStateCapture:capture?{status:symbol(capture.status),phase:symbol(capture.phase),errorKind:typeof capture.errorKind==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(capture.errorKind)?capture.errorKind:null,requestMs:number(capture.requestMs),waitMs:number(capture.waitMs),durationMs:number(capture.durationMs),source:({'profile-output':'profile_output','main-output':'main_output'})[capture.source] || symbol(capture.source),skipReason:symbol(capture.skipReason),outputIndex:number(capture.outputIndex),count:number(capture.count),participantCount:capture.participantIds?.length || 0,
            receivedCount:capture.diagnostics?.received || 0,acceptedCount:capture.diagnostics?.accepted || 0,
            actors:(capture.participantIds || []).map((id,index)=>{
                const state=event?.states?.find(person=>person.id===id);
                const actor=capture.diagnostics?.actors?.filter(item=>item.rosterIndex===index) || [];
                return {index,accepted:actor.some(item=>item.accepted),returnedFields:fields.filter(field=>Number.isInteger(state?.values?.[field])),zeroFields:fields.filter(field=>state?.values?.[field]===0),coverageVersion:state?.coverageVersion || 0,reasons:[...new Set(actor.flatMap(item=>item.reasons || []))].map(symbol).filter(Boolean)};
            })}:null,
    };
}
