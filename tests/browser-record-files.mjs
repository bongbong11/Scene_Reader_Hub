import assert from 'node:assert/strict';
import {importRecordBundle} from '../src/character/bundles.js';
import {defaultCharacterStore} from '../src/character/store.js';

export async function checkRecordFiles(page,store,setViewportSize){
 const original=structuredClone(store);
 const person=name=>({entity_type:'character',entity_name:name,intimacy_reference:{text:'',source_ids:[]},records:[{type:'core',target:'self',when:['quiet conversation'],rule:`${name} prefers quiet conversation.`,modality:'preference',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]});
 try{
  const result=importRecordBundle(defaultCharacterStore(),{entities:[person('Aster'),person('Briar')]},'Shared folder');store.characters=result.store;
  await page.reload();await page.locator('#scene-reader-quick-button').click();await page.locator('[data-sr-tab="characters"]').click();
  const root=page.locator('#sr-character-versions'),bundle=root.locator('.sr-record-bundle'),initialCount=store.characters.recordGroups[0].versions.length;
  const groupId=store.characters.recordGroups[0].id,actorId=store.characters.characters[0].id,olderId=store.characters.characters[0].appliedRecordVersion;
  await bundle.locator('summary [data-record-action="add-file"]').click();const dialog=page.locator('.sr-record-file-dialog');
  assert.equal(await bundle.evaluate(el=>el.open),true,'file button does not toggle the folder');
  await dialog.locator('[data-person]').selectOption(actorId);
  const upload=async name=>{await dialog.locator('[data-file]').setInputFiles({name:'updated.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(person(name)))});await dialog.locator('[data-status]').filter({hasText:'저장 전'}).waitFor();};
  await upload('Aster alternate');assert.equal(store.characters.recordGroups[0].versions.length,initialCount,'selecting a file does not save it');
  await setViewportSize({width:320,height:640});assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);assert.equal(await dialog.evaluate(el=>el.getBoundingClientRect().height<=innerHeight),true);
  const fail=route=>route.fulfill({status:500,json:{error:'Synthetic failed write'}});await page.route('**/storage/characters',fail);await dialog.locator('[data-save]').click();await dialog.locator('[data-status]').filter({hasText:'저장되지 않음'}).waitFor();assert.equal(store.characters.recordGroups[0].versions.length,initialCount);assert.equal(store.characters.characters[0].appliedRecordVersion,olderId);await page.unroute('**/storage/characters',fail);
  await dialog.locator('[data-save]').click();await dialog.waitFor({state:'hidden'});
  assert.equal(store.characters.characters.length,2);assert.equal(store.characters.recordGroups.length,1);assert.equal(store.characters.recordGroups[0].id,groupId);assert.equal(store.characters.recordGroups[0].versions.length,initialCount+1);assert.equal(store.characters.characters[0].id,actorId);assert.equal(store.characters.characters[0].name,'Aster');
  const addedId=store.characters.characters[0].appliedRecordVersion;
  assert.equal(await root.locator(`[data-version-id="${addedId}"] .sr-record-applied`).textContent(),'✓ 적용 중');
  await root.locator(`[data-record-action="apply"][data-record-version="${olderId}"]`).click();await page.waitForFunction(id=>document.querySelector(`[data-version-id="${id}"] .sr-record-applied`),olderId);
  assert.equal(store.characters.characters[0].appliedRecordVersion,olderId);assert.equal(await root.locator(`[data-version-id="${addedId}"] [data-record-action="apply"]`).count(),1);
  await bundle.locator('summary [data-record-action="add-file"]').click();await dialog.locator('[data-person]').selectOption(actorId);
  await dialog.locator('[data-file]').setInputFiles({name:'wrong-person.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(person('Briar')))});await dialog.locator('[data-status]').filter({hasText:'다른 저장 인물'}).waitFor();assert.equal(await dialog.locator('[data-save]').isDisabled(),true);
  await dialog.locator('[data-close]').click();
  assert.equal(await root.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
  console.log('Record file UI passed: top-level add, owner choice, spelling variation, staged import, failed save retention, active marker switch and mobile fit.');
 }finally{Object.assign(store,original);await setViewportSize({width:1280,height:900});await page.reload();}
}
