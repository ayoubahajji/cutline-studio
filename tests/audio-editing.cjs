const assert=require('node:assert/strict');
const Audio=require('../dist/audio-editing.js'),Model=require('../dist/editor-model.js');
function buffer(seconds,spans,channels=1){const rate=1000,data=Array.from({length:channels},()=>new Float32Array(seconds*rate));for(const [start,end,channel=0]of spans)for(let i=start*rate;i<end*rate;i++)data[channel][i]=.3;return {sampleRate:rate,length:data[0].length,numberOfChannels:channels,getChannelData:i=>data[i]};}
const clip={id:'one',assetId:'source',track:'audio',start:5,in:1,duration:4,speed:1,volume:100,keyframes:[]};
const signal=buffer(6,[[1,2],[3,5]]);let plan=Audio.analyze(signal,clip,{padding:.1,minimum:.3});
assert.equal(plan.gaps.length,1);assert.ok(Math.abs(plan.removed-.8)<1e-6);
let seq=0;const pieces=Audio.segments(clip,plan,Model.sliceClip,()=>`new-${++seq}`);
assert.equal(pieces[0].id,'one');assert.equal(pieces[1].id,'new-1');assert.equal(pieces[0].in,1);assert.equal(pieces[1].in,2.9);assert.equal(pieces[1].start,6.1);assert.ok(Math.abs(pieces.reduce((n,c)=>n+c.duration,0)-3.2)<1e-6);assert.equal(clip.duration,4);
const other={...clip,id:'two'},project={clips:[clip,other]},before=Model.clone(project);project.clips.splice(0,1,...pieces);assert.deepEqual(project.clips.at(-1),other);Object.assign(project,before);assert.equal(project.clips[0].duration,4);
plan=Audio.analyze(buffer(4,[[0,4,1]],2),{in:0,duration:4,speed:1});assert.equal(plan.gaps.length,0,'second channel prevents removal');
plan=Audio.analyze(buffer(4,[]),{in:0,duration:4,speed:1});assert.equal(plan.allSilent,true);
plan=Audio.analyze(buffer(4,[[0,1],[1.2,4]]),{in:0,duration:4,speed:1},{minimum:.3});assert.equal(plan.gaps.length,0,'short gaps retained');
plan=Audio.analyze(signal,{...clip,speed:2,duration:2},{padding:0,minimum:.2});assert.ok(Math.abs(plan.removed-.5)<1e-6);const fast=Audio.segments({...clip,speed:2,duration:2},plan,Model.sliceClip,()=>`new-${++seq}`);assert.equal(fast[1].in,3);assert.equal(fast[1].start,5.5);
plan=Audio.analyze(buffer(4,[[1,3]]),{in:0,duration:4,speed:1},{padding:.1});assert.deepEqual(plan.retained,[{offset:.9,duration:2.2}]);
console.log('PASS: silence threshold, stereo, minimum gaps, padding, trimmed source, speed, independent clips, non-destructive segments and undo snapshot');
