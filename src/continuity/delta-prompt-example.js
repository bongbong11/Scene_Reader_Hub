// Synthetic protocol example, also validated by the contract tests.
export const DELTA_EXAMPLE_INPUT={
 actors:[{id:'a',name:'Mira',kind:'character'},{id:'b',name:'Sol',kind:'persona'}],persona_enabled:false,
 baseline_records:[{ref:'b0',actorId:'a',record:{type:'relationship',target:'Sol',rule:'Mira distrusts Sol with all shared tasks and keeps personal distance.'}},{ref:'b1',actorId:'a',record:{type:'personality',target:'',rule:'Mira prefers quiet places.'}}],
 source_segments:[{ref:'r0',text:'Mira now trusts Sol with routine tasks, but still keeps personal distance.'}]
};
export const DELTA_EXAMPLE_OUTPUT={protocol:1,coverage:{memory:'complete',characters:'complete',persona:'not_requested'},
 record_reviews:[{base_ref:'b0',status:'change',reason_ko:'일상 업무에서만 신뢰가 달라짐'},{base_ref:'b1',status:'keep',reason_ko:'장소 취향의 변화 근거 없음'}],
 character_changes:[{actor_id:'a',target_ids:['b'],base_ref:'b0',existing_change_id:null,op:'exception',record_type:'relationship',compact_rule:'Mira trusts Sol with routine tasks but keeps personal distance.',state_summary:null,source_type:'world_fact',epistemic:'established',evidence:[{ref:'r0',quote:'Mira now trusts Sol with routine tasks, but still keeps personal distance.'}],original_ko:'미라는 모든 공동 업무에서 솔을 불신하고 개인적인 거리를 유지한다.',replacement_ko:'미라는 일상 업무에서 솔을 신뢰하되 개인적인 거리는 유지한다.',reason_ko:'업무 신뢰만 변했고 개인적인 거리는 그대로다.'}],
 deferred_changes:[],memory_changes:[],knowledge_changes:[],topic_fixation:null
};
export const DELTA_WORKED_EXAMPLE='FORMAT EXAMPLE ONLY: these names/IDs/facts are not your task data. Use the actual next-message input instead. Input: '+JSON.stringify(DELTA_EXAMPLE_INPUT)+'\nValid complete output: '+JSON.stringify(DELTA_EXAMPLE_OUTPUT);
