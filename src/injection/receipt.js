import { stableFingerprint } from '../decision/policy.js';
import {rememberOpportunity} from '../scene/opportunities.js';

function promptText(data) {
    if(typeof data === 'string')return data;
    if(Array.isArray(data))return data.map(item=>typeof item?.content==='string'?item.content:Array.isArray(item?.content)?item.content.filter(x=>x.type==='text').map(x=>x.text||'').join('\n'):'').join('\n');
    if(!data||typeof data!=='object')return '';
    return [promptText(data.prompt),promptText(data.input),promptText(data.messages),promptText(data.chat)].filter(Boolean).join('\n');
}
export function observePromptReceipt(data,{payload='',worldPayload='',additionBlocks=[],cycleId='',dryRun=false,userName='',characterName=''}={}) {
    if(dryRun)return {cycleId,status:'dry_run',observed:false};
    const text=promptText(data).replaceAll('\r\n','\n');
    const check=value=>{
        if(!value)return 'not_expected';
        if(!text)return 'unavailable';
        const normalized=value.replaceAll('\r\n','\n');
        if(text.includes(normalized))return 'confirmed';
        const rendered=normalized.replace(/\{\{user\}\}/gi,()=>userName||'{{user}}').replace(/\{\{char\}\}/gi,()=>characterName||'{{char}}');
        if(text.includes(rendered))return 'confirmed';
        // Do not execute user macros a second time: they may mutate variables.
        return /\{\{[^}]+\}\}/.test(rendered)?'unverifiable':'unconfirmed';
    };
    return {cycleId,status:text?'observed':'unavailable',observed:Boolean(text),promptHash:text?stableFingerprint(text):'',promptChars:text.length,scene:check(payload),world:check(worldPayload),payloadChars:payload.length,worldChars:worldPayload.length,
        additions:additionBlocks.map(({id,feature,templateId,text})=>({id,feature,templateId,status:check(text)}))};
}

export function createPromptObserver({getExpected,getNames,getCycleId,getRecord=()=>null,report,updateActivity,updateStatus}) {
    let enabled=true,pending=null;
    const reported=new Set();
    function start(type,data={},dryRun=false) {enabled=!dryRun&&type!=='quiet'&&!data?.quiet_prompt;pending=null;reported.clear();}
    function inspect(data,dryRun,phase,expected) {
        if(!enabled||dryRun||!expected||(!expected.payload&&!expected.worldPayload))return null;
        const receipt={...observePromptReceipt(data,{...expected,...getNames(),cycleId:getCycleId(),dryRun}),phase};
        if(expected.slotResults)receipt.slots=expected.slotResults.map(item=>`${item.kind}:${item.status}${item.reason?':'+item.reason:''}`);
        for(const kind of ['scene','world'])if(expected[kind+'Preset'] && receipt[kind]!=='not_expected' && expected.slotResults?.find(item=>item.kind===kind)?.status==='missing')receipt[kind]='unconfirmed';
        report('injection.consume','PROMPT_OBSERVED',receipt);
        if(phase==='request')for(const item of receipt.additions) {
            const reasonCode=item.status==='confirmed'?'request_included':item.status==='unconfirmed'?'request_missing':'request_unobservable';
            const marker=`${receipt.cycleId}:${item.id}:${reasonCode}`;
            if(reported.has(marker))continue;
            reported.add(marker);if(reported.size>32)reported.delete(reported.values().next().value);
            report('injection.consume','ADDITION_RECEIPT',{module:'src/injection/receipt.js',feature:item.feature,templateId:item.templateId,reasonCode,status:reasonCode==='request_missing'?'degraded':'info'});
            const rec=getRecord();
            if(rec?.lastJudgment?.payload===expected.payload) {
                const entry=rec.lastJudgment.opportunityPlan?.additions?.find(x=>x.id===item.id);
                if(entry)entry.delivery=reasonCode;
                rememberOpportunity(rec,item,reasonCode);
            }
        }
        const values=[receipt.scene,receipt.world].filter(value=>value!=='not_expected');
        const confirmed=values.every(value=>value==='confirmed');
        const message=(expected.judgmentWarning?'판독 일부 확인 필요 · ':'')+(confirmed?(phase==='request'?'전송 요청에 주입문 포함 확인':'주입문 조립 확인 · 전송 대기')
            :'전송문에서 주입문 전체를 확인하지 못했습니다. 실행 기록과 프리셋 기준 항목을 확인해 주세요.');
        updateStatus(message);
        updateActivity(message,confirmed&&!expected.judgmentWarning?{done:true}:{error:true});
        return receipt;
    }
    function observe(data,dryRun=false) {
        pending=null;
        const expected=getExpected();
        // The host forwards this same message array to its backend request.
        const messages=Array.isArray(data?.prompt)?data.prompt:Array.isArray(data?.messages)?data.messages:null;
        if(enabled&&!dryRun&&expected&&messages)pending={messages,expected};
        if(messages && (expected?.scenePreset || expected?.worldPreset))return null;
        return inspect(data,dryRun,messages?'assembly':'request',expected);
    }
    function observeRequest(data) {
        if(!pending||data?.messages!==pending.messages)return null;
        const {expected}=pending;pending=null;
        if(getExpected()!==expected)return null;
        return inspect(data,false,'request',expected);
    }
    const verifyRequest=data=>inspect(data,false,'request',getExpected());
    const inspectPrepared=data=>inspect(data,false,'assembly',getExpected());
    return {start,observe,observeRequest,verifyRequest,inspectPrepared};
}
