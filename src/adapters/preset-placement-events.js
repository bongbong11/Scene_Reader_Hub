// Native preset events refresh delivery only; they never start analysis.
export function watchPresetPlacement({host,eventSource,types,busy,refresh,clearPreview,reapply,report}) {
    let signature=host.stamp(host.read()),pending=Promise.resolve();
    const changed=()=>{
        const next=host.stamp(host.read());
        if(next===signature)return;
        signature=next;clearPreview();refresh();
        if(busy())return;
        pending=pending.then(()=>busy()?undefined:reapply()).catch(()=>report('preset_placement_refresh',{module:'src/adapters/preset-placement-events.js',status:'failed',errorKind:'PRESET_PLACEMENT_REFRESH_FAILED'}));
    };
    for(const type of new Set(['PRESET_CHANGED','PRESET_CHANGED_AFTER','OAI_PRESET_CHANGED_AFTER','SETTINGS_UPDATED'].map(key=>types[key]).filter(Boolean)))eventSource.on(type,changed);
}
