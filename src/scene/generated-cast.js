import {stableFingerprint} from '../decision/policy.js';

const same=(a,b)=>a&&b&&(a.id&&b.id?a.id===b.id:stableFingerprint(a)===stableFingerprint(b));

export function preserveGeneratedActor(rec,kind,profile) {
    if(!profile)return;
    rec.generatedCast=Array.isArray(rec.generatedCast)?rec.generatedCast:[];
    const prior=rec.generatedCast.findIndex(item=>item?.kind===kind&&same(item.profile,profile));
    const saved={kind,profile:structuredClone(profile)};
    if(prior>=0)rec.generatedCast.splice(prior,1);
    rec.generatedCast.unshift(saved);
}

export function commitGeneratedActor(rec,kind,profile) {
    const key=kind==='villain'?'villainProfile':'npcProfile';
    const previous=rec[key];
    if(previous&&!same(previous,profile))preserveGeneratedActor(rec,kind,previous);
    rec[key]=profile?{...structuredClone(profile),status:'active'}:null;
}

export function generatedActorCandidates(rec,kind) {
    const current=kind==='villain'?rec.villainProfile:rec.npcProfile;
    return (Array.isArray(rec.generatedCast)?rec.generatedCast:[])
        .filter(item=>item?.kind===kind&&item.profile&&!same(current,item.profile)&&item.profile.status!=='retired')
        .slice(0,8).map(item=>item.profile);
}
