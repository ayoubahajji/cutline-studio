/* Timeline math shared by the editor and its regression checks. */
(function(root){
'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
const bounded=(v,a,b)=>Math.max(a,Math.min(b,v));
const poseKeys=['x','y','scale','rotation','opacity','width','height'];
function poseAt(c,t){
 const pose={x:0,y:0,scale:100,rotation:0,opacity:100,width:25,height:12};
 for(const key of poseKeys)if(Number.isFinite(c[key]))pose[key]=c[key];
 const frames=[...(c.keyframes||[])].sort((a,b)=>a.time-b.time);if(!frames.length)return pose;
 const before=frames.filter(k=>k.time<=t).at(-1)||frames[0];
 const after=frames.find(k=>k.time>=t)||frames.at(-1);
 const f=before===after?0:bounded((t-before.time)/(after.time-before.time),0,1);
 for(const key of poseKeys){const a=before[key]??pose[key],b=after[key]??a;pose[key]=a+(b-a)*f;}
 return pose;
}
function sliceClip(c,offset,length){
 const d=clone(c);d.start=c.start+offset;d.duration=length;if(c.assetId)d.in=(c.in||0)+offset*(c.speed||1);
 if(c.keyframes?.length){const end=offset+length;d.keyframes=[{time:0,...poseAt(c,offset)},...c.keyframes.filter(k=>k.time>offset&&k.time<end).map(k=>({...k,time:k.time-offset})),{time:length,...poseAt(c,end)}];}
 if(offset>0){d.fadeIn=0;d.transition='none';}if(offset+length<c.duration-.00001)d.fadeOut=0;
 return d;
}
function retimeClip(c,speed){
 if(!Number.isFinite(speed)||speed<=0)throw new Error('Speed must be positive.');
 const d=clone(c),factor=(c.speed||1)/speed;d.speed=speed;d.duration=c.duration*factor;
 for(const key of ['fadeIn','fadeOut','transitionDuration'])if(Number.isFinite(d[key]))d[key]*=factor;
 for(const keyframe of d.keyframes||[])keyframe.time*=factor;
 return d;
}
function audioRange(c,from,to,keep,sliceId){
 const a=bounded(from,0,c.duration),b=bounded(to,0,c.duration);if(!Number.isFinite(a)||!Number.isFinite(b)||b-a<.05-.000001)throw new Error('Select at least 0.05 seconds.');if(!keep&&((a>0&&a<.05-.000001)||(c.duration-b>0&&c.duration-b<.05-.000001)))throw new Error('Leave at least 0.05 seconds at each remaining edge, or select that edge too.');
 const slice=(offset,length)=>{const piece=sliceClip(c,offset,length);if(piece.duration<.05&&piece.duration>=.05-.000001)piece.duration=.05;return piece;};
 if(keep){const piece=slice(a,b-a);if(a>0)piece.fadeIn=Math.min(.005,piece.duration/4);if(b<c.duration)piece.fadeOut=Math.min(.005,piece.duration/4);return [piece];}
 if(a<=.000001&&b>=c.duration-.000001)return [];
 const result=[];if(a>.000001)result.push(slice(0,a));if(b<c.duration-.000001){const right=slice(b,c.duration-b);right.start=c.start+a;if(result.length)right.id=sliceId();result.push(right);}
 if(a>0&&result.length)result[0].fadeOut=Math.min(.005,result[0].duration/4);if(b<c.duration&&result.length)result.at(-1).fadeIn=Math.min(.005,result.at(-1).duration/4);if(result.length===1)result[0].id=c.id;return result;
}
function split(c,t){const offset=t-c.start;if(offset<.05||offset>c.duration-.05)return null;return [sliceClip(c,0,offset),sliceClip(c,offset,c.duration-offset)];}
function envelope(c,t){const local=t-c.start;if(local<0||local>=c.duration)return 0;return Math.min(1,c.fadeIn>0?local/c.fadeIn:1,c.fadeOut>0?(c.duration-local)/c.fadeOut:1);}
function parseSubtitles(input){
 const cleaned=input.replace(/^\uFEFF/,'').replace(/\r/g,'').replace(/^WEBVTT[^\n]*\n/,'');const result=[];
 const stamp=s=>{const parts=s.trim().replace(',','.').split(':').map(Number);return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts.length===2?parts[0]*60+parts[1]:NaN;};
 for(const block of cleaned.split(/\n\s*\n/)){
  const lines=block.split('\n'),i=lines.findIndex(l=>l.includes('-->'));if(i<0)continue;
  const [a,b]=lines[i].split('-->');const start=stamp(a),end=stamp(b.trim().split(/\s/)[0]);const text=lines.slice(i+1).join('\n').replace(/<[^>]*>/g,'').trim();
  if(Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&text)result.push({start,duration:end-start,text});
 }return result.sort((a,b)=>a.start-b.start);
}
function srtTimestamp(t){let n=Math.round(Math.max(0,t)*1000);const h=Math.floor(n/3600000);n%=3600000;const m=Math.floor(n/60000);n%=60000;const s=Math.floor(n/1000),ms=n%1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;}
function toSrt(clips){return [...clips].sort((a,b)=>a.start-b.start).map((c,i)=>`${i+1}\n${srtTimestamp(c.start)} --> ${srtTimestamp(c.start+c.duration)}\n${c.text}\n`).join('\n');}
const api={clone,poseAt,sliceClip,retimeClip,audioRange,split,envelope,parseSubtitles,toSrt};
if(typeof module!=='undefined')module.exports=api;else root.CutlineModel=api;
})(globalThis);
