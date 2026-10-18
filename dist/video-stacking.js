/* Timeline height is real compositing order: higher layer rows draw last. */
function visualSelection(clips){return clips.length&&clips.every(c=>['video','overlay'].includes(c.track));}
function stackClips(clips,destination){
 if(!visualSelection(clips)||!destination)return false;
 if(project.locked[destination.track]||clips.some(c=>project.locked[c.track])){toast('Unlock the source and destination tracks to move these videos.');return false;}
 if(destination.track==='video'){for(const c of clips)c.track='video';return true;}
 const ids=new Set(clips.map(c=>c.id)),rest=project.clips.filter(c=>c.track==='overlay'&&!ids.has(c.id)).sort((a,b)=>(b.layer||0)-(a.layer||0)),moving=[...clips].sort((a,b)=>(b.layer||0)-(a.layer||0));
 const rows=[];for(const c of rest){let row=rows.find(r=>r.layer===(c.layer||0));if(!row){row={layer:c.layer||0,clips:[]};rows.push(row);}row.clips.push(c);}
 const added=[];for(const c of moving){const key=c.track==='overlay'?'layer-'+(c.layer||0):'clip-'+c.id;let row=added.find(r=>r.key===key);if(!row){row={key,clips:[]};added.push(row);}row.clips.push(c);}
 let index=destination.beforeId?rows.findIndex(row=>row.clips.some(c=>c.id===destination.beforeId)):0;if(destination.atBottom)index=rows.length;if(index<0)index=0;
 rows.splice(index,0,...added);rows.forEach((row,i)=>row.clips.forEach(c=>{c.track='overlay';c.layer=rows.length-i;}));return true;
}
function previewStackMove(event,g){
 clearTimelineDropHint();if(!visualSelection(g.group)||Math.abs(event.clientY-g.y)<16)return null;
 const overlay=$('#overlay-track').getBoundingClientRect(),video=$('#video-track').getBoundingClientRect(),ruler=$('#ruler').getBoundingClientRect();let destination=null;
 if(event.clientY>=video.top&&event.clientY<=video.bottom&&g.group.some(c=>c.track!=='video'))destination={track:'video'};
 else if(event.clientY>=ruler.bottom&&event.clientY<video.top){
  const rest=project.clips.filter(c=>c.track==='overlay'&&!g.group.some(x=>x.id===c.id)).sort((a,b)=>(b.layer||0)-(a.layer||0));
  const before=rest.find(c=>{const el=$(`[data-clip="${c.id}"]`);return el&&event.clientY<el.getBoundingClientRect().top+el.getBoundingClientRect().height/2;});
  destination={track:'overlay',beforeId:before?.id,atBottom:!before&&event.clientY>overlay.top+12};
 }
 g.lastX=event.clientX;return destination;
}
function showStackMoveHint(g){
 const destination=g.destination;if(!destination)return;
 const target=$('#'+destination.track+'-track');target.classList.add('drop-target');const hint=document.createElement('div');hint.id='timeline-drop-preview';hint.className='timeline-drop-preview stacking-drop-hint';hint.style.left=Math.max(0,(g.original.start+((g.lastX??g.x)-g.x)/zoom)*zoom)+'px';hint.style.width=Math.max(130,g.original.duration*zoom)+'px';
 hint.textContent=project.locked[destination.track]?'Track locked':destination.track==='overlay'?'Place video above · release to stack':'Move to main video';target.append(hint);
}

function finishStackMove(g){if(!g.destination)return;const clips=project.clips.filter(c=>g.group.some(x=>x.id===c.id));if(!stackClips(clips,g.destination)){for(const original of g.group){const c=project.clips.find(x=>x.id===original.id);if(c)Object.assign(c,Model.clone(original));}}}
function moveSelectedVideo(track){const clips=selectionClips();if(!visualSelection(clips))return toast('Select video or image clips first.');if(exporting||clips.some(clipLocked)||project.locked[track])return toast('Unlock the source and destination tracks first.');stop();checkpoint();stackClips(clips,{track});commit();drawFrame();}
const inspectorBeforeStacking=renderInspector;
renderInspector=function(){inspectorBeforeStacking();const clips=selectionClips();if(!visualSelection(clips))return;const section=document.createElement('div');section.className='inspector-section stacking-actions';section.innerHTML='<h3>Video stacking</h3><button class="secondary wide" id="stack-selected-video">Move above other videos</button><button class="secondary wide" id="unstack-selected-video">Move to main video track</button><p class="small-help">Higher layer rows appear on top. Drag videos between Main video and Layers. Use preview corners to make picture-in-picture.</p>';$('#inspector-content').children[0]?.after(section);$('#stack-selected-video').disabled=exporting||project.locked.overlay||clips.some(clipLocked);$('#unstack-selected-video').disabled=exporting||project.locked.video||clips.some(clipLocked);$('#stack-selected-video').onclick=()=>moveSelectedVideo('overlay');$('#unstack-selected-video').onclick=()=>moveSelectedVideo('video');};

function copyClipToLayer(){const c=current();if(!c||!['video','overlay'].includes(c.track)||!requireEditable())return;if(project.locked.overlay)return toast('Unlock the Layers track first.');stop();checkpoint();const copy={...Model.clone(c),id:uid(),track:'overlay',layer:Math.max(0,...project.clips.filter(x=>x.track==='overlay').map(x=>x.layer||0))+1};project.clips.push(copy);setSelection([copy.id]);commit();drawFrame();}
