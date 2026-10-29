import {STATE_MOODS,stateForEntry} from './state-contract.js';

const labels={a:'sexual arousal',c:'self-control',...Object.fromEntries(STATE_MOODS.map(field=>[field,field]))};
const guidance='Observed feelings from the previous completed reply, not fixed current reactions. Let the new input change them naturally. Interpret them with each person\'s records and the active relationship, behavior and progression instructions. Intensity does not dictate outward expression, action, consent or relationship change; existing physical-conduct settings still apply.';

// Observations are delivered independently of record selection and its length budget.
// No model permission, ranking, invented defaults or expression commands.
export function buildCharacterStateInjection(people=[]) {
    const lines=[],traces=[];
    for(const person of people){
        const state=person.presence==='active'?stateForEntry(person.priorState,person):null;
        const fields=Object.keys(labels).filter(field=>Object.hasOwn(state?.values||{},field));
        traces.push({id:person.id,index:person.index,fields,status:fields.length?'prepared':person.presence==='active'?'no_state':'inactive'});
        if(fields.length)lines.push(`${person.name}: ${fields.map(field=>`${labels[field]} ${state.values[field]}%${state.targets?.[field]?` toward ${state.targets[field]}`:''}`).join(', ')}.`);
    }
    const text=lines.length?`<CHARACTER_STATE_REFERENCE>\n${guidance}\n${lines.join('\n')}\n</CHARACTER_STATE_REFERENCE>`:'';
    return {text,traces,charCount:text.length};
}
