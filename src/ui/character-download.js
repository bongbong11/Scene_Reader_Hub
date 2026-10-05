import {bankOutput} from '../character/versions.js';
import {downloadStoredFile} from '../storage/backup-stream.js';
import {exportBank} from '../storage/character-pages.js';
export async function downloadCharacterBank(document,bank){
 if(bank.pagedRecords){const operationId=await exportBank(bank);downloadStoredFile(document,'character/download',{id:operationId},'characters.json');return;}
 const window=document.defaultView,blob=new window.Blob([JSON.stringify(bankOutput(bank),null,2)],{type:'application/json'}),url=window.URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='characters.json';document.body.append(anchor);anchor.click();anchor.remove();window.setTimeout(()=>window.URL.revokeObjectURL(url),10000);
}
