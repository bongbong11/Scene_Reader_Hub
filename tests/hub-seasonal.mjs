import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {dateCandidates,readDateField} from '../src/world/scene-date.js';
import {createSeasonalDate} from '../src/world/seasonal-date-runtime.js';
import {seasonalWorldNote,normalizeSeasonalReferences,SEASONAL_OPTIONS} from '../src/world/seasonal.js';
import {holidayCalendar,holidayMaterials} from '../src/world/holiday-calendar.js';
import {MONTHLY_SEASONS,monthlySeason} from '../src/world/seasonal-data.js';
const date={year:2026,month:10,day:30};
assert.ok(!('holidays' in SEASONAL_OPTIONS));
assert.deepEqual(normalizeSeasonalReferences(['holidays','us_holidays','us_holidays','wrong']),['us_holidays']);
assert.deepEqual(normalizeSeasonalReferences(['holidays','college_football']),['college_football']);
for(const value of [
'<Scene_Info><small>Date: 2026.10.30 | Time: 12:20</small></Scene_Info>',
"'''\n날짜: 2026년 10월 30일\n'''",
'~~~json\n{"date":"2026-10-30","birthday":"1990-05-06"}\n~~~',
'| Date | 2026/10/30 |\n| Birthday | 1990/05/06 |',
'**Current Date:** October 30, 2026',
'> Date: 30 October 2026',
'<status><date>2026-10-30</date><birthday>1990-05-06</birthday></status>',
]) {
 const candidates=dateCandidates(value);
 assert.equal(candidates.length,1,value);assert.deepEqual(candidates[0].date,date);
 assert.deepEqual(readDateField(value,candidates[0].profile),date);
}
for(const value of ['Date: 2026-02-30','Date: 2025-02-29','Birthday: 2000-05-06','Tomorrow: 2026-05-06','He remembered 2026-05-06.','<birthday>2000-05-06</birthday>'])assert.equal(dateCandidates(value).length,0,value);
assert.equal(dateCandidates('Date: 2024-02-29')[0].date.day,29);
assert.equal(dateCandidates('Date: 10/11/2026').length,2);
const ambiguous=dateCandidates('Date: 10/11/2026');
assert.deepEqual(readDateField('Date: 11/12/2026',ambiguous.find(v=>v.profile.order==='dmy').profile),{year:2026,month:12,day:11});
assert.equal(readDateField('Date: 2026-10-30\nDate: 2026-11-01',dateCandidates('Date: 2026-10-30')[0].profile),null);
assert.equal(seasonalWorldNote({seasonalReferences:['us_holidays']},'2026-10-30'),'', 'unconfirmed transcript cannot bypass confirmation');
assert.match(seasonalWorldNote({seasonalReferences:['us_holidays']},date),/Halloween.*approaching/);
assert.doesNotMatch(seasonalWorldNote({seasonalReferences:['us_holidays']},date,{calendarTopics:['holidays']}),/Halloween/);
assert.equal(seasonalWorldNote({},date,{seasonalProfile:'hogwarts',calendarTopics:['holidays']}),'');
assert.match(seasonalWorldNote({seasonalReferences:['hogwarts']},date,{calendarTopics:['holidays']}),/31 October Halloween/);
for(const key of Object.keys(MONTHLY_SEASONS)) {
 assert.equal(MONTHLY_SEASONS[key].length,12);
 for(let month=1;month<=12;month++)assert.ok(monthlySeason(key,{month,day:15}).length>20);
}
assert.match(monthlySeason('college_football',{month:4,day:20}),/undrafted/);
assert.match(monthlySeason('college_football',{month:5,day:20}),/not a playing debut/);
assert.notEqual(monthlySeason('pro_football',{month:1,day:3}),monthlySeason('pro_football',{month:1,day:20}));
const format=stamp=>new Date(stamp).toISOString().slice(0,10);
assert.equal(format(holidayCalendar(2026,'us').find(v=>v.name==='Thanksgiving').start),'2026-11-26');
assert.equal(format(holidayCalendar(2026,'kr').find(v=>v.name==='Seollal').start),'2026-02-16');
assert.equal(format(holidayCalendar(2026,'kr').find(v=>v.name==='Buddha’s Birthday (substitute day)').start),'2026-05-25');
assert.ok(!holidayCalendar(2026,'kr').some(v=>v.name==='Chuseok (substitute day)'),'Saturday alone does not extend Seollal/Chuseok');
assert.equal(format(holidayCalendar(2025,'kr').find(v=>v.name==='Chuseok (substitute day)').start),'2025-10-08');
assert.ok(holidayCalendar(2026,'kr').some(v=>v.name==='Constitution Day'));
assert.ok(!holidayCalendar(2025,'kr').some(v=>v.name==='Constitution Day'));
assert.equal(format(holidayCalendar(2026,'uk').find(v=>v.name==='Boxing Day (substitute day)'&&v.scope==='England and Wales').start),'2026-12-28');
assert.ok(!holidayCalendar(2026,'uk').filter(v=>v.name==='Easter Monday').some(v=>v.scope==='Scotland'));
assert.equal(holidayMaterials({year:2026,month:12,day:25},['us','uk']).filter(v=>v.startsWith('Christmas —')).length,1);
assert.doesNotMatch(holidayMaterials({year:null,month:4,day:5},['us','uk']).join(' '),/Easter/);
let settings={},chat=[{is_user:false,mes:'<info>Date: 2026-10-30</info>'}],room='a',preset='one',busy=false,shown=[],saveFails=false,log=[];
const runtime=createSeasonalDate({
 getContext:()=>({chat}),record:()=>({nonRpOutputIndices:[]}),chatKey:()=>room,settings:()=>settings,
 preset:()=>preset,fingerprint:v=>JSON.stringify(v),enabled:()=>true,busy:()=>busy,
 save:async formats=>{if(saveFails)throw new Error('save failed');settings.seasonalDateFormats=formats;},
 confirm:(state,actions)=>shown.push({state,actions}),report:(...args)=>log.push(args)
});
runtime.refresh();assert.equal(shown.length,1);runtime.refresh();assert.equal(shown.length,1);
saveFails=true;await assert.rejects(shown[0].actions.accept(0),/save failed/);assert.equal(runtime.read().date,null);saveFails=false;
await shown[0].actions.accept(0);assert.deepEqual(runtime.read().date,date);
chat[0].mes='<info>Date: 2026-11-02</info>';assert.equal(runtime.read().date.month,11);
chat[0].mes='<info>No date.</info>';assert.equal(runtime.read().date,null,'missing field never retains yesterday');
chat[0].mes='<info>Date: 2026-11-02</info>';assert.equal(runtime.read().date.day,2);
preset='two';assert.equal(runtime.read().status,'confirmed','preset changes do not invalidate the confirmed date format');
runtime.refresh();assert.equal(shown.length,1);
chat.push({is_user:false,mes:'Current date: 2026-12-25'});busy=true;runtime.refresh();assert.equal(shown.length,1);
busy=false;runtime.refresh();assert.equal(shown.length,2);await shown[1].actions.accept(0);
assert.equal(runtime.read().date.month,12);
chat.at(-1).is_hidden=true;assert.equal(runtime.read().date.day,2,'hidden output is skipped; the earlier confirmed format still works');
chat.at(-1).is_hidden=false;assert.equal(runtime.read().date.month,12);
chat.pop();assert.equal(runtime.read().date.day,2,'deleted output is skipped; the earlier confirmed date is retained');
room='b';chat=[{is_user:false,mes:'Current date: 2027-01-01'}];assert.equal(runtime.read().date.year,2027);
await runtime.recheck();const stale=shown.at(-1);chat[0].mes='Current date: 2027-01-02';await assert.rejects(stale.actions.accept(0),/바뀌/);
runtime.refresh({manual:true});await shown.at(-1).actions.accept(0);
const before=log.length;
const start=performance.now();for(let i=0;i<1000;i++)runtime.read();
assert.equal(log.length,before,'same output is parsed once');
assert.ok(performance.now()-start<1000,'cached reads stay under 1ms average in the fixture');
assert.doesNotMatch(JSON.stringify(log),/2026-|Current date|<info>/,'diagnostics never include source text');
console.log('Seasonal/date checks passed: formats, ambiguity, holidays, months, confirmation, cache, preset drift, hide/delete and stale save.');


import {cleanGlobalSettings,cleanSeasonalSettings} from '../src/storage/obsolete-settings.js';
import {retireHistory} from '../src/storage/retired-collection.js';
for(const value of ['| Date | October 30, 2026 |\n| Birthday | October 2, 2000 |','<div>Date: <b>2026-10-30</b></div>','<table><tr><td>Date</td><td>2026-10-30</td></tr><tr><td>Birthday</td><td>1990-01-01</td></tr></table>']) {
 const candidates=dateCandidates(value);assert.equal(candidates.length,1,value);assert.deepEqual(candidates[0].date,date);
}
const old={preferences:{seasonalReferences:['holidays','us_university'],other:42},lastJudgment:{payload:'old'},pendingPlan:{outputText:'already completed'},characters:{keep:'all'}};
assert.equal(cleanSeasonalSettings(old),true);assert.deepEqual(old.preferences,{seasonalReferences:['us_university'],other:42});
assert.equal(old.pendingPlan.outputText,'already completed');assert.equal(old.characters.keep,'all');assert.equal(cleanSeasonalSettings(old),false);
const history=[{before:{preferences:{seasonalReferences:['holidays']}},after:{preferences:{seasonalReferences:['uk_university']}},judgment:{payload:'old'}}];
assert.equal(retireHistory(history),true);assert.deepEqual(history[0].before.preferences.seasonalReferences,[]);assert.equal(history[0].judgment,null);
const globals={jevProvider:'vercel',characterReviewPrompt:'old',characterBehaviorMode:'gemini',reasonerProfileId:'keep',seasonalDateFormats:{keep:{label:'date'}}};
assert.equal(cleanGlobalSettings(globals),true);assert.equal(globals.characterBehaviorMode,'gemini');assert.equal(globals.reasonerProfileId,'keep');assert.ok(globals.seasonalDateFormats.keep);
console.log('Seasonal storage cleanup preserves active data and removes only retired settings.');

const dayFirst=dateCandidates('Date: 10/11/2026').find(v=>v.profile.order==='dmy').profile;
assert.deepEqual(readDateField('Date: 11/11/2026',dayFirst),{year:2026,month:11,day:11},'equal month/day retains the confirmed order');
const repeated=dateCandidates('Date: 2026-10-30\nDate: 2026-11-01');
assert.deepEqual(readDateField('Date: 2026-10-31\nDate: 2026-11-02',repeated[1].profile),{year:2026,month:11,day:2});
assert.equal(readDateField('Date: 2026-11-02',repeated[1].profile),null,'changed duplicate layout requires confirmation');

// Date confirmation follows format changes, never preset/model changes or date-free turns.
{
 let settings={},chat=[{mes:'<Scene_Info>Date: 2026-10-30</Scene_Info>'}],preset={name:'one',prompts:['original']},room='first',shown=[];
 const deps={getContext:()=>({chat}),record:()=>({nonRpOutputIndices:[]}),chatKey:()=>room,settings:()=>settings,
  preset:()=>preset,fingerprint:JSON.stringify,enabled:()=>true,
  save:async formats=>{settings.seasonalDateFormats=formats;},confirm:(state,actions)=>shown.push({state,actions})};
 let reader=createSeasonalDate(deps);
 reader.refresh();await shown.at(-1).actions.accept(0);
 const saved=JSON.stringify(settings),revision=reader.revision();
 preset={name:'other model profile',prompts:['unrelated changed prompt']};
 reader.refresh();assert.deepEqual(reader.revision(),revision);assert.equal(shown.length,1);
 chat.push({mes:'<Scene_Info>Date: 2026.11.01</Scene_Info>'});
 assert.equal(reader.refresh().date.day,1);assert.equal(shown.length,1,'date and separator changes remain readable');
 for(let i=0;i<30;i++)chat.push({mes:'The conversation continues without a date.'});
 assert.equal(reader.refresh().date.day,1);assert.equal(reader.read().retained,true);assert.equal(shown.length,1);
 assert.equal(JSON.stringify(settings),saved,'automatic reads do not rewrite settings');
 reader=createSeasonalDate(deps);assert.equal(reader.refresh().date.day,1);assert.equal(shown.length,1,'reload preserves the format and last date from saved chat');
 chat[1].is_hidden=true;assert.equal(reader.refresh().date.day,30,'hidden dates are not retained');
 chat[1].is_hidden=false;chat[1].mes='<Scene_Info>Date: 2026-11-03</Scene_Info>';
 assert.equal(reader.refresh().date.day,3,'edits and swipes replace the date');
 chat.splice(1,1);assert.equal(reader.refresh().date.day,30,'deleted dates are not retained');
 const firstChat=chat;room='second';chat=[{mes:'No date here.'}];
 assert.equal(reader.refresh().date,null,'another room cannot inherit the previous room date');assert.equal(shown.length,1);
 room='first';chat=firstChat;assert.equal(reader.refresh().date.day,30);
 chat.push({mes:'<Scene_Info>Date: November 4, 2026</Scene_Info>'});
 assert.equal(reader.refresh().status,'unconfirmed');assert.equal(shown.length,2,'changed format asks once');
 const confirmationToken=reader.read().token;preset={name:'another preset',prompts:['different instructions']};
 assert.equal(reader.refresh().token,confirmationToken,'unrelated preset changes cannot dismiss a pending format confirmation');
 reader.refresh();assert.equal(shown.length,2);await shown.at(-1).actions.accept(0);
 chat.push({mes:'<Scene_Info>Date: November 5, 2026</Scene_Info>'});
 assert.equal(reader.refresh().date.day,5);assert.equal(shown.length,2);
 chat.push({mes:'No date in this reply.'});assert.equal(reader.refresh().date.day,5);
 chat.push({mes:'<Scene_Info>Date: 2026-11-06</Scene_Info>'});
 assert.equal(reader.refresh().date.day,6);assert.equal(shown.length,2,'an already confirmed format works again without another dialog');
 chat.push({mes:'<Status>Current date: 2026-11-07</Status>'});
 assert.equal(reader.refresh().status,'unconfirmed');assert.equal(shown.length,3,'an unknown field still requires confirmation');
}
console.log('Date format lifecycle passed: preset drift, reload, missing dates, new dates, actual format breaks and history changes.');

{
 const settings={seasonalDateFormats:{'legacy-preset-hash':dateCandidates('Date: 2026-10-30')[0].profile}};
 const before=JSON.stringify(settings);
 const reader=createSeasonalDate({getContext:()=>({chat:[{mes:'Date: 2026-11-02'}]}),record:()=>({}),chatKey:()=> 'legacy-room',settings:()=>settings,
  fingerprint:JSON.stringify,enabled:()=>true,confirm:()=>assert.fail('legacy confirmed formats must not prompt again')});
 assert.equal(reader.refresh().date.day,2);
 assert.equal(JSON.stringify(settings),before,'legacy storage keys remain untouched');
}
