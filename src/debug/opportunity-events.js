const REASONS=new Set(['generation_disabled','disabled','existing_event','element_missing','chance_failed','draw_passed','selected','blocked_access','blocked_world','blocked_user_constraint','blocked_prerequisite','invalid_selection','prepared','request_included','request_missing','request_unobservable','awaiting_output','awaiting_verification','fulfilled','partial','missed','not_applicable','cancelled','stale','assembly_failed']);
export function opportunitySummary(offers,additions=[]) {
    return {schemaVersion:1,key:offers.key,enabled:offers.config.enabled,
        ...Object.fromEntries(['event','person'].map(feature=>{const item=offers[feature];return [feature,{status:item.status,reasonCode:REASONS.has(item.reasonCode)?item.reasonCode:'invalid_selection',chance:item.chance,roll:item.roll,kind:item.kind||'event',scope:item.scope||'person',spontaneous:item.spontaneous,candidateCount:item.candidates.length,reusedDraw:Boolean(item.reusedDraw),templateId:additions.find(x=>x.feature===feature)?.templateId||null}];})),
        additions:additions.map(({id,feature,templateId,delivery,verification})=>({id,feature,templateId,delivery,verification}))};
}
export function reportOpportunities(note,summary) {
    for(const feature of ['event','person']) {
        const item=summary[feature];
        note?.('opportunity',{module:'src/scene/opportunity-policy.js',feature,reasonCode:item.reasonCode,chance:item.chance,roll:item.roll,templateId:item.templateId,reusedDraw:item.reusedDraw,
            status:item.status==='failed'?'degraded':'info'});
    }
}
// Saved backups may contain older or user-edited structures. Copy a strict
// diagnostic projection instead of ever forwarding candidate/profile content.
const numeric=value=>Number.isFinite(value)?value:null;
const template=value=>typeof value==='string'&&/^(?:[EP]\d{2}|A_[a-z]+_\d{2})$/.test(value)?value:null;
const reason=value=>REASONS.has(value)?value:null;
export function safeOpportunityVerification(value) {
    return (Array.isArray(value)?value:[]).slice(0,2).map(x=>({feature:['event','person'].includes(x.feature)?x.feature:null,templateId:template(x.templateId),verification:reason(x.verification)}));
}
export function safeOpportunityPlan(plan) {
    if(!plan)return null;
    const feature=item=>item?{status:['skipped','offered','blocked','failed','selected'].includes(item.status)?item.status:null,reasonCode:reason(item.reasonCode),chance:numeric(item.chance),roll:numeric(item.roll),kind:['event','npc','villain'].includes(item.kind)?item.kind:null,scope:['local','central','person'].includes(item.scope)?item.scope:null,spontaneous:Boolean(item.spontaneous),candidateCount:numeric(item.candidateCount),reusedDraw:Boolean(item.reusedDraw),templateId:template(item.templateId)}:null;
    return {schemaVersion:1,enabled:Boolean(plan.enabled),event:feature(plan.event),person:feature(plan.person),
        additions:(Array.isArray(plan.additions)?plan.additions:[]).slice(0,2).map(x=>({feature:['event','person'].includes(x.feature)?x.feature:null,templateId:template(x.templateId),delivery:reason(x.delivery),verification:reason(x.verification)})),verification:safeOpportunityVerification(plan.verification)};
}
