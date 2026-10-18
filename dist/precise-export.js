/* Every output frame is decoded, drawn, and acknowledged by the local encoder. */
let preciseExportActive=false,preciseExportAbort=null,preciseExportJob=null;
showExport=function(){
 if(captionBusy)return toast('Finish or cancel caption generation before exporting.');
 if(typeof resetSourceReview==='function')resetSourceReview();
 $('#export-format').innerHTML='<option value="video/mp4">MP4 · H.264</option>';
 $('#export-duration').textContent=time(duration());$('#export-progress').hidden=true;$('#render-export').hidden=false;$('#cancel-export').hidden=true;
 const note=$('.export-note');if(note)note.textContent='Complete frame-by-frame export with a local audio mix. No real-time recording.';
 $('#export-dialog').showModal();
};
$('#export').onclick=showExport;
async function frameExportRequest(path,options={}){
 const response=await fetch('/api/frame-exports'+path,{...options,signal:preciseExportAbort?.signal});
 if(!response.ok){let message='Local export failed.';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}return response;
}
startExport=async function(){
 if(exporting)return;if(sourceReplacementBusy)return toast('Wait for the video replacement check to finish.');if(captionBusy)return toast('Finish or cancel caption generation before exporting.');stop();exportCancelled=false;const height=canvas.height,position=playhead,previousMedia=new Map(media);let detached=false;
 preciseExportActive=true;preciseExportAbort=new AbortController();exporting=true;document.body.classList.add('exporting');
 const setStatus=text=>{$('#export-progress span').textContent=text;};
 $('#export-progress').hidden=false;$('#export-progress i').style.width='0%';$('#render-export').hidden=true;$('#cancel-export').hidden=false;
 for(const el of $$('#export-dialog .close-modal,#export-resolution,#export-format'))el.disabled=true;updateControls();
 try{
  const capabilities=await fetch('/api/capabilities',{signal:preciseExportAbort.signal}).then(r=>r.json());if(!capabilities.frame_export)throw new Error('The complete-frame encoder is unavailable. Reopen Cutline Studio and try again.');
  if(!capabilities.video_check)throw new Error('The source video checker is unavailable. Reopen Cutline Studio and try again.');
  const sourcePlan=await checkExportSources(preciseExportAbort.signal,setStatus);
  const frames=Math.ceil(sourcePlan.end*30);if(!frames)throw new Error('Add clips before exporting.');resizeCanvas(Number($('#export-resolution').value));
  setStatus('Preparing your complete audio mix…');const mix=await renderAudioBuffer(false,44100,true);if(preciseExportAbort.signal.aborted)throw new DOMException('Cancelled','AbortError');
  const audio=wavBlob(mix),metadata={width:canvas.width,height:canvas.height,frames,checkMovingTail:sourcePlan.checkMovingTail};
  const begin=await frameExportRequest('',{method:'POST',headers:{'Content-Type':'audio/wav','X-Cutline-Export':JSON.stringify(metadata)},body:audio});preciseExportJob=(await begin.json()).id;
  media.clear();detached=true;let batch=[];let first=0;
  for(let index=0;index<frames;index++){
   if(preciseExportAbort.signal.aborted)throw new DOMException('Cancelled','AbortError');playhead=index/30;
   const main=mainClipsAt(playhead),last=main.at(-1),visuals=project.clips.filter(c=>c.assetId&&assets.get(c.assetId)?.type==='video'&&isActive(c,playhead)&&!project.muted[c.track]&&(c.track==='overlay'||c===last||(last?.transition!=='none'&&c===main.at(-2))));
   const ids=new Set(visuals.map(c=>c.id));for(const [id,m]of media)if(!ids.has(id)){m.el.pause();m.el.removeAttribute('src');m.el.load();media.delete(id);}
   await Promise.all(visuals.map(async c=>{const a=assets.get(c.assetId),target=Math.max(0,Math.min((c.in||0)+(playhead-c.start)*(c.speed||1),a.duration-.001));try{await CutlineExportFrames.seekFrame(getMedia(c).el,target,{signal:preciseExportAbort.signal});}catch(e){if(e.name==='AbortError')throw e;throw new Error(`${c.name}: ${e.message}`);}}));
   drawFrame();const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not encode the video frame.')),'image/jpeg',.95));batch.push(blob);
   if(batch.length===10||index===frames-1){
    const response=await frameExportRequest('/'+preciseExportJob+'/frames',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Cutline-First-Frame':String(first)},body:await CutlineExportFrames.packet(batch)});const result=await response.json();if(result.received!==index+1)throw new Error('The encoder did not receive every frame.');first=index+1;batch=[];
    $('#export-progress i').style.width=(first/frames*100)+'%';setStatus(`Rendering every frame · ${first} / ${frames} · ${Math.round(first/frames*100)}%`);await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  setStatus('Finishing complete MP4 and audio…');const response=await frameExportRequest('/'+preciseExportJob+'/finish',{method:'POST'});const result=await response.blob();preciseExportJob=null;if(exportCancelled)return;download(result,slug()+'.mp4');toast('Complete video exported. Every frame was rendered.');$('#export-dialog').close();
 }catch(e){if(e.name!=='AbortError'){setStatus('Export stopped: '+e.message);if(!e.sourceReview)toast('Export stopped: '+e.message);}else{$('#export-dialog').close();toast('Export cancelled.');}}
 finally{
  if(preciseExportJob){await fetch('/api/frame-exports/'+preciseExportJob+'/cancel',{method:'POST'}).catch(()=>{});preciseExportJob=null;}
  if(detached){for(const m of media.values()){m.el.pause();m.el.removeAttribute('src');m.el.load();}media.clear();for(const [id,m]of previousMedia)media.set(id,m);}
  preciseExportActive=false;preciseExportAbort=null;exporting=false;playing=false;lastTick=0;document.body.classList.remove('exporting');playhead=position;resizeCanvas(height);updatePlayhead();
  for(const el of $$('#export-dialog .close-modal,#export-resolution,#export-format'))el.disabled=false;$('#render-export').hidden=false;$('#cancel-export').hidden=true;renderInspector();updateControls();syncMedia();drawFrame();
 }
};
const cancelBeforePreciseExport=cancelExport;
cancelExport=function(){if(preciseExportActive){exportCancelled=true;preciseExportAbort?.abort();}else cancelBeforePreciseExport();};
$('#render-export').onclick=startExport;$('#cancel-export').onclick=cancelExport;
