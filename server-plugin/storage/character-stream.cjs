const {reader}=require('./chunks.cjs');
const {arrayItem}=require('./character-records.cjs');
const {failure}=require('./limits.cjs');
async function *json(root,banks){
 const {validateImport}=await import('../vendor/character-core.mjs');
 if(banks.length>1)yield '{"entities":[';
 for(let person=0;person<banks.length;person++){
  if(person)yield ',';const bank=banks[person],nodes=reader(root);
  const meta={entity_type:bank.entity_type,entity_name:bank.entity_name,...(bank.source_set_id?{source_set_id:bank.source_set_id}:{}),intimacy_reference:bank.intimacy_reference||{text:'',source_ids:[]}};
  validateImport({...meta,records:[]});if(bank.pagedRecords)await nodes.verify(bank.pagedRecords.root);
  yield JSON.stringify(meta).slice(0,-1)+',"records":[';
  const count=bank.pagedRecords?.count??bank.records.length;
  for(let index=0;index<count;index++){const record=bank.pagedRecords?await arrayItem(nodes,bank.pagedRecords.root,index):bank.records[index];validateImport({...meta,records:[record]});yield (index?',':'')+JSON.stringify(record);}
  yield ']}';
 }if(banks.length>1)yield ']}';
}
async function stream(root,banks,response){response.set('Content-Type','application/json; charset=utf-8').set('Content-Disposition','attachment; filename="characters.json"');for await(const text of json(root,banks)){if(response.destroyed)return;if(!response.write(text))await new Promise((resolve,reject)=>{const done=()=>{response.off('close',closed);resolve();},closed=()=>{response.off('drain',done);reject(failure('STORAGE_CANCELLED','내려받기가 중단됐습니다.'));};response.once('drain',done);response.once('close',closed);});}response.end();}
module.exports={json,stream};
