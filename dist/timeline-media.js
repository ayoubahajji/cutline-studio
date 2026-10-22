/* Source-derived, HiDPI timeline media. Painting never changes clips or input handlers. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CutlineTimelineMedia=api;if(typeof document!=='undefined'&&typeof renderTimeline==='function')api.install();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const BUCKET=32,peaks=new WeakMap();
 const finite=value=>Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
 function buildPeaks(buffer){
  if(!buffer||!buffer.length||!buffer.sampleRate)throw Error('A decoded audio buffer is required.');
  const channels=[],count=Math.min(8,buffer.numberOfChannels||1);let maximum=0;
  for(let ch=0;ch<count;ch++){const samples=buffer.getChannelData(ch),size=Math.ceil(samples.length/BUCKET),low=new Float32Array(size),high=new Float32Array(size);for(let k=0;k<size;k++){let min=1,max=-1;for(let i=k*BUCKET;i<Math.min(samples.length,(k+1)*BUCKET);i++){const value=finite(samples[i]);min=Math.min(min,value);max=Math.max(max,value);maximum=Math.max(maximum,Math.abs(value));}low[k]=min;high[k]=max;}const levels=[{low,high}];while(levels.at(-1).low.length>1){const previous=levels.at(-1),length=Math.ceil(previous.low.length/2),lo=new Float32Array(length),hi=new Float32Array(length);for(let i=0;i<length;i++){lo[i]=Math.min(previous.low[i*2],previous.low[i*2+1]??previous.low[i*2]);hi[i]=Math.max(previous.high[i*2],previous.high[i*2+1]??previous.high[i*2]);}levels.push({low:lo,high:hi});}channels.push({samples,levels});}
  return {sampleRate:buffer.sampleRate,length:buffer.length,channels,maximum};
 }
 function cache(buffer){let value=peaks.get(buffer);if(!value){value=buildPeaks(buffer);peaks.set(buffer,value);}return value;}
 function query(record,channel,from,to){
  const data=record.channels[Math.min(channel,record.channels.length-1)],samples=data.samples;let left=Math.max(0,Math.min(samples.length,Math.floor(from))),right=Math.max(left,Math.min(samples.length,Math.ceil(to))),min=1,max=-1,seen=false;const add=value=>{min=Math.min(min,value);max=Math.max(max,value);seen=true;};
  while(left<right&&left%BUCKET)add(finite(samples[left++]));while(right>left&&right%BUCKET)add(finite(samples[--right]));let start=Math.floor(left/BUCKET),end=Math.floor(right/BUCKET),level=0;
  while(start<end){const block=data.levels[level];if(start%2){add(block.low[start]);add(block.high[start++]);}if(end%2){end--;add(block.low[end]);add(block.high[end]);}start=Math.floor(start/2);end=Math.floor(end/2);level++;}
  return seen?{min,max}:{min:0,max:0};
 }
 function envelope(clip,local){return Math.max(0,Math.min(1,clip.fadeIn>0?local/clip.fadeIn:1,clip.fadeOut>0?(clip.duration-local)/clip.fadeOut:1));}
 function waveformColumns(buffer,clip,width,{from=0,to=clip.duration,normalize=true}={}){
  const record=cache(buffer),columns=Math.max(1,Math.floor(width)),channels=Math.min(2,record.channels.length),result=Array.from({length:channels},()=>[]),gain=normalize?.91/Math.max(.015,record.maximum):1,span=Math.max(0,to-from),speed=clip.speed||1;
  for(let x=0;x<columns;x++){const left=from+span*x/columns,right=from+span*(x+1)/columns,first=((clip.in||0)+left*speed)*record.sampleRate,last=((clip.in||0)+right*speed)*record.sampleRate,fade=envelope(clip,(left+right)/2);for(let ch=0;ch<channels;ch++){const value=query(record,ch,first,last);result[ch].push({min:value.min*gain*fade,max:value.max*gain*fade,sourcePeak:Math.max(Math.abs(value.min),Math.abs(value.max))});}}
  return {channels:result,sourceMaximum:record.maximum,displayGain:gain,from,to};
 }
 function visibleWindow(clip,zoom,scrollLeft,viewportWidth,padding=8){const total=Math.max(1,clip.duration*zoom),left=Math.max(0,scrollLeft-clip.start*zoom-padding),right=Math.min(total,scrollLeft+viewportWidth-clip.start*zoom+padding);return right>left?{left,right,width:right-left,from:left/zoom,to:Math.min(clip.duration,right/zoom)}:null;}
 function filmstripPlan(clip,asset,zoom,scrollLeft,viewportWidth,height=50){
  const visible=visibleWindow(clip,zoom,scrollLeft,viewportWidth,0);if(!visible)return [];const ratio=(asset.width||16)/(asset.height||9),tile=Math.max(28,Math.min(132,height*ratio)),first=Math.floor(visible.left/tile),last=Math.ceil(visible.right/tile),items=[];
  for(let index=first;index<last&&items.length<48;index++){const left=index*tile,width=Math.min(tile,clip.duration*zoom-left),local=(left+width/2)/zoom,time=Math.max(0,Math.min(Math.max(0,(asset.duration||0)-1/30),(clip.in||0)+local*(clip.speed||1)));items.push({left,width,time,height});}return items;
 }
 function install(){
  if(install.done)return;install.done=true;const scroll=document.querySelector('#timeline-scroll');if(!scroll)return;
  document.body.classList.add('media-timeline-v2');const frameCache=new Map(),queue=[],failed=new Map(),decoders=new Map();let capturing=false,paintQueued=false;
  const dpr=()=>Math.max(1,Math.min(2.5,window.devicePixelRatio||1));
  function paint(target,clip,buffer){
   if(!target?.getContext||!buffer)return;const inClip=target.closest?.('.clip'),desk=target.id==='desk-canvas';let width,height,range={from:0,to:clip.duration};
   if(inClip){const visible=visibleWindow(clip,zoom,scroll.scrollLeft,scroll.clientWidth||1000);if(!visible){target.style.display='none';return;}target.style.display='block';target.style.left=(visible.left+4)+'px';width=Math.max(1,visible.width-8);height=Math.max(24,Math.min(46,(parseFloat(inClip.style.height)||60)-24));target.style.width=width+'px';target.style.height=height+'px';range=visible;}
   else{width=target.parentElement?.clientWidth||target.clientWidth||target.width||900;height=desk?(target.parentElement?.clientHeight||96):(target.clientHeight||target.height||100);target.style.width='100%';target.style.height='100%';}
   const ratio=dpr();target.width=Math.max(1,Math.min(4096,Math.round(width*ratio)));target.height=Math.max(1,Math.round(height*ratio));const ctx=target.getContext('2d');if(!ctx)return;ctx.setTransform?.(target.width/width,0,0,target.height/height,0,0);ctx.clearRect(0,0,width,height);const data=waveformColumns(buffer,clip,Math.ceil(width/1.8),range),laneHeight=height/data.channels.length;
   target.dataset.waveChannels=String(data.channels.length);target.dataset.sourceFrom=String((clip.in||0)+range.from*(clip.speed||1));target.dataset.sourceTo=String((clip.in||0)+range.to*(clip.speed||1));target.title='Source waveform · display normalized; volume '+(clip.volume??100)+'%';
   for(let channel=0;channel<data.channels.length;channel++){const values=data.channels[channel],center=laneHeight*(channel+.5),amplitude=laneHeight*.43;ctx.fillStyle=channel===0?'#6aead5':'#82b9ff';ctx.globalAlpha=clip.audioMuted?.35:1;for(let x=0;x<values.length;x++){const v=values[x],top=center-Math.max(0,v.max)*amplitude,bottom=center-Math.min(0,v.min)*amplitude;ctx.fillRect(x*width/values.length,Math.min(top,bottom),Math.max(.9,width/values.length-.5),Math.max(.75,Math.abs(bottom-top)));}ctx.globalAlpha=1;ctx.fillStyle='#c7f9ed21';ctx.fillRect(0,Math.round(center),width,.5);if(desk){ctx.fillStyle='#b3cbd5';ctx.font='9px -apple-system, sans-serif';ctx.fillText(data.channels.length===1?'MONO':channel===0?'L':'R',7,laneHeight*channel+11);}}
  }
  drawWaveform=paint;
  function queueFrame(asset,item,node,holder){
   const stamp=item.time,key=asset.id+':'+stamp.toFixed(4);node.dataset.sourceTime=String(item.time);const cached=frameCache.get(key);if(cached){node.src=cached;return;}
   if(asset.type==='image'){if(asset.url||asset.thumb)node.src=asset.url||asset.thumb;return;}
   if(!asset.blob||!asset.url||typeof HTMLVideoElement==='undefined'||!('requestVideoFrameCallback'in HTMLVideoElement.prototype))return;
   if((failed.get(key)||0)>Date.now()||(failed.get('asset:'+asset.id)||0)>Date.now())return;queue.push({asset,time:stamp,key,node,holder});pump();
  }
  function event(video,name){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>finish(Error('Thumbnail unavailable')),5000);const done=()=>finish(),error=()=>finish(Error('Thumbnail decode failed'));function finish(e){clearTimeout(timer);video.removeEventListener(name,done);video.removeEventListener('error',error);e?reject(e):resolve();}video.addEventListener(name,done,{once:true});video.addEventListener('error',error,{once:true});});}
  function closeDecoder(record){record.video.pause();record.video.removeAttribute('src');record.video.load();}
  async function capture(task){
   let record=decoders.get(task.asset.id);if(record&&record.url!==task.asset.url){closeDecoder(record);decoders.delete(task.asset.id);record=null;}
   if(!record){const video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;video.src=task.asset.url;record={video,url:task.asset.url};decoders.set(task.asset.id,record);while(decoders.size>2){const first=decoders.keys().next().value;closeDecoder(decoders.get(first));decoders.delete(first);}}
   const video=record.video;if(video.readyState<2)await event(video,'loadeddata');const time=Math.min(Math.max(0,(video.duration||task.asset.duration)-1/30),task.time);if(Math.abs(video.currentTime-time)>.001){const seeked=event(video,'seeked');video.currentTime=time;await seeked;}if(video.readyState<2)throw Error('Thumbnail has no decoded frame.');const canvas=document.createElement('canvas'),ratio=(task.asset.width||video.videoWidth)/(task.asset.height||video.videoHeight);canvas.height=80;canvas.width=Math.max(28,Math.min(180,Math.round(80*ratio)));const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.75);
  }
  async function pump(){if(capturing)return;capturing=true;try{while(queue.length){const task=queue.shift();if((failed.get('asset:'+task.asset.id)||0)>Date.now())continue;if(!task.node.isConnected||frameCache.has(task.key)){if(frameCache.has(task.key))task.node.src=frameCache.get(task.key);continue;}try{const image=await capture(task);frameCache.set(task.key,image);while(frameCache.size>180)frameCache.delete(frameCache.keys().next().value);if(task.node.isConnected)task.node.src=image;}catch{failed.set(task.key,Date.now()+30000);failed.set('asset:'+task.asset.id,Date.now()+30000);const record=decoders.get(task.asset.id);if(record){closeDecoder(record);decoders.delete(task.asset.id);}task.holder?.classList.add('filmstrip-unavailable');}}}finally{capturing=false;}}
  function decorate(){
   for(const [id,record]of decoders)if(!assets.has(id)){closeDecoder(record);decoders.delete(id);}
   for(const clip of project.clips){const el=document.querySelector('[data-clip="'+clip.id+'"]'),asset=assets.get(clip.assetId);if(!el||!asset)continue;
    if(clip.track==='audio'){
     el.classList.add('media-audio-clip');el.classList.toggle('audio-is-muted',!!clip.audioMuted||!!project.muted.audio);const role=clip.audioRole==='voice'?'VOICE':clip.audioRole==='music'?'MUSIC':'AUDIO';el.dataset.audioRole=clip.audioRole||'other';const title=el.querySelector('.clip-title');if(title)title.textContent=clip.name;
     let badge=el.querySelector('.clip-audio-meta');if(!badge){badge=document.createElement('span');badge.className='clip-audio-meta';el.append(badge);}badge.textContent=role+' · '+(clip.audioMuted?'Muted':(clip.volume??100)+'%');
     const canvas=el.querySelector('.real-waveform');if(canvas&&asset.audioBuffer)paint(canvas,clip,asset.audioBuffer);
    }
    if(['video','overlay'].includes(clip.track)&&['video','image'].includes(asset.type)){
     el.classList.add('media-visual-clip');const holder=el.querySelector('.clip-thumbs');if(!holder)continue;const signature=[clip.in,clip.duration,clip.speed,zoom,Math.round(scroll.scrollLeft),scroll.clientWidth,asset.id].join(':');if(holder.dataset.mediaSignature===signature)continue;holder.dataset.mediaSignature=signature;holder.classList.add('scene-filmstrip');holder.replaceChildren();const height=Math.max(30,(parseFloat(el.style.height)||el.clientHeight||58)-20),items=filmstripPlan(clip,asset,zoom,scroll.scrollLeft,scroll.clientWidth||1000,height);
     for(const item of items){const image=document.createElement('img');image.draggable=false;image.alt='';image.className='scene-thumbnail';image.style.left=item.left+'px';image.style.width=item.width+'px';if(asset.thumb)image.src=asset.thumb;holder.append(image);queueFrame(asset,item,image,holder);}
    }
   }
   const desk=document.querySelector('#desk-canvas'),clip=typeof deskClip==='function'?deskClip():null;if(desk&&clip&&!document.querySelector('#audio-desk')?.hidden){const asset=assets.get(clip.assetId);if(asset?.audioBuffer)paint(desk,clip,asset.audioBuffer);let label=document.querySelector('#desk-media-info');if(!label){label=document.createElement('span');label.id='desk-media-info';label.className='desk-media-info';document.querySelector('#audio-desk header>div')?.append(label);}label.textContent=asset?.audioBuffer?(asset.audioBuffer.numberOfChannels===1?'Mono':'Stereo')+' · '+Math.round(asset.audioBuffer.sampleRate/100)/10+' kHz':'';}
  }
  const previousTimeline=renderTimeline;renderTimeline=function(){const result=previousTimeline.apply(this,arguments);decorate();return result;};
  function requestPaint(){if(paintQueued)return;paintQueued=true;const callback=()=>{paintQueued=false;decorate();};if(typeof requestAnimationFrame==='function')requestAnimationFrame(callback);else setTimeout(callback,0);}
  scroll.addEventListener('scroll',requestPaint,{passive:true});window.addEventListener('resize',requestPaint);if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(requestPaint);observer.observe(scroll);const desk=document.querySelector('#desk-wave');if(desk)observer.observe(desk);}
  window.addEventListener('beforeunload',()=>{for(const record of decoders.values())closeDecoder(record);decoders.clear();});
  install.decorate=decorate;install.requestPaint=requestPaint;
 }
 return {buildPeaks,query,waveformColumns,visibleWindow,filmstripPlan,install,invalidate:buffer=>peaks.delete(buffer)};
});
