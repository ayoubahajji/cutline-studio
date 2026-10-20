const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('cutlineDesktop',{
 onOpenProject(callback){ipcRenderer.on('open-project',(_event,payload)=>callback(payload));ipcRenderer.send('renderer-ready');},
 onPrepareClose(callback){ipcRenderer.on('prepare-close',async(_event,cancel)=>{try{ipcRenderer.send('close-ready',await callback(cancel));}catch(error){ipcRenderer.send('close-ready',{error:'Could not save before closing: '+error.message});}});},
 onBackendStatus(callback){ipcRenderer.on('backend-status',(_event,status)=>callback(status));}
});
