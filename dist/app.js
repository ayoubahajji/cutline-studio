'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const icons = {
 media:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m9 8 7 4-7 4Z"/>', audio:'<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="17" cy="16" rx="3" ry="3"/>',text:'<path d="M4 6V4h16v2M12 4v16M8 20h8"/>',effects:'<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"/>',export:'<path d="M12 16V3m-5 5 5-5 5 5M4 14v6h16v-6"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',previous:'<path d="M6 5v14m12-14-9 7 9 7Z"/>',next:'<path d="M18 5v14M6 5l9 7-9 7Z"/>',play:'<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none"/>',pause:'<path d="M8 5v14m8-14v14" stroke-width="4"/>',undo:'<path d="m8 4-5 5 5 5M3 9h11a7 7 0 0 1 0 14" transform="translate(0 -2)"/>',redo:'<path d="m16 4 5 5-5 5m5-5H10a7 7 0 0 0 0 14" transform="translate(0 -2)"/>',scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 21 3"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',fit:'<path d="M3 5v14m18-14v14M7 12h10m-7-3-3 3 3 3m4-6 3 3-3 3"/>',layers:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',volume:'<path d="M3 9h4l5-5v16l-5-5H3Zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16"/>',plus:'<path d="M12 4v16M4 12h16"/>',upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>'};
const ico = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.media}</svg>`;
function paintIcons(root=document){$$('[data-icon]',root).forEach(el=>el.innerHTML=ico(el.dataset.icon));}
paintIcons();
const uid=()=>crypto.randomUUID();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc = str=>String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=t=>`${String(Math.floor(Math.max(0,t)/60)).padStart(2,'0')}:${(Math.max(0,t)%60).toFixed(1).padStart(4,'0')}`;
const canvas=$('#preview'),ctx=canvas.getContext('2d',{alpha:false});
const assets=new Map(), media=new Map();
let project={version:1,name:'Beyond the ordinary',ratio:'16:9',clips:[],muted:{text:false,video:false,audio:false}};
let selected=null,tab='media',playhead=1.1,playing=false,zoom=55,lastTick=0,exporting=false,saveTimer,toastTimer,db;
// Selection is transient UI state; the primary clip keeps existing single-clip tools compatible.
let selectedIds=new Set(),selectionPrimary=null;
function getSelectionIds(){
 if(selected!==selectionPrimary){selectedIds=new Set(selected?[selected]:[]);selectionPrimary=selected;}
 const valid=new Set(project.clips.map(c=>c.id));selectedIds=new Set([...selectedIds].filter(id=>valid.has(id)));
 return [...selectedIds];
}
function setSelection(ids,primary){selectedIds=new Set(ids);selected=primary&&selectedIds.has(primary)?primary:[...selectedIds].at(-1)||null;selectionPrimary=selected;}
let localSaveRevision=0;
let past=[],future=[],lastSavePromise=Promise.resolve(), audioContext,audioDestination,recorder,exportCancelled=false;
const duration=()=>Math.max(0,...project.clips.map(c=>c.start+c.duration));
const current=()=>project.clips.find(c=>c.id===selected);
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3600);}
function snapshot(){return JSON.stringify(project);}
function checkpoint(){past.push(snapshot());if(past.length>80)past.shift();future=[];}
function commit(){renderTimeline();renderInspector();updateControls();scheduleSave();}
function changed(){checkpoint();}
function undo(){if(exporting||!past.length)return;future.push(snapshot());project=JSON.parse(past.pop());selected=project.clips.some(c=>c.id===selected)?selected:null;stop();renderAll();scheduleSave();}
function redo(){if(exporting||!future.length)return;past.push(snapshot());project=JSON.parse(future.pop());selected=project.clips.some(c=>c.id===selected)?selected:null;stop();renderAll();scheduleSave();}
function defaultClip(asset,start){return {id:uid(),assetId:asset.id,name:asset.name,track:asset.type==='audio'?'audio':'video',start,duration:asset.type==='image'?5:asset.duration,in:0,speed:1,scale:100,x:0,y:0,rotation:0,opacity:100,volume:100,brightness:100,contrast:100,saturation:100,filter:'none',motion:asset.demo?3:0};}
function landscape(scene){
 const palettes={coast:['#8ba4a8','#c6d0bb','#dacdb0','#466668','#243f43'],dunes:['#c2b49f','#e7d5b7','#d6ae82','#a96f50','#684b42'],mountains:['#9caea9','#d4d8bc','#a8b39a','#5b7b6a','#2c4b44']};
 const p=palettes[scene];let forms='';
 if(scene==='coast')forms='<path fill="#607e7f" d="M0 500Q500 370 930 470T1920 400V1080H0Z"/><path fill="#a0b5af" d="M0 740Q400 530 820 650T1920 530V1080H0Z"/><path fill="#e7dec1" d="M0 1080V820Q320 630 630 680T1250 850L1920 1080Z"/><path fill="#c6bfa6" d="M0 1080V945Q350 770 630 810T1400 1080Z"/><path d="M700 680Q1100 785 1670 790" fill="none" stroke="#e8efdd" stroke-width="8" opacity=".45"/>';
 if(scene==='dunes')forms='<path fill="#cc9f75" d="M0 740Q450 420 1150 650L1920 1000V1080H0Z"/><path fill="#e3c49a" d="M0 1080Q610 550 1920 740V1080Z"/><path fill="#b98a66" d="M0 1080Q900 650 1920 900V1080Z"/><path fill="#dfb98e" d="M100 1080Q1100 810 1920 970V1080Z"/>';
 if(scene==='mountains')forms='<path fill="#90a28e" d="m0 700 350-320 300 230 390-420 470 510 410-260v640H0Z"/><path fill="#5c7b69" d="m0 920 400-420 400 310 480-510 640 500v280H0Z"/><path fill="#284d44" d="m0 1080 440-310 600 220 440-400 440 280v210Z"/><path fill="#c6cbaa" opacity=".5" d="m1040 190-110 120 120-35 90 25Z"/>';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient><filter id="grain"><feTurbulence baseFrequency=".7" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".1"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter></defs><rect width="1920" height="1080" fill="url(#sky)"/><circle cx="1420" cy="280" r="112" fill="#f1e6c8" opacity=".9"/>${forms}<rect width="1920" height="1080" fill="transparent" filter="url(#grain)" opacity=".32"/></svg>`;
}
async function makeDemoAssets(){
 for(const [id,name,scene] of [['demo-coast','01 · The quiet coast','coast'],['demo-dunes','02 · Chasing the light','dunes'],['demo-mountains','03 · A little further','mountains']]){
  const blob=new Blob([landscape(scene)],{type:'image/svg+xml'});await registerAsset({id,name,type:'image',duration:5,blob,demo:true});
 }
}
async function registerAsset(record){
 if(assets.has(record.id))return assets.get(record.id);
 const a={...record,url:URL.createObjectURL(record.blob)};
 if(a.type==='image'){
  a.image=new Image();a.image.src=a.url;await a.image.decode();a.width=a.image.naturalWidth;a.height=a.image.naturalHeight;a.thumb=a.url;
 }else{
  const el=document.createElement(a.type==='audio'?'audio':'video');el.preload='auto';el.src=a.url;el.playsInline=true;
  await new Promise((resolve,reject)=>{el.onloadedmetadata=resolve;el.onerror=()=>reject(new Error(`Could not read ${record.name}`));setTimeout(()=>reject(new Error('This file could not be decoded')),15000);});
  if(!Number.isFinite(el.duration)||el.duration<=0)throw new Error('This media has no readable duration');
  a.duration=el.duration;a.width=el.videoWidth;a.height=el.videoHeight;
  if(a.type==='video'){
   try{await new Promise(resolve=>{el.onseeked=resolve;el.currentTime=Math.min(.1,a.duration/2);setTimeout(resolve,1500);});const thumb=document.createElement('canvas');thumb.width=240;thumb.height=135;thumb.getContext('2d').drawImage(el,0,0,240,135);a.thumb=thumb.toDataURL('image/jpeg',.6);}catch{}
  }el.src='';el.load();
 }
 assets.set(a.id,a);return a;
}
async function importFiles(files){
 if(exporting)return [];const imported=[];let added=0;
 for(const file of files){
  const type=CutlineInteractions.mediaType(file);
  if(!type){toast(`Unsupported file: ${file.name}`);continue;}
  try{const asset=await registerAsset({id:uid(),name:file.name,type,blob:file});imported.push(asset);added++;}catch(e){toast(e.message);}
 }
 if(added){tab='media';renderLibrary();scheduleSave();toast(`${added} file${added>1?'s':''} imported. Drag a thumbnail onto the timeline to place it.`);}
 $('#file-input').value='';return imported;
}
function addAsset(id,at){
 if(exporting)return;const a=assets.get(id);if(!a)return;checkpoint();
 const track=a.type==='audio'?'audio':'video';const start=at??Math.max(0,...project.clips.filter(c=>c.track===track).map(c=>c.start+c.duration));
 const c=defaultClip(a,start);project.clips.push(c);selected=c.id;playhead=c.start;commit();return c;
}
function addText(style='title'){
 if(exporting)return;checkpoint();const presets={title:{text:'YOUR STORY\nSTARTS HERE',fontSize:108,y:0,fontWeight:800},subtitle:{text:'A moment worth keeping.',fontSize:52,y:30,fontWeight:500},label:{text:'SOMEWHERE, SOMEDAY',fontSize:32,y:-34,fontWeight:600}};
 const c={id:uid(),track:'text',name:'Text',start:playhead,duration:Math.min(4,Math.max(2,duration()-playhead)),...presets[style],color:'#ffffff',opacity:100,x:0,shadow:true};project.clips.push(c);selected=c.id;commit();
}
function renderLibrary(){
 $$('#library-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 $('#library-title').textContent={media:'Your media',audio:'The soundtrack',text:'Say something',effects:'Set the mood'}[tab];
 $('#media-count').textContent=tab==='media'?`${assets.size} assets`:'Creative tools';
 const root=$('#library-content');
 if(tab==='media'){
  root.innerHTML=`<button id="import-media" class="import-button">${ico('upload')} Import media</button><p class="drop-note">Drop video, photos, or audio here</p><div class="section-label">Project assets <span style="float:right">${assets.size}</span></div><div class="asset-grid">${[...assets.values()].map(a=>`<button class="asset" data-asset="${a.id}" draggable="true" title="Add ${esc(a.name)} to timeline"><div class="thumb">${a.thumb?`<img src="${a.thumb}" alt="" draggable="false">`:`<div class="audio-placeholder">${ico('audio')}</div>`}<span class="asset-time">${a.type==='image'?'PHOTO':time(a.duration)}</span><span class="add-asset">+</span></div><span class="asset-name">${esc(a.name)}</span></button>`).join('')}</div><p class="tip">Your story, your pace.<br>Drag an asset onto the timeline, or click to add it. Drag timeline clips to move them; pull their edges to trim.</p>`;
  $('#import-media').onclick=()=>$('#file-input').click();
  $$('[data-asset]',root).forEach(el=>{el.onclick=()=>addAsset(el.dataset.asset);el.ondragstart=e=>e.dataTransfer.setData('application/cutline-asset',el.dataset.asset);});
 }else if(tab==='text'){
  root.innerHTML=`<button class="import-button" id="add-text">${ico('plus')} Add text</button><div class="section-label">Start with a style</div><button class="text-preset" data-preset="title"><strong style="font-weight:850;letter-spacing:-1px">MAKE IT MATTER.</strong><small>THE BOLD TITLE</small></button><button class="text-preset" data-preset="subtitle"><strong style="font-size:17px;font-weight:400">A moment worth keeping.</strong><small>THE SIMPLE SUBTITLE</small></button><button class="text-preset" data-preset="label"><strong style="font-size:11px;letter-spacing:3px">SOMEWHERE, SOMEDAY</strong><small>THE LITTLE DETAIL</small></button><p class="tip">Select a text clip to edit its words, size, position, and color in the properties panel.</p>`;
  $('#add-text').onclick=()=>addText();$$('[data-preset]',root).forEach(b=>b.onclick=()=>addText(b.dataset.preset));
 }else if(tab==='audio'){
  root.innerHTML=`<button id="import-audio" class="import-button">${ico('upload')} Import audio</button><div class="section-label">Original sound beds</div><button class="audio-item" data-tone="ambient"><span>${ico('audio')}</span><span>Soft horizon<small>Ambient · 15 seconds</small></span><span class="add">+</span></button><button class="audio-item" data-tone="pulse"><span>${ico('audio')}</span><span>A little momentum<small>Electronic · 15 seconds</small></span><span class="add">+</span></button><p class="tip">These sound beds are generated on your device. Import your own music for something more personal.</p>`;
  $('#import-audio').onclick=()=>$('#file-input').click();$$('[data-tone]',root).forEach(b=>b.onclick=()=>addTone(b.dataset.tone));
 }else{
  const active=current()?.filter||'none';root.innerHTML=`<p class="drop-note" style="text-align:left">Choose a video clip, then try a look.</p><div class="effect-grid">${[['none','◯','Original'],['warm','☀','Golden hour'],['cool','◈','Cool tone'],['mono','◑','Monochrome'],['vintage','◉','Vintage'],['vivid','✦','Vivid']].map(([key,sym,name])=>`<button class="effect-card ${active===key?'active':''}" data-effect="${key}"><span>${sym}</span>${name}</button>`).join('')}</div><p class="tip">Looks are applied to the selected clip. Fine-tune brightness, contrast, and saturation in properties.</p>`;
  $$('[data-effect]',root).forEach(b=>b.onclick=()=>{const c=current();if(!c||!['video','overlay'].includes(c.track))return toast('Select a video or photo clip first.');checkpoint();c.filter=b.dataset.effect;commit();renderLibrary();});
 }
}
function renderTimeline(){
 const total=duration();const width=Math.max(($('#timeline-scroll').clientWidth||800)-1,(total+3)*zoom);
 $('#track-area').style.width=`${width}px`;let ticks='';const step=zoom>=50?1:zoom>=20?2:zoom>=8?5:15;
 for(let i=0;i<=width/zoom;i+=step){ticks+=`<span class="tick" style="left:${i*zoom}px">${time(i).slice(0,-2)}</span>`;if(zoom>=45)ticks+=`<span class="tick minor" style="left:${(i+.5)*zoom}px"></span>`;}
 $('#ruler').innerHTML=ticks;
 for(const track of ['text','video','audio']){
  const clips=project.clips.filter(c=>c.track===track);const lanes=[];const laneMap=new Map();if(track==='text'){for(const c of [...clips].sort((a,b)=>a.start-b.start)){let lane=lanes.findIndex(end=>end<=c.start);if(lane<0)lane=lanes.length;lanes[lane]=c.start+c.duration;laneMap.set(c.id,lane);}}const textHeight=Math.max(50,lanes.length*23+8);if(track==='text'){$('#text-track').style.height=textHeight+'px';$('.track-labels .track-label').style.height=textHeight+'px';$('#track-area').style.height=(32+textHeight+$('.video-track').offsetHeight+$('.audio-track').offsetHeight)+'px';}const root=$(`#${track}-track`);root.style.opacity=project.muted[track]?.4:1;
  root.innerHTML=clips.map(c=>{
   const a=assets.get(c.assetId),w=c.duration*zoom;
   let inner=track==='video'?`<div class="clip-thumbs">${a?.thumb?Array.from({length:Math.min(40,Math.max(1,Math.ceil(w/95)))},()=>`<img draggable="false" src="${a.thumb}" alt="">`).join(''):''}</div><span class="clip-title">${esc(c.name)}</span>`:track==='text'?`${ico('text')}<span>${esc(c.text.replace(/\n/g,' '))}</span>`:`<div class="wave">${Array.from({length:Math.min(600,Math.ceil(w/4))},(_,i)=>`<i style="height:${5+Math.abs(Math.sin(i*2.3)*Math.cos(i*.19))*20}px"></i>`).join('')}</div><span class="clip-title">♫ ${esc(c.name)}</span>`;
   return `<div class="clip ${track} ${selected===c.id?'selected':''}" data-clip="${c.id}" style="left:${c.start*zoom}px;width:${Math.max(10,w)}px;${track==='text'?`top:${4+laneMap.get(c.id)*23}px;`:""}" title="${esc(c.name)} · ${time(c.duration)}"><i class="trim-handle left" data-edge="left"></i>${inner}<i class="trim-handle right" data-edge="right"></i></div>`;
  }).join('')+(!clips.length?`<span class="track-placeholder">${track==='text'?'+ Add a title to tell your story':track==='audio'?'Drop audio here, or choose a sound bed':'Drop your media here'}</span>`:'');
 }
 $('#selection-info').textContent=`${project.clips.filter(c=>c.track==='video').length} visual clips · ${total.toFixed(1)} seconds`;
 updatePlayhead();
}
function field(label,key,val,min,max,step=1,suffix=''){return `<label class="field">${label}<input data-prop="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"><output>${Number(val).toFixed(step<1?1:0)}${suffix}</output></label>`;}
function numField(label,key,val,min=0,max=99999,step=.1){return `<label class="field">${label}<input data-prop="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${Number(val).toFixed(step<1?2:0)}"></label>`;}
function renderInspector(){
 const c=current(),root=$('#inspector-content');$('#inspector-tab').textContent=c?{text:'Text',video:'Video',audio:'Audio'}[c.track]:'Project';
 if(!c){root.innerHTML=`<div class="inspector-section"><h3>Your canvas</h3><label class="field">Aspect ratio<select id="project-ratio">${['16:9','9:16','1:1','4:5'].map(r=>`<option ${r===project.ratio?'selected':''}>${r}</option>`).join('')}</select></label><p class="tip">Select a clip in the timeline to make it yours.</p></div><div class="inspector-section"><h3>Project details</h3><label class="field">Duration <span>${time(duration())}</span></label><label class="field">Media assets <span>${assets.size}</span></label><label class="field">Storage <span>On this device</span></label></div>`;$('#project-ratio').onchange=e=>setRatio(e.target.value);return;}
 let html=`<div class="inspector-section"><h3>${c.track==='text'?'Your words':'Selected clip'}</h3>${c.track==='text'?`<textarea id="text-value" aria-label="Text content">${esc(c.text)}</textarea>`:`<div class="clip-name" title="${esc(c.name)}">${esc(c.name)}</div>`}</div>`;
 if(c.track==='video')html+=`<div class="inspector-section"><h3>Transform <button id="reset-transform">Reset ↺</button></h3>${field('Scale','scale',c.scale,5,600,1,'%')}${numField('Position X','x',c.x,-100,100,1)}${numField('Position Y','y',c.y,-100,100,1)}${numField('Rotate °','rotation',c.rotation,-180,180,1)}${field('Opacity','opacity',c.opacity,0,100,1,'%')}${field('Slow zoom','motion',c.motion,0,20,1,'%')}</div><div class="inspector-section"><h3>Adjust</h3>${field('Brightness','brightness',c.brightness,0,200)}${field('Contrast','contrast',c.contrast,0,200)}${field('Saturation','saturation',c.saturation,0,200)}</div>`;
 if(c.track==='text')html+=`<div class="inspector-section"><h3>Style</h3>${field('Font size','fontSize',c.fontSize,16,200)}<label class="field">Weight<select data-prop="fontWeight">${[[400,'Regular'],[600,'Semibold'],[800,'Bold']].map(([v,l])=>`<option value="${v}" ${c.fontWeight===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field">Color<input data-prop="color" type="color" value="${c.color}"></label>${numField('Position X','x',c.x,-100,100,1)}${numField('Position Y','y',c.y,-100,100,1)}${field('Opacity','opacity',c.opacity,0,100,1,'%')}</div>`;
 html+=`<div class="inspector-section"><h3>Timing</h3>${numField('Start · seconds','start',c.start)}${numField('Duration · seconds','duration',c.duration,.1)}${c.assetId&&assets.get(c.assetId)?.type!=='image'?`${numField('Source in · seconds','in',c.in)}<label class="field">Speed<select data-prop="speed">${[.25,.5,.75,1,1.25,1.5,2,4].map(v=>`<option value="${v}" ${c.speed===v?'selected':''}>${v}×</option>`).join('')}</select></label>`:''}</div>`;
 if(c.track==='audio'||assets.get(c.assetId)?.type==='video')html+=`<div class="inspector-section"><h3>Audio</h3>${field('Volume','volume',c.volume,0,100,1,'%')}</div>`;
 root.innerHTML=html;
 const inputText=$('#text-value');if(inputText){inputText.onfocus=checkpoint;inputText.oninput=()=>{c.text=inputText.value;c.name=c.text.slice(0,32)||'Text';renderTimeline();scheduleSave();};}
 $$('[data-prop]',root).forEach(el=>{
  el.onfocus=()=>{el.dataset.original=el.value;};
  el.onpointerdown=()=>{el.dataset.original=el.value;};
  el.oninput=()=>{
   if(exporting||el.value==='')return;
   if(!el.dataset.editing){checkpoint();el.dataset.editing='1';}
   const key=el.dataset.prop;let value=key==='color'?el.value:Number(el.value);if(key!=='color'&&!Number.isFinite(value))return;
   const a=assets.get(c.assetId);
   if(key==='start')value=Math.max(0,value);
   if(key==='duration')value=clamp(value,.1,a&&a.type!=='image'?(a.duration-c.in)/c.speed:3600);
   if(key==='in')value=clamp(value,0,Math.max(0,(a?.duration||0)-c.duration*c.speed));
   if(key==='speed'){if(value<=0)return;Object.assign(c,CutlineModel.retimeClip(c,value));}
   c[key]=value;
   const out=el.nextElementSibling;if(out?.tagName==='OUTPUT')out.textContent=`${value}${['opacity','volume','scale','motion'].includes(key)?'%':''}`;
   renderTimeline();updateControls();scheduleSave();
  };
  el.onchange=()=>{delete el.dataset.editing;renderInspector();};
 });
 if($('#reset-transform'))$('#reset-transform').onclick=()=>{checkpoint();Object.assign(c,{scale:100,x:0,y:0,rotation:0,opacity:100,motion:0});commit();};
}
function setRatio(value){if(exporting)return;checkpoint();project.ratio=value;resizeCanvas();renderInspector();scheduleSave();}
function resizeCanvas(height=1080){const [w,h]=project.ratio.split(':').map(Number);canvas.height=height;canvas.width=Math.round(height*w/h/2)*2;$('#canvas-size').textContent=`${canvas.width} × ${canvas.height}`;$('#ratio-button').innerHTML=`${project.ratio} <span>⌄</span>`;}
function updateControls(){
 $('#current-time').textContent=time(playhead);$('#total-time').textContent=time(duration());$('#undo').disabled=!past.length;$('#redo').disabled=!future.length;
 for(const id of ['split','duplicate','delete'])$('#'+id).disabled=!current()||exporting;
 $('#play').innerHTML=ico(playing?'pause':'play');$('#play').setAttribute('aria-label',playing?'Pause':'Play');
 $('#export').disabled=exporting||duration()<=0;
}
function updatePlayhead(){playhead=clamp(playhead,0,Math.max(0,duration()));$('#playhead').style.left=playhead*zoom+'px';$('#current-time').textContent=time(playhead);}
function renderAll(){resizeCanvas();$('#project-name').value=project.name;renderLibrary();renderTimeline();renderInspector();updateControls();}
function getMedia(c){
 let m=media.get(c.id);if(m)return m;const a=assets.get(c.assetId);if(!a||a.type==='image')return null;
 const el=document.createElement(a.type==='audio'?'audio':'video');el.src=a.url;el.preload='auto';el.playsInline=true;el.load();m={el,clipId:c.id};media.set(c.id,m);return m;
}
function initAudio(){
 if(!audioContext){audioContext=new AudioContext();audioDestination=audioContext.createMediaStreamDestination();}
 if(audioContext.state==='suspended')audioContext.resume();
 for(const c of project.clips){const m=getMedia(c);if(!m||m.source)continue;
  m.source=audioContext.createMediaElementSource(m.el);m.gain=audioContext.createGain();m.source.connect(m.gain);m.gain.connect(audioContext.destination);m.gain.connect(audioDestination);
 }
}
function syncMedia(){
 const activeVideo=project.clips.filter(c=>c.track==='video'&&playhead>=c.start&&playhead<c.start+c.duration).sort((a,b)=>a.start-b.start).at(-1);
 for(const c of project.clips){const a=assets.get(c.assetId);if(!a||a.type==='image')continue;const m=getMedia(c);const active=playhead>=c.start&&playhead<c.start+c.duration&&!project.muted[c.track]&&(c.track==='audio'||c===activeVideo);
  if(!active){if(!m.el.paused)m.el.pause();if(m.gain)m.gain.gain.value=0;continue;}
  const target=clamp(c.in+(playhead-c.start)*c.speed,0,Math.max(0,a.duration-.02));
  if(m.el.readyState>=1&&Math.abs(m.el.currentTime-target)>(playing?.2:.025)){try{m.el.currentTime=target;}catch{}}
  m.el.playbackRate=c.speed;
  const volume=project.muted.audio?0:c.volume/100;
  if(m.gain){m.gain.gain.value=volume;m.el.volume=1;}else m.el.volume=volume;
  if(playing&&m.el.paused&&!m.pending){m.pending=true;m.el.play().catch(()=>{}).finally(()=>m.pending=false);}
  else if(!playing&&!m.el.paused)m.el.pause();
 }
 for(const [id,m]of media){if(!project.clips.some(c=>c.id===id)){m.el.pause();m.source?.disconnect();m.gain?.disconnect();m.el.src='';media.delete(id);}}
}
function stop(){playing=false;lastTick=0;for(const m of media.values())m.el.pause();updateControls();}
function togglePlay(){if(exporting)return;if(playing)return stop();if(!duration())return;if(playhead>=duration()-.02)playhead=0;initAudio();playing=true;lastTick=performance.now();updateControls();}
const effectFilters={none:'',warm:'sepia(.22) saturate(1.15)',cool:'hue-rotate(12deg) saturate(.8)',mono:'grayscale(1)',vintage:'sepia(.5) contrast(.9)',vivid:'saturate(1.55) contrast(1.1)'};
function drawFrame(){
 const frameTime=Math.min(playhead,Math.max(0,duration()-.001));const W=canvas.width,H=canvas.height;ctx.fillStyle='#0d1014';ctx.fillRect(0,0,W,H);
 const active=project.clips.filter(c=>c.track==='video'&&frameTime>=c.start&&frameTime<c.start+c.duration).sort((a,b)=>a.start-b.start).at(-1);
 if(active&&!project.muted.video){
  const a=assets.get(active.assetId),m=media.get(active.id),src=a?.image||m?.el;
  if(src&&(a.type==='image'||src.readyState>=2)){
   const sw=a.width||W,sh=a.height||H;const base=Math.max(W/sw,H/sh),progress=(frameTime-active.start)/active.duration;const scale=base*(active.scale/100)*(1+(active.motion||0)/100*progress);
   ctx.save();ctx.globalAlpha=active.opacity/100;ctx.filter=`brightness(${active.brightness}%) contrast(${active.contrast}%) saturate(${active.saturation}%) ${effectFilters[active.filter]||''}`;
   ctx.translate(W/2+active.x/100*W,H/2+active.y/100*H);ctx.rotate(active.rotation*Math.PI/180);ctx.drawImage(src,-sw*scale/2,-sh*scale/2,sw*scale,sh*scale);ctx.restore();
  }
 }
 if(!project.muted.text){for(const c of project.clips.filter(c=>c.track==='text'&&frameTime>=c.start&&frameTime<c.start+c.duration)){
  ctx.save();const factor=H/1080;ctx.font=`${c.fontWeight} ${c.fontSize*factor}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c.color;ctx.globalAlpha=c.opacity/100;
  if(c.shadow){ctx.shadowColor='#071c2070';ctx.shadowBlur=12*factor;ctx.shadowOffsetY=3*factor;}
  const lines=c.text.split('\n');const lineHeight=c.fontSize*factor*1.06;const x=W/2+c.x/100*W,y=H/2+c.y/100*H;
  lines.forEach((line,i)=>ctx.fillText(line,x,y+(i-(lines.length-1)/2)*lineHeight,W*.9));ctx.restore();
 }}
 $('#empty-preview').hidden=project.clips.some(c=>c.track==='video');
}
function tick(now){
 if(typeof preciseExportActive!=='undefined'&&preciseExportActive){requestAnimationFrame(tick);return;}
 if(playing){if(lastTick)playhead+=(now-lastTick)/1000;lastTick=now;if(playhead>=duration()){playhead=duration();if(exporting){finishRecording();}stop();}updatePlayhead();
  if(!exporting){const scroll=$('#timeline-scroll');if(playhead*zoom>scroll.scrollLeft+scroll.clientWidth-20)scroll.scrollLeft=playhead*zoom-scroll.clientWidth/3;}
 }
 syncMedia();drawFrame();if(exporting&&!exportFinalizing){const pct=duration()?playhead/duration():0;$('#export-progress i').style.width=pct*100+'%';$('#export-progress span').textContent=`Rendering ${Math.floor(pct*100)}% · ${time(playhead)} / ${time(duration())}`;}
 requestAnimationFrame(tick);
}
function splitClip(){const c=current();if(!c||exporting)return;const point=playhead-c.start;if(point<.1||point>c.duration-.1)return toast('Place the playhead inside the selected clip to split it.');checkpoint();const pieces=CutlineModel.split(c,playhead);if(!pieces)return;const right={...pieces[1],id:uid()};Object.assign(c,pieces[0]);project.clips.push(right);selected=right.id;commit();}
function duplicateClip(){const c=current();if(!c||exporting)return;checkpoint();const dupe={...CutlineModel.clone(c),id:uid(),start:c.start+c.duration};project.clips.push(dupe);selected=dupe.id;commit();}
function deleteClip(){if(!current()||exporting)return;checkpoint();project.clips=project.clips.filter(c=>c.id!==selected);selected=null;commit();}
async function addTone(kind){
 const id='tone-'+kind;if(!assets.has(id)){
  const rate=22050,seconds=15,n=rate*seconds,buffer=new ArrayBuffer(44+n*2),view=new DataView(buffer);
  const str=(o,s)=>[...s].forEach((ch,i)=>view.setUint8(o+i,ch.charCodeAt(0)));str(0,'RIFF');view.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,n*2,true);
  const notes=kind==='ambient'?[130.81,164.81,196,261.63]:[110,146.83,164.81,220];
  for(let i=0;i<n;i++){const t=i/rate,fade=Math.min(1,t/1.5,(seconds-t)/2),pulse=kind==='pulse'?.35+.65*Math.exp(-(t%.5)*9):.8+.2*Math.sin(t*.8);let v=0;notes.forEach((f,j)=>v+=Math.sin(2*Math.PI*f*t)*(.065+.02*Math.sin(t*.5+j)));view.setInt16(44+i*2,clamp(v*fade*pulse,-1,1)*32767,true);}
  await registerAsset({id,name:kind==='ambient'?'Soft horizon':'A little momentum',type:'audio',blob:new Blob([buffer],{type:'audio/wav'})});
 }addAsset(id,0);renderLibrary();
}
async function openDatabase(){db=await new Promise((resolve,reject)=>{const request=indexedDB.open('cutline-studio',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function dbGet(key){return new Promise((resolve,reject)=>{const req=db.transaction('workspace').objectStore('workspace').get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function scheduleSave(){
 localSaveRevision++;$('#saved').innerHTML='<i></i> Saving…';$('#timeline-status').textContent='Saving changes…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{lastSavePromise=lastSavePromise.catch(()=>{}).then(saveLocal);},500);
}
async function saveLocal(){
 if(!db){$('#saved').textContent='Save project to keep changes';$('#timeline-status').textContent='Device storage unavailable';return false;}const revision=localSaveRevision;const records=[...assets.values()].map(({id,name,type,duration,blob,demo})=>({id,name,type,duration,blob,demo}));const data={project:JSON.parse(snapshot()),records};
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put(data,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});if(revision!==localSaveRevision)return false;$('#saved').innerHTML='<i></i> Saved on this device';$('#timeline-status').textContent='All changes saved';return true;}catch{toast('Local storage is full. Save a project file to keep your changes.');$('#saved').textContent='Download project to save';return false;}
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const slug=()=>project.name.replace(/[^a-z\d _-]/gi,'').trim()||'Untitled';
async function saveProject(){if(exporting)return;const savedProject=JSON.parse(snapshot()),savedName=slug(),savedAssets=[...assets.values()].map(a=>({...a}));toast('Preparing portable project…');try{const records=await Promise.all(savedAssets.map(async({id,name,type,duration,blob,demo})=>({id,name,type,duration,demo,data:await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(blob);})})));download(new Blob([JSON.stringify({format:'cutline',version:1,project:savedProject,assets:records})],{type:'application/json'}),savedName+'.cutline');toast('Project saved with all media included.');}catch(e){toast('Project save failed: '+e.message);}}
function validateProject(p,records){
 if(!p||!Array.isArray(p.clips)||p.clips.length>2000||!['16:9','9:16','1:1','4:5'].includes(p.ratio))throw new Error('Invalid Cutline project');
 const ids=new Set(records.map(a=>a.id));for(const c of p.clips){if(!['text','video','audio','overlay','blur'].includes(c.track)||!Number.isFinite(c.start)||c.start<0||!Number.isFinite(c.duration)||c.duration<.05||c.duration>3600||!c.id)throw new Error('Invalid clip data');if(!['text','blur'].includes(c.track)&&!ids.has(c.assetId))throw new Error('A media asset is missing');if(c.track==='text'&&typeof c.text!=='string')throw new Error('Invalid text clip');}
 p.muted={text:false,video:false,audio:false,overlay:false,blur:false,...p.muted};return p;
}
async function loadPortable(file){
 if(exporting)return;try{const data=JSON.parse(await file.text());if(data.format!=='cutline'||data.version!==1||!Array.isArray(data.assets))throw new Error('Choose a .cutline project file');const records=await Promise.all(data.assets.map(async a=>{if(typeof a.data!=='string'||!a.data.startsWith('data:'))throw new Error('Invalid media data');const response=await fetch(a.data);return {...a,blob:await response.blob()};}));validateProject(data.project,records);
  const loaded=[];for(const a of records){const temp={...a,id:uid()};const asset=await registerAsset(temp);loaded.push([a.id,asset.id]);}
  checkpoint();stop();project=data.project;const map=new Map(loaded);project.clips.forEach(c=>{if(c.assetId)c.assetId=map.get(c.assetId);c.id=uid();});selected=null;playhead=0;renderAll();scheduleSave();toast('Project opened.');
 }catch(e){toast('Could not open project: '+e.message);}$('#project-input').value='';
}
function newProject(){if(exporting)return;checkpoint();stop();project={version:1,name:'Untitled project',ratio:'16:9',clips:[],muted:{text:false,video:false,audio:false}};selected=null;playhead=0;renderAll();scheduleSave();$('#new-dialog').close();}
function exportTypes(){return [['video/mp4;codecs=avc1.42001E,mp4a.40.2','MP4 · H.264'],['video/webm;codecs=vp9,opus','WebM · VP9'],['video/webm;codecs=vp8,opus','WebM · VP8'],['video/webm','WebM']].filter(([type])=>typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(type));}
function showExport(){const types=exportTypes();if(!types.length||!canvas.captureStream)return toast('Video export needs a recent Chrome or Edge browser.');$('#export-format').innerHTML=types.map(([t,l])=>`<option value="${t}">${l}</option>`).join('');$('#export-duration').textContent=time(duration());$('#export-progress').hidden=true;$('#render-export').hidden=false;$('#cancel-export').hidden=true;$('#export-dialog').showModal();}
let oldHeight=1080,oldPlayhead=0,recordingStream,exportResolve;
async function startExport(){
 if(exporting)return;stop();exportCancelled=false;oldHeight=canvas.height;oldPlayhead=playhead;
 try{
  initAudio();await audioContext.resume();resizeCanvas(Number($('#export-resolution').value));playhead=0;syncMedia();
  await Promise.all([...media.values()].map(m=>new Promise(resolve=>{if(m.el.readyState>=2&&!m.el.seeking)return resolve();const done=()=>resolve();m.el.addEventListener('loadeddata',done,{once:true});m.el.addEventListener('seeked',done,{once:true});setTimeout(done,2500);})));
  drawFrame();recordingStream=canvas.captureStream(30);audioDestination.stream.getAudioTracks().forEach(t=>recordingStream.addTrack(t));
  const mime=$('#export-format').value;const chunks=[];recorder=new MediaRecorder(recordingStream,{mimeType:mime,videoBitsPerSecond:canvas.height>=1080?8000000:4000000,audioBitsPerSecond:192000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onerror=e=>{toast('Export failed: '+(e.error?.message||'recording error'));cancelExport();};
  recorder.onstop=async()=>{
   $('#export-dialog .close-modal').disabled=true;$('#export-resolution').disabled=true;$('#export-format').disabled=true;
   recordingStream.getVideoTracks().forEach(t=>t.stop());
   if(!exportCancelled&&chunks.length){await finishVideoDownload(new Blob(chunks,{type:mime.split(';')[0]}),mime);}
   exporting=false;$('#export-dialog .close-modal').disabled=false;$('#export-resolution').disabled=false;$('#export-format').disabled=false;document.body.classList.remove('exporting');stop();playhead=oldPlayhead;resizeCanvas(oldHeight);updatePlayhead();$('#export-dialog').close();$('#cancel-export').hidden=true;renderInspector();updateControls();
  };
  exporting=true;document.body.classList.add('exporting');$('#export-progress').hidden=false;$('#render-export').hidden=true;$('#cancel-export').hidden=false;$('#export-dialog .close-modal').disabled=true;$('#export-resolution').disabled=true;$('#export-format').disabled=true;
  recorder.start(250);playing=true;lastTick=performance.now();updateControls();
 }catch(e){exporting=false;document.body.classList.remove('exporting');stop();resizeCanvas(oldHeight);toast('Could not export: '+e.message);$('#export-dialog').close();}
}
function finishRecording(){if(recorder?.state==='recording')recorder.stop();$('#export-dialog .close-modal').disabled=false;$('#export-resolution').disabled=false;$('#export-format').disabled=false;}
function cancelExport(){exportCancelled=true;finishRecording();}
$('#export-dialog').addEventListener('cancel',e=>{if(exporting)e.preventDefault();});
$('#export').onclick=showExport;$('#render-export').onclick=startExport;$('#cancel-export').onclick=cancelExport;
$('#play').onclick=togglePlay;$('#start').onclick=()=>{if(exporting)return;stop();playhead=0;updatePlayhead();};$('#end').onclick=()=>{if(exporting)return;stop();playhead=duration();updatePlayhead();};
$('#undo').onclick=undo;$('#redo').onclick=redo;$('#split').onclick=splitClip;$('#duplicate').onclick=duplicateClip;$('#delete').onclick=deleteClip;
$('#file-input').onchange=e=>importFiles(e.target.files);$('#project-input').onchange=e=>e.target.files[0]&&loadPortable(e.target.files[0]);
$('#open-project').onclick=()=>$('#project-input').click();$('#save-project').onclick=saveProject;
$('#new-project').onclick=()=>$('#new-dialog').showModal();$('#cancel-new').onclick=()=>$('#new-dialog').close();$('#confirm-new').onclick=newProject;
$('#project-name').onfocus=checkpoint;$('#project-name').oninput=e=>{project.name=e.target.value;scheduleSave();};
$$('#library-tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderLibrary();});
$$('[data-mute]').forEach(b=>b.onclick=()=>{if(exporting)return;checkpoint();const t=b.dataset.mute;project.muted[t]=!project.muted[t];b.style.opacity=project.muted[t]?.35:1;renderTimeline();scheduleSave();});
function setZoom(value){zoom=clamp(value,2,180);$('#timeline-zoom').value=zoom;renderTimeline();}
$('#timeline-zoom').oninput=e=>setZoom(Number(e.target.value));$('#zoom-out').onclick=()=>setZoom(zoom-10);$('#zoom-in').onclick=()=>setZoom(zoom+10);$('#fit').onclick=()=>setZoom(($('#timeline-scroll').clientWidth-40)/Math.max(1,duration()));
$('#fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else $('#stage').requestFullscreen().catch(()=>toast('Fullscreen is unavailable in this window.'));};
$('#ratio-button').onclick=e=>{if(exporting)return;const existing=$('.ratio-menu');if(existing)return existing.remove();const root=document.createElement('div');root.className='ratio-menu';root.innerHTML=['16:9','9:16','1:1','4:5'].map(r=>`<button class="${project.ratio===r?'active':''}" data-ratio="${r}">${r}</button>`).join('');const rect=e.currentTarget.getBoundingClientRect();root.style.left=rect.left+'px';root.style.top=rect.top-43+'px';document.body.append(root);root.onclick=e=>{if(e.target.dataset.ratio){setRatio(e.target.dataset.ratio);root.remove();}};};
document.addEventListener('click',e=>{if(!e.target.closest('.ratio-menu')&&!e.target.closest('#ratio-button'))$('.ratio-menu')?.remove();});
window.addEventListener('keydown',e=>{
 if(e.target.matches('input,textarea,select')||$('dialog[open]'))return;if(exporting)return;
 if(e.code==='Space'){e.preventDefault();togglePlay();}
 if(e.code==='Delete'||e.code==='Backspace'){e.preventDefault();deleteClip();}
 if(e.metaKey||e.ctrlKey){if(e.code==='KeyZ'){e.preventDefault();e.shiftKey?redo():undo();}if(e.code==='KeyB'){e.preventDefault();splitClip();}if(e.code==='KeyS'){e.preventDefault();saveProject();}if(e.code==='KeyO'){e.preventDefault();$('#project-input').click();}}
 if(e.code==='ArrowRight'||e.code==='ArrowLeft'){e.preventDefault();stop();playhead=clamp(playhead+(e.code==='ArrowRight'?1:-1)*(e.shiftKey?1:1/30),0,duration());updatePlayhead();}
});
window.addEventListener('resize',()=>renderTimeline());window.addEventListener('beforeunload',e=>{if(exporting){e.preventDefault();e.returnValue='Export in progress';}});
async function bootstrap(){
 try{await openDatabase();const stored=await dbGet('current');if(stored){validateProject(stored.project,stored.records);for(const a of stored.records)await registerAsset(a);project=stored.project;playhead=0;renderAll();requestAnimationFrame(tick);return;}}catch(e){console.warn('Local restore unavailable:',e);}
 await makeDemoAssets();let start=0;for(const a of assets.values()){const c=defaultClip(a,start);project.clips.push(c);start+=5;}
 const title={id:uid(),track:'text',name:'Beyond the ordinary',text:'BEYOND THE\nORDINARY.',start:.4,duration:4.4,fontSize:132,fontWeight:800,color:'#f6f3e8',x:0,y:0,opacity:100,shadow:true};
 project.clips.push(title,{...title,id:uid(),name:'A short film by you',text:'A SHORT FILM BY YOU',fontSize:25,fontWeight:500,y:20,start:.4,duration:4.4},{...title,id:uid(),name:'Chase the light',text:'CHASE THE LIGHT.',fontSize:100,start:5.5,duration:3.5},{...title,id:uid(),name:'Go a little further',text:'GO A LITTLE\nFURTHER.',fontSize:120,start:10.5,duration:3.5});selected=project.clips[0]?.id;renderAll();scheduleSave();requestAnimationFrame(tick);
}
let interactionController=CutlineInteractions.create({
 element:$('#track-area'),window,document,
 getProject:()=>project,getSelected:()=>selected,setSelected:id=>setSelection(id?[id]:[]),
 getSelectedIds:()=>getSelectionIds(),setSelection:(ids,primary)=>setSelection(ids,primary),
 getAsset:id=>assets.get(id),getZoom:()=>zoom,getScroll:()=>$('#timeline-scroll').scrollLeft,
 getPlayhead:()=>playhead,isBusy:()=>exporting,pause:()=>stop(),clone:CutlineModel.clone,sliceClip:CutlineModel.sliceClip,
 checkpoint:()=>checkpoint(),renderSelection:()=>{renderTimeline();renderInspector();updateControls();},
 previewMove:(event,gesture)=>typeof previewStackMove==='function'?previewStackMove(event,gesture):null,
 showMoveHint:gesture=>{if(typeof showStackMoveHint==='function')showStackMoveHint(gesture);},
 finishMove:gesture=>{if(typeof finishStackMove==='function')finishStackMove(gesture);},clearMoveHint:()=>clearTimelineDropHint(),
 renderTimeline:()=>renderTimeline(),commitGesture:()=>{renderInspector();scheduleSave();updateControls();},
 positionAt:e=>Math.max(0,(e.clientX-$('#track-area').getBoundingClientRect().left)/zoom),
 seek:t=>{playhead=clamp(t,0,duration());updatePlayhead();},
 importFiles:files=>importFiles(files),notify:text=>toast(text),
 placeAsset:(id,track,at)=>track==='overlay'?addOverlay(id,at):addAsset(id,at),
 dropLocation:e=>{
  const target=e.target.closest?.('[data-track]');
  return {onTimeline:!!e.target.closest?.('.timeline,.viewer'),track:target?.dataset.track,
   time:e.target.closest?.('#track-area')?Math.max(0,(e.clientX-$('#track-area').getBoundingClientRect().left)/zoom):playhead};
 },
 showDropHint:(location,asset)=>{
  clearTimelineDropHint();
  if(!location.onTimeline){document.body.classList.add('dragging-files');return;}
  const track=CutlineInteractions.targetTrack(asset||{type:'video'},location.track),root=$('#'+track+'-track');
  if(!root)return;root.classList.add('drop-target');
  const hint=document.createElement('div');hint.id='timeline-drop-preview';hint.className='timeline-drop-preview';
  hint.style.left=(location.time*zoom)+'px';hint.style.width=Math.max(95,Math.min(500,(asset?.duration||3)*zoom))+'px';
  hint.textContent=`Drop ${asset?.type==='audio'?'audio':track==='overlay'?'layer':'media'} at ${time(location.time)}`;root.append(hint);
 },clearDropHint:()=>clearTimelineDropHint()
}).bind();
function clearTimelineDropHint(){document.body.classList.remove('dragging-files');$('#timeline-drop-preview')?.remove();$$('.drop-target').forEach(el=>el.classList.remove('drop-target'));}
bootstrap().catch(e=>{console.error(e);toast('Could not start: '+e.message);});
