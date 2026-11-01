export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export const ramp=(t,a,b)=>smooth((t-a)/(b-a));
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const mul=(a,k)=>a.map(v=>v*k);
export const norm=a=>mul(a,1/Math.hypot(...a));
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function camera(eye,target,center=[960,510],focal=1150){
 const f=norm(sub(target,eye)),r=norm(cross(f,[0,1,0])),u=cross(r,f);
 return p=>{const v=sub(p,eye),z=dot(v,f);return[center[0]+dot(v,r)*focal/z,center[1]-dot(v,u)*focal/z,z];};
}
export function rayHit(origin,direction,angle){
 const n=[0,-Math.cos(angle),Math.sin(angle)],across=[0,Math.sin(angle),Math.cos(angle)],den=dot(n,direction);
 let hit=null;
 if(Math.abs(den)<1e-8)return null;
 for(let i=0;i<15;i++){
  const center=[0,(i-7)*6,0],distance=dot(n,sub(center,origin))/den;
  if(distance<0||(hit&&distance>=hit.distance))continue;
  const point=add(origin,mul(direction,distance)),s=dot(sub(point,center),across);
  if(Math.abs(point[0])<=48&&Math.abs(s)<=4)hit={point,distance,index:i,reflected:sub(direction,mul(n,2*dot(direction,n)))};
 }
 return hit;
}
export function slatCorners(y,angle){return[[-48,y-4*Math.sin(angle),-4*Math.cos(angle)],[48,y-4*Math.sin(angle),-4*Math.cos(angle)],[48,y+4*Math.sin(angle),4*Math.cos(angle)],[-48,y+4*Math.sin(angle),4*Math.cos(angle)]];}
export function chapterAt(t){return Math.min(5,Math.floor(clamp(t,0,60)/10));}
