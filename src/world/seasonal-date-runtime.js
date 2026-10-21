import {dateCandidates,readDateField} from './scene-date.js';
import {isMessageHidden} from '../context/visibility.js';
import {splitOocText} from '../context/messages.js';

export function createSeasonalDate(deps) {
    const parsed=new WeakMap(),sources=new WeakMap(),attempted=new Set(),profilesLimit=16;
    let previousPreset='',previousRoom='',previousMessage=null,previousText='',awaitOutput=null;
    let presetText=null,presetHash='';
    let state={status:'disabled',date:null,candidates:[],token:''};
    function latest() {
        const chat=deps.getContext().chat||[],excluded=new Set(deps.record()?.nonRpOutputIndices||[]);
        for(let i=chat.length-1;i>=Math.max(0,chat.length-24);i--) {
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
            if(!message.is_user)return {message,text,textKey:source.textKey};
            // A current user-supplied scene date may supersede the previous output.
            if(source.userDate)return {message,text,textKey:source.textKey};
        }
        return null;
    }
    function presetKey() {
        const text=JSON.stringify(deps.preset());
        if(text!==presetText){presetText=text;presetHash=deps.fingerprint(text);}
        return presetHash;
    }
    function read() {
        const preset=presetKey(),room=deps.chatKey(),source=latest();
        if(previousPreset&&previousPreset!==preset&&room===previousRoom&&source?.message===previousMessage&&source?.text===previousText)
            awaitOutput={message:source.message,text:source.text,preset};
        previousPreset=preset;previousRoom=room;previousMessage=source?.message;previousText=source?.text||'';
        if(awaitOutput&&(awaitOutput.preset!==preset||source?.message!==awaitOutput.message||source?.text!==awaitOutput.text))awaitOutput=null;
        const enabled=deps.enabled();
        const profile=deps.settings().seasonalDateFormats?.[preset]||null;
        let date=null,candidates=[],status=!enabled?'disabled':awaitOutput?'awaiting_output':!source?'missing':'unconfirmed';
        if(enabled&&source&&!awaitOutput) {
            const key=JSON.stringify(profile);
            let entry=parsed.get(source.message);
            if(!entry||entry.text!==source.text||entry.profileKey!==key) {
                date=readDateField(source.text,profile);
                candidates=date?[]:dateCandidates(source.text);
                entry={text:source.text,profileKey:key,date,candidates};
                parsed.set(source.message,entry);
                deps.report?.('seasonal_date_read',{module:'src/world/seasonal-date-runtime.js',status:date?'confirmed':candidates.length?'confirmation_needed':'missing',candidateCount:candidates.length});
            }
            ({date,candidates}=entry);
            status=date?'confirmed':candidates.length?'unconfirmed':'missing';
        }
        // Tokens stay in memory, not diagnostic logs; stale dialogs cannot confirm a different source.
        const token=deps.fingerprint([room,preset,source?.textKey||'',profile,status]);
        state={status,date,candidates,token,preset,profile,room};
        return state;
    }
    function refresh({manual=false}={}) {
        const value=read();
        deps.render?.(value);
        const requestKey=value.room+':'+value.preset+':'+JSON.stringify(value.candidates.map(v=>v.profile));
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
        delete formats[now.preset];formats[now.preset]=candidate.profile;
        const bounded=Object.fromEntries(Object.entries(formats).slice(-profilesLimit));
        await deps.save(bounded);
        refresh();
    }
    async function recheck() {
        const preset=presetKey(),formats={...(deps.settings().seasonalDateFormats||{})};
        delete formats[preset];
        await deps.save(formats);
        return refresh({manual:true});
    }
    function init(events,types) {
        for(const type of [...new Set(['MESSAGE_RECEIVED','MESSAGE_SWIPED','MESSAGE_EDITED','MESSAGE_DELETED','CHAT_CHANGED','GENERATION_ENDED','PRESET_CHANGED','PRESET_CHANGED_AFTER','OAI_PRESET_CHANGED_AFTER','SETTINGS_UPDATED'].map(key=>types[key]).filter(Boolean))])
            events.on(type,()=>{try{refresh();}catch{deps.report?.('seasonal_date_refresh_failed',{module:'src/world/seasonal-date-runtime.js',status:'failed'});}});
        refresh();
    }
    return {read,refresh,recheck,init,revision:()=>{
        const value=read();
        return value.status==='disabled'?[1,'disabled']:[1,value.preset,value.profile,value.status,value.date];
    }};
}

