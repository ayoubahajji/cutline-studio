/* Never confuse container/audio length with actual available moving pictures. */
(function(root){
'use strict';
function problems(project,assets,reports,end,allowed=new Set()){
 const issues=[];
 for(const c of project.clips){const a=assets.get(c.assetId),report=reports.get(c.assetId);if(!a||a.type!=='video'||!['video','overlay'].includes(c.track)||project.muted?.[c.track]||c.start>=end||!report)continue;
  const speed=c.speed||1,from=c.in||0,to=from+Math.max(0,Math.min(c.duration,end-c.start))*speed;
  if(to>report.videoDuration+.15)issues.push({kind:'short',id:c.id,assetId:c.assetId,name:c.name,sourceTime:report.videoDuration,timelineTime:c.start+Math.max(0,report.videoDuration-from)/speed,message:`Pictures end at ${report.videoDuration.toFixed(2)}s, but this edit requests ${to.toFixed(2)}s from the source.`});
  if(!allowed.has(c.assetId))for(const f of report.frozen||[]){const left=Math.max(from,f.start),right=Math.min(to,f.end);if(right-left>=1)issues.push({kind:'frozen',id:c.id,assetId:c.assetId,name:c.name,sourceTime:left,timelineTime:c.start+(left-from)/speed,message:`This source already repeats one picture from ${left.toFixed(2)}s to ${right.toFixed(2)}s.`});}
 }
 return issues.sort((a,b)=>a.timelineTime-b.timelineTime);
}
function movingTail(project,assets,reports,end){
 const start=Math.max(0,end-2);let video=false;
 for(const c of project.clips){if(c.start>=end||c.start+c.duration<=start||project.muted?.[c.track]||!['video','overlay'].includes(c.track))continue;const a=assets.get(c.assetId);if(a?.type==='image')return false;if(a?.type!=='video')continue;video=true;const report=reports.get(c.assetId);if(!report)return false;const from=(c.in||0)+Math.max(0,start-c.start)*(c.speed||1),to=(c.in||0)+Math.min(c.duration,end-c.start)*(c.speed||1);if((report.frozen||[]).some(f=>f.start<to&&f.end>from))return false;
 }
 return video;
}
const api={problems,movingTail};if(typeof module!=='undefined')module.exports=api;else root.CutlineSourceCheck=api;
})(globalThis);
