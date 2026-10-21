import assert from 'node:assert/strict';
export async function checkJevSettings(page){
    const result=await page.evaluate(async()=>{
        const {bindNanoJev,renderJevConnection}=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/ui/nanogpt-jev.js');
        const doc=document.implementation.createHTMLDocument('Jev settings fixture');
        doc.body.append(document.getElementById('sr-jev-connection').closest('.sr-connection-pane').cloneNode(true));
        const settings={jevConnection:'typesafe',jevOfficialModel:'jev-latest',jevNanoModel:'typesafe/jev-1.14'},calls=[],writes=[];
        let clears=0;
        const deps={document:doc,settings,window:{},invalidateReasonerJobs:()=>{},invalidatePreparedJudgment:()=>{},updateKeyStatus:()=>{},
            clearInjection:async()=>{clears++;renderJevConnection(deps);},saveGlobal:async(key,value)=>{settings[key]=value;},
            callJev:async(_body,_timeout,_signal,connection)=>{calls.push(connection);return {answers:{connection:{choice:'yes'}}};},
            storagePost:async(route,body)=>{writes.push({route,body});return {ok:true};}};
        bindNanoJev(deps);
        const el=id=>doc.getElementById(id),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
        async function select(id,value){el(id).value=value;el(id).dispatchEvent(new Event('change'));await tick();}
        await select('sr-official-jev-model','jev-1.14.0');
        await select('sr-jev-connection','nanogpt');
        const nanoVisible=!el('sr-jev-nanogpt').hidden&&el('sr-jev-typesafe').hidden;
        await select('sr-nano-jev-model','typesafe/jev-1.13');
        el('sr-nano-jev-key').value='synthetic-key';el('sr-nano-jev-save').click();await tick();
        const cleared=el('sr-nano-jev-key').value==='';
        el('sr-nano-jev-test').click();await tick();
        await select('sr-jev-connection','typesafe');
        return {settings,calls,writes,nanoVisible,cleared,clears,officialVisible:!el('sr-jev-typesafe').hidden&&el('sr-jev-nanogpt').hidden};
    });
    assert.equal(result.settings.jevOfficialModel,'jev-1.14.0');
    assert.equal(result.settings.jevNanoModel,'typesafe/jev-1.13');
    assert.equal(result.settings.jevConnection,'typesafe');
    assert.equal(result.clears,4);assert.ok(result.nanoVisible&&result.officialVisible&&result.cleared);
    assert.equal(result.calls.length,2);
    assert.equal(result.calls[0].provider,'nanogpt');assert.equal(result.calls[0].model,'typesafe/jev-1.13');
    assert.equal(result.calls[1].key,'');
    assert.equal(result.writes[0].route,'nanogpt/key');
    console.log('Jev settings browser passed: provider/model switching, stale injection clearing, independent saved versions, NanoGPT key save and test.');
}
