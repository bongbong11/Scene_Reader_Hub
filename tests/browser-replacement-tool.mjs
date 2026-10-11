import assert from 'node:assert/strict';
import path from 'node:path';
export async function checkReplacementTool(page,store,requests,setViewportSize,root){
 const saved=structuredClone(store),reload=async()=>{await page.reload();await page.locator('#scene-reader-quick-button').waitFor();await page.locator('#scene-reader-quick-button').click();await page.locator('[data-sr-tab="characters"]').click();};
 try{
  store.settings.global.ownerUnlocked=false;if(store.settings.owner)store.settings.owner.unlocked=false;await page.evaluate(()=>localStorage.removeItem('scene-reader-owner-unlocked-v1'));await reload();assert.equal(await page.locator('#sr-replacement-open').isVisible(),false);
  store.settings.global.ownerUnlocked=true;
  store.characters={enabled:true,characters:[{id:'review-actor',kind:'character',name:'Review Actor',aliases:[],source:'A guarded adult.',recordBank:{entity_type:'character',entity_name:'Review Actor',analysisId:'review-original',intimacy_reference:{text:'',source_ids:[]},records:Array.from({length:12},(_,i)=>({id:'r'+i,type:'core',target:'',when:[],rule:'Original guarded disposition '+i,modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}))}}],npcs:[],persona:null,recordGroups:[]};
  store.characters.persona={...structuredClone(store.characters.characters[0]),id:'review-persona',kind:'persona',name:'Review Persona'};
  await reload();await page.locator('#sr-replacement-open').click();const modal=page.locator('.sr-replacement-dialog');await modal.waitFor();
  const before=await page.evaluate(()=>JSON.stringify(mock.chat)),jevBefore=requests.filter(r=>r.url.endsWith('/systemone')).length;
  await modal.locator('[data-review]').click();await modal.locator('[data-status]').filter({hasText:'확인 완료'}).waitFor();
  assert.match(await modal.locator('[data-answer]').inputValue(),/guarded/i);assert.equal(await page.evaluate(()=>JSON.stringify(mock.chat)),before);assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,jevBefore,'quiet review sends no Jev request');
  const sent=await page.evaluate(()=>mock.reviewMessages[0]);assert.equal(sent.at(-1).role,'user');assert.ok(sent.at(-1).content.includes('cumulative development'));assert.ok(!JSON.stringify(sent).includes('<sr-review-'));assert.equal(sent[0].content,'Preset and older relationship memory');assert.equal(sent.filter(m=>m.content.includes('OOC character-sheet')).length,1);assert.equal(await page.evaluate(()=>mock.quietRequests.length),1);assert.equal(await page.evaluate(()=>mock.quietRequests[0].skipWIAN),false);
  const english=await modal.locator('[data-answer]').inputValue();await modal.locator('[data-translate]').click();await modal.locator('[data-status]').filter({hasText:'번역 완료'}).waitFor();assert.match(await modal.locator('[data-translation]').textContent(),/경계심/);assert.equal(await modal.locator('[data-answer]').inputValue(),english);
  assert.equal(await page.evaluate(()=>mock.translationRequests.length),1);assert.equal(await page.evaluate(()=>Object.hasOwn(mock.translationRequests[0],'responseLength')),false);assert.equal(await page.evaluate(()=>Object.hasOwn(mock.quietRequests[0],'responseLength')),false);
  await modal.locator('[data-translate]').click();assert.equal(await modal.locator('[data-translation]').isVisible(),false);await modal.locator('[data-translate]').click();assert.equal(await modal.locator('[data-translation]').isVisible(),true);assert.equal(await page.evaluate(()=>mock.translationRequests.length),1,'cached translation toggles without another call');
  await modal.locator('[data-copy]').click();await modal.locator('[data-status]').filter({hasText:'복사 완료'}).waitFor();const copied=await page.evaluate(()=>navigator.clipboard.readText());for(let i=0;i<12;i++)assert.ok(copied.includes('Original guarded disposition '+i));assert.ok(copied.includes(JSON.stringify(english)));assert.ok(!copied.includes('경계심은 남지만'));
  await modal.locator('[data-answer]').fill('Manually reviewed English finding.');assert.equal(await modal.locator('[data-translation]').isVisible(),false);await modal.locator('[data-copy]').click();await modal.locator('[data-status]').filter({hasText:'복사 완료'}).waitFor();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Manually reviewed English finding/);
  for(const size of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){await setViewportSize(size);const fit=await modal.evaluate(el=>{const r=el.getBoundingClientRect(),body=el.querySelector('.sr-replacement-body');return {width:r.width,height:r.height,vw:innerWidth,vh:innerHeight,overflow:body.scrollWidth>body.clientWidth+1};});assert.ok(fit.width<=fit.vw&&fit.height<=fit.vh);assert.equal(fit.overflow,false);if(size.width===390)await page.screenshot({path:path.join(root,'artifacts','replacement-mobile.png')});}
  const longAnswer=Array.from({length:100},(_,i)=>'Original: A prior detail '+i+'. Change: A complete current description with its relevant person and condition.').join('\n')+'\nFINAL_COMPLETE_SENTENCE.';
  await modal.locator('[data-answer]').fill(longAnswer);await setViewportSize({width:320,height:640});await page.waitForFunction(()=>{const t=document.querySelector('.sr-replacement-dialog [data-answer]');return t&&t.scrollHeight<=t.clientHeight+2;});assert.equal(await modal.locator('[data-answer]').inputValue(),longAnswer,'UI does not truncate long received or edited text');
  await modal.locator('[data-close]').click();await page.locator('#sr-replacement-open').click();assert.equal(await modal.locator('[data-answer]').inputValue(),'','answer is transient');await modal.locator('[data-close]').click();
  await page.locator('#sr-replacement-open').click();
  const editor=modal.locator('[data-prompt-editor]'),template=modal.locator('[data-review-template]');
  await editor.locator('summary').click();const defaultTemplate=await template.inputValue();
  const custom='(OOC) Audit {{subject}} across all available history. English Original/Change pairs only. CUSTOM_CHECK';
  await template.fill(custom);await modal.locator('[data-template-save]').click();await modal.locator('[data-template-status]').filter({hasText:'저장 완료'}).waitFor();assert.equal(store.settings.global.characterReviewPrompt,custom);
  await modal.locator('[data-template-copy]').click();await modal.locator('[data-template-status]').filter({hasText:'복사했습니다'}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),custom.replace('{{subject}}','"Review Actor"'));
  await modal.locator('[data-review]').click();await modal.locator('[data-status]').filter({hasText:'확인 완료'}).waitFor();assert.equal(await page.evaluate(()=>mock.reviewMessages.at(-1).at(-1).content),custom.replace('{{subject}}','"Review Actor"'));
  await modal.locator('[data-close]').click();await reload();await page.locator('#sr-replacement-open').click();await editor.locator('summary').click();assert.equal(await template.inputValue(),custom,'saved custom prompt survives reload');
  const failure=route=>route.fulfill({status:500,json:{ok:false,error:'Synthetic prompt save failure'}});await page.route('**/storage/settings',failure);
  await template.fill(custom+' UNSAVED');await modal.locator('[data-template-save]').click();await modal.locator('[data-template-status]').filter({hasText:'저장하지 못했습니다'}).waitFor();await page.unroute('**/storage/settings',failure);assert.equal(store.settings.global.characterReviewPrompt,custom);assert.equal(await template.inputValue(),custom+' UNSAVED');await modal.locator('[data-close]').click();await reload();await page.locator('#sr-replacement-open').click();await editor.locator('summary').click();assert.equal(await template.inputValue(),custom);
  const hostTemplate='(OOC) Compare {{char}} and {{user}} across the entire available story.';
  await template.fill(hostTemplate);await modal.locator('[data-template-save]').click();await modal.locator('[data-template-status]').filter({hasText:'저장 완료'}).waitFor();assert.equal(store.settings.global.characterReviewPrompt,hostTemplate);
  await modal.locator('[data-close]').click();await reload();await page.locator('#sr-replacement-open').click();await editor.locator('summary').click();assert.equal(await template.inputValue(),hostTemplate);
  await modal.locator('[data-template-copy]').click();await modal.locator('[data-template-status]').filter({hasText:'복사했습니다'}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),hostTemplate);
  await modal.locator('[data-review]').click();await modal.locator('[data-status]').filter({hasText:'확인 완료'}).waitFor();assert.equal(await page.evaluate(()=>mock.quietRequests.at(-1).quietPrompt.includes('{{char}}')),true);
  const chatBeforeSwitch=await page.evaluate(()=>JSON.stringify(mock.chat));
  for(const id of ['review-persona','review-actor']){
   await modal.locator('[data-person]').selectOption(id);
   const expected=id==='review-persona'?'(OOC) Compare {{user}} and {{char}} across the entire available story.':hostTemplate;
   await modal.locator('[data-template-copy]').click();await modal.locator('[data-template-status]').filter({hasText:'복사했습니다'}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected);
   await modal.locator('[data-review]').click();await modal.locator('[data-status]').filter({hasText:'확인 완료'}).waitFor();assert.equal(await page.evaluate(()=>mock.reviewMessages.at(-1).at(-1).content),expected);
   assert.equal(await template.inputValue(),hostTemplate);assert.equal(store.settings.global.characterReviewPrompt,hostTemplate);
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(mock.chat)),chatBeforeSwitch);
  await template.fill(custom);await modal.locator('[data-template-save]').click();await modal.locator('[data-template-status]').filter({hasText:'저장 완료'}).waitFor();
  for(const invalid of ['   ']){
   await template.fill(invalid);await modal.locator('[data-template-save]').click();
   await modal.locator('[data-template-status]').filter({hasText:invalid.trim()?'subject':'명령문을 입력'}).waitFor();
   assert.equal(await template.getAttribute('aria-invalid'),'true');assert.equal(await template.inputValue(),invalid);
   assert.equal(store.settings.global.characterReviewPrompt,custom);
   assert.equal(await modal.locator('[data-template-save]').isEnabled(),true);
  }
  await template.fill(custom+' CORRECTED');await modal.locator('[data-template-save]').click();await modal.locator('[data-template-status]').filter({hasText:'저장 완료'}).waitFor();assert.equal(await template.getAttribute('aria-invalid'),null);
  await template.fill(custom);await modal.locator('[data-template-save]').click();await modal.locator('[data-template-status]').filter({hasText:'저장 완료'}).waitFor();
  await modal.locator('[data-template-default]').click();assert.equal(await template.inputValue(),defaultTemplate);assert.equal(store.settings.global.characterReviewPrompt,custom,'loading defaults remains an unsaved edit until save');
  await setViewportSize({width:320,height:640});await page.waitForFunction(()=>{const t=document.querySelector('[data-review-template]');return t.scrollHeight<=t.clientHeight+2;});assert.equal(await modal.evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.screenshot({path:path.join(root,'artifacts','review-prompt-editor-mobile.png')});
  await modal.locator('[data-template-save]').click();await modal.locator('[data-template-status]').filter({hasText:'저장 완료'}).waitFor();assert.equal(store.settings.global.characterReviewPrompt,'');await modal.locator('[data-close]').click();
  console.log('Review editor passed: final user input, unchanged preset/memory/history, custom edit/save/copy/reload, failed save rollback, default restore and 320px editor fit.');
 }finally{Object.assign(store,saved);await reload();}
}
