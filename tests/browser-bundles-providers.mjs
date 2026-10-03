import assert from 'node:assert/strict';
import path from 'node:path';

export async function checkBundlesAndProviders(page, store, requests, root, setViewportSize) {
    await page.locator('[data-sr-tab="characters"]').click();
    await page.locator('#sr-character-new').click();
    assert.equal(await page.locator('#sr-character-cast-row').isHidden(),true);
    await page.locator('[data-character-import-mode="multi"]').click();
    assert.equal(await page.locator('#sr-character-cast-row').isVisible(),true);
    await page.evaluate(()=>{
        const character=ctx.characters[ctx.characterId],card=character.data||character;
        card.name='Archive trio';card.description='Aster tends the north garden. Briar guards the south bridge. Cedar keeps the east key.';card.personality='';
    });
    await page.locator('#sr-character-read-sheet').click();
    await page.locator('#sr-character-cast-names').fill('Aster\nBriar\nCedar');
    await page.locator('#sr-character-copy-prompt').click();
    const prompt=await page.evaluate(()=>navigator.clipboard.readText());
    assert.match(prompt,/MULTI-PERSON OWNERSHIP/);assert.match(prompt,/"entities"/);
    assert.equal(prompt.split('Aster tends the north garden.').length,2);
    const file={entities:['Aster','Briar','Cedar'].map(name=>({entity_type:'character',entity_name:name,intimacy_reference:{text:'',source_ids:[]},records:[{type:'core',target:'',when:['quiet conversation'],rule:`${name} prefers a quiet conversation.`,modality:'preference',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]}))};
    await page.locator('#sr-character-import-file').setInputFiles({name:'archive.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(file))});
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('3명으로'));
    assert.equal(await page.locator('.sr-import-person-preview').count(),3);
    await page.locator('#sr-character-import-name').fill('Archive bundle');
    const writes=requests.filter(r=>r.url.endsWith('/characters')).length;
    await page.locator('#sr-character-import').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-modal').hidden);
    assert.equal(requests.filter(r=>r.url.endsWith('/characters')).length,writes+1,'one durable write for the entire file');
    const group=store.characters.recordGroups.find(g=>g.name==='Archive bundle');
    assert.equal(group.versions.length,3);
    const bundle=page.locator(`[data-record-bundle="${group.id}"]`);
    assert.match(await bundle.locator('summary').first().textContent(),/3명/);
    assert.equal(await bundle.locator('.sr-record-person').count(),3);
    await bundle.locator('summary').first().click();
    assert.equal(await bundle.evaluate(e=>e.open),false);
    await bundle.locator('summary').first().click();
    await page.locator('.sr-scene-toast').evaluateAll(nodes=>nodes.forEach(node=>node.click()));
    for(const width of [390,1280]){
        await setViewportSize({width,height:850});
        assert.equal(await page.locator('#scene-reader-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+2),false);
        await bundle.scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(root,'artifacts',`character-bundle-${width}.png`)});
    }
    const version=group.versions.find(v=>v.entityName==='Aster');
    await page.locator(`[data-record-version="${version.id}"][data-record-action="edit"]`).click();
    assert.equal(await page.locator('[data-character-import-mode="single"]').getAttribute('aria-selected'),'true','one member may be edited independently');
    assert.equal(await page.locator('#sr-character-import-name').inputValue(),'Archive bundle');
    await page.locator('#sr-character-editor-cancel').click();

    const outbound=[];
    await page.route('https://openrouter.ai/api/v1/systemone',async route=>{
        outbound.push({url:route.request().url(),headers:await route.request().allHeaders(),body:route.request().postDataJSON()});
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({answers:{connection:{choice:'yes'}}})});
    });
    await page.route('https://ai-gateway.vercel.sh/typesafe/v1/systemone',async route=>{
        outbound.push({url:route.request().url(),headers:await route.request().allHeaders(),body:route.request().postDataJSON()});
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({answers:{connection:{choice:'yes'}}})});
    });
    await page.locator('#sr-settings-button').click();
    await page.locator('#sr-jev-key').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
    assert.equal(await page.locator('#sr-jev-provider').inputValue(),'typesafe','existing server key retains its provider');
    assert.equal(await page.locator('#sr-jev-provider option[value="auto"]').count(),0);
    const initialKeys=await page.evaluate(()=>localStorage.getItem('sceneReader.jevBrowserKey'));
    await page.locator('#sr-jev-provider').selectOption('');
    await page.locator('#sr-jev-key').fill('sk-or-v1-synthetic-browser');
    for(const button of ['#sr-jev-save','#sr-jev-test']) {
        await page.locator(button).click();
        await page.waitForFunction(()=>document.getElementById('sr-jev-status').textContent.includes('발급처를 먼저 선택'));
    }
    assert.equal(outbound.length,0,'missing provider never probes an external service');
    assert.equal(await page.evaluate(()=>localStorage.getItem('sceneReader.jevBrowserKey')),initialKeys);
    await page.locator('#sr-jev-provider').selectOption('typesafe');
    const hostCalls=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.locator('#sr-jev-save').click();
    await page.waitForFunction(()=>document.getElementById('sr-jev-status').textContent.includes('키 형식이 다릅니다'));
    assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,hostCalls,'known mismatched key never reaches the host relay');
    for(const [provider,key,model] of [['openrouter','sk-or-v1-synthetic-browser','jev-latest'],['vercel','vck_synthetic-browser','typesafe-ai/jev']]){
        await page.locator('#sr-jev-provider').selectOption(provider);
        await page.locator('#sr-jev-key').fill(key);
        const beforeTest=outbound.length;
        await page.locator('#sr-jev-test').click();
        await page.waitForFunction(()=>document.getElementById('sr-jev-status').textContent.includes('키 저장을 먼저'));
        assert.equal(outbound.length,beforeTest,'saved-key test cannot silently test another key while a new key is entered');
        await page.locator('#sr-jev-save').click();
        await page.waitForFunction(()=>document.getElementById('sr-jev-key').value==='');
        assert.equal(store.settings.global.jevProvider,provider);
        const actual=outbound.at(-1);
        assert.equal(actual.headers.authorization,'Bearer '+key);assert.equal(actual.body.model,model);
        assert.equal(actual.headers['x-csrf-token'],undefined);assert.equal(actual.headers.referer,undefined);
        assert.ok(!JSON.stringify(store.settings).includes(key),'browser key never enters shared settings/backup');
        await page.evaluate(()=>document.getElementById('scene-reader-dialog').close());
        await page.locator('#scene-reader-quick-button').click();
        assert.equal(await page.locator('#sr-jev-provider').inputValue(),provider,'reopening displays the saved provider');
    }
    const count=outbound.length,before=await page.evaluate(()=>localStorage.getItem('sceneReader.jevBrowserKey'));
    await page.locator('#sr-jev-provider').selectOption('');
    await page.locator('#sr-jev-key').fill('unrecognized-synthetic-key');
    await page.locator('#sr-jev-save').click();
    await page.waitForFunction(()=>document.getElementById('sr-jev-status').textContent.includes('발급처를 먼저 선택'));
    assert.equal(outbound.length,count,'unknown key is not probed against services');
    assert.equal(await page.evaluate(()=>localStorage.getItem('sceneReader.jevBrowserKey')),before,'failed detection preserves the saved key');
    await page.evaluate(()=>mock.errors=[]);
    await page.locator('#sr-jev-key').fill('');
    await page.locator('#sr-jev-provider').selectOption('vercel');
    await page.locator('#sr-jev-test').click();
    await page.waitForFunction(()=>document.getElementById('sr-jev-status').textContent.includes('키 인증 성공'));
    await page.locator('.sr-scene-toast').evaluateAll(nodes=>nodes.forEach(node=>node.click()));
    await page.locator('#sr-jev-key').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'artifacts','jev-key-provider.png')});
    console.log('Browser additions passed: multi/single tabs, shared-source prompt, per-person preview, one-write import, grouped desktop/mobile history, explicit key provider, direct service routing and saved-key preservation.');
}
