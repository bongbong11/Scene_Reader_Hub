const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_STORAGE_BYTES = 20_000_000;
const locks = new Map();
const BACKUP_PATH = /^(?:settings\.json|secrets\.json|reasoner-(?:profiles|secrets)\.json|(?:chats|characters|history|sessions)\/[a-f0-9]{64}\.json)$/;
const isBackupPath = value => BACKUP_PATH.test(value);

function serialize(root, work) {
    const pending = (locks.get(root) || Promise.resolve()).catch(() => {}).then(work);
    locks.set(root, pending);
    void pending.finally(() => { if (locks.get(root) === pending) locks.delete(root); }).catch(() => {});
    return pending;
}
async function readJson(file, fallback) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error(`저장 파일을 읽지 못했습니다: ${path.basename(file)} (${error.code || '잘못된 JSON'})`); }
}
async function writeJsonAtomic(file, value) {
    const body = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(body, 'utf8') > MAX_STORAGE_BYTES) throw new Error('Scene Reader storage record is too large.');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, body, { encoding: 'utf8', mode: 0o600 }); await fs.rename(temporary, file); }
    finally { await fs.rm(temporary, { force: true }); }
}
function validateSnapshot(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.files)) throw new Error('Invalid Scene Reader backup.');
    if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_STORAGE_BYTES) throw new Error('Backup is too large.');
    const seen = new Set();
    for (const entry of snapshot.files) {
        if (!entry || typeof entry.path !== 'string' || typeof entry.text !== 'string') throw new Error('Invalid backup entry.');
        // Only extension-owned JSON records. Reject both Windows and POSIX traversal, duplicates and file/directory collisions.
        if (!isBackupPath(entry.path) || seen.has(entry.path)) throw new Error('Unsafe or duplicate Scene Reader backup path.');
        seen.add(entry.path);
        try { JSON.parse(entry.text); } catch { throw new Error(`Invalid backup JSON: ${entry.path}`); }
    }
    return snapshot;
}
function portableSnapshot(snapshot) {
    const copy = structuredClone(validateSnapshot(snapshot));
    const privatePrompt = JSON.parse(copy.files.find(entry => entry.path === 'settings.json')?.text || '{}').owner?.prompt || '';
    copy.files = copy.files.filter(entry => entry.path !== 'secrets.json' && !entry.path.startsWith('reasoner'));
    for (const entry of copy.files) {
        if (entry.path !== 'settings.json') continue;
        const settings = JSON.parse(entry.text);
        delete settings.owner; delete settings.ownerPrompt; delete settings.ownerUnlocked; delete settings.jevKey;
        if (settings.global) { delete settings.global.ownerUnlocked; delete settings.global.jevKey; }
        entry.text = JSON.stringify(settings, null, 2);
    }
    const redact = value => {
        if (typeof value === 'string') return privatePrompt ? value.replaceAll(privatePrompt, '') : value;
        if (Array.isArray(value)) return value.map(redact);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['payload', 'worldPayload', 'privatePrompt', 'ownerPrompt'].includes(key)).map(([key, item]) => [key, redact(item)]));
        return value;
    };
    for (const entry of copy.files) entry.text = JSON.stringify(redact(JSON.parse(entry.text)), null, 2);
    copy.portable = true;
    return copy;
}
async function restoreFiles(root, snapshot) {
    validateSnapshot(snapshot);
    const parent = path.dirname(root);
    const stage = path.join(parent, `.scene-reader-stage-${crypto.randomUUID()}`);
    const previous = path.join(parent, `.scene-reader-rollback-${crypto.randomUUID()}`);
    // Both siblings have verified fixed prefixes and never point at a user character folder.
    const check = target => { if (path.dirname(target) !== parent || !path.basename(target).startsWith('.scene-reader-')) throw new Error('Unsafe staging path.'); };
    check(stage); check(previous);
    let moved = false, installed = false;
    try {
        await fs.mkdir(stage, { recursive: true });
        for (const entry of snapshot.files) {
            const target = path.resolve(stage, entry.path);
            if (!target.startsWith(`${stage}${path.sep}`)) throw new Error('Unsafe restore target.');
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, entry.text, { encoding: 'utf8', mode: 0o600 });
        }
        // A downloaded backup intentionally excludes secrets. Preserve local credentials on portable imports.
        if (snapshot.portable) {
            const secret = await readJson(path.join(root, 'secrets.json'), null);
            if (secret) await writeJsonAtomic(path.join(stage, 'secrets.json'), secret);
        }
        try { await fs.cp(path.join(root, 'backups'), path.join(stage, 'backups'), { recursive: true, errorOnExist: true }); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        await fs.rename(root, previous); moved = true;
        try { await fs.rename(stage, root); installed = true; }
        catch (error) { await fs.rename(previous, root); moved = false; throw error; }
    } finally {
        await fs.rm(stage, { recursive: true, force: true });
        if (installed && moved) await fs.rm(previous, { recursive: true, force: true });
    }
}
async function cleanupStaleTemps(root, current = root) {
    const rows = await fs.readdir(current, { withFileTypes: true }).catch(error => { if(error.code==='ENOENT')return [];throw error; });
    for(const row of rows) {
        const file=path.join(current,row.name);
        if(row.isDirectory() && current===root && /^(chats|characters|history|sessions|backups)$/.test(row.name)) await cleanupStaleTemps(root,file);
        if(!row.isFile() || !/\.json\.[a-f0-9-]{36}\.tmp$/.test(row.name))continue;
        const relative=path.relative(root,file).replaceAll('\\','/').replace(/\.[a-f0-9-]{36}\.tmp$/,'');
        if(!isBackupPath(relative) && !/^backups\/[\dT.Z-]+\.json$/.test(relative) && relative!=='retrieval-cleanup.json')continue;
        if(Date.now()-(await fs.stat(file)).mtimeMs > 86400000)await fs.unlink(file);
    }
}
module.exports = { readJson, writeJsonAtomic, validateSnapshot, portableSnapshot, restoreFiles, serialize, isBackupPath, cleanupStaleTemps };
