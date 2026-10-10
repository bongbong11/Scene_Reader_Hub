export function continuityCacheKey(record,settings,fingerprint) {
 return settings.continuityEnabled?fingerprint({revision:record.continuity?.revision||0,
  candidates:(record.pendingContinuityCandidates||[]).map(c=>c.id),...(record.repetitionGuard?{repetition:record.repetitionGuard}:{})}):'';
}
export function continuityCacheMatches(record,settings,fingerprint) {
 // Older snapshots without additive state keep their established behavior.
 if(record.lastJudgment?.continuityCacheKey===undefined)return true;
 return record.lastJudgment?.continuityCacheKey===continuityCacheKey(record,settings,fingerprint);
}
