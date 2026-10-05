import {backupSource} from '../storage/backup-label.js';
import {preferencesForConnection} from '../storyline/preferences.js';
import {clone,digest,chatRef,ownerRef,SHARED_LINK,bytes,fail} from '../storage/shared-document.js';
import {projectBaseline,hasLegacyMaterial} from '../baseline/projector.js';
import {confirmedStory,resetRuntime,splitRuntime,localCompanions} from '../storyline/projector.js';
import {initialStory,pinCheckpoint} from '../storyline/repository.js';
import {legacyPayload,materializeLegacy} from '../storage/legacy-materializer.js';
import {protectRollback} from '../storage/rollback-safety.js';
import {createAccountMigration} from './account.js';
import {importLegacyBrowserWorlds} from '../world/shared-library.js';
import {expandCharacterStore} from '../storage/character-pages.js';
// Explicit user operations only. No inference, startup scans, or background migration.
export function createSharedService(deps,router) {
    let active=null,allController=null;const {documents,required,rawPost,serial}=router;
    const account=createAccountMigration(rawPost,()=>router.scope?.(),()=>backupSource(deps.getContext()));
    const report=(phase,status,code)=>deps.noteDiagnostic?.('shared_operation',{module:'src/migration/shared-service.js',phase,status,...(code?{code}:{})});
    const key=()=>deps.stateChatKey();
    const catalogId=()=>ownerRef(key());
    async function catalog(id=catalogId(),fresh=false){return (await documents.read('catalog',id,{fresh}))?.data || {ownerRef:id,stories:[],rooms:[],deferred:[]};}
    async function saveCatalog(value){await documents.write('catalog',value.ownerRef,value);}
    async function register(story,chatKey,label,ready=true) {
        return serial('catalog:'+ownerRef(chatKey),async()=>{
            const data=await catalog(ownerRef(chatKey),true);
            const previous=data.stories.find(item=>item.id===story.id);
            data.stories=data.stories.filter(item=>item.id!==story.id);
            data.stories.push({id:story.id,title:String(previous?.title || label || '이야기').slice(0,100),baselineId:story.baselineId,ready:ready || previous?.ready===true,updatedAt:new Date().toISOString()});
            data.rooms=data.rooms.filter(item=>item.chatRef!==chatRef(chatKey));
            data.rooms.push({chatRef:chatRef(chatKey),chatKey,storylineId:story.id,title:String(deps.getContext().chatId || '채팅').slice(0,100)});
            data.deferred=data.deferred.filter(ref=>ref!==chatRef(chatKey));await saveCatalog(data);
        });
    }
    async function backup(operationId,signal,reason='before_story_link') {
        signal.throwIfAborted();
        const existing=await documents.read('backup_receipt',operationId,{signal});
        if(existing?.data.backupId)return existing.data.backupId;
        const result=await rawPost('backup/create',{source:backupSource(deps.getContext()),reason}, {signal});
        if(!result.backup?.id)throw fail('MIGRATION_BACKUP_FAILED','백업을 확인하지 못해 이관을 중단했습니다.');
        await documents.write('backup_receipt',operationId,{backupId:result.backup.id},{operationId,signal});
        return result.backup.id;
    }
    async function original(chatKey,operationId,signal) {
        const originalId=chatRef(chatKey)+':'+operationId;
        const existing=await documents.read('original',originalId,{signal});if(existing)return originalId;
        const source=await rawPost('bootstrap',{chatKey},{signal});
        if(source.chat?.[SHARED_LINK])throw fail('MIGRATION_ALREADY_LINKED','이미 공유 이야기로 연결된 방입니다. 다시 불러와 주세요.');
        await documents.write('original',originalId,{chat:clone(source.chat),characters:clone(source.characters),history:clone(source.history || [])},{operationId,signal});
        return originalId;
    }
    async function operation(phase,task) {
        if(active)throw fail('SHARED_OPERATION_BUSY','자료 연결 작업을 마친 뒤 다시 시도하세요.');
        if(!deps.getContext().chatId||(phase!=='rollback' && deps.chatReadyKey!==key()))throw fail('STORAGE_NOT_READY','저장된 채팅을 먼저 열고 자료를 불러와 주세요.');
        if(deps.isStorageActionBlocked?.())throw fail('SHARED_GENERATION_BUSY','생성과 판독을 마치거나 취소한 뒤 자료를 연결해 주세요.');
        const startedKey=key(),controller=new AbortController();active=controller;
        const assert=()=>{controller.signal.throwIfAborted();if(key()!==startedKey)throw fail('STORAGE_STALE_CHAT','채팅이 바뀌어 자료 연결을 중단했습니다.');};
        try {
            deps.invalidateReasonerJobs?.();await deps.clearInjection?.({chatKey:startedKey});
            assert();report(phase,'started');
            const result=await task({chatKey:startedKey,signal:controller.signal,assert});
            assert();report(phase,'succeeded');return result;
        }catch(error){report(phase,'failed',error.code || error.name);throw error;}
        finally{if(active===controller)active=null;}
    }
    async function activate({chatKey,link,originalRef,record,history=[],state}) {
        const stored={schemaVersion:1,[SHARED_LINK]:link,originalRef,...splitRuntime(record,state)};
        await rawPost('transaction',{chatKey,chat:stored,history});
        const saved=await rawPost('bootstrap',{chatKey});
        if(digest(saved.chat)!==digest(stored))throw fail('MIGRATION_VERIFY_FAILED','채팅 연결을 다시 확인하지 못했습니다. 원본 복구가 준비돼 있습니다. 다시 불러와 주세요.');
        await router.resolve(chatKey,saved);
    }
    async function migrate({summary=''}={}) {
        return operation('migration',async({chatKey,signal,assert})=>{
            const record=clone(deps.record() || {}),characters=clone(deps.characterStore);
            if(router.views.get(chatKey)?.link)throw fail('MIGRATION_ALREADY_LINKED','이미 이관된 채팅입니다.');
            const projection=projectBaseline({characters,preferences:record.preferences,world:deps.selectedWorld()});
            const operationId=digest([chatRef(chatKey),projection,record]);
            const journalId=chatRef(chatKey)+':'+operationId;
            const previous=(await documents.read('migration',journalId,{fresh:true,signal}))?.data;
            const baselineId=previous?.baselineId || digest(['baseline',operationId]);
            const storyId=previous?.storylineId || digest(['story',operationId]);
            const backupId=previous?.backupId || await backup(operationId,signal,'before_room_migration');assert();
            const originalRef=previous?.originalRef || await original(chatKey,operationId,signal);assert();
            const journal={operationId,baselineId,storylineId:storyId,backupId,originalRef,status:'staging'};
            await documents.write('migration',journalId,journal,{operationId,signal});
            await documents.write('asset',projection.assetId,projection.assets,{operationId,signal});
            const baseline={id:baselineId,revision:1,ownerRef:ownerRef(chatKey),assetId:projection.assetId,defaultPreferences:projection.defaultPreferences};
            await documents.write('baseline',baselineId+':1',baseline,{operationId,signal});
            await documents.write('baseline_head',baselineId,{baselineId,revision:1,revisions:[1]},{operationId,signal});
            const state=confirmedStory(record,{chat:deps.getContext().chat,fingerprint:deps.stableFingerprint,sourceChatRef:chatRef(chatKey)});
            const story=initialStory({id:storyId,baselineId,baselineRevision:1,state,writer:chatRef(chatKey),operationId});
            await documents.write('storyline',storyId,story,{operationId,signal});assert();
            const link={schemaVersion:1,chatRef:chatRef(chatKey),ownerRef:ownerRef(chatKey),storylineId:storyId,baselineId,baselineRevision:1,checkpointId:story.headCheckpointId,entryCheckpointId:story.headCheckpointId,epoch:story.epoch,summary:String(summary).slice(0,1800),mode:'migrated'};
            await register(story,chatKey,deps.getContext().chatId,false);assert();
            const history=clone(router.views.get(chatKey)?.legacy?.history || []);
            await activate({chatKey,link,originalRef,record,history,state});assert();
            await register(story,chatKey,deps.getContext().chatId);
            await documents.write('migration',journalId,{...journal,status:'active'},{operationId,signal});
            return {unconfirmed:Boolean(record.pendingPlan?.outputText),backupId};
        });
    }
    async function connect({storylineId,mode='continue',summary=''}={}) {
        return operation('connect',async({chatKey,signal,assert})=>serial(storylineId,async()=>{
            if(!['continue','new','branch'].includes(mode))throw fail('SHARED_MODE_INVALID','연결 방법을 확인해 주세요.');
            if(router.views.get(chatKey)?.link && mode!=='branch')throw fail('SHARED_ALREADY_LINKED','이미 연결된 방은 새 분기나 기존 방식 복귀를 선택해 주세요.');
            const selected=await required('storyline',storylineId,{fresh:true,signal});
            const head=mode==='new'?(await documents.read('baseline_head',selected.baselineId,{fresh:true,signal}))?.data:null;
            const baseline=await required('baseline',selected.baselineId+':'+(head?.revision||selected.baselineRevision),{signal});
            if(baseline.ownerRef!==ownerRef(chatKey))throw fail('SHARED_OWNER_MISMATCH','같은 캐릭터의 이야기만 연결할 수 있습니다.');
            const inheritedPreferences=await preferencesForConnection({mode,story:selected,baseline,currentRecord:deps.record(),catalog:await catalog(ownerRef(chatKey),true),post:rawPost,signal});assert();
            const operationId=digest([chatRef(chatKey),storylineId,mode,selected.revision]);
            const backupId=await backup(operationId,signal);assert();
            const view=router.views.get(chatKey);
            const originalRef=view?.original || await original(chatKey,operationId,signal);
            let story,state;
            if(mode==='continue') {
                if(selected.pendingHandoff)throw fail('STORYLINE_HANDOFF_PENDING','마무리되지 않은 이어하기 연결이 있습니다. 해당 방을 다시 열거나 원본 복구를 사용해 주세요.');
                story=pinCheckpoint(selected,selected.headCheckpointId);
                story.pendingHandoff={chatRef:chatRef(chatKey),epoch:story.epoch+1,operationId};story.revision++;
                state=clone(story.checkpoints[story.headCheckpointId].state);
            } else {
                state=mode==='branch'?confirmedStory(deps.record(),{chat:deps.getContext().chat,fingerprint:deps.stableFingerprint,sourceChatRef:chatRef(chatKey)}):{};
                // New story never inherits automatic acquired knowledge or old cards by default.
                story=initialStory({id:digest(['new-story',operationId]),baselineId:baseline.id,baselineRevision:baseline.revision,state,writer:chatRef(chatKey),operationId});
            }
            const journalId=chatRef(chatKey)+':'+operationId;
            await documents.write('migration',journalId,{operationId,backupId,originalRef,storylineId:story.id,status:'staging',mode},{operationId,signal});
            await documents.write('storyline',story.id,story,{revision:story.revision,operationId,signal});assert();
            const record=resetRuntime({preferences:inheritedPreferences});
            const local=localCompanions(view?.record || view?.legacy?.chat || deps.record());
            if(Object.keys(local).length)record.companionStores=local;
            const link={schemaVersion:1,chatRef:chatRef(chatKey),ownerRef:ownerRef(chatKey),storylineId:story.id,baselineId:baseline.id,baselineRevision:baseline.revision,checkpointId:story.headCheckpointId,entryCheckpointId:story.headCheckpointId,epoch:story.pendingHandoff?.epoch || story.epoch,handoffOperation:mode==='continue'?operationId:null,summary:String(summary).slice(0,1800),mode};
            await register(story,chatKey,mode==='new'?'새 이야기':deps.getContext().chatId,false);assert();
            try{await activate({chatKey,link,originalRef,record,state});}
            catch(error){
                // If the target transaction never reached the server, release
                // its pending handoff so the original room can keep saving.
                const actual=await rawPost('bootstrap',{chatKey},{signal}).catch(()=>null);
                if(actual && actual.chat?.[SHARED_LINK]?.handoffOperation!==operationId){
                    const latest=await required('storyline',story.id,{fresh:true,signal});
                    if(latest.pendingHandoff?.operationId===operationId){delete latest.pendingHandoff;latest.revision++;await documents.write('storyline',latest.id,latest,{revision:latest.revision,signal});}
                }
                throw error;
            }
            await register(story,chatKey,mode==='new'?'새 이야기':deps.getContext().chatId);
            await documents.write('migration',journalId,{operationId,backupId,originalRef,storylineId:story.id,status:'active',mode},{operationId,signal});
        }));
    }
    async function restore({originalOnly=false,allRooms=false}={}) {
        return operation('rollback',async({chatKey,signal,assert})=>{
            const targets=allRooms?(await catalog(ownerRef(chatKey),true)).rooms.map(room=>room.chatKey):[chatKey];
            const prepared=[];
            for(const target of [...new Set(targets)]) {
                assert();const saved=await rawPost('bootstrap',{chatKey:target},{signal});
                const pointer=saved.chat?.originalRef;
                if(!saved.chat?.[SHARED_LINK]) {if(allRooms)continue;throw fail('ROLLBACK_SOURCE_MISSING','이 방은 현재 기존 저장 방식입니다. 다른 연결 방도 복귀하려면 모든 방 준비를 사용해 주세요.');}
                if(!pointer)throw fail('ROLLBACK_SOURCE_MISSING','이관 원본을 확인하지 못했습니다. 서버 백업 복원을 사용해 주세요.');
                const source=await required('original',pointer,{signal});
                let payload={chat:clone(source.chat),characters:clone(source.characters),history:clone(source.history || [])};
                if(!originalOnly) {
                    await router.resolve(target,saved);const view=router.views.get(target);
                    payload=legacyPayload(target===chatKey?deps.record() || view.record:view.record,view.asset.characters,view.history);
                }
                prepared.push({target,payload,saved});
                // Returning to independent rooms still uses the modern reader.
                // Keep large banks paged instead of expanding them in the browser.
                if((await documents.paged.capabilities())?.schemaVersion!==2)payload.characters=await expandCharacterStore(payload.characters,{signal});
            }
            if(!prepared.length)throw fail('ROLLBACK_SOURCE_MISSING','이 캐릭터에 복귀할 공유 연결 방이 없습니다.');
            await protectRollback({entries:prepared,documents,signal,noteDiagnostic:deps.noteDiagnostic,backup:()=>backup(digest(['rollback',chatRef(chatKey),prepared]),signal,'before_room_restore')});assert();
            try{for(const {target,payload}of prepared){
                const compatibilityPost=(route,body,options)=>['bootstrap','settings'].includes(route)?router.post(route,body,options):rawPost(route,body,options);
                assert();const {saved, payload:written}=await materializeLegacy(compatibilityPost,target,payload,signal);
                if(digest(saved.chat)!==digest(written.chat)||digest(saved.characters)!==digest(written.characters))throw fail('ROLLBACK_VERIFY_FAILED','기존 방식 복귀를 확인하지 못했습니다. 이관 원본과 서버 백업은 유지돼 있습니다.');
                if((await documents.paged.capabilities())?.schemaVersion===2)await documents.paged.write('metadata:legacy-mode:'+chatRef(target),{legacyOptOut:true});
                report('legacy_materialized','succeeded');
            }}finally{router.clear();}
        });
    }
    async function defer() {
        if(!deps.getContext().chatId)return;
        const data=await catalog(catalogId(),true);data.deferred=[...new Set([...data.deferred,chatRef(key())])];await saveCatalog(data);
    }
    async function updateBaseline({restoreRevision}={}) {
        return operation('baseline_update',async({chatKey,signal,assert})=>{
            const view=router.views.get(chatKey);
            if(!view?.link?.active)throw fail('STORYLINE_STALE_WRITER','이어가는 방에서 공통 자료를 갱신해 주세요. 이전 방은 새 분기 후 수정할 수 있습니다.');
            let characters=clone(deps.characterStore),preferences=clone(deps.record().preferences),world=deps.loadCustomWorlds?.().find(item=>item.id===preferences.selectedWorldId) || deps.selectedWorld();
            if(restoreRevision){
                const head=(await documents.read('baseline_head',view.baseline.id,{fresh:true,signal}))?.data;if(head?.revisions&&!head.revisions.includes(Number(restoreRevision)))throw fail('BASELINE_UNCOMMITTED','선택한 공통 자료는 저장 완료된 버전이 아닙니다.');
                const previous=await required('baseline',view.baseline.id+':'+Number(restoreRevision),{signal});
                const asset=await required('asset',previous.assetId,{signal});characters=asset.characters;preferences=previous.defaultPreferences;world=asset.world;
            }
            await backup(digest(['baseline-update',chatRef(chatKey),characters,preferences,world]),signal,'before_baseline_update');assert();
            await router.updateBaseline(chatKey,characters,{preferences,world});
        });
    }
    async function inspect() {
        const chatKey=key(),view=router.views.get(chatKey);
        if(!view)return {status:'unavailable'};
        if(view.link){
            const list=await catalog(ownerRef(chatKey));
            if(!list.stories.some(item=>item.id===view.story.id && item.ready!==false))await register(view.story,chatKey,deps.getContext().chatId);
            return {status:view.link.active?'active':'archived',source:router.metadata(chatKey)};
        }
        const data=await catalog(ownerRef(chatKey));
        const stories=data.stories.filter(item=>item.ready!==false);
        const legacyOptOut=(await documents.paged.capabilities())?.schemaVersion===2?(await documents.paged.read('metadata:legacy-mode:'+chatRef(chatKey)))?.legacyOptOut===true:false;
        return {status:hasLegacyMaterial(view.legacy?.chat,view.legacy?.characters)?'legacy':stories.length?'choose':'empty',stories:clone(stories),deferred:data.deferred.includes(chatRef(chatKey)),legacyOptOut};
    }
    async function migrateAll(){if(allController||active)throw fail('SHARED_OPERATION_BUSY','자료 이사를 마친 뒤 다시 시도하세요.');if(deps.isStorageActionBlocked?.())throw fail('SHARED_GENERATION_BUSY','생성과 판독을 마치거나 취소한 뒤 자료를 옮겨 주세요.');const controller=new AbortController(),started=key();allController=controller;try{deps.invalidateReasonerJobs?.();await deps.clearInjection?.({chatKey:started});await account.start();controller.signal.throwIfAborted();await importLegacyBrowserWorlds({signal:controller.signal});controller.signal.throwIfAborted();if(started!==key())throw fail('STORAGE_STALE_CHAT','채팅이 바뀌었습니다. 옮긴 자료는 그대로 보관됩니다.');if(deps.getContext().chatId&&deps.chatReadyKey===key()&&!router.views.get(key())?.link&&hasLegacyMaterial(deps.record(),deps.characterStore))await migrate();return account.inspect({fresh:true});}finally{if(allController===controller)allController=null;}}
    return {migrate,migrateAll,account,connect,restore,updateBaseline,inspect,catalog,defer,scope:()=>router.scope?.(),importBrowserWorlds:()=>operation('browser_world_import',()=>importLegacyBrowserWorlds()),cleanStaging:()=>rawPost('v2/maintenance/cleanup'),isBusy:()=>Boolean(active)||Boolean(allController)||account.isBusy(),cancel:()=>{allController?.abort(new DOMException('Cancelled','AbortError'));active?.abort(new DOMException('Cancelled','AbortError'));account.cancel();},
        snapshot:()=>({linked:Boolean(router.metadata(key())),active:router.metadata(key())?.active===true,busy:Boolean(active)||Boolean(allController)||account.isBusy()})};
}
