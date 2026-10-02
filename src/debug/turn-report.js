// Report classification and filtering without changing saved judgment or policy.
export function buildTurnReport({judgment,tab='flow',related=()=>true}) {
    const scene=judgment.sceneIntimacy;
    const paused=scene?.route==='paused';
    const mode=paused?(scene.error?'scene_pause_retained_after_error':'scene_paused')
        :scene?'normal_judgment':'unknown_legacy';
    const decisions=Object.fromEntries(Object.entries(judgment.details||{}).filter(([key])=>related(key)).map(([key,value])=>[key,{
        original:value.selected,confidence:value.certainty,final:value.effective,
        reason:value.rule||(value.fallbackApplied?`확신도 ${value.certainty}가 적용 기준 ${value.threshold}보다 낮아 기본값 적용`:''),
        threshold:value.threshold,policyFinal:value.policyEffective,fallbackApplied:value.fallbackApplied,
    }]));
    return {tab,judgedAt:judgment.judgedAt,model:judgment.model,mode,
        generalJudgment:paused?'skipped_for_scene':scene?'completed':'unknown',
        sceneIntimacy:scene,
        jevDiagnostics:judgment.jevDiagnostics,
        jevOriginalChoices:Object.fromEntries(Object.entries(judgment.rawChoices||{}).filter(([key])=>related(key))),
        decisions,drawDiagnostics:judgment.drawDiagnostics,actionPlan:judgment.actionPlan,rolls:judgment.rolls,
        verification:judgment.priorVerification,correctionSelection:judgment.correctionSelection,
        injection:{sceneChars:String(judgment.payload||'').length,worldChars:String(judgment.worldPayload||'').length,
            delivery:'not_verified_by_this_report'},
    };
}
