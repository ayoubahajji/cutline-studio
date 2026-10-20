// Exercise native close/reload decisions without opening a browser or user project.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {EventEmitter}=require('node:events');
(async()=>{
 const ipc=new EventEmitter(),app=new EventEmitter(),timers=new Map();let timerId=0,menu,win,reloads=0,closes=0,quits=0,errors=[];
 Object.assign(app,{setName(){},setPath(){},getPath:()=>'/tmp/cutline-lifecycle-test',requestSingleInstanceLock:()=>true,isReady:()=>true,whenReady:()=>Promise.resolve(),quit(){quits++;},isPackaged:true});
 class Window extends EventEmitter{constructor(){super();win=this;this.webContents=new EventEmitter();Object.assign(this.webContents,{getURL:()=>this.url,setWindowOpenHandler(){},send:(...args)=>this.sent.push(args)});this.sent=[];}loadFile(){this.url='file:///starting';}async loadURL(url){this.url=url;}reload(){reloads++;}close(){closes++;}destroy(){closes++;}isDestroyed(){return false;}}
 class Backend extends EventEmitter{async start(){this.emit('ready','http://127.0.0.1:4178');return 'http://127.0.0.1:4178';}stop(){}}
 const electron={app,BrowserWindow:Window,ipcMain:ipc,Menu:{buildFromTemplate:x=>x,setApplicationMenu:x=>menu=x},dialog:{showMessageBox:async(_win,info)=>{errors.push(info);return {response:0};},showErrorBox(...args){throw new Error(args.join(": "));},showMessageBoxSync:()=>0},shell:{},session:{defaultSession:{setPermissionRequestHandler(){},on(){}}}};
 const context={URL,require:name=>name==='electron'?electron:name==='./backend.cjs'?{Backend}:name==='./mcp-setup.cjs'?require('../desktop/mcp-setup.cjs'):name==='node:fs'?{mkdirSync(){},appendFileSync(){},readFileSync(){throw Error();},writeFileSync(){},existsSync:()=>false}:require(name),__dirname:path.resolve('desktop'),process:{...process,resourcesPath:'/fake'},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync('desktop/main.cjs','utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 const reload=menu.find(item=>item.label==='View').submenu.find(item=>item.label==='Reload editor');
 reload.click();assert.equal(reloads,0,'reload must wait for persistence');assert.equal(win.sent.at(-1)[0],'prepare-close');ipc.emit('close-ready',{sender:win.webContents},{error:'Disk full'});await Promise.resolve();assert.equal(reloads,0);assert.equal(closes,0);assert.equal(win.closePending,false);
 reload.click();ipc.emit('close-ready',{sender:win.webContents},{});assert.equal(reloads,1,'successful save permits reload');assert.equal(win.allowClose,undefined);
 let prevented=false;win.emit('close',{preventDefault(){prevented=true;}});assert.equal(prevented,true);ipc.emit('close-ready',{sender:win.webContents},{busy:true});await Promise.resolve();assert.equal(closes,0,'keep-exporting choice retains window');
 reload.click();assert.equal(timers.size,1);[...timers.values()][0]();assert.equal(win.closePending,false);assert.equal(win.reloadPending,false);assert.equal(reloads,1,'unresponsive editor must not be discarded');assert.match(errors.at(-1).message,/did not respond/);
 win.emit('close',{preventDefault(){}});ipc.emit('close-ready',{sender:{}},{});assert.equal(closes,0,'untrusted sender cannot close editor');ipc.emit('close-ready',{sender:win.webContents},{});assert.equal(closes,1);assert.equal(quits,0);
 console.log('PASS: native reload waits for save; failed saves, active exports and unresponsive editors preserve the window; IPC sender is checked');
})().catch(error=>{console.error(error);process.exitCode=1;});
