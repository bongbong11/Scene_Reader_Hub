import assert from 'node:assert/strict';
import path from 'node:path';
export async function checkAnalysisSettings(page,store,requests,setViewportSize,root) {
 if(!await page.locator('#sr-continuity-enabled').isVisible())await page.locator('#sr-settings-button').click();
 const previous={...store.settings.global},before=await page.evaluate(()=>mock.profileRequestCount||0);
 await page.locator('#sr-continuity-enabled').check();
 await page.locator('#sr-reasoner-profile').selectOption('test-profile');
 await page.locator('[data-sr-tab="characters"]').click();
 for(const id of ['sr-continuity-interval','sr-collect-persona-changes','sr-analysis-now','sr-analysis-status','sr-evolution-results'])assert.equal(await page.locator('#'+id).count(),1);
 assert.equal(await page.locator('#sr-continuity-interval').inputValue(),'3');
 await page.locator('#sr-continuity-interval').selectOption('5');
 await page.waitForFunction(()=>document.getElementById('sr-continuity-interval').value==='5');
 await page.locator('#sr-collect-persona-changes').check();
 await page.waitForFunction(()=>document.getElementById('sr-collect-persona-changes').checked);
 assert.equal(store.settings.global.continuityInterval,5);assert.equal(store.settings.global.collectPersonaChanges,true);
 assert.equal(await page.locator('#sr-user-impersonation').isChecked(),false,'persona collection does not enable impersonation');
 for(const size of [{width:320,height:700},{width:360,height:740},{width:390,height:844},{width:1280,height:900}]){
  await setViewportSize(size);await page.locator('.sr-analysis-controls').scrollIntoViewIfNeeded();
  const fit=await page.locator('.sr-analysis-controls').evaluate(card=>{const r=card.getBoundingClientRect();return {overflow:card.scrollWidth>card.clientWidth+1,controls:[...card.children].map(n=>{const b=n.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,height:b.height};}),left:r.left,right:r.right};});
  assert.equal(fit.overflow,false);assert.ok(fit.controls.every(n=>n.left>=fit.left-1&&n.right<=fit.right+1));assert.ok(fit.controls[1].height<=29&&fit.controls[2].height<=29);
  assert.ok(Math.abs(fit.controls[1].top-fit.controls[2].top)<=1,'select and button share one compact row');
  if(size.width===390)await page.screenshot({path:path.join(root,'artifacts','analysis-mobile.png')});
 }
 assert.equal(await page.evaluate(()=>mock.profileRequestCount||0),before,'opening and configuring UI does not start analysis');
 await page.locator('#sr-continuity-interval').selectOption('3');await page.locator('#sr-collect-persona-changes').uncheck();
 await page.locator('#sr-settings-button').click();await page.locator('#sr-continuity-enabled').uncheck();
 await page.locator('[data-sr-tab="characters"]').click();assert.ok(await page.locator('#sr-analysis-now').isDisabled());
 assert.match(await page.locator('#sr-analysis-status').textContent(),/꺼짐/);
 if(previous.continuityEnabled){await page.locator('#sr-settings-button').click();await page.locator('#sr-continuity-enabled').check();}
 console.log('Browser cumulative settings passed: mobile compact controls, persisted 3/5 interval, independent persona collection, disabled state and no unsolicited inference.');
}
