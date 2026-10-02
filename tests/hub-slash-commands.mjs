import assert from 'node:assert/strict';
import {registerSlashCommands} from '../src/adapters/slash-commands.js';

const commands=new Map(),calls=[];
const settings={enabled:true,autoJudge:true};
let composer='/srh-judge',finish,failSave=false;
const pending=new Promise(resolve=>{finish=resolve;});
const deps={
    getContext:()=>({SlashCommandParser:{addCommandObject(command){assert.ok(!commands.has(command.name));commands.set(command.name,command);}},SlashCommand:{fromProps:p=>p},SlashCommandArgument:{fromProps:p=>p},ARGUMENT_TYPE:{STRING:'string'}}),
    settings,document:{getElementById:()=>({value:composer})},
    hub:{commands:{dispatch(name,options){calls.push([name,options]);return pending;}},invalidate(reason){calls.push(['invalidate',reason]);}},
    noteDiagnostic:(...args)=>calls.push(args),openSceneReader:()=>calls.push(['open']),
    saveGlobal:async(key,value)=>{if(failSave)throw new Error('storage failed');settings[key]=value;},
    setFormValues:()=>calls.push(['render']),invalidateReasonerJobs:()=>calls.push(['cancel']),
    clearInjection:async()=>calls.push(['clear']),updateStatus:()=>{},
    diagnosticSnapshot:()=>({automatic:{enabled:settings.enabled,autoJudge:settings.autoJudge,chatReady:true,lastJudgmentAt:null},scene:{route:'normal'},injection:{activeChars:42,worldChars:0},hub:{state:{status:'prepared'}},secret:'must not return'}),
};
assert.equal(registerSlashCommands(deps).length,6);
const run=(name,value='')=>commands.get(name).callback({},value);
let resolved=false;
const judge=run('srh-judge').then(value=>{resolved=true;return JSON.parse(value);});
await Promise.resolve();assert.equal(resolved,false,'Quick Reply chain waits for full judge completion');
assert.deepEqual(calls.find(x=>x[0]==='judge'),['judge',{force:true,pendingUserText:'',trigger:'slash'}]);
finish({judgedAt:'now',sceneIntimacy:{route:'normal'}});
assert.equal((await judge).status,'prepared');
composer='A courier knocks at the door.';await run('srh-judge');
assert.equal(calls.filter(x=>x[0]==='judge').at(-1)[1].pendingUserText,composer);
await run('srh-auto','off');assert.equal(settings.autoJudge,false);
await run('srh-auto','toggle');assert.equal(settings.autoJudge,true);
await run('srh-auto');assert.equal(settings.autoJudge,true,'missing argument only reads status');
await assert.rejects(run('srh-auto','wrong'),/on, off/);
await run('srh-enabled','off');assert.equal(settings.enabled,false);
assert.ok(calls.some(x=>x[0]==='cancel'));assert.ok(calls.some(x=>x[0]==='clear'));
await run('srh-enabled','on');assert.equal(settings.enabled,true);
failSave=true;await assert.rejects(run('srh-enabled','off'),/storage failed/);assert.equal(settings.enabled,true);failSave=false;
assert.equal(JSON.parse(await run('srh-clear')).status,'cleared');
assert.ok(calls.some(x=>x[0]==='invalidate'&&x[1]==='slash_clear'));
const status=JSON.parse(await run('srh-status'));assert.equal(status.injectionChars,42);assert.equal(status.secret,undefined);
await run('srh-open');assert.ok(calls.some(x=>x[0]==='open'));
assert.deepEqual(registerSlashCommands({...deps,getContext:()=>({})}),[],'older hosts remain usable without commands');
console.log('PASS Hub slash commands: completion ordering, composer, switches, rollback error, clear, status privacy, registration');
