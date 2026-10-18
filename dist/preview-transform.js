/* DOM handles are editor-only; export continues to use the shared canvas compositor. */
const transformBox=document.createElement('div');transformBox.id='preview-transform-box';transformBox.hidden=true;
transformBox.innerHTML=['nw','ne','sw','se'].map(c=>`<button class="preview-corner ${c}" data-corner="${c}" aria-label="Resize ${c} corner" title="Drag to resize video proportionally"></button>`).join('');
const transformTools=document.createElement('div');transformTools.id='preview-transform-tools';transformTools.hidden=true;transformTools.innerHTML='<span>Resize with corners</span><button data-fit-action="cover">Fill frame</button><button data-fit-action="contain">Fit inside</button><button data-fit-action="center">Center</button>';
$('#stage').append(transformBox,transformTools);
let frameGesture=null;
function selectedFrame(){const c=current();return c&&getSelectionIds().length===1&&['video','overlay'].includes(c.track)&&isActive(c,Math.min(playhead,Math.max(0,duration()-.001)))?c:null;}
function frameGeometry(c){return CutlineFrameGeometry.geometry(c,assets.get(c.assetId)||{},canvas.width,canvas.height,Model.poseAt(c,playhead-c.start),playhead-c.start);}
function updateFrameHandles(){
 const c=selectedFrame(),show=c&&!exporting&&!blurDrawing&&!project.muted[c.track];transformBox.hidden=!show;transformTools.hidden=!show;if(!show)return;
 const g=frameGeometry(c),r=canvasBounds(),stage=$('#stage').getBoundingClientRect();if(!r.width||!r.height||!Number.isFinite(g.width)){transformBox.hidden=true;return;}
 Object.assign(transformBox.style,{left:r.left-stage.left+g.cx/canvas.width*r.width+'px',top:r.top-stage.top+g.cy/canvas.height*r.height+'px',width:g.width/canvas.width*r.width+'px',height:g.height/canvas.height*r.height+'px',transform:`translate(-50%,-50%) rotate(${g.rotation}deg)`});
 const locked=clipLocked(c);transformBox.classList.toggle('locked',locked);$$('button',transformBox).forEach(b=>b.disabled=locked);$$('button',transformTools).forEach(b=>b.disabled=locked);
}
const drawBeforeFrameHandles=drawFrame;
drawFrame=function(){drawBeforeFrameHandles();updateFrameHandles();};
const inspectorBeforeFrameHandles=renderInspector;
renderInspector=function(){inspectorBeforeFrameHandles();const c=current();if(c&&getSelectionIds().length===1&&['video','overlay'].includes(c.track)){
 const section=document.createElement('div');section.className='inspector-section frame-fit-actions';section.innerHTML='<h3>Fit to resolution</h3><div class="pill-row"><button class="secondary" data-fit-action="cover">Fill frame</button><button class="secondary" data-fit-action="contain">Fit inside</button><button class="secondary" data-fit-action="center">Center</button></div><p class="small-help">Drag the video to reposition it. Pull a corner to resize. Fill frame covers the canvas and may crop the edges.</p>';$('#inspector-content').children[0]?.after(section);$$('[data-fit-action]',section).forEach(b=>{b.disabled=clipLocked(c)||exporting;b.onclick=()=>fitSelectedFrame(b.dataset.fitAction);});
 }updateFrameHandles();};
function fitSelectedFrame(mode){const c=current();if(!c||getSelectionIds().length!==1||!['video','overlay'].includes(c.track)||!requireEditable())return;stop();checkpoint();
 if(mode==='center'){c.x=0;c.y=0;if(c.keyframes.length)upsertKeyframe(c,{x:0,y:0});}
 else{c.fit=mode;c.scale=100;c.x=0;c.y=0;c.rotation=0;c.motion=0;for(const k of c.keyframes)Object.assign(k,{scale:100,x:0,y:0,rotation:0});}
 commit();drawFrame();
}
$$('[data-fit-action]',transformTools).forEach(b=>b.onclick=()=>fitSelectedFrame(b.dataset.fitAction));
function framePoint(e){const r=canvasBounds();return {x:(e.clientX-r.left)/r.width*canvas.width,y:(e.clientY-r.top)/r.height*canvas.height};}
function beginFrameGesture(e,c,corner=null){if(!c||clipLocked(c)||exporting)return;stop();const start=framePoint(e);frameGesture={id:c.id,start,geometry:frameGeometry(c),corner,changed:false,pointerId:e.pointerId};try{$('#stage').setPointerCapture?.(e.pointerId);}catch{}e.preventDefault();e.stopImmediatePropagation();}
transformBox.addEventListener('pointerdown',e=>{if(e.button!==0)return;const corner=e.target.closest('[data-corner]')?.dataset.corner;if(!corner)return;beginFrameGesture(e,selectedFrame(),{nw:[-1,-1],ne:[1,-1],sw:[-1,1],se:[1,1]}[corner]);});
canvas.addEventListener('pointerdown',e=>{
 if(e.button!==0||exporting||blurDrawing||['blur','text'].includes(current()?.track))return;
 const p=framePoint(e),top=[...project.clips.filter(c=>c.track==='overlay'&&isActive(c,playhead)&&!project.muted.overlay).sort((a,b)=>b.layer-a.layer),...mainClipsAt(playhead).reverse().filter(()=>!project.muted.video)].find(c=>CutlineFrameGeometry.contains(frameGeometry(c),p.x,p.y));
 if(!top)return;setSelection([top.id]);renderTimeline();renderInspector();updateControls();if(clipLocked(top)){e.preventDefault();e.stopImmediatePropagation();return;}beginFrameGesture(e,top);
},true);
window.addEventListener('pointermove',e=>{
 if(!frameGesture)return;const d=frameGesture,c=project.clips.find(c=>c.id===d.id);if(!c)return finishFrameGesture();
 const p=framePoint(e),dx=p.x-d.start.x,dy=p.y-d.start.y,r=canvasBounds();if(!d.changed&&Math.hypot(dx*r.width/canvas.width,dy*r.height/canvas.height)<3)return;
 if(!d.changed){checkpoint();d.changed=true;}
 const pose=d.corner?CutlineFrameGeometry.resize(d.geometry,d.corner,dx,dy):{cx:d.geometry.cx+dx,cy:d.geometry.cy+dy,scale:d.geometry.scale};
 c.x=clamp((pose.cx/canvas.width-.5)*100,-100,100);c.y=clamp((pose.cy/canvas.height-.5)*100,-100,100);c.scale=pose.scale;if(c.keyframes.length)upsertKeyframe(c,{x:c.x,y:c.y,scale:c.scale});drawFrame();e.preventDefault();
});
function finishFrameGesture(){const d=frameGesture;if(!d)return;frameGesture=null;try{if($('#stage').hasPointerCapture?.(d.pointerId))$('#stage').releasePointerCapture(d.pointerId);}catch{}if(d.changed){renderInspector();scheduleSave();}updateFrameHandles();}
window.addEventListener('pointerup',finishFrameGesture);window.addEventListener('pointercancel',finishFrameGesture);window.addEventListener('blur',finishFrameGesture);
