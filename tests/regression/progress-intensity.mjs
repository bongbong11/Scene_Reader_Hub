import assert from 'node:assert/strict';
import {normalizeDevelopmentPreferences,buildInjection} from '../../prompt-library.js';
import {makeOpportunities} from '../../src/scene/opportunities.js';
import {resolveOpportunities} from '../../src/scene/opportunity-policy.js';
import {incorporateAdditions,additionBlocks} from '../../src/injection/opportunity.js';
import {LANGUAGE_SCOPE} from '../../src/injection/language-scope.js';
import {buildPausedInjection} from '../../src/injection/paused.js';
import {sceneGateRequest} from '../../src/scene/intimacy-gate.js';
const prefs={developmentStyle:'balanced',newGenerationEnabled:true,advancedEnabled:false,advancedStyle:'very_active',appearanceChance:75};
const decisions={primary_focus:'direct',basic_move:'dialogue',direct_execution:'yes'};
const baseline=buildInjection({settings:prefs,decisions});
for(const value of [undefined,null,'bad',0,-1,.5,1,1.5,99]) {
 const settings=normalizeDevelopmentPreferences({...prefs,progressIntensity:value});
 assert.equal(Object.hasOwn(settings,'progressIntensity'),false);
 assert.equal(buildInjection({settings,decisions}),baseline);
}
assert.ok(!baseline.includes('PROGRESS_EXPRESSION'));
assert.ok(baseline.includes(LANGUAGE_SCOPE));
assert.ok(buildPausedInjection({settings:prefs}).includes(LANGUAGE_SCOPE));
assert.match(sceneGateRequest({transcript:'[1] USER: A clinical question.',people:[]}).questions.scene_status.instructions,/not vocabulary/);
// Every mode has the same single draw per channel, even without advanced events.
for(let i=0;i<2000;i++) {
 const offers=['off','event','person','both'].map(spontaneousMode=>makeOpportunities({preferences:{...prefs,spontaneousMode}},`independent-${i}`));
 for(const offer of offers) {
  for(const feature of ['event','person']) {
   assert.equal(offer[feature].roll,offers[0][feature].roll);
   assert.equal(offer[feature].passed,offers[0][feature].passed);
   if(offer[feature].passed)assert.ok(offer[feature].candidates.length>0);
  }
  const additions=resolveOpportunities(offer,{event_opportunity:{choice:'candidate_1'},person_opportunity:{choice:'candidate_1'}});
  assert.equal(additions.length,Number(offer.event.passed)+Number(offer.person.passed));
  const blocks=additionBlocks(additions,prefs,false),payload=incorporateAdditions(baseline,blocks,prefs);
  for(const block of blocks)assert.ok(payload.includes(block.text),'normal and spontaneous selections both reach injection');
 }
}
console.log('Retired intensity and independent generation passed: obsolete values inert, single draws in all four modes, general events without advanced mode, selected additions reach injection, language/action distinction in both scene routes.');
