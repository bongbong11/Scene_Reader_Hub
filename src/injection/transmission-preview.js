// One in-memory receipt, captured at transport handoff. Never persisted or logged.
export function createTransmissionPreview({isCurrent, enabled, render}) {
    let saved=null,cleared='';
    const listeners=new Set();
    const notify=()=>{for(const listener of listeners)try{listener();}catch{/* UI cannot interrupt transport */}};
    function clear(reason='reset'){saved=null;cleared=typeof reason==='string'?reason:'reset';notify();}
    function read(){
        if(!saved || !enabled() || !isCurrent(saved.owner))return null;
        return {...saved.view};
    }
    function capture(body,owner){
        const suppressed=owner.independentDelivery?owner.characterSuppressed:owner.sceneSuppressed;
        const expected=render(owner.independentDelivery?(owner.characterRoute==='macro'?owner.independentCharacter||'':owner.basePayload||''):owner.characterRoute==='macro'?owner.characterPayload||'':owner.payload||'');
        const matches=[];
        if(expected && !suppressed)for(const [index,message] of (body.messages||[]).entries()){
            const texts=typeof message.content==='string'?[message.content]:Array.isArray(message.content)?message.content.filter(p=>p?.type==='text').map(p=>p.text||''):[];
            for(const text of texts){
                const start=text.indexOf(expected);
                if(start>=0)matches.push({text:text.slice(start,start+expected.length),index,role:message.role,duplicate:text.indexOf(expected,start+expected.length)>=0});
            }
        }
        const match=matches.length===1&&!matches[0].duplicate?matches[0]:null;
        return {owner,view:{status:suppressed?'disabled':owner.characterRoute==='macro'?(match?'included':'unconfirmed'):(match?'fallback':'unconfirmed'),
            text:match?.text||'',messageIndex:match?match.index+1:null,role:match?.role||'',at:new Date().toISOString()}};
    }
    function sent(receipt){saved=receipt;cleared='';notify();}
    function failed(receipt){if(saved!==receipt)return;saved={...receipt,view:{...receipt.view,status:'failed',text:''}};notify();}
    return {clear,read,capture,sent,failed,emptyReason:()=>saved?'context_changed':cleared,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}};
}
