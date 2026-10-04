import {commitGeneratedActor} from './generated-cast.js';
import {rememberOpportunity} from './opportunities.js';
import {additionVerdicts} from './opportunity-policy.js';

export function commitOpportunityState(rec,pending,decisions) {
    const outcomes=additionVerdicts(pending,decisions);
    for(const item of outcomes) {
        if(item.feature==='event'&&item.scope==='central'&&['fulfilled','partial'].includes(item.verification)&&item.profile&&!rec.eventProfile) {
            rec.eventProfile={...structuredClone(item.profile),status:'active'};
            rec.pacingState.event={qualifiedSteps:0,evidence:[]};
        }
        if(item.feature==='person'&&item.verification==='fulfilled'&&item.profile)commitGeneratedActor(rec,item.kind==='villain'?'villain':'npc',{...item.profile,status:'active',sourceOutputIndex:pending.outputIndex??null,sourceOutputFingerprint:pending.outputFingerprint||''});
        rememberOpportunity(rec,item,item.verification);
    }
    rec.lastOpportunityVerification=outcomes.map(({id,feature,templateId,verification})=>({id,feature,templateId,verification}));
    if(rec.lastJudgment?.opportunityPlan && rec.lastJudgment.opportunityPlan.key===pending?.opportunityKey) {
        rec.lastJudgment.opportunityPlan.verification=structuredClone(rec.lastOpportunityVerification);
    }
    return rec.lastOpportunityVerification;
}
