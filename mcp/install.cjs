#!/usr/bin/env node
// Install a runtime independently of this source checkout; register only Cutline's MCP entry.
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {Store,id}=require('./store.cjs'),{FFMPEG,ROOT}=require('./media.cjs');
async function main(){
 const store=new Store();await store.init();const runtime=path.join(store.root,'runtime'),stage=path.join(store.root,'runtime-next-'+id()),backup=path.join(store.root,'runtime-previous');await fs.mkdir(stage,{mode:0o700});
 try{
  for(const folder of ['mcp','dist','tools','bin'])await fs.mkdir(path.join(stage,folder));
  for(const name of await fs.readdir(__dirname))if(/\.(cjs|py|md)$/.test(name))await fs.copyFile(path.join(__dirname,name),path.join(stage,'mcp',name));
  for(const name of ['editor-model.js','editing-workflows.js','frame-geometry.js','audio-editing.js','source-check.js'])await fs.copyFile(path.join(ROOT,'dist',name),path.join(stage,'dist',name));
  for(const name of ['video_export.py','transcription.py','LICENSE','THIRD_PARTY.md','package.json','package-lock.json'])await fs.copyFile(path.join(ROOT,name),path.join(stage,name));
  await fs.copyFile(process.execPath,path.join(stage,'bin/node'));await fs.chmod(path.join(stage,'bin/node'),0o755);const nodeLicense=path.resolve(path.dirname(process.execPath),'../LICENSE');try{await fs.copyFile(nodeLicense,path.join(stage,'NODE-LICENSE.txt'));}catch{}
  let binary=FFMPEG;if(!path.isAbsolute(binary)){binary=(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,binary)).find(file=>require('node:fs').existsSync(file));}if(!binary)throw new Error('FFmpeg is required to install Cutline MCP.');await fs.copyFile(binary,path.join(stage,'tools/ffmpeg'));await fs.chmod(path.join(stage,'tools/ffmpeg'),0o755);const license=spawnSync(binary,['-L'],{encoding:'utf8'});await fs.writeFile(path.join(stage,'tools/FFMPEG-LICENSE.txt'),(license.stdout||'')+(license.stderr||''));
  const result=spawnSync('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{cwd:stage,stdio:'inherit'});if(result.status!==0)throw new Error('Installing MCP dependencies failed.');
  const smoke=spawnSync(path.join(stage,'bin/node'),['-e',"require('./mcp/tools.cjs').createTools(); console.log('Runtime ready')"],{cwd:stage,stdio:'inherit'});if(smoke.status!==0)throw new Error('Runtime smoke check failed.');
  await fs.rm(backup,{recursive:true,force:true});try{await fs.rename(runtime,backup);}catch(error){if(error.code!=='ENOENT')throw error;}await fs.rename(stage,runtime);
  const args=['mcp','add','cutline_studio','--env','CUTLINE_FFMPEG_BINARY='+path.join(runtime,'tools/ffmpeg'),'--',path.join(runtime,'bin/node'),path.join(runtime,'mcp/server.cjs')];
  if(process.argv.includes('--no-register'))console.log('Runtime installed. Register with: codex '+args.map(value=>JSON.stringify(value)).join(' '));
  else{const registered=spawnSync('codex',args,{stdio:'inherit'});if(registered.status!==0)throw new Error('Runtime installed, but Codex registration failed. Run codex mcp add for '+runtime);}
  console.log('Installed Cutline MCP:',runtime);
 }finally{await fs.rm(stage,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
