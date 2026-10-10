// Expression proposals are not assertions that facts or durable changes occurred.
const minorChoices={
 basic_move:['dialogue','emotion','movement','action','choice','consequence'],
 primary_focus:['direct','event','relationship','conflict','npc','transition'],
 relationship_pacing:['closer_incremental','distant_incremental'],
 relationship_beat:['avoidance','rejection','inner_outer_gap','repair'],
 event_route:['continue'],advanced_route:['continue'],npc_route:['reuse'],villain_route:['continue'],
 response_cadence:['natural','compress','linger'],
};
export function minorRoutingChoice(key,selected,allowed){
 return allowed.includes(selected)&&minorChoices[key]?.includes(selected)===true;
}
