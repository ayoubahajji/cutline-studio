const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const ui=require('../dist/timeline-interactions.js');
const model=require('../dist/editor-model.js');
function fixture(){
 const dom=new JSDOM('<!doctype html><style></style><main class="library"><button data-asset="sound"><img></button></main><section class="timeline"><div id="track-area"><div id="ruler"></div><div id="video-track" data-track="video"></div><div id="audio-track" data-track="audio"></div><div id="overlay-track" data-track="overlay"></div></div></section>');
 const w=dom.window,d=w.document,element=d.querySelector('#track-area');
 d.querySelector('style').textContent=fs.readFileSync(require.resolve('../dist/style.css'),'utf8');
 const project={locked:{},clips:[{id:'one',assetId:'sound',track:'audio',start:1,duration:4,in:0,speed:1},{id:'two',assetId:'sound',track:'audio',start:2,duration:5,in:1,speed:1}]};
 const assets=new Map([['sound',{id:'sound',type:'audio',duration:20}],['image',{id:'image',type:'image',duration:5}],['video',{id:'video',type:'video',duration:12}]]);
 let selected=null,checkpoints=0,commits=0,imports=0,placements=[],messages=[],controller;
 function render(){for(const track of ['video','audio','overlay'])d.querySelector('#'+track+'-track').innerHTML=project.clips.filter(c=>c.track===track).map(c=>`<div class="clip ${track} selected" data-clip="${c.id}"><i data-edge="left"></i><span>${c.id}</span><i data-edge="right"></i></div>`).join('');controller?.syncSelection();}
 const options={element,window:w,document:d,getProject:()=>project,getSelected:()=>selected,setSelected:id=>selected=id,getAsset:id=>assets.get(id),getZoom:()=>10,getScroll:()=>0,getPlayhead:()=>0,isBusy:()=>false,pause:()=>{},clone:model.clone,sliceClip:model.sliceClip,checkpoint:()=>checkpoints++,renderSelection:render,renderTimeline:render,commitGesture:()=>commits++,positionAt:e=>e.clientX/10,seek:t=>{},dropLocation:e=>({onTimeline:!!e.target.closest('.timeline'),track:e.target.closest('[data-track]')?.dataset.track,time:e.clientX/10}),importFiles:async files=>{imports++;return files.map((f,i)=>{const a={id:'import-'+imports+'-'+i,type:ui.mediaType(f),duration:3};assets.set(a.id,a);return a;});},placeAsset:(id,track,start)=>{const c={id:'new-'+placements.length,assetId:id,track,start,duration:assets.get(id).duration};placements.push(c);project.clips.push(c);render();return c;},notify:message=>messages.push(message),showDropHint:()=>{},clearDropHint:()=>{}};
 controller=ui.create(options);render();controller.bind();
 const pointer=(target,x,extra={})=>({target,clientX:x,button:0,pointerId:1,preventDefault(){},...extra});
 const transfer=(files=[],data={})=>({types:files.length?['Files']:Object.keys(data),files,effectAllowed:'',setData(k,v){data[k]=v;if(!this.types.includes(k))this.types.push(k);},getData(k){return data[k]||'';}});
 const drop=(target,x,dt)=>({target,clientX:x,dataTransfer:dt,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}});
 return {dom,w,d,project,assets,controller,pointer,transfer,drop,render,placements,messages,get selected(){return selected;},get checkpoints(){return checkpoints;},get commits(){return commits;},get imports(){return imports;}};
}
async function main(){
 const f=fixture(),clip=id=>f.d.querySelector(`[data-clip="${id}"]`),a=()=>f.project.clips.find(c=>c.id==='one'),b=()=>f.project.clips.find(c=>c.id==='two');
 f.controller.pointerDown(f.pointer(clip('one').querySelector('span'),100));f.controller.pointerUp();
 assert.equal(f.selected,'one');assert.equal(f.d.querySelectorAll('.clip.selected').length,1);assert.equal(f.d.querySelector('[aria-selected=true]').dataset.clip,'one');
 f.controller.pointerDown(f.pointer(clip('two').querySelector('span'),100));f.controller.pointerUp();
 assert.equal(f.selected,'two');assert.equal(f.d.querySelectorAll('.clip.selected').length,1);assert.equal(clip('one').getAttribute('aria-selected'),'false');
 const selectedColor=f.w.getComputedStyle(clip('two')).borderTopColor,otherColor=f.w.getComputedStyle(clip('one')).borderTopColor;assert.notEqual(selectedColor,otherColor);
 // Selecting one instance of the same audio source never mutates the other.
 const other=JSON.stringify(b());f.controller.pointerDown(f.pointer(clip('one'),100));f.controller.pointerMove(f.pointer(clip('one'),102,{altKey:true}));f.controller.pointerUp();assert.equal(a().start,1);assert.equal(f.checkpoints,0);
 f.controller.pointerDown(f.pointer(clip('one'),100));f.controller.pointerMove(f.pointer(clip('one'),120,{altKey:true}));f.controller.pointerUp();assert.equal(a().start,3);assert.equal(JSON.stringify(b()),other);assert.equal(f.checkpoints,1);
 f.controller.pointerDown(f.pointer(clip('one').querySelector('[data-edge=right]'),100));f.controller.pointerMove(f.pointer(clip('one'),110,{altKey:true}));f.controller.pointerUp();assert.equal(a().duration,5);assert.equal(JSON.stringify(b()),other);
 f.controller.pointerDown(f.pointer(f.d.querySelector('#ruler'),30));f.controller.pointerUp();assert.equal(f.selected,'one','scrubbing the ruler must keep the clip selected for splitting');
 f.controller.pointerDown(f.pointer(f.d.querySelector('#audio-track'),10));f.controller.pointerUp();assert.equal(f.selected,null);assert.equal(f.d.querySelectorAll('.selected').length,0);
 // Finder files dropped on a timeline import once and are inserted at the pointer.
 const files=[new f.w.File(['x'],'voice.wav',{type:'audio/wav'}),new f.w.File(['x'],'music.wav',{type:'audio/wav'})];
 const event=f.drop(f.d.querySelector('#audio-track'),70,f.transfer(files));await f.controller.drop(event);assert.equal(f.imports,1);assert.equal(f.placements.length,2);assert.deepEqual(f.placements.map(c=>[c.track,c.start]),[['audio',7],['audio',10]]);assert.ok(event.prevented&&event.stopped);
 // Images/videos route to the matching track; dropping in the library only imports.
 await f.controller.drop(f.drop(f.d.querySelector('#overlay-track'),40,f.transfer([new f.w.File(['x'],'logo.png',{type:'image/png'})])));assert.equal(f.placements.at(-1).track,'overlay');assert.equal(f.placements.at(-1).start,4);
 const count=f.placements.length;await f.controller.drop(f.drop(f.d.querySelector('.library'),0,f.transfer(files)));assert.equal(f.placements.length,count);
 // Library drag works from the image, and its payload survives the drop.
 const dt=f.transfer();f.controller.dragAsset({target:f.d.querySelector('.library img'),dataTransfer:dt,stopPropagation(){}});assert.equal(dt.getData('application/cutline-asset'),'sound');await f.controller.drop(f.drop(f.d.querySelector('#audio-track'),50,dt));assert.equal(f.placements.at(-1).assetId,'sound');assert.equal(f.placements.at(-1).start,5);
 // A real event follows only the delegated drop pipeline, not a second handler.
 const before=f.imports,e=new f.w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:f.transfer([files[0]])});Object.defineProperty(e,'clientX',{value:20});f.d.querySelector('#audio-track').dispatchEvent(e);await new Promise(resolve=>setImmediate(resolve));assert.equal(f.imports,before+1);
 // Locked destination is respected; an interrupted pointer cannot keep moving clips.
 f.project.locked.audio=true;const beforeLocked=f.placements.length;await f.controller.drop(f.drop(f.d.querySelector('#audio-track'),0,f.transfer([],{"application/cutline-asset":"sound"})));assert.equal(f.placements.length,beforeLocked);f.project.locked.audio=false;
 f.controller.pointerDown(f.pointer(clip('two'),100));f.w.dispatchEvent(new f.w.Event('blur'));const start=b().start;f.controller.pointerMove(f.pointer(clip('two'),200,{altKey:true}));assert.equal(b().start,start);
 assert.equal(ui.mediaType({name:'Recording.MP3',type:''}),'audio');assert.equal(ui.targetTrack({type:'audio'},'video'),'audio');
 f.controller.destroy();f.dom.window.close();
 console.log('PASS: single audio selection, distinct highlight, independent drag/trim, jitter guard, scrub-to-split, Finder and library drops, one import per drop, matching tracks, locks, and interrupted drags');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
