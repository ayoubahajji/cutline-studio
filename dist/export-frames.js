/* Wait for a decoded source frame, rather than recording wall-clock playback. */
(function(root){
'use strict';
function abortError(){const error=new Error('Export cancelled.');error.name='AbortError';return error;}
function seekFrame(el,time,{signal,timeout=15000}={}){
 return new Promise((resolve,reject)=>{
  let timer,started=false;
  const events=['loadedmetadata','loadeddata','seeked','error'];
  function cleanup(){clearTimeout(timer);events.forEach(type=>el.removeEventListener(type,check));signal?.removeEventListener('abort',abort);}
  function done(error){cleanup();error?reject(error):resolve();}
  function abort(){done(abortError());}
  function check(){
   if(signal?.aborted)return abort();
   if(el.error)return done(new Error('A source video could not be decoded. Re-import that file and try again.'));
   if(el.readyState<1)return;
   if(!started){started=true;if(Math.abs(el.currentTime-time)>.00001){try{el.currentTime=time;}catch(e){done(e);}return;}}
   if(!el.seeking&&el.readyState>=2&&Math.abs(el.currentTime-time)<.025)done();
  }
  el.pause();events.forEach(type=>el.addEventListener(type,check));signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>done(new Error('A video frame took too long to decode. Export stopped instead of saving a frozen video.')),timeout);check();
 });
}
async function packet(blobs){const parts=[];for(const blob of blobs){const header=new DataView(new ArrayBuffer(4));header.setUint32(0,blob.size);parts.push(header.buffer,blob);}return new Blob(parts,{type:'application/octet-stream'});}
const api={seekFrame,packet};if(typeof module!=='undefined')module.exports=api;else root.CutlineExportFrames=api;
})(globalThis);
