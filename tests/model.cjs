const assert=require('node:assert/strict');
const m=require('../dist/editor-model.js');
const clip={id:'a',assetId:'s',track:'audio',start:2,duration:8,in:3,speed:2,fadeIn:.4,fadeOut:.5,keyframes:[{time:0,x:0,scale:100},{time:8,x:80,scale:180}]};
const [left,right]=m.split(clip,5);
assert.equal(left.duration,3);assert.equal(right.duration,5);assert.equal(right.in,9);assert.equal(right.start,5);assert.equal(left.fadeOut,0);assert.equal(right.fadeIn,0);
assert.equal(m.poseAt(left,3).x,30);assert.equal(m.poseAt(right,0).x,30);assert.equal(m.poseAt(right,5).x,80);assert.equal(clip.keyframes.length,2);
const trimmed=m.sliceClip(clip,2,4);assert.equal(trimmed.in,7);assert.equal(m.poseAt(trimmed,0).x,20);assert.equal(m.poseAt(trimmed,4).x,60);
assert.equal(m.split(clip,2),null);assert.equal(m.split(clip,10),null);assert.equal(m.envelope(clip,1),0);assert.equal(m.envelope(clip,2.2).toFixed(1),'0.5');
const cues=m.parseSubtitles('WEBVTT\n\n00:00.500 --> 00:02.000\n<b>Order today</b>\n\n00:03.000 --> 00:05.200 align:start\nLivraison rapide');
assert.equal(cues.length,2);assert.equal(cues[0].text,'Order today');assert.equal(cues[1].duration,2.2);const roundtrip=m.parseSubtitles(m.toSrt(cues));assert.deepEqual(roundtrip,cues);
assert.equal(m.parseSubtitles('1\n00:02,000 --> 00:01,000\nBad cue').length,0);
console.log('PASS: source offsets, independent splits, trim/keyframe continuity, fades, SRT/VTT parsing and roundtrip');

// Retime preserves source span and scales animation/fades; range edits stay loadable.
{
 const model=require('../dist/editor-model.js');
 const original={id:'range',assetId:'audio',track:'audio',start:3,in:2,duration:4,speed:1,fadeIn:.4,fadeOut:.8,keyframes:[{time:0,x:0},{time:4,x:100}]};
 const fast=model.retimeClip(original,2);assert.equal(fast.duration,2);assert.equal(fast.fadeIn,.2);assert.equal(fast.fadeOut,.4);assert.equal(fast.keyframes[1].time,2);assert.equal(fast.in,2);assert.equal(original.duration,4);
 assert.throws(()=>model.audioRange(original,.01,2,false,()=> 'new'),/0.05/);
 assert.throws(()=>model.audioRange(original,1,1.01,true,()=> 'new'),/0.05/);
 const cut=model.audioRange(original,1,2,false,()=> 'new');assert.equal(cut[0].duration,1);assert.equal(cut[1].in,4);assert.equal(cut[1].start,4);assert.equal(cut[1].id,'new');
 console.log('PASS: speed retiming, source-preserving audio range cuts and minimum fragment guards');
}

assert.equal(m.audioRange({...clip,duration:2},1.1,1.15,true,()=> 'id')[0].duration,.05);
