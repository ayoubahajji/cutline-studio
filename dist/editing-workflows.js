/* Shared app/MCP plans. Operations preserve framing unless the user changes it. */
(function(root){'use strict';
const Model=typeof module!=='undefined'?require('./editor-model.js'):root.CutlineModel;
function voiceover(project,asset,{keepMusic=true}={}){
 if(!asset||asset.type!=='audio'||!Number.isFinite(asset.duration)||asset.duration<.05)throw new Error('Choose an imported voiceover audio file.');
 const remove=project.clips.filter(c=>c.track==='audio'&&!(keepMusic&&c.audioRole==='music')).map(c=>c.id),mute=project.clips.filter(c=>['video','overlay'].includes(c.track)).map(c=>c.id),ops=[];
 if(remove.length)ops.push({type:'delete',clipIds:remove});if(mute.length)ops.push({type:'update',clipIds:mute,patch:{audioMuted:true}});ops.push({type:'add',assetId:asset.id,track:'audio',start:0,duration:asset.duration,patch:{audioRole:'voice',audioPreset:'original',fadeIn:.008,fadeOut:.025}});return ops;
}
function fitFootage(project,assets,{target,assetIds,shotLength=4,reuse=false}={}){
 if(!Number.isFinite(target)||target<.05||target>36000)throw new Error('Choose a valid target duration.');if(!Number.isFinite(shotLength)||shotLength<.1||shotLength>60)throw new Error('Shot length must be between 0.1 and 60 seconds.');
 const selected=(assetIds||[]).map(id=>assets.find(a=>a.id===id));if(!selected.length||selected.some(a=>!a||a.type!=='video'||!Number.isFinite(a.duration)||a.duration<.05))throw new Error('Choose video footage to extend the edit.');
 let at=Math.max(0,...project.clips.filter(c=>c.track==='video').map(c=>c.start+c.duration));if(at>=target-.000001)return [];
 const ranges=[];for(const a of selected){let intervals=[[0,a.duration]];for(const c of project.clips.filter(c=>c.assetId===a.id&&['video','overlay'].includes(c.track))){const start=c.in||0,end=start+c.duration*(c.speed||1);intervals=intervals.flatMap(([l,r])=>end<=l||start>=r?[[l,r]]:[[l,Math.min(r,start)],[Math.max(l,end),r]].filter(([x,y])=>y-x>=.05));}for(const [start,end]of intervals)ranges.push({asset:a,start,end});}
 const fresh=()=>selected.map(asset=>({asset,start:0,end:asset.duration}));let pool=ranges,round=0,ops=[];
 while(at<target-.000001){if(!pool.length){if(!reuse)throw new Error('Not enough unused footage. Select more videos or enable reuse.');if(++round>10000)throw new Error('Too many footage repetitions.');pool=fresh();}
 const range=pool.shift();let source=range.start;while(source<range.end-.049999&&at<target-.000001){const length=Math.min(shotLength,range.end-source,target-at);if(length<.05){if(ops.length&&target-at<.05){const last=ops.at(-1),asset=selected.find(a=>a.id===last.assetId);if(last.in+last.duration+target-at<=asset.duration+.000001){last.duration+=target-at;at=target;break;}}throw new Error('The remaining gap is too short. Adjust the target or shot length.');}ops.push({type:'add',assetId:range.asset.id,track:'video',start:at,duration:length,in:source,patch:{audioMuted:true,fit:'contain'}});at+=length;source+=length;if(ops.length>2000)throw new Error('The extension would create too many clips.');}
 }return ops;
}
function balance(text,measure,maxWidth){if(!measure||measure(text)<=maxWidth)return text;const words=text.split(/\s+/);let best;for(let i=1;i<words.length;i++){const a=words.slice(0,i).join(' '),b=words.slice(i).join(' '),wa=measure(a),wb=measure(b),score=Math.abs(wa-wb)+10*Math.max(0,Math.max(wa,wb)-maxWidth);if(!best||score<best.score)best={text:a+'\n'+b,score};}return best?.text||text;}
function captions(clips,{maxChars=28,measure,maxWidth=500}={},newId){
 if(!Number.isInteger(maxChars)||maxChars<12||maxChars>60)throw new Error('Caption length must be between 12 and 60 characters.');
 return clips.flatMap(c=>{const words=c.text.trim().split(/\s+/).filter(Boolean),groups=[];let group=[];for(const word of words){if(group.length&&[...group,word].join(' ').length>maxChars){groups.push(group);group=[];}group.push(word);}if(group.length)groups.push(group);if(!groups.length)return [];
  // Avoid fragments shorter than the portable project format can reopen.
  while(groups.length>1&&c.duration/groups.length<.15){const last=groups.pop();groups[groups.length-1].push(...last);}
  const total=words.reduce((n,w)=>n+Math.max(2,w.length),0);let tiny;while(groups.length>1&&(tiny=groups.findIndex(g=>c.duration*g.reduce((n,w)=>n+Math.max(2,w.length),0)/total<.05))>=0){if(tiny===0){groups[1].unshift(...groups[0]);groups.shift();}else{groups[tiny-1].push(...groups[tiny]);groups.splice(tiny,1);}}let offset=0;
  return groups.map((tokens,i)=>{const span=i===groups.length-1?c.duration-offset:c.duration*tokens.reduce((n,w)=>n+Math.max(2,w.length),0)/total,part=Model.sliceClip(c,offset,span);part.id=i===0?c.id:newId();part.text=balance(tokens.join(' '),measure?text=>measure(text,c):null,maxWidth);part.name=part.text.replace(/\n/g,' ').slice(0,32);offset+=span;return part;});
 });
}
function blurPreset(position){if(position==='top')return {x:0,y:-45,width:100,height:10};if(position==='bottom')return {x:0,y:45,width:100,height:10};throw new Error('Unknown blur preset.');}
const api={voiceover,fitFootage,balance,captions,blurPreset};if(typeof module!=='undefined')module.exports=api;else root.CutlineWorkflows=api;
})(globalThis);
