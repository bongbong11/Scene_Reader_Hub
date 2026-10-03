import assert from 'node:assert/strict';
export async function checkRecoverySettings(page,store,requests,setViewportSize) {
    await page.locator('#sr-settings-button').click();
    await page.locator('.sr-scene-toast').evaluateAll(nodes=>nodes.forEach(node=>node.click()));
    assert.equal(await page.locator('.sr-connection-card > .sr-connection-grid > .sr-connection-pane').count(),3);
    assert.equal(await page.locator('.sr-connection-card details').count(),0,'keys stay open');
    assert.equal(await page.locator('#sr-debug-preview, #sr-owner-diagnostic-panel').count(),0);
    const savedFiles=JSON.stringify([store.characters,store.worlds]);
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/settings')),page.locator('#sr-retrieval-provider').selectOption('transformers')]);
    assert.equal(await page.locator('#sr-retrieval-key-row').isVisible(),false);
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
