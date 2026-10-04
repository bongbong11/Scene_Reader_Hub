// Companion records share the session file, but never the scene rollback snapshot.
// All writes use the existing per-chat queue and the most recent confirmed session.
export function createCompanionStorage(deps) {
    const sessions = new Map(), loaded = new Map(), revisions = new Map(), listeners = new Set();
    let epoch = 0;
    const clone = value => value == null ? value : structuredClone(value);
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const failure = (code, message) => Object.assign(new Error(message), {code});
    const report = status => { try { deps.noteDiagnostic?.('companion_storage', {module:'src/storage/companions.js',status}); } catch {} };
    const notify = () => { for (const listener of listeners) { try { listener(); } catch {} } };
    const current = metadata => Boolean(metadata && metadata === deps.getContext().chatMetadata && deps.getContext().chatId);
    function assert(namespace, metadata, chatKey, startedEpoch) {
        if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(namespace) || ['constructor','prototype','__proto__'].includes(namespace)) throw failure('STORAGE_INVALID_NAMESPACE','저장 항목을 확인하지 못했습니다.');
        if (!current(metadata) || chatKey !== deps.stateChatKey() || startedEpoch !== epoch) throw failure('STORAGE_STALE_CHAT','채팅이 바뀌어 저장을 중단했습니다.');
        if (loaded.get(chatKey) !== metadata || deps.storageVersion < 2) throw failure('STORAGE_NOT_READY','씬판독기 서버 저장소를 먼저 불러와 주세요.');
    }
    function merge(chatKey, value) {
        const stores = sessions.get(chatKey)?.companionStores;
        if (!object(stores) || !Object.keys(stores).length) return value;
        return {...clone(value || {}), companionStores:clone(stores)};
    }
    async function post(route, body = {}, options) {
        const startedEpoch = epoch, chatKey = body.chatKey, revision = revisions.get(chatKey) || 0;
        let request = body;
        if (route === 'chat') request = {...body, value:merge(chatKey,body.value)};
        if (route === 'transaction') request = {...body, chat:merge(chatKey,body.chat)};
        const data = await deps.post(route,request,options);
        if (!data || startedEpoch !== epoch) return data;
        if (route === 'bootstrap') {
            if (revision === (revisions.get(chatKey) || 0)) sessions.set(chatKey,clone(data.chat));
            else return {...data,chat:merge(chatKey,data.chat)};
        }
        if (route === 'chat' || route === 'transaction') {
            sessions.set(chatKey,clone(route === 'chat' ? request.value : request.chat));
            revisions.set(chatKey,(revisions.get(chatKey) || 0)+1);
        }
        if (route === 'backup/restore' || route === 'backup/import') { epoch++; sessions.clear(); loaded.clear(); revisions.clear(); }
        return data;
    }
    function chatLoaded(chatKey) { loaded.set(chatKey,deps.getContext().chatMetadata); notify(); }
    async function waitForChat(metadata, chatKey) {
        await deps.ready?.();
        if (!current(metadata) || chatKey !== deps.stateChatKey()) throw failure('STORAGE_STALE_CHAT','채팅이 바뀌어 불러오기를 중단했습니다.');
        if (loaded.get(chatKey) === metadata) return;
        await new Promise((resolve,reject) => {
            const finish = error => { clearTimeout(timer); listeners.delete(check); error ? reject(error) : resolve(); };
            const check = () => {
                if (!current(metadata) || chatKey !== deps.stateChatKey()) finish(failure('STORAGE_STALE_CHAT','채팅이 바뀌었습니다.'));
                else if (loaded.get(chatKey) === metadata) finish();
            };
            const timer = setTimeout(()=>finish(failure('STORAGE_NOT_READY','서버 저장소를 불러오지 못했습니다. 채팅을 다시 열어 주세요.')),15000);
            listeners.add(check);
        });
    }
    async function load(namespace, {metadata, legacy} = {}) {
        const chatKey = deps.stateChatKey(), startedEpoch = epoch;
        await waitForChat(metadata,chatKey);
        assert(namespace,metadata,chatKey,startedEpoch);
        return deps.queueWrite(`session:${chatKey}`,async () => {
            assert(namespace,metadata,chatKey,startedEpoch);
            const saved = sessions.get(chatKey)?.companionStores;
            if (object(saved) && Object.hasOwn(saved,namespace)) return clone(saved[namespace]);
            if (!object(legacy)) return null;
            return write(namespace,clone(legacy),metadata,chatKey,startedEpoch,true);
        });
    }
    async function write(namespace, value, metadata, chatKey, startedEpoch, verify = false) {
        assert(namespace,metadata,chatKey,startedEpoch);
        if (!object(value)) throw failure('STORAGE_INVALID_VALUE','저장 내용을 확인하지 못했습니다.');
        const chat = clone(sessions.get(chatKey) || {});
        chat.companionStores = {...chat.companionStores,[namespace]:clone(value)};
        await deps.post('chat',{chatKey,value:chat});
        // Migration is read back before the original metadata can be marked migrated.
        if (verify) {
            const result = await deps.post('bootstrap',{chatKey});
            if (JSON.stringify(result?.chat?.companionStores?.[namespace]) !== JSON.stringify(value)) throw failure('STORAGE_VERIFY_FAILED','서버 저장을 확인하지 못했습니다. 기존 데이터는 유지합니다.');
        }
        // A restore or chat switch cannot publish old data into the newly loaded chat.
        assert(namespace,metadata,chatKey,startedEpoch);
        sessions.set(chatKey,chat);
        revisions.set(chatKey,(revisions.get(chatKey) || 0)+1);
        const live = deps.chatRecords.get(chatKey);
        if (live) live.companionStores = clone(chat.companionStores);
        report(verify ? 'migrated' : 'saved');
        return clone(value);
    }
    async function save(namespace, value, {metadata} = {}) {
        const chatKey = deps.stateChatKey(), startedEpoch = epoch, snapshot = clone(value);
        await waitForChat(metadata,chatKey);
        return deps.queueWrite(`session:${chatKey}`,()=>write(namespace,snapshot,metadata,chatKey,startedEpoch));
    }
    return {post,chatLoaded,chatLoading:chatKey=>loaded.delete(chatKey), bridge:Object.freeze({version:1,load,save,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);}})};
}
