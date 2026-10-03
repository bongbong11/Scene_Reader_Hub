import { safeDetail } from './events.js';
export const EXECUTION_REPORT_VERSION = 4;
export function executionReport({hub,failureStop=null,settings={},version='0.1.9'}) {
    const snapshot=hub?.snapshot() || {state:{},events:[]};
    const events=snapshot.events.map(event=>safeDetail(event));
    return {reportVersion:EXECUTION_REPORT_VERSION,version,capabilities:['bounded-network','embedding-retry','whole-extension-log','retained-failure','capture-field-coverage'],
        connections:{jevProvider:['typesafe','openrouter','vercel'].includes(settings.jevProvider)?settings.jevProvider:'typesafe',
            retrievalProvider:['transformers','palm','vertexai','nanogpt'].includes(settings.retrievalProvider)?settings.retrievalProvider:'transformers'},
        lastRunFailure:failureStop ? safeDetail(failureStop) : null,state:safeDetail(snapshot.state),last:snapshot.last ? safeDetail(snapshot.last) : null,
        lastFailure:snapshot.lastFailure ? {event:safeDetail(snapshot.lastFailure.event),context:snapshot.lastFailure.context.map(safeDetail)} : null,
        failures:events.filter(event=>event.status==='failed'||event.status==='degraded'||/FAILED|TIMEOUT|FALLBACK/.test(event.code || '')).slice(-20),events};
}
