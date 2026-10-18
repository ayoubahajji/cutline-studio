/* Source-aware, non-destructive silence detection. No uploads or source changes. */
(function(root){
'use strict';
function analyze(buffer,clip,options={}){
 const threshold=Math.pow(10,(options.thresholdDb??-38)/20),minimum=options.minimum??.35,padding=options.padding??.08,speed=clip.speed||1;
 const rate=buffer.sampleRate,first=Math.max(0,Math.round((clip.in||0)*rate)),last=Math.min(buffer.length,Math.round(((clip.in||0)+clip.duration*speed)*rate));
 const step=Math.max(1,Math.round(rate*.01)),channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
 let quietStart=null;const gaps=[];
 function finish(end){if(quietStart===null)return;const start=(quietStart-first)/rate/speed,stop=(end-first)/rate/speed;if(stop-start>=minimum){const a=start===0?0:start+padding,b=stop>=clip.duration-.011/speed?clip.duration:stop-padding;if(b-a>.01)gaps.push({start:a,end:b});}quietStart=null;}
 for(let i=first;i<last;i+=step){const end=Math.min(last,i+step);let peakRms=0;for(const samples of channels){let sum=0;for(let j=i;j<end;j++)sum+=samples[j]*samples[j];peakRms=Math.max(peakRms,Math.sqrt(sum/(end-i)));}if(peakRms<threshold){if(quietStart===null)quietStart=i;}else finish(i);}
 finish(last);
 const retained=[];let cursor=0;for(const gap of gaps){if(gap.start>cursor+.000001)retained.push({offset:cursor,duration:gap.start-cursor});cursor=gap.end;}if(cursor<clip.duration-.000001)retained.push({offset:cursor,duration:clip.duration-cursor});
 return {gaps,retained,removed:gaps.reduce((s,g)=>s+g.end-g.start,0),allSilent:retained.length===0};
}
function segments(clip,plan,sliceClip,newId){let at=clip.start;return plan.retained.map((part,i)=>{const c=sliceClip(clip,part.offset,part.duration);c.id=i===0?clip.id:newId();c.start=at;at+=c.duration;if(part.offset>0)c.fadeIn=Math.min(.005,c.duration/4);if(part.offset+part.duration<clip.duration-.00001)c.fadeOut=Math.min(.005,c.duration/4);return c;});}
const api={analyze,segments};if(typeof module!=='undefined')module.exports=api;else root.CutlineAudioEditing=api;
})(globalThis);
