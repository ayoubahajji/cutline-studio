'use strict';
const {spawn}=require('node:child_process');
const http=require('node:http');
const {EventEmitter}=require('node:events');
const MARKER='Cutline Studio local editor v1';
function health(url){return new Promise(resolve=>{const request=http.get(url+'/__cutline_health__',response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve(response.statusCode===200&&body===MARKER));});request.setTimeout(500,()=>request.destroy());request.on('error',()=>resolve(false));});}
class Backend extends EventEmitter{
 constructor({binary,cwd,stateDir,ffmpeg,port=4178,log=()=>{}}){super();Object.assign(this,{binary,cwd,stateDir,ffmpeg,port,log});this.child=null;this.url=null;this.stopping=false;this.pending=null;this.timer=null;this.poll=null;this.failures=0;}
 async start(){if(this.pending)return this.pending;this.stopping=false;this.pending=this.connect().finally(()=>this.pending=null);return this.pending;}
 async connect(){
  for(let port=this.port;port<this.port+21;port++){const url='http://127.0.0.1:'+port;if(await health(url)){if(this.stopping)throw new Error('Engine startup cancelled.');this.url=url;this.port=port;this.watch();this.emit('ready',url);return url;}}
  if(this.stopping)throw new Error('Engine startup cancelled.');
  return new Promise((resolve,reject)=>{
   this.log('Starting bundled engine');const child=spawn(this.binary,['--port',String(this.port)],{cwd:this.cwd,env:{...process.env,CUTLINE_STATE_DIR:this.stateDir,CUTLINE_FFMPEG_BINARY:this.ffmpeg,PYTHONUNBUFFERED:'1'},stdio:['ignore','pipe','pipe']});this.child=child;let buffer='',ready=false;
   const timeout=setTimeout(()=>{child.kill();reject(new Error('The local engine did not become ready.'));},20000);
   child.stdout.on('data',async data=>{this.log(data.toString());buffer=(buffer+data).slice(-5000);const match=buffer.match(/Cutline Studio is ready: (http:\/\/127\.0\.0\.1:(\d+))/);if(match&&!ready&&await health(match[1])){if(this.stopping){clearTimeout(timeout);child.kill();reject(new Error('Engine startup cancelled.'));return;}ready=true;clearTimeout(timeout);this.url=match[1];this.port=Number(match[2]);this.failures=0;this.watch();this.emit('ready',this.url);resolve(this.url);}});
   child.stderr.on('data',data=>this.log(data.toString()));child.on('error',error=>{clearTimeout(timeout);reject(error);});
   child.on('exit',(code,signal)=>{clearTimeout(timeout);if(this.child===child)this.child=null;this.log('Engine exited: '+code+' '+signal);if(!ready)reject(new Error('The local engine could not start.'));if(!this.stopping)this.recover();});
  });
 }
 recover(){if(this.stopping||this.timer)return;this.emit('recovering');this.timer=setTimeout(()=>{this.timer=null;this.start().catch(error=>{this.log(error.message);this.recover();});},Math.min(5000,1000*(1+this.failures++)));}
 watch(){if(this.poll)return;let checking=false;this.poll=setInterval(async()=>{if(checking||this.stopping||this.pending||!this.url)return;checking=true;try{if(!await health(this.url)){if(this.child)this.child.kill();this.recover();}}finally{checking=false;}},2000);}
 stop(){this.stopping=true;clearTimeout(this.timer);clearInterval(this.poll);this.timer=null;this.poll=null;if(this.child){this.child.kill();this.child=null;}}
}
module.exports={Backend,health};
