import {chatRef,clone,digest} from './shared-document.js';
// Preserve verified per-room recovery records before unlinking shared stories.
// Legacy plugins may also need the bounded fallback when full backups are large.
export async function protectRollback({entries,documents,backup,signal,noteDiagnostic}) {
    for(const {target,saved} of entries) {
        signal.throwIfAborted();
        await documents.write('rollback_safety',chatRef(target),{
            chat:clone(saved.chat),characters:clone(saved.characters),history:clone(saved.history || []),
        },{operationId:digest(saved.chat),signal});
    }
    try{await backup();}
    catch(error){
        if(!/\btoo large\b/i.test(String(error.message)) || (error.httpStatus && error.httpStatus!==500))throw error;
        noteDiagnostic?.('shared_storage',{module:'src/storage/rollback-safety.js',phase:'rollback_backup',status:'succeeded',code:'VERIFIED_ROOM_BACKUP',roomCount:entries.length});
    }
}
