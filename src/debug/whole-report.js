const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const symbol = value => typeof value === 'string' && /^[a-z0-9_]{1,80}$/.test(value) ? value : null;
// Copy diagnostic structure, never names, file contents, explanations or model prose.
export function wholeDiagnosticReport({execution,judgment}) {
    const details=Object.entries(judgment?.details || {}).filter(([key])=>symbol(key));
    return {...execution,status:judgment?'judgment_available':'no_judgment',
        judgedAt:judgment?.judgedAt || null,
        scene:judgment?.sceneIntimacy ? {route:symbol(judgment.sceneIntimacy.route),level:number(judgment.sceneIntimacy.level),phase:symbol(judgment.sceneIntimacy.phase),confirmation:symbol(judgment.sceneIntimacy.confirmation),hasError:Boolean(judgment.sceneIntimacy.error)} : null,
        jevOriginalChoices:Object.fromEntries(details.map(([key])=>{const answer=judgment.rawChoices?.[key] || {};return [key,{choice:symbol(answer.choice),noul:number(answer.noul),confidence:number(answer.confidence)}];})),
        decisions:Object.fromEntries(details.map(([key,value])=>[key,{original:symbol(value.selected),confidence:number(value.certainty),final:symbol(value.effective),policyFinal:symbol(value.policyEffective),threshold:number(value.threshold),fallbackApplied:Boolean(value.fallbackApplied)}])),
        characters:(judgment?.characterTrace || []).map((person,index)=>({index,kind:symbol(person.kind),presence:symbol(person.presence),storedRecordCount:number(person.storedRecordCount),candidateCount:number(person.candidateCount),appliedCount:person.injectedRuleIds?.length || 0,omittedCount:person.omittedRuleIds?.length || 0})),
        injection:{sceneChars:judgment?.payload?.length || 0,worldChars:judgment?.worldPayload?.length || 0,delivery:'see_injection_consume_events'},
    };
}
