// Native preset events refresh delivery only; they never start analysis.
import {StaleRunError} from '../lifecycle/jobs.js';
export function watchPresetPlacement({host,eventSource,types,busy,refresh,clearPreview,reapply,report,getScope=()=>'',schedule=setTimeout}) {
    let signature=host.stamp(host.read()),pending=Promise.resolve(),queued=false,timer=null,scope='';
    const flush=()=>{
        timer=null;
        if(!queued)return;
        if(scope!==getScope()){queued=false;return;}
        if(busy()){timer=schedule(flush,250);return;}
        queued=false;
        const expected=signature,owner=scope;
        pending=pending.then(()=>{
            if(owner!==getScope()||expected!==host.stamp(host.read()))return;
            if(busy()){queued=true;scope=owner;if(timer===null)timer=schedule(flush,250);return;}
            return reapply(()=>{if(owner!==getScope()||expected!==host.stamp(host.read()))throw new StaleRunError();});
        }).catch(error=>{if(error instanceof StaleRunError)return;report('preset_placement_refresh',{module:'src/adapters/preset-placement-events.js',status:'failed',errorKind:'PRESET_PLACEMENT_REFRESH_FAILED'});});
    };
    const changed=()=>{
        const next=host.stamp(host.read());
        if(next===signature)return;
        signature=next;clearPreview('preset_changed');refresh();
        queued=true;scope=getScope();
        if(timer===null)flush();
    };
    for(const type of new Set(['PRESET_CHANGED','PRESET_CHANGED_AFTER','OAI_PRESET_CHANGED_AFTER','SETTINGS_UPDATED'].map(key=>types[key]).filter(Boolean)))eventSource.on(type,changed);
}
