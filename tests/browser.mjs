import { checkBundlesAndProviders } from './browser-bundles-providers.mjs';
import { checkCompilerCopies } from './browser-compiler-copies.mjs';
import { checkPresetSlots } from './browser-preset-slots.mjs';
import { checkRecordProtection } from './browser-record-protection.mjs';
import { checkRecoverySettings } from './browser-recovery-settings.mjs';
import {checkOpportunitySettings} from './browser-opportunity-settings.mjs';
import { createRecordBank } from '../src/characters/records.js';
import { prepareProfileItems, createProfile } from './fixtures/legacy-profiles.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require=createRequire(import.meta.url);
const { chromium }=require('playwright');
const root=process.env.SCENE_READER_INSTALL_ROOT ? path.resolve(process.env.SCENE_READER_INSTALL_ROOT) : path.resolve(import.meta.dirname,'..');
const prefix='/scripts/extensions/third-party/Scene_Reader_Hub/';
const wadeSource='Name: Wade\nRole: Businessman.\nHe controls his son.\nHe keeps intimate wishes private unless he chooses to disclose them.';
const wadeHash=createHash('sha256').update(wadeSource).digest('hex');
const wadeItem=prepareProfileItems({items:[{id:'c1',kind:'relationship',topic:'family_decisions',target:'son',rule:'Wade tends to control his son on family matters.'}]}).items;
const wadeProfile=createProfile(wadeItem,{characterId:'wade',sourceHash:wadeHash,source:wadeSource,analysisId:'browser'});
const store={settings:{global:{enabled:true,autoJudge:true,showConfidence:true,pauseOnOoc:true}},chat:{preferences:{settingsContract:3,charmMemory:true,lorebookMemory:true}},history:[],characters:{enabled:true,characters:[{id:'hunter',name:'Hunter',source:'Hunter is a lawyer.',sourceVisibleToMain:true}],npcs:[{id:'wade',name:'Wade',source:wadeSource,sourceHash:wadeHash,sourceVisibleToMain:false,profile:wadeProfile}]}};
const wadeEntry={...store.characters.npcs[0],kind:'npc',npcRole:'mixed'};
store.characters.npcs[0]={...wadeEntry,recordBank:createRecordBank({entity_type:'npc',entity_name:'Wade',intimacy_reference:{text:'Wade keeps intimate wishes private unless he chooses to disclose them.',source_ids:['S001']},records:[{type:'relationship',target:'son',when:['family matters'],rule:'Wade tends to control his son on family matters.',modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]},wadeEntry,'browser-records')};
const requests=[];
const vectorCollections=new Map(), retrievalSecrets={};
let failCharacterWrite=false;
let failWorldWrite=false;
let gateScenario=null;
let worldChoice='no';
let recordReview=null;
const host=`<!doctype html><html><meta charset="utf-8"><style>:root{--SmartThemeBodyColor:#eee;--SmartThemeBlurTintColor:#25252b;--SmartThemeBorderColor:#666;--SmartThemeQuoteColor:#9cbfff}body{margin:0;background:#202025;color:var(--SmartThemeBodyColor);font:16px Arial}button,input,select,textarea{box-sizing:border-box;font:inherit}button{cursor:pointer}select,input,textarea{color:inherit;background:var(--SmartThemeBlurTintColor)}.menu_button{border:1px solid var(--SmartThemeBorderColor);border-radius:5px;padding:7px}.text_pole{width:100%;border:1px solid #666;padding:6px}.checkbox_label{display:flex;align-items:center;gap:6px}.checkbox_label input{width:auto}</style><link rel="stylesheet" href="${prefix}style.css"><div id="extensions_settings"></div><div id="extensionsMenu"></div><div id="leftSendForm"><button id="extensionsMenuButton">wand</button></div><textarea id="send_textarea"></textarea><script>
const listeners=new Map(), prompts={},macros={};
window.mock={chat:[],prompts,macros,errors:[],worldBooks:{'Hunter Lore':{entries:{1:{uid:1,key:['door'],content:'The council meets tomorrow.'},2:{uid:2,key:['unrelated'],content:'Not relevant.'}}},'Hunter Extra':{entries:{3:{uid:3,constant:true,content:'Hunter owns the house.'}}},'Persona Lore':{entries:{4:{uid:4,key:['friend'],content:'Rosa is a friend of the user persona.'}}},'Persona Specific':{entries:{5:{uid:5,key:['neighbor'],content:'Rosa knows the user persona as a neighbor.'}}}},async emit(name,...args){if(name==='GENERATION_AFTER_COMMANDS')await mock.emit('GENERATION_STARTED',...args);for(const fn of listeners.get(name)||[])await fn(...args)}};
window.ctx={characterId:1,characters:[null,{avatar:'Hunter.png',data:{description:'Sawyer Valentine is Hunter’s colleague.',personality:'Hunter speaks carefully under pressure.',extensions:{world:'Hunter Lore'}}}],powerUserSettings:{persona_description_lorebook:'Persona Lore',persona_descriptions:{'User.png':{lorebook:'Persona Specific'}}},chatId:'test-room',name1:'User',name2:'Hunter',chat:mock.chat,extensionPrompts:prompts,saveMetadata:async()=>{},macros:{register(name,value){macros[name]=value.handler},category:{MISC:'misc'}}};
mock.slashCommands={};ctx.SlashCommandParser={addCommandObject(command){mock.slashCommands[command.name]=command}};ctx.SlashCommand={fromProps:value=>value};ctx.SlashCommandArgument={fromProps:value=>value};ctx.ARGUMENT_TYPE={STRING:'string'};window.SillyTavern={getContext:()=>ctx};window.jQuery=fn=>fn();
mock.presetSettings={prompts:[{identifier:'main',name:'Main rules',content:'Rules for {{user}}.',role:'system'},{identifier:'world-anchor',name:'World anchor',content:'World anchor rules.',role:'system'}],prompt_order:[{character_id:1,order:[{identifier:'main',enabled:true},{identifier:'world-anchor',enabled:true}]}]};
mock.promptManager={serviceSettings:mock.presetSettings,activeCharacter:{id:1},getPromptOrderForCharacter(){return this.serviceSettings.prompt_order.find(x=>x.character_id===this.activeCharacter.id)?.order||[]},preparePrompt(prompt){return {...prompt,content:prompt.content.replaceAll('{{user}}',ctx.name1).replaceAll('{{char}}',ctx.name2)}}};
mock.outbound=async()=>{
    await mock.emit('GENERATION_STARTED','normal',{},false);
    const hostText=mock.presetSettings.prompts.filter(p=>mock.promptManager.getPromptOrderForCharacter().some(e=>e.identifier===p.identifier && e.enabled)).map(p=>mock.promptManager.preparePrompt(p).content).join('\\n');
    const messages=[{role:'system',content:hostText},...Object.values(mock.prompts).filter(p=>typeof p==='string' && p).map(p=>({role:'system',content:p})),...mock.chat.map(m=>({role:m.is_user?'user':'assistant',content:m.mes}))];
    await mock.emit('GENERATE_AFTER_DATA',{prompt:messages},false);
    const body={type:'normal',messages};await mock.emit('CHAT_COMPLETION_SETTINGS_READY',body);
    await fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});
    mock.lastOutbound=body;return body;
};
mock.slotText=async kind=>{
    const body=await mock.outbound(),full=body.messages.map(m=>typeof m.content==='string'?m.content:'').join('\\n');
    const marker='<SCENE_READER_OUTPUT data-source="scene_reader_hub" data-kind="'+kind+'">',start=full.indexOf(marker);
    if(start>=0)return full.slice(start+marker.length,full.indexOf('</SCENE_READER_OUTPUT>',start));
    return mock.prompts[kind==='scene'?'scene-reader-router':'scene-reader-world']||'';
};

window.toastr=Object.fromEntries(['info','success','error','warning'].map(name=>[name,(message,title='',options={})=>{
    (mock.toasts ||= []).push({level:name,message,options});if(name==='error')mock.errors.push(message);
    let container=document.getElementById('toast-container');if(!container){container=document.createElement('div');container.id='toast-container';document.body.append(container)}
    const node=document.createElement('div');node.className='toast toast-'+name;
    for(const [className,text] of [['toast-title',title],['toast-message',message]]){const child=document.createElement('div');child.className=className;child.textContent=text;node.append(child)}
    container.append(node);const expiry=options.timeOut??5000;if(expiry>0)setTimeout(()=>node.remove(),expiry);
    const item={0:node,find(selector){return {text(value){const child=node.querySelector(selector);if(child)child.textContent=value}}},toggleClass(name,on){node.classList.toggle(name,on)},remove(){node.remove()},fadeOut(_ms,callback){node.remove();callback?.call(item)}};return item;
}]));
new MutationObserver(()=>{for(const node of document.querySelectorAll('#scene-reader-toast-container > .sr-scene-toast')){if(node.dataset.srRecorded)continue;node.dataset.srRecorded='true';const level=node.dataset.srLevel,message=node.querySelector('.sr-toast-message')?.textContent||'';(mock.toasts ||= []).push({level,message});if(level==='error')mock.errors.push(message);}}).observe(document.body,{childList:true,subtree:true});
window.eventSource={on(name,fn){if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn)}};
</script><script type="module" src="${prefix}index.js"></script></html>`;
const server=http.createServer(async(req,res)=>{try{
    if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return;}
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(host);return;}
    if(req.url==='/script.js'){res.setHeader('Content-Type','application/javascript');res.end(`export const eventSource=window.eventSource;export const event_types=new Proxy({},{get:(_,key)=>key});export const chat_metadata={};export function saveSettingsDebounced(){};export function setExtensionPrompt(key,value){window.mock.prompts[key]=value};export function getRequestHeaders(){return {}};export function isStreamingEnabled(){return Boolean(window.mock.streamingEnabled)}`);return;}
    if(req.url==='/scripts/openai.js'){res.setHeader('Content-Type','application/javascript');res.end('export const oai_settings=window.mock.presetSettings;export const promptManager=window.mock.promptManager;');return;}
    if(req.url==='/api/backends/chat-completions/generate'){let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw);requests.push({url:req.url,body});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}));return;}
    if(req.url==='/scripts/extensions.js'){res.setHeader('Content-Type','application/javascript');res.end('export const extension_settings={};');return;}
    if(req.url==='/scripts/world-info.js'){res.setHeader('Content-Type','application/javascript');res.end("export const world_info={charLore:[{name:'Hunter',extraBooks:['Hunter Extra']}]};export async function loadWorldInfo(name){if(window.mock.loreReady)await window.mock.loreReady;return window.mock.worldBooks[name]||null}");return;}
    if(req.url==='/scripts/personas.js'){res.setHeader('Content-Type','application/javascript');res.end("export const user_avatar='User.png'");return;}
    if(req.url==='/scripts/extensions/shared.js'){res.setHeader('Content-Type','application/javascript');res.end(`export class ConnectionManagerRequestService {static getSupportedProfiles(){return [{id:'test-profile',name:'테스트 연결',model:'mock-model'}]} static getProfile(){return this.getSupportedProfiles()[0]} static validateProfile(){} static async sendRequest(_id,messages,maxTokens,options){window.mock.profileRequestCount=(window.mock.profileRequestCount||0)+1;const prompt=messages?.[0]?.content||'';if(prompt.startsWith('Read the finished RP reply')){window.mock.profileStateRequests ||= [];return new Promise(resolve=>window.mock.profileStateRequests.push({messages,maxTokens,options,resolve}));}if(prompt.startsWith('You are a source-grounded character retrieval compiler.')) { const name=prompt.split('ENTITY_NAME: ')[1].split('\\n')[0]; return {content:JSON.stringify({entity_type:'npc',entity_name:name,records:[{type:'knowledge',target:'',when:['office procedure'],rule:name+' knows office procedures.',modality:'fact',basis:'explicit',source_ids:['S001'],knowledge_domain:'professional',knowledge_state:'knows'},{type:'relationship',target:'Hunter',when:['interests change'],rule:name+' may help or oppose Hunter when her own interests change.',modality:'conditional',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]})}; } if(prompt.startsWith('Read the supplied world prompt as source data.'))return {content:JSON.stringify({short_description:'A quiet garden world with ordinary physical limits.'})};if(prompt.startsWith('You are compiling a roleplay world prompt'))return {content:JSON.stringify({format:'scene-reader-world',version:1,name:'Moonlit Garden',short_description:'A garden whose gate responds to moonlight.',fixed_rules:'The garden remains an ordinary place except for its moonlit gate.',franchise:false,calendar_topics:[],records:[{id:'W001',category:'mechanism',when:'When moonlight reaches the gate.',keywords:['moonlight','gate'],rule:'Moonlight opens the garden gate.',source_quote:'Moonlight opens the garden gate.'}]})};if(prompt.startsWith('Find named individual NPCs'))return {content:'\`\`\`json\\n'+JSON.stringify({npcs:[{name:'Sawyer Valentine',aliases:['Sawyer'],hint:'Hunter colleague'}]})+'\\n\`\`\`'};if(prompt.startsWith('Extract only the confirmed minimum identity'))return {content:JSON.stringify({core:'An established colleague of Hunter.'})};return {content:JSON.stringify({ok:true,anchors:[],new_items:[],affected:[],knowledge_updates:[],possible_followups:[]})}}}`);return;}
    if(req.url.startsWith('/api/vector/')||req.url.startsWith('/api/secrets/')){
        let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};
        res.setHeader('Content-Type','application/json');
        if(req.url==='/api/secrets/read'){res.end(JSON.stringify(Object.fromEntries(Object.keys(retrievalSecrets).map(key=>[key,[{active:true,label:'test',value:'••••'}]]))));return;}
        if(req.url==='/api/secrets/write'){requests.push({url:req.url,body:{key:body.key}});retrievalSecrets[body.key]=body.value;res.end(JSON.stringify({id:'test-secret'}));return;}
        const route=req.url.split('/').at(-1),collection=JSON.stringify([body.source,body.model||'',body.collectionId]);
        requests.push({url:req.url,body:{...body,items:body.items?.map(({hash,index})=>({hash,index}))}});
        if(!vectorCollections.has(collection))vectorCollections.set(collection,new Map());
        const items=vectorCollections.get(collection);
        if(route==='list'){res.end(JSON.stringify([...items.keys()]));return;}
        if(route==='insert'){body.items.forEach(item=>items.set(item.hash,item));res.end('{}');return;}
        if(route==='delete'){body.hashes.forEach(hash=>items.delete(hash));res.end('{}');return;}
        if(route==='query'){
            const terms=new Set(String(body.searchText||'').toLowerCase().match(/[a-z]{4,}/g)||[]);
            const ranked=[...items.values()].map(item=>({item,score:(String(item.text).toLowerCase().match(/[a-z]{4,}/g)||[]).filter(term=>terms.has(term)).length})).sort((a,b)=>b.score-a.score||a.item.index-b.item.index).slice(0,body.topK);
            res.end(JSON.stringify({metadata:ranked.map(({item})=>({hash:item.hash,index:item.index,text:item.text})),hashes:ranked.map(({item})=>item.hash)}));return;
        }
    }
    if(req.url.startsWith('/api/plugins/scene-reader-jev/')){
        let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};requests.push({url:req.url,body});
        res.setHeader('Content-Type','application/json');let result={ok:true};
        if(req.url.endsWith('/bootstrap'))result={...store,ok:true,storageVersion:3,migrated:true,keyStatus:'저장됨 ····mock',backups:[]};
        else if(req.url.endsWith('/transaction')){store.chat=body.chat;store.history=body.history;}
        else if(req.url.endsWith('/settings')){if(failWorldWrite){failWorldWrite=false;res.statusCode=500;res.end(JSON.stringify({error:'Simulated world save failure'}));return;}store.settings=body.settings;}
        else if(req.url.endsWith('/characters')) { if(failCharacterWrite){failCharacterWrite=false;res.statusCode=500;res.end(JSON.stringify({error:'Simulated failed save'}));return;} store.characters=body.value; }
        else if(req.url.endsWith('/chat'))store.chat=body.value;
        else if(req.url.endsWith('/history'))store.history=body.value;
        else if(req.url.endsWith('/systemone'))result={answers:Object.fromEntries(Object.entries(body.questions||{}).map(([key,q])=>[key,q.type==='noul'?{type:'noul',noul:recordReview?recordReview(key,q):0.9}:{choice:key==='scene_level'&&gateScenario?gateScenario.level:key==='scene_phase'&&gateScenario?gateScenario.phase:key==='scene_evidence'&&gateScenario?Object.keys(q.criteria).filter(value=>value!=='none').at(-1)||'none':key.startsWith('scene_participant_')&&gateScenario?'yes':key.startsWith('world_record_')?worldChoice:key.startsWith('verification_')?'fulfilled':key.endsWith('_presence') && key.startsWith('character_')?'active':key.includes('_affect_')?'visible':key.includes('_profile_slot_1')?Object.keys(q.criteria)[1]||'none':key.endsWith('_response_direction')?'act':({primary_focus:'direct',scene_state:'active',event_state:'none',npc_presence:'none',context_change_source:'none'}[key]||Object.keys(q.criteria)[0]),confidence:1}]))};
        res.end(JSON.stringify(result));return;
    }
    if(req.url.startsWith(prefix)){const file=path.resolve(root,decodeURIComponent(req.url.slice(prefix.length)));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'application/javascript');res.end(await readFile(file));return;}
    res.statusCode=404;res.end('not found');
}catch(error){res.statusCode=500;res.end(error.message);}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const errors=[];
try{
    const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
    const page=await context.newPage();page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});page.on('console',message=>{if(message.type()==='error')console.error(message.text())});
    async function setViewportSize(size){
        await page.setViewportSize(size);
        await page.waitForFunction(()=>{
            const node=document.getElementById('scene-reader-dialog');
            if(!node?.open)return true;
            const rect=node.getBoundingClientRect();
            return Math.abs(rect.left+rect.width/2-innerWidth/2)<2&&rect.bottom<=innerHeight+1;
        });
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#scene-reader-quick-button').waitFor();
    await page.waitForFunction(()=>Object.keys(mock.slashCommands).length===6);
    const inferenceRequests=()=>requests.filter(item=>/systemone|\/api\/vector\/|chat-completions\/generate/.test(item.url)).length;
    assert.equal(inferenceRequests(),0,'startup performs no inference or embedding');
    assert.equal(await page.evaluate(()=>mock.profileRequestCount||0),0);
    await page.locator('#scene-reader-quick-button').click();
    assert.equal(await page.locator('#sr-hub-trace-panel').isVisible(),false,'trace starts hidden for ordinary users');
    assert.equal(await page.locator('#sr-copy-debug').isVisible(),true,'whole diagnostic copy remains accessible');
    assert.equal(await page.locator('.sr-size-bar, .sr-size-caption').count(),0,'no dedicated resize footer');
    assert.equal(await page.locator('#scene-reader-wand').innerText(),'씬판독기');
    await page.waitForFunction(()=>document.querySelector('#scene-reader-wand img')?.naturalWidth>0);
    assert.equal(await page.locator('#scene-reader-wand img').getAttribute('src'),await page.locator('#scene-reader-quick-button img').getAttribute('src'));
    await page.evaluate(()=>localStorage.setItem('scene-reader-owner-unlocked-v1','yes'));
    await page.locator('#sr-close').click();await page.locator('#scene-reader-quick-button').click();
    assert.equal(await page.locator('#sr-hub-trace-panel').isVisible(),true,'existing developer unlock reveals trace');
    await page.evaluate(()=>localStorage.removeItem('scene-reader-owner-unlocked-v1'));
    await page.locator('#sr-close').click();await page.locator('#scene-reader-quick-button').click();
    assert.equal(await page.locator('#sr-hub-trace-panel').isVisible(),false,'relocking hides trace');
    for(const width of [320,390,600,1280]) {
        await setViewportSize({width,height:850});
        const layout=await page.locator('.sr-header-actions').evaluate(node=>{
            const box=node.getBoundingClientRect(),header=node.parentElement.getBoundingClientRect();
            const buttons=[...node.querySelectorAll('button')].map(button=>{const r=button.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height};});
            return {right:box.right,headerRight:header.right,scroll:node.scrollWidth,client:node.clientWidth,buttons};
        });
        assert.ok(layout.headerRight-layout.right<18,'header actions stay right aligned at '+width);
        assert.ok(layout.scroll<=layout.client+1,'header actions fit at '+width);
        assert.ok(layout.buttons.every(button=>Math.abs(button.top-layout.buttons[0].top)<2),'header buttons stay on one row at '+width);
        assert.ok(layout.buttons.every(button=>button.width>=28 && button.height>=34),'touch targets remain usable at '+width);
        assert.ok(layout.buttons.every((button,index)=>button.left>=0 && button.right<=width && (index===0||button.left>=layout.buttons[index-1].right)),'header controls stay in viewport without overlap at '+width);
        assert.equal(await page.locator('.sr-header-actions').evaluate(node=>[...node.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect();return button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})),true,'header controls are reachable at '+width);
        const heading=await page.locator('.sr-header h2').boundingBox();
        assert.ok(Math.abs(heading.y+heading.height/2-layout.buttons[0].top-layout.buttons[0].height/2)<2,'title and buttons share a row');
        assert.ok(heading.x+heading.width<=layout.buttons[0].left,'title and buttons do not overlap');
        if(width===390){
            assert.equal(await page.locator('.sr-header p').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),12.48);
            assert.equal(await page.locator('#sr-tab-flow .sr-explanation').first().evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),10.5);
            assert.equal(await page.locator('.sr-injection-credit').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),9);
            assert.equal(await page.locator('.sr-seasonal-caption').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)),10.5);
await mkdir(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts','mobile-header.png')});}
    }
    await page.locator('#sr-settings-button').click();
    await page.locator('#sr-close').click();
    await page.reload();
    await page.waitForFunction(()=>Object.keys(mock.slashCommands).length===6);
    assert.equal(inferenceRequests(),0,'opening settings and refreshing perform no inference or embedding');
    assert.equal(await page.evaluate(()=>mock.profileRequestCount||0),0);
    await setViewportSize({width:1280,height:850});
    const slashStatus=await page.evaluate(async()=>JSON.parse(await mock.slashCommands['srh-status'].callback({},'')));
    assert.equal(slashStatus.enabled,true);
    assert.equal(slashStatus.chatReady,true);
    await page.evaluate(()=>mock.slashCommands['srh-auto'].callback({},'off'));
    assert.equal(store.settings.global.autoJudge,false);
    assert.equal(await page.locator('#sr-auto').isChecked(),false);
    await page.evaluate(()=>mock.slashCommands['srh-auto'].callback({},'on'));
    assert.equal(store.settings.global.autoJudge,true);
    await page.evaluate(()=>mock.slashCommands['srh-enabled'].callback({},'off'));
    assert.equal(await page.locator('#sr-run').isDisabled(),true);
    await page.evaluate(()=>mock.slashCommands['srh-enabled'].callback({},'on'));
    assert.equal(await page.locator('#sr-run').isDisabled(),false);

    assert.equal(store.chat.preferences.settingsContract,4,'legacy chat preferences are migrated and saved during startup');
    await page.waitForFunction(()=>document.querySelector('#scene-reader-quick-button img')?.naturalWidth>0);
    assert.deepEqual(await page.locator('#scene-reader-quick-button').evaluate(node=>({width:node.offsetWidth,height:node.offsetHeight})),{width:32,height:32},'opening button keeps its original size');
    assert.equal(await page.locator('#scene-reader-quick-button img').evaluate(node=>node.offsetWidth),26);
    assert.equal(await page.locator('#scene-reader-extension-settings').evaluate(e=>e.open),false);
    await page.locator('#scene-reader-extension-settings > summary').click();
    await page.locator('#sr-extension-icon').uncheck();
    await page.waitForFunction(()=>document.getElementById('scene-reader-quick-button').hidden);
    assert.equal(store.settings.global.showChatIcon,false);
    assert.equal(store.settings.global.enabled,true,'hiding icon does not disable the extension');
    await page.reload();
    await page.locator('#scene-reader-extension-settings').waitFor();
    assert.equal(await page.locator('#scene-reader-extension-settings').evaluate(e=>e.open),false);
    assert.equal(await page.locator('#scene-reader-quick-button').isVisible(),false);
    await page.locator('#scene-reader-extension-settings > summary').click();
    await page.locator('#sr-extension-enabled').uncheck();
    await page.waitForFunction(()=>!document.getElementById('sr-enabled').checked);
    assert.equal(store.settings.global.enabled,false);
    await page.locator('#sr-extension-open').click();
    await page.locator('#scene-reader-dialog[open]').waitFor();
    await page.waitForFunction(()=>document.querySelector('.sr-header-mascot')?.naturalWidth>0);
    assert.equal(await page.locator('#sr-run').isDisabled(),true);
    await page.locator('#sr-settings-button').click();
    await page.locator('#sr-enabled').check();
    await page.waitForFunction(()=>document.getElementById('sr-extension-enabled').checked);
    assert.equal(store.settings.global.enabled,true);
    await page.locator('#sr-close').click();
    await page.locator('#sr-extension-icon').check();
    await page.waitForFunction(()=>!document.getElementById('scene-reader-quick-button').hidden);
    await page.locator('#scene-reader-quick-button').click();
    await page.locator('#scene-reader-dialog[open]').waitFor();
    await page.evaluate(()=>window.toastr.info('toast layer check'));
    await page.waitForFunction(()=>document.getElementById('toast-container')?.parentElement?.id==='scene-reader-dialog');
    await page.evaluate(async()=>{
        const api=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/ui/toasts.js');
        window.toastTest={...api,native:window.toastr};
        document.querySelectorAll('#toast-container > .toast, #scene-reader-toast-container > .sr-scene-toast').forEach(node=>node.remove());
        window.toastr.info('Other extension');
        toastTest.progress=api.notifySceneReaderToast(window,'info','検索 <script>unsafe</script>','씬판독기',{sceneState:'working',timeOut:0,extendedTimeOut:0});
    });
    const progressToast=page.locator('.sr-scene-toast');
    await progressToast.waitFor();
    assert.equal(await page.evaluate(()=>toastTest.native===window.toastr),true,'host toast API stays intact');
    assert.equal(await page.locator('#toast-container > .toast:not(.sr-scene-toast) .sr-toast-mascot').count(),0,'foreign toast is untouched');
    assert.equal(await progressToast.locator('script').count(),0,'notification content is plain text');
    await page.evaluate(()=>toastTest.updateSceneReaderToast(toastTest.progress,'인물 판독 중',{sceneState:'working'}));
    assert.equal(await progressToast.locator('.sr-toast-message').textContent(),'인물 판독 중','next stage updates immediately');
    await page.evaluate(()=>toastTest.updateSceneReaderToast(toastTest.progress,'적용 완료',{level:'success'}));
    assert.equal(await progressToast.getAttribute('data-sr-state'),'success');
    assert.equal(await progressToast.locator('.sr-toast-pose').evaluate(image=>image.src.endsWith('/success.webp')),true);
    await progressToast.locator('.sr-toast-message').click();
    await page.evaluate(()=>toastTest.updateSceneReaderToast(toastTest.progress,'다음 단계',{sceneState:'working'}));
    assert.equal(await page.locator('.sr-scene-toast').count(),0,'dismissed progress never reappears on updates');
    const toastStates=['info','working','success','warning','error','paused','resumed'];
    for(const width of [320,390,1280]){
        await setViewportSize({width,height:850});
        const poseFiles=[];
        for(const state of toastStates){
            await page.evaluate(state=>{toastTest.current=toastTest.notifySceneReaderToast(window,'info',state==='paused'?'잠깐 비켜드릴게요♡':'이번 작업의 알림을 확인해 주세요.',state==='paused'?'앗, 둘만의 시간이네요!':'씬판독기',{sceneState:state});},state);
            const toast=page.locator('.sr-scene-toast');
            await page.waitForFunction(()=>[...document.querySelectorAll('.sr-scene-toast img')].every(image=>image.complete&&image.naturalWidth>0));
            const layout=await toast.evaluate(node=>({width:node.getBoundingClientRect().width,scroll:node.scrollWidth,client:node.clientWidth,mascot:parseFloat(getComputedStyle(node.querySelector('.sr-toast-mascot')).width),font:parseFloat(getComputedStyle(node.querySelector('.sr-toast-message')).fontSize),pose:node.querySelector('.sr-toast-pose').src,center:node.getBoundingClientRect().left+node.getBoundingClientRect().width/2,viewport:innerWidth}));
            assert.ok(layout.width<=Math.min(width-16,width<=600?300:340)&&layout.width>100,`${width}/${state}: toast stays within screen`);
            assert.ok(layout.scroll<=layout.client,`${width}/${state}: no text clipping`);
            assert.ok(Math.abs(layout.center-layout.viewport/2)<2,`${width}/${state}: toast centered`);
            assert.equal(layout.mascot,width<=600?64:75);
            assert.ok(layout.font>=13,'mobile text remains readable');
            poseFiles.push(layout.pose);
            assert.equal(await toast.locator('.toast-close-button').count(),0);
            if(state==='paused'){
                assert.equal(await toast.locator('.sr-toast-detail').textContent(),'Ⅱ 동적 주입 쉬는 중');
                await mkdir(path.join(root,'artifacts'),{recursive:true});
                await toast.screenshot({path:path.join(root,'artifacts',`toast-pause-${width}.png`)});
            }
            await toast.focus();await page.keyboard.press('Enter');
            assert.equal(await page.locator('.sr-scene-toast').count(),0);
        }
        assert.equal(new Set(poseFiles).size,7,'every notification state has its own pose');
    }
    for(const width of [320,390,1280]) {
        await setViewportSize({width,height:850});
        const sizes=[];
        for(const message of ['완료','연결 확인에 실패했습니다. 저장된 인증 정보와 선택한 서비스를 확인한 뒤 다시 시도하세요. '.repeat(8)]) {
            await page.evaluate(message=>toastTest.current=toastTest.notifySceneReaderToast(window,'error',message,'씬판독기',{timeOut:0}),message);
            const layout=await page.locator('.sr-scene-toast').evaluate(node=>{const text=node.querySelector('.sr-toast-message'),r=node.getBoundingClientRect();return {width:r.width,height:r.height,center:r.left+r.width/2,scroll:node.scrollWidth,client:node.clientWidth,textScroll:text.scrollHeight,textHeight:text.clientHeight};});
            assert.ok(Math.abs(layout.center-width/2)<2,'short and long error notifications stay centered');
            assert.ok(layout.scroll<=layout.client&&layout.textScroll<=layout.textHeight,'long error is fully wrapped');
            sizes.push(layout);await page.locator('.sr-scene-toast').click();
        }
        assert.ok(sizes[0].width<sizes[1].width,'short notification shrinks to content');
        assert.ok(sizes[0].height<=(width<=600?80:91),'compact padding preserves image size');
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(()=>toastTest.current=toastTest.notifySceneReaderToast(window,'info','잠깐 비켜드릴게요♡','앗, 둘만의 시간이네요!',{sceneState:'paused'}));
    assert.equal(await page.locator('.sr-toast-mascot').evaluate(node=>getComputedStyle(node).animationName),'none');
    assert.equal(await page.locator('.sr-toast-peek').evaluate(node=>getComputedStyle(node).opacity),'0');
    await page.locator('.sr-toast-mascot').click();
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.evaluate(()=>document.querySelectorAll('#toast-container > .toast, #scene-reader-toast-container > .sr-scene-toast').forEach(node=>node.remove()));
    async function checkPanelBottom(label){
        const layout=await page.evaluate(()=>{
            const dialog=document.getElementById('scene-reader-dialog'),panel=document.querySelector('.sr-tab-panel:not([hidden]).active')||[...document.querySelectorAll('.sr-tab-panel')].find(node=>getComputedStyle(node).display!=='none');
            panel.scrollTop=panel.scrollHeight;
            const rect=panel.getBoundingClientRect(),last=panel.lastElementChild.getBoundingClientRect(),frame=dialog.getBoundingClientRect();
            const grip=document.getElementById('sr-resize-handle').getBoundingClientRect();
            return {panelBottom:rect.bottom,lastBottom:last.bottom,frameBottom:frame.bottom,frameRight:frame.right,frameTop:frame.top,frameLeft:frame.left,height:innerHeight,width:innerWidth,client:panel.clientHeight,grip:{height:grip.height,width:grip.width,right:grip.right,bottom:grip.bottom,top:grip.top}};
        });
        assert.ok(layout.frameTop>=0&&layout.frameLeft>=0&&layout.frameBottom<=layout.height+1&&layout.frameRight<=layout.width+1,`${label}: window stays inside viewport`);
        assert.ok(layout.panelBottom<=layout.frameBottom+1,`${label}: panel stays in window`);
        assert.ok(layout.grip.bottom<=layout.frameBottom&&layout.grip.right<=layout.frameRight,`${label}: grip stays in corner`);
        assert.ok(layout.lastBottom<=layout.grip.top+1,`${label}: last content clears grip`);
        assert.ok(layout.lastBottom<=layout.panelBottom+1,`${label}: last content is reachable by scrolling`);
        assert.ok(layout.client>40,`${label}: panel remains usable`);
        assert.ok(layout.grip.height>=44&&layout.grip.width>=44,`${label}: drag handle has a large touch target`);
    }
    for(const width of [320,390,768,1280]){
        await setViewportSize({width,height:850});
        for(const tab of ['flow','advanced','conflict','characters','settings']){
            await page.locator(tab==='settings'?'#sr-settings-button':`[data-sr-tab="${tab}"]`).click();
            assert.equal(await page.locator('#scene-reader-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+2),false,`${width}/${tab}: overflow`);
            for(const open of [false,true]){
                await page.locator('#sr-hub-trace-panel').evaluate((node,open)=>node.open=open,open);
                await checkPanelBottom(`${width}/${tab}/trace=${open}`);
            }
            await page.locator('#sr-hub-trace-panel').evaluate(node=>node.open=false);
            await page.locator(`#sr-tab-${tab}`).evaluate(node=>node.scrollTop=0);
            if ([390,1280].includes(width) && ['flow','advanced'].includes(tab)) {
                await mkdir(path.join(root,'artifacts'),{recursive:true});
                await page.screenshot({path:path.join(root,'artifacts',`release-${width}-${tab}.png`)});
            }
            const bad=await page.locator(`#sr-tab-${tab} button:visible`).evaluateAll(buttons=>buttons.filter(e=>e.getBoundingClientRect().width<28).map(e=>e.textContent));assert.equal(bad.length,0,`${width}/${tab}: narrow buttons`);
        }
    }
    for(const size of [{width:320,height:480},{width:390,height:667},{width:740,height:360}]){
        await setViewportSize(size);
        for(const tab of ['flow','advanced','conflict','characters','settings']){
            await page.locator(tab==='settings'?'#sr-settings-button':`[data-sr-tab="${tab}"]`).click();
            await checkPanelBottom(`${size.width}x${size.height}/${tab}`);
        }
    }
    await setViewportSize({width:1280,height:1000});
    const grip=page.locator('#sr-resize-handle');
    await grip.press('Home');
    async function dragResize(dx,dy){
        const box=await grip.boundingBox();
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
        await page.mouse.down();
        await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:8});
        await page.mouse.up();
    }
    const originalFrame=await page.locator('#scene-reader-dialog').boundingBox();
    await dragResize(-120,-100);
    const smallerFrame=await page.locator('#scene-reader-dialog').boundingBox();
    assert.equal(smallerFrame.width,640,'dragging left shrinks width');
    assert.equal(smallerFrame.height,720,'dragging up shrinks height');
    assert.equal(smallerFrame.x,originalFrame.x,'top-left stays stable during resize');
    assert.equal(smallerFrame.y,originalFrame.y);
    await dragResize(80,60);
    assert.equal((await page.locator('#scene-reader-dialog').boundingBox()).height,780,'dragging outward enlarges the window');
    await grip.press('ArrowUp');
    assert.equal((await page.locator('#scene-reader-dialog').boundingBox()).height,756,'keyboard resize is available');
    await checkPanelBottom('resized window');
    await page.locator('#sr-close').click();
    await page.locator('#scene-reader-quick-button').click();
    assert.equal(await page.locator('#scene-reader-dialog').evaluate(node=>node.getBoundingClientRect().height),756,'custom size survives closing');
    await page.reload();
    await page.locator('#scene-reader-extension-settings > summary').click();
    await page.locator('#scene-reader-quick-button').click();
    assert.equal(await page.locator('#scene-reader-dialog').evaluate(node=>node.getBoundingClientRect().height),756,'custom size survives page reload');
    await page.evaluate(()=>window.toastr.info('toast layer after reload'));
    await page.waitForFunction(()=>document.getElementById('toast-container')?.parentElement?.id==='scene-reader-dialog');
    await grip.dblclick();
    assert.equal((await page.locator('#scene-reader-dialog').boundingBox()).height,820,'double click restores default size');
    await page.evaluate(()=>document.querySelectorAll('#toast-container > .toast').forEach(node=>node.remove()));
    await page.locator('[data-sr-tab="flow"]').click();
    await page.screenshot({path:path.join(root,'artifacts','window-desktop.png')});
    await setViewportSize({width:390,height:667});
    const touchSession=await context.newCDPSession(page);
    await touchSession.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    const touchBox=await grip.boundingBox(),touch={x:touchBox.x+touchBox.width/2,y:touchBox.y+touchBox.height/2,id:1,radiusX:8,radiusY:8,force:1};
    await touchSession.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
    await touchSession.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...touch,x:touch.x-36,y:touch.y-90}]});
    await touchSession.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>Math.abs(document.getElementById('scene-reader-dialog').getBoundingClientRect().height-561)<1);
    assert.equal((await page.locator('#scene-reader-dialog').boundingBox()).width,338,'finger drag changes both dimensions');
    assert.equal(await page.locator('#scene-reader-dialog').getAttribute('data-resizing'),'false','touch release ends resize');
    await touchSession.send('Emulation.setTouchEmulationEnabled',{enabled:false});
    await touchSession.detach();
    await checkPanelBottom('mobile bottom screenshot');
    await page.screenshot({path:path.join(root,'artifacts','window-mobile-bottom.png')});
    await page.locator('[data-sr-tab="characters"]').click();
    await page.locator('#sr-character-new').click();
    const outer=await page.locator('#scene-reader-dialog').boundingBox(),editor=await page.locator('#sr-character-editor').boundingBox();
    assert.ok(editor.y>=outer.y&&editor.y+editor.height<=outer.y+outer.height,'character editor fits inside a dragged smaller window');
    await page.locator('#sr-character-editor-cancel').click();
    await page.locator('[data-sr-tab="flow"]').click();
    await grip.press('Home');
    await setViewportSize({width:390,height:850});await page.locator('[data-sr-tab="characters"]').click();
    await page.locator('#sr-character-new').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-lore-status').textContent.includes('연결 로어북'));
    assert.equal(await page.locator('#sr-character-lore-options input').count(),3,'connected character lorebook entries are available');
    await page.locator('#sr-character-editor-cancel').click();
    assert.equal(await page.locator('#sr-character-volume').inputValue(),'generous','new chats begin with the generous character budget');
    assert.equal(await page.locator('#sr-profile-emotion').isChecked(),false,'existing chats keep main RP state collection');
    await page.locator('#sr-profile-emotion').click();
    await page.waitForFunction(()=>!document.getElementById('sr-profile-emotion').checked);
    assert.notEqual(store.chat.preferences.profileEmotionJudgment,true,'a connection profile must be selected before enabling background collection');
    for(const choice of ['basic','detailed','generous']){
        await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),page.locator('#sr-character-volume').selectOption(choice)]);
        assert.equal(store.chat.preferences.characterVolume,choice,'chat-specific volume persists');
    }
    await page.locator('[data-record-kind="npc"]').click();
    await page.locator('[data-character-view-id="wade"]').click();
    await page.locator('#sr-character-analysis-result').getByText('Wade tends to control his son on family matters.').waitFor();
    await page.locator('#sr-character-record-close').click();
    const wadeToggle=page.locator('[data-npc-affect-id="wade"]');
    assert.equal(await wadeToggle.isChecked(),false,'NPC arousal collection defaults off');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/characters')),wadeToggle.check()]);
    assert.equal(store.characters.npcs.find(entry=>entry.id==='wade').trackArousal,true,'NPC choice is stored without regenerating its record bank');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/characters')),wadeToggle.uncheck()]);
    assert.equal(store.characters.npcs.find(entry=>entry.id==='wade').trackArousal,false);
    await page.locator('#sr-npc-sheet-new').click();
    assert.equal(await page.locator('#sr-character-npc-role').inputValue(),'mixed');
    await page.waitForFunction(()=>document.querySelectorAll('#sr-character-lore-options input').length===5);
    assert.equal(await page.locator('#sr-character-lore-options input:checked').count(),0,'NPC lorebooks start unselected');
    assert.equal(await page.locator('#sr-character-lore-options input').count(),5,'NPC lists character and persona lorebook entries');
    assert.match(await page.locator('#sr-character-npc-lore-note').textContent(),/NPC 한 명/);
    await page.locator('#sr-character-npc-template').click();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/NPC 시트/);
    await page.locator('#sr-character-npc-role').selectOption('ally');
    await page.locator('#sr-character-copy-prompt').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('복사했습니다'));
    assert.doesNotMatch(await page.evaluate(()=>navigator.clipboard.readText()),/The council meets tomorrow/);
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Completed NPC sheet supplied alongside/);
    await page.locator('.sr-character-lore-picker > summary').click();
    await page.locator('.sr-character-lore-book').first().locator('summary').click();
    await page.locator('#sr-character-lore-options input').first().check();
    await page.locator('.sr-character-lore-book').last().locator('summary').click();
    await page.locator('#sr-character-lore-options input').last().check();
    await page.locator('#sr-character-copy-prompt').click();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/The council meets tomorrow/,'selected NPC lorebook joins the instruction');
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Rosa knows the user persona as a neighbor/,'NPC can use the active persona-linked lore');
    assert.doesNotMatch(await page.evaluate(()=>navigator.clipboard.readText()),/Not relevant|Rosa is a friend of the user persona/,'unselected entries from those books are omitted');
    assert.doesNotMatch(await page.evaluate(()=>navigator.clipboard.readText()),/Completed NPC sheet supplied alongside/);
    const rosaJson={entity_type:'npc',entity_name:'Rosa Valentine',records:[{type:'relationship',target:'Hunter',when:['interests change'],rule:'Rosa may help or oppose Hunter when her own interests change.',modality:'conditional',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]};
    await page.locator('#sr-character-import-file').setInputFiles({name:'rosa.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(rosaJson))});
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('형식 검사 완료'));
    await page.locator('#sr-character-import').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-modal').hidden);
    assert.ok(store.characters.npcs.some(entry=>entry.name==='Rosa Valentine'&&entry.npcRole==='ally'));
    await page.locator('#sr-settings-button').click();assert.equal(await page.locator('#sr-memory-charm').isDisabled(),true);assert.equal(await page.locator('#sr-memory-lorebook').isDisabled(),true);assert.equal(await page.locator('#sr-memory-reserved').isHidden(),true);assert.equal(await page.locator('.sr-developer-lock > summary').textContent(),'개발자 모드');
    assert.equal(await page.locator('.sr-connection-card').evaluate(element=>element.tagName),'SECTION','all key settings stay visible');
    await page.locator('#sr-reasoner-profile').selectOption('test-profile');
    await page.locator('#sr-continuity-enabled').check();
    await page.locator('[data-sr-tab="flow"]').click();
    await page.waitForFunction(()=>document.getElementById('sr-continuity-results')?.textContent.includes('테스트 연결'));
    assert.match(await page.locator('#sr-continuity-results').textContent(),/선택한 연결 프로필.*테스트 연결/s,'the selected profile is shown before the first continuity run');
    await page.locator('#sr-settings-button').click();
    await page.locator('#sr-continuity-enabled').uncheck();
    await page.locator('[data-sr-tab="characters"]').click();
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),page.locator('#sr-profile-emotion').check()]);
    assert.equal(store.chat.preferences.profileEmotionJudgment,true,'background collection setting saves for this chat');
    await page.locator('[data-sr-tab="flow"]').click();
    await page.locator('[data-sr-tab="characters"]').click();
    assert.equal(await page.locator('#sr-profile-emotion').isChecked(),true,'saved collection choice remains visible');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),page.locator('#sr-profile-emotion').uncheck()]);
    assert.equal(store.chat.preferences.profileEmotionJudgment,false,'turning off restores the main model choice');
    const beforeCompilation=requests.filter(r=>r.url.endsWith('/systemone')).length;
    const rosa=store.characters.npcs.find(entry=>entry.name==='Rosa Valentine');
    assert.equal(rosa.selectedLore.length,2,'selected NPC lore is saved with the record');
    await page.locator('[data-character-view-id="'+rosa.id+'"]').click();
    await page.locator('#sr-character-analysis-result').getByText('Rosa may help or oppose Hunter when her own interests change.',{exact:true}).waitFor();
    assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,beforeCompilation,'static import never calls Jev');
    assert.equal(await page.locator('.sr-tabs [data-sr-tab]').count(),4,'no additional tabs');
    for(const width of [320,390,768,1280]) {
        await setViewportSize({width,height:850});
        assert.equal(await page.locator('#scene-reader-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+2),false,'retrieval UI overflow at '+width);
        if(width<=600) assert.equal(await page.locator('.sr-record-person').first().isVisible(),true,'mobile records remain visible');
    }
    await mkdir(path.join(root,'artifacts'),{recursive:true});
    await page.screenshot({path:path.join(root,'artifacts','retrieval-desktop.png')});
    await setViewportSize({width:390,height:850});
    await page.locator('#sr-character-analysis-result').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'artifacts','retrieval-mobile.png')});
    await page.locator('#sr-character-record-close').click();
    assert.equal(await page.locator('#sr-npc-read-names').count(),0,'NPC name-reading button was removed');
    await page.locator('[data-sr-tab="flow"]').click();
    await page.locator('#sr-close').click();
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Open the door.'});await mock.emit('MESSAGE_SENT',0);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    await page.locator('#scene-reader-quick-button').click();
    assert.doesNotMatch(await page.locator('#sr-turn-summary').textContent(),/아직 판독 결과가 없습니다/,'opening the panel after automatic generation preserves the result');
    assert.equal(await page.evaluate(()=>mock.prompts['scene-reader-router']),store.chat.lastJudgment.payload,'automatic injection equals the server judgment after opening the panel');
    assert.ok(!requests.some(r=>r.body.state?.memory_reference?.entries?.length),'reserved memory must not reach Jev even with old enabled settings');
    assert.ok(!requests.some(r=>r.body.state?.memory_reference?.entries?.some(e=>e.sourceId==='Hunter Extra:3')),'reserved auxiliary lore stays off');
    assert.ok(!requests.some(r=>r.body.state?.memory_reference?.entries?.some(e=>e.sourceId==='Hunter Lore:2')),'irrelevant lore must not reach Jev');
    assert.ok(await page.evaluate(()=>mock.prompts['scene-reader-router']?.length>0),'prompt slot receives injection');
    assert.match(await page.evaluate(()=>mock.prompts['scene-reader-state-capture']||''),/Hunter/,'main-model state request reaches the same generation');
    await page.context().grantPermissions(['clipboard-read','clipboard-write']);
    await page.locator('#sr-copy-debug').click();
    const debugReport=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));
    assert.ok(debugReport.jevOriginalChoices.primary_focus,'debug copy retains Jev original choices');
    assert.ok(debugReport.decisions.primary_focus,'debug copy retains final coordination');
    assert.ok(!JSON.stringify(debugReport).includes('Open the door.'),'debug copy excludes raw chat');
    assert.equal(await page.locator('#sr-debug-open').count(),0,'duplicate raw debug UI removed');
    await page.evaluate(async()=>{mock.chat.push({is_user:false,mes:'Hunter opens the door.\n[[SR_STATE]]\nc0 | a:38% | c=60 | anger25\n[[/SR_STATE]]\n<Scene_Info>Time: 14:08</Scene_Info>'});await mock.emit('MESSAGE_RECEIVED',1);mock.chat.push({is_user:true,mes:'(oOc: Explain.)',extra:{ooc_chat:true,ooc_instruction:'fixed wrapper'}});await mock.emit('MESSAGE_SENT',2);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.equal(await page.evaluate(()=>mock.chat[1].mes),'Hunter opens the door.\n<Scene_Info>Time: 14:08</Scene_Info>','state notation is normalized and metadata removed while preset info remains intact');
    assert.equal(store.chat.characterStateEvents?.[0]?.states?.[0]?.values?.a,38,'state stored outside the chat message');
    assert.equal(await page.locator('.sr-character-turn-card').first().evaluate(card=>card.open),false,'person results start collapsed');
    await page.locator('[data-sr-tab="characters"]').click();
    if (!(await page.locator('.sr-character-turn-card').first().evaluate(card=>card.open))) await page.locator('.sr-character-turn-card > summary').first().click();
    await page.locator('.sr-character-card-tabs [data-character-card-view="emotion"]').first().click();
    assert.match(await page.locator('.sr-character-card-body:visible').first().textContent(),/충동\s*38%/,'current output emotion is visible without another Jev judgment');
    await page.locator('.sr-character-turn-card').first().screenshot({path:path.join(root,'artifacts','character-emotion-mobile.png')});
    await page.locator('#sr-settings-button').click();
    assert.equal(await page.evaluate(()=>mock.prompts['scene-reader-router']), '');
    await page.locator('#sr-settings-button').click();await page.locator('#sr-injection-mode').evaluate(element=>element.closest('details').open=true);await page.locator('#sr-injection-mode').selectOption('preset');
    const beforeMacro=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Open the door again.'});await mock.emit('MESSAGE_SENT',3);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.ok(requests.some(r=>r.body.questions?.sexual_0_restraint),'physical self-control becomes an independent next-turn Jev question');
    assert.ok(requests.some(r=>r.body.questions?.sexual_0_route),'Jev selects the physical conduct route separately from stored emotion values');
    assert.ok(!requests.some(r=>r.body.questions?.character_0_affect_a),'the legacy arousal-expression question is suppressed for router-managed people');
    assert.ok(store.chat.lastJudgment?.payload?.includes('<SEXUAL_CONDUCT pace="medium">'),'the independent physical decision reaches the final injection');
    assert.ok(!store.chat.lastJudgment?.payload?.includes('Prior state sexual arousal 38%'),'stored arousal does not duplicate or block the physical conduct decision');
    assert.ok(!requests.filter(r=>r.url.endsWith('/systemone')).slice(beforeMacro).some(r=>r.body.state?.memory_reference?.entries?.length),'reserved memory stays off in macro mode');
    const beforeLoreEdit=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.evaluate(async()=>{
        mock.worldBooks['Hunter Lore'].entries[1].content='The door now needs a brass key.';
        await mock.emit('WORLDINFO_UPDATED','Hunter Lore',mock.worldBooks['Hunter Lore']);
        await mock.emit('GENERATION_AFTER_COMMANDS','swipe',{},false);
    });
    const afterLoreEdit=requests.filter(r=>r.url.endsWith('/systemone')).slice(beforeLoreEdit);
    assert.ok(!afterLoreEdit.some(r=>r.body.state?.memory_reference?.entries?.length),'lore edit does not activate reserved memory');
    assert.ok(!(await page.evaluate(()=>Object.values(mock.prompts).join(' '))).includes('The door now needs a brass key.'),'raw lore is not reinjected');
    await page.locator('#sr-settings-button').click();assert.equal(await page.locator('#sr-memory-lorebook').isDisabled(),true);
    await page.waitForFunction(()=>document.getElementById('sr-memory-status').textContent.includes('준비 중'));
    const beforeCharm=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.evaluate(async()=>{window.__charmBridge={getStoryContext:()=> {throw new Error('reserved bridge must not be called')}};mock.chat.push({is_user:true,mes:'Ask about the promise.'});await mock.emit('MESSAGE_SENT',4);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    const charmRequest=requests.filter(r=>r.url.endsWith('/systemone')).slice(beforeCharm).find(r=>r.body.state?.memory_reference);
    assert.ok(!charmRequest?.body.state.memory_reference.entries.some(e=>e.sourceKind==='charm'),'reserved Charm bridge stays off');
    assert.ok(!charmRequest?.body.state.memory_reference.entries.some(e=>e.sourceKind==='lorebook'),'disabled character lore is not sent');
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Wade enters the room.'});await mock.emit('MESSAGE_SENT',5);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.ok(requests.some(r=>r.body.state?.character_profiles?.people?.some(person=>person.name==='Wade' && person.profileCandidates.length)),'stored Wade rules reach live Jev selection');
    assert.match(await page.evaluate(async()=>await mock.slotText('scene')),/Wade[^\n]*Wade tends to control his son on family matters\./,'the selected rule reaches the final injection');
    gateScenario={level:'3',phase:'active'};
    const beforePause=requests.length;
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Wade and Hunter begin an explicit sexual interaction.'});await mock.emit('MESSAGE_SENT',6);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    const pausedRequests=requests.slice(beforePause).filter(r=>r.url.endsWith('/systemone'));
    assert.equal(pausedRequests.length,1,'confirmed sexual scene uses only the small scene-state check');
    const pausedPrompt=await page.evaluate(async()=>await mock.slotText('scene'));
    assert.match(pausedPrompt,/Wade keeps intimate wishes private/,'participating character reference remains available');
    assert.ok(!pausedPrompt.includes('CHARACTER_EXECUTION'),'dynamic character direction pauses');
    assert.ok(!pausedPrompt.includes('SEXUAL_CONDUCT'),'dynamic physical-conduct routing pauses');
    assert.match(pausedPrompt,/<FIXED_SCENE_SETTINGS>/,'basic fixed extension settings remain active');
    assert.match(pausedPrompt,/Active world:/,'the active world marker remains active');
    assert.match(pausedPrompt,/genre, setting, tone, prose style/,'fixed prompt coexistence remains');
    gateScenario={level:'0',phase:'ended'};
    const beforeResume=requests.length;
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'They finish and turn to a different conversation.'});await mock.emit('MESSAGE_SENT',7);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.ok(requests.slice(beforeResume).filter(r=>r.url.endsWith('/systemone')).length>1,'normal Jev judgment resumes after a confirmed end');
    gateScenario=null;
    await mkdir(path.join(root,'artifacts'),{recursive:true});await page.locator('[data-sr-tab="characters"]').click();await page.locator('[data-record-kind="npc"]').click();await page.locator('[data-character-view-id="'+rosa.id+'"]').click();await page.locator('#sr-character-analysis-result').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'artifacts','mobile-characters.png')});
    await page.evaluate(()=>{document.documentElement.style.setProperty('--SmartThemeBodyColor','#202020');document.documentElement.style.setProperty('--SmartThemeBlurTintColor','#f5f5f7');});await page.screenshot({path:path.join(root,'artifacts','mobile-light.png')});
    await page.locator('#sr-character-record-close').click();
    await page.locator('#sr-npc-sheet-new').click();
    assert.match(await page.locator('#sr-character-npc-lore-note').textContent(),/NPC 한 명/);
    await page.locator('#sr-character-editor-cancel').click();
    await page.locator('[data-sr-tab="flow"]').click();
    for (const id of ['sr-roleplay-pace','sr-event-chance','sr-progression-mode','sr-judgment-style','sr-world-export','sr-world-import-open','sr-world-import-panel']) assert.equal(await page.locator('#'+id).count(),0,`${id} removed`);
    for (const value of ['static','dynamic','balanced']) {
        await page.locator('#sr-development-style').selectOption(value);
        await page.waitForFunction(value=>document.getElementById('sr-development-style').value===value,value);
        await page.locator('[data-sr-tab="advanced"]').click();await page.locator('[data-sr-tab="flow"]').click();
        assert.equal(await page.locator('#sr-development-style').inputValue(),value);
        assert.equal(store.chat.preferences.developmentStyle,value);
    }
    for (const [id,key,value] of [['sr-relationship-pace','relationshipPace','slow'],['sr-resolution-pace','resolutionPace','fast'],['sr-physical-intimacy-pace','physicalIntimacyPace','fast'],['sr-appearance-chance','appearanceChance','35']]) {
        await page.locator('#'+id).selectOption(value);
        await page.locator('[data-sr-tab="advanced"]').click();await page.locator('[data-sr-tab="flow"]').click();
        assert.equal(String(store.chat.preferences[key]),value);
        assert.equal(await page.locator('#'+id).inputValue(),value);
    }
    await page.locator('[data-sr-tab="advanced"]').click();
    await page.locator('#sr-advanced-enabled').check();
    await page.locator('[data-sr-tab="flow"]').click();
    await page.locator('#sr-advanced-style').selectOption('active');
    await page.locator('[data-sr-tab="flow"]').click();await page.locator('[data-sr-tab="advanced"]').click();
    assert.equal(store.chat.preferences.advancedStyle,'active');
    assert.equal(await page.locator('#sr-advanced-style').inputValue(),'active');
    await page.locator('[data-sr-tab="advanced"]').click();await page.locator('#sr-world-new').evaluate(e=>e.closest('details').open=true);await page.locator('#sr-world-new').click();
    await page.locator('#sr-world-edit-name').fill('Garden world');await page.locator('#sr-world-edit-prompt').fill('An ordinary garden with no supernatural powers.');await page.locator('#sr-world-save').click();
    await page.locator('#sr-world-editor').waitFor({state:'hidden'});assert.ok(store.settings.worlds.some(w=>w.name==='Garden world'));
    await page.locator('#sr-world-manager-list button').filter({hasText:'Garden world'}).click();
    await page.locator('#sr-world-edit-prompt').fill('A quiet garden by the river.');await page.locator('#sr-world-save').click();
    await page.locator('#sr-world-editor').waitFor({state:'hidden'});
    assert.equal(store.settings.worlds.find(w=>w.name==='Garden world').prompt,'A quiet garden by the river.');
    await page.locator('#sr-world-manager-list button').filter({hasText:'Garden world'}).click();await page.locator('#sr-world-delete').click();await page.locator('#sr-world-editor').waitFor({state:'hidden'});
    assert.equal(store.settings.worlds.some(w=>w.name==='Garden world'),false);
    await page.locator('#sr-settings-button').click();
    assert.equal(await page.locator('#sr-progress-intensity').inputValue(),'1.0');
    await page.locator('#sr-progress-intensity-up').click();
    await page.waitForFunction(()=>document.getElementById('sr-progress-intensity').value==='1.1');
    await page.locator('[data-sr-tab="flow"]').click();await page.locator('#sr-settings-button').click();
    assert.equal(store.chat.preferences.progressIntensity,1.1);
    assert.equal(await page.locator('#sr-progress-intensity-value').textContent(),'1.1');
    await page.locator('#sr-progress-intensity-down').click();
    await page.waitForFunction(()=>document.getElementById('sr-progress-intensity').value==='1.0');
    await page.locator('#sr-progress-intensity-reset').click();
    assert.equal(store.chat.preferences.progressIntensity,1);
    await page.screenshot({path:path.join(root,'artifacts','mobile-settings.png')});
    assert.equal(await page.locator('#sr-copy-macro').count(),0);
    assert.equal(await page.evaluate(()=>mock.macros['scene-reader']()),'');
    await page.locator('#sr-close').click();
    await page.waitForFunction(()=>document.getElementById('toast-container')?.parentElement===document.body);
    // Full public Character Reasoner workflow inside the existing character tab.
    await page.locator('#sr-extension-open').click();
    await page.locator('[data-sr-tab="characters"]').click();
    await page.locator('#sr-character-new').click();
    await page.locator('#sr-character-read-sheet').click();
    assert.equal(await page.locator('#sr-character-name').inputValue(),'Hunter');
    assert.match(await page.locator('#sr-character-source').inputValue(),/Sawyer Valentine/);
    assert.match(await page.locator('#sr-character-source').inputValue(),/Hunter speaks carefully under pressure/);
    assert.equal(await page.locator('#sr-character-read-sheet').textContent(),'시트 확인하기');
    await page.locator('#sr-character-read-sheet').click();
    assert.match(await page.locator('#sr-character-preview-source').textContent(),/Hunter speaks carefully under pressure/);
    await page.locator('#sr-character-record-close').click();
    await page.locator('.sr-character-lore-picker > summary').click();
    await page.locator('.sr-character-lore-book').first().locator('summary').click();
    await page.locator('#sr-character-lore-options input').first().check();
    await page.evaluate(()=>{
        mock.worldBooks['Hunter Lore'].entries[1].content='The council meeting is now on Friday.';
        mock.loreReady=new Promise(resolve=>{mock.releaseLore=resolve;});
    });
    await page.locator('#sr-character-lore-refresh').click();
    await page.locator('#sr-character-copy-prompt').click();
    await page.evaluate(()=>{mock.releaseLore();mock.loreReady=null;});
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('복사했습니다'));
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/ENTITY_NAME: Hunter/);
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Hunter speaks carefully under pressure/,'character personality joins the copied analysis request');
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/The council meeting is now on Friday/,'copy waits for refreshed lore before reading selected sources');
    const external={entity_type:'character',entity_name:'Hunter',records:[{type:'knowledge',target:'self',when:['before confirmation'],rule:'Hunter suspects the invitation is a trap.',modality:'possibility',basis:'explicit',source_ids:['S001'],knowledge_domain:'event',knowledge_state:'suspects'}]};
    const beforeImport=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.locator('#sr-character-import-file').setInputFiles({name:'hunter.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(external))});
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('형식 검사 완료'));
    const beforeInvalidImport=JSON.stringify(store.characters);
    await page.locator('#sr-character-import-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('저장되지 않음'));
    assert.equal(await page.locator('#sr-character-import-json').inputValue(),'','a failed replacement upload cannot leave an older file ready to save');
    await page.locator('#sr-character-import').click();
    await page.waitForFunction(()=>mock.errors.length>=2);
    assert.equal(JSON.stringify(store.characters),beforeInvalidImport,'invalid replacement upload preserves saved records');
    await page.evaluate(()=>mock.errors=[]);
    await page.locator('#sr-character-import-file').setInputFiles({name:'hunter.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(external))});
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('형식 검사 완료'));
    await page.evaluate(()=>{
        mock.worldBooks['Hunter Lore'].entries[1].content='The council meeting is now on Tuesday.';
        mock.loreReady=new Promise(resolve=>{mock.releaseLore=resolve;});
    });
    await page.locator('#sr-character-lore-refresh').click();
    await page.locator('#sr-character-import').click();
    await page.evaluate(()=>{mock.releaseLore();mock.loreReady=null;});
    await page.waitForFunction(()=>document.getElementById('sr-character-modal').hidden);
    assert.ok(store.characters.characters.find(entry=>entry.name==='Hunter').selectedLore.some(item=>item.content==='The council meeting is now on Tuesday.'),'save waits for the selected lore sources to finish refreshing');
    assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,beforeImport,'import does not run Jev revalidation');
    await page.locator('[data-record-kind="character"]').click();
    const group1=store.characters.recordGroups.find(g=>g.name==='Hunter');
    const firstVersion=group1.versions[0].id;
    assert.equal(group1.versions.length,1);
    await page.locator('[data-record-version="'+firstVersion+'"][data-record-action="edit"]').click();
    assert.equal(await page.locator('#sr-character-error-copy').isHidden(),true,'a newly opened editor does not offer the previous file error log');
    external.records[0].rule='Hunter doubts the invitation is genuine.';
    await page.locator('#sr-character-import-file').setInputFiles({name:'hunter-updated.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(external))});
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('형식 검사 완료'));
    await page.locator('#sr-character-import').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-modal').hidden);
    assert.equal(store.characters.recordGroups.find(g=>g.name==='Hunter').versions.length,2,'editing one file creates a dated version');
    await page.locator('[data-record-version="'+firstVersion+'"][data-record-action="apply"]').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('선택한 버전을 적용'));
    await page.locator('[data-record-version="'+firstVersion+'"][data-record-action="view"]').click();
    assert.match(await page.locator('#sr-character-analysis-result').textContent(),/suspects the invitation is a trap/);
    await page.locator('#sr-character-preview-source-tab').click();
    assert.match(await page.locator('#sr-character-preview-source').textContent(),/Hunter speaks carefully under pressure/);
    for(const width of [320,390,768,1280]) {
        await setViewportSize({width,height:850});
        assert.equal(await page.locator('#scene-reader-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+2),false,'version UI overflow at '+width);
    }
    await page.screenshot({path:path.join(root,'artifacts','character-versions-desktop.png')});
    await setViewportSize({width:390,height:850});
    await page.locator('#sr-character-record-close').click();
    await page.locator('[data-record-version="'+firstVersion+'"][data-record-action="edit"]').click();
    await page.screenshot({path:path.join(root,'artifacts','character-import-mobile.png')});
    await page.locator('#sr-character-editor-cancel').click();
    await page.locator('[data-sr-tab="flow"]').click();
    await page.evaluate(()=>{mock.chat.push({is_user:true,name:'User',mes:'Hunter examines the invitation. Is it a trap?'});document.getElementById('send_textarea').value='';});
    const slashJudge=JSON.parse(await page.evaluate(()=>mock.slashCommands['srh-judge'].callback({},'')));
    assert.equal(slashJudge.status,'prepared');
    await page.waitForFunction(async()=>(await mock.slotText('scene')).includes('Hunter suspects the invitation is a trap.'));
    assert.ok(!Object.keys(requests.filter(r=>r.url.endsWith('/systemone')).at(-1).body.questions).some(key=>/response_direction|response_basis/.test(key)));
    assert.ok(store.chat.lastJudgment?.characterInjectionChars<=5000,'character budget is tracked separately from other prompt blocks');
    await page.locator('[data-sr-tab="characters"]').click();
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),page.locator('#sr-character-volume').selectOption('basic')]);
    assert.equal(store.chat.lastJudgment,null,'changing the volume discards the old judgment');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),page.locator('#sr-npc-record-limit').selectOption('2')]);
    assert.equal(store.chat.preferences.npcRecordLimit,2,'NPC limit persists independently');
    assert.equal(store.chat.preferences.characterVolume,'basic','NPC limit does not alter character/persona volume');
    await page.locator('#sr-close').click();
    await page.reload();
    await page.locator('#sr-extension-open').evaluate(e=>e.closest('details').open=true);
    await page.locator('#sr-extension-open').click();await page.locator('[data-sr-tab="characters"]').click();
    assert.equal(store.characters.characters.find(e=>e.name==='Hunter').appliedRecordVersion,firstVersion);
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('[data-record-version="'+firstVersion+'"][data-record-action="delete"]').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('해당 버전을 삭제'));
    assert.equal(store.characters.recordGroups.find(g=>g.name==='Hunter').versions.length,1,'only the selected dated file is deleted');
    const remaining=store.characters.recordGroups.find(g=>g.name==='Hunter').versions[0].id;
    await page.locator('[data-record-version="'+remaining+'"][data-record-action="edit"]').click();
    await page.locator('#sr-character-import-file').setInputFiles({name:'hunter-failed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(external))});
    const beforeFailedSave=JSON.stringify(store.characters);
    failCharacterWrite=true;
    await page.locator('#sr-character-import').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-import-status').textContent.includes('저장되지 않음'));
    assert.equal(JSON.stringify(store.characters),beforeFailedSave,'failed persistence keeps stored versions');
    await page.locator('#sr-character-error-copy').click();
    const errorLog=JSON.parse(await page.evaluate(()=>navigator.clipboard.readText()));
    assert.equal(errorLog.stage,'save');
    assert.ok(!JSON.stringify(errorLog).includes('Hunter suspects the invitation is a trap.'),'character error report omits source content');
    await page.locator('#sr-character-editor-cancel').click();
    assert.equal(await page.locator('.sr-tabs [data-sr-tab]').count(),4);
    await page.locator('#sr-close').click();
    store.settings.global.ownerUnlocked=false;
    await page.reload();
    await page.locator('#sr-extension-open').evaluate(e=>e.closest('details').open=true);
    await page.locator('#sr-extension-open').click();
    await page.locator('[data-sr-tab="advanced"]').click();
    await page.locator('#sr-world-new').evaluate(e=>e.closest('details').open=true);
    assert.equal(await page.locator('#sr-world-advanced').evaluate(e=>e.hidden),false,'advanced world importer is available without developer unlock');
    assert.equal(await page.locator('#sr-owner-card').evaluate(e=>e.hidden),true,'other developer tools remain locked');
    await page.locator('#sr-world-advanced').evaluate(e=>e.open=true);
    assert.equal(await page.locator('#sr-world-advanced-generate').count(),0,'advanced world uses external JSON import only');
    assert.equal(await page.locator('#sr-world-advanced-source').count(),0,'advanced world has no redundant source box');
    await page.locator('#sr-world-advanced-copy').click();
    assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/scene-reader-world/,'copy supplies the world compiler contract');
    await page.locator('#sr-world-advanced-file').setInputFiles({name:'garden.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'scene-reader-world',version:1,name:'Moonlit Garden',short_description:'A garden whose gate responds to moonlight.',fixed_rules:'The garden remains an ordinary place except for its moonlit gate.',franchise:false,calendar_topics:[],records:[{id:'W001',category:'mechanism',when:'When moonlight reaches the gate.',keywords:['moonlight','gate'],rule:'Moonlight opens the garden gate.',source_quote:'Moonlight opens the garden gate.'}]}))});
    await page.waitForFunction(()=>document.getElementById('sr-world-advanced-status').textContent.includes('garden.json'));
    assert.match(await page.locator('#sr-world-advanced-json').inputValue(),/Moonlight opens the garden gate/);
    await page.locator('#sr-world-advanced-save').click();
    await page.waitForFunction(()=>document.getElementById('sr-world-manager-list').textContent.includes('Moonlit Garden'));
    const advancedWorld=store.settings.worlds.find(world=>world.name==='Moonlit Garden');
    assert.equal(advancedWorld.advanced.records.length,1,'advanced JSON survives settings persistence');
    await page.locator('#sr-world-manager-list button').filter({hasText:'Moonlit Garden'}).click();
    assert.match(await page.locator('#sr-world-advanced-json').inputValue(),/Moonlight opens the garden gate/,'saved advanced world can be reopened');
    const validWorldJson=await page.locator('#sr-world-advanced-json').inputValue();
    const beforeInvalid=JSON.stringify(store.settings.worlds);
    await page.locator('#sr-world-advanced-json').fill('{invalid');
    await page.locator('#sr-world-advanced-save').click();
    await page.waitForFunction(()=>document.getElementById('sr-world-advanced-status').textContent.includes('검증 실패'));
    assert.equal(JSON.stringify(store.settings.worlds),beforeInvalid,'malformed world import preserves prior data');
    await page.locator('#sr-world-advanced-file').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(validWorldJson)});
    await page.waitForFunction(()=>document.getElementById('sr-world-advanced-status').textContent.includes('world.json'));
    assert.equal(await page.locator('#sr-world-advanced-json').inputValue(),validWorldJson);
    failWorldWrite=true;
    await page.locator('#sr-world-advanced-save').click();
    await page.waitForFunction(()=>document.getElementById('sr-world-advanced-status').textContent.includes('처리 실패'));
    assert.equal(JSON.stringify(store.settings.worlds),beforeInvalid,'failed server write preserves saved world bank');
    const locallySaved=await page.evaluate(()=>JSON.parse(localStorage.getItem('scene-reader-custom-worlds-v1')));
    assert.deepEqual(locallySaved,store.settings.worlds,'failed server write restores browser copy');
    assert.equal(await page.locator('#sr-world-advanced-json').inputValue(),validWorldJson,'failed save preserves editor input');
    await page.evaluate(()=>mock.errors=[]);
    for(const width of [320,390,768,1280]) {
        await setViewportSize({width,height:850});
        assert.equal(await page.locator('#scene-reader-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+2),false,'advanced world UI overflow at '+width);
    }
    await page.locator('#sr-world-advanced').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'artifacts','world-editor-desktop.png')});
    await page.locator('#sr-world-advanced-cancel').click();
    await page.reload();
    await page.locator('#sr-extension-open').evaluate(e=>e.closest('details').open=true);
    await page.locator('#sr-extension-open').click();
    await page.locator('[data-sr-tab="flow"]').click();
    await page.locator('#sr-world-profile').selectOption(advancedWorld.id);
    worldChoice='yes';
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'At the moonlit garden gate, Hunter waits.'});await mock.emit('MESSAGE_SENT',mock.chat.length-1);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    await page.waitForFunction(async()=>(await mock.slotText('world')).includes('Moonlight opens the garden gate.'));
    assert.match(await page.evaluate(async()=>await mock.slotText('world')),/ordinary place.*Moonlight opens the garden gate/s,'chosen world record reaches the world macro');
    assert.doesNotMatch(await page.evaluate(async()=>await mock.slotText('scene')),/Moonlight opens the garden gate/,'scene instructions do not duplicate the world-rule category');
    assert.match(await page.evaluate(async()=>await mock.slotText('scene')),/Active world: Moonlit Garden/,'scene routing retains only a short world reference');
    const worldGate=requests.filter(request=>request.url.endsWith('/systemone')).findLast(request=>request.body.state?.world_record_candidates?.length);
    assert.equal(worldGate.body.state.world_record_candidates[0].id,'W001','the scene gate judges bounded world candidates');
    assert.equal(worldGate.body.state.world_context.name,'Moonlit Garden','world selector receives the setting identity');
    assert.match(worldGate.body.state.world_context.short_description,/moonlight/);
    gateScenario={level:'3',phase:'active'};
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'At the moonlit garden gate, the explicit sexual interaction begins.'});await mock.emit('MESSAGE_SENT',mock.chat.length-1);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    await page.waitForFunction(async()=>(await mock.slotText('world')).includes('Moonlight opens the garden gate.'));
    assert.match(await page.evaluate(async()=>await mock.slotText('world')),/Moonlight opens the garden gate/,'relevant world records remain in the NSFW route');
    gateScenario={level:'0',phase:'ended'};
    worldChoice='no';
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'They leave the garden and discuss ordinary work.'});await mock.emit('MESSAGE_SENT',mock.chat.length-1);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    await page.waitForFunction(async()=>(await mock.slotText('world')).includes('ordinary place'));
    assert.doesNotMatch(await page.evaluate(async()=>await mock.slotText('world')),/Moonlight opens the garden gate/,'unrelated world rule is omitted');
    worldChoice='invalid';
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Hunter returns to the garden.'});await mock.emit('MESSAGE_SENT',mock.chat.length-1);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.equal(store.chat.lastJudgment.worldSelection.status,'fallback');
    assert.doesNotMatch(await page.evaluate(async()=>await mock.slotText('world')),/Moonlight opens the garden gate/,'invalid selector response retains fixed rules without unverified conditional rules');
    const fallbackRequest=requests.findLast(request=>request.body.state?.character_profiles!==undefined).body;
    assert.equal(fallbackRequest.state.world_rule_selection.status,'fallback');
    assert.equal(fallbackRequest.state.applicable_world_rules.length,0,'progression judge and final injection use the same fallback rules');
    assert.deepEqual(store.chat.lastJudgment.worldSelection.appliedIds,[]);
    worldChoice='no';
    gateScenario=null;
    await page.locator('#sr-world-profile').selectOption('current');
    await page.locator('.sr-seasonal-options').evaluate(e=>e.open=true);
    await page.locator('#sr-season-holidays').check();
    await page.locator('#sr-season-college_football').check();
    await page.locator('#sr-season-us_university').check();
    await new Promise((resolve,reject)=>{const started=Date.now();const poll=()=>store.chat.preferences?.seasonalReferences?.length===3?resolve():Date.now()-started>3000?reject(new Error('Seasonal choices were not saved')):setTimeout(poll,20);poll();});
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Current date: 2026-10-30. The American campus prepares for the weekend.'});await mock.emit('MESSAGE_SENT',mock.chat.length-1);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    await page.waitForFunction(async()=>(await mock.slotText('world')).includes('Halloween week'));
    const seasonalPayload=await page.evaluate(async()=>await mock.slotText('world'));
    assert.match(seasonalPayload,/college-football/);
    assert.match(seasonalPayload,/autumn semester/);
    assert.equal(await page.locator('.sr-tabs [data-sr-tab]').count(),4,'world tools stay within the existing tabs');
    for(const width of [320,390,768,1280]) {
        await setViewportSize({width,height:850});
        assert.equal(await page.locator('#scene-reader-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+2),false,'seasonal UI overflow at '+width);
    }
    await setViewportSize({width:390,height:850});
    await page.locator('.sr-seasonal-options').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'artifacts','world-seasonal-mobile.png')});
    await page.locator('#sr-settings-button').click();
    await page.locator('#sr-world-injection-mode').evaluate(element=>element.closest('details').open=true);
    await page.locator('#sr-world-injection-mode').selectOption('depth');
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Current date: 2026-10-31. They continue across campus.'});await mock.emit('MESSAGE_SENT',mock.chat.length-1);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.match(await page.evaluate(()=>JSON.stringify(mock.prompts)),/Halloween week/,'seasonal world reaches depth injection');
    assert.equal(await page.evaluate(()=>mock.macros['scene-reader-world']()),'','depth mode leaves no duplicate world macro');
    assert.equal(await page.locator('#sr-retrieval-provider').isVisible(),true);
    assert.equal(await page.locator('#sr-retrieval-vertex-region').count(),0,'region is fixed, not editable');
    await Promise.all([
        page.waitForResponse(response=>response.url().endsWith('/settings')),
        page.locator('#sr-retrieval-provider').selectOption('vertexai'),
    ]);
    assert.equal(store.settings.global.retrievalVertexRegion,'global');
    assert.equal(store.settings.global.retrievalModel,'gemini-embedding-001');
    assert.equal(await page.locator('#sr-retrieval-model-row').isVisible(),false);
    await page.locator('#sr-retrieval-provider').selectOption('nanogpt');
    await page.waitForFunction(()=>document.getElementById('sr-retrieval-model').value==='Qwen/Qwen3-Embedding-0.6B');
    assert.equal(store.settings.global.retrievalProvider,'nanogpt');
    assert.equal(store.settings.global.retrievalModel,'Qwen/Qwen3-Embedding-0.6B','provider and model save together');
    await page.locator('#sr-retrieval-key').fill('nano-test-secret');
    await page.locator('#sr-retrieval-key-save').click();
    await page.waitForFunction(()=>document.getElementById('sr-retrieval-key-status').textContent.includes('저장됨'));
    assert.equal(retrievalSecrets.api_key_nanogpt,'nano-test-secret');
    assert.doesNotMatch(JSON.stringify(store.settings),/nano-test-secret/,'the extension never persists the embedding key');
    await page.locator('#sr-retrieval-test').click();
    await page.waitForFunction(()=>document.getElementById('sr-retrieval-key-status').textContent.includes('연결 성공'));
    await page.locator('#sr-retrieval-provider').selectOption('transformers');
    await page.waitForFunction(()=>document.getElementById('sr-retrieval-key-status').textContent.includes('키 불필요'));
    const jevBefore=requests.filter(request=>request.url.endsWith('/systemone')).length;
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Hunter and Wade speak about family matters.'});await mock.emit('MESSAGE_SENT',mock.chat.length-1);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.equal(requests.filter(request=>request.url.endsWith('/systemone')).length-jevBefore,2,'normal scene still uses only the gate and main Jev calls');
    assert.ok(requests.some(request=>request.url==='/api/vector/query'),'native vector search is used from the existing runtime');
    assert.ok(store.chat.lastJudgment.characterTrace.some(person=>person.prefilterStats?.retrievalStatus==='ready'));
    await page.evaluate(async()=>{mock.streamingEnabled=true;await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.equal(await page.evaluate(()=>mock.prompts['scene-reader-state-capture']),'','streaming suppresses the internal state request');
    await page.evaluate(async()=>{mock.streamingEnabled=false;ctx.mainApi='openai';ctx.chatCompletionSettings={n:2};await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.equal(await page.evaluate(()=>mock.prompts['scene-reader-state-capture']),'','multiple completions do not receive unsupported metadata requests');
    await page.evaluate(async()=>{ctx.chatCompletionSettings.n=1;await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.match(await page.evaluate(async()=>await mock.slotText('scene')),/\[\[SR_STATE\]\]/,'single nonstream output resumes state collection inside the scene slot');
    for(const width of [320,390]) {
        await setViewportSize({width,height:850});
        assert.equal(await page.locator('#scene-reader-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+2),false,'search settings overflow at '+width);
    }
    await setViewportSize({width:390,height:850});
    await page.locator('#sr-retrieval-test').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'artifacts','retrieval-settings-mobile.png')});
    await page.locator('[data-sr-tab="characters"]').click();
    await page.evaluate(async()=>{mock.chat.push({is_user:false,mes:'Hunter pauses.\n[[SR_STATE]]C0|a38[[/SR_STATE]]\n<Scene_Info>Time: 14:09</Scene_Info>'});await mock.emit('MESSAGE_RECEIVED',mock.chat.length-1);});
    if (!(await page.locator('.sr-character-turn-card').first().evaluate(card=>card.open))) await page.locator('.sr-character-turn-card > summary').first().click();
    await page.locator('.sr-character-card-tabs [data-character-card-view="emotion"]').first().click();
    assert.match(await page.locator('.sr-character-card-body:visible').first().textContent(),/필수 수치 누락/,'failed metadata explains the cause on the emotion tab');
    assert.deepEqual(store.chat.characterStateCapture.diagnostics.reasons,['missing_fields']);
    assert.equal(await page.evaluate(()=>mock.chat.at(-1).mes),'Hunter pauses.\n<Scene_Info>Time: 14:09</Scene_Info>','failed metadata does not erase the preset info block');
    // Exercise the actual background collector through UI, output hooks and storage.
    await page.locator('[data-sr-tab="characters"]').click();
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),page.locator('#sr-profile-emotion').check()]);
    assert.equal(await page.locator('#sr-emotion-now').isVisible(),true,'manual recovery is always available');
    assert.match(await page.locator('.sr-emotion-controls').textContent(),/확장 연결모델/);
    await page.evaluate(async()=>{mock.streamingEnabled=true;await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.equal(await page.evaluate(()=>mock.prompts['scene-reader-state-capture']),'','profile mode never asks the RP model for metadata, including streaming');
    await page.evaluate(async()=>{mock.chat.push({is_user:false,mes:'Hunter closes the door, angry about the delay.'});await mock.emit('MESSAGE_RECEIVED',mock.chat.length-1);});
    assert.equal(await page.evaluate(()=>mock.profileStateRequests.length),1);
    assert.ok(await page.evaluate(()=>mock.toasts.some(item=>item.message==='감정 수집 중…')),'automatic collection shows its start toast');
    assert.match(await page.locator('#sr-character-turn-results').textContent(),/수집 중/,'output hook finishes and updates the UI before the profile model replies');
    const profileRequest=await page.evaluate(()=>{const {messages,maxTokens,options}=mock.profileStateRequests[0];return {messages,maxTokens,options}});
    assert.equal(profileRequest.messages.length,2);
    assert.equal(JSON.parse(profileRequest.messages[1].content).output,'Hunter closes the door, angry about the delay.');
    assert.equal(profileRequest.options.includePreset,false);
    assert.equal(profileRequest.maxTokens,1200);
    const profileOutputIndex=await page.evaluate(()=>mock.chat.length-1);
    await page.evaluate(()=>mock.profileStateRequests[0].resolve({content:JSON.stringify({states:[{code:'C0',a:20,c:80,anger:45,joy:0,fear:0,sadness:0}]})}));
    await page.waitForFunction(()=>document.querySelector('#sr-character-turn-results')?.textContent.includes('45%'));
    assert.equal(store.chat.characterStateCapture.status,'incomplete','unreturned registered actors remain visible as incomplete');
    assert.ok(await page.evaluate(()=>mock.toasts.some(item=>item.level==='warning' && item.message.includes('일부가 반환되지'))),'partial actor response does not announce full completion');
    assert.ok(store.chat.characterStateEvents.some(event=>event.outputIndex===profileOutputIndex&&event.states[0].values.anger===45));
    // Manual recovery requests only missing people and preserves saved values.
    const jevBeforeEmotion=requests.filter(request=>request.url.endsWith('/systemone')).length;
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),page.locator('#sr-profile-emotion').uncheck()]);
    assert.equal(await page.locator('#sr-emotion-now').isVisible(),true);
    await page.locator('#sr-emotion-now').click();
    await page.waitForFunction(()=>mock.profileStateRequests.length===2);
    assert.equal(await page.locator('#sr-emotion-now').isDisabled(),true);
    const manualRequest=await page.evaluate(()=>JSON.parse(mock.profileStateRequests[1].messages[1].content));
    assert.equal(manualRequest.output,'Hunter closes the door, angry about the delay.');
    assert.ok(!manualRequest.people.some(person=>person.code==='C0'),'the saved actor is not recollected');
    await page.locator('#sr-emotion-now').evaluate(button=>button.click());
    assert.equal(await page.evaluate(()=>mock.profileStateRequests.length),2,'double clicks never duplicate collection');
    await page.evaluate(()=>{const people=JSON.parse(mock.profileStateRequests[1].messages[1].content).people;mock.profileStateRequests[1].resolve({content:JSON.stringify({states:people.map(person=>({code:person.code,anger:0,joy:0,fear:0,sadness:0,...(person.trackArousal?{a:0,c:90}:{})}))})});});
    await page.waitForFunction(()=>!document.querySelector('#sr-emotion-now').disabled);
    assert.match(await page.locator('#sr-character-turn-results').textContent(),/45%/,'the original saved emotion is unchanged');
    assert.equal(requests.filter(request=>request.url.endsWith('/systemone')).length,jevBeforeEmotion,'manual emotion collection makes no Jev call');
    assert.equal(store.chat.characterStateEvents.filter(event=>event.outputIndex===profileOutputIndex).length,1,'manual recheck replaces rather than appends');
    await page.locator('#sr-emotion-now').click();
    await page.waitForFunction(()=>!document.querySelector('#sr-emotion-now').disabled);
    assert.equal(await page.evaluate(()=>mock.profileStateRequests.length),2,'all saved means no further model request');
    const neutralNpc=manualRequest.people.find(person=>!person.trackArousal);
    assert.ok(neutralNpc,'browser scenario includes a moods-only NPC');
    const neutralCard=page.locator('.sr-character-turn-card').filter({has:page.locator('summary', {hasText:neutralNpc.name})}).first();
    if(!(await neutralCard.evaluate(card=>card.open)))await neutralCard.locator(':scope > summary').click();
    await neutralCard.locator('[data-character-card-view=emotion]').click();
    assert.equal(await neutralCard.locator('.sr-emotion-row').count(),4,'neutral NPC displays all four zero mood bars');
    assert.ok((await neutralCard.locator('.sr-emotion-row strong').allTextContents()).every(text=>text==='0%'));
    await neutralCard.locator(':scope > summary').click();
    await page.locator('.sr-emotion-controls').screenshot({path:path.join(root,'artifacts','emotion-manual-mobile.png')});
    assert.equal(store.chat.preferences.profileEmotionJudgment,false,'manual recovery preserves the automatic mode');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),page.locator('#sr-profile-emotion').check()]);
    // A later request must not revive state after a reply is edited or reset.
    await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Hunter considers the next step.'});await mock.emit('MESSAGE_SENT',mock.chat.length-1);await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);mock.chat.push({is_user:false,mes:'Hunter waits quietly.'});await mock.emit('MESSAGE_RECEIVED',mock.chat.length-1);});
    assert.equal(await page.evaluate(()=>mock.profileStateRequests.length),3);
    const editedIndex=await page.evaluate(()=>mock.chat.length-1);
    await page.evaluate(async()=>{mock.chat.at(-1).mes='Hunter leaves calmly.';await mock.emit('MESSAGE_EDITED',mock.chat.length-1);mock.profileStateRequests[2].resolve({content:JSON.stringify({states:[{code:'C0',a:20,c:80,anger:90}]})});});
    await page.evaluate(async()=>{await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.ok(!store.chat.characterStateEvents.some(event=>event.outputIndex===editedIndex),'edited response rejects late state');
    await page.evaluate(async()=>{mock.chat.push({is_user:false,mes:'Hunter returns to the room.'});await mock.emit('MESSAGE_RECEIVED',mock.chat.length-1);});
    assert.equal(await page.evaluate(()=>mock.profileStateRequests.length),4);
    await page.locator('#sr-settings-button').click();
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/transaction')),page.locator('#sr-reset-npc').click()]);
    await page.evaluate(()=>mock.profileStateRequests[3].resolve({content:JSON.stringify({states:[{code:'C0',a:20,c:80,anger:90}]})}));
    await page.evaluate(async()=>{await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.deepEqual(store.chat.characterStateEvents,[],'reset cannot be undone by a late background response');
    // Stop during a real automatic preparation waiting for the previous collector.
    await page.evaluate(async()=>{mock.chat.push({is_user:false,mes:'Hunter checks the window.'});await mock.emit('MESSAGE_RECEIVED',mock.chat.length-1);});
    const stoppedRequestCount=await page.evaluate(()=>mock.profileStateRequests.length);
    const beforeStopJev=requests.filter(request=>request.url.endsWith('/systemone')).length;
    await page.evaluate(()=>{mock.waitingGeneration=mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    await page.evaluate(async()=>{await mock.emit('GENERATION_STOPPED');await mock.waitingGeneration;});
    assert.equal(await page.evaluate(()=>mock.profileStateRequests.at(-1).options.signal.aborted),true,'host stop aborts the auxiliary model request');
    await page.evaluate(()=>mock.profileStateRequests.at(-1).resolve({content:JSON.stringify({states:[{code:'C0',a:20,c:80,anger:99}]})}));
    assert.equal(requests.filter(request=>request.url.endsWith('/systemone')).length,beforeStopJev,'stopped preparation never starts Jev after the old collector settles');
    assert.ok(!store.chat.characterStateEvents.some(event=>event.states.some(state=>state.values?.anger===99)),'late stopped collection cannot save');
    await page.evaluate(async()=>{await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);mock.chat.push({is_user:false,mes:'Hunter sits beside the window.'});await mock.emit('MESSAGE_RECEIVED',mock.chat.length-1);});
    assert.equal(await page.evaluate(()=>mock.profileStateRequests.length),stoppedRequestCount+1,'next intentional generation can collect normally');
    await page.evaluate(()=>{const request=mock.profileStateRequests.at(-1),people=JSON.parse(request.messages[1].content).people;request.resolve({content:JSON.stringify({states:people.map(person=>({code:person.code,anger:0,joy:0,fear:0,sadness:0,...(person.trackArousal?{a:0,c:90}:{})}))})});});
    await page.waitForFunction(()=>!document.querySelector('#sr-emotion-now').disabled);
    await page.locator('[data-sr-tab="characters"]').click();
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/chat')),page.locator('#sr-profile-emotion').uncheck()]);
    assert.equal(await page.locator('#sr-emotion-now').isVisible(),true,'manual recovery remains available in main-output mode');
    await page.evaluate(async()=>{mock.streamingEnabled=false;await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    assert.match(await page.evaluate(async()=>await mock.slotText('scene')),/\[\[SR_STATE\]\]/,'turning the option off restores main-model collection inside the scene slot');
    await page.locator('#sr-settings-button').click();
    await page.locator('#sr-enabled').uncheck();
    await page.waitForFunction(()=>!JSON.stringify(mock.prompts).includes('Halloween week'));
    assert.equal(await page.evaluate(async()=>await mock.slotText('world')),'','disabled extension removes world macro');
    assert.equal(await page.evaluate(()=>mock.prompts['scene-reader-state-capture']),'','disabled extension also removes state collection');
    store.settings.global.ownerUnlocked=true;
    await page.reload();
    await page.locator('#sr-extension-open').evaluate(e=>e.closest('details').open=true);
    await page.locator('#sr-extension-open').click();
    await page.locator('#sr-settings-button').click();
    assert.equal(await page.locator('#sr-owner-diagnostic-panel').count(),0,'duplicate feature diagnostics UI removed');
    await page.locator('#sr-copy-debug').click();
    assert.equal(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())).reportVersion,4);
    const toastPlacement=await page.evaluate(async prefix=>{
        const dialog=document.getElementById('scene-reader-dialog');
        if(!dialog.open)dialog.showModal();
        const {notifySceneReaderToast}=await import(prefix+'src/ui/toasts.js');
        const toast=notifySceneReaderToast(window,'info','Placement check','씬판독기',{timeOut:0});
        const inside=toast[0].parentElement?.parentElement===dialog;
        dialog.close();
        await new Promise(resolve=>setTimeout(resolve,0));
        const visible=toast[0].parentElement?.parentElement===document.body;
        toast.remove();
        return {inside,visible};
    },prefix);
    assert.deepEqual(toastPlacement,{inside:true,visible:true},'toast remains visible when its dialog closes');
    // Both entry points must prepare once before prompt assembly. A missing primary
    // event is recovered by the manifest interceptor with the same domain pipeline.
    gateScenario=null;
    await page.evaluate(()=>document.getElementById('scene-reader-dialog').showModal());
    await page.locator('#sr-settings-button').click();
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/settings')),page.locator('#sr-enabled').check()]);
    await page.evaluate(async()=>{await mock.emit('GENERATION_ENDED');mock.chat.push({is_user:true,mes:'Hub trigger test: I enter the office and greet Hunter.'});document.getElementById('send_textarea').value='';await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    const primaryRequestCount=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.evaluate(()=>window.SceneReaderHubBeforeGenerate([],4096,()=>{},'normal'));
    assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,primaryRequestCount,'interceptor reuses completed primary preparation without duplicate Jev calls');
    assert.ok(await page.evaluate(()=>SceneReaderHub.diagnostics().events.some(e=>e.code==='INTERCEPTOR_PREPARATION_REUSED')));
    await page.evaluate(async()=>{await mock.emit('GENERATION_ENDED');mock.chat.push({is_user:true,mes:'Hub fallback test: I ask Hunter to explain the next step.'});await window.SceneReaderHubBeforeGenerate([],4096,()=>{},'normal');});
    assert.ok(requests.filter(r=>r.url.endsWith('/systemone')).length>primaryRequestCount,'missing primary event is prepared through interceptor');
    const receipt=await page.evaluate(async()=>{
        const prompt=Object.values(mock.prompts).map(value=>typeof value==='string'?value:value.value||'').join('\n')+'\n'+document.getElementById('sr-prompt-preview').textContent;
        await mock.emit('GENERATE_AFTER_DATA',{prompt},false);
        return SceneReaderHub.diagnostics().events.findLast(e=>e.code==='PROMPT_OBSERVED');
    });
    assert.equal(receipt.scene,'confirmed','final prompt observer confirms the prepared scene payload');
    assert.ok(receipt.promptHash&&receipt.promptChars>0,'evidence retains counts and hash without prompt text');
    assert.equal('prompt' in receipt,false);
    assert.ok(await page.locator('#sr-hub-run-trace').textContent());
    assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>mock.errors),[]);
    const requestAudit=await page.evaluate(async()=>{
        await mock.emit('GENERATION_STARTED','normal',{},false);
        const messages=[{role:'system',content:mock.promptManager.preparePrompt(mock.presetSettings.prompts[0]).content},...Object.values(mock.prompts).filter(Boolean).map(content=>({role:'system',content}))];
        await mock.emit('GENERATE_AFTER_DATA',{prompt:messages},false);
        const body={messages};
        await mock.emit('CHAT_COMPLETION_SETTINGS_READY',body);
        const assembled=SceneReaderHub.diagnostics().events.findLast(e=>e.code==='PROMPT_OBSERVED');
        await fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});
        const included=SceneReaderHub.diagnostics().events.findLast(e=>e.code==='PROMPT_OBSERVED');
        await mock.emit('GENERATE_AFTER_DATA',{prompt:body.messages},false);
        body.messages.splice(0,body.messages.length,{role:'system',content:'Removed by a later prompt modifier'});
        await mock.emit('CHAT_COMPLETION_SETTINGS_READY',body);
        await fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});
        const missing=SceneReaderHub.diagnostics().events.findLast(e=>e.code==='PROMPT_OBSERVED');
        const lastToast=[...document.querySelectorAll('.sr-toast-message')].at(-1)?.textContent;
        return {assembled,included,missing,lastToast};
    });
    assert.equal(requestAudit.assembled.scene,'confirmed');assert.equal(requestAudit.assembled.phase,'assembly');
    assert.equal(requestAudit.included.scene,'confirmed');assert.equal(requestAudit.included.phase,'request');
    assert.equal(requestAudit.missing.scene,'unconfirmed');assert.match(requestAudit.lastToast,/확인하지 못/);
    assert.deepEqual(errors,[]);
    await checkPresetSlots(page,store,requests);
    await checkCompilerCopies(page,requests,store);
    await checkBundlesAndProviders(page,store,requests,root,setViewportSize);
    await checkRecordProtection(page,store,requests,review=>{recordReview=review;});
    await checkRecoverySettings(page,store,requests,setViewportSize);
    await checkOpportunitySettings(page,store,requests,setViewportSize,root);
    assert.deepEqual(errors,[]);
    console.log('Browser passed: desktop/mobile/landscape × 5 panels, bottom reachability, mouse/touch drag resize, fitting child dialogs, size persistence, character/world save, native vector retrieval, integrated key settings, two Jev calls, seasonal context, NSFW pause/resume, OOC, delete, clipboard.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
