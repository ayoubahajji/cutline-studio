const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),Frames=require('../dist/export-frames.js');
class Media extends EventTarget{constructor(){super();this.readyState=2;this.seeking=false;this.position=0;this.error=null;this.paused=false;}pause(){this.paused=true;}get currentTime(){return this.position;}set currentTime(value){this.seeking=true;this.position=value;setTimeout(()=>{this.seeking=false;this.dispatchEvent(new Event('seeked'));},15);}}
(async()=>{
 const el=new Media();let ready=false;const work=Frames.seekFrame(el,4).then(()=>ready=true);assert.equal(ready,false);assert.equal(el.seeking,true);await work;assert.equal(ready,true);assert.equal(el.currentTime,4);assert.equal(el.paused,true);
 const cold=new Media();cold.readyState=0;const loading=Frames.seekFrame(cold,2);setTimeout(()=>{cold.readyState=2;cold.dispatchEvent(new Event('loadedmetadata'));},10);await loading;assert.equal(cold.currentTime,2);
 const stalled=new Media();stalled.readyState=0;await assert.rejects(Frames.seekFrame(stalled,3,{timeout:15}),/stopped instead of saving a frozen video/);
 const controller=new AbortController();const aborting=Frames.seekFrame(stalled,2,{signal:controller.signal});controller.abort();await assert.rejects(aborting,{name:'AbortError'});
 const bytes=new Uint8Array(await(await Frames.packet([new Blob(['abc']),new Blob(['de'])])).arrayBuffer());const view=new DataView(bytes.buffer);assert.equal(view.getUint32(0),3);assert.equal(view.getUint32(7),2);assert.equal(new TextDecoder().decode(bytes.slice(4,7)),'abc');
 console.log('PASS: export waits for loaded/seeked frames, rejects stalled decoding, supports cancellation, and sends ordered length-prefixed frame packets');
})().catch(e=>{console.error(e);process.exitCode=1;});
