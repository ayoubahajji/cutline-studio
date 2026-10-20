'use strict';
const {app,BrowserWindow,Menu,dialog,shell,ipcMain}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const {Backend}=require('./backend.cjs');
const {configuration,codexCommand}=require('./mcp-setup.cjs');
app.setName('Cutline Studio');app.setPath('userData',path.join(app.getPath('appData'),'Cutline Studio Desktop'));
if(!app.requestSingleInstanceLock()){app.quit();}else{
 let window=null,backend=null,origin=null,opening=false,pendingProject=null,quitRequested=false;
 const support=path.join(app.getPath('appData'),'Cutline Studio Desktop');fs.mkdirSync(support,{recursive:true});
 const logFile=path.join(support,'desktop.log');function log(message){try{fs.appendFileSync(logFile,new Date().toISOString()+' '+message+'\n');}catch{}}
 function projectFromArgs(argv){return argv.find(value=>value.toLowerCase().endsWith('.cutline')&&fs.existsSync(value));}
 async function sendProject(file){if(!file)return;pendingProject=file;if(window&&origin&&window.webContents.getURL().startsWith(origin)){try{const stat=fs.statSync(file);if(stat.size>1024*1024*1024)throw new Error('Project is larger than 1 GB.');const data=fs.readFileSync(file,'utf8');window.webContents.send('open-project',{name:path.basename(file),data});pendingProject=null;}catch(error){dialog.showErrorBox('Could not open project',error.message);}}}
 function prepareClose(target,cancel){
  target.closePending=true;target.webContents.send('prepare-close',cancel);
  clearTimeout(target.closeTimer);target.closeTimer=setTimeout(()=>{if(target.isDestroyed())return;target.closePending=false;target.reloadPending=false;quitRequested=false;dialog.showMessageBox(target,{type:'error',message:'The editor did not respond.',detail:'The window has been kept open to protect your changes. Try again or save a project backup before restarting.'});},30000);
 }
 async function show(){if(opening)return;if(window){window.show();window.focus();return;}opening=true;
  window=new BrowserWindow({title:'Cutline Studio',width:1440,height:960,minWidth:900,minHeight:650,backgroundColor:'#101113',show:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  window.loadFile(path.join(__dirname,'starting.html'));window.on('closed',()=>{clearTimeout(window?.closeTimer);window=null;});
  window.on('close',event=>{if(window.allowClose||!origin||!window.webContents.getURL().startsWith(origin))return;event.preventDefault();if(window.closePending)return;prepareClose(window,false);});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(origin&&!url.startsWith(origin+'/')&&url!==origin){event.preventDefault();}});
  window.webContents.on('will-prevent-unload',event=>{const result=dialog.showMessageBoxSync(window,{type:'question',buttons:['Keep exporting','Quit'],defaultId:0,cancelId:0,title:'Export in progress',message:'A video is still exporting. Quit and cancel this export?'});if(result===1)event.preventDefault();});
  window.webContents.on('did-finish-load',()=>{log('Window loaded: '+window?.webContents.getURL());if(origin&&window?.webContents.getURL().startsWith(origin)){window.webContents.send('desktop-ready');if(pendingProject){const file=pendingProject;setTimeout(()=>sendProject(file),600);}}});
  try{origin=await backend.start();if(window)await window.loadURL(origin);}catch(error){log(error.stack||error.message);dialog.showErrorBox('Cutline Studio could not start',error.message+'\n\nOpen the app again to retry. Logs: '+logFile);}finally{opening=false;}
 }
 app.on('open-file',(event,file)=>{event.preventDefault();pendingProject=file;if(app.isReady()){show();sendProject(file);}});
 app.on('second-instance',(_event,argv)=>{const file=projectFromArgs(argv);show().then(()=>sendProject(file));});
 app.whenReady().then(async()=>{
  const resources=app.isPackaged?process.resourcesPath:path.join(__dirname,'../.desktop-build/resources');
  const backendRoot=path.join(resources,'backend');const stateDir=path.join(support,'engine');fs.mkdirSync(stateDir,{recursive:true});
  let port=4178;try{port=JSON.parse(fs.readFileSync(path.join(support,'engine.json'),'utf8')).port||4178;}catch{}
  backend=new Backend({binary:path.join(backendRoot,'cutline-backend'),cwd:stateDir,stateDir,ffmpeg:path.join(backendRoot,'tools','ffmpeg'),port,log});
  backend.on('ready',url=>{fs.writeFileSync(path.join(support,'engine.json'),JSON.stringify({port:Number(new URL(url).port)}));if(!origin||origin!==url){origin=url;if(!opening)window?.loadURL(url);}window?.webContents.send('backend-status','ready');});
  backend.on('recovering',()=>window?.webContents.send('backend-status','recovering'));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Cutline Studio',submenu:[{role:'about'},{type:'separator'},{label:'Import a browser project…',click:()=>{dialog.showMessageBox(window,{type:'info',title:'Bring your browser project',message:'Your browser projects remain in your browser.',detail:'In the browser editor, choose Save project. Then open that .cutline file here using Open. Desktop projects autosave separately.'});if(origin)shell.openExternal(origin);}},{label:'MCP setup…',enabled:fs.existsSync(path.join(resources,'mcp-runtime/bin/node')),click:async()=>{const choice=await dialog.showMessageBox(window,{type:'info',title:'Connect Cutline to your AI editor',message:'Cutline includes its own MCP server, Node, media engine and local Whisper.',detail:'Install Cutline in Applications first. Add a local stdio MCP server in your AI client using the command and arguments in the configuration. No Python, npm or model download is needed. The server can read and edit local files; connect only to a client you trust. Restart the AI client after setup.',buttons:['Copy MCP JSON','Copy Codex CLI command','Open guide','Cancel'],cancelId:3});if(choice.response===0)require('electron').clipboard.writeText(JSON.stringify(configuration(resources),null,2));if(choice.response===1)require('electron').clipboard.writeText(codexCommand(resources));if(choice.response===2)shell.openExternal('https://github.com/ayoubahajji/cutline-studio/blob/main/docs/MAC_INSTALL.md');}},{label:'Open desktop data folder',click:()=>shell.openPath(support)},{type:'separator'},{role:'hide'},{role:'hideOthers'},{type:'separator'},{role:'quit'}]},{role:'editMenu'},{label:'View',submenu:[{role:'togglefullscreen'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{label:'Reload editor',accelerator:'CmdOrCtrl+R',click:()=>{if(window&&!window.closePending){window.reloadPending=true;prepareClose(window,false);}}}]},{role:'windowMenu'}]));
  const ses=require('electron').session.defaultSession;ses.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  ses.on('will-download',(_event,item)=>{item.setSaveDialogOptions({title:'Save from Cutline Studio',defaultPath:path.join(app.getPath('downloads'),item.getFilename())});});
  ipcMain.on('close-ready',async(event,result)=>{const closing=window;if(!closing||event.sender!==closing.webContents||!closing.closePending)return;clearTimeout(closing.closeTimer);closing.closePending=false;
   if(result?.error){closing.reloadPending=false;quitRequested=false;await dialog.showMessageBox(closing,{type:'error',message:'Changes could not be saved',detail:result.error});return;}
   if(result?.busy){const choice=await dialog.showMessageBox(closing,{type:'question',buttons:['Keep exporting','Cancel export and close'],defaultId:0,cancelId:0,message:'A video is still exporting.'});if(choice.response===0){quitRequested=false;closing.reloadPending=false;return;}prepareClose(closing,true);return;}
   if(closing.reloadPending){closing.reloadPending=false;quitRequested=false;closing.reload();return;}
   closing.allowClose=true;if(result?.force)closing.destroy();else if(quitRequested)app.quit();else closing.close();if(quitRequested&&!window)app.quit();
  });
  ipcMain.on('renderer-ready',event=>{if(window&&event.sender===window.webContents&&pendingProject)sendProject(pendingProject);});
  pendingProject=pendingProject||projectFromArgs(process.argv);await show();
 });
 app.on('activate',()=>{if(app.isReady())show();});
 app.on('before-quit',()=>quitRequested=true);
 app.on('will-quit',()=>backend?.stop());
 app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
