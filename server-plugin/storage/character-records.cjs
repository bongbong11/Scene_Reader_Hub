const {reader}=require('./chunks.cjs');
const {failure}=require('./limits.cjs');
async function arrayItem(nodes,root,index) {
 const node=await nodes.node(root);if(node.type==='value')return node.value[index];if(node.type==='array')return node.refs[index]?nodes.value(node.refs[index]):undefined;
 if(node.type==='concat'){for(let at=0;at<node.refs.length;at++){const child=node.refs[at];let length=node.counts?.[at];if(length===undefined){const page=await nodes.node(child);length=page.type==='value'?page.value.length:page.type==='array'?page.refs.length:null;}if(length===null){const records=await nodes.value(child);if(index<records.length)return records[index];index-=records.length;}else if(index<length)return arrayItem(nodes,child,index);else index-=length;}return undefined;}throw failure('STORAGE_CORRUPT','인물 기록 형식이 맞지 않습니다.');
}
async function records(root,request) {
 const nodes=reader(root);if(!Number.isSafeInteger(request.count)||request.count<0||request.count>1000000)throw failure('STORAGE_INVALID_OPERATION','인물 기록 개수를 확인하지 못했습니다.');if(request.schemaVersion!==2)throw failure('STORAGE_SCHEMA_UNSUPPORTED','인물 저장 형식이 맞지 않습니다.');
 if(request.all){const records=await nodes.value(request.root);return {records,indices:records.map((_,index)=>index)};}
 if(Number.isSafeInteger(request.offset)&&request.offset>=0){const end=Math.min(request.count,request.offset+50),indices=[],records=[];let omittedCount=0,used=0,next=end;for(let index=request.offset;index<end;index++){const record=await arrayItem(nodes,request.root,index);if(!record)throw failure('STORAGE_PART_MISSING','인물 기록 일부가 없습니다.');const size=Buffer.byteLength(JSON.stringify(record));if(request.purpose==='embedding'&&size>1048576)throw failure('CHARACTER_RECORD_TOO_LARGE','한 기록이 너무 길어 임베딩할 수 없습니다. 원본은 그대로 보관됩니다.');if(request.purpose==='embedding'&&used+size>1048576&&records.length){next=index;break;}used+=size;if(request.purpose!=='embedding'&&size>65536){omittedCount++;continue;}indices.push(index);records.push(record);}return {records,indices,omittedCount,nextOffset:next<request.count?next:null};}
 await nodes.node(request.root);const fallback=async()=>{const indices=(request.anchors||[]).filter(index=>Number.isInteger(index)&&index>=0&&index<request.count).slice(0,20),records=[];for(const index of indices)records.push(await arrayItem(nodes,request.root,index));return {records,indices,status:'fallback',code:'CHARACTER_INDEX_UNAVAILABLE'};};const rank=new Map();try{await nodes.node(request.indexRoot);
 for(const index of (request.anchors||[]).slice(0,20))rank.set(index,4);
 for(const term of (request.terms||[]).slice(0,24)){const hits=await nodes.select(request.indexRoot,[term]);for(const index of (hits||[]).slice(0,256))rank.set(index,(rank.get(index)||0)+3);}
 for(const hash of (request.hashes||[]).slice(0,16)){const hits=await nodes.select(request.indexRoot,['_hash:'+hash]);for(const index of hits||[])rank.set(index,(rank.get(index)||0)+16);}
 for(const type of ['core','boundary','knowledge','relationship','value','expression'])for(const index of (await nodes.select(request.indexRoot,['_type:'+type])||[]).slice(0,4))rank.set(index,(rank.get(index)||0)+2);
 }catch(error){if(!['STORAGE_PART_MISSING','STORAGE_CORRUPT'].includes(error.code))throw error;return fallback();}
 const indices=[...new Set([...(request.anchors||[]).slice(0,12),...[...rank].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,180).map(([index])=>index)])].filter(index=>Number.isInteger(index)&&index>=0&&index<request.count);
 const records=[],kept=[];let used=0,omittedCount=0;for(const index of indices){const record=await arrayItem(nodes,request.root,index);if(!record)throw failure('STORAGE_PART_MISSING','인물 기록 일부가 없습니다.');const size=Buffer.byteLength(JSON.stringify(record));if(size>65536||used+size>1048576){omittedCount++;continue;}used+=size;records.push(record);kept.push(index);}return {records,indices:kept,omittedCount};
}
module.exports={records,arrayItem};
