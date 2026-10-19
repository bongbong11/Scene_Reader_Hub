const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createRequire} = require('node:module');
const crypto = require('node:crypto');
const unsupported = () => Object.assign(new Error('Shared retrieval is unavailable on this host.'), {code:'SHARED_RETRIEVAL_UNSUPPORTED',status:501});

// Use the host's embedding functions and model-scoped Vectra indexes. Never
// patch the host router or proxy a caller-supplied URL/API credential.
async function loadHost(root) {
    const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
    if(String(pkg.name).toLowerCase()!=='sillytavern')throw unsupported();
    const hostRequire=createRequire(path.join(root,'package.json'));
    const vectra=hostRequire('vectra'),sanitize=hostRequire('sanitize-filename');
    const vectraPackage=JSON.parse(await fs.readFile(path.join(path.dirname(hostRequire.resolve('vectra')),'../package.json'),'utf8'));
    if(!/^0\.2\./.test(vectraPackage.version))throw unsupported();
    const load=relative=>import(pathToFileURL(path.join(root,'src',relative)).href);
    const [util,secrets]=await Promise.all([load('util.js'),load('endpoints/secrets.js')]);
    if(typeof vectra.LocalIndex!=='function'||typeof util.getConfigValue!=='function'||typeof secrets.readSecret!=='function')throw unsupported();
    const providers={};
    for(const [source,file,fn] of [['transformers','embedding.js','getTransformersVector'],['palm','google-vectors.js','getMakerSuiteVector'],['vertexai','google-vectors.js','getVertexVector'],['nanogpt','openai-vectors.js','getOpenAIVector']]){
        try{const module=await load(`vectors/${file}`);if(typeof module[fn]==='function')providers[source]=module[fn];}catch{/* Older hosts may support only some providers. */}
    }
    return {
        sources:Object.keys(providers),
        async prepare(request) {
            const body=request.body,source=body.source,embed=providers[source];
            if(!embed)throw unsupported();
            const model=source==='transformers'?String(util.getConfigValue('extensions.models.embedding','')):body.model;
            if(typeof model!=='string'||model.length>200||(!model&&source!=='transformers'))throw unsupported();
            const directories=request.user.directories;
            const secretNames={palm:['MAKERSUITE'],vertexai:['VERTEXAI','VERTEXAI_SERVICE_ACCOUNT'],nanogpt:['NANOGPT']}[source]||[];
            if(secretNames.some(key=>!secrets.SECRET_KEYS[key]))throw unsupported();
            const credentials=secretNames.map(key=>secrets.readSecret(directories,secrets.SECRET_KEYS[key])||'');
            const authHash=crypto.createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
            const scope=[source,model,body.vertexai_auth_mode,body.vertexai_region,body.vertexai_express_project_id,authHash];
            const base=path.resolve(directories.vectors);
            const folder=path.resolve(base,sanitize(source),sanitize(body.collectionId),sanitize(model));
            if(!folder.startsWith(base+path.sep))throw unsupported();
            // Resolve every existing component, rejecting symlink escapes.
            const realBase=await fs.realpath(base);
            let current=base;
            for(const component of path.relative(base,folder).split(path.sep)){
                current=path.join(current,component);
                try{if((await fs.lstat(current)).isSymbolicLink())throw unsupported();}catch(error){if(error.code==='ENOENT')break;throw error;}
            }
            const index=new vectra.LocalIndex(folder);
            if(!await index.isIndexCreated())throw Object.assign(new Error('Embedding index is not ready.'),{code:'EMBEDDING_INDEX_MISSING',status:409});
            if(!(await fs.realpath(folder)).startsWith(realBase+path.sep))throw unsupported();
            return {scope, async embed(text){
                if(source==='transformers')return embed(text);
                if(source==='nanogpt')return embed(text,source,directories,model);
                return embed(text,model,request);
            },async query(vector,topK,threshold){
                const items=await index.listItems();
                if(items.some(item=>!Array.isArray(item.vector)||item.vector.length!==vector.length))throw Object.assign(new Error('Embedding dimensions do not match. Rebuild this index.'),{code:'EMBEDDING_DIMENSION_MISMATCH',status:409});
                const hits=await index.queryItems(vector,topK);
                const metadata=hits.filter(hit=>hit.score>=threshold).map(hit=>({hash:hit.item.metadata.hash,index:hit.item.metadata.index}));
                return {metadata,hashes:metadata.map(item=>Number(item.hash))};
            }};
        },
    };
}
async function discoverHost(){
    for(const root of [...new Set([process.cwd(),path.resolve(__dirname,'../../..')])]){
        try{return await loadHost(root);}catch{/* Plugin loading and storage must survive unsupported hosts. */}
    }
    return {sources:[],prepare:async()=>{throw unsupported();}};
}
module.exports={loadHost,discoverHost};
