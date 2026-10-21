/* Shared browser/native production settings. No network or external media. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CutlineProduction=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const musicVolume=7;
 function musicPlan(project,asset,{volume=musicVolume,replace=true}={}){
  const end=Math.max(0,...project.clips.filter(c=>c.audioRole!=='music').map(c=>c.start+c.duration));
  if(!(end>=.05)||!asset?.hasAudio||!(asset.duration>=.05))throw Error('Add footage or narration and choose a music asset.');
  if(!Number.isFinite(volume)||volume<0||volume>100)throw Error('Music volume must be between 0 and 100.');
  const previous=project.clips.filter(c=>c.track==='audio'&&c.audioRole==='music'),ops=[];
  if(previous.length&&!replace)throw Error('Music is already present. Choose Replace music to avoid stacking tracks.');
  if(previous.length)ops.push({type:'delete',clipIds:previous.map(c=>c.id)});
  for(let start=0;start<end-.000001;){let length=Math.min(asset.duration,end-start);if(length<.05){const last=ops.at(-1);if(last?.type==='add'){last.duration-=.05-length;length=.05;start=end-length;}else throw Error('Music segment is too short.');}
   ops.push({type:'add',assetId:asset.id,track:'audio',start,duration:length,in:0,patch:{name:asset.name+' · music',audioRole:'music',volume,gainDb:0,ducking:false,fadeIn:start===0?Math.min(.6,length/2):.008,fadeOut:Math.min(start+length>=end-.000001?1:.008,length/2)}});start+=length;
  }return ops;
 }
 function musicWav(seconds=64,preset='bright'){
  if(!Number.isFinite(seconds)||seconds<.1||seconds>600)throw Error('Music duration must be 0.1–600 seconds.');
  const rate=24000,n=Math.ceil(seconds*rate),buffer=new ArrayBuffer(44+n*4),v=new DataView(buffer),str=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  str(0,'RIFF');v.setUint32(4,36+n*4,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,n*4,true);
  const chords=preset==='calm'?[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]]:[[48,52,55,59],[43,50,55,59],[45,52,57,60],[41,48,53,60]],hz=m=>440*2**((m-69)/12),beat=.5;
  for(let i=0;i<n;i++){const t=i/rate,ch=chords[Math.floor(t/4)%4],fade=Math.min(1,t/.4,(seconds-t)/.6),step=Math.floor(t/beat),phase=t%beat;let pad=0;
   for(let j=0;j<ch.length;j++)pad+=Math.sin(2*Math.PI*hz(ch[j])*t)*.055;
   const arp=Math.sin(2*Math.PI*hz(ch[step%4]+12)*phase)*Math.exp(-phase*9)*.16,kick=preset==='calm'?0:Math.sin(2*Math.PI*(50*phase+4*(1-Math.exp(-phase*25))))*Math.exp(-phase*22)*.12;
   const sample=(pad+arp+kick)*fade;v.setInt16(44+i*4,Math.max(-1,Math.min(1,sample))*32767,true);v.setInt16(46+i*4,Math.max(-1,Math.min(1,sample*.96+pad*.04))*32767,true);
  }return buffer;
 }
 function percent(value,status='running'){return status==='done'?100:Math.max(0,Math.min(99,Math.floor((Number(value)||0)*100)));}
 return {musicVolume,musicPlan,musicWav,percent};
});
