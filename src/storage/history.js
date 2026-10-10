

import {retireHistory} from './retired-collection.js';
export function createHistoryRepository(deps) {
function openStateDb() {
    if (!deps.window.indexedDB) return Promise.resolve(null);
    if (deps.stateDbPromise) return deps.stateDbPromise;
    deps.stateDbPromise = new Promise((resolve) => {
        const request = deps.window.indexedDB.open(deps.STATE_DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(deps.STATE_DB_STORE)) request.result.createObjectStore(deps.STATE_DB_STORE, { keyPath: 'chatKey' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
    });
    return deps.stateDbPromise;
}

async function loadStateHistory(chatKey = deps.stateChatKey()) {
    if (deps.stateHistoryCache.has(chatKey)) { const history=deps.stateHistoryCache.get(chatKey);retireHistory(history);return history; }
    const db = await openStateDb();
    if (!db) { deps.stateHistoryCache.set(chatKey, []); return []; }
    const history = await new Promise((resolve) => {
        const request = db.transaction(deps.STATE_DB_STORE, 'readonly').objectStore(deps.STATE_DB_STORE).get(chatKey);
        request.onsuccess = () => resolve(Array.isArray(request.result?.history) ? request.result.history : []);
        request.onerror = () => resolve([]);
    });
    retireHistory(history);
    deps.stateHistoryCache.set(chatKey, history);
    return history;
}

async function saveStateHistory(history, chatKey = deps.stateChatKey()) {
    const limited = structuredClone(history.slice(-deps.STATE_HISTORY_LIMIT));
    retireHistory(limited);
    await deps.queueWrite(`session:${chatKey}`, () => deps.storagePost('history', { chatKey, value: structuredClone(limited) }));
    deps.stateHistoryCache.set(chatKey, limited);

}

async function clearStateHistory(chatKey = deps.stateChatKey()) {
    deps.stateHistoryCache.set(chatKey, []);
    if (deps.serverStoreAvailable) await deps.storagePost('history', { chatKey, value: [] });
    const db = await openStateDb();
    if (!db) return;
    await new Promise((resolve) => {
        const request = db.transaction(deps.STATE_DB_STORE, 'readwrite').objectStore(deps.STATE_DB_STORE).delete(chatKey);
        request.onsuccess = request.onerror = () => resolve();
    });
}
return {openStateDb,loadStateHistory,saveStateHistory,clearStateHistory};
}
