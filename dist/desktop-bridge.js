/* Available only in the packaged Mac application. */
if(window.cutlineDesktop){
 let desktopEditorReady=false,pendingDesktopProject=null;
 async function openDesktopProject(payload){
  if(!desktopEditorReady){pendingDesktopProject=payload;return;}
  if(exporting)return toast('Finish or cancel the current export before opening another project.');
  try{const file=new File([payload.data],payload.name,{type:'application/json'});await loadPortable(file);}catch(error){toast('Could not open project: '+error.message);}
 }
 const renderBeforeDesktop=renderAll;
 renderAll=function(){renderBeforeDesktop();desktopEditorReady=true;if(pendingDesktopProject){const payload=pendingDesktopProject;pendingDesktopProject=null;queueMicrotask(()=>openDesktopProject(payload));}};
 window.cutlineDesktop.onOpenProject(openDesktopProject);
 window.cutlineDesktop.onPrepareClose?.(async cancel=>{
  if(exporting&&!cancel)return {busy:true};if(exporting&&cancel){cancelExport();const deadline=Date.now()+7000;while(exporting&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));}
  clearTimeout(saveTimer);await lastSavePromise.catch(()=>{});const saved=await saveLocal();if(!saved)return {error:'Your latest changes could not be saved. Keep the editor open and use Save project to download a backup.'};return {force:exporting};
 });
 window.cutlineDesktop.onBackendStatus(status=>{if(status==='recovering')toast('Reconnecting the local engine… Your timeline is safe.');});
}
