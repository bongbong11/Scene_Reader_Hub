import {API_VERSION,RECORD_VERSION,COMPILER_VERSION} from '../vendor/character-reasoner/index.js';

const FIELDS=new Set(['entity_type','entity_name','records','intimacy_reference','type','target','when','rule','modality','basis','source_ids','knowledge_domain','knowledge_state','text']);
const STAGES=new Set(['prompt','lorebook','parse','validate','model','save','apply','delete','copy']);
export function characterErrorReport(error,{stage='parse',inputLength=0,recordCount=null,saved=false,applied=false}={}) {
    const message=String(error?.message||'');
    const record=message.match(/\brecord\[(\d+)\]/i);
    const field=message.match(/\b(entity_type|entity_name|records|intimacy_reference|type|target|when|rule|modality|basis|source_ids|knowledge_domain|knowledge_state|text)\b/i);
    return {
        report_type:'scene_reader_character_error',
        api_version:API_VERSION,record_version:RECORD_VERSION,compiler_version:COMPILER_VERSION,
        stage:STAGES.has(stage)?stage:'unknown',
        error_kind:['SyntaxError','TypeError','RangeError'].includes(error?.name)?error.name:'Error',
        record_index:record?Number(record[1]):null,
        field:field&&FIELDS.has(field[1])?field[1]:null,
        input_length:Number.isFinite(inputLength)?Math.max(0,Math.floor(inputLength)):0,
        record_count:Number.isInteger(recordCount)?recordCount:null,
        saved:Boolean(saved),applied:Boolean(applied),
    };
}
