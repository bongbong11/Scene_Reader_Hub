import {isVisibleRoleplayMessage, splitOocText} from '../context/messages.js';
import {selectedStateSwipe} from '../character/state-contract.js';
import {stableFingerprint} from '../decision/policy.js';

const VERSION = 2;
const OUTCOMES = new Set(['flowing','holding','stalled','unclear']);
export const PROGRESS_QUESTION = {
    type:'choice',
    instructions:"Use progress_comparison only, resolving its references in recent_roleplay. Compare the latest completed reply with the preceding exchanges, using each reply's own preceding user input, not the new input awaiting a reply. Judge changes in the exchange, information, feeling, choice, action, or consequence. Quiet development counts. Reworded feelings, atmosphere, and repeated promises or hesitation do not. Use holding for a requested pause or a necessary user decision. Do not require an incident, agreement, reconciliation, or success. Use unclear when comparison is insufficient.",
    criteria:{flowing:'The latest completed reply makes a meaningful development.',holding:'It appropriately stays with a requested moment or necessary user decision.',stalled:'It repeats, prepares or defers without a meaningful step.',unclear:'The comparison is unavailable or insufficient.'},
};

export function emptyProgress() { return {version:VERSION,turnsSinceMeaningfulProgress:0,lastOutputFingerprint:'',observations:[]}; }
function streak(observations) {
    let count=0, next=null;
    for (const entry of [...observations].reverse()) {
        if (entry.outcome!=='stalled' || next && next.previousKey!==entry.key) break;
        count++; next=entry;
    }
    return count;
}
export function normalizeProgress(value, style) {
    if(value?.version!==VERSION||style&&value.style&&style!==value.style)return emptyProgress();
    const observations=(Array.isArray(value.observations)?value.observations:[]).filter(e=>Number.isInteger(e?.index)&&e.index>=0&&Number.isInteger(e.userIndex)&&typeof e.key==='string'&&OUTCOMES.has(e.outcome)).slice(-8)
        .map(e=>({index:e.index,userIndex:e.userIndex,key:e.key,previousKey:String(e.previousKey||''),outcome:e.outcome}));
    const blockedTurn=Number.isInteger(value.blockedTurn?.index)?{index:value.blockedTurn.index,swipe:value.blockedTurn.swipe}:null;
    return {version:VERSION,style:String(value.style||''),observations,turnsSinceMeaningfulProgress:streak(observations),lastOutputFingerprint:String(value.lastOutputFingerprint||''),...(blockedTurn?{blockedTurn}:{})};
}
function rp(message) {
    if(!isVisibleRoleplayMessage(message)||message.extra?.ooc_chat)return '';
    const split=splitOocText(message.mes);
    return split.malformed?'':split.rpText;
}
function turnKey(chat,index,userIndex) {
    return `${index}:${selectedStateSwipe(chat[index])}:${stableFingerprint([chat[index]?.send_date,chat[index]?.mes,userIndex,chat[userIndex]?.mes])}`;
}

// References avoid resending text already present in the ordinary scene context.
export function progressComparison(chat=[], {excluded=[],selected=[],transcript='',blockedTurn=null,maxChars=12000}={}) {
    const omit=new Set(excluded), turns=[];
    let bytes=0;
    const source=(index,role,text)=>{
        const pos=selected.indexOf(chat[index]);
        if(pos>=0&&transcript.includes(`[${pos+1}] ${role} (`)&&transcript.includes(text))return {reference:`recent_roleplay [${pos+1}] ${role}`};
        bytes+=text.length;return {text};
    };
    for(let i=chat.length-1;i>=0&&turns.length<3;i--) {
        const message=chat[i];
        if(message?.is_user||!isVisibleRoleplayMessage(message))continue;
        // Do not bridge across OOC or a cancelled output.
        if(omit.has(i)||blockedTurn?.index===i&&blockedTurn.swipe===selectedStateSwipe(message)||!rp(message))break;
        let userIndex=-1;
        for(let j=i-1;j>=0;j--){if(chat[j]?.is_user){userIndex=j;break;}}
        if(userIndex<0||omit.has(userIndex)||!rp(chat[userIndex]))break;
        const output=rp(message), user=rp(chat[userIndex]);
        const turn={index:i,userIndex,key:turnKey(chat,i,userIndex),fingerprint:stableFingerprint(message.mes),user:source(userIndex,'USER',user),reply:source(i,'CHARACTER',output)};
        if(bytes>maxChars)break; // Never clip a reply into misleading evidence.
        turns.unshift(turn);
    }
    return {turns, target:turns.at(-1)||null, sufficient:turns.length>=2};
}

export function observeProgress(rec, comparison, outcome, chat=[]) {
    const state=normalizeProgress(rec.progressionState,rec.preferences?.developmentStyle);
    if(rec.preferences?.developmentStyle==='static'){rec.progressionState=emptyProgress();return {outcome:'unclear',count:0,boost:false};}
    const target=comparison?.target;
    const value=comparison?.sufficient&&OUTCOMES.has(outcome)?outcome:'unclear';
    // A changed source invalidates that verdict and every later dependent count.
    const invalid=state.observations.findIndex(e=>!rp(chat[e.index])||!rp(chat[e.userIndex])||turnKey(chat,e.index,e.userIndex)!==e.key);
    if(invalid>=0)state.observations=state.observations.slice(0,invalid);
    if(target){
        const prior=state.observations.findIndex(e=>e.index>=target.index);
        if(prior>=0)state.observations=state.observations.slice(0,prior);
        state.observations.push({index:target.index,userIndex:target.userIndex,key:target.key,previousKey:comparison.turns.at(-2)?.key||'',outcome:value});
        state.observations=state.observations.slice(-8);
        state.lastOutputFingerprint=target.fingerprint;
    }else state.observations=[];
    state.turnsSinceMeaningfulProgress=streak(state.observations);
    state.style=rec.preferences?.developmentStyle||'';
    rec.progressionState=state;
    return {outcome:value,count:state.turnsSinceMeaningfulProgress,boost:state.turnsSinceMeaningfulProgress>=3};
}

export function progressVerification(comparison,outcome,pending) {
    if(!comparison?.target||!pending?.outputText||pending.outputIndex!==comparison.target.index||stableFingerprint(pending.outputText)!==comparison.target.fingerprint)return 'unavailable';
    if(!comparison.sufficient)return 'uncertain';
    return {flowing:'fulfilled',holding:'not_applicable',stalled:'missed',unclear:'uncertain'}[outcome]||'unavailable';
}

export function invalidateProgressFrom(rec,index) {
    if(!rec)return;
    const state=normalizeProgress(rec.progressionState);
    state.observations=state.observations.filter(e=>e.index<index&&e.userIndex<index);
    state.turnsSinceMeaningfulProgress=streak(state.observations);
    state.lastOutputFingerprint='';
    rec.progressionState=state;
}
export function stopProgress(rec,chat=[],type='normal') {
    if(!rec)return;
    const index=rec.pendingPlan?.outputIndex ?? (type==='continue'?chat.length-1:rec.pendingPlan?.chatCount??chat.length);
    rec.progressionState={...emptyProgress(),blockedTurn:{index,swipe:selectedStateSwipe(chat[index])}};
}
export function completeProgress(rec,index) {
    if(rec?.progressionState?.blockedTurn?.index===index)delete rec.progressionState.blockedTurn;
}
