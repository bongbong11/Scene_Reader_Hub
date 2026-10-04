import {sha256Fallback} from '../shared/security.js';
const STORAGE_KEY = 'scene-reader-vault-unlocked-v1';
const PASSWORD_HASH = '0b7a0a5e92d302134eb295434805200101b3c43dcbf39152ade33e3834a0be1a';
export function createVaultAccess(host) {
    let sessionUnlocked = false;
    function isUnlocked() {
        if (sessionUnlocked) return true;
        try { return host.localStorage.getItem(STORAGE_KEY)==='yes'; }
        catch { return sessionUnlocked; }
    }
    function unlock(candidate) {
        if (typeof candidate!=='string' || candidate.length>128 || sha256Fallback(candidate.trim())!==PASSWORD_HASH) return false;
        try { host.localStorage.setItem(STORAGE_KEY,'yes'); }
        catch { sessionUnlocked=true; }
        return true;
    }
    return {isUnlocked,unlock};
}
