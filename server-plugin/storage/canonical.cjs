const {hash}=require('./paths.cjs');
function canonical(value){if(Array.isArray(value))return '['+value.map(item=>canonical(item??null)).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
module.exports={canonical,digest:value=>hash(canonical(value))};
