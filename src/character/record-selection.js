import { currentRecords, recordBankIsCurrent } from "./records.js";

const words = text => new Set(String(text || '').toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []);
const generic = value => /^(?:none|self|all|any|general|others|everyone|always|unconditional|n\/a|)$/i.test(String(value || '').trim());
export function selectRecordCandidates(entry, transcript, {limit=20,maxChars=16000,stats=null,semanticIndices=[],categoryHints=[]}={}) {
    if (!recordBankIsCurrent(entry)) return [];
    const query=words(transcript), own=words([entry.name,...(entry.aliases || [])].join(' '));
    const semanticRank=new Map(semanticIndices.map((index,rank)=>[index,rank]));
    const hinted=new Set(categoryHints);
    const rank=currentRecords(entry).map((record,localIndex)=>{
        const index=entry.recordBank?.recordIndices?.[localIndex] ?? localIndex;
        const terms=words([record.target,record.when,record.rule,record.knowledge_domain,record.type].join(' '));
        let overlap=0;
        for(const term of terms) if(query.has(term) && !own.has(term)) overlap++;
        const broad=['core','value','expression','boundary','relationship'].includes(record.type) && generic(record.when);
        const ownTarget=generic(record.target) || String(record.target).toLowerCase()===entry.name.toLowerCase();
        const targetMatch=[...words(record.target)].some(term=>query.has(term) && !own.has(term));
        const conditionMatch=[...words(record.when)].some(term=>query.has(term) && !own.has(term));
        const lexical=overlap*3+(targetMatch?4:0)+(conditionMatch?3:0)+(broad?2:0)+(ownTarget?1:0);
        const semantic=semanticRank.has(index) ? 16-Math.min(12,semanticRank.get(index)) : 0;
        return {record,index,score:lexical+semantic+(hinted.has(record.type)?3:0),lexical,semantic};
    });
    const sorted=rank.sort((a,b)=>b.score-a.score || a.index-b.index);
    // Semantic hits lead, while a few lexical and broad anchors prevent one topic
    // from hiding a relationship, role or boundary that the scene also needs.
    const diverse=[], types=new Set();
    const protectedRecord = item => item.record.type === 'boundary' || (item.record.type === 'knowledge' && ['does_not_know','misunderstands'].includes(item.record.knowledge_state));
    const anchors = [...sorted.filter(protectedRecord), ...sorted.filter(item => !protectedRecord(item))];
    for(const item of anchors) if((item.semantic || item.lexical) && !types.has(item.record.type) && diverse.length<4){types.add(item.record.type);diverse.push(item);}
    const primary=semanticRank.size ? [
        ...sorted.filter(item=>item.semantic).slice(0,Math.max(1,limit-4)),
        ...sorted.filter(item=>item.lexical && !item.semantic).slice(0,3),
        ...sorted.filter(item=>item.record.type==='core' && generic(item.record.when)).slice(0,1),
    ] : sorted;
    const selected=[], seen=new Set();let used=0, excludedByChars=0;
    const reserved = Math.min(4, limit);
    const candidates = reserved ? [...primary.slice(0, limit-reserved), ...diverse, ...primary.slice(limit-reserved)] : primary;
    for(const item of candidates) {
        if(seen.has(item.index) || selected.length>=limit) continue;
        seen.add(item.index);
        const size=JSON.stringify(item.record).length;
        if(used+size>maxChars) {excludedByChars++;continue;}
        used+=size;
        selected.push({...item.record,id:`record:${entry.id}:${item.index}`,kind:item.record.type,topic:item.record.knowledge_domain || 'none'});
    }
    if(stats)Object.assign(stats,{storedCount:entry.recordBank?.pagedRecords?.count||rank.length,candidateCount:selected.length,candidateChars:used,excludedByChars,excludedByLimit:Math.max(0,rank.length-selected.length-excludedByChars),semanticHits:semanticRank.size,limit,maxChars});
    return selected;
}
export function scopedRecordLine(name, record) {
    const scope=[`type=${record.type}`,`target=${record.target || 'self'}`,`when=${record.when || 'none'}`,`modality=${record.modality}`,`basis=${record.basis}`];
    if(record.type==='knowledge') scope.push(`knowledge=${record.knowledge_state}`,`domain=${record.knowledge_domain}`);
    return `${name} [${scope.join('; ')}]: ${record.rule}`;
}
