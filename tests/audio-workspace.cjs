const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<div id="inspector-content"></div><button id="split"></button>',{runScripts:'outside-only'}),w=dom.window;
 const buffer={sampleRate:1000,length:4000,numberOfChannels:1,getChannelData:()=>Float32Array.from({length:4000},(_,i)=>i>=1000&&i<2000?0:.3)};
 const one={id:'one',assetId:'a',track:'audio',start:2,in:0,duration:4,speed:1,audioRole:'voice',keyframes:[]},two={...one,id:'two'};let checkpoints=0,splits=0,commits=0;
 Object.assign(w,{project:{clips:[one,two]},selected:'one',Model:require('../dist/editor-model.js'),CutlineAudioEditing:require('../dist/audio-editing.js'),assets:new Map([['a',{}]]),current:()=>w.project.clips.find(c=>c.id===w.selected),$:s=>w.document.querySelector(s),$$:(s,r=w.document)=>[...r.querySelectorAll(s)],decodeAudioAsset:async()=>buffer,drawWaveform:()=>{},requireEditable:()=>true,clipLocked:()=>false,uid:()=> 'new',stop:()=>{},checkpoint:()=>checkpoints++,commit:()=>commits++,toast:()=>{},renderInspector:()=>{w.document.querySelector('#inspector-content').innerHTML='<div class="inspector-section"><h3>Selected clip</h3><div class="clip-name">Voice.wav</div></div>'+['Timing','Audio','Sound tools','Fades','Motion keyframes'].map(t=>`<div class="inspector-section"><h3>${t}</h3><input aria-label="${t}"></div>`).join('');}});
 w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){}});w.document.querySelector('#split').onclick=()=>splits++;
 w.eval(fs.readFileSync('dist/audio-workspace.js','utf8'));w.renderInspector();
 assert.equal(w.document.querySelectorAll('.audio-hero').length,1);assert.ok(w.document.querySelector('.audio-advanced input[aria-label="Timing"]'));assert.ok(!w.document.querySelector('.audio-advanced input[aria-label="Sound tools"]'));
 w.document.querySelector('#audio-split').click();assert.equal(splits,1);
 w.document.querySelector('#audio-silence-open').click();assert.equal(w.document.querySelector('.silence-panel').open,true);
 await w.document.querySelector('#analyze-silence').onclick();assert.equal(w.document.querySelector('#apply-silence').disabled,false);assert.match(w.document.querySelector('#silence-result').textContent,/1 quiet gaps/);
 w.document.querySelector('#apply-silence').click();assert.equal(checkpoints,1);assert.equal(commits,1);assert.equal(w.project.clips.length,3);assert.equal(w.project.clips.at(-1),two);assert.equal(w.selected,'one');assert.ok(w.project.clips[1].in>1.9);
 w.renderInspector();await w.document.querySelector('#analyze-silence').onclick();const setting=w.document.querySelector('#silence-threshold');setting.value='-40';setting.dispatchEvent(new w.Event('input'));assert.equal(w.document.querySelector('#apply-silence').disabled,true);
 console.log('PASS: audio inspector layout, split shortcut, analysis preview, selected-only application, settings invalidation');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
