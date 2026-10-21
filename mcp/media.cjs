'use strict';
const fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
const ROOT=path.resolve(__dirname,'..');
const BUNDLED=path.join(ROOT,'../backend');
const FFMPEG=process.env.CUTLINE_FFMPEG_BINARY||[path.join(ROOT,'tools/ffmpeg'),path.join(BUNDLED,'tools/ffmpeg'),'/Applications/Cutline Studio.app/Contents/Resources/backend/tools/ffmpeg'].find(p=>sync.existsSync(p))||'ffmpeg';
const FROZEN_WORKER=process.env.CUTLINE_MEDIA_WORKER||[path.join(BUNDLED,'cutline-backend')].find(p=>sync.existsSync(p));
for(const [key,name] of [['CUTLINE_WHISPER_BINARY','whisper-cli'],['CUTLINE_WHISPER_MODEL','ggml-large-v3-turbo-q5_0.bin']]){const file=path.join(BUNDLED,'tools',name);if(!process.env[key]&&sync.existsSync(file))process.env[key]=file;}
const PYTHON=process.env.CUTLINE_PYTHON||(process.platform==='darwin'?'/usr/bin/python3':'python3');
function processRun(binary,args,{input,signal,maxBytes=256*1024*1024,timeout=240000}={}){
 return new Promise((resolve,reject)=>{
  const detached=process.platform!=='win32'&&!process.env.CUTLINE_APP_WORKER;const child=spawn(binary,args,{stdio:['pipe','pipe','pipe'],signal,detached,env:{...process.env,CUTLINE_FFMPEG_BINARY:FFMPEG}});let chunks=[],bytes=0,errors='',failure;
  const killGroup=()=>{if(child.pid&&detached){try{process.kill(-child.pid,'SIGKILL');}catch{}}else child.kill('SIGKILL');};const abort=()=>killGroup();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{failure=new Error('Media operation timed out.');killGroup();},timeout);timer.unref();
  child.on('error',error=>{clearTimeout(timer);reject(error);});child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){failure=new Error('Decoded media exceeds the memory limit; use a shorter selection.');killGroup();}else chunks.push(chunk);});
  child.stderr.on('data',data=>errors=(errors+data).slice(-16000));child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(failure||code){const error=failure||new Error(errors||'Media process failed.');error.output=Buffer.concat(chunks);reject(error);}else resolve({data:Buffer.concat(chunks),errors});});child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
async function worker(request,signal){try{const result=await processRun(FROZEN_WORKER||PYTHON,FROZEN_WORKER?['--media-worker']:[path.join(__dirname,'media_worker.py')],{input:JSON.stringify(request),signal,timeout:request.action==='transcribe'?1250000:245000,maxBytes:8*1024*1024});return JSON.parse(result.data.toString());}catch(error){if(signal?.aborted)throw new Error('Cancelled');let report;try{report=JSON.parse(error.output?.toString()||'{}');}catch{}if(report?.error)throw new Error(report.error);throw error;}}
async function probeImage(file){const image=await loadImage(await fs.readFile(file));if(image.width*image.height>32000000)throw new Error('Image exceeds 32 megapixels.');return {duration:5,width:image.width,height:image.height,hasVideo:true,hasAudio:false};}

const scans=new Map();
async function scan(file,signal){const stat=await fs.stat(file),key=file+':'+stat.size+':'+stat.mtimeMs;if(!scans.has(key)){const result=await worker({action:'scan',path:file},signal);if(scans.size>32)scans.clear();scans.set(key,result);}return scans.get(key);}
async function probe(file,signal){
 let errors='';try{await processRun(FFMPEG,['-hide_banner','-nostdin','-i',file],{signal});}catch(error){errors=error.message;}
 const hasVideo=/Stream .*Video:/.test(errors),hasAudio=/Stream .*Audio:/.test(errors),stamp=errors.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
 if(!hasVideo&&!hasAudio)throw new Error('No supported audio or video stream in this file.');
 const duration=stamp?Number(stamp[1])*3600+Number(stamp[2])*60+Number(stamp[3]):0;
 let width=0,height=0;if(hasVideo){const frame=await processRun(FFMPEG,['-v','error','-nostdin','-i',file,'-map','0:v:0','-frames:v','1','-f','image2pipe','-c:v','png','-'],{signal,maxBytes:80*1024*1024});const image=await loadImage(frame.data);width=image.width;height=image.height;}
 return {duration,width,height,hasVideo,hasAudio};
}
async function decodeAudio(asset,clip,{signal,rate=16000}={}){
 const result=await processRun(FFMPEG,['-v','error','-nostdin','-i',asset.path,'-af',`atrim=start=${clip.in||0}:duration=${clip.duration*(clip.speed||1)},asetpts=PTS-STARTPTS`,'-vn','-ac','2','-ar',String(rate),'-f','f32le','-'],{signal});
 const count=Math.floor(result.data.length/8),channels=[new Float32Array(count),new Float32Array(count)];for(let i=0;i<count;i++){channels[0][i]=result.data.readFloatLE(i*8);channels[1][i]=result.data.readFloatLE(i*8+4);}
 return {sampleRate:rate,length:count,numberOfChannels:2,getChannelData:index=>channels[index]};
}
class Decoder{
 constructor(asset,clip,offset=0,signal){
  this.asset=asset;this.clip=clip;this.offset=offset;this.index=-1;this.last=null;this.chunks=[];this.length=0;this.done=false;this.error=null;this.waiting=null;this.bytes=asset.width*asset.height*4;
  if(this.bytes>128*1024*1024)throw new Error('Source resolution is too large.');
  const args=['-v','error','-nostdin','-i',asset.path,'-map','0:v:0','-an','-vf',`trim=start=${(clip.in||0)+offset*(clip.speed||1)},setpts=(PTS-STARTPTS)/${clip.speed||1},fps=30`,'-t',String(clip.duration-offset+.1),'-f','rawvideo','-pix_fmt','rgba','-'];
  this.child=spawn(FFMPEG,args,{stdio:['ignore','pipe','pipe'],signal});let errors='';this.child.stderr.on('data',data=>errors=(errors+data).slice(-4000));
  this.child.on('error',error=>{this.error=error;this.done=true;this.wake();});this.child.stdout.on('data',chunk=>{this.chunks.push(chunk);this.length+=chunk.length;if(this.length>=this.bytes*2)this.child.stdout.pause();this.wake();});this.child.stdout.on('end',()=>{this.done=true;this.wake();});this.child.on('close',code=>{if(code)this.error=new Error(errors||'Video decoder stopped.');this.done=true;this.wake();});
 }
 wake(){if(this.waiting){this.waiting();this.waiting=null;}}
 async take(){
  while(this.length<this.bytes&&!this.done){this.child.stdout.resume();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.waiting=null;this.close();reject(new Error('Video decoder stalled.'));},30000);this.waiting=()=>{clearTimeout(timer);resolve();};});}
  if(this.length<this.bytes)throw this.error||new Error('Source ended before the requested frame. Replace or shorten this clip; no frozen frame was substituted.');
  const frame=Buffer.allocUnsafe(this.bytes);let position=0;while(position<frame.length){const chunk=this.chunks[0],n=Math.min(chunk.length,frame.length-position);chunk.copy(frame,position,0,n);position+=n;this.length-=n;if(n===chunk.length)this.chunks.shift();else this.chunks[0]=chunk.subarray(n);}
  if(this.length<this.bytes*2)this.child.stdout.resume();return frame;
 }
 async frame(local){const target=Math.max(0,Math.floor((local-this.offset)*30+1e-6));while(this.index<target){const raw=await this.take();if(!this.canvas)this.canvas=createCanvas(this.asset.width,this.asset.height);const ctx=this.canvas.getContext('2d'),image=ctx.createImageData(this.asset.width,this.asset.height);image.data.set(raw);ctx.putImageData(image,0,0);this.last=this.canvas;this.index++;}return this.last;}
 close(){this.child.stdout.destroy();this.child.kill('SIGKILL');this.done=true;this.wake();}
}
module.exports={ROOT,FFMPEG,PYTHON,processRun,worker,scan,probe,probeImage,decodeAudio,Decoder};
