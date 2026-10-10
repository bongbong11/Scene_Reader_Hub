export function continuityCacheKey(record,settings,fingerprint) {
 return settings.continuityEnabled?fingerprint({revision:record.continuity?.revision||0,evolutionRevision:record.characterEvolutionV1?.revision||0,
  deltaCandidates:(record.analysisRuntimeV1?.pendingBatches||[]).flatMap(b=>b.candidates||[]).filter(c=>c.status==='pending').map(c=>c.id),
  candidates:(record.pendingContinuityCandidates||[]).map(c=>c.id),...(record.repetitionGuard?{repetition:record.repetitionGuard}:{})}):'';
}
export function continuityCacheMatches(record,settings,fingerprint) {
 // Older snapshots without additive state keep their established behavior.
 if(!record.analysisRuntimeV1&&!record.characterEvolutionV1)return true;
 return record.lastJudgment?.continuityCacheKey===continuityCacheKey(record,settings,fingerprint);
}
