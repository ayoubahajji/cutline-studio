// Run with the release's own Node. No system Python, npm, cache, or FFmpeg required.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const app=path.resolve(process.argv[2]||'.desktop-build/Cutline Studio.app'),resources=path.join(app,'Contents/Resources'),runtime=path.join(resources,'mcp-runtime');
const {Client}=require(path.join(runtime,'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/index.js'));
const {StdioClientTransport}=require(path.join(runtime,'node_modules/@modelcontextprotocol/sdk/dist/cjs/client/stdio.js'));
function run(binary,args,input,env){return new Promise((resolve,reject)=>{const p=spawn(binary,args,{env,stdio:['pipe','pipe','pipe']});let out='',error='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>error=(error+b).slice(-8000));p.on('error',reject);p.on('close',code=>code?reject(Error(error||out)):resolve(out));p.stdin.on('error',()=>{});p.stdin.end(input);});}
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'cutline-fresh-install-')),env={HOME:path.join(temp,'home'),TMPDIR:temp,PATH:'/nonexistent',CUTLINE_MCP_HOME:path.join(temp,'state')};await fs.mkdir(env.HOME);
 const client=new Client({name:'clean-install-qa',version:'1.0.0'}),transport=new StdioClientTransport({command:path.join(runtime,'bin/node'),args:[path.join(runtime,'mcp/server.cjs')],env});
 const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,r.content?.[0]?.text);return r.structuredContent||JSON.parse(r.content[0].text);};
 try{
  const binary=path.join(resources,'backend/cutline-backend');
  const caps=JSON.parse(await run(binary,['--media-worker'],JSON.stringify({action:'capabilities'}),env));assert.equal(caps.transcription,true);assert.ok(caps.ffmpeg.startsWith(resources));
  await client.connect(transport);assert.equal((await client.listTools()).tools.length,28);const mcpCaps=await call('cutline_capabilities');assert.equal(mcpCaps.headless,true);
  const source=path.join(temp,'fixture.mp4');await run(path.join(resources,'backend/tools/ffmpeg'),['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source],null,env);
  let p=await call('cutline_project_create',{name:'Fresh installation QA',ratio:'16:9'}),projectId=p.id;
  p=await call('cutline_media_import',{projectId,expectedRevision:p.revision,path:source});const assetId=p.result.asset.id;
  p=await call('cutline_project_edit',{projectId,expectedRevision:p.revision,operations:[{type:'add',assetId,start:0,duration:2},{type:'text',text:'Bonjour !',start:0,duration:1.8}]});
  assert.equal((await call('cutline_source_check',{projectId})).ok,true);
  const preview=await client.callTool({name:'cutline_preview',arguments:{projectId,time:.5,height:180}});assert.ok(!preview.isError);assert.equal(preview.content[1].type,'image');
  const job=(await call('cutline_render',{projectId,height:180})).jobId;let result;
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){const j=await call('cutline_job',{jobId:job});if(j.status==='done'){result=j.result;break;}if(['failed','cancelled'].includes(j.status))throw Error(j.error||j.status);await new Promise(r=>setTimeout(r,100));}
  assert.equal(result?.frames,60);const check=JSON.parse(await run(binary,['--media-worker'],JSON.stringify({action:'scan',path:result.path}),env));assert.equal(check.frames,60);
  if(process.argv[3]){const speech=path.resolve(process.argv[3]);const transcript=JSON.parse(await run(binary,['--media-worker'],JSON.stringify({action:'transcribe',path:speech,language:'en'}),env));assert.match(transcript.srt,/\d\d:\d\d:\d\d[,\.]\d+/);assert.ok(transcript.srt.length>100,'real speech must produce timed text');console.log('PASS: bundled Whisper transcribed real speech with fresh HOME and no developer tools');}
  console.log('PASS: release-owned Node, frozen Python worker, FFmpeg, local model, 28-tool MCP handshake, import, edits, captions, PNG preview and verified 60-frame MP4 in a clean environment');
 }finally{await client.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
