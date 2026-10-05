import {digest} from '../storage/shared-document.js';
export function bankIdentity(kind,legacyId,items,shared=false) {
    return shared?'shared-'+kind+'-'+digest(items):legacyId;
}
