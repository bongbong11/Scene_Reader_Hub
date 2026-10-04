import assert from 'node:assert/strict';
export async function checkRecoverySettings(page,store,requests,setViewportSize) {
    await page.locator('#sr-settings-button').click();
    await page.locator('.sr-scene-toast').evaluateAll(nodes=>nodes.forEach(node=>node.click()));
    assert.equal(await page.locator('.sr-connection-card > .sr-connection-grid > .sr-connection-pane').count(),3);
    assert.equal(await page.locator('.sr-connection-card details').count(),0,'keys stay open');
    assert.equal(await page.locator('#sr-debug-preview, #sr-owner-diagnostic-panel').count(),0);
    const savedFiles=JSON.stringify([store.characters,store.worlds]);
    const priorVertexAuth=store.settings.global.retrievalVertexAuth;
    const beforeStudio=requests.length;
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/settings')),page.locator('#sr-retrieval-provider').selectOption('palm')]);
    await page.waitForFunction(()=>document.getElementById('sr-retrieval-key-label').textContent==='Google AI Studio API 키');
    assert.equal(await page.locator('#sr-retrieval-provider option[value="palm"]').evaluate(node=>node.hidden||node.disabled),false,'AI Studio is independently selectable');
    assert.equal(await page.locator('#sr-retrieval-key-label').textContent(),'Google AI Studio API 키');
    assert.match(await page.locator('#sr-retrieval-key-help').textContent(),/Vertex AI를 선택/);
    await page.locator('#sr-retrieval-key').fill('synthetic-ai-studio-key');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/secrets/write')),page.locator('#sr-retrieval-key-save').click()]);
    await page.waitForFunction(()=>document.getElementById('sr-retrieval-key-save').disabled===false);
    const studioWrites=requests.slice(beforeStudio).filter(request=>request.url==='/api/secrets/write');
    assert.equal(studioWrites.length,1);
    assert.equal(studioWrites[0].body.key,'api_key_makersuite','AI Studio saves into its own host credential slot');
    assert.equal(store.settings.global.retrievalVertexAuth,priorVertexAuth,'AI Studio key save preserves Vertex authentication mode');
    const beforeStudioTest=requests.length;
    await page.locator('#sr-retrieval-test').click();
    await page.waitForFunction(()=>document.getElementById('sr-retrieval-test').disabled===false);
    assert.match(await page.locator('#sr-retrieval-key-status').textContent(),/AI Studio 연결 성공/);
    const studioQueries=requests.slice(beforeStudioTest).filter(request=>request.url==='/api/vector/query');
    assert.equal(studioQueries.length,1);
    assert.equal(studioQueries[0].body.source,'palm');
    assert.equal(studioQueries[0].body.model,'gemini-embedding-001');
    assert.equal('vertexai_auth_mode' in studioQueries[0].body,false,'AI Studio never uses Vertex authentication');
    await page.locator('#sr-retrieval-key').fill('unsaved-synthetic-key');
    const beforeVertex=requests.length;
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/settings')),page.locator('#sr-retrieval-provider').selectOption('vertexai')]);
    await page.waitForFunction(()=>document.getElementById('sr-retrieval-key-label').textContent==='Vertex Express API 키');
    assert.equal(await page.locator('#sr-retrieval-key').inputValue(),'','provider switch clears unsaved credentials');
    assert.equal(await page.locator('#sr-retrieval-key-label').textContent(),'Vertex Express API 키');
    assert.equal(requests.slice(beforeVertex).filter(request=>request.url==='/api/secrets/write').length,0,'provider switch does not overwrite stored credentials');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/settings')),page.locator('#sr-retrieval-provider').selectOption('transformers')]);
    await page.waitForFunction(()=>document.getElementById('sr-retrieval-key-row').hidden&&document.getElementById('sr-retrieval-key-save').hidden);
    assert.equal(await page.locator('#sr-retrieval-key-row').isVisible(),false);
    assert.equal(await page.locator('#sr-retrieval-key-save').isVisible(),false);
    const retry=async()=>{
        await page.locator('#sr-embedding-rebuild').click();
        await page.waitForFunction(()=>document.getElementById('sr-embedding-rebuild').disabled===false);
        assert.match(await page.locator('#sr-embedding-progress').textContent(),/기존 \d+개 재사용 · 생성 \d+개/);
        assert.equal(await page.locator('.sr-scene-toast[data-sr-state="working"]').count(),0,'completed maintenance must end its working toast');
    };
    await retry();const before=requests.length;await retry();
    assert.equal(requests.slice(before).filter(request=>request.url==='/api/vector/insert').length,0);
    assert.equal(requests.slice(before).filter(request=>request.url==='/api/vector/query' || request.url.endsWith('/systemone')).length,0);
    assert.match(await page.locator('#sr-embedding-progress').textContent(),/생성 0개/);
    assert.equal(JSON.stringify([store.characters,store.worlds]),savedFiles);
    page.once('dialog',dialog=>dialog.dismiss());const beforeDismiss=requests.length;
    await page.locator('#sr-embedding-full-rebuild').click();
    assert.equal(requests.length,beforeDismiss);
    page.once('dialog',dialog=>dialog.accept());await page.locator('#sr-embedding-full-rebuild').click();
    await page.waitForFunction(()=>document.getElementById('sr-embedding-rebuild').disabled===false);
    assert.ok(requests.slice(beforeDismiss).some(request=>request.url==='/api/vector/insert'));
    let release,entered;
    const hold=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
    await page.route('**/api/vector/insert',async route=>{
        entered();await hold;
        await route.fulfill({status:503,body:'Synthetic cancelled request'}).catch(()=>{});
    });
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#sr-embedding-full-rebuild').click();await started;
    await page.locator('#sr-embedding-cancel').click();
    await page.waitForFunction(()=>document.getElementById('sr-embedding-rebuild').disabled===false);
    assert.match(await page.locator('#sr-embedding-progress').textContent(),/작업 중단/);
    assert.equal(await page.locator('.sr-scene-toast[data-sr-state="working"]').count(),0);
    assert.equal(JSON.stringify([store.characters,store.worlds]),savedFiles);
    release();await page.unroute('**/api/vector/insert');await retry();
    for(const size of [{width:1280,height:900},{width:390,height:844},{width:844,height:390}]) {
        await setViewportSize(size);
        const layout=await page.locator('.sr-connection-card').evaluate(card=>{
            const bounds=card.getBoundingClientRect();
            return {columns:getComputedStyle(card.querySelector('.sr-connection-grid')).gridTemplateColumns.split(' ').length,
                fits:[...card.querySelectorAll('input,select,button')].filter(node=>node.getClientRects().length).every(node=>{const rect=node.getBoundingClientRect();return rect.left>=bounds.left-1&&rect.right<=bounds.right+1;}),
                scrollFits:card.scrollWidth<=card.clientWidth+2};
        });
        assert.equal(layout.fits,true);assert.equal(layout.scrollFits,true);
        if(size.width===390)assert.equal(layout.columns,1);
    }
    console.log('Browser recovery settings passed: open compact keys, duplicate UI removed, unchanged retry zero inserts, separate full replacement, declined rebuild, cancellation with recovery and responsive fit.');
}
