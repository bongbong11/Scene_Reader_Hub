import {clone,object,digest,chatRef,ownerRef,SHARED_LINK,SHARED_PREFIX,fail,envelope,documentKey} from './shared-document.js';
import {createSharedTransport} from './shared-transport.js';
import {confirmedStory,splitRuntime,resolveRecord} from '../storyline/projector.js';
import {addCheckpoint} from '../storyline/repository.js';
import {projectBaseline} from '../baseline/projector.js';
import {setWorldScope} from '../world/catalog.js';
import {createWorldLibrary} from '../world/shared-library.js';
import {createIndependentRoomStorage} from './independent-room.js';

// Storage ownership adapter. Host chat identity and lifecycle remain unchanged.
export function createSharedRouter(deps) {
    const documents=createSharedTransport({post:deps.post,noteDiagnostic:deps.noteDiagnostic});
    const worlds=createWorldLibrary({paged:documents.paged,post:deps.post,noteDiagnostic:deps.noteDiagnostic});
    const views=new Map(),listeners=new Set();let epoch=0,userScope='';
    const remember=(key,value)=>{views.delete(key);views.set(key,value);while(views.size>24)views.delete(views.keys().next().value);};
    const report=(phase,status,code)=>deps.noteDiagnostic?.('shared_storage',{module:'src/storage/shared-router.js',phase,status,...(code?{code}:{})});
    const notify=()=>{for(const listener of listeners)try{listener();}catch{}};
    const changed=()=>{notify();};
    function clear(){epoch++;views.clear();documents.clear();worlds.clear();notify();}
    const serial=(key,task)=>deps.queueWrite('shared:'+key,async()=>{
        const locks=deps.window?.navigator?.locks;
        return locks?locks.request('scene-reader:'+key,task):task();
    });
    const saveIndependent=createIndependentRoomStorage({paged:documents.paged,serial,current:key=>views.get(key)});
    async function required(kind,id,options){const doc=await documents.read(kind,id,options);if(!doc)throw fail('LINK_TARGET_MISSING','연결한 이야기 자료가 없습니다. 원본 복구나 백업 복원을 사용해 주세요.');return doc.data;}
    async function resolve(chatKey,data) {
        const link=data.chat?.[SHARED_LINK];
        if(!link){remember(chatKey,{legacy:clone(data),v2Active:data.storageV2?.active===true,sessionRevision:data.storageV2?.sessionRevision||0,charactersRevision:data.storageV2?.charactersRevision||0});changed();return data;}
        if(!object(link)||link.schemaVersion!==1||link.chatRef!==chatRef(chatKey)||link.ownerRef!==ownerRef(chatKey))throw fail('SHARED_LINK_INVALID','채팅의 이야기 연결을 확인하지 못했습니다. 원본 복구를 사용해 주세요.');
        const started=epoch;
        let story=await required('storyline',link.storylineId,{fresh:true});
        if(story.pendingHandoff && story.pendingHandoff.operationId===link.handoffOperation && story.pendingHandoff.chatRef===link.chatRef && story.pendingHandoff.epoch===link.epoch) {
            // Finish only after the target room pointer is durable. A failed
            // target activation leaves the old active room unchanged.
            story={...story,activeChatRef:link.chatRef,epoch:link.epoch,revision:story.revision+1};delete story.pendingHandoff;
            await documents.write('storyline',story.id,story,{revision:story.revision,operationId:link.handoffOperation});
            report('handoff_recovered','succeeded');
        }
        const active=story.activeChatRef===link.chatRef && story.epoch===link.epoch;
        const effectiveRevision=active?story.baselineRevision:link.baselineRevision;
        const baseline=await required('baseline',link.baselineId+':'+effectiveRevision);
        const asset=await required('asset',baseline.assetId);
        const recovered=active && link.checkpointId!==story.headCheckpointId;
        const checkpointId=active?story.headCheckpointId:link.checkpointId;
        const checkpoint=story.checkpoints?.[checkpointId];
        if(!checkpoint)throw fail('CHECKPOINT_MISSING','이어받을 기록을 확인하지 못했습니다. 복구 자료를 사용해 주세요.');
        if(epoch!==started)throw fail('STORAGE_STALE_CHAT','자료가 바뀌어 불러오기를 중단했습니다.');
        const stored=recovered?{runtime:{...clone(data.chat.runtime || {}),pendingPlan:null,lastJudgment:null},overlay:{}}:data.chat;
        const currentLink={...clone(link),active,checkpointId,baselineRevision:effectiveRevision};
        const record=resolveRecord(currentLink,baseline,asset,checkpoint,stored);const head=(await documents.read('baseline_head',baseline.id,{fresh:true}))?.data;record.sharedSource.baselineRevisions=head?.revisions||[baseline.revision];record.sharedSource.latestBaselineRevision=head?.revision||baseline.revision;
        views.set(chatKey,{link:currentLink,story,baseline,asset,record,original:data.chat.originalRef,history:recovered?[]:clone(data.history || []),stored:clone(data.chat),v2Active:data.storageV2?.active===true,sessionRevision:data.storageV2?.sessionRevision||0});
        if(recovered)report('recover_committed_checkpoint','succeeded');
        changed();return {...data,chat:record,characters:clone(asset.characters),history:recovered?[]:data.history};
    }
    function metadata(chatKey){const view=views.get(chatKey);return view?.link?clone(view.record.sharedSource):null;}
    async function commitSession(chatKey,view,stored,history,story,extra=[]) {
        if(!view.v2Active){if(story)await documents.write('storyline',story.id,story,{revision:story.revision,operationId:story.lastOperationId});return deps.post('transaction',{chatKey,chat:stored,history});}
        const sessionKey='legacy:sessions/'+chatRef(chatKey)+'.json',writes=[{key:sessionKey,value:{chat:stored,history},expectedRevision:view.sessionRevision},...extra];
        if(story)writes.push({key:documentKey('storyline',story.id),value:envelope('storyline',story.id,story,story.revision,story.lastOperationId)});
        if(story&&story.headCheckpointId!==view.story.headCheckpointId){const checkpoint=story.checkpoints[story.headCheckpointId];writes.push({key:documentKey('story_history',story.id+':'+checkpoint.id),value:envelope('story_history',story.id+':'+checkpoint.id,checkpoint,1,story.lastOperationId),immutable:true});}
        const result=await documents.paged.writeMany(writes);view.sessionRevision=result.results[sessionKey].revision;return {ok:true};
    }
    async function persist(chatKey,record,history) {
        const view=views.get(chatKey);
        if(!view?.link)throw fail('SHARED_NOT_READY','공유 자료를 먼저 불러와 주세요.');
        const source=record?.sharedSource;
        if(!source || source.storylineId!==view.link.storylineId || source.epoch!==view.link.epoch)throw fail('STORAGE_STALE_CHAT','이야기 연결이 바뀌어 이전 저장을 중단했습니다.');
        const started=epoch;
        return serial(view.link.storylineId,async()=>{
            if(epoch!==started || views.get(chatKey)!==view)throw fail('STORAGE_STALE_CHAT','채팅 연결이 바뀌었습니다.');
            const ref=chatRef(chatKey);
            const state=confirmedStory(record,{chat:chatKey===deps.stateChatKey()?deps.getContext().chat:[],fingerprint:deps.stableFingerprint,sourceChatRef:ref});
            const prior=view.story.checkpoints[view.link.checkpointId]?.state || {};
            let story=view.story,link={...view.link},confirmed=prior;
            if(link.active && digest(state)!==digest(prior)) {
                const fresh=await required('storyline',link.storylineId,{fresh:true});
                if(fresh.pendingHandoff)throw fail('STORYLINE_HANDOFF_PENDING','다른 방으로 이어하기를 연결 중입니다. 연결을 마친 뒤 다시 불러와 주세요.');
                if(fresh.activeChatRef!==ref || fresh.epoch!==link.epoch || fresh.revision!==story.revision)throw fail('STORYLINE_REVISION_CONFLICT','다른 방이나 기기에서 이야기가 바뀌었습니다. 저장을 멈췄으니 다시 불러와 주세요.');
                const operationId=digest([ref,link.epoch,fresh.revision,state]);
                story=addCheckpoint(fresh,state,operationId,ref);
                link.checkpointId=story.headCheckpointId;confirmed=state;
            }
            if(epoch!==started)throw fail('STORAGE_STALE_CHAT','복원된 자료에 이전 결과를 저장하지 않았습니다.');
            const stored={schemaVersion:1,[SHARED_LINK]:clone(link),originalRef:view.original,...splitRuntime(record,confirmed)};
            delete stored[SHARED_LINK].active;
            const limited=clone(history ?? view.history ?? []);
            await commitSession(chatKey,view,stored,limited,story!==view.story?story:null);
            view.link=link;view.story=story;view.record=clone(record);view.history=limited;view.stored=clone(stored);
            report('commit','succeeded');changed();return {ok:true};
        });
    }
    async function saveCharacters(chatKey,value,options={}) {
        const view=views.get(chatKey);
        if(!view?.link?.active)throw fail('STORYLINE_STALE_WRITER','이전 방의 공통 자료를 바꾸려면 먼저 이 방에서 새 이야기로 분기해 주세요.');
        const started=epoch;
        return serial(view.link.storylineId,()=>serial('baseline:'+view.baseline.id,async()=>{
            if(epoch!==started || views.get(chatKey)!==view)throw fail('STORAGE_STALE_CHAT','자료를 다시 불러온 뒤 수정해 주세요.');
            const fresh=await required('storyline',view.story.id,{fresh:true});
            if(fresh.pendingHandoff)throw fail('STORYLINE_HANDOFF_PENDING','이야기 연결을 마친 뒤 자료를 수정해 주세요.');
            if(fresh.revision!==view.story.revision||fresh.epoch!==view.link.epoch||fresh.activeChatRef!==chatRef(chatKey))throw fail('STORYLINE_REVISION_CONFLICT','이야기가 바뀌었습니다. 다시 불러온 뒤 자료를 저장해 주세요.');
            const projection=projectBaseline({characters:value,preferences:options.preferences || view.baseline.defaultPreferences,world:options.world || view.asset.world});
            if(projection.assetId===view.baseline.assetId && digest(projection.defaultPreferences)===digest(view.baseline.defaultPreferences))return {ok:true};
            let revision=view.baseline.revision+1;
            // Other stories can still use an older version of the same baseline.
            // Never reuse their immutable version IDs when editing this story.
            while(await documents.read('baseline',view.baseline.id+':'+revision,{fresh:true}))revision++;
            await documents.write('asset',projection.assetId,projection.assets);
            const baseline={...view.baseline,revision,assetId:projection.assetId,defaultPreferences:projection.defaultPreferences};
            await documents.write('baseline',baseline.id+':'+revision,baseline,{revision});
            if(epoch!==started)throw fail('STORAGE_STALE_CHAT','복원 후 이전 자료 갱신을 중단했습니다.');
            const story={...fresh,baselineRevision:revision,revision:fresh.revision+1};
            const previousHead=(await documents.read('baseline_head',baseline.id,{fresh:true}))?.data;
            const committedRevisions=[...new Set([...(previousHead?.revisions||[view.baseline.revision]),revision])];
            const headKey=documentKey('baseline_head',baseline.id);
            const headWrite={key:headKey,value:envelope('baseline_head',baseline.id,{baselineId:baseline.id,revision,revisions:committedRevisions}),expectedRevision:documents.paged.revision(headKey)};
            const link={...view.link,baselineRevision:revision};delete link.active;
            const stored={...view.stored,[SHARED_LINK]:link};
            await commitSession(chatKey,view,stored,view.history,story,view.v2Active?[headWrite]:[]);
            if(!view.v2Active)await documents.write('baseline_head',baseline.id,{baselineId:baseline.id,revision,revisions:committedRevisions});
            view.link={...link,active:true};view.baseline=baseline;view.asset=(await documents.read('asset',projection.assetId)).data;view.story=story;view.stored=stored;
            view.record.sharedSource={...view.record.sharedSource,baselineRevision:revision,assetId:projection.assetId,baselineRevisions:committedRevisions,latestBaselineRevision:revision};
            const live=deps.chatRecords?.get(chatKey);if(live)live.sharedSource=clone(view.record.sharedSource);
            report('baseline_revision','succeeded');changed();return {ok:true,characters:clone(view.asset.characters)};
        }));
    }
    async function post(route,body={},options={}) {
        if(String(body.chatKey || '').startsWith(SHARED_PREFIX))throw fail('SHARED_ROUTE_INVALID','예약 자료는 전용 저장 경로로 처리해야 합니다.');
        if(route==='settings'&&body.settings&&body.settings.worlds&&((await documents.paged.capabilities())?.schemaVersion===2))return worlds.save(body.settings,options);
        if(route==='bootstrap') {
            const started=epoch;
            const data=await deps.post(route,body,options);
            if(!data || started!==epoch)return data;
            if(data.storageV2?.scope&&data.storageV2.scope!==userScope){clear();userScope=data.storageV2.scope;setWorldScope(userScope);}
            try{const result=await resolve(body.chatKey,data);if(result.settings?.worldCatalog)result.settings=await worlds.hydrate(result.settings,result.chat?.preferences?.selectedWorldId,options);return result;}catch(error){report('load','failed',error.code);if(options.allowFailure)return null;throw error;}
        }
        if(['backup/restore','backup/import','v2/backup/restore','v2/backup/import/finish'].includes(route)){clear();const result=await deps.post(route,body,options);clear();return result;}
        const view=views.get(body.chatKey);
        const incoming=body.chat || body.value;
        if(!view?.link && ['chat','transaction','history','characters'].includes(route) && (incoming?.sharedSource || deps.chatRecords?.get(body.chatKey)?.sharedSource))throw fail('SHARED_NOT_READY','연결 자료를 다시 불러온 뒤 저장해 주세요.');
        if(view?.link) {
            if(route==='chat')return persist(body.chatKey,body.value);
            if(route==='transaction')return persist(body.chatKey,body.chat,body.history);
            if(route==='history')return persist(body.chatKey,clone(deps.chatRecords?.get(body.chatKey) || view.record),body.value);
            if(route==='characters')return saveCharacters(body.chatKey,body.value);
        }
        else if(view?.v2Active&&['chat','transaction','history','characters'].includes(route))return saveIndependent(view,body.chatKey,route,body,options);
        return deps.post(route,body,options);
    }
    return {post,documents,views,required,serial,metadata,clear,resolve,scope:()=>userScope,updateBaseline:saveCharacters,rawPost:deps.post,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}};
}
