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
    await page.evaluate(()=>{
        statusFixture.emit({stage:'auxiliary_usage',status:'waiting',reasonCode:'interval_pending',turnCount:2,requiredTurns:3});
        statusFixture.emit({stage:'character_state_capture',status:'collected',collectorMode:'profile-output',count:2});
    });
    const panel=page.locator('#sr-current-status-panel');
    const continuity=panel.locator('[data-status-id="continuity"]');
    const delivery=panel.locator('[data-status-id="delivery"]');
    assert.equal(await panel.locator('.sr-status-row').count(),2,'only injection and continuity normal status rows');
    assert.match(await continuity.textContent(),/실행 전/);assert.match(await delivery.textContent(),/확인 전/);
    assert.doesNotMatch(await panel.textContent(),/연결모델 요청|감정 수집|2\/3|미확인 \/ 미사용|실행·요청 포함 확인 완료/);
    await page.evaluate(()=>statusFixture.emit({stage:'analysis_started',continuityIncluded:true}));
    assert.match(await continuity.textContent(),/실행 중/);assert.match(await delivery.textContent(),/확인 전/);
    await page.evaluate(()=>statusFixture.emit({stage:'analysis_result',status:'succeeded',continuityIncluded:true,acceptedCount:0}));
    assert.match(await continuity.textContent(),/실행 완료/);assert.match(await delivery.textContent(),/확인 전/);
    await page.evaluate(()=>statusFixture.emit({stage:'analysis_failed',reasonCode:'PROFILE_NETWORK_ERROR',continuityIncluded:true}));
    assert.match(await continuity.textContent(),/연결모델 오류/);
    assert.doesNotMatch(await continuity.textContent(),/PROFILE_NETWORK_ERROR|미확인/);
    await page.evaluate(()=>statusFixture.emit({stage:'analysis_result',status:'degraded',reasonCode:'PROFILE_NETWORK_ERROR',codeFallback:true,continuityIncluded:true}));
    assert.match(await continuity.textContent(),/연결모델 오류 · 코드 대체 실행/);
    await page.evaluate(()=>statusFixture.emit({stage:'analysis_result',status:'degraded',reasonCode:'CONTINUITY_PARTIAL_RESULT',continuityIncluded:true}));
    assert.match(await continuity.textContent(),/정상 항목은 반영/);
    assert.doesNotMatch(await continuity.textContent(),/연결모델 오류/,'an item shape problem is not a failed model call');
    for(const [phase,label]of [['request','모델 요청 실패'],['response','모델 응답 해석 실패'],['items','연속성 항목 처리 실패'],['storage','연속성 저장 실패']]){
        await page.evaluate(phase=>statusFixture.emit({stage:'analysis_failed',status:'failed',phase,reasonCode:'ANALYSIS_FAILED',continuityIncluded:true}),phase);
        assert.ok((await continuity.textContent()).includes(label));
    }
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
    await page.locator('#sr-current-status').click();
    assert.match(await delivery.textContent(),/확인됨/);assert.match(await continuity.textContent(),/실행 전/);
    assert.equal(await panel.locator('.sr-status-row').count(),2);
    await page.locator('#sr-current-status').click();
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
