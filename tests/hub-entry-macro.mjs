import assert from 'node:assert/strict';
import {applyEntryMacros} from '../src/injection/hub-macro.js';
import {PRESET_ENTRIES,entryText} from '../src/injection/preset-entry-contract.js';
const preset={prompts:Object.entries(PRESET_ENTRIES).map(([kind,spec])=>({...spec,content:entryText(kind),enabled:true}))};
const markers={scene:'[test-scene]',world:'[test-world]'},blocks=[{kind:'scene',content:'scene-owned'},{kind:'world',content:'world-owned'}];
const body={messages:[{role:'system',content:'Existing before\n[test-scene]\nExisting after'},{role:'system',content:'[test-world]'},{role:'user',content:'Keep user'}]};
assert.equal(applyEntryMacros(body,blocks,{markers,preset}).changed,true);
assert.deepEqual(body.messages.map(m=>m.content),['Existing before\nscene-owned\nExisting after','world-owned','Keep user']);
assert.equal(body.messages.length,3);assert.equal(applyEntryMacros(body,blocks,{markers,preset}).changed,false);
for(const enabled of [false,true]){
 const value={prompts:[{...preset.prompts[0],enabled}]},b={messages:[{role:'system',content:'prefix [test-scene] suffix'}]};
 if(enabled)value.prompts[0].content='User removed macro';
 const result=applyEntryMacros(b,[blocks[0]],{markers,preset:value});
 assert.equal(b.messages[0].content,'prefix  suffix');assert.equal(result.results[0].status,enabled?'missing':'disabled');
}
const duplicate={messages:[{role:'system',content:'[test-scene] [test-scene]'}]};
applyEntryMacros(duplicate,[blocks[0]],{markers,preset});assert.equal(duplicate.messages[0].content,'scene-owned ');
console.log('Native macro delivery passed: exact in-place substitution, no message splitting, idempotence, disabled/missing slots, unrelated content and duplicate markers.');

const already={messages:[{role:'system',content:'scene-owned scene-owned [test-scene]'}]};
applyEntryMacros(already,[blocks[0]],{markers,preset});assert.equal(already.messages[0].content,'scene-owned  ');
const wrongRole={messages:[{role:'user',content:'[test-scene]'}]};applyEntryMacros(wrongRole,[blocks[0]],{markers,preset});assert.equal(wrongRole.messages[0].content,'');
