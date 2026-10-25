import {dateCandidates,readDateField} from './scene-date.js';
import {isMessageHidden} from '../context/visibility.js';
import {splitOocText} from '../context/messages.js';

export function createSeasonalDate(deps) {
    const parsed=new WeakMap(),sources=new WeakMap(),attempted=new Set(),profilesLimit=16;
    let rechecking=false;
    let state={status:'disabled',date:null,candidates:[],token:''};
    function latest(before=Infinity) {
        const chat=deps.getContext().chat||[],excluded=new Set(deps.record()?.nonRpOutputIndices||[]);
        for(let i=Math.min(before,chat.length)-1;i>=0;i--) {
            const message=chat[i];
            if(!message||isMessageHidden(message)||excluded.has(i))continue;
            const raw=String(message.mes||'');
            let source=sources.get(message);
            if(!source||source.raw!==raw) {
                const text=splitOocText(raw).rpText;
                source={raw,text,textKey:deps.fingerprint(text),userDate:message.is_user&&dateCandidates(text).some(v=>v.explicit)};
                sources.set(message,source);
            }
            const text=source.text;
            if(!text.trim())continue;
            if(!message.is_user)return {message,text,textKey:source.textKey,index:i};
            // A current user-supplied scene date may supersede the previous output.
            if(source.userDate)return {message,text,textKey:source.textKey,index:i};
        }
        return null;
    }
    function read() {
        const room=deps.chatKey();
        let source=latest();
        const enabled=deps.enabled();
        // Confirmation belongs to the date field, not the model or preset text.
        // Reuse confirmed formats across presets, preferring the most recent choice.
        const profiles=rechecking?[]:Object.values(deps.settings().seasonalDateFormats||{}).reverse();
        let profile=profiles[0]||null;
        const key=JSON.stringify(profiles);
        let date=null,candidates=[],status=!enabled?'disabled':'missing',retained=false;
        while(enabled&&source) {
            let entry=parsed.get(source.message);
            if(!entry||entry.text!==source.text||entry.profileKey!==key) {
                let matchedProfile=null;
                for(const saved of profiles) {
                    date=readDateField(source.text,saved);
                    if(date){matchedProfile=saved;break;}
                }
                candidates=date?[]:dateCandidates(source.text);
                entry={text:source.text,profileKey:key,date,candidates,matchedProfile};
                parsed.set(source.message,entry);
                deps.report?.('seasonal_date_read',{module:'src/world/seasonal-date-runtime.js',status:date?'confirmed':candidates.length?'confirmation_needed':'missing',candidateCount:candidates.length});
            }
            ({date,candidates}=entry);
            if(entry.matchedProfile)profile=entry.matchedProfile;
            status=date?'confirmed':candidates.length?'unconfirmed':'missing';
            if(date||candidates.length||!profile)break;
            // A date-free reply keeps the last readable date in this chat. Reading
            // from live history also respects reloads, edits, swipes, hides and deletes.
            source=latest(source.index);
            retained=true;
        }
        // Tokens stay in memory, not diagnostic logs; stale dialogs cannot confirm a different source.
        const token=deps.fingerprint([room,source?.textKey||'',profile,status]);
        state={status,date,candidates,token,profile,room,retained:retained&&Boolean(date)};
        return state;
    }
    function refresh({manual=false}={}) {
        const value=read();
        deps.render?.(value);
        if(value.status==='confirmed')attempted.clear();
        const requestKey=value.room+':'+JSON.stringify(value.candidates.map(v=>v.profile));
        if(value.status!=='unconfirmed'||deps.busy?.())return value;
        if(!manual&&attempted.has(requestKey))return value;
        attempted.add(requestKey);
        if(attempted.size>64)attempted.delete(attempted.values().next().value);
        deps.confirm?.(value,{accept:index=>accept(value,index),later:()=>{}});
        return value;
    }
    async function accept(snapshot,index) {
        const now=read();
        if(now.token!==snapshot.token)throw new Error('대화나 날짜 항목이 바뀌었어요. 날짜를 다시 확인해 주세요.');
        const candidate=now.candidates[index];
        if(!candidate)throw new Error('현재 날짜 항목을 선택해 주세요.');
        const formats={...(deps.settings().seasonalDateFormats||{})};
        const formatKey='format:'+deps.fingerprint(candidate.profile);
        delete formats[formatKey];formats[formatKey]=candidate.profile;
        const bounded=Object.fromEntries(Object.entries(formats).slice(-profilesLimit));
        await deps.save(bounded);
        rechecking=false;
        refresh();
    }
    async function recheck() {
        rechecking=true;
        return refresh({manual:true});
    }
    function init(events,types) {
        for(const type of [...new Set(['MESSAGE_RECEIVED','MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_DELETED','CHAT_CHANGED','GENERATION_ENDED','PRESET_CHANGED','PRESET_CHANGED_AFTER','OAI_PRESET_CHANGED_AFTER','SETTINGS_UPDATED'].map(key=>types[key]).filter(Boolean))])
            events.on(type,()=>{try{refresh();}catch{deps.report?.('seasonal_date_refresh_failed',{module:'src/world/seasonal-date-runtime.js',status:'failed'});}});
        refresh();
    }
    return {read,refresh,recheck,init,revision:()=>{
        const value=read();
        return value.status==='disabled'?[1,'disabled']:[1,value.profile,value.status,value.date];
    }};
}

