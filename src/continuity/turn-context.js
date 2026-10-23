import {confirmedContinuity,selectActiveContinuity} from './selection.js';
import {compactContext,compactValues} from './compact-context.js';
// Existing learned knowledge remains independent of the new optional collector.
export function selectTurnContinuity(state,options,{enabled=true,transcript='',actorIds=[]}={}){
    const visible=confirmedContinuity({knowledge:state?.knowledge||[]},options);
    const knowledge=selectActiveContinuity({...visible,items:[],dependencies:[],followups:[],references:[]},transcript,{actorIds}).knowledge;
    return {items:[],knowledge,dependencies:[],followups:[],references:[],context:enabled?compactContext({continuity:state},options):null};
}
export function turnContinuityInput(state){return compactValues(state?.context);}
