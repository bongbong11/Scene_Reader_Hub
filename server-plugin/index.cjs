const { readJson, writeJsonAtomic, validateSnapshot, portableSnapshot, restoreFiles, serialize, isBackupPath, cleanupStaleTemps } = require('./storage.cjs');
const { changedCharacterCollections, changedWorldCollections, retrievalConfigChanged, retryCleanup, scheduleCleanup } = require('./retrieval-cache.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const UPSTREAM = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const MAX_BODY_BYTES = 1_000_000;
const MAX_STORAGE_BYTES = 20_000_000;
const TIMEOUT_MS = 35_000;
const STORE_FOLDER = 'scene-reader';

function sendError(response, status, message) { return response.status(status).json({ error: message }); }

function safeRoot(request) {
    const userRoot = String(request.user?.directories?.root || '').trim();
    if (!userRoot) throw new Error('SillyTavern user data directory is unavailable.');
    const root = path.resolve(userRoot, STORE_FOLDER);
    const base = path.resolve(userRoot);
    if (!root.startsWith(`${base}${path.sep}`)) throw new Error('Invalid Scene Reader storage path.');
    return root;
}

function recordId(value) { return crypto.createHash('sha256').update(String(value || 'unsaved')).digest('hex'); }

function pathsFor(request, chatKey = '') {
    const root = safeRoot(request);
    const id = recordId(chatKey);
    return {
        root,
        settings: path.join(root, 'settings.json'),
        secret: path.join(root, 'secrets.json'),
        chat: path.join(root, 'chats', `${id}.json`),
        history: path.join(root, 'history', `${id}.json`),
        session: path.join(root, 'sessions', `${id}.json`),
        characters: path.join(root, 'characters', `${id}.json`),
        backups: path.join(root, 'backups'),
    };
}

async function removeFile(file) {
    try { await fs.unlink(file); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}

async function walkFiles(root, current = root) {
    let entries = [];
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return []; }
    const files = [];
    for (const entry of entries) {
        if (current === root && entry.name === 'backups') continue;
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory() && current===root && /^(chats|characters|history|sessions)$/.test(entry.name)) files.push(...await walkFiles(root, absolute));
        else if (entry.isFile()) {
            const relative=path.relative(root, absolute).replaceAll('\\', '/');
            if(isBackupPath(relative))files.push({ path: relative, text: await fs.readFile(absolute, 'utf8') });
        }
    }
    return files;
}

async function createSnapshot(request, reason = 'manual') {
    const { root, backups } = pathsFor(request);
    await fs.mkdir(backups, { recursive: true });
    const createdAt = new Date().toISOString();
    const id = createdAt.replaceAll(':', '-').replace('.', '-').replace('Z', `-${crypto.randomInt(1_000_000_000)}Z`);
    const snapshot = { schemaVersion: 1, id, createdAt, reason, files: await walkFiles(root) };
    await writeJsonAtomic(path.join(backups, `${id}.json`), snapshot);
    if(reason==='before_restore') {
        const automatic=(await listBackups(request)).filter(item=>item.reason==='before_restore');
        for(const item of automatic.slice(5))await removeFile(path.join(backups, `${item.id}.json`));
    }
    return snapshot;
}

async function listBackups(request) {
    const { backups } = pathsFor(request);
    let entries = [];
    try { entries = await fs.readdir(backups, { withFileTypes: true }); } catch { return []; }
    const rows = [];
    for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith('.json'))) {
        let snapshot;
        try { snapshot = await readJson(path.join(backups, entry.name), null); } catch { continue; }
        if (snapshot?.id && Array.isArray(snapshot.files)) rows.push({ id: snapshot.id, createdAt: snapshot.createdAt, reason: snapshot.reason || 'manual', fileCount: snapshot.files.length });
    }
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function restoreSnapshot(request, snapshot) {
    validateSnapshot(snapshot);
    const { root } = pathsFor(request);
    await createSnapshot(request, 'before_restore');
    await restoreFiles(root, snapshot);
    await scheduleCleanup(root, request.user.directories, {all:true});
}

function storageHandler(handler) {
    return async (request, response) => {
        try { return await serialize(safeRoot(request), () => handler(request, response)); }
        catch (error) { return sendError(response, 500, error?.message || 'Scene Reader storage failed.'); }
    };
}

async function readSession(files) {
    return await readJson(files.session, null) || { chat: await readJson(files.chat, null), history: await readJson(files.history, []) };
}
async function writeSession(files, session) {
    await writeJsonAtomic(files.session, {...session,history:Array.isArray(session.history)?session.history.slice(-12):[]});
    // Remove legacy duplicates only after the combined replacement is durable.
    await removeFile(files.chat); await removeFile(files.history);
}
async function migrateChatIdentity(request, chatKey, legacyChatKey) {
    if(typeof legacyChatKey!=='string' || chatKey===legacyChatKey || !chatKey.startsWith('character-avatar:') || !legacyChatKey.startsWith('character:') || chatKey.slice(chatKey.indexOf('|chat:'))!==legacyChatKey.slice(legacyChatKey.indexOf('|chat:')))return;
    const files=pathsFor(request,chatKey),old=pathsFor(request,legacyChatKey);
    const previousSession=await readSession(old),previousCharacters=await readJson(old.characters,null);
    if(!previousSession.chat && !previousSession.history?.length && !previousCharacters)return;
    const currentSession=await readSession(files);
    const currentCharacters=await readJson(files.characters,null);
    if((currentSession.chat || currentSession.history?.length) && currentSession.migrationSource!==legacyChatKey)return;
    if(currentCharacters && JSON.stringify(currentCharacters)!==JSON.stringify(previousCharacters))return;
    if(!currentSession.chat && !currentSession.history?.length && (previousSession.chat || previousSession.history?.length))await writeSession(files,{...previousSession,migrationSource:legacyChatKey});
    if(previousCharacters && !currentCharacters)await writeJsonAtomic(files.characters,previousCharacters);
    // New files are durable before any old duplicate is removed. A failed write
    // leaves the old files intact, so the next bootstrap can retry the migration.
    for(const file of [old.session,old.chat,old.history,old.characters])await removeFile(file);
    await scheduleCleanup(files.root,request.user.directories,{collections:changedCharacterCollections(legacyChatKey,previousCharacters,null)});
}
async function init(router) {
    router.get('/health', (_request, response) => response.json({ ok: true, service: 'scene-reader-jev', model: MODEL, storage: true }));

    router.post('/storage/bootstrap', storageHandler(async (request, response) => {
        const chatKey = String(request.body?.chatKey || 'unsaved');
        await migrateChatIdentity(request,chatKey,request.body?.legacyChatKey);
        const files = pathsFor(request, chatKey);
        await cleanupStaleTemps(files.root);
        await retryCleanup(files.root, request.user.directories).catch(error=>console.warn('[Scene Reader] Search cache cleanup will retry:',error.code || error.name));
        const session = await readSession(files);
        const [settings, chat, history, characters, secret, backups] = await Promise.all([
            readJson(files.settings, {}), session.chat, session.history, readJson(files.characters, null), readJson(files.secret, {}), listBackups(request),
        ]);
        response.json({ ok: true, storageVersion: 3, migrated: Boolean(await readJson(files.session, null)), settings, chat, history: Array.isArray(history) ? history : [], characters, keyStatus: secret.jevKey ? `저장됨 ····${String(secret.jevKey).slice(-4)}` : '저장된 키 없음', backups });
    }));

    router.post('/storage/settings', storageHandler(async (request, response) => {
        const files=pathsFor(request);
        const previous=await readJson(files.settings, {});
        const next=request.body?.settings && typeof request.body.settings === 'object' ? request.body.settings : {};
        await writeJsonAtomic(files.settings, next);
        await scheduleCleanup(files.root, request.user.directories, {all:retrievalConfigChanged(previous,next),collections:changedWorldCollections(previous,next)});
        response.json({ ok: true });
    }));

    for (const [route, field] of [['chat', 'chat'], ['history', 'history'], ['characters', 'characters']]) {
        router.post(`/storage/${route}`, storageHandler(async (request, response) => {
            const chatKey = String(request.body?.chatKey || 'unsaved');
            const files = pathsFor(request, chatKey);
            const file = files[field];
            const value = request.body?.value;
            if (field !== 'characters') {
                const session = await readSession(files);
                session[field] = value === null ? (field === 'history' ? [] : null) : value;
                await writeSession(files, session);
            } else {
                const previous=await readJson(file,null);
                if(value===null)await removeFile(file);else await writeJsonAtomic(file,value);
                await scheduleCleanup(files.root, request.user.directories, {collections:changedCharacterCollections(chatKey,previous,value)});
            }
            response.json({ ok: true });
        }));
    }

    router.post('/storage/transaction', storageHandler(async (request,response) => {
        const {chatKey,chat,history} = request.body || {};
        if (typeof chatKey !== 'string' || !chat || typeof chat !== 'object' || !Array.isArray(history)) throw new Error('Invalid scene transaction.');
        await writeSession(pathsFor(request,chatKey), {chat,history});
        response.json({ok:true});
    }));
    router.post('/storage/key', storageHandler(async (request, response) => {
        const key = String(request.body?.key || '').trim();
        const file = pathsFor(request).secret;
        if (key) await writeJsonAtomic(file, { jevKey: key }); else await removeFile(file);
        response.json({ ok: true, keyStatus: key ? `저장됨 ····${key.slice(-4)}` : '저장된 키 없음' });
    }));

    router.post('/storage/backup/create', storageHandler(async (request, response) => {
        const snapshot = await createSnapshot(request, 'manual');
        response.json({ ok: true, backup: { id: snapshot.id, createdAt: snapshot.createdAt, reason: snapshot.reason, fileCount: snapshot.files.length }, backups: await listBackups(request) });
    }));
    router.post('/storage/backup/delete', storageHandler(async (request, response) => {
        const id = String(request.body?.id || '');
        if (!/^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(id)) throw new Error('Invalid backup id.');
        await removeFile(path.join(pathsFor(request).backups, `${id}.json`));
        response.json({ ok: true, backups: await listBackups(request) });
    }));
    router.post('/storage/backup/export', storageHandler(async (request, response) => {
        const id = String(request.body?.id || '');
        if (!/^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(id)) throw new Error('Invalid backup id.');
        const snapshot = await readJson(path.join(pathsFor(request).backups, `${id}.json`), null);
        validateSnapshot(snapshot);
        response.json({ ok: true, snapshot: portableSnapshot(snapshot) });
    }));
    router.post('/storage/backup/restore', storageHandler(async (request, response) => {
        const id = String(request.body?.id || '');
        if (!/^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(id)) throw new Error('Invalid backup id.');
        const snapshot = await readJson(path.join(pathsFor(request).backups, `${id}.json`), null);
        await restoreSnapshot(request, snapshot);
        response.json({ ok: true, backups: await listBackups(request) });
    }));
    router.post('/storage/backup/import', storageHandler(async (request, response) => {
        const snapshot = validateSnapshot(request.body?.snapshot);
        await restoreSnapshot(request, snapshot);
        response.json({ ok: true, backups: await listBackups(request) });
    }));

    router.post('/systemone', async (request, response) => {
        let saved = {};
        try { saved = await readJson(pathsFor(request).secret, {}); } catch { /* compatibility with tests without a user root */ }
        const apiKey = String(request.get('X-Jev-Key') || saved.jevKey || '').trim();
        if (!apiKey) return sendError(response, 401, 'Jev API key is missing.');
        const body = request.body;
        if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(response, 400, 'A JSON request body is required.');
        const payload = JSON.stringify({ ...body, model: MODEL });
        if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_BYTES) return sendError(response, 413, 'The Jev request is too large.');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const upstream = await fetch(UPSTREAM, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: payload, signal: controller.signal });
            const text = await upstream.text();
            response.status(upstream.status).set('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8').send(text);
        } catch (error) {
            if (error?.name === 'AbortError') return sendError(response, 504, 'Jev request timed out.');
            return sendError(response, 502, 'Could not connect to the Jev API.');
        } finally { clearTimeout(timeout); }
    });
}

async function exit() {}

module.exports = {
    init,
    exit,
    _test: { recordId, validateSnapshot, restoreSnapshot, createSnapshot, listBackups },
    info: { id: 'scene-reader-jev', name: 'Scene Reader Jev Relay', description: 'Forwards Scene Reader decisions to Jev and stores Scene Reader data under each SillyTavern user data directory.' },
};
