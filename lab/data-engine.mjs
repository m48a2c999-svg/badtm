import {sunPos,clearSky} from './engine.mjs';
const D2R=Math.PI/180;

export function parseCSV(text) {
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
    else if(c===','&&!quote){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  const head=rows.shift().map(s=>s.replace(/^\uFEFF/,''));
  return rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])));
}
export const numberFields=['lat','lon','floors','height_m','gross_area_m2','footprint_model_m2','obstruction_deg','orient_deg','aspect','n_neighbors','EUI','peak_kW','UDI','PMV_ok','heat','cool','light','dEUI_pct','dpeak_pct','dUDI_pp','dPMV_pp'];
export function numeric(row){return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,numberFields.includes(k)?(v===''?null:Number(v)):v]));}
export function pointInside(p,ring){
 let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;
}
export function rayBlocked(point,sp,buildings,self){
 if(sp.alt<=0)return false;
 const ux=Math.sin(sp.az*D2R),uy=Math.cos(sp.az*D2R),tana=Math.tan(sp.alt*D2R);
 for(const b of buildings){if(b.sim_name===self||b.height_m<=point[2])continue;
  const max=(b.height_m-point[2])/tana;
  if(pointInside(point,b.ring))return true;
  for(let i=0;i<b.ring.length;i++){
   const a=b.ring[i],c=b.ring[(i+1)%b.ring.length],vx=c[0]-a[0],vy=c[1]-a[1],den=ux*vy-uy*vx;
   if(Math.abs(den)<1e-9)continue;
   const qx=a[0]-point[0],qy=a[1]-point[1],t=(qx*vy-qy*vx)/den,u=(qx*uy-qy*ux)/den;
   if(t>0.01&&t<max&&u>=0&&u<=1)return true;
  }
 }return false;
}
export function regionAround(buildings,id){
 const b=buildings.find(x=>x.sim_name===id),kx=111320*Math.cos(b.lat*D2R),ky=110540;
 return buildings.map(x=>({...x,x:(x.lon-b.lon)*kx,y:(x.lat-b.lat)*ky,
 ring:JSON.parse(x.polygon).map(p=>[(p[1]-b.lon)*kx,(p[0]-b.lat)*ky])}));
}
export function controlState(tag,{month,day,minute,irr,direct,profile,azDifference,face}){
 const activeSeason=month>=5&&month<=9;
 const weekday=new Date(Date.UTC(2023,month-1,day)).getUTCDay();
 const peak=weekday>=1&&weekday<=5&&minute>=780&&minute<1080;
 const vertical=tag.startsWith('VF');
 if(vertical&&face!==90&&face!==270)return{angle:0,deployed:false,active:false,label:'이 입면에는 미적용',reason:'수직 루버는 동·서 입면에만 적용합니다.'};
 if(tag==='S1')return{angle:0,deployed:false,active:false,label:'차양 없음',reason:'주변 건물의 차폐만 반영한 기준 모델입니다.'};
 if(['F0','LH_F0','VF_F0'].includes(tag))return{angle:0,deployed:true,active:false,label:'고정 상태',reason:'고정형은 시간이나 일사량에 따라 움직이지 않습니다.'};
 const cut=vertical?Math.min(80,Math.max(0,90-Math.abs(azDifference))):Math.min(80,Math.max(0,90-profile));
 if(tag==='BT_T300'||tag==='LT_T300'){
  const active=activeSeason&&irr>300;
  return{angle:active?cut:0,deployed:tag==='LT_T300'||active,active,label:active?'일사 감지 · 차양 작동':tag==='BT_T300'?'블라인드 걷어 올림':'수평 대기',
  reason:!activeSeason?'10~4월에는 일사량 기준 제어를 작동시키지 않습니다.':active?'입면 일사 300 W/m² 초과 → 설명용 컷오프 각도로 조절합니다.':'입면 일사 300 W/m² 이하 → 블라인드는 걷고 루버는 수평으로 둡니다.'};
 }
 if(tag==='PK')return{angle:peak?80:0,deployed:true,active:peak,label:peak?'피크 시간 · 폐쇄':'수평 대기',reason:peak?'2023년 달력 기준 평일 13~18시의 폐쇄 규칙입니다.':'평일 13~18시가 아니므로 수평 상태입니다.'};
 return{angle:direct?cut:0,deployed:true,active:direct,label:direct?'직달일사 · 각도 조절':'수평 대기',reason:direct?'직달일사를 차단하는 동작을 축약해 보여 줍니다.':'직달일사가 없거나 주변 건물에 가려져 수평으로 둡니다.'};
}
export function snapshot(buildings,id,tag,date,minute,face,shade,region=null){
 const b=buildings.find(x=>x.sim_name===id),r=region||regionAround(buildings,id);
 const ymd=date.split('-').map(Number),sp=sunPos(ymd,minute,b.lat,b.lon),cs=clearSky(sp.alt,ymd[1]);
 const theta=face*D2R,ring=r.find(x=>x.sim_name===id).ring;
 const half=Math.max(...ring.map(p=>p[0]*Math.sin(theta)+p[1]*Math.cos(theta)))+.5;
 const point=[half*Math.sin(theta),half*Math.cos(theta),b.height_m/2];
 const cos=Math.max(0,Math.cos(sp.alt*D2R)*Math.cos((sp.az-face)*D2R));
 const blocked=shade&&sp.alt>0&&cos>0&&rayBlocked(point,sp,r,id);
 const direct=sp.alt>0&&cos>0&&!blocked;
 const irr=sp.alt<=0?0:cs.dn*cos*(blocked?0:1)+cs.dh*.5+.1*(cs.dn*Math.sin(sp.alt*D2R)+cs.dh);
 const azDifference=((sp.az-face+540)%360)-180;
 const profile=Math.atan2(Math.tan(Math.max(0,sp.alt)*D2R),Math.max(.001,Math.cos(azDifference*D2R)))/D2R;
 return{sp,irr,blocked,direct,point,control:controlState(tag,{month:ymd[1],day:ymd[2],minute,irr,direct,profile,azDifference,face})};
}

