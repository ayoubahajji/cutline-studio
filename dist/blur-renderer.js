/* Extend source edges before Gaussian filtering: opaque edge text must not ghost through. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CutlineBlurRenderer=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function create(factory){const scratch=new Map();function surface(key,w,h){let c=scratch.get(key);if(!c){c=factory(w,h);scratch.set(key,c);}if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;const ctx=c.getContext('2d');ctx.clearRect(0,0,w,h);return c;}
  return function draw(canvas,ctx,{x,y,width,height,radius=22,mode='blur',opacity=1}){
   const W=canvas.width,H=canvas.height,sigma=Math.max(1,radius*H/1080),pad=Math.ceil(3*sigma)+2,copy=surface('copy',W,H);copy.getContext('2d').drawImage(canvas,0,0);
   ctx.save();try{ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();ctx.globalAlpha=opacity;
    if(mode==='pixelate'){const block=Math.max(6,radius)*H/1080,small=surface('small',Math.max(1,Math.round(W/block)),Math.max(1,Math.round(H/block)));small.getContext('2d').drawImage(copy,0,0,small.width,small.height);ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,W,H);}
    else{const padded=surface('padded',W+pad*2,H+pad*2),p=padded.getContext('2d');p.drawImage(copy,pad,pad);
     p.drawImage(copy,0,0,W,1,pad,0,W,pad);p.drawImage(copy,0,H-1,W,1,pad,H+pad,W,pad);p.drawImage(copy,0,0,1,H,0,pad,pad,H);p.drawImage(copy,W-1,0,1,H,W+pad,pad,pad,H);
     for(const [sx,sy,dx,dy]of [[0,0,0,0],[W-1,0,W+pad,0],[0,H-1,0,H+pad],[W-1,H-1,W+pad,H+pad]])p.drawImage(copy,sx,sy,1,1,dx,dy,pad,pad);
     ctx.filter=`blur(${sigma}px)`;ctx.drawImage(padded,-pad,-pad);
    }
   }finally{ctx.restore();}
  };
 }return {create};
});
