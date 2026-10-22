import {stableFingerprint} from '../decision/policy.js';

export const SOURCE_TYPES = new Set(['world_fact','claim','belief','intention','promise','delegation','completed_action']);
const KINDS = new Set(['commitment','plan','schedule','obligation','delegation','status']);
const SOURCES = new Set(['direct','observed','told','reported','public','role_based','privileged']);
const PRESSURES = new Set(['none','strained','at_risk','blocked']);
const LIFECYCLES = new Set(['active','confirmed','delegated','contested','cancel_pending','resolved','cancelled','completed']);
export const RESPONSE_FIELDS = ['new_items','affected','knowledge_updates','possible_followups'];
export const CONTINUITY_VALIDATION_LABELS = Object.freeze({invalidShapeCount:'항목 형식',invalidEvidenceTypeCount:'정보 종류',invalidEvidenceCount:'근거 답변 번호',invalidStateCount:'연결할 기록 없음',invalidLifecycleCount:'상태 형식',invalidActorCount:'인물 이름 없음',limitOmittedCount:'항목 수 제한'});
export function continuityValidationCounts(value) {
    return Object.fromEntries(Object.keys(CONTINUITY_VALIDATION_LABELS).filter(key=>Number.isSafeInteger(value?.[key])&&value[key]>0).map(key=>[key,value[key]]));
}

export const REASONER_SYSTEM = `<CONTINUITY_REASONER>
Collect what changed in the supplied RP and what still matters for continuing it. Read dialogue, actions and narration in context, including pronouns and off-screen obligations. Keep causes and unresolved consequences; do not write the next scene.
Return one JSON object with these arrays, in order of relevance:
new_items: [{kind,label,owners,lifecycle,time,summary,impact,source_type,source_indices}] (up to 2).
affected: [{state_id,relation,lifecycle,pressure,reason,time,summary,impact,source_type,source_indices}] (up to 3).
knowledge_updates: [{fact_id,character,source,summary,related_state_ids,source_type,source_indices}] (up to 4).
possible_followups: [{related_state_id,owners,action,reason,source_type,source_indices}] (up to 2).
source_indices lists the supporting message numbers from source_rp; paraphrase freely, no verbatim quote is required. Use empty arrays for no change. Omit unknown or unnecessary optional fields, especially time, summary, impact and related_state_ids. Keep each text field to one short sentence. impact means a remaining consequence, not a prescribed emotion or action.
kind: commitment, plan, schedule, obligation, delegation, status. lifecycle: active, confirmed, delegated, contested, cancel_pending, resolved, cancelled, completed. relation: changed or pressured. pressure: none, strained, at_risk, blocked. knowledge source: direct, observed, told, reported, public, role_based, privileged. source_type: world_fact, claim, belief, intention, promise, delegation, completed_action.
Reuse supplied state IDs for changes and followups, and fact IDs for updates to the same person's knowledge. New knowledge may omit fact_id. Use identifiable cast names, including people established in the RP without registered sheets.
Distinguish a statement, belief, plan or promise from an established fact or completed action. Being told a claim establishes knowledge of that claim, not its truth. Do not give private knowledge to other people without an information path. An obstacle changes pressure, not automatically the commitment's lifecycle; when it clears, pressure can return to none. Preserve ambiguity instead of inventing agreement, reconciliation or completion. Followups continue established unfinished matters; they are possibilities, not facts or mandatory events.
source_rp supplies new changes; active_continuity and existing_state_refs supply prior states. Do not duplicate authoritative event, relationship or NPC state. Write concise English text, preserving names. No prose outside JSON.
</CONTINUITY_REASONER>`;

const text=(value,max=240)=>typeof value==='string'?value.trim().slice(0,max):'';
const token=value=>text(value,50).toLowerCase().replace(/[ -]+/g,'_');
const compact=value=>String(value||'').normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim().toLowerCase();
const quoteMatches=(quote,source)=>compact(quote).length>=4&&compact(source).includes(compact(quote));
const strings=(value,max=80)=>(Array.isArray(value)?value:typeof value==='string'?[value]:[]).map(v=>text(v,max)).filter(Boolean);

// Message identity establishes provenance. Quotes help old responses narrow
// their references, but never veto the model's interpretation of the RP.
function sourceIdentityFor(value,identity,sources) {
    const all=identity.refs||[];
    const supplied=value.source_indices??value.source_index;
    let refs;
    if(supplied!==undefined) {
        const indices=(Array.isArray(supplied)?supplied:[supplied]).map(v=>typeof v==='string'&&/^\d+$/.test(v)?Number(v):v);
        const available=sources?.flatMap(source=>source.messageIndices??source.refs.map(ref=>ref.messageIndex));
        if(!indices.length||indices.some(v=>!Number.isInteger(v)||!all.some(ref=>ref.messageIndex===v)||available&&!available.includes(v)))return null;
        refs=all.filter(ref=>indices.includes(ref.messageIndex));
    } else {
        const matched=(sources||[]).filter(source=>quoteMatches(value.evidence,source.text));
        refs=matched.length?[...new Map(matched.flatMap(source=>source.refs).map(ref=>[ref.messageIndex,ref])).values()]:all;
    }
    const assistantIndices=refs.filter(ref=>ref.role==='assistant').map(ref=>ref.messageIndex);
    // A user-only change belongs to its own completed output group, not the end
    // of the entire analysis window (which would misdate earlier snapshots).
    const lastSource=Math.max(-1,...refs.map(ref=>ref.messageIndex));
    const following=all.filter(ref=>ref.role==='assistant'&&ref.messageIndex>=lastSource).map(ref=>ref.messageIndex);
    return {...identity,refs,assistantIndex:assistantIndices.length?Math.max(...assistantIndices):following.length?Math.min(...following):identity.assistantIndex};
}

export function validateReasonerResult(raw,{continuity={},sourceIdentity={},stateRefs=null,actors=null,evidenceSources=null,diagnostics=null}={}) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Continuity Reasoner 응답 형식이 잘못됐습니다.');
    const items=continuity.items||[],known=new Set([...items.map(item=>item.id),...(stateRefs||[])]);
    const stateId=value=>{
        const id=text(value,200);
        if(known.has(id)||(!stateRefs&&/^(event|relationship|npc):/.test(id)))return id;
        const matched=items.filter(item=>compact(item.label)===compact(id));
        return id&&matched.length===1?matched[0].id:null;
    };
    const actor=value=>{const name=text(value,80);return (actors||[]).find(item=>compact(item)===compact(name))||name;};
    const candidates=[];let invalidCount=0;
    const reject=key=>{invalidCount++;if(diagnostics)diagnostics[key]=(diagnostics[key]||0)+1;};
    function add(type,value,index) {
        if(!value||typeof value!=='object'||Array.isArray(value))return reject('invalidShapeCount');
        const sourceType=token(value.source_type);
        if(!SOURCE_TYPES.has(sourceType))return reject('invalidEvidenceTypeCount');
        const identity=sourceIdentityFor(value,sourceIdentity,evidenceSources);
        if(!identity)return reject('invalidEvidenceCount');
        const base={id:`${type}:${index}:${sourceIdentity.outputFingerprint}`,type,evidence:text(value.evidence,260),sourceType,sourceIdentity:identity,label:'',data:{}};
        if(type==='new_item') {
            const kind=token(value.kind),lifecycle=token(value.lifecycle)||'active',label=text(value.label,140);
            if(!KINDS.has(kind)||!label)return reject('invalidShapeCount');
            if(!LIFECYCLES.has(lifecycle))return reject('invalidLifecycleCount');
            base.label=label;
            base.data={kind,label,lifecycle,owners:strings(value.owners).map(actor).slice(0,4)};
        } else if(type==='affected') {
            const id=stateId(value.state_id),relation=token(value.relation),lifecycle=token(value.lifecycle),pressure=token(value.pressure);
            if(!id)return reject('invalidStateCount');
            if(!['changed','pressured'].includes(relation))return reject('invalidShapeCount');
            if(lifecycle&&!LIFECYCLES.has(lifecycle)||pressure&&!PRESSURES.has(pressure))return reject('invalidLifecycleCount');
            base.label=`${id} · ${relation}`;
            base.data={stateId:id,relation,lifecycle:lifecycle||null,pressure:pressure||null,reason:text(value.reason),owners:strings(value.owners).map(actor).slice(0,4)};
        } else if(type==='knowledge') {
            const character=actor(value.character),source=token(value.source),summary=text(value.summary,240),factId=text(value.fact_id,100);
            if(!character)return reject('invalidActorCount');
            if(!SOURCES.has(source)||!summary&&!factId)return reject('invalidShapeCount');
            const existing=(continuity.knowledge||[]).find(item=>compact(item.character)===compact(character)&&compact(item.summary)===compact(summary));
            base.label=`${character} · ${factId||summary}`;
            base.data={factId:factId||existing?.factId||`fact:${stableFingerprint([character,summary])}`,character,source,summary:summary||factId,
                relatedStateIds:strings(value.related_state_ids,200).map(stateId).filter(Boolean)};
        } else {
            const id=stateId(value.related_state_id),action=text(value.action,180);
            if(!action)return reject('invalidShapeCount');
            if(!id)return reject('invalidStateCount');
            base.label=action;
            base.data={relatedStateId:id,action,reason:text(value.reason),owners:strings(value.owners).map(actor).slice(0,4)};
        }
        if(type==='new_item'||type==='affected')for(const [field,max]of [['time',80],['summary',240],['impact',160]]) {
            // Explicit null clears an old optional value; omission preserves it.
            if(value[field]===null)base.data[field]='';
            else if(text(value[field],max))base.data[field]=text(value[field],max);
        }
        candidates.push(base);
    }
    for(const [field,type,limit]of [['new_items','new_item',2],['affected','affected',3],['knowledge_updates','knowledge',4],['possible_followups','followup',2]]) {
        const entries=Array.isArray(raw[field])?raw[field]:[];
        if(diagnostics)diagnostics.candidateCount=(diagnostics.candidateCount||0)+entries.length;
        const start=candidates.length;
        for(let i=0;i<Math.min(entries.length,64);i++) {
            if(candidates.length-start>=limit){if(diagnostics)diagnostics.limitOmittedCount=(diagnostics.limitOmittedCount||0)+entries.length-i;break;}
            add(type,entries[i],i);
        }
    }
    if(diagnostics)diagnostics.invalidCount=invalidCount;
    return candidates;
}
