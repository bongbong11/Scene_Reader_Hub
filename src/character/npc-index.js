import {stableFingerprint} from '../decision/policy.js';

const VERSION=1;
const cache=new WeakMap();
const TYPES=['relationship','fact','value','capability','core','boundary','reaction','knowledge','expression'];

// A local, derived index of the applied JSON, not another character sheet.
// Keep complete statements (including conditions), never generate new facts.
export function ensureNpcIndex(bank) {
    if(bank?.entity_type!=='npc')return null;
    const cached=cache.get(bank);
    if(cached && cached.records===bank.records && cached.analysisId===bank.analysisId && cached.sourceFingerprint===bank.sourceFingerprint)return cached.index;
    // Old paged banks contain only a loaded window. Do not mistake it for the
    // entire file or fetch the whole file merely to prepare a search index.
    if(bank.pagedRecords)return validHeader(bank,bank.npcIndex)?bank.npcIndex:null;
    const records=bank.records;
    if(!Array.isArray(records)||!records.length)return null;
    const fingerprint=stableFingerprint(records);
    let index=bank.npcIndex;
    if(!validHeader(bank,index)||index.recordsFingerprint!==fingerprint){
        const groups=TYPES.map(type=>records.filter(record=>record.type===type));
        const excerpts=[];let chars=0,remaining=records.length;
        // Round-robin protects relationships, identity and motives from a long
        // run of records of one type. Unrepresented facts remain in the bank.
        while(groups.some(group=>group.length)&&excerpts.length<9){
            for(const group of groups){
                const record=group.shift();if(!record)continue;
                const excerpt={type:record.type,target:record.target,when:record.when,rule:record.rule};
                const size=JSON.stringify(excerpt).length;
                if(chars+size>2400||excerpts.length>=9)continue;
                excerpts.push(excerpt);chars+=size;remaining--;
            }
        }
        if(!excerpts.length)return null;
        index={version:VERSION,analysisId:bank.analysisId,sourceFingerprint:bank.sourceFingerprint,entityName:bank.entity_name,
            recordsFingerprint:fingerprint,partial:remaining>0,excerpts};
        bank.npcIndex=index;
    }
    cache.set(bank,{records,analysisId:bank.analysisId,sourceFingerprint:bank.sourceFingerprint,index});
    return index;
}
function validHeader(bank,index){
    return index?.version===VERSION && index.analysisId===bank.analysisId && index.sourceFingerprint===bank.sourceFingerprint && index.entityName===bank.entity_name && Array.isArray(index.excerpts)&&index.excerpts.length>0;
}
export function withNpcIndex(bank){ensureNpcIndex(bank);return bank;}

export function addNpcReferenceQuestions(request,entries,beats,{currentIds=[]}={}){
    if(!beats.length||!entries.length)return [];
    const current=new Set(currentIds),candidates=[];
    let chars=0;
    for(const entry of entries){
        if(current.has(entry.id))continue; // Current actors keep their records.
        const index=ensureNpcIndex(entry.recordBank);
        if(!index)continue;
        const data={id:entry.id,name:entry.name,aliases:entry.aliases||[],partial:index.partial,excerpts:index.excerpts};
        const size=JSON.stringify(data).length;
        if(chars+size>24000)continue; // Unassessed files use the old fallback.
        const key=`npc_reference_${candidates.length}`;
        candidates.push({id:entry.id,key,data});chars+=size;
        request.questions[key]={type:'choice',instructions:`For registered NPC ${entry.name}, choose whether to retrieve their detailed records for recent_roleplay and npc_reference_context. This selects a reference file, NOT permission to appear or act. Select reference for a relevant relationship, role or motive, including a plausible future contact without a recent name mention. Evaluate this person independently; do not fill a quota or limit selection to one person. The excerpts can be incomplete: choose unknown if they do not establish relevance either way. Do not treat a missing detail as proof of irrelevance.`,criteria:{
            reference:'Their detailed records are useful for the current interaction or proposed direction.',
            skip:'Their described role and relationships are unrelated to this interaction and the proposed directions.',
            unknown:'The brief index is insufficient to decide; use the existing search fallback.',
        }};
    }
    if(candidates.length){
        request.state.npc_reference_context={purpose:'Reference-file selection only. This is not an exhaustive cast list or a required headcount. These are proposed directions, not events that have happened.',directions:beats.map(beat=>({key:beat.key,text:beat.text})),people:candidates.map(item=>item.data)};
        request.state.scope+=' For npc_reference questions use recent_roleplay and npc_reference_context; this does not change the latest-exchange-only scope of scene_status and scene_evidence.';
    }
    return candidates.map(({id,key})=>({id,key}));
}
export function resolveNpcReferences(candidates,answers={}){
    return new Map(candidates.map(({id,key})=>{
        const choice=answers?.[key]?.choice;
        return [id,['reference','skip'].includes(choice)?choice:'unknown'];
    }));
}
