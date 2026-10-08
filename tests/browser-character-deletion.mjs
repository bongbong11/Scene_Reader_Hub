import assert from 'node:assert/strict';
import {importRecordVersion} from '../src/character/versions.js';
import {defaultCharacterStore} from '../src/character/store.js';

export async function checkCharacterDeletion(page,store,requests,setViewportSize) {
    const person=name=>({entity_type:'character',entity_name:name,records:[{type:'core',target:'self',when:['conversation'],rule:'Speaks clearly.',modality:'habit',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]});
    let seeded=importRecordVersion(defaultCharacterStore(),person('Fixture wrong name'),'Shared file');
    const target=seeded.entry.id;
    seeded=importRecordVersion(seeded.store,person('Fixture wrong name'),'Older file');
    seeded=importRecordVersion(seeded.store,person('Fixture sibling'),'Shared file');
    const sibling=seeded.entry.id;
    store.characters=seeded.store;
    store.settings.global.continuityEnabled=false;
    store.settings.global.recentTurns=3;
    const open=async()=>{await page.reload();await page.locator('#scene-reader-quick-button').click();await page.locator('[data-sr-tab="characters"]').click();};
    await open();
    const button=()=>page.locator(`[data-record-action="delete-person"][data-person-id="${target}"]`).first();
    for(const width of [320,390,1280]) {
        await setViewportSize({width,height:850});await button().scrollIntoViewIfNeeded();
        assert.equal(await page.locator('#scene-reader-dialog').evaluate(node=>node.scrollWidth>node.clientWidth+2),false);
        assert.equal(await button().evaluate(node=>{const r=node.getBoundingClientRect();return r.width<100&&r.height>=28&&node.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));}),true);
    }
    const snapshot=JSON.stringify(store.characters),writes=()=>requests.filter(item=>item.url.endsWith('/characters')).length,before=writes();
    page.once('dialog',dialog=>dialog.dismiss());await button().click();
    assert.equal(JSON.stringify(store.characters),snapshot);assert.equal(writes(),before,'cancel does not write');
    const failedRoute=/\/storage\/characters$/;
    await page.route(failedRoute,route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Synthetic failed save'})}));
    page.once('dialog',dialog=>dialog.accept());await button().click();
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('저장되지 않음'));
    assert.equal(JSON.stringify(store.characters),snapshot,'failed deletion preserves source and versions');
    await page.unroute(failedRoute);assert.equal(await page.locator('#sr-character-modal').isHidden(),true,'delete failure does not open an unrelated editor');
    page.once('dialog',dialog=>{assert.match(dialog.message(),/모든 저장본 2개/);return dialog.accept();});await button().click();
    await page.waitForFunction(id=>!document.querySelector(`[data-person-id="${id}"]`),target);
    assert.equal(writes(),before+1,'one durable character update');
    assert.equal(store.characters.characters.some(entry=>entry.id===target),false);
    assert.equal(store.characters.recordGroups.flatMap(group=>group.versions).some(version=>version.entryId===target),false);
    assert.equal(store.characters.characters.some(entry=>entry.id===sibling),true);
    assert.equal(store.chat.lastJudgment,null,'prepared judgment invalidated');
    await open();assert.equal(await page.locator(`[data-person-id="${target}"]`).count(),0,'reload cannot restore a deleted registration');
    const lastVersion=store.characters.recordGroups[0].versions[0].id;
    page.once('dialog',dialog=>dialog.accept());await page.locator(`[data-record-action="delete"][data-record-version="${lastVersion}"]`).click();
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('해당 버전을 삭제'));
    const empty=page.locator(`[data-person-id="${sibling}"]`);assert.equal(await empty.count(),1);
    page.once('dialog',dialog=>dialog.accept());await empty.click();
    await page.waitForFunction(()=>document.getElementById('sr-character-versions').textContent.includes('저장된 인물이 없습니다'));

    await page.locator('#sr-settings-button').click();
    const count=page.locator('#sr-recent-turns'),continuity=page.locator('#sr-continuity-enabled');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),count.selectOption('1')]);
    assert.equal(store.settings.global.recentTurns,1);
    await continuity.check();await page.waitForFunction(()=>document.getElementById('sr-recent-turns').value==='2');
    assert.equal(store.settings.global.continuityEnabled,true);assert.equal(store.settings.global.recentTurns,2);
    assert.equal(await count.locator('option[value="1"]').count(),0);
    await continuity.uncheck();await page.waitForFunction(()=>document.querySelector('#sr-recent-turns option[value="1"]'));
    assert.equal(await count.inputValue(),'2','turning off does not force a lower value');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),count.selectOption('5')]);
    await continuity.check();await page.waitForFunction(()=>!document.querySelector('#sr-recent-turns option[value="1"]'));
    assert.equal(await count.inputValue(),'5');
    await open();await page.locator('#sr-settings-button').click();assert.equal(await count.inputValue(),'5');
    assert.equal(await count.locator('option[value="1"]').count(),0);
    console.log('Browser person deletion and turn settings passed: mobile controls, cancel/failure/sibling/reload/empty registration and continuity min-two persistence.');
}
