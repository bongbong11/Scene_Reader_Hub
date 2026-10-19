#!/usr/bin/env node
// Download and verify all files before replacing this plugin only.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const BASE='https://raw.githubusercontent.com/bongbong11/Scene_Reader_Hub/main/';
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');

async function download(url,max=2_000_000){
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`Download failed (${response.status}).`);
    const chunks=[];let length=0;
    for await(const chunk of response.body){length+=chunk.length;if(length>max)throw new Error('Download is too large.');chunks.push(chunk);}
    return Buffer.concat(chunks);
}
async function exists(file){try{await fs.access(file);return true;}catch{return false;}}
async function findRoot(explicit){
    for(const candidate of explicit?[explicit]:[process.cwd(),path.join(os.homedir(),'SillyTavern')]){
        const root=path.resolve(candidate);
        try{const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));if(String(pkg.name).toLowerCase()==='sillytavern'&&await exists(path.join(root,'server.js')))return await fs.realpath(root);}catch{/* Try the next known location. */}
    }
    throw new Error('SillyTavern folder not found. Run from that folder, or add its path after the command.');
}
function validateManifest(manifest){
    if(manifest.name!=='scene-reader-jev-plugin'||!/^\d+\.\d+\.\d+$/.test(manifest.version)||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>128)throw new Error('Invalid plugin manifest.');
    const names=new Set();let total=0;
    for(const file of manifest.files){
        if(typeof file.path!=='string'||!/^([a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(file.path)||file.path.split('/').some(part=>part==='.'||part==='..')||names.has(file.path.toLowerCase())||!/^[a-f0-9]{64}$/.test(file.sha256)||!Number.isInteger(file.bytes)||file.bytes<1||file.bytes>2_000_000)throw new Error('Invalid plugin file.');
        names.add(file.path.toLowerCase());total+=file.bytes;
    }
    if(total>8_000_000||!names.has('index.cjs')||!names.has('package.json'))throw new Error('Incomplete plugin manifest.');
}
async function safeDirectory(root,relative){
    let current=root;
    for(const part of relative.split('/')){
        current=path.resolve(current,part);
        if(!current.startsWith(root+path.sep))throw new Error('Invalid installation path.');
        try{const stat=await fs.lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Installation directory must not be a link or file.');}
        catch(error){if(error.code==='ENOENT')await fs.mkdir(current);else throw error;}
    }
    return current;
}
async function install({root,manifest,getFile,check=true}){
    root=await fs.realpath(root);validateManifest(manifest);
    const plugins=await safeDirectory(root,'plugins');
    const backups=await safeDirectory(root,'backups/scene-reader-plugin');
    const lockPath=path.join(backups,'update.lock');
    let lock;
    try{lock=await fs.open(lockPath,'wx');}catch(error){if(error.code==='EEXIST')throw new Error('Another update is running, or was interrupted. Check backups/scene-reader-plugin/update.lock before retrying.');throw error;}
    try{return await replacePlugin({plugins,backups,manifest,getFile,check});}
    finally{await lock.close();await fs.unlink(lockPath);}
}
async function replacePlugin({plugins,backups,manifest,getFile,check}){
    const target=path.resolve(plugins,'scene-reader-jev');
    if(!target.startsWith(plugins+path.sep))throw new Error('Invalid plugin target.');
    const previous=await exists(target);
    if(previous){
        const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Plugin folder must not be a link.');
        const pkg=JSON.parse(await fs.readFile(path.join(target,'package.json'),'utf8'));
        if(pkg.name!=='scene-reader-jev-plugin')throw new Error('This folder is not the Scene Reader plugin.');
    }
    const staging=await fs.mkdtemp(path.join(backups,'prepared-'));
    let cursor=0;
    const jobs=await Promise.allSettled(Array.from({length:4},async()=>{
        while(cursor<manifest.files.length){
            const file=manifest.files[cursor++],data=await getFile(file.path);
            if(data.length!==file.bytes||sha(data)!==file.sha256)throw new Error(`File verification failed: ${file.path}. Existing plugin kept.`);
            const dest=path.resolve(staging,...file.path.split('/'));
            if(!dest.startsWith(staging+path.sep))throw new Error('Invalid staging path.');
            await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,data,{flag:'wx'});
        }
    }));
    const failed=jobs.find(job=>job.status==='rejected');if(failed)throw failed.reason;
    const pkg=JSON.parse(await fs.readFile(path.join(staging,'package.json'),'utf8'));
    if(pkg.name!==manifest.name||pkg.version!==manifest.version)throw new Error('Plugin version mismatch. Existing plugin kept.');
    if(check)for(const file of manifest.files.filter(file=>/\.(?:cjs|mjs|js)$/.test(file.path))){
        const result=spawnSync(process.execPath,['--check',path.join(staging,file.path)],{windowsHide:true,stdio:'pipe'});
        if(result.status!==0)throw new Error(`Plugin syntax check failed: ${file.path}. Existing plugin kept.`);
    }
    const backup=path.join(backups,`previous-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
    if(previous)await fs.rename(target,backup);
    try{await fs.rename(staging,target);}catch(error){if(previous)await fs.rename(backup,target);throw error;}
    return {version:manifest.version,backup:previous?backup:null};
}
async function main(){
    const root=await findRoot(process.argv[2]);
    console.log('Preparing Scene Reader plugin update. Saved data and keys are preserved.');
    const manifest=JSON.parse(await download(`${BASE}downloads/plugin-manifest.json`,100000));
    const result=await install({root,manifest,getFile:file=>download(`${BASE}server-plugin/${file}`)});
    console.log(`Installed Scene Reader plugin ${result.version}.`);
    if(result.backup)console.log(`Previous plugin: ${result.backup}`);
    console.log('Restart SillyTavern to load this version. This tool does not stop or start your server.');
}
if(require.main===module)main().catch(error=>{console.error(`Update stopped: ${error.message}`);process.exitCode=1;});
module.exports={findRoot,validateManifest,install};
