import assert from 'node:assert/strict';
import path from 'node:path';
export async function checkWorldAgency(page,store,requests,setViewportSize,root) {
    await page.locator('[data-sr-tab="flow"]').click();
    const box=page.locator('#sr-world-agency');
    assert.equal(await box.count(),1);
    const initial=await box.isChecked();
    const count=()=>requests.filter(r=>/systemone|\/api\/vector\/|chat-completions\/generate/.test(r.url)).length;
    const before=count();
    await box.setChecked(!initial);await page.waitForLoadState('networkidle');
    assert.equal(store.chat.preferences.worldAgencyEnabled,!initial);
    await page.reload();await page.locator('#scene-reader-quick-button').waitFor();await page.locator('#scene-reader-quick-button').click();await page.locator('[data-sr-tab="flow"]').click();
    assert.equal(await box.isChecked(),!initial);
    for(const size of [{width:320,height:700},{width:390,height:844},{width:430,height:850},{width:844,height:390}]) {
        await setViewportSize(size);await box.scrollIntoViewIfNeeded();
        const layout=await box.evaluate(node=>{
            const card=node.closest('.sr-control-card'),r=card.getBoundingClientRect(),label=node.closest('label').getBoundingClientRect();
            return {overflow:card.scrollWidth>card.clientWidth+1,inside:label.left>=r.left-1&&label.right<=r.right+1,visible:label.height>0};
        });
        assert.deepEqual(layout,{overflow:false,inside:true,visible:true});
        if(size.width===390)await page.screenshot({path:path.join(root,'artifacts','world-agency-mobile.png')});
    }
    await box.setChecked(initial);await page.waitForLoadState('networkidle');
    assert.equal(count(),before,'settings change never starts judgment or embedding');
    console.log('World agency browser: one compact toggle, persisted reload, 320/390/430px and landscape fit, no inference on setting changes.');
}
