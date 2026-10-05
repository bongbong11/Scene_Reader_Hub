import assert from 'node:assert/strict';

export async function checkCurrentStatus(page,requests,setViewportSize,root) {
    // Earlier settings tests finish their asynchronous saves before this read-only audit.
    await page.waitForLoadState('networkidle');
    // Resizing the real dialog may persist UI settings; it must not run models.
    const inferenceCount=()=>requests.filter(item=>/systemone|\/api\/vector\/|chat-completions\/generate/.test(item.url)).length;
    const before=inferenceCount();
    const developerVisible=await page.locator('#sr-hub-trace-panel').isVisible();
    await page.evaluate(async()=>{
        const {createCurrentStatusView}=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/ui/current-status.js');
        const listeners=new Set(),events=[];
        let scope='synthetic-room';
        const hub={snapshot:()=>({events}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
        const view=createCurrentStatusView({hub,document,getScope:()=>scope});view.bind();
        window.statusFixture={emit:detail=>{events.push({sequence:events.length+1,cycleId:'hub-status-test',...detail});listeners.forEach(fn=>fn());},scope:value=>{scope=value;view.render();},dispose:()=>view.dispose()};
    });
    assert.equal(await page.locator('#sr-current-status').getAttribute('data-tone'),'neutral');
    await page.locator('#sr-current-status').click();
    assert.equal(await page.locator('#sr-current-status-panel').isVisible(),true);
    assert.equal(await page.locator('#sr-current-status').innerText(),'','status trigger is an icon, not a text button');
    await page.evaluate(()=>{
        statusFixture.emit({code:'RUN_STARTED'});
        statusFixture.emit({stage:'retrieval_request',phase:'insert',status:'succeeded',bankHash:'a'});
        statusFixture.emit({stage:'retrieval_request',phase:'query',status:'failed',bankHash:'a',errorKind:'RETRIEVAL_TIMEOUT'});
        statusFixture.emit({stage:'jev_request',requestKind:'decision',status:'succeeded'});
    });
    assert.equal(await page.locator('#sr-current-status').getAttribute('data-tone'),'error');
    assert.match(await page.locator('#scene-reader-quick-button img').getAttribute('src'),/mascot-face-error\.png$/);
    assert.match(await page.locator('#sr-current-status-panel').textContent(),/단어 매칭/);
    assert.equal(await page.locator('#sr-hub-trace-panel').isVisible(),developerVisible,'current status does not change the developer lock');
    for(const size of [{width:1280,height:900},{width:390,height:844},{width:320,height:640},{width:844,height:390}]){
        await setViewportSize(size);
        const layout=await page.evaluate(()=>{
            const header=document.querySelector('.sr-header'),title=header.querySelector('h2').getBoundingClientRect();
            const buttons=[...header.querySelectorAll('.sr-header-actions button')].map(node=>node.getBoundingClientRect());
            const panel=document.getElementById('sr-current-status-panel');panel.scrollTop=panel.scrollHeight;
            const last=panel.lastElementChild.lastElementChild.getBoundingClientRect(),rect=panel.getBoundingClientRect();
            return {overlap:title.right>buttons[0].left+1,overflow:header.scrollWidth>header.clientWidth+1,buttonsVisible:buttons.every(b=>b.left>=0&&b.right<=innerWidth),bottomReachable:last.bottom<=rect.bottom+1};
        });
        assert.deepEqual(layout,{overlap:false,overflow:false,buttonsVisible:true,bottomReachable:true},JSON.stringify(size));
        if(size.width===390)await page.screenshot({path:`${root}/artifacts/current-status-mobile.png`});
    }
    await page.locator('#sr-current-status').click();
    assert.equal(await page.locator('#sr-current-status-panel').isVisible(),false);
    await page.evaluate(()=>{
        statusFixture.emit({code:'RUN_STARTED'});
        statusFixture.emit({code:'PROMPT_REGISTERED',payloadChars:20});
        statusFixture.emit({code:'RUN_PREPARED'});
        statusFixture.emit({code:'PROMPT_OBSERVED',phase:'assembly',scene:'confirmed',world:'not_expected'});
    });
    assert.equal(await page.locator('#sr-current-status').getAttribute('data-tone'),'error','retry keeps the troubled face until verified recovery');
    assert.match(await page.locator('#scene-reader-quick-button img').getAttribute('src'),/mascot-face-error\.png$/);
    await page.evaluate(()=>statusFixture.emit({code:'PROMPT_OBSERVED',phase:'request',scene:'confirmed',world:'not_expected'}));
    assert.equal(await page.locator('#sr-current-status').getAttribute('data-tone'),'success');
    assert.match(await page.locator('#scene-reader-quick-button img').getAttribute('src'),/mascot-face\.webp$/);
    await page.evaluate(()=>statusFixture.scope('different-room'));
    assert.equal(await page.locator('#sr-current-status').getAttribute('data-tone'),'neutral');
    assert.equal(inferenceCount(),before,'viewing status does not start inference or vector requests');
    await setViewportSize({width:390,height:844});
    await page.evaluate(()=>statusFixture.emit({stage:'jev_request',requestKind:'decision',status:'failed',errorKind:'JEV_TIMEOUT'}));
    await page.locator('#sr-close').click();
    await page.waitForFunction(()=>{
        const icon=document.querySelector('#scene-reader-quick-button img');
        return icon.complete&&icon.naturalWidth>0&&icon.src.endsWith('mascot-face-error.png');
    });
    await page.locator('#scene-reader-quick-button').screenshot({path:`${root}/artifacts/current-status-small-icon.png`});
    await page.locator('#scene-reader-quick-button').click();
    assert.equal(await page.locator('#scene-reader-dialog').isVisible(),true,'the troubled mascot still opens the extension UI');
    assert.equal(await page.locator('#sr-current-status-panel').isVisible(),false,'the mascot must not open failure details');
    await page.locator('#sr-current-status').click();
    assert.equal(await page.locator('#sr-current-status-panel').isVisible(),true,'only the status button opens failure details');
    await page.evaluate(()=>statusFixture.dispose());
    console.log('Status UI passed: icon-only trigger, failure face/recovery, honest request receipt, no API work, mobile/landscape header and scrolling.');
}
