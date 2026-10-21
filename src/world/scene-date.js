// Pure, bounded date parsing. Never interprets a story date as the computer's date.
const MONTHS = Object.fromEntries(['january','february','march','april','may','june','july','august','september','october','november','december'].flatMap((name,i)=>[[name,i+1],[name.slice(0,3),i+1]]));
MONTHS.sept=9;
const MONTH='(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';
const BAD = /birth|birthday|born|appointment|deadline|anniversary|flashback|yesterday|tomorrow|last\s+(?:week|month|year)|next\s+(?:week|month|year)|생일|출생|예약|기념일|회상|어제|내일|작년|지난|예정|마감/i;
const DATE_LABEL = /date|calendar|today|current|날짜|일자|오늘|현재|시점/i;
const WRAPPERS = new Set(['small','b','i','strong','em','span','div','p','pre','code','blockquote','table','tbody','thead','tr','td','th']);
export const DATE_PARSE_LIMIT=48000;
export function validSceneDate(year,month,day) {
    if (year!==null && (!Number.isInteger(year)||year<1000||year>2399)) return false;
    return Number.isInteger(month)&&month>=1&&month<=12&&Number.isInteger(day)&&day>=1&&new Date(Date.UTC(year??2000,month-1,day)).getUTCDate()===day;
}
function matches(text) {
    const found=[];
    const add=(m,year,month,day,format,order='')=>{
        if(!validSceneDate(year,month,day))return;
        found.push({start:m.index,end:m.index+m[0].length,year,month,day,format,order,raw:m[0]});
    };
    for(const m of text.matchAll(/\b(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/g))add(m,+m[1],+m[2],+m[3],'ymd');
    for(const m of text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g))add(m,+m[1],+m[2],+m[3],'korean');
    for(const m of text.matchAll(new RegExp('\\b('+MONTH+')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b','gi')))add(m,m[3]?+m[3]:null,MONTHS[m[1].toLowerCase()],+m[2],'month-name');
    for(const m of text.matchAll(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+('+MONTH+')\\.?(?:,?\\s+(\\d{4}))?\\b','gi')))add(m,m[3]?+m[3]:null,MONTHS[m[2].toLowerCase()],+m[1],'day-name');
    for(const m of text.matchAll(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4})\b/g)) {
        add(m,+m[3],+m[1],+m[2],'numeric','mdy');
        add(m,+m[3],+m[2],+m[1],'numeric','dmy');
    }
    for(const m of text.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
        if(found.some(v=>m.index>=v.start&&m.index<v.end))continue;
        add(m,null,+m[1],+m[2],'korean-short');
    }
    return found.sort((a,b)=>a.start-b.start||b.end-a.end);
}
function cleanLabel(text) { return text.toLowerCase().replace(/[^a-z가-힣_ ]/g,' ').replace(/\s+/g,' ').trim().slice(-70); }
function segments(input) {
    const text=String(input||'').slice(-DATE_PARSE_LIMIT).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
    const result=[],stack=[];
    let carriedLabel='';
    for(const token of text.split(/(<\/?[a-zA-Z][^>]*>)/g)) {
        const tag=token.match(/^<(\/?)([\w-]+)[^>]*>$/);
        if(tag) {
            const name=tag[2].toLowerCase();
            if(tag[1]){const at=stack.lastIndexOf(name);if(at>=0)stack.splice(at);}
            else if(!/\/>$/.test(token)&&!['br','hr','img','input'].includes(name))stack.push(name);
            continue;
        }
        const container=stack.filter(name=>!WRAPPERS.has(name)).slice(-2).join('/');
        for(const [lineIndex,line] of token.split(/\r?\n/).entries()) {
            if(lineIndex)carriedLabel='';
            const fields=line.split(/[|｜]/);
            for(let i=0;i<fields.length;i++) {
                const field=fields[i];
                if(!field.trim())continue;
                const previous=fields[i-1]?.trim()||'';
                const prefix=matches(field).length&&previous&&!matches(previous).length?previous+': ':carriedLabel;
                result.push({text:prefix+field,container});
                carriedLabel=!matches(field).length&&(DATE_LABEL.test(field)||BAD.test(field))?field.trim()+': ':'';
            }
        }
    }
    return result;
}
export function dateCandidates(input, profile=null) {
    const found=[];
    for(const {text,container} of segments(input)) {
        if(BAD.test(container))continue;
        for(const value of matches(text)) {
            const prefix=text.slice(0,value.start).split(/[,;{}]/).at(-1);
            if(BAD.test(prefix))continue;
            const label=cleanLabel(prefix);
            const explicit=DATE_LABEL.test(label)||DATE_LABEL.test(container);
            if(!explicit && /[a-z가-힣]/i.test(label))continue;
            const descriptor={label,container,format:value.format,order:value.order};
            if(profile && (profile.label!==label||profile.container!==container||profile.format!==value.format||profile.order!==value.order))continue;
            found.push({date:{year:value.year,month:value.month,day:value.day},profile:descriptor,
                label:label||container||'날짜만 있는 줄',preview:text.trim().slice(0,160),explicit});
            if(found.length>=16)return found;
        }
    }
    const unique=[...new Map(found.map(v=>[JSON.stringify([v.date,v.profile]),v])).values()];
    const groups=new Map();
    for(const value of unique) {
        const key=JSON.stringify(value.profile);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(value);
    }
    for(const group of groups.values())if(group.length>1)group.forEach((value,index)=>{
        value.profile={...value.profile,occurrence:index,count:group.length};
    });
    return unique;
}
export function readDateField(text, profile) {
    if(!profile || typeof profile!=='object')return null;
    const found=dateCandidates(text,profile);
    if(profile.count>1)return found.length===profile.count?found[profile.occurrence]?.date||null:null;
    return found.length===1?found[0].date:null;
}
export function formatSceneDate(date) {
    return date?(date.year===null?'연도 없음':date.year)+'-'+String(date.month).padStart(2,'0')+'-'+String(date.day).padStart(2,'0'):'';
}

