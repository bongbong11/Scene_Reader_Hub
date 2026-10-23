const text=value=>typeof value==='string'?value.trim():'';
const words=value=>Array.isArray(value)?value.map(text).filter(Boolean).join(', '):'';
const line=(label,value)=>text(value)?`${label}: ${text(value)}`:'';
const fact=item=>[words(item.owners),text(item.label),text(item.lifecycle),text(item.time),text(item.summary),text(item.reason),text(item.impact)].filter(Boolean).join(' — ');
const knowledge=item=>text(item.summary)?[text(item.character),text(item.source),text(item.summary)].filter(Boolean).join(' — '):'';

// Purpose-specific RP projection. Storage references and revision history never
// enter this renderer; the internal reference remains available to search/judging.
export function renderStorylineRp(reference,{people=[]}={}) {
    const scene=[],character=[];
    const add=(target,value)=>{if(value&&!target.includes(value))target.push(value);};
    add(scene,line('Earlier scene',Object.entries(reference.scene||{}).map(([key,value])=>`${key}: ${value}`).join('; ')));
    add(scene,line('Prior context',reference.summary));
    add(scene,line('Existing event',reference.active_event?.title));
    for(const event of reference.background_events||[])add(scene,line('Background',text(event.title)||text(event.summary)));
    for(const item of reference.confirmed_facts||[])add(item.owners?.length?character:scene,fact(item));
    for(const item of reference.knowledge||[])add(character,knowledge(item));
    const relation=Object.entries(reference.relationship||{}).filter(([key,value])=>['motion','trust','intimacy','romance','lastBeat','tension'].includes(key)&&text(value)&&!['none','unclear'].includes(value)).map(([key,value])=>`${key}: ${value}`).join('; ');
    add(character,line('Prior relationship',relation));
    for(const state of reference.character_states||[]) {
        const name=text(state.name)||people.find(person=>person.id===state.id)?.name;
        if(!name)continue;
        const moods=['anger','joy','fear','sadness'].filter(key=>Number.isFinite((state.values||state)[key])).map(key=>`${key}: ${(state.values||state)[key]}`).join('; ');
        add(character,line(`${name} — prior feelings`,moods));
    }
    const render=(title,lines)=>lines.length?`${title}\n${lines.join('\n')}\nCurrent RP takes priority; preserve each person's knowledge boundary. Prior states do not establish current participation or unseen actions.`:'';
    return {scene:render('[LINKED STORY — CONTINUATION REFERENCE]',scene),text:render('[LINKED STORY — CHARACTER REFERENCE]',character)};
}
