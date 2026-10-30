import {chatRef,documentKey,envelope,decode,clone,fail} from './shared-document.js';
import {createPagedTransport} from './paged-transport.js';

// Only this repository owns current emotion data. Session snapshots are readers.
export function createEmotionStorage({post,queueWrite,stateChatKey,noteDiagnostic}) {
    const paged=createPagedTransport(post,{noteDiagnostic}),rooms=new Map();let epoch=0;
    const fields=value=>({characterStateEvents:clone(value?.characterStateEvents||[]),characterStateCapture:clone(value?.characterStateCapture||null)});
    const scope=record=>record?.sharedSource?JSON.stringify([record.sharedSource.storylineId,record.sharedSource.epoch]):'';
    const key=chatKey=>documentKey('emotion',chatRef(chatKey));
    const supported=async()=>Boolean((await paged.capabilities())?.features?.includes('emotion-storage'));
    function active(chatKey=stateChatKey()){return rooms.get(chatKey);}
    function state(record,chatKey=stateChatKey()){return active(chatKey)?.value||record;}
    function view(record,chatKey=stateChatKey()){return record&&active(chatKey)?{...record,...fields(active(chatKey).value)}:record;}
    function strip(record,chatKey){if(!record||!active(chatKey)||active(chatKey).blocked)return record;const next={...record};delete next.characterStateEvents;delete next.characterStateCapture;return next;}
    async function load(chatKey,record){
        const token=epoch,sourceScope=scope(record);if(active(chatKey)?.sourceScope===sourceScope||!await supported())return;
        const previous=active(chatKey);if(previous){previous.controller.abort();rooms.delete(chatKey);}
        const id=chatRef(chatKey),stored=await paged.read(key(chatKey));
        if(token!==epoch||chatKey!==stateChatKey())return;
        const saved=stored?decode(stored,'emotion',id).data:null;
        let value=saved&&(saved.sourceScope||'')===sourceScope?saved:{...fields(record),sourceScope};
        if(!saved||(saved.sourceScope||'')!==sourceScope){await paged.write(key(chatKey),envelope('emotion',id,value),{chatKey});const verified=await paged.read(key(chatKey));if(JSON.stringify(decode(verified,'emotion',id).data)!==JSON.stringify(value))throw fail('EMOTION_STORAGE_VERIFY_FAILED','감정 저장을 확인하지 못했습니다. 기존 자료는 유지합니다.');}
        if(token!==epoch||chatKey!==stateChatKey())return;
        value=fields(value);
        for(const capture of [value.characterStateCapture,...value.characterStateEvents.map(event=>event.capture)].filter(Boolean))if(capture.status==='collecting'){capture.status='cancelled';capture.phase='complete';}
        rooms.set(chatKey,{value,sourceScope,token,controller:new AbortController()});
        noteDiagnostic?.('emotion_storage',{module:'src/storage/emotions.js',status:'succeeded'});
    }
    async function save(chatKey=stateChatKey()){
        const room=active(chatKey);if(!room)return false;
        if(room.blocked)throw fail('EMOTION_STORAGE_NOT_READY','감정 저장소를 읽지 못했습니다. 채팅을 다시 불러온 뒤 감정을 수집하세요.');
        const snapshot={...fields(room.value),sourceScope:room.sourceScope},token=epoch;
        return queueWrite('emotion:'+chatKey,async()=>{
            if(token!==epoch||active(chatKey)!==room||chatKey!==stateChatKey())throw fail('EMOTION_SOURCE_CHANGED','채팅이 바뀌어 감정 저장을 중단했습니다.');
            try{await paged.write(key(chatKey),envelope('emotion',chatRef(chatKey),snapshot),{chatKey,signal:room.controller.signal});}
            catch(error){noteDiagnostic?.('emotion_storage',{module:'src/storage/emotions.js',status:'failed',errorKind:error.code||'EMOTION_STORAGE_FAILED'});throw error;}
            if(token!==epoch||active(chatKey)!==room)return false;
            noteDiagnostic?.('emotion_storage',{module:'src/storage/emotions.js',status:'succeeded'});return true;
        });
    }
    async function restore(chatKey,record){if(!active(chatKey)||!Object.hasOwn(record||{},'characterStateEvents'))return;active(chatKey).value=fields(record);await save(chatKey);}
    function clear(){epoch++;for(const room of rooms.values())room.controller.abort();rooms.clear();paged.clear();}
    async function route(route,body={},options){
        if(['backup/restore','backup/import','v2/backup/restore','v2/backup/restore-room','v2/backup/import/finish','v2/story/delete','v2/room/delete'].includes(route))clear();
        if(route==='bootstrap'){
            const data=await post(route,body,options);
            if(data){
                if(data.storageV2?.active===true){const token=epoch;try{await load(body.chatKey,data.chat);}catch(error){
                    if(token===epoch&&body.chatKey===stateChatKey())rooms.set(body.chatKey,{value:fields(null),blocked:true,controller:new AbortController()});
                    noteDiagnostic?.('emotion_storage',{module:'src/storage/emotions.js',status:'failed',errorKind:error.code||'EMOTION_STORAGE_LOAD_FAILED'});
                }}
                data.chat=strip(data.chat,body.chatKey);
            }return data;
        }
        if(route==='chat')body={...body,value:strip(body.value,body.chatKey)};
        if(route==='transaction')body={...body,chat:strip(body.chat,body.chatKey)};
        return post(route,body,options);
    }
    return {state,view,save,restore,strip,post:route,clear,unload(){clear();},blocked:()=>Boolean(active()?.blocked),enabled:chatKey=>Boolean(active(chatKey))};
}
