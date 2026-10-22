/* Independent clip selection/dragging and one unified media-drop pipeline. */
(function(root){
'use strict';
const limit=(v,a,b)=>Math.max(a,Math.min(b,v));
function mediaType(file){
 const mime=file.type||'';
 for(const type of ['video','audio','image'])if(mime.startsWith(type+'/'))return type;
 const extension=(file.name||'').split('.').pop().toLowerCase();
 if(['mp4','mov','m4v','webm','mkv'].includes(extension))return 'video';
 if(['mp3','wav','m4a','aac','ogg','flac','aiff','aif'].includes(extension))return 'audio';
 if(['png','jpg','jpeg','webp','gif','svg','bmp','avif'].includes(extension))return 'image';
 return null;
}
function targetTrack(asset,requested){
 if(asset.type==='audio')return 'audio';
 return requested==='overlay'?'overlay':'video';
}
function create(options){
 const {element,window:win,document:doc}=options;
 let gesture=null,internalAsset=null,internalTrack=null,lastDragEnd=-Infinity;
 const off=[];
 function listen(node,type,handler,capture=false){node.addEventListener(type,handler,capture);off.push(()=>node.removeEventListener(type,handler,capture));}
 function selectionIds(){return options.getSelectedIds?options.getSelectedIds():options.getSelected()?[options.getSelected()]:[];}
 function setMany(ids,primary){if(options.setSelection)options.setSelection(ids,primary);else options.setSelected(primary||ids.at(-1)||null);}
 function syncSelection(){
  const selected=options.getSelected(),ids=new Set(selectionIds());let matched=false;
  for(const el of element.querySelectorAll('[data-clip]')){
   const active=ids.has(el.dataset.clip);matched=matched||el.dataset.clip===selected;
   el.classList.toggle('selected',active);el.setAttribute('role','option');el.setAttribute('aria-selected',String(active));el.tabIndex=active?0:-1;
   el.id='timeline-clip-'+el.dataset.clip;
  }
  element.setAttribute('role','listbox');element.setAttribute('aria-label','Timeline clips');element.setAttribute('aria-multiselectable',String(!!options.getSelectedIds));element.tabIndex=0;
  if(matched)element.setAttribute('aria-activedescendant','timeline-clip-'+selected);else element.removeAttribute('aria-activedescendant');
 }
 function finishGesture(event){
  const previous=gesture;gesture=null;element.querySelector('.selection-marquee')?.remove();
  if(previous?.changed){if(!previous.edge)options.finishMove?.(previous);options.renderTimeline();options.commitGesture();}options.clearMoveHint?.();
  try{if(previous?.pointerId!==undefined&&element.hasPointerCapture?.(previous.pointerId))element.releasePointerCapture(previous.pointerId);}catch{}
 }
 function pointerDown(event){
  if(options.isBusy()||event.button!==0)return;
  const el=event.target.closest?.('[data-clip]');
  if(el&&element.contains(el)){
   const c=options.getProject().clips.find(c=>c.id===el.dataset.clip);if(!c)return;
   const edge=event.target.closest?.('[data-edge]')?.dataset.edge,ids=selectionIds();
   if(options.setSelection&&(event.shiftKey||event.metaKey||event.ctrlKey)){
    const next=ids.includes(c.id)?ids.filter(id=>id!==c.id):[...ids,c.id];setMany(next,next.includes(c.id)?c.id:next.at(-1));options.pause();options.renderSelection();syncSelection();event.preventDefault();return;
   }
   if(edge||!ids.includes(c.id))options.setSelected(c.id);
   options.pause();options.renderSelection();syncSelection();
   const group=options.getProject().clips.filter(x=>selectionIds().includes(x.id));
   if(group.some(x=>options.getProject().locked?.[x.track])){options.notify('Unlock the selected tracks before moving these clips.');return;}
   gesture={group:group.map(options.clone),id:c.id,x:event.clientX,y:event.clientY,scroll:options.getScroll(),edge,original:options.clone(c),changed:false,pointerId:event.pointerId};
  }else{
   const ruler=event.target.closest?.('#ruler,[data-ruler]');
   if(options.setSelection&&!ruler){
    const additive=event.shiftKey||event.metaKey||event.ctrlKey,base=additive?selectionIds():[];if(!additive)setMany([]);
    options.pause();options.renderSelection();syncSelection();options.seek(options.positionAt(event));gesture={marquee:true,x:event.clientX,y:event.clientY,base,pointerId:event.pointerId};
   }else{if(!ruler)options.setSelected(null);options.pause();options.renderSelection();syncSelection();options.seek(options.positionAt(event));gesture={seek:true,pointerId:event.pointerId};}
  }
  element.focus?.({preventScroll:true});
  try{if(event.pointerId!==undefined)element.setPointerCapture?.(event.pointerId);}catch{}
  event.preventDefault();
 }
 function pointerMove(event){
  if(!gesture)return;
  if(gesture.marquee){
   const g=gesture;if(Math.hypot(event.clientX-g.x,event.clientY-g.y)<4)return;
   const left=Math.min(g.x,event.clientX),right=Math.max(g.x,event.clientX),top=Math.min(g.y,event.clientY),bottom=Math.max(g.y,event.clientY);
   const ids=[...g.base];for(const el of element.querySelectorAll('[data-clip]')){const r=el.getBoundingClientRect();if(r.right>=left&&r.left<=right&&r.bottom>=top&&r.top<=bottom)ids.push(el.dataset.clip);}
   setMany([...new Set(ids)]);options.renderSelection();syncSelection();
   const rect=element.getBoundingClientRect(),box=doc.createElement('div');box.className='selection-marquee';box.style.cssText=`left:${left-rect.left}px;top:${top-rect.top}px;width:${right-left}px;height:${bottom-top}px`;element.querySelector('.selection-marquee')?.remove();element.append(box);event.preventDefault();return;
  }
  if(gesture.seek){options.seek(options.positionAt(event));return;}
  const g=gesture,c=options.getProject().clips.find(c=>c.id===g.id);if(!c)return finishGesture(event);
  const pixels=event.clientX-g.x+options.getScroll()-g.scroll;
  // A click and normal hand jitter must never become an accidental trim/move.
  if(!g.edge)g.destination=options.previewMove?.(event,g)||null;
  if(!g.changed&&Math.abs(pixels)<4&&!(g.destination&&Math.abs(event.clientY-g.y)>6))return;
  if(!g.changed){options.checkpoint();g.changed=true;}
  const original=g.original,a=options.getAsset(c.assetId),source=a&&a.type!=='image',speed=original.speed||1;
  let delta=pixels/options.getZoom();
  if(g.edge==='right'){c.duration=limit(original.duration+delta,.1,source?(a.duration-(original.in||0))/speed:3600);if(original.keyframes?.length)c.keyframes=options.sliceClip(original,0,c.duration).keyframes;}
  else if(g.edge==='left'){
   delta=limit(delta,Math.max(-original.start,source?-(original.in||0)/speed:-original.start),original.duration-.1);
   c.start=original.start+delta;c.duration=original.duration-delta;if(source)c.in=(original.in||0)+delta*speed;
   if(original.keyframes?.length)c.keyframes=options.sliceClip(original,delta,c.duration).keyframes;
  }else{
   let start=Math.max(0,original.start+delta);
   if(!event.altKey&&!(g.destination&&Math.abs(pixels)<4)){
    const anchors=[0,options.getPlayhead(),...options.getProject().clips.filter(x=>!g.group.some(member=>member.id===x.id)&&x.track===c.track).flatMap(x=>[x.start,x.start+x.duration])];
    for(const anchor of anchors){if(Math.abs(start-anchor)*options.getZoom()<7){start=anchor;break;}if(Math.abs(start+c.duration-anchor)*options.getZoom()<7){start=anchor-c.duration;break;}}
   }
   const earliest=Math.min(...g.group.map(x=>x.start)),shift=Math.max(-earliest,start-original.start);
   for(const member of g.group){const target=options.getProject().clips.find(x=>x.id===member.id);if(target)target.start=member.start+shift;}
  }
  options.renderTimeline();options.showMoveHint?.(g);syncSelection();event.preventDefault();
 }
 function dragAsset(event){
  const card=event.target.closest?.('[data-asset],[data-layer-asset]');if(!card)return;
  const id=card.dataset.asset||card.dataset.layerAsset;if(!options.getAsset(id)||!event.dataTransfer)return;
  internalAsset=id;internalTrack=card.dataset.layerAsset?'overlay':null;if(internalTrack)event.dataTransfer.setData('application/cutline-track',internalTrack);event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/cutline-asset',id);event.dataTransfer.setData('text/plain','cutline-asset:'+id);
  options.clearDropHint();event.stopPropagation();
 }
 function assetId(data){
  if(!data)return internalAsset;
  const direct=data.getData?.('application/cutline-asset');if(direct&&options.getAsset(direct))return direct;
  const plain=data.getData?.('text/plain');if(plain?.startsWith('cutline-asset:')&&options.getAsset(plain.slice(14)))return plain.slice(14);
  return internalAsset;
 }
 function recognized(event){return internalAsset||[...(event.dataTransfer?.types||[])].some(t=>['Files','application/cutline-asset'].includes(t));}
 function dragOver(event){
  if(!recognized(event))return;event.preventDefault();
  if(options.isBusy()){event.dataTransfer.dropEffect='none';return;}
  const destination=options.dropLocation(event),asset=options.getAsset(internalAsset);if(!destination.track&&internalTrack)destination.track=internalTrack;
  if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
  options.showDropHint(destination,asset);
 }
 function clearDrag(){internalAsset=null;internalTrack=null;lastDragEnd=Date.now();options.clearDropHint();}
 async function drop(event){
  if(!recognized(event))return;
  event.preventDefault();event.stopImmediatePropagation();
  const destination=options.dropLocation(event),id=assetId(event.dataTransfer),files=[...(event.dataTransfer?.files||[])];if(!destination.track&&(internalTrack||event.dataTransfer?.getData?.('application/cutline-track')==='overlay'))destination.track='overlay';clearDrag();
  if(options.isBusy())return;
  try{
   if(id){
    const asset=options.getAsset(id);if(!asset||!destination.onTimeline)return;
    const track=options.resolveTrack?options.resolveTrack(asset,destination.track):targetTrack(asset,destination.track);if(options.getProject().locked?.[track])return options.notify('Unlock the destination track first.');
    options.placeAsset(id,track,destination.time,destination);return;
   }
   if(!files.length)return;
   const imported=await options.importFiles(files);
   if(!destination.onTimeline)return;
   const cursors={};let count=0;
   for(const asset of imported||[]){
    const track=options.resolveTrack?options.resolveTrack(asset,destination.track):targetTrack(asset,destination.track);
    if(options.getProject().locked?.[track]){options.notify('Imported to media. Unlock the destination track to add it.');continue;}
    const at=cursors[track]??destination.time,clip=options.placeAsset(asset.id,track,at,destination);
    if(clip){if(track!=='overlay')cursors[track]=clip.start+clip.duration;count++;}
   }
   if(count)options.notify(`${count} file${count===1?'':'s'} added to the timeline.`);
  }catch(error){options.notify('Could not add media: '+error.message);}
 }
 function bind(){
  listen(element,'pointerdown',pointerDown);listen(win,'pointermove',pointerMove);listen(win,'pointerup',finishGesture);listen(win,'pointercancel',finishGesture);listen(win,'blur',finishGesture);
  listen(doc,'dragstart',dragAsset,true);listen(win,'dragover',dragOver,true);listen(win,'drop',drop,true);listen(win,'dragend',clearDrag,true);
  listen(win,'dragleave',e=>{if(!e.relatedTarget&&(e.clientX<=0||e.clientY<=0||e.clientX>=win.innerWidth||e.clientY>=win.innerHeight))options.clearDropHint();},true);
  listen(doc,'click',e=>{if((internalAsset||Date.now()-lastDragEnd<250)&&e.target.closest?.('[data-asset],[data-layer-asset]')){e.preventDefault();e.stopImmediatePropagation();}},true);
  syncSelection();return api;
 }
 const api={bind,syncSelection,pointerDown,pointerMove,pointerUp:finishGesture,dragAsset,dragOver,drop,clearDrag,destroy:()=>{finishGesture();off.forEach(f=>f());options.clearDropHint();}};return api;
}
const api={create,mediaType,targetTrack};if(typeof module!=='undefined')module.exports=api;else root.CutlineInteractions=api;
})(globalThis);
