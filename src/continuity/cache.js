import {compactValues,CONTEXT_FIELDS} from './compact-context.js';
export function continuityCacheKey(record,settings,fingerprint) {
 const context=record.continuity?.context;
 return fingerprint({contract:6,enabled:Boolean(settings.continuityEnabled),revision:settings.continuityEnabled?record.continuity?.revision||0:0,
  context:settings.continuityEnabled?{...compactValues(context),sourceKey:context?.sourceKey||'',fieldStatus:CONTEXT_FIELDS.map(field=>context?.fieldStatus?.[field]||'')}:null});
}
export function continuityCacheMatches(record,settings,fingerprint) {
 // A cache created before the RP/context contract changed must be rebuilt.
 if(record.lastJudgment?.continuityCacheKey===undefined)return false;
 return record.lastJudgment?.continuityCacheKey===continuityCacheKey(record,settings,fingerprint);
}
