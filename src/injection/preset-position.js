// Pure outbound-message transformation. Never modifies source prompts or chat.
const normalize = text => text.replace(/\s/gu, ' ').replace(/ +/g, ' ').trim();
function spanOf(text, candidate) {
    if (!candidate.trim()) return [];
    const starts=[], ends=[];
    let normalized='';
    for(let i=0;i<text.length;i++) {
        if(/\s/u.test(text[i])) {
            if(normalized.endsWith(' ')) ends[ends.length-1]=i+1;
            else {normalized+=' ';starts.push(i);ends.push(i+1);}
        } else {normalized+=text[i];starts.push(i);ends.push(i+1);}
    }
    const needle=normalize(candidate), spans=[];
    for(let offset=normalized.indexOf(needle);offset>=0;offset=normalized.indexOf(needle,offset+1)) spans.push({start:starts[offset],end:ends[offset+needle.length-1]});
    return spans;
}
function locate(messages, candidates, role) {
    // Multiple prepared variants must agree on the same unique location.
    const found=new Map();
    for(const candidate of new Set(candidates.filter(text=>typeof text==='string' && text.trim()))) {
        messages.forEach((message,index)=>{
            if(message.role!==role && !(role==='system' && message.role==='developer')) return;
            const parts=typeof message.content==='string' ? [{text:message.content}] : Array.isArray(message.content) ? message.content : [];
            parts.forEach((part,partIndex)=>{
                if(typeof part?.text!=='string')return;
                for(const span of spanOf(part.text,candidate))found.set(`${index}:${partIndex}:${span.start}:${span.end}`,{index,partIndex,...span});
            });
        });
    }
    return found.size===1 ? {span:[...found.values()][0]} : {reason:found.size?'ambiguous_content':'content_not_found'};
}
function splitMessage(message, partIndex, offset) {
    if(typeof message.content==='string')return [message.content.slice(0,offset),message.content.slice(offset)];
    const parts=message.content,part=parts[partIndex];
    const left=part.text.slice(0,offset),right=part.text.slice(offset);
    return [[...parts.slice(0,partIndex),...(left?[{...part,text:left}]:[])],[...(right?[{...part,text:right}]:[]),...parts.slice(partIndex+1)]];
}
const nonempty = content => typeof content==='string' ? Boolean(content.trim()) : content.length>0;
const contains = (messages,text) => messages.some(message => ['system','developer'].includes(message.role) && (typeof message.content==='string' ? message.content.includes(text) : Array.isArray(message.content) && message.content.some(part=>typeof part.text==='string' && part.text.includes(text))));

export function applyPresetSlots(body, blocks, {prompts=[],prepared=new Map()}={}) {
    if(!Array.isArray(body?.messages))return {changed:false,results:[]};
    const messages=body.messages.map(message=>({...message,content:Array.isArray(message.content)?message.content.map(part=>({...part})):message.content}));
    const placements=[],results=[];
    for(const block of blocks) {
        if(!block.content?.trim())continue;
        const prompt=prompts.find(item=>item.identifier===block.slot.identifier);
        const result={kind:block.kind,identifier:block.slot.identifier,side:block.slot.side,status:'missing'};
        results.push(result);
        if(contains(messages,block.content)){result.status='present';continue;}
        if(!prompt){result.reason='prompt_missing';continue;}
        if(!prompt.enabled){result.reason='prompt_disabled';continue;}
        // Only already-rendered host content is used. Never run user macros twice.
        const captured=prepared.get(prompt.identifier) || [];
        const candidates=captured.length ? captured : prompt.content.includes('{{') ? [] : [prompt.content];
        const {span,reason}=locate(messages,candidates,prompt.role);
        if(!span){result.reason=reason;continue;}
        placements.push({...span,offset:block.slot.side==='before'?span.start:span.end,block,result});
    }
    // Work backwards so changes cannot move any later resolved anchor.
    placements.sort((a,b)=>b.index-a.index || b.partIndex-a.partIndex || b.offset-a.offset);
    let changed=false;
    for(let p=0;p<placements.length;) {
        const first=placements[p],group=[];
        while(p<placements.length && placements[p].index===first.index && placements[p].partIndex===first.partIndex && placements[p].offset===first.offset)group.push(placements[p++]);
        const original=messages[first.index];
        const [left,right]=splitMessage(original,first.partIndex,first.offset);
        const replacement=[];
        if(nonempty(left))replacement.push({...original,content:left});
        const index=first.index+replacement.length;
        replacement.push({role:'system',content:group.map(item=>item.block.content).join('\n\n')});
        if(nonempty(right))replacement.push({...original,content:right});
        messages.splice(first.index,1,...replacement);
        group.forEach(item=>Object.assign(item.result,{status:'inserted',index}));
        changed=true;
    }
    if(changed)body.messages=messages;
    return {changed,results};
}

export function slotBlock(kind,content) {
    return content ? `<SCENE_READER_OUTPUT data-source="scene_reader_hub" data-kind="${kind}">\n${content}\n</SCENE_READER_OUTPUT>` : '';
}
