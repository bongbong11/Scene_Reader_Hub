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
 // Click the production button and require a real connection-service request.
 await page.evaluate(()=>{mock.chat.push({is_user:true,mes:'A synthetic question for the manual analysis.'},{is_user:false,mes:'A synthetic completed reply for the manual analysis.'});});
 await page.locator('#sr-analysis-now').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.sr-toast-message')].some(n=>n.textContent.includes('확인 요청을 받았습니다')));
 await page.waitForFunction(()=>document.getElementById('sr-analysis-status').textContent.includes('새 변화 없음')&&!document.getElementById('sr-analysis-now').disabled);
 assert.equal(await page.evaluate(()=>mock.profileRequestCount||0),before+1,'manual click calls the selected extension profile once');
 assert.ok(await page.locator('.sr-toast-message').filter({hasText:'분석 완료 · 새로 저장할 변화는 없습니다.'}).count());
 await page.locator('#sr-analysis-now').click();
 await page.waitForFunction(()=>document.getElementById('sr-analysis-status').textContent.includes('새로 분석할 대화 없음'));
 assert.equal(await page.evaluate(()=>mock.profileRequestCount||0),before+1,'repeat click does not call either model for an already scanned range');
 await page.evaluate(async()=>{const {ConnectionManagerRequestService}=await import('/scripts/extensions/shared.js');mock.restoreManualProfile=ConnectionManagerRequestService.sendRequest;ConnectionManagerRequestService.sendRequest=async()=>{throw new Error('Synthetic manual profile failure');};mock.chat.push({is_user:true,mes:'Another synthetic question.'},{is_user:false,mes:'Another synthetic completed reply.'});});
 await page.locator('#sr-analysis-now').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.sr-toast-message')].some(n=>n.textContent.includes('변화 분석에 실패했습니다')));
 assert.equal(await page.locator('#sr-analysis-now').isDisabled(),false);
 await page.evaluate(async()=>{const {ConnectionManagerRequestService}=await import('/scripts/extensions/shared.js');ConnectionManagerRequestService.sendRequest=mock.restoreManualProfile;delete mock.restoreManualProfile;});
 // Exercise the real historical button/review controls, not just markup.
 await page.evaluate(async()=>{
  const {ConnectionManagerRequestService}=await import('/scripts/extensions/shared.js');mock.restoreHistoryProfile=ConnectionManagerRequestService.sendRequest;mock.historyReadCount=0;
  window.__charmBridge={getCharId:()=> 'synthetic-actor',getStoryContext:async()=>{mock.historyReadCount++;return 'The actor has grown more comfortable around the player after a shared journey.';}};
  ConnectionManagerRequestService.sendRequest=async(_id,messages)=>{
   const input=JSON.parse(messages[1].content);
   if(messages[0].content.startsWith('Translate only'))return {content:JSON.stringify({english:'Feels safer around the player after the shared journey.',original_ko:null,replacement_ko:'함께한 여정 이후 상대 곁에서 더 안심합니다.'})};
   const actor=input.actors.find(a=>a.kind!=='persona'),segment=input.source_segments[0];
   return {content:JSON.stringify({protocol:1,coverage:{memory:'complete',characters:'complete',persona:input.persona_enabled?'complete':'not_requested'},memory_changes:[],knowledge_changes:[],deferred_changes:[],character_changes:actor?[{actor_id:actor.id,target_ids:[],base_ref:null,op:'add_state',state_summary:'Feels safer around the player after a shared journey.',source_type:'world_fact',epistemic:'established',replacement_ko:'함께한 여정 이후 상대 곁에서 더 안심합니다.',reason_ko:'요약 참고 · 적용 전 확인이 필요합니다.',evidence:[{ref:segment.ref,quote:segment.text.slice(0,120)}]}]:[]})};
  };
 });
 await page.locator('#sr-history-now').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.sr-toast-message')].some(n=>n.textContent==='이전 기억을 읽습니다.'));
 await page.waitForFunction(()=>document.querySelector('[data-sr-change]')&&!document.getElementById('sr-history-now').disabled);
 assert.ok(await page.evaluate(()=>mock.historyReadCount>0));
 await page.locator('#sr-change-list').click();assert.ok(await page.locator('#sr-change-dialog').isVisible());const row=page.locator('[data-sr-change]').first();await row.locator(':scope > summary').click();
 assert.ok(await row.locator('[data-replacement-ko]').textContent());assert.ok(await row.locator('[data-change-action="approve"]').isVisible());
 await row.locator('details > summary').click();assert.equal(await row.locator('.sr-change-editor > summary svg').count(),1);assert.equal(await row.locator('[data-change-action="translate"] svg').count(),1);const input=row.locator('textarea');await input.fill('함께한 여정 이후 상대 곁에서 더 안심한다.');
 await row.locator('[data-change-action="translate"]').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('.sr-change-draft')].some(n=>n.value==='Feels safer around the player after the shared journey.'));
 assert.ok(await row.locator('[data-change-status]').textContent().then(t=>t.includes('확인한 뒤')));
 await row.locator('[data-change-action="save"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.sr-toast-message')].some(n=>n.textContent==='변경문을 저장했습니다.'));
 assert.match(await row.locator('[data-replacement-ko]').textContent(),/여정/);
 await row.locator('[data-change-action="approve"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.sr-toast-message')].some(n=>n.textContent==='확인한 내용을 반영했습니다.'));
 await page.evaluate(()=>document.querySelectorAll('.sr-scene-toast').forEach(n=>n.click()));
 const active=page.locator('[data-sr-change]').filter({hasText:'적용 중'}).first();if(!await active.evaluate(n=>n.open))await active.locator(':scope > summary').click();await active.scrollIntoViewIfNeeded();
 for(const size of [{width:320,height:700},{width:390,height:844},{width:1280,height:900}]){
  await setViewportSize(size);const bounds=await page.locator('#sr-change-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.width<=size.width&&bounds.height<=size.height);const controls=await page.locator('#sr-change-dialog .menu_button').evaluateAll(nodes=>nodes.filter(n=>n.offsetParent).map(n=>({h:n.getBoundingClientRect().height,font:parseFloat(getComputedStyle(n).fontSize)})));assert.ok(controls.every(n=>n.h>=28&&n.h<=30));const fit=await active.evaluate(n=>({overflow:n.scrollWidth>n.clientWidth+1,scroll:getComputedStyle(n.querySelector('.sr-change-content')).overflowY}));assert.equal(fit.overflow,false);assert.ok(['visible','clip'].includes(fit.scroll));if(size.width===390)await page.screenshot({path:path.join(root,'artifacts','change-review-mobile.png')});
 }
 await page.locator('[data-change-close]').click();assert.equal(await page.locator('#sr-change-dialog').isVisible(),false);
 await page.locator('#sr-change-list').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#sr-change-dialog').isVisible(),false);assert.ok(await page.locator('#scene-reader-dialog').isVisible());
 const callsBeforeReview=await page.evaluate(()=>mock.profileRequestCount||0);await page.locator('#sr-change-list').click();await page.evaluate(()=>document.getElementById('scene-reader-dialog').close());await page.waitForFunction(()=>!document.getElementById('sr-change-dialog').open);await page.evaluate(()=>document.getElementById('scene-reader-dialog').showModal());assert.equal(await page.evaluate(()=>mock.profileRequestCount||0),callsBeforeReview,'review open/close does not call a model');
 await page.evaluate(async()=>{const {ConnectionManagerRequestService}=await import('/scripts/extensions/shared.js');ConnectionManagerRequestService.sendRequest=mock.restoreHistoryProfile;delete mock.restoreHistoryProfile;delete window.__charmBridge;});
 await page.locator('#sr-continuity-interval').selectOption('3');await page.locator('#sr-collect-persona-changes').uncheck();
 await page.locator('#sr-settings-button').click();await page.locator('#sr-continuity-enabled').uncheck();
 await page.locator('[data-sr-tab="characters"]').click();assert.ok(await page.locator('#sr-analysis-now').isDisabled());
 assert.match(await page.locator('#sr-analysis-status').textContent(),/꺼짐/);
 if(previous.continuityEnabled){await page.locator('#sr-settings-button').click();await page.locator('#sr-continuity-enabled').check();}
 console.log('Browser cumulative settings passed: mobile controls, persisted interval, independent persona, actual manual profile call, receipt/result/failure feedback, no duplicate calls and no unsolicited inference.');
}
