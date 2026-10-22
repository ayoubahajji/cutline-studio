const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{runScripts:'outside-only',url:'http://localhost/'}),w=dom.window;
 const context=new Proxy({measureText:()=>({width:100}),createLinearGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});
 w.HTMLCanvasElement.prototype.getContext=()=>context;w.HTMLMediaElement.prototype.pause=()=>{};w.fetch=async()=>({json:async()=>({})});w.requestAnimationFrame=()=>0;
 const files=['editor-model.js','frame-geometry.js','timeline-interactions.js','layer-placement.js','app.js','blur-renderer.js','enhanced.js','audio-editing.js','audio-workspace.js','multi-selection.js','preview-transform.js'];let source=files.map(f=>fs.readFileSync('dist/'+f,'utf8')).join('\n');source=source.replace("bootstrap().catch(e=>{console.error(e);toast('Could not start: '+e.message);});",'');
 w.eval(source+`\n(async()=>{
 const buffer={sampleRate:1000,length:4000,numberOfChannels:1,getChannelData:()=>Float32Array.from({length:4000},(_,i)=>i>=1000&&i<2000?0:.3)};
 assets.set('fixture',{id:'fixture',type:'audio',name:'Fixture.wav',duration:4,audioBuffer:buffer});
 const first=defaultClip(assets.get('fixture'),0),second=defaultClip(assets.get('fixture'),1);project.clips=[first,second];selected=first.id;hydrate();renderAll();
 window.testState=()=>({project:Model.clone(project),selected,past:past.length});window.testReady=true;
 })();`);
 assert.equal(w.testReady,true);assert.equal(w.document.querySelectorAll('.clip.selected').length,1);assert.equal(w.document.querySelectorAll('.audio-hero').length,1);
 await w.document.querySelector('#analyze-silence').onclick();w.document.querySelector('#apply-silence').click();let state=w.testState();assert.equal(state.project.clips.length,3);assert.equal(state.past,1);assert.equal(state.project.clips.at(-1).start,1);
 w.document.querySelector('#undo').click();state=w.testState();assert.equal(state.project.clips.length,2);assert.equal(state.project.clips[0].duration,4);
 console.log('PASS: all editor scripts loaded together, real audio inspector, selected-only silence edit, real undo');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
