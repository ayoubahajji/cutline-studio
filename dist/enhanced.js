/* Cutline's ad-editing workspace. All processing stays in the local browser/server. */
'use strict';
const Model=CutlineModel;
let blurDrawing=false,previewDrag=null,clipboardClip=null,captionBusy=false,captionJob=null;
let audioMaster=null,renderedLibraryTab=null,inspectedClipId=null;
let exportFinalizing=false,finalizeAbort=null;
const decodeCache=new Map();
const auxiliaryCanvas=document.createElement('canvas');
const auxiliaryContext=auxiliaryCanvas.getContext('2d');
const defaults={fadeIn:0,fadeOut:0,audioMuted:false,gainDb:0,audioPreset:'original',audioRole:'other',ducking:false,flipX:false,flipY:false,fit:'cover',cropLeft:0,cropRight:0,cropTop:0,cropBottom:0,transition:'none',transitionDuration:.5,background:false,bgColor:'#101114',bgOpacity:75,stroke:false,layer:0,keyframes:[]};
function hydrate(){
 project.id=project.id||uid();project.muted={overlay:false,blur:false,...project.muted};project.locked={...project.locked};
 for(const c of project.clips){for(const [key,val]of Object.entries(defaults))if(c[key]===undefined)c[key]=Model.clone(val);}
}
const originalDefaultClip=defaultClip;
defaultClip=(asset,start)=>({...originalDefaultClip(asset,start),...Model.clone(defaults)});
const originalRenderAll=renderAll;
renderAll=function(){hydrate();originalRenderAll();};
const originalCommit=commit;
commit=function(){hydrate();originalCommit();};
const trackNames={text:'Text & captions',overlay:'Layers',blur:'Blur regions',video:'Main video',audio:'Audio'};
function isActive(c,t){return t>=c.start&&t<c.start+c.duration;}
function mainClipsAt(t){return project.clips.filter(c=>c.track==='video'&&isActive(c,t)).sort((a,b)=>a.start-b.start);}
function incomingAt(t){return mainClipsAt(t).at(-1);}
function mainWeight(c,t){const list=mainClipsAt(t),last=list.at(-1);if(!last)return 0;if(c===last)return last.transition==='dissolve'?clamp((t-last.start)/last.transitionDuration,0,1):1;if(list.at(-2)===c&&last.transition==='dissolve')return 1-clamp((t-last.start)/last.transitionDuration,0,1);return 0;}
function audioLevel(c,t,ignoreMute=false){
 if(!ignoreMute&&(project.muted[c.track]||c.audioMuted))return 0;
 const weight=c.track==='video'&&!ignoreMute?mainWeight(c,t):1;
 const duck=c.ducking&&project.clips.some(x=>x.id!==c.id&&x.audioRole==='voice'&&x.assetId&&isActive(x,t)&&!x.audioMuted&&!project.muted[x.track]&&(x.volume??100)>0&&Model.envelope(x,t)>0&&(x.track!=='video'||mainWeight(x,t)>0))?.25:1;return (c.volume??100)/100*Math.pow(10,(c.gainDb||0)/20)*Model.envelope(c,t)*weight*duck;
}
function clipLocked(c){return !!c&&!!project.locked[c.track];}
function requireEditable(){if(exporting)return false;const c=current();if(clipLocked(c)){toast('Unlock this track before editing it.');return false;}return true;}

// Keep the familiar panel and add the tools an ad editor uses most.
$('#library-tabs').insertAdjacentHTML('beforeend',`<button data-tab="overlays">${ico('layers')}Layers</button><button data-tab="transitions">${ico('fit')}Transitions</button><button data-tab="captions">${ico('text')}Captions</button><button data-tab="ads">${ico('effects')}Ad tools</button>`);
$$('#library-tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderLibrary();});
$('#timeline-toolbar-extra')?.remove();
$('.timeline-toolbar .tool-group').insertAdjacentHTML('beforeend',`<span class="divider"></span><button id="detach-audio" class="tool-labeled" title="Detach the selected video's sound">${ico('audio')}<span>Detach audio</span></button><button id="blur-area" class="tool-labeled" title="Draw a rectangle over text or a logo to blur it">${ico('expand')}<span>Blur area</span></button><button id="ripple-delete" class="icon" title="Ripple delete: remove selected clip and close its gap" aria-label="Ripple delete">⌫</button><button id="split-all" class="icon" title="Split all unlocked clips at playhead" aria-label="Split all tracks">⋮</button>`);
$('.viewer-top>div').insertAdjacentHTML('afterbegin','<button id="safe-zones" class="small-toggle" title="Preview ad-safe text margins">Ad safe zones</button>');
$('#stage').insertAdjacentHTML('beforeend','<div id="region-draft" hidden></div><div id="ad-safe-guide" hidden><span>Keep key text inside</span></div><div id="region-hint" hidden>Drag a box over the text or logo to blur · Esc to cancel</div>');
for(const track of ['overlay','blur']){
 const root=document.createElement('div');root.id=track+'-track';root.className='track '+track+'-track';root.dataset.track=track;
 $('#video-track').before(root);
 const label=document.createElement('div');label.className='track-label';label.dataset.trackLabel=track;label.innerHTML=`<span>${ico(track==='overlay'?'layers':'effects')}</span><span>${trackNames[track]}</span><button class="icon" data-mute="${track}" title="Show / hide ${track}" aria-label="Show / hide ${track}">${ico('eye')}</button>`;
 $('.video-label').before(label);
}
for(const track of ['text','video','audio']){
 const root=$('#'+track+'-track');const label=$('.track-labels .track-label'+(track==='video'?'.video-label':''));
 const originalLabel=$$('[data-mute]').find(b=>b.dataset.mute===track)?.closest('.track-label');if(originalLabel){originalLabel.dataset.trackLabel=track;originalLabel.querySelector('span:nth-child(2)').textContent=trackNames[track];}
}
$$('[data-mute]').forEach(b=>b.onclick=()=>{if(exporting)return;checkpoint();const t=b.dataset.mute;project.muted[t]=!project.muted[t];renderTimeline();scheduleSave();});
for(const track of Object.keys(trackNames)){
 const label=$(`[data-track-label="${track}"]`);if(!label)continue;label.insertAdjacentHTML('beforeend',`<button class="track-lock" data-lock="${track}" title="Lock / unlock ${trackNames[track]}" aria-label="Lock ${track}">⌑</button>`);
}
$$('[data-lock]').forEach(b=>b.onclick=()=>{if(exporting)return;checkpoint();project.locked[b.dataset.lock]=!project.locked[b.dataset.lock];renderTimeline();renderInspector();updateControls();scheduleSave();});
$('#file-input').insertAdjacentHTML('afterend','<input type="file" id="subtitle-input" accept=".srt,.vtt" hidden>');
const originalLibrary=renderLibrary;
renderLibrary=function(){
 if(renderedLibraryTab!==tab){$('.library-body').scrollTop=0;renderedLibraryTab=tab;}
 if(!['overlays','transitions','captions','ads'].includes(tab)){
  originalLibrary();
  if(tab==='audio')$('#library-content').insertAdjacentHTML('afterbegin',`<div class="audio-quick"><button id="audio-detach-action" class="secondary wide">${ico('audio')} Detach selected video's audio</button><button id="audio-mix-export" class="secondary wide">Download audio mix · WAV</button><p class="tip">Select an audio clip to split it, drag its edges to trim, or adjust its fades and volume.</p></div>`);
  if($('#audio-detach-action'))$('#audio-detach-action').onclick=detachAudio;if($('#audio-mix-export'))$('#audio-mix-export').onclick=()=>exportWav(false);
  return;
 }
 $$('#library-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 $('#library-title').textContent={overlays:'Build your layers',transitions:'Connect your scenes',captions:'Make every word count',ads:'Made for your next ad'}[tab];$('#media-count').textContent='Ad studio';
 const root=$('#library-content');
 if(tab==='overlays'){
  root.innerHTML=`<button class="import-button" id="layer-import">${ico('upload')} Import photos or video</button><p class="drop-note">Click an asset to layer it at the playhead.</p><div class="asset-grid">${[...assets.values()].filter(a=>a.type!=='audio').map(a=>`<button class="asset" draggable="true" data-layer-asset="${a.id}"><div class="thumb">${a.thumb?`<img src="${a.thumb}" alt="" draggable="false">`:ico('media')}<span class="add-asset">+</span></div><span class="asset-name">${esc(a.name)}</span></button>`).join('')}</div><p class="tip">Layer product footage, logos, and photos over your main video. Resize, position, crop, or flip each layer in Properties.</p>`;
  $('#layer-import').onclick=()=>$('#file-input').click();$$('[data-layer-asset]',root).forEach(b=>b.onclick=()=>addOverlay(b.dataset.layerAsset));
 }else if(tab==='transitions'){
  root.innerHTML=`<p class="drop-note">Select the incoming main-video clip.</p><div class="effect-grid">${[['none','│','Hard cut'],['dissolve','◐','Cross dissolve'],['wipe','▥','Wipe in'],['slide','⇢','Slide in'],['fade','◒','Fade in/out']].map(([type,glyph,label])=>`<button class="effect-card" data-transition="${type}"><span>${glyph}</span>${label}</button>`).join('')}</div><label class="field">Duration <select id="transition-length"><option value="0.3">0.3 seconds</option><option value="0.5" selected>0.5 seconds</option><option value="1">1 second</option></select></label><p class="tip">Dissolve, wipe, and slide overlap the incoming clip with the previous scene. Captions and detached audio keep their positions.</p>`;
  $$('[data-transition]',root).forEach(b=>b.onclick=()=>applyTransition(b.dataset.transition,Number($('#transition-length').value)));
 }else if(tab==='captions'){
  const captions=project.clips.filter(c=>c.isCaption).sort((a,b)=>a.start-b.start);
  root.innerHTML=`<div class="caption-auto"><h3>Auto captions · on your Mac</h3><label class="field">Source<select id="caption-source"><option value="selected">Selected video / audio</option><option value="mix">Entire timeline mix</option></select></label><label class="field">Language<select id="caption-language"><option value="auto">Auto-detect</option><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option><option value="es">Español</option></select></label><button id="auto-captions" class="primary wide" ${captionBusy?'disabled':''}>${captionBusy?'Transcribing locally…':'Generate captions'}</button><p id="caption-engine-status" class="engine-status">Checking local speech engine…</p>${captionBusy?'<button id="cancel-captions" class="quiet wide">Cancel transcription</button>':''}</div><div class="caption-actions"><button id="import-srt" class="secondary">Import SRT / VTT</button><button id="export-srt" class="secondary">Export SRT</button></div><button id="manual-caption" class="secondary wide">+ Add a caption at playhead</button><div class="section-label">Caption style</div><div class="style-chips"><button data-caption-style="clean">Clean</button><button data-caption-style="bold">Bold ad</button><button data-caption-style="highlight">Highlight</button></div><p class="tip">Caption text stays editable. Review names, prices, and timings before publishing.</p><div class="caption-list">${captions.map(c=>`<button data-caption-id="${c.id}"><small>${time(c.start)}</small><span>${esc(c.text)}</span></button>`).join('')||'<p class="empty-library">Your captions will appear here.</p>'}</div>`;
  $('#auto-captions').onclick=generateCaptions;$('#import-srt').onclick=()=>$('#subtitle-input').click();$('#export-srt').onclick=exportSrt;$('#manual-caption').onclick=()=>addCaption('Your caption',playhead,Math.min(3,Math.max(.5,duration()-playhead)));
  $$('[data-caption-style]',root).forEach(b=>b.onclick=()=>styleCaptions(b.dataset.captionStyle));$$('[data-caption-id]',root).forEach(b=>b.onclick=()=>{selected=b.dataset.captionId;playhead=current().start;stop();commit();});if($('#cancel-captions'))$('#cancel-captions').onclick=cancelCaptions;
  fetch('/api/capabilities').then(r=>r.json()).then(d=>{if($('#caption-engine-status'))$('#caption-engine-status').textContent=d.transcription?'Ready · Whisper runs locally · no upload to a cloud service':'Local speech engine unavailable. Import SRT/VTT or add captions manually.';}).catch(()=>{if($('#caption-engine-status'))$('#caption-engine-status').textContent='Restart the local launcher for auto captions. SRT import remains available.';});
 }else{
  root.innerHTML=`<div class="ad-formats"><button data-ad-ratio="9:16"><b>9:16</b><span>Reels / Stories</span></button><button data-ad-ratio="4:5"><b>4:5</b><span>Feed portrait</span></button><button data-ad-ratio="1:1"><b>1:1</b><span>Square feed</span></button></div><button id="ad-blur" class="primary wide">${ico('expand')} Blur existing text / logo</button><p class="tip">Draw a box on the preview. Only the selected area is blurred; your product stays visible. Set the timing in Properties.</p><div class="section-label">Add a text card</div><div class="ad-text-presets">${[['hook','STOP SCROLLING.','Opening hook'],['benefit','A SMALL CHANGE.\nA BIG DIFFERENCE.','Product benefit'],['offer','SPECIAL OFFER','Offer / price'],['cta','ORDER TODAY →','Call to action']].map(([key,text,label])=>`<button data-ad-text="${key}"><strong>${text.replace('\n','<br>')}</strong><small>${label}</small></button>`).join('')}</div><div class="section-label">Simple stickers</div><div class="sticker-row">${['★','♡','→','✓','%'].map(s=>`<button data-sticker="${s}">${s}</button>`).join('')}</div>`;
  $$('[data-ad-ratio]',root).forEach(b=>b.onclick=()=>setRatio(b.dataset.adRatio));$('#ad-blur').onclick=beginBlur;$$('[data-ad-text]',root).forEach(b=>b.onclick=()=>addAdText(b.dataset.adText));$$('[data-sticker]',root).forEach(b=>b.onclick=()=>{if(!addText())return;Object.assign(current(),{text:b.dataset.sticker,name:'Sticker',fontSize:180,color:'#64e6d2',y:15});commit();});
 }
};
function addOverlay(id,at){return addAsset(id,at,'overlay');}
function addAdText(type){
 if(!addText())return;const presets={hook:{text:'STOP SCROLLING.',fontSize:104,y:-26,color:'#ffffff',background:true,bgColor:'#14181e'},benefit:{text:'A SMALL CHANGE.\nA BIG DIFFERENCE.',fontSize:96,y:0,color:'#ffffff',background:false},offer:{text:'SPECIAL OFFER',fontSize:96,y:22,color:'#112521',background:true,bgColor:'#64e6d2'},cta:{text:'ORDER TODAY →',fontSize:86,y:30,color:'#112521',background:true,bgColor:'#64e6d2'}};Object.assign(current(),presets[type],{bgOpacity:100});commit();
}
function selectClip(id){selected=id;renderTimeline();renderInspector();updateControls();}

// Audio is detached without re-encoding: the new clip reads the same source range.
function detachAudio(){
 const c=current();if(!c||!['video','overlay'].includes(c.track)||assets.get(c.assetId)?.type!=='video')return toast('Select a video clip first.');if(!requireEditable())return;if(c.audioDetached)return toast('This clip’s audio is already detached.');
 checkpoint();const a={...Model.clone(c),id:uid(),track:'audio',name:c.name+' · audio',audioMuted:false,audioDetached:false,transition:'none',keyframes:[]};c.audioDetached=true;c.audioMuted=true;project.clips.push(a);selected=a.id;commit();decodeAudioAsset(assets.get(c.assetId));toast('Audio detached. Move, cut, or trim it independently.');
}
$('#detach-audio').onclick=detachAudio;
const baseUpdateControls=updateControls;
updateControls=function(){baseUpdateControls();const c=current();$('#detach-audio').disabled=!c||!['video','overlay'].includes(c.track)||assets.get(c.assetId)?.type!=='video'||c.audioDetached||exporting;for(const id of ['split','duplicate','delete','ripple-delete'])$('#'+id).disabled=!c||clipLocked(c)||exporting;};
const baseSplit=splitClip,baseDuplicate=duplicateClip,baseDelete=deleteClip;
splitClip=()=>{if(requireEditable())baseSplit();};duplicateClip=()=>{if(!requireEditable())return;const overlay=current()?.track==='overlay';baseDuplicate();if(overlay&&current()){current().layer=Math.max(0,...project.clips.filter(c=>c.id!==selected&&c.track==='overlay').map(c=>c.layer||0))+1;commit();}};deleteClip=()=>{if(requireEditable())baseDelete();};
$('#split').onclick=splitClip;$('#duplicate').onclick=duplicateClip;$('#delete').onclick=deleteClip;
function splitAll(){if(exporting)return;const candidates=project.clips.filter(c=>!clipLocked(c)&&Model.split(c,playhead));if(!candidates.length)return toast('Place the playhead inside a clip first.');checkpoint();for(const c of candidates){const [left,right]=Model.split(c,playhead);Object.assign(c,left);project.clips.push({...right,id:uid()});}commit();toast(`${candidates.length} clips split at the playhead.`);}
$('#split-all').onclick=splitAll;
function rippleDelete(){const c=current();if(!c||!requireEditable())return;checkpoint();const end=c.start+c.duration,track=c.track;project.clips=project.clips.filter(x=>x.id!==c.id);project.clips.filter(x=>x.track===track&&x.start>=end-.001).forEach(x=>x.start=Math.max(c.start,x.start-c.duration));selected=null;commit();}
$('#ripple-delete').onclick=rippleDelete;
$('#track-area').addEventListener('pointerdown',e=>{const c=project.clips.find(c=>c.id===e.target.closest('[data-clip]')?.dataset.clip);if(clipLocked(c)){e.preventDefault();e.stopImmediatePropagation();toast('This track is locked.');}},true);

// Stack overlapping audio/layer/effect clips into real lanes; never draw a fake waveform.
const baseRenderTimeline=renderTimeline;
function laneLayout(clips){const ends=[],map=new Map();for(const c of [...clips].sort((a,b)=>a.start-b.start)){let lane=ends.findIndex(t=>t<=c.start+.00001);if(lane<0)lane=ends.length;ends[lane]=c.start+c.duration;map.set(c.id,lane);}return {count:ends.length,map};}
renderTimeline=function(){
 hydrate();baseRenderTimeline();
 for(const track of ['overlay','blur']){
  const clips=project.clips.filter(c=>c.track===track);$('#'+track+'-track').innerHTML=clips.map(c=>{
   const a=assets.get(c.assetId),w=Math.max(10,c.duration*zoom),thumbs=track==='overlay'?`<div class="clip-thumbs">${a?.thumb?Array.from({length:Math.min(40,Math.max(1,Math.ceil(w/95)))},()=>`<img draggable="false" src="${a.thumb}" alt="">`).join(''):''}</div>`:'';
   return `<div class="clip ${track} ${selected===c.id?'selected':''}" data-clip="${c.id}" style="left:${c.start*zoom}px;width:${w}px"><i class="trim-handle left" data-edge="left"></i>${thumbs}<span class="clip-title">${track==='overlay'?'▱ ':''}${esc(c.name)}</span><i class="trim-handle right" data-edge="right"></i></div>`;
  }).join('')+(!clips.length?`<span class="track-placeholder">${track==='blur'?'Draw a blur box over existing text':'Drag a video here to stack it above the main video'}</span>`:'');
 }
 for(const track of ['audio','overlay','blur']){
  const clips=project.clips.filter(c=>c.track===track),layers=track==='overlay'?[...new Set(clips.map(c=>c.layer||0))].sort((a,b)=>b-a):[],layout=track==='overlay'?{count:layers.length,map:new Map(clips.map(c=>[c.id,layers.indexOf(c.layer||0)]))}:laneLayout(clips),base=track==='audio'?(current()?.track==='audio'?72:60):track==='overlay'?72:28,height=Math.max(track==='audio'?68:track==='overlay'?80:35,layout.count*base+8);
  const root=$('#'+track+'-track');root.style.height=height+'px';$(`[data-track-label="${track}"]`).style.height=height+'px';
  for(const c of clips){const el=$(`[data-clip="${c.id}"]`,root);el.style.top=(4+layout.map.get(c.id)*base)+'px';el.style.height=(base-5)+'px';if(track==='overlay')el.dataset.layerRow=layout.map.get(c.id);}
  if(track==='overlay')layers.forEach((layer,index)=>{const line=document.createElement('div');line.className='overlay-lane-guide';line.style.top=(4+index*base)+'px';line.innerHTML=`<span>Layer ${layers.length-index}${index===0?' · top':''}</span>`;root.prepend(line);});
 }
 for(const track of Object.keys(trackNames)){
  const root=$('#'+track+'-track');root.style.opacity=project.muted[track]?.35:1;root.classList.toggle('locked',!!project.locked[track]);
  $(`[data-lock="${track}"]`)?.classList.toggle('active',!!project.locked[track]);$(`[data-mute="${track}"]`)?.classList.toggle('active',!!project.muted[track]);
 }
 $('#track-area').style.height=(32+Object.keys(trackNames).reduce((sum,t)=>sum+$('#'+t+'-track').offsetHeight,0))+'px';
 for(const c of project.clips){const el=$(`[data-clip="${c.id}"]`);if(!el)continue;
  if(c.keyframes?.length)el.insertAdjacentHTML('beforeend',c.keyframes.map(k=>`<i class="keyframe-dot" style="left:${clamp(k.time/c.duration*100,0,100)}%"></i>`).join(''));
  if(c.audioDetached&&c.track!=='audio')el.insertAdjacentHTML('beforeend','<span class="detached-badge">audio detached</span>');
  if(c.transition&&c.transition!=='none')el.insertAdjacentHTML('beforeend',`<span class="transition-badge">${esc(c.transition)}</span>`);
  if(c.track==='audio'){
   el.querySelector('.wave')?.remove();const wave=document.createElement('canvas');wave.className='real-waveform';wave.width=Math.min(1400,Math.max(20,Math.round(c.duration*zoom)));wave.height=28;el.prepend(wave);const a=assets.get(c.assetId);if(a?.audioBuffer)drawWaveform(wave,c,a.audioBuffer);else{el.classList.add('loading-wave');decodeAudioAsset(a).then(()=>renderTimeline()).catch(()=>{wave.title='Waveform unavailable for this codec';});}
  }
 }
 $('.timeline').style.setProperty('--track-content-height',$('#track-area').offsetHeight+'px');interactionController.syncSelection();
};
async function decodeAudioAsset(asset){
 if(!asset||asset.type==='image')throw new Error('Choose a video or audio file.');if(asset.audioBuffer)return asset.audioBuffer;if(decodeCache.has(asset.id))return decodeCache.get(asset.id);
 const promise=(async()=>{const decoder=new OfflineAudioContext(2,1,44100);const result=await decoder.decodeAudioData(await asset.blob.arrayBuffer());asset.audioBuffer=result;return result;})();
 decodeCache.set(asset.id,promise);promise.catch(()=>{if(decodeCache.get(asset.id)===promise)decodeCache.delete(asset.id);});return promise;
}
function drawWaveform(target,c,buffer){
 const context=target.getContext('2d'),width=target.width,height=target.height;context.clearRect(0,0,width,height);context.fillStyle='#81d5ca';
 const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),data=channels[0],first=Math.floor((c.in||0)*buffer.sampleRate),length=Math.floor(c.duration*c.speed*buffer.sampleRate),step=Math.max(1,Math.floor(length/width));
 for(let x=0;x<width;x+=2){const start=first+Math.floor(x/width*length);let max=0;for(let i=start;i<Math.min(data.length,start+step*2);i+=Math.max(1,Math.floor(step/80)))for(const channel of channels)max=Math.max(max,Math.abs(channel[i]||0));const h=Math.max(1,Math.sqrt(max)*height);context.fillRect(x,(height-h)/2,1.5,h);}
}
// Each clip owns an element, including independent copies of detached audio.
getMedia=function(c){let entry=media.get(c.id);if(entry)return entry;const a=assets.get(c.assetId);if(!a||a.type==='image')return null;const el=document.createElement(c.track==='audio'?'audio':'video');el.src=a.url;el.preload='auto';el.playsInline=true;el.preservesPitch=false;el.load();entry={el,clipId:c.id};media.set(c.id,entry);return entry;};
function attachAudioNodes(m,context,destination){if(m.source)return;m.source=context.createMediaElementSource(m.el);m.filter=context.createBiquadFilter();m.filter.type='allpass';m.compressor=context.createDynamicsCompressor();m.gain=context.createGain();m.source.connect(m.filter);m.filter.connect(m.compressor);m.compressor.connect(m.gain);m.gain.connect(audioMaster||context.destination);}
function configureAudioNodes(c,m){if(!m.filter)return;const voice=c.audioPreset==='voice',phone=c.audioPreset==='telephone',bass=c.audioPreset==='bass';m.filter.type=voice?'highpass':phone?'bandpass':bass?'lowshelf':'allpass';m.filter.frequency.value=voice?100:phone?1400:150;m.filter.Q.value=phone?.8:.7;m.filter.gain.value=bass?6:0;m.compressor.threshold.value=voice?-24:0;m.compressor.ratio.value=voice?3:1;}
initAudio=function(){if(!audioContext){audioContext=new AudioContext();audioDestination=audioContext.createMediaStreamDestination();audioMaster=audioContext.createDynamicsCompressor();audioMaster.threshold.value=-1;audioMaster.knee.value=0;audioMaster.ratio.value=20;audioMaster.attack.value=.003;audioMaster.release.value=.05;audioMaster.connect(audioContext.destination);audioMaster.connect(audioDestination);}if(audioContext.state==='suspended')audioContext.resume();for(const c of project.clips){if(!isActive(c,playhead)||project.muted[c.track])continue;const m=getMedia(c);if(m)attachAudioNodes(m,audioContext,audioDestination);}};
syncMedia=function(){
 const activeMain=mainClipsAt(playhead),last=activeMain.at(-1);
 for(const c of project.clips){const a=assets.get(c.assetId);if(!a||a.type==='image')continue;
  const visible=c.track==='audio'||c.track==='overlay'||c===last||(last?.transition!=='none'&&activeMain.at(-2)===c);
  const active=isActive(c,playhead)&&!project.muted[c.track]&&visible;
  let m=media.get(c.id);
  if(!active){
   if(!m&&playing&&c.start>playhead&&c.start-playhead<.75&&!project.muted[c.track])m=getMedia(c);
   if(m){if(!m.el.paused)m.el.pause();if(m.gain)m.gain.gain.setTargetAtTime(0,audioContext.currentTime,.008);if(c.start>playhead&&m.el.readyState>=1&&!m.el.seeking&&Math.abs(m.el.currentTime-(c.in||0))>.02){try{m.el.currentTime=c.in||0;}catch{}}}
   continue;
  }
  m=m||getMedia(c);if(audioContext&&!m.source)attachAudioNodes(m,audioContext,audioDestination);
  const target=clamp((c.in||0)+(playhead-c.start)*(c.speed||1),0,Math.max(0,a.duration-.015));if(m.el.readyState>=1&&!m.el.seeking&&Math.abs(m.el.currentTime-target)>(playing?.15:.02)){try{m.el.currentTime=target;}catch{}}
  m.el.playbackRate=c.speed||1;const level=audioLevel(c,playhead);configureAudioNodes(c,m);
  if(m.gain){m.gain.gain.setTargetAtTime(level,audioContext.currentTime,.01);m.el.volume=1;}else m.el.volume=clamp(level,0,1);
  if(playing&&m.el.paused&&!m.pending){m.pending=true;m.el.play().catch(()=>{}).finally(()=>m.pending=false);}else if(!playing&&!m.el.paused)m.el.pause();
 }
 for(const [id,m]of media){const c=project.clips.find(c=>c.id===id);if(!c||c.start+c.duration<playhead-2||c.start>playhead+3){m.el.pause();m.source?.disconnect();m.filter?.disconnect();m.compressor?.disconnect();m.gain?.disconnect();m.el.removeAttribute('src');m.el.load();media.delete(id);}}
};

// Preview and export use the same compositor, including rectangular blur regions.
function renderVisual(c,t,alpha=1){
 const a=assets.get(c.assetId),source=a?.image||media.get(c.id)?.el;if(!source||(a.type!=='image'&&source.readyState<2))return;
 const W=canvas.width,H=canvas.height,local=t-c.start,p=Model.poseAt(c,local),sw=a.width||W,sh=a.height||H;
 const g=CutlineFrameGeometry.geometry(c,a,W,H,p,local),{sx,sy,cw,ch}=g;if(cw<=0||ch<=0)return;
 const scale=g.width/cw;
 ctx.save();ctx.globalAlpha=p.opacity/100*alpha*Model.envelope(c,t);ctx.filter=`brightness(${c.brightness??100}%) contrast(${c.contrast??100}%) saturate(${c.saturation??100}%) ${effectFilters[c.filter]||''}`;
 ctx.translate(W/2+p.x/100*W,H/2+p.y/100*H);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(c.flipX?-1:1,c.flipY?-1:1);ctx.drawImage(source,sx,sy,cw,ch,-cw*scale/2,-ch*scale/2,cw*scale,ch*scale);ctx.restore();
}
const productionBlur=CutlineBlurRenderer.create((w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;});
function applyBlur(c,t){const W=canvas.width,H=canvas.height,p=Model.poseAt(c,t-c.start);productionBlur(canvas,ctx,{x:W*(.5+p.x/100-p.width/200),y:H*(.5+p.y/100-p.height/200),width:W*p.width/100,height:H*p.height/100,radius:c.blurRadius||22,mode:c.blurMode,opacity:p.opacity/100*Model.envelope(c,t)});}

function wrapCanvasText(text,maxWidth){const lines=[];for(const raw of text.split('\n')){const words=raw.split(/\s+/);let line='';for(const word of words){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;}else line=next;}lines.push(line);}return lines;}
function renderText(c,t){
 const W=canvas.width,H=canvas.height,p=Model.poseAt(c,t-c.start),factor=H/1080;ctx.save();ctx.translate(W/2+p.x/100*W,H/2+p.y/100*H);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.scale/100,p.scale/100);ctx.font=`${c.fontWeight||600} ${c.fontSize*factor}px -apple-system, BlinkMacSystemFont, Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction=/[\u0600-\u06ff]/.test(c.text)?'rtl':'ltr';ctx.globalAlpha=p.opacity/100*Model.envelope(c,t);
 const lines=wrapCanvasText(c.text,W*(c.isCaption?.83:.9)),lineHeight=c.fontSize*factor*1.12,width=Math.max(1,...lines.map(l=>ctx.measureText(l).width));
 if(c.background){ctx.save();ctx.globalAlpha*=c.bgOpacity/100;ctx.fillStyle=c.bgColor;ctx.beginPath();ctx.roundRect(-width/2-20*factor,-lines.length*lineHeight/2-10*factor,width+40*factor,lines.length*lineHeight+20*factor,9*factor);ctx.fill();ctx.restore();}
 if(c.shadow){ctx.shadowColor='#000b';ctx.shadowBlur=8*factor;ctx.shadowOffsetY=2*factor;}ctx.fillStyle=c.color;
 lines.forEach((line,i)=>{const y=(i-(lines.length-1)/2)*lineHeight;if(c.stroke){ctx.strokeStyle='#101114';ctx.lineWidth=6*factor;ctx.strokeText(line,0,y,W*.9);}ctx.fillText(line,0,y,W*.9);});ctx.restore();
}
drawFrame=function(){
 const t=Math.min(playhead,Math.max(0,duration()-.001)),W=canvas.width,H=canvas.height;ctx.fillStyle=project.background||'#0d1014';ctx.fillRect(0,0,W,H);
 const main=mainClipsAt(t),incoming=main.at(-1),previous=main.at(-2);
 if(!project.muted.video&&incoming){
  const progress=clamp((t-incoming.start)/Math.max(.01,incoming.transitionDuration),0,1);
  if(previous&&incoming.transition!=='none'&&progress<1)renderVisual(previous,t);
  if(incoming.transition==='dissolve'&&previous&&progress<1)renderVisual(incoming,t,progress);
  else if(incoming.transition==='wipe'&&previous&&progress<1){ctx.save();ctx.beginPath();ctx.rect(0,0,W*progress,H);ctx.clip();renderVisual(incoming,t);ctx.restore();}
  else if(incoming.transition==='slide'&&previous&&progress<1){ctx.save();ctx.translate(W*(1-progress),0);renderVisual(incoming,t);ctx.restore();}
  else renderVisual(incoming,t);
 }
 if(!project.muted.overlay)project.clips.filter(c=>c.track==='overlay'&&isActive(c,t)).sort((a,b)=>a.layer-b.layer).forEach(c=>renderVisual(c,t));
 if(!project.muted.blur)project.clips.filter(c=>c.track==='blur'&&isActive(c,t)).forEach(c=>applyBlur(c,t));
 if(!project.muted.text)project.clips.filter(c=>c.track==='text'&&isActive(c,t)).forEach(c=>renderText(c,t));
 $('#empty-preview').hidden=project.clips.some(c=>['video','overlay'].includes(c.track));
 const active=current();if(active?.track==='blur'&&isActive(active,t)&&!blurDrawing&&!exporting)showRegionBox(active,t);else if(!previewDrag&&!blurDrawing)$('#region-draft').hidden=true;
 updateGuides();
};
function applyTransition(type,length){
 const c=current();if(!c||c.track!=='video')return toast('Select the incoming clip on the Main video track.');if(!requireEditable())return;
 const previous=project.clips.filter(x=>x.track==='video'&&x.id!==c.id&&x.start<c.start).sort((a,b)=>a.start-b.start).at(-1);
 if(type!=='none'&&type!=='fade'&&!previous)return toast('This transition needs a clip before the selected one.');
 checkpoint();if(type==='fade'){c.fadeIn=Math.min(length,c.duration/2);c.fadeOut=Math.min(length,c.duration/2);c.transition='none';}
 else if(type==='none'){c.transition='none';c.fadeIn=0;c.fadeOut=0;}
 else{length=Math.min(length,c.duration/2,previous.duration/2);const old=c.start,target=previous.start+previous.duration-length,delta=target-old;project.clips.filter(x=>x.track==='video'&&x.start>=old).forEach(x=>x.start=Math.max(0,x.start+delta));c.transition=type;c.transitionDuration=length;}
 playhead=c.start;commit();toast(type==='none'?'Transition removed.':'Transition applied. Preview it from the cut.');
}
function canvasBounds(){return canvas.getBoundingClientRect();}
function showBox(x,y,w,h){const r=canvasBounds(),stage=$('#stage').getBoundingClientRect(),el=$('#region-draft');Object.assign(el.style,{left:(r.left-stage.left+x*r.width)+'px',top:(r.top-stage.top+y*r.height)+'px',width:(w*r.width)+'px',height:(h*r.height)+'px'});el.hidden=false;}
function showRegionBox(c,t){const p=Model.poseAt(c,t-c.start);showBox(.5+p.x/100-p.width/200,.5+p.y/100-p.height/200,p.width/100,p.height/100);}
function pointOnCanvas(e){const r=canvasBounds();return {x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)};}
function beginBlur(){if(exporting)return;if(project.locked.blur)return toast('Unlock the Blur regions track first.');stop();blurDrawing=true;$('#region-hint').hidden=false;$('#blur-area').classList.add('active');canvas.style.cursor='crosshair';toast('Drag a rectangle over the text or logo in the preview.');}
function endBlurMode(){blurDrawing=false;$('#region-hint').hidden=true;$('#blur-area').classList.remove('active');canvas.style.cursor='move';}
$('#blur-area').onclick=beginBlur;
canvas.addEventListener('pointerdown',e=>{
 if(exporting||e.button!==0)return;const p=pointOnCanvas(e);if(blurDrawing){previewDrag={region:true,start:p,last:p};showBox(p.x,p.y,0,0);}
 else {const c=current();if(!c||!['video','overlay','text','blur'].includes(c.track)||!isActive(c,Math.min(playhead,duration()-.001))||!requireEditable())return;checkpoint();const pose=Model.poseAt(c,playhead-c.start);previewDrag={id:c.id,start:p,x:pose.x,y:pose.y};stop();}
 e.preventDefault();
});
window.addEventListener('pointermove',e=>{
 if(!previewDrag)return;const p=pointOnCanvas(e),d=previewDrag;
 if(d.region){d.last=p;showBox(Math.min(d.start.x,p.x),Math.min(d.start.y,p.y),Math.abs(p.x-d.start.x),Math.abs(p.y-d.start.y));return;}
 const c=project.clips.find(c=>c.id===d.id);if(!c)return;c.x=clamp(d.x+(p.x-d.start.x)*100,-100,100);c.y=clamp(d.y+(p.y-d.start.y)*100,-100,100);if(c.keyframes.length)upsertKeyframe(c,{x:c.x,y:c.y});
});
window.addEventListener('pointerup',()=>{
 if(!previewDrag)return;const d=previewDrag;previewDrag=null;
 if(d.region){if(exporting||project.locked.blur){endBlurMode();return;}const w=Math.abs(d.last.x-d.start.x),h=Math.abs(d.last.y-d.start.y);if(w<.008||h<.008){toast('Drag a larger rectangle to blur.');return;}checkpoint();const base=current(),start=base&&isActive(base,playhead)?base.start:playhead,end=base&&isActive(base,playhead)?base.start+base.duration:Math.max(playhead+3,duration());const c={...Model.clone(defaults),id:uid(),track:'blur',name:'Blurred text / logo',start,duration:end-start,width:w*100,height:h*100,x:((d.last.x+d.start.x)/2-.5)*100,y:((d.last.y+d.start.y)/2-.5)*100,opacity:100,blurRadius:24,blurMode:'blur'};project.clips.push(c);selected=c.id;endBlurMode();commit();toast('Area blurred. Adjust its strength and timing in Properties.');}
 else{renderInspector();scheduleSave();}
});
function updateGuides(){const el=$('#ad-safe-guide');if(el.hidden)return;const r=canvasBounds(),stage=$('#stage').getBoundingClientRect();Object.assign(el.style,{left:r.left-stage.left+r.width*.08+'px',top:r.top-stage.top+r.height*.13+'px',width:r.width*.84+'px',height:r.height*.66+'px'});}
$('#safe-zones').onclick=()=>{const el=$('#ad-safe-guide');el.hidden=!el.hidden;$('#safe-zones').classList.toggle('active',!el.hidden);updateGuides();};
function upsertKeyframe(c,patch={}){const time=clamp(playhead-c.start,0,c.duration),pose={...Model.poseAt(c,time),...patch};let k=c.keyframes.find(k=>Math.abs(k.time-time)<.035);if(k)Object.assign(k,pose);else c.keyframes.push({time,...pose});c.keyframes.sort((a,b)=>a.time-b.time);}
function addKeyframe(){const c=current();if(!c||!requireEditable())return;if(!isActive(c,Math.min(playhead,duration()-.001)))return toast('Place the playhead inside this clip.');checkpoint();upsertKeyframe(c);commit();toast('Keyframe added. Move the playhead and change the position or scale for motion.');}
const baseInspector=renderInspector;
renderInspector=function(){
 const c=current();if(inspectedClipId!==(c?.id||null)){$('.inspector').scrollTop=0;inspectedClipId=c?.id||null;}if(!c){baseInspector();return;}hydrate();
 if(['overlay','blur'].includes(c.track)){
  $('#inspector-tab').textContent=c.track==='blur'?'Blur region':'Layer';$('#inspector-content').innerHTML=`<div class="inspector-section"><h3>${esc(c.name)}</h3><p class="small-help">Drag the preview to move this ${c.track==='blur'?'region':'layer'}.</p></div>`;
 }else baseInspector();
 const root=$('#inspector-content');const words=$('#text-value');if(words&&c.isCaption){const updateWords=words.oninput;words.oninput=e=>{updateWords?.(e);const label=$(`[data-caption-id="${c.id}"] span`);if(label)label.textContent=c.text;};}
 if(c.track==='blur')root.insertAdjacentHTML('beforeend',`<div class="inspector-section"><h3>Blur selection</h3><label class="field">Style<select data-enhance="blurMode"><option value="blur" ${c.blurMode==='blur'?'selected':''}>Soft blur</option><option value="pixelate" ${c.blurMode==='pixelate'?'selected':''}>Pixelate</option></select></label>${enhancedRange('Strength','blurRadius',c.blurRadius,2,70)}${enhancedRange('Opacity %','opacity',c.opacity,0,100)}${enhancedRange('Width %','width',c.width,1,100)}${enhancedRange('Height %','height',c.height,1,100)}${enhancedRange('Position X','x',c.x,-50,50)}${enhancedRange('Position Y','y',c.y,-50,50)}<button id="redraw-blur" class="secondary wide">Draw another blur region</button></div>`);
 if(['video','overlay'].includes(c.track))root.insertAdjacentHTML('beforeend',`<div class="inspector-section"><h3>${c.track==='overlay'?'Layer transform':'Frame & crop'}</h3>${c.track==='overlay'?enhancedRange('Scale %','scale',c.scale,5,600)+enhancedRange('Position X','x',c.x,-100,100)+enhancedRange('Position Y','y',c.y,-100,100)+enhancedRange('Rotate °','rotation',c.rotation,-180,180)+enhancedRange('Opacity %','opacity',c.opacity,0,100):''}<label class="field">Frame fit<select data-enhance="fit"><option value="cover" ${c.fit==='cover'?'selected':''}>Fill frame</option><option value="contain" ${c.fit==='contain'?'selected':''}>Fit inside</option></select></label><div class="pill-row"><button data-toggle="flipX" class="pill ${c.flipX?'active':''}">Flip ↔</button><button data-toggle="flipY" class="pill ${c.flipY?'active':''}">Flip ↕</button></div>${enhancedRange('Crop left %','cropLeft',c.cropLeft,0,45)}${enhancedRange('Crop right %','cropRight',c.cropRight,0,45)}${enhancedRange('Crop top %','cropTop',c.cropTop,0,45)}${enhancedRange('Crop bottom %','cropBottom',c.cropBottom,0,45)}${c.track==='overlay'?'<button id="layer-up" class="secondary">Bring forward</button> <button id="layer-down" class="secondary">Send backward</button>':'<button id="copy-to-overlay" class="secondary wide">Duplicate as an upper video layer</button>'}</div>`);
 if(c.track==='overlay')root.insertAdjacentHTML('beforeend',`<div class="inspector-section"><h3>Layer color</h3>${enhancedRange('Brightness','brightness',c.brightness,0,200)}${enhancedRange('Contrast','contrast',c.contrast,0,200)}${enhancedRange('Saturation','saturation',c.saturation,0,200)}</div>`);
 if(c.track==='text')root.insertAdjacentHTML('beforeend',`<div class="inspector-section"><h3>Caption / text card</h3><label class="field">Background<input data-toggle-input="background" type="checkbox" ${c.background?'checked':''}></label><label class="field">Background color<input data-enhance="bgColor" type="color" value="${c.bgColor}"></label>${enhancedRange('Background %','bgOpacity',c.bgOpacity,0,100)}<label class="field">Text outline<input data-toggle-input="stroke" type="checkbox" ${c.stroke?'checked':''}></label></div>`);
 const a=assets.get(c.assetId);if(c.track==='audio'||a?.type==='video')root.insertAdjacentHTML('beforeend',`<div class="inspector-section"><h3>Sound tools</h3><button id="mute-clip" class="secondary wide">${c.audioMuted?'Unmute this clip':'Mute this clip'}</button>${['video','overlay'].includes(c.track)?`<button id="inspector-detach" class="secondary wide" ${c.audioDetached?'disabled':''}>${c.audioDetached?'Audio already detached':'Detach audio to its own track'}</button>`:''}${enhancedRange('Gain · dB','gainDb',c.gainDb,-30,12,.5)}<label class="field">Sound role<select data-enhance="audioRole">${[['other','Other'],['voice','Voiceover'],['music','Music']].map(([v,l])=>`<option value="${v}" ${c.audioRole===v?'selected':''}>${l}</option>`).join('')}</select></label><label class="field">Lower under voiceover<input data-toggle-input="ducking" type="checkbox" ${c.ducking?'checked':''}></label><label class="field">Sound preset<select data-enhance="audioPreset">${[['original','Original'],['voice','Voice clarity'],['bass','Bass boost'],['telephone','Telephone']].map(([v,l])=>`<option value="${v}" ${c.audioPreset===v?'selected':''}>${l}</option>`).join('')}</select></label><button id="normalize-audio" class="secondary wide">Normalize selected audio</button><button id="download-clip-audio" class="secondary wide">Download clip audio · WAV</button><p class="small-help">Speed changes use varispeed, which also changes pitch.</p></div>`);
 root.insertAdjacentHTML('beforeend',`<div class="inspector-section"><h3>Fades</h3>${enhancedRange('Fade in · sec','fadeIn',c.fadeIn,0,Math.min(5,c.duration/2),.1)}${enhancedRange('Fade out · sec','fadeOut',c.fadeOut,0,Math.min(5,c.duration/2),.1)}</div>`);
 if(['overlay','blur'].includes(c.track))root.insertAdjacentHTML('beforeend',`<div class="inspector-section"><h3>Timing</h3>${enhancedNumber('Start · seconds','start',c.start,0)}${enhancedNumber('Duration · seconds','duration',c.duration,.1)}${c.assetId?enhancedNumber('Source in · seconds','in',c.in,0):''}</div>`);
 root.insertAdjacentHTML('beforeend',`<div class="inspector-section"><h3>Motion keyframes <span class="badge">${c.keyframes.length}</span></h3><button id="add-keyframe" class="secondary wide">◇ Add keyframe at playhead</button><div class="keyframe-list">${c.keyframes.map((k,i)=>`<button data-seek-keyframe="${i}">${time(c.start+k.time)} <span data-remove-keyframe="${i}">×</span></button>`).join('')}</div><p class="small-help">Position, scale, rotation, opacity, and blur size interpolate between keyframes.</p></div><div class="inspector-section"><button id="trim-before" class="secondary wide">Trim start to playhead</button><button id="trim-after" class="secondary wide">Trim end to playhead</button></div>`);
 $$('[data-enhance]',root).forEach(el=>{el.oninput=()=>{if(!requireEditable()||el.value==='')return;if(!el.dataset.editing){checkpoint();el.dataset.editing='1';}const key=el.dataset.enhance;let v=el.type==='range'||el.type==='number'?Number(el.value):el.value;if(typeof v==='number'&&!Number.isFinite(v))return;const a=assets.get(c.assetId);if(key==='duration')v=clamp(v,.1,a&&a.type!=='image'?(a.duration-c.in)/c.speed:3600);if(key==='in')v=clamp(v,0,Math.max(0,a.duration-c.duration*c.speed));if(key==='start')v=Math.max(0,v);c[key]=v;if(c.keyframes.length&&['x','y','scale','rotation','opacity','width','height'].includes(key))upsertKeyframe(c,{[key]:v});if(el.nextElementSibling?.tagName==='OUTPUT')el.nextElementSibling.textContent=v;renderTimeline();updateControls();scheduleSave();};el.onchange=()=>{delete el.dataset.editing;renderInspector();};});
 $$('[data-prop]',root).forEach(el=>{const prior=el.oninput;el.oninput=e=>{if(!requireEditable())return;prior?.(e);const key=el.dataset.prop;if(c.keyframes.length&&['x','y','scale','rotation','opacity'].includes(key))upsertKeyframe(c,{[key]:Number(el.value)});};});
 $$('[data-toggle]',root).forEach(b=>b.onclick=()=>{if(!requireEditable())return;checkpoint();c[b.dataset.toggle]=!c[b.dataset.toggle];commit();});
 $$('[data-toggle-input]',root).forEach(el=>el.onchange=()=>{if(!requireEditable())return;checkpoint();c[el.dataset.toggleInput]=el.checked;commit();});
 if($('#inspector-detach'))$('#inspector-detach').onclick=detachAudio;if($('#mute-clip'))$('#mute-clip').onclick=()=>{if(!requireEditable())return;checkpoint();c.audioMuted=!c.audioMuted;commit();};
 if($('#normalize-audio'))$('#normalize-audio').onclick=normalizeAudio;if($('#download-clip-audio'))$('#download-clip-audio').onclick=()=>exportWav(true);
 if($('#copy-to-overlay'))$('#copy-to-overlay').onclick=()=>typeof copyClipToLayer==='function'?copyClipToLayer():addOverlay(c.assetId);if($('#redraw-blur'))$('#redraw-blur').onclick=beginBlur;
 if($('#layer-up'))$('#layer-up').onclick=()=>reorderLayer(1);if($('#layer-down'))$('#layer-down').onclick=()=>reorderLayer(-1);
 $('#add-keyframe').onclick=addKeyframe;$$('[data-seek-keyframe]',root).forEach(b=>b.onclick=e=>{const remove=e.target.dataset.removeKeyframe;if(remove!==undefined){checkpoint();c.keyframes.splice(Number(remove),1);commit();}else{stop();playhead=c.start+c.keyframes[Number(b.dataset.seekKeyframe)].time;updatePlayhead();}});
 $('#trim-before').onclick=()=>trimToPlayhead(true);$('#trim-after').onclick=()=>trimToPlayhead(false);if(clipLocked(c))$$('input,select,textarea,button',root).forEach(el=>el.disabled=true);
};
function enhancedRange(label,key,value,min,max,step=1){return `<label class="field">${label}<input data-enhance="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${Number(value).toFixed(step<1?1:0)}</output></label>`;}
function enhancedNumber(label,key,value,min){return `<label class="field">${label}<input data-enhance="${key}" type="number" min="${min}" step=".1" value="${Number(value||0).toFixed(2)}"></label>`;}
function trimToPlayhead(before){const c=current();if(!c||!requireEditable())return;const local=playhead-c.start;if(local<=.05||local>=c.duration-.05)return toast('Place the playhead inside this clip.');checkpoint();Object.assign(c,Model.sliceClip(c,before?local:0,before?c.duration-local:local));commit();}
function reorderLayer(direction){const c=current(),list=project.clips.filter(x=>x.track==='overlay').sort((a,b)=>a.layer-b.layer),i=list.indexOf(c),other=list[i+direction];if(!other||!requireEditable())return;checkpoint();[c.layer,other.layer]=[other.layer,c.layer];commit();}

// Offline audio export, caption audio preparation, and normalization use real samples.
async function renderAudioBuffer(onlySelected=false,sampleRate=44100,allowSilent=false){
 const c=current();let clips=onlySelected?[c].filter(Boolean):project.clips.filter(x=>x.assetId&&assets.get(x.assetId)?.type!=='image');
 if(onlySelected&&(!c?.assetId||assets.get(c.assetId)?.type==='image'))throw new Error('Select a video or audio clip with sound.');
 const length=onlySelected?c.duration:duration();if(length<=0)throw new Error('Add an audio or video clip first.');
 const offline=new OfflineAudioContext(sampleRate===16000?1:2,Math.ceil(length*sampleRate),sampleRate);const master=offline.createDynamicsCompressor();master.threshold.value=-1;master.knee.value=0;master.ratio.value=20;master.attack.value=.003;master.release.value=.05;master.connect(offline.destination);let readable=0;
 for(const clip of clips){
  let buffer;try{buffer=await decodeAudioAsset(assets.get(clip.assetId));}catch{if(allowSilent&&clip.track==='audio'&&!clip.audioMuted&&!project.muted.audio)throw new Error('Could not decode audio: '+clip.name);continue;}readable++;
  const source=offline.createBufferSource();source.buffer=buffer;source.playbackRate.value=clip.speed||1;const filter=offline.createBiquadFilter(),compressor=offline.createDynamicsCompressor(),gain=offline.createGain();source.connect(filter);filter.connect(compressor);compressor.connect(gain);gain.connect(master);configureAudioNodes(clip,{filter,compressor});
  const start=onlySelected?0:clip.start,end=start+clip.duration,step=.02;
  gain.gain.setValueAtTime(0,0);
  for(let t=0;t<clip.duration;t+=step){const absolute=clip.start+t,value=audioLevel(clip,absolute,onlySelected);gain.gain.linearRampToValueAtTime(value,start+t);}
  gain.gain.setValueAtTime(0,end);
  const sourceLength=Math.max(0,Math.min(clip.duration*(clip.speed||1),buffer.duration-(clip.in||0)));if(sourceLength>0)source.start(start,clip.in||0,sourceLength);
 }
 if(!readable&&!allowSilent)throw new Error('No decodable audio was found in this selection.');return offline.startRendering();
}
function wavBlob(buffer){
 const channels=buffer.numberOfChannels,frames=buffer.length,bytes=frames*channels*2,view=new DataView(new ArrayBuffer(44+bytes));
 const string=(offset,text)=>[...text].forEach((char,i)=>view.setUint8(offset+i,char.charCodeAt(0)));string(0,'RIFF');view.setUint32(4,36+bytes,true);string(8,'WAVE');string(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);string(36,'data');view.setUint32(40,bytes,true);
 const data=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));let offset=44;for(let i=0;i<frames;i++)for(let ch=0;ch<channels;ch++){const value=clamp(data[ch][i],-1,1);view.setInt16(offset,value*(value<0?32768:32767),true);offset+=2;}
 return new Blob([view],{type:'audio/wav'});
}
async function exportWav(selectedOnly){if(exporting)return;try{toast('Rendering your audio locally…');const buffer=await renderAudioBuffer(selectedOnly);download(wavBlob(buffer),slug()+(selectedOnly?' — clip audio':' — audio mix')+'.wav');toast('WAV audio downloaded.');}catch(e){toast(e.message);}}
async function normalizeAudio(){const c=current();if(!c||!requireEditable())return;const before=JSON.stringify(c);try{const buffer=await decodeAudioAsset(assets.get(c.assetId));if(exporting||current()!==c||!project.clips.includes(c)||clipLocked(c)||JSON.stringify(c)!==before)return toast('Audio changed. Select it and normalize again.');let peak=0;const start=Math.floor(c.in*buffer.sampleRate),end=Math.min(buffer.length,start+Math.ceil(c.duration*c.speed*buffer.sampleRate));for(let channel=0;channel<buffer.numberOfChannels;channel++){const samples=buffer.getChannelData(channel);for(let i=start;i<end;i++)peak=Math.max(peak,Math.abs(samples[i]));}if(peak<.00001)return toast('This selection is silent.');checkpoint();c.gainDb=clamp(20*Math.log10(.9/(peak*(c.volume/100||1))),-30,12);commit();toast('Gain adjusted toward a −1 dB peak.');}catch(e){toast(e.message);}}
function captionData(text,start,length){return {...Model.clone(defaults),id:uid(),track:'text',name:text.slice(0,32),text,start,duration:length,isCaption:true,fontSize:58,fontWeight:800,color:'#ffffff',x:0,y:31,scale:100,opacity:100,background:true,bgColor:'#111318',bgOpacity:85,stroke:false,shadow:false};}
function addCaption(text,start,length){if(exporting)return;if(project.locked.text)return toast('Unlock the Text & captions track first.');checkpoint();const c=captionData(text,start,length);project.clips.push(c);selected=c.id;commit();if(tab==='captions')renderLibrary();}
function addCaptionBatch(items){if(exporting)return toast('Finish exporting before adding captions.');if(project.locked.text)return toast('Unlock the Text & captions track first.');if(!items.length)return toast('No subtitle cues found.');checkpoint();const clips=items.map(c=>captionData(c.text,c.start,c.duration));project.clips.push(...clips);selected=clips[0].id;playhead=clips[0].start;commit();renderLibrary();toast(`${clips.length} editable captions added.`);}
$('#subtitle-input').onchange=async e=>{const file=e.target.files[0];if(!file||exporting)return;try{const cues=Model.parseSubtitles(await file.text());addCaptionBatch(cues);}catch(e){toast('Could not read subtitles: '+e.message);}e.target.value='';};
function exportSrt(){const captions=project.clips.filter(c=>c.isCaption);if(!captions.length)return toast('Add or generate captions first.');download(new Blob([Model.toSrt(captions)],{type:'application/x-subrip'}),slug()+'.srt');}
function styleCaptions(style){if(exporting)return;if(project.locked.text)return toast('Unlock the Text & captions track first.');const captions=project.clips.filter(c=>c.isCaption);if(!captions.length)return toast('Add captions first.');checkpoint();for(const c of captions)Object.assign(c,style==='bold'?{fontSize:76,fontWeight:800,color:'#ffffff',background:false,stroke:true,y:27}:style==='highlight'?{fontSize:65,fontWeight:800,color:'#142622',background:true,bgColor:'#f5df64',bgOpacity:100,stroke:false,y:30}:{fontSize:58,fontWeight:600,color:'#ffffff',background:true,bgColor:'#111318',bgOpacity:85,stroke:false,y:31});commit();}
async function generateCaptions(){
 if(captionBusy||exporting)return;const scope=$('#caption-source').value,language=$('#caption-language').value,chosen=current(),offset=scope==='selected'?(chosen?.start||0):0;
 captionBusy=true;const startedProject=project.id;let snapshotBefore=snapshot();try{
  $('#auto-captions').disabled=true;$('#auto-captions').textContent='Preparing audio…';const audio=wavBlob(await renderAudioBuffer(scope==='selected',16000));
  const response=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav','X-Cutline-Language':language},body:audio});const result=await response.json();if(!response.ok)throw new Error(result.error||'Local transcription is unavailable.');if(!captionBusy){await fetch('/api/jobs/'+result.id+'/cancel',{method:'POST'});return;}captionJob=result.id;
  if(tab==='captions')renderLibrary();toast('Whisper is transcribing locally. You can keep editing.');
  while(captionBusy){await new Promise(resolve=>setTimeout(resolve,1200));const r=await fetch('/api/jobs/'+encodeURIComponent(captionJob));const job=await r.json();if(!r.ok)throw new Error(job.error||'Transcription job unavailable.');if(job.status==='failed')throw new Error(job.error||'Transcription failed.');if(job.status==='cancelled')break;if(job.status==='done'){
    if(project.id!==startedProject)throw new Error('The project changed. Captions were not added to a different project.');const cues=Model.parseSubtitles(job.srt||'').map(c=>({...c,start:c.start+offset}));
    const changed=snapshotBefore!==snapshot();addCaptionBatch(cues);if(changed)toast(`${cues.length} captions added using the timeline timing from when transcription started.`);break;
   }
  }
 }catch(e){toast(e.message);}finally{captionBusy=false;captionJob=null;if(tab==='captions')renderLibrary();}
}
async function cancelCaptions(){const id=captionJob;captionBusy=false;captionJob=null;if(id)await fetch('/api/jobs/'+encodeURIComponent(id)+'/cancel',{method:'POST'}).catch(()=>{});if(tab==='captions')renderLibrary();toast('Transcription cancelled.');}

// Context menus and shortcuts keep cutting and audio tools one gesture away.
function closeContextMenu(){$('#clip-menu')?.remove();}
$('#track-area').addEventListener('contextmenu',e=>{
 const element=e.target.closest('[data-clip]');if(!element)return;e.preventDefault();selectClip(element.dataset.clip);closeContextMenu();
 const c=current(),menu=document.createElement('div');menu.id='clip-menu';menu.className='clip-menu';menu.innerHTML=`<button data-command="split">Split at playhead <small>⌘ B</small></button><button data-command="detach" ${!['video','overlay'].includes(c.track)||assets.get(c.assetId)?.type!=='video'||c.audioDetached?'disabled':''}>Detach audio</button><button data-command="copy">Copy clip <small>⌘ C</small></button><button data-command="duplicate">Duplicate</button><button data-command="mute" ${!c.assetId||assets.get(c.assetId)?.type==='image'?'disabled':''}>${c.audioMuted?'Unmute':'Mute'} clip audio</button><button data-command="ripple">Ripple delete</button><button data-command="delete">Delete <small>⌫</small></button>`;document.body.append(menu);menu.style.left=Math.min(e.clientX,innerWidth-225)+'px';menu.style.top=Math.min(e.clientY,innerHeight-menu.offsetHeight-12)+'px';
 menu.onclick=e=>{const command=e.target.closest('[data-command]')?.dataset.command;if(!command)return;closeContextMenu();({split:splitClip,detach:detachAudio,copy:()=>{clipboardClip=Model.clone(c);toast('Clip copied. Paste it at the playhead.');},duplicate:duplicateClip,mute:()=>{if(!requireEditable())return;checkpoint();c.audioMuted=!c.audioMuted;commit();},ripple:rippleDelete,delete:deleteClip})[command]?.();};
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#clip-menu'))closeContextMenu();});
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){endBlurMode();previewDrag=null;$('#region-draft').hidden=true;closeContextMenu();return;}
 if(e.target.matches('input,textarea,select')||$('dialog[open]')||exporting)return;
 const command=e.metaKey||e.ctrlKey;if(command&&((e.code==='KeyC'&&getSelectionIds().length>1)||(e.code==='KeyV'&&typeof multiClipboard!=='undefined'&&multiClipboard)))return;if(command&&e.code==='KeyC'&&current()){e.preventDefault();clipboardClip=Model.clone(current());toast('Clip copied.');}
 if(command&&e.code==='KeyV'&&clipboardClip){e.preventDefault();if(project.locked[clipboardClip.track])return toast('Unlock the destination track first.');checkpoint();const clip={...Model.clone(clipboardClip),id:uid(),start:playhead};if(clip.track==='overlay')clip.layer=Math.max(0,...project.clips.filter(c=>c.track==='overlay').map(c=>c.layer||0))+1;project.clips.push(clip);selected=clip.id;commit();}
 if(!command&&e.code==='KeyB'){e.preventDefault();e.shiftKey?splitAll():splitClip();}
 if(!command&&e.code==='KeyD'&&e.shiftKey){e.preventDefault();detachAudio();}
},true);
$('#timeline-scroll').addEventListener('scroll',()=>{$('.track-labels').style.transform=`translateY(-${$('#timeline-scroll').scrollTop}px)`;});


// Preserve legacy projects while rejecting broken timing/animation structures.
const validateLegacyProject=validateProject;
validateProject=function(p,records){
 validateLegacyProject(p,records);const ids=new Set();
 for(const a of records)if(typeof a.id!=='string'||!['audio','video','image'].includes(a.type))throw new Error('Invalid media asset.');
 for(const c of p.clips){
  if(ids.has(c.id))throw new Error('Duplicate clip identity.');ids.add(c.id);
  if(c.assetId){if(!Number.isFinite(c.in)||c.in<0||!Number.isFinite(c.speed)||c.speed<.125||c.speed>8)throw new Error('Invalid media timing.');}
  for(const key of ['x','y','scale','rotation','opacity','width','height','fontSize','volume','gainDb','fadeIn','fadeOut','blurRadius','cropLeft','cropRight','cropTop','cropBottom','layer'])if(c[key]!==undefined&&!Number.isFinite(c[key]))throw new Error('Invalid clip property.');
  if(c.keyframes!==undefined&&(!Array.isArray(c.keyframes)||c.keyframes.length>5000))throw new Error('Invalid animation data.');
  for(const k of c.keyframes||[]){if(!Number.isFinite(k.time)||k.time<0)throw new Error('Invalid keyframe time.');for(const key of ['x','y','scale','rotation','opacity','width','height'])if(k[key]!==undefined&&!Number.isFinite(k[key]))throw new Error('Invalid keyframe value.');}
  for(const key of ['color','bgColor'])if(c[key]!==undefined&&!/^#[0-9a-f]{6}$/i.test(c[key]))throw new Error('Invalid text color.');
 }
 return p;
};

// Give the player more space, or expand the timeline when stacking many layers.
$('.workspace').insertAdjacentHTML('beforeend','<div id="workspace-resizer" title="Drag to resize the timeline" role="separator" aria-label="Resize timeline" aria-orientation="horizontal"></div>');
$('#workspace-resizer').onpointerdown=e=>{e.preventDefault();const root=$('.workspace'),bounds=root.getBoundingClientRect();const move=e=>{root.style.setProperty('--timeline-height',clamp(bounds.bottom-e.clientY,250,Math.max(250,bounds.height-220))+'px');renderTimeline();};const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish);};

async function finishVideoDownload(blob,mime){
 let finishingFailed=false;let ready=blob,extension=mime.startsWith('video/mp4')?'.mp4':'.webm';
 if(extension==='.mp4'){
  exportFinalizing=true;finalizeAbort=new AbortController();
  $('#export-progress span').textContent='Finishing MP4 · stable 30 fps for your ads…';
  $('#export-progress i').style.width='100%';
  try{
   const capabilities=await fetch('/api/capabilities',{signal:finalizeAbort.signal}).then(r=>r.json());
   if(capabilities.mp4_finishing){
    const response=await fetch('/api/finalize-video',{method:'POST',headers:{'Content-Type':blob.type},body:blob,signal:finalizeAbort.signal});
    if(!response.ok){const failure=await response.json();throw new Error(failure.error||'MP4 finishing failed');}
    ready=await response.blob();
   }
  }catch(error){
   if(error.name==='AbortError')exportCancelled=true;
   else finishingFailed=true;
  }finally{exportFinalizing=false;finalizeAbort=null;}
 }
 if(!exportCancelled){download(ready,slug()+extension);toast(finishingFailed?'Export downloaded as a browser recording; local MP4 finishing failed.':'Your video is ready. Export downloaded.');}
}
const cancelBrowserExport=cancelExport;
cancelExport=function(){if(exportFinalizing){exportCancelled=true;finalizeAbort?.abort();}else cancelBrowserExport();};
$('#cancel-export').onclick=cancelExport;

const addMediaBeforeLocks=addAsset;
addAsset=function(id,at,track){return addMediaBeforeLocks(id,at,track);};
const addTextBeforeLocks=addText;
addText=function(style){if(exporting||project.locked.text){toast('Unlock the Text & captions track first.');return null;}addTextBeforeLocks(style);return current();};
