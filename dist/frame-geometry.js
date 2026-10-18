/* Geometry shared by canvas rendering, preview handles, and transform checks. */
(function(root){
'use strict';
function geometry(c,a,W,H,pose,local=0){
 const sw=a.width||W,sh=a.height||H,sx=sw*(c.cropLeft||0)/100,sy=sh*(c.cropTop||0)/100;
 const cw=sw*(1-((c.cropLeft||0)+(c.cropRight||0))/100),ch=sh*(1-((c.cropTop||0)+(c.cropBottom||0))/100);
 const base=c.fit==='contain'?Math.min(W/cw,H/ch):Math.max(W/cw,H/ch),motion=1+(c.motion||0)/100*Math.max(0,Math.min(1,local/c.duration)),scale=base*pose.scale/100*motion;
 return {sx,sy,cw,ch,width:cw*scale,height:ch*scale,cx:W*(.5+pose.x/100),cy:H*(.5+pose.y/100),rotation:pose.rotation||0,scale:pose.scale};
}
function contains(g,x,y){const r=-g.rotation*Math.PI/180,dx=x-g.cx,dy=y-g.cy;return Math.abs(dx*Math.cos(r)-dy*Math.sin(r))<=g.width/2&&Math.abs(dx*Math.sin(r)+dy*Math.cos(r))<=g.height/2;}
function resize(g,corner,dx,dy){
 const [hx,hy]=corner,angle=g.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 const vx=hx*g.width,vy=hy*g.height,localX=dx*cos+dy*sin,localY=-dx*sin+dy*cos;
 const factor=Math.max(5/g.scale,Math.min(600/g.scale,1+(localX*vx+localY*vy)/(vx*vx+vy*vy)));
 const shiftX=hx*g.width*(factor-1)/2,shiftY=hy*g.height*(factor-1)/2;
 return {scale:g.scale*factor,cx:g.cx+shiftX*cos-shiftY*sin,cy:g.cy+shiftX*sin+shiftY*cos};
}
const api={geometry,contains,resize};if(typeof module!=='undefined')module.exports=api;else root.CutlineFrameGeometry=api;
})(globalThis);
