const TACTICS=['argument','sarcasm','manipulation','exploitation','seduction','threat','physical','obstruction','withdrawal','character_driven'];
export function conflictTacticQuestion() {
    return {type:'choice',instructions:'For the NPC selected to act, if they are an established antagonist or currently opposed, deceptive, exploitative or harassing, classify the outward tactic matching their personality, objective and means. This selects how, not permission to act. Ordinary helpers and witnesses retain their own roles. Do not invent attraction, aggression, access or knowledge. If no specific tactic fits, retain their established objective through character_driven.',criteria:Object.fromEntries(TACTICS.map(key=>[key,key.replaceAll('_',' ')]))};
}
