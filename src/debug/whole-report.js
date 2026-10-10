import {latestStateEventForChat} from '../character/state-contract.js';
import {safeOpportunityPlan, safeOpportunityVerification} from './opportunity-events.js';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const symbol = value => typeof value === 'string' && /^[a-z0-9_]{1,80}$/.test(value) ? value : null;
// Copy diagnostic structure, never names, file contents, explanations or model prose.
export function wholeDiagnosticReport({execution,judgment,record,chat,fingerprint}) {
    const details=Object.entries(judgment?.details || {}).filter(([key])=>symbol(key));
    const event=Array.isArray(chat)?latestStateEventForChat(record,chat,fingerprint):null;
    const capture=event?.capture || (Array.isArray(chat)?null:record?.characterStateCapture);
    const fields=['a','c','anger','joy','fear','sadness'];
    return {...execution,opportunities:safeOpportunityPlan(judgment?.opportunityPlan),opportunityVerification:safeOpportunityVerification(record?.lastOpportunityVerification),status:judgment?'judgment_available':'no_judgment',
        judgedAt:judgment?.judgedAt || null,
        sharedStorage:record?.sharedSource?{linked:true,active:record.sharedSource.active===true,baselineRevision:number(record.sharedSource.baselineRevision),epoch:number(record.sharedSource.epoch),hasContinuationReference:Boolean(record.sharedReference)}:{linked:false},
        scene:judgment?.sceneIntimacy ? {route:symbol(judgment.sceneIntimacy.route),level:number(judgment.sceneIntimacy.level),phase:symbol(judgment.sceneIntimacy.phase),confirmation:symbol(judgment.sceneIntimacy.confirmation),hasError:Boolean(judgment.sceneIntimacy.error)} : null,
        jevOriginalChoices:Object.fromEntries(details.map(([key])=>{const answer=judgment.rawChoices?.[key] || {};return [key,{choice:symbol(answer.choice),noul:number(answer.noul),confidence:number(answer.confidence)}];})),
        decisions:Object.fromEntries(details.map(([key,value])=>[key,{original:symbol(value.selected),confidence:number(value.certainty),final:symbol(value.effective),policyFinal:symbol(value.policyEffective),threshold:number(value.threshold),fallbackApplied:Boolean(value.fallbackApplied),...(key.endsWith('_presence')?{uncertain:Boolean(value.presenceUncertain),evidence:symbol(value.participationEvidence),resolution:symbol(value.presenceResolution)}:{})}])),
        characters:(judgment?.characterTrace || []).map((person,index)=>({index,kind:symbol(person.kind),presence:symbol(person.presence),storedRecordCount:number(person.storedRecordCount),candidateCount:number(person.candidateCount),appliedCount:person.injectedRuleIds?.length || 0,omittedCount:person.omittedRuleIds?.length || 0})),
        injection:{sceneChars:judgment?.payload?.length || 0,worldChars:judgment?.worldPayload?.length || 0,delivery:'see_injection_consume_events'},
        auxiliary:{status:symbol(record?.lastContinuityTrace?.status),pendingCount:record?.pendingContinuityCandidates?.length||0,retryPending:(record?.auxiliaryStateV1?.retryAfter||0)>Date.now()},
        visibility:{status:symbol(record?.visibilityStateV1?.status)},
        characterStateCapture:capture?{status:symbol(capture.status),source:({'profile-output':'profile_output','main-output':'main_output'})[capture.source] || symbol(capture.source),skipReason:symbol(capture.skipReason),outputIndex:number(capture.outputIndex),count:number(capture.count),participantCount:capture.participantIds?.length || 0,
            receivedCount:capture.diagnostics?.received || 0,acceptedCount:capture.diagnostics?.accepted || 0,
            actors:(capture.participantIds || []).map((id,index)=>{
                const state=event?.states?.find(person=>person.id===id);
                const actor=capture.diagnostics?.actors?.filter(item=>item.rosterIndex===index) || [];
                return {index,accepted:actor.some(item=>item.accepted),returnedFields:fields.filter(field=>Number.isInteger(state?.values?.[field])),zeroFields:fields.filter(field=>state?.values?.[field]===0),coverageVersion:state?.coverageVersion || 0,reasons:[...new Set(actor.flatMap(item=>item.reasons || []))].map(symbol).filter(Boolean)};
            })}:null,
    };
}
