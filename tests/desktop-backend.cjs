const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {Backend,health}=require('../desktop/backend.cjs');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cutline-desktop-test-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const script=path.join(directory,'engine');fs.writeFileSync(script,'#!'+process.execPath+'\n'+`const http=require('node:http');const port=Number(process.argv.at(-1));http.createServer((req,res)=>{res.end('Cutline Studio local editor v1');}).listen(port,'127.0.0.1',()=>console.log('Cutline Studio is ready: http://127.0.0.1:'+port));`);fs.chmodSync(script,0o755);
 const backend=new Backend({binary:script,cwd:directory,stateDir:directory,ffmpeg:script,port});
 try{const url=await backend.start();assert.equal(await health(url),true);const first=backend.child.pid;const recovered=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Recovery timed out')),10000);backend.once('ready',()=>{clearTimeout(timer);resolve();});});backend.child.kill('SIGKILL');await recovered;assert.notEqual(backend.child.pid,first);assert.equal(await health(url),true);
  const reuse=new Backend({binary:script,cwd:directory,stateDir:directory,ffmpeg:script,port});assert.equal(await reuse.start(),url);assert.equal(reuse.child,null);reuse.stop();assert.equal(await health(url),true,'reused engines are not killed by another app owner');
  const cancelled=new Backend({binary:script,cwd:directory,stateDir:directory,ffmpeg:script,port});const startup=cancelled.start();cancelled.stop();await assert.rejects(startup,/cancelled/);assert.equal(cancelled.child,null,'quitting during discovery must not launch an orphan engine');
  console.log('PASS: bundled backend startup, health verification, crash recovery at same origin and safe reuse ownership');
 }finally{backend.stop();fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
