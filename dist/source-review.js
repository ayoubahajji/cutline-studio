let exportSourceEnd=null,acceptedStillSources=new Set();
function resetSourceReview(){exportSourceEnd=null;$('#export-source-review')?.remove();}
async function checkExportSources(signal,setStatus){
 const end=Math.min(exportSourceEnd??duration(),duration()),reports=new Map(),ids=new Set(project.clips.filter(c=>['video','overlay'].includes(c.track)&&c.start<end&&!project.muted[c.track]).map(c=>c.assetId));
 for(const id of ids){const a=assets.get(id);if(a?.type!=='video')continue;setStatus('Checking source video · '+a.name);
  if(!a.sourceCheck){if(!a.blob)throw new Error('The original source is missing: '+a.name);const response=await fetch('/api/check-video',{method:'POST',headers:{'Content-Type':a.blob.type||'application/octet-stream'},body:a.blob,signal});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not check source video.');if(!Number.isFinite(result.videoDuration)||result.videoDuration<=0||!Array.isArray(result.frozen))throw new Error('The source video check was incomplete.');a.sourceCheck=result;a.videoDuration=result.videoDuration;}
  reports.set(id,a.sourceCheck);
 }
 const issues=CutlineSourceCheck.problems(project,assets,reports,end,acceptedStillSources);
 if(issues.length){showSourceReview(issues,end);const error=new Error('Source video needs attention. See the source check below.');error.sourceReview=true;throw error;}
 $('#export-source-review')?.remove();return {end,checkMovingTail:CutlineSourceCheck.movingTail(project,assets,reports,end)};
}
function showSourceReview(issues,end){
 $('#export-source-review')?.remove();const root=document.createElement('section');root.id='export-source-review';const safeEnd=Math.min(end,...issues.map(i=>i.timelineTime));root.innerHTML=`<h3>Source video needs attention</h3><p>The export has paused to prevent another frozen scene.</p>${issues.map(i=>`<p><strong>${esc(i.name)}</strong><br>${esc(i.message)}</p>`).join('')}<p>Use the original footage to recover missing motion. Re-exporting an already frozen file cannot recreate it.</p>${safeEnd>=.05&&safeEnd<end-.05?`<button id="export-safe-picture-range" class="secondary wide">Export first ${safeEnd.toFixed(2)} seconds only</button><p class="small-help">This also cuts audio and later scenes from this export. Your project stays unchanged.</p>`:''}${issues.every(i=>i.kind==='frozen')?'<button id="accept-source-still" class="secondary wide">This still section is intentional · continue</button>':''}<button id="replace-affected-source" class="secondary wide">Replace affected video with original footage…</button><button id="locate-source-problem" class="secondary wide">Show the affected clip</button>`;
 $('#export-progress').after(root);
 $('#export-safe-picture-range')?.addEventListener('click',()=>{exportSourceEnd=safeEnd;$('#export-duration').textContent=time(safeEnd)+' · trimmed export';startExport();});
 $('#accept-source-still')?.addEventListener('click',()=>{for(const i of issues)acceptedStillSources.add(i.assetId);startExport();});
 $('#replace-affected-source').onclick=()=>{$('#export-dialog').close();setSelection([issues[0].id]);renderTimeline();renderInspector();chooseReplacementVideo(issues[0].id);};
 $('#locate-source-problem').onclick=()=>{$('#export-dialog').close();setSelection([issues[0].id]);playhead=Math.max(0,Math.min(issues[0].timelineTime,duration()));renderTimeline();renderInspector();updateControls();updatePlayhead();drawFrame();toast('Replace this clip with original footage, or trim it before the affected time.');};
}
// Replace only the affected clip while keeping its trim, timing, effects and layer.
let sourceReplacementBusy=false,sourceReplacementTarget=null;
const replacementInput=document.createElement('input');replacementInput.type='file';replacementInput.accept='video/*';replacementInput.hidden=true;document.body.append(replacementInput);
function chooseReplacementVideo(id){const c=project.clips.find(c=>c.id===id);if(!c||exporting||clipLocked(c))return;sourceReplacementTarget={id:c.id,projectId:project.id,fingerprint:JSON.stringify(c)};replacementInput.value='';replacementInput.click();}
const inspectorBeforeSourceReplacement=renderInspector;
renderInspector=function(){inspectorBeforeSourceReplacement();const c=current(),a=assets.get(c?.assetId);if(!c||a?.type!=='video'||!['video','overlay'].includes(c.track)||getSelectionIds().length!==1)return;const button=document.createElement('button');button.className='secondary wide';button.id='replace-video-source';button.textContent='Replace video source…';button.disabled=exporting||clipLocked(c)||sourceReplacementBusy;button.onclick=()=>chooseReplacementVideo(c.id);$('#inspector-content').children[0]?.append(button);};
replacementInput.onchange=async()=>{
 const file=replacementInput.files[0],target=sourceReplacementTarget;if(!file||!target||exporting)return;sourceReplacementBusy=true;stop();toast('Checking replacement footage…');
 try{const a=await registerAsset({id:uid(),name:file.name,type:'video',blob:file});const response=await fetch('/api/check-video',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});const report=await response.json();if(!response.ok)throw new Error(report.error||'Could not check the replacement.');
  const c=project.clips.find(c=>c.id===target.id);if(!c||project.id!==target.projectId||JSON.stringify(c)!==target.fingerprint||exporting||clipLocked(c))throw new Error('The clip changed while checking. Select it and try again.');const needed=(c.in||0)+c.duration*(c.speed||1);if(needed>report.videoDuration+.15)throw new Error(`Replacement has ${report.videoDuration.toFixed(2)}s of pictures; this clip needs ${needed.toFixed(2)}s. Trim the clip first or choose longer original footage.`);
  a.sourceCheck=report;a.videoDuration=report.videoDuration;checkpoint();c.assetId=a.id;c.name=a.name;const old=media.get(c.id);if(old){old.el.pause();old.source?.disconnect();old.filter?.disconnect();old.compressor?.disconnect();old.gain?.disconnect();old.el.removeAttribute('src');old.el.load();media.delete(c.id);}resetSourceReview();commit();renderLibrary();toast('Source replaced. Timing, trims and effects were kept. Undo is available.');
 }catch(e){toast(e.message);}finally{sourceReplacementBusy=false;sourceReplacementTarget=null;replacementInput.value='';renderInspector();}
};
