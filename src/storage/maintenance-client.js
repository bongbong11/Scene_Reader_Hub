export function createMaintenanceClient({post,chatKey,scope,isBusy}){
    let capability,account,context='',pending;
    function sync(){const next=scope();if(account!==next){account=next;capability=undefined;context='';}return next;}
    async function available(){
        sync();if(!capability){const job=post('v2/capabilities').then(value=>value.features?.includes('scoped-reclaim')===true);capability=job;job.catch(()=>{if(capability===job)capability=undefined;});}
        return capability;
    }
    async function request(route,body={}){
        const started=sync();
        if(!await available())throw new Error('저장 파일 정리를 사용하려면 서버 플러그인을 업데이트하고 SillyTavern을 다시 시작해 주세요.');
        if(started!==sync())throw new Error('사용자가 바뀌었어요. 다시 열어 주세요.');
        const result=await post('v2/maintenance/'+route,body);
        if(started!==sync())throw new Error('사용자가 바뀌었어요. 다시 열어 주세요.');
        return result.maintenance;
    }
    async function refreshContext(){
        if(pending){await pending;return refreshContext();}
        const started=sync(),key=chatKey();if(!await available()||started!==sync()||context===key)return;
        if(pending){await pending;return refreshContext();}
        const job=request('configure',{chatKey:key}).then(()=>{if(started===sync())context=key;});pending=job;
        try{await job;}finally{if(pending===job)pending=null;}
        if(started!==sync()||key!==chatKey())return refreshContext();
    }
    return {refreshContext,status:()=>request('status'),configure:mode=>request('configure',{mode,chatKey:chatKey()}),start:()=>{
        if(isBusy())throw new Error('판독과 저장을 마치거나 취소한 뒤 정리해 주세요.');
        return request('start',{chatKey:chatKey()});
    }};
}
