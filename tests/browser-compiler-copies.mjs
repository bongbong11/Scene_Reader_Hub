import assert from 'node:assert/strict';

export async function checkCompilerCopies(page,requests,store) {
    await page.locator('[data-sr-tab="characters"]').click();
    for(const id of ['sr-character-new','sr-persona-new','sr-npc-sheet-new']) {
        await page.locator('#'+id).click();
        assert.match(await page.locator('#sr-character-copy-note').textContent(),/기본 분석 명령문만/);
        await page.locator('#sr-character-copy-prompt').click();
        await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('기본 분석 명령문만 복사했습니다'));
        const prompt=await page.evaluate(()=>navigator.clipboard.readText());
        assert.match(prompt,/저장 형식과 흔한 오류/);assert.match(prompt,/원문도 없으면/);
        if(id==='sr-character-new') {
            await page.locator('[data-character-import-mode="multi"]').click();
            await page.locator('#sr-character-copy-prompt').click();
            assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/MULTI-PERSON OWNERSHIP/);
            assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/원문 미첨부/);
            await page.locator('#sr-character-read-sheet').click();
            assert.match(await page.locator('#sr-character-copy-note').textContent(),/시트 원문.*포함/);
            const count=requests.filter(r=>r.url.endsWith('/characters')).length;
            await page.locator('#sr-character-import-file').setInputFiles({name:'wrong-shape.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({characters:[{name:'Synthetic',personality:{traits:['quiet']}}]}))});
            await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('인물 시트를 정리한 형식'));
            await page.locator('#sr-character-import').click();
            assert.match(await page.locator('#sr-character-import-status').textContent(),/저장할 인물 JSON이 없습니다/);
            await page.locator('#sr-character-error-copy').click();
            const report=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));
            assert.equal(report.stage,'parse');assert.ok(report.input_length>0,'empty save must preserve original file-read diagnostics');
            assert.equal(requests.filter(r=>r.url.endsWith('/characters')).length,count);
            await page.evaluate(()=>mock.errors=[]);
        }
        await page.locator('#sr-character-editor-cancel').click();
    }
    // A base prompt can produce a standalone file without reading the card first.
    await page.locator('#sr-character-new').click();
    await page.locator('[data-character-import-mode="multi"]').click();
    const record={type:'core',target:'',when:['making a choice'],rule:'The person prefers careful choices.',modality:'preference',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'};
    const entities=['Copy A','Copy B'].map(name=>({entity_type:'character',entity_name:name,intimacy_reference:{text:'',source_ids:[]},records:[record]}));
    await page.locator('#sr-character-import-file').setInputFiles({name:'source-free-cast.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({entities}))});
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('형식 검사 완료'));
    await page.locator('#sr-character-import').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-editor').hidden);
    assert.equal(store.characters.characters.find(entry=>entry.name==='Copy A').cardCast.cardName,'Hunter','source-free cast remains bound to the current card');
    await page.locator('[data-sr-tab="flow"]').click();
    await page.locator('#sr-world-profile').selectOption('current');
    await page.locator('[data-sr-tab="advanced"]').click();
    await page.locator('#sr-world-advanced-copy').evaluate(e=>{for(let p=e.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
    await page.locator('#sr-world-advanced-copy').click();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/원문 미첨부/);
    const chosen=await page.locator('#sr-world-profile option').evaluateAll(options=>options.find(o=>o.value!=='current')?.value);
    await page.locator('[data-sr-tab="flow"]').click();
    await page.locator('#sr-world-profile').selectOption(chosen);
    await page.locator('[data-sr-tab="advanced"]').click();
    assert.match(await page.locator('#sr-world-copy-note').textContent(),/세계관 원문.*포함/);
    await page.locator('#sr-world-advanced-copy').click();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/WORLD SOURCE DATA/);
    await page.locator('[data-sr-tab="flow"]').click();
    await page.locator('#sr-world-profile').selectOption('current');
    await page.locator('[data-sr-tab="characters"]').click();
    console.log('Browser compiler copies passed: source-free character/persona/NPC/multi, source notices, schema error persistence, no partial save, world basic and included modes.');
}
