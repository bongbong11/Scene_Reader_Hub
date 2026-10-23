import assert from 'node:assert/strict';
import {createConsoleReporter,attachConsoleReporter} from '../src/debug/console-reporter.js';
import {createHub} from '../src/hub/orchestrator.js';
import {createJobScope,StaleRunError} from '../src/lifecycle/jobs.js';
const lines=[],output={error:(...args)=>lines.push(args),warn:(...args)=>lines.push(args)};
const reporter=createConsoleReporter({console:output,now:()=>1});
const failure={status:'failed',errorKind:'PROFILE_SERVER_ERROR',httpStatus:502,phase:'request',module:'src/adapters/connection-profile.js',error:new Error('PRIVATE_ERROR'),message:'PRIVATE_RP',payload:'PRIVATE_PAYLOAD',apiKey:'PRIVATE_KEY',model:'PRIVATE_MODEL'};
reporter.accept({code:'RUN_STARTED',cycleId:'first'});
reporter.accept({...failure,stage:'profile_request'});reporter.accept({...failure,stage:'analysis_failed'});
assert.equal(lines.length,1,'same root in transport and continuity is grouped');
reporter.accept({...failure,errorKind:'RUN_FAILED',stage:'lifecycle'});assert.equal(lines.length,1,'generic catch wrappers do not duplicate the root');
assert.match(lines[0][0],/연결/);assert.equal(lines[0][1].HTTP,502);
reporter.accept({...failure,errorKind:'PROFILE_INVALID_JSON',stage:'analysis_failed',phase:'response'});assert.match(lines.at(-1)[0],/분석/);
reporter.accept({...failure,errorKind:'STORAGE_WRITE_FAILED',stage:'storage_request',phase:'storage'});assert.match(lines.at(-1)[0],/저장·설정/);
reporter.accept({stage:'injection.slot',code:'PRESET_SLOT_SEND_ERROR',resultStatus:'missing',status:'info',reason:'PRIVATE_NAME'});assert.match(lines.at(-1)[0],/주입/);
const count=lines.length;
for(const status of ['cancelled','waiting','not_needed','started','succeeded'])reporter.accept({...failure,status});
reporter.accept({...failure,errorKind:'STALE_RUN'});assert.equal(lines.length,count);
reporter.accept({stage:'analysis_started'});reporter.accept(failure);assert.equal(lines.length,count+1,'a new attempt can report the same cause');
assert.doesNotMatch(JSON.stringify(lines),/PRIVATE_|apiKey|payload|Error:/);
const hub=createHub({jobs:createJobScope(()=> 'test'),getIdentity:()=> 'test',StaleRunError});
const detach=attachConsoleReporter(hub,{console:output});hub.report('analysis_failed','ANALYSIS_FAILED',{...failure});
assert.equal(lines.length,count+2);detach();hub.report('analysis_failed','ANALYSIS_FAILED',{...failure,errorKind:'PROFILE_TIMEOUT'});assert.equal(lines.length,count+2);
{
 let time=0;const retryLines=[],r=createConsoleReporter({now:()=>time,console:{error:(...args)=>retryLines.push(args)}});
 r.accept({code:'RUN_STARTED',cycleId:'old-run'});r.accept(failure);
 time=6000;r.accept(failure);
 assert.equal(retryLines.length,2,'an old Hub run must not suppress later manual connection failures indefinitely');
}
{
 const captures=[],r=createConsoleReporter({console:{error:(...args)=>captures.push(args),warn:(...args)=>captures.push(args)}});
 r.accept({stage:'character_state_capture',status:'save_failed',errorKind:'STORAGE_WRITE_FAILED'});
 r.accept({stage:'character_state_capture',status:'incomplete',errorKind:''});
 assert.equal(captures.length,2,'emotion-specific failures and partial results must reach the grouped console');
 assert.match(captures[0][0],/저장·설정/);assert.match(captures[1][0],/분석/);
 r.accept({stage:'character_state_capture',status:'empty'});assert.equal(captures.length,2,'normal empty capture is not an error');
}
console.log('Console diagnostics passed: four groups, root deduplication, new attempts, normal cancellation filtering, privacy and Hub subscription.');
