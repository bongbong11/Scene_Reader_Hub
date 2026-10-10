import {createOutputEvents} from '../lifecycle/output.js';
import {createRollback} from '../lifecycle/rollback.js';
import {createInjectionWriter} from '../injection/writer.js';
import {selectCapabilities} from '../shared/capabilities.js';



// Runtime coordination; dependencies are explicit and supplied by the application.
export function createOutputLifecycle(deps) {
const services=Object.create(deps);
Object.defineProperty(services,'queueInjectionWrite',{configurable:true,get:()=>queueInjectionWrite});
Object.defineProperty(services,'waitForOutputChanges',{configurable:true,get:()=>waitForOutputChanges});
Object.defineProperty(services,'onCharacterMessageReceived',{configurable:true,get:()=>onCharacterMessageReceived});
Object.defineProperty(services,'onUserMessageSent',{configurable:true,get:()=>onUserMessageSent});
Object.defineProperty(services,'rollbackChangedOutput',{configurable:true,get:()=>rollbackChangedOutput});
Object.defineProperty(services,'onAssistantOutputChanged',{configurable:true,get:()=>onAssistantOutputChanged});
Object.defineProperty(services,'applyStoredInjection',{configurable:true,get:()=>applyStoredInjection});
Object.defineProperty(services,'resetInjection',{configurable:true,get:()=>resetInjection});
Object.defineProperty(services,'clearInjection',{configurable:true,get:()=>clearInjection});
Object.defineProperty(services,'outputChangePromise',{configurable:true,get:()=>outputChangePromise,set:value=>{outputChangePromise=value}});
Object.defineProperty(services,'injectionWrite',{configurable:true,get:()=>injectionWrite,set:value=>{injectionWrite=value}});
const {onCharacterMessageReceived,onUserMessageSent} = createOutputEvents(selectCapabilities(services,["analysis","noteDiagnostic","STATE_COLLECTOR_MODE","activeGenerationCycle","clearInjection","collectMainOutputState","currentInputKey","debugInjectionArmed","generationMode","getContext","handleOocOnlySkip","latestStateForChat","messageSnapshot","messageSnapshots","pendingGenerationType","persistChat","record","renderAll","scheduleProfileStateCollection","settings","stableFingerprint","stateChatKey","storeStateEvent","updateActivity","updateStatus","window","sourceRevisionKey","selectedWorld"]));
const {waitForOutputChanges,rollbackChangedOutput,onAssistantOutputChanged} = createRollback(selectCapabilities(services,["applyStoredInjection","attachSelectedOutput","clearInjection","dropStateEventsFrom","firstChangedMessage","getContext","invalidateReasonerJobs","loadStateHistory","messageSnapshot","messageSnapshots","outputChangePromise","record","renderAll","restoreReversibleState","reversibleStateSnapshot","saveSession","stableFingerprint","stateChatKey","storeStateEvent","window"]));
const {queueInjectionWrite,applyStoredInjection,resetInjection,clearInjection} = createInjectionWriter(selectCapabilities(services,["hub","INJECT_KEY","IN_CHAT","STATE_CAPTURE_KEY","STATE_COLLECTOR_MODE","SYSTEM_ROLE","WORLD_INJECT_KEY","activeGenerationCycle","activeInjectionPayload","activeMacroPayload","activeWorldMacroPayload","characterStore","document","getContext","injectionWrite","isStreamingEnabled","macroAvailable","mainOutputStatePrompt","record","selectedWorld","setExtensionPrompt","settings","sourceRevisionKey","stateChatKey","stateRoster"]));

let outputChangePromise = Promise.resolve();
let injectionWrite = Promise.resolve();

















return {onCharacterMessageReceived, onUserMessageSent, rollbackChangedOutput, onAssistantOutputChanged, applyStoredInjection, clearInjection, waitForOutputChanges};
}
