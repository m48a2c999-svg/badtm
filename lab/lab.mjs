import {parseCSV,numeric,regionAround,snapshot} from './data-engine.mjs';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const c=$('#scene'),ctx=c.getContext('2d'),W=1280,H=800;
const fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const signed=(v,d=2)=>Number.isFinite(v)?(v>0?'+':'')+fmt(v,d):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tags=['F0','LH_F0','VF_F0','S3','LH_C','VF_C','BT_T300','LT_T300','PK'];
const S={buildings:[],results:[],alts:[],index:new Map(),id:'ARK',tag:'BT_T300',date:'2023-07-21',minute:600,face:90,shade:true,play:false,speed:24,yaw:-.52,stage:2,tour:false,tourStart:0,ready:false,last:0,phase:0,recorder:null};
const steps=[
 ['건물 데이터가 계산의 출발점입니다.','위치·윤곽·높이·층수·연면적을 모읍니다. 실제로 확보한 건물 자료와 모든 건물에 공통으로 부여한 창·설비 조건을 구분합니다.'],
 ['형상과 성능 조건을 모델로 만듭니다.','건물과 주변 차폐면을 만들고 기상·창 성능·조명·설비·재실 스케줄을 입력합니다. 화면의 3D는 형상 데이터 설명용이며 EnergyPlus 존 모델의 상세 재현은 아닙니다.'],
 ['입면에 들어오는 햇빛이 차양을 움직입니다.','선택한 입면의 일사량과 작동 계절을 확인합니다. 300 W/m² 기준 제어, 직달일사에 따른 각도 제어, 평일 피크 시간 제어는 서로 다른 규칙입니다.'],
 ['연간 계산에서 여러 성능을 함께 읽습니다.','EnergyPlus는 동일 건물의 기준 모델과 9개 대안을 연간 계산합니다. 여기서는 저장된 차폐 조건별 결과를 조회하며 시간 슬라이더가 연간 에너지를 새로 계산하지 않습니다.'],
 ['절감과 손실을 함께 보고 적용을 판단합니다.','냉방을 줄여도 난방·조명이 증가할 수 있습니다. EUI·피크·채광·열쾌적을 함께 비교하고 효과 크기·실측 오차·수렴·구동 에너지와 비용을 검증합니다.']
];
const metricSpecs=[['EUI','dEUI_pct','에너지원단위','kWh/m²·yr','%',false],['peak_kW','dpeak_pct','피크전력','kW','%',false],['UDI','dUDI_pp','유용조도 UDI','%','%p',true],['PMV_ok','dPMV_pp','열쾌적 허용시간','%','%p',true]];
const cond=()=>S.shade?'차폐 포함':'차폐 제외';
const result=(tag=S.tag)=>S.index.get(S.id+'|'+cond()+'|'+tag);
const building=()=>S.buildings.find(x=>x.sim_name===S.id);
const alternative=()=>S.alts.find(x=>x.tag===S.tag);
const timeString=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(Math.floor((m%60)/10)*10).padStart(2,'0');
const status=t=>$('#status').textContent=t;
function stage(n){S.stage=n;$$('[data-stage]').forEach(b=>{const active=+b.dataset.stage===n;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active);});$('#stepno').textContent=String(n+1).padStart(2,'0')+' / 05';$('#steptitle').textContent=steps[n][0];$('#steptext').textContent=steps[n][1];}
function readControls(){
 S.id=$('#building').value;S.tag=$('#alternative').value;S.face=+$('#face').value;S.shade=$('#shade').checked;
 const date=$('#date').value;if(/^2023-\d\d-\d\d$/.test(date))S.date=date;else{$('#date').value=S.date;status('설명용 날짜는 2023년 달력 범위에서 선택하세요.');}
 S.region=regionAround(S.buildings,S.id);renderResults();updateSnapshot();draw();
}
function updateSnapshot(){
 if(!S.ready)return;
 S.snap=snapshot(S.buildings,S.id,S.tag,S.date,Math.floor(S.minute/10)*10,S.face,S.shade,S.region);
 const a=S.snap;
 $('#clock').textContent=timeString(S.minute);$('#hour').value=Math.round(S.minute/10)*10;
 $('#altitude').textContent=fmt(a.sp.alt,1)+'°';$('#irradiance').textContent=fmt(a.irr,0)+' W/m²';
 $('#blocked').textContent=a.sp.alt<=0?'일몰 후':a.blocked?'가려짐':a.direct?'입사':'입면 뒤';
 $('#angle').textContent=a.control.deployed?fmt(a.control.angle,0)+'°':'걷어 올림';
 $('#state').textContent=a.control.label;$('#rule').textContent=a.control.reason;
}
function chartBar(label,value,max,selected=false,tag=''){
 const width=Math.min(49,Math.abs(value)/Math.max(max,.01)*48);
 return '<div class="chartrow '+(selected?'selected':'')+'"'+(tag?' role="button" tabindex="0" data-alt="'+tag+'" aria-label="'+esc(label)+' 선택"':'')+'><span>'+esc(label)+'</span><div class="bar"><i class="zero"></i><i class="fill '+(value<0?'neg':'')+'" style="left:'+(value<0?50-width:50)+'%;width:'+width+'%"></i></div><strong>'+signed(value,2)+'</strong></div>';
}
function renderResults(){
 const b=building(),a=alternative(),r=result(),base=result('S1');
 if(!b||!r||!base){status('선택 조건에 해당하는 결과가 없습니다.');return;}
 $('#facts').innerHTML='<span><b>'+b.floors+'</b> 층</span><span><b>'+fmt(b.height_m,0)+'</b> m</span><span><b>'+fmt(b.gross_area_m2,0)+'</b> m²</span>';
 $('#result-context').textContent=(b.name||b.sim_name)+' · '+a.name+' · '+cond()+' · 연간 계산 / 일사량 기준 2종은 5~9월 작동';
 $('#metrics').innerHTML=metricSpecs.map(([key,delta,title,unit,du,higher])=>{
  const d=S.tag==='S1'?0:r[delta],cl=Math.abs(d)<.00001?'neutral':((d>0)===higher?'good':'bad');
  return '<div class="metric"><h3>'+title+'</h3><div class="delta '+cl+'">'+signed(d,2)+'<small>'+du+'</small></div><div class="detail">기준 '+fmt(base[key],2)+' → 대안 '+fmt(r[key],2)+' '+unit+'</div></div>';
 }).join('');
 const values=[['난방(가스)',r.heat-base.heat],['냉방',r.cool-base.cool],['조명',r.light-base.light]];
 const rest=(r.EUI-base.EUI)-values.reduce((s,v)=>s+v[1],0);
 values.push(['그 외 항목 합계',rest]);
 const max=Math.max(...values.map(v=>Math.abs(v[1])),.01);
 $('#enduses').innerHTML=values.map(v=>chartBar(v[0],v[1],max)).join('');
 $('#balance-note').textContent='합계 '+signed(r.EUI-base.EUI,3)+' kWh/m²·yr. 그 외 항목은 총 EUI 차이에서 위 세 용도의 차이를 뺀 잔차입니다.';
 const rr=tags.map(t=>({tag:t,r:result(t),a:S.alts.find(x=>x.tag===t)})).filter(x=>x.r);
 const mx=Math.max(...rr.map(x=>Math.abs(x.r.dEUI_pct)),.01);
 $('#alternatives-chart').innerHTML=rr.map(x=>chartBar(x.a.name.replace('각도 제어','').replace('일사량 기준 제어','일사량 제어'),x.r.dEUI_pct,mx,x.tag===S.tag,x.tag)).join('');
 const dE=r.dEUI_pct||0,dP=r.dpeak_pct||0;
 let title='모든 지표의 방향과 크기를 함께 확인하세요.';
 let text='이 값은 명시된 입력 가정의 예비 시뮬레이션 결과입니다. 상대 효과도 추가 검증이 필요합니다.';
 if(S.tag==='S1'){title='개선 전 기준 모델입니다.';text='성능 개선안을 선택하면 같은 차폐 조건의 기준값과 비교합니다.';}
 else if(Math.abs(dE)<.1){title='EUI 변화가 0.1% 미만인 작은 차이입니다.';text='부호만으로 실용적인 절감을 판단하지 않습니다. 수치 안정성·입력 가정·구동 에너지·비용을 함께 확인해야 합니다.';}
 else if(dE<0&&dP>0){title='연간 에너지가 줄어도 피크전력은 늘 수 있습니다.';text='난방·냉방·조명의 변화와 채광·열쾌적 손실을 함께 읽어야 합니다. 하나의 지표만으로 적용을 권장하지 않습니다.';}
 else if(dE>0){title='이 조건에서는 연간 에너지가 증가했습니다.';text='현재 제어와 계절 조건의 결과입니다. 다른 조건이나 키네틱 파사드 전체의 성능으로 일반화하지 않습니다.';}
 $('#interpretation').innerHTML='<b>'+title+'</b>'+text;
}
function rr(x,y,w,h,r=8){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function text(t,x,y,size=16,color='#1e2a38',weight='400',align='left'){
 ctx.font=weight+' '+size+'px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,y);
}
function wrap(t,x,y,width,size=16,color='#687480',line=25,maxLines=3){
 let s='',n=0;ctx.font='400 '+size+'px -apple-system, "Apple SD Gothic Neo", sans-serif';
 for(const ch of t){if(ctx.measureText(s+ch).width>width&&s){text(s,x,y+n*line,size,color);s='';n++;if(n>=maxLines)return;}s+=ch;}if(s)text(s,x,y+n*line,size,color);
}
function path(p,fill,stroke='#bbc6bf',width=1){ctx.beginPath();p.forEach((a,i)=>i?ctx.lineTo(...a):ctx.moveTo(...a));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function line(p,q,color,width=1,dash=[]){ctx.beginPath();ctx.setLineDash(dash);ctx.moveTo(...p);ctx.lineTo(...q);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.setLineDash([]);}
function draw(){
 if(!S.ready)return;const snap=S.snap,b=building(),a=alternative(),r=result(),base=result('S1');
 ctx.clearRect(0,0,W,H);ctx.fillStyle='#f0f1ec';ctx.fillRect(0,0,W,H);
 const yaw=S.yaw,co=Math.cos(yaw),si=Math.sin(yaw);
 const scale=Math.min(1.65,250/Math.max(b.height_m,80));
 const project=(x,y,z=0)=>[465+(x*co-y*si)*scale,400-(x*si+y*co)*scale*.48-z*scale*.86];
 const growth=S.tour&&S.stage===1?Math.min(1,((S.phase-10)/10)):1;
 const hg=S.tour&&S.stage===0?.08:Math.max(.08,growth);
 ctx.save();ctx.beginPath();ctx.rect(10,60,900,536);ctx.clip();
 for(let n=-400;n<=400;n+=40){line(project(n,-400),project(n,400),'#dce0d8',.7);line(project(-400,n),project(400,n),'#dce0d8',.7);}
 const all=S.region.filter(n=>Math.hypot(n.x,n.y)<250||n.sim_name===S.id);
 const shown=S.shade?all:all.filter(n=>n.sim_name===S.id);
 if(snap.sp.alt>2){
  const ux=Math.sin(snap.sp.az*Math.PI/180),uy=Math.cos(snap.sp.az*Math.PI/180),ta=Math.tan(snap.sp.alt*Math.PI/180);
  for(const n of shown){const len=Math.min(700,n.height_m*hg/ta),p=n.ring;
   for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];path([project(...p[i]),project(...q),project(q[0]-ux*len,q[1]-uy*len),project(p[i][0]-ux*len,p[i][1]-uy*len)],n.sim_name===S.id?'#74878335':'#a2ada326',null);}
  }
 }
 const sorted=[...shown].sort((a,b)=>(b.x*si+b.y*co)-(a.x*si+a.y*co));
 for(const n of sorted){
  const target=n.sim_name===S.id,pts=n.ring,h=n.height_m*hg;
  const faces=pts.map((p,i)=>({p,q:pts[(i+1)%pts.length],depth:(p[0]+pts[(i+1)%pts.length][0])*si+(p[1]+pts[(i+1)%pts.length][1])*co})).sort((a,b)=>b.depth-a.depth);
  for(const f of faces){
   const faceColor=target?(f.depth>0?'#e5d9bd':'#f4ead7'):(f.depth>0?'#c7d1c7':'#dce2d8');
   path([project(...f.p),project(...f.q),project(f.q[0],f.q[1],h),project(f.p[0],f.p[1],h)],faceColor,target?'#7b8d8a':'#b7c2b8',target?1.4:.65);
   if(target){
    const floors=Math.min(n.floors,30);for(let fl=1;fl<floors;fl++){const z=h*fl/floors;line(project(f.p[0],f.p[1],z),project(f.q[0],f.q[1],z),'#b1b8aa',.65);}
    const len=Math.hypot(f.q[0]-f.p[0],f.q[1]-f.p[1]);
    const cols=Math.min(14,Math.floor(len/4));
    for(let j=1;j<cols;j++){const x=f.p[0]+(f.q[0]-f.p[0])*j/cols,y=f.p[1]+(f.q[1]-f.p[1])*j/cols;line(project(x,y,0),project(x,y,h),'#c6c6b5',.6);}
   }
  }
  path(pts.map(p=>project(p[0],p[1],h)),target?'#fff5db':'#e7ebe3',target?'#dc744b':'#bcc6bb',target?1.8:.8);
 }
 const pp=project(snap.point[0],snap.point[1],snap.point[2]*hg);
 if(S.stage>=2){
  const solar=[Math.sin(snap.sp.az*Math.PI/180)*190,Math.cos(snap.sp.az*Math.PI/180)*190,Math.max(10,Math.sin(snap.sp.alt*Math.PI/180)*245)];
  const sun=project(...solar);
  if(snap.sp.alt>0){
   ctx.fillStyle='#eea85025';ctx.beginPath();ctx.arc(...sun,23,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='#e8a644';ctx.beginPath();ctx.arc(...sun,11,0,Math.PI*2);ctx.fill();
   if(snap.direct||snap.blocked)line(sun,pp,snap.blocked?'#a8afab':'#e2a64d',1.7,snap.blocked?[6,5]:[]);
   if(!snap.blocked&&snap.direct){for(let i=0;i<5;i++){const k=(S.phase*.4+i/5)%1;ctx.fillStyle='#e2a64d';ctx.beginPath();ctx.arc(sun[0]+(pp[0]-sun[0])*k,sun[1]+(pp[1]-sun[1])*k,3,0,Math.PI*2);ctx.fill();}}
  }
  ctx.fillStyle='#e8541e';ctx.beginPath();ctx.arc(...pp,5,0,Math.PI*2);ctx.fill();
  line(pp,[pp[0]+40,pp[1]-30],'#e8541e',1);text('입면 중앙 관찰점',pp[0]+45,pp[1]-32,12,'#8c4a2c');
 }
 const roof=project(0,0,b.height_m*hg);
 text(b.name||b.sim_name,roof[0],Math.max(100,roof[1]-23),18,'#1e2a38','600','center');
 text(b.floors+'층 / '+fmt(b.height_m,0)+' m',roof[0],Math.max(120,roof[1]-4),11,'#69756f','400','center');
 // North arrow, projected using the same axes as the buildings.
 const n0=[68,535],np=project(0,45),op=project(0,0),n1=[n0[0]+np[0]-op[0],n0[1]+np[1]-op[1]];
 line(n0,n1,'#52695f',2);ctx.fillStyle='#52695f';ctx.beginPath();ctx.arc(...n1,3,0,Math.PI*2);ctx.fill();text('N',n1[0],n1[1]-10,12,'#52695f','600','center');
 text(S.shade?'257동 표본의 주변 형상 표시':'주변 차폐 제외',94,557,11,'#7a8780');
 ctx.restore();
 // Facade detail and live control readout.
 ctx.fillStyle='#ffffffd9';rr(926,80,328,500,9);ctx.fill();
 text('FACADE DETAIL',948,112,11,'#e8541e','600');
 text(['북','동','남','서'][S.face/90]+'향 입면 · 작동 개념도',948,138,17,'#1e2a38','600');
 text(timeString(S.minute)+'  /  '+S.date.slice(5).replace('-','.'),948,164,13,'#687480');
 const wx=995,wy=204,ww=190,wh=200;
 ctx.fillStyle=snap.direct?'#ffe6ac':'#dce6e7';ctx.fillRect(wx,wy,ww,wh);
 line([wx+ww/2,wy],[wx+ww/2,wy+wh],'#aebdbe',2);line([wx,wy+wh/2],[wx+ww,wy+wh/2],'#aebdbe',2);
 ctx.strokeStyle='#334c52';ctx.lineWidth=6;ctx.strokeRect(wx,wy,ww,wh);
 const ctl=snap.control,vertical=S.tag.startsWith('VF'),angle=ctl.angle*Math.PI/180;
 if(ctl.deployed){
  const n=vertical?7:10;
  for(let i=0;i<n;i++){
   if(vertical){const x=wx+8+i*(ww-16)/(n-1),width=5+Math.sin(angle)*15;path([[x-width/2,wy-5],[x+width/2,wy+2],[x+width/2,wy+wh+5],[x-width/2,wy+wh-2]],ctl.active?'#d57347':'#78908e','#536e6c',.8);}
   else{const y=wy+7+i*(wh-14)/(n-1),ht=3+Math.sin(angle)*15;path([[wx-5,y-ht/2],[wx+ww+5,y-ht/2+3],[wx+ww+5,y+ht/2+3],[wx-5,y+ht/2]],ctl.active?'#dc8850':'#8aa09a','#5b7670',.7);}
  }
 }else if(S.tag==='BT_T300'){for(let i=0;i<3;i++)line([wx-5,wy-9-i*4],[wx+ww+5,wy-9-i*4],'#7f9590',3);}
 text(ctl.label,1090,447,18,ctl.active?'#d65b2a':'#375b56','600','center');
 text('입면 일사  '+fmt(snap.irr,0)+' W/m²',1090,477,14,'#465c5a','400','center');
 text(ctl.deployed?'축약 각도  '+fmt(ctl.angle,0)+'°':'차양 걷힘',1090,500,13,'#6e7c75','400','center');
 wrap('실물 입면 디자인·정확한 슬랫 각도를 재현한 화면은 아닙니다.',948,535,280,11,'#7a8780',18,2);
 text('형상·높이 데이터 기반 3D 개념 모형',35,85,12,'#617569');
 // Recorded video and PNG include provenance, selected conditions, annual outcomes, and captions.
 ctx.fillStyle='#fff';ctx.fillRect(0,600,W,200);
 line([28,600],[1252,600],'#d7ddda');
 text((S.stage+1).toString().padStart(2,'0')+' / '+steps[S.stage][0],30,633,19,'#1e2a38','600');
 const cap=S.tour&&S.stage===3?'EnergyPlus 23.2 연간 결과 조회 · '+cond()+' · '+a.name:cond()+' · '+a.name+' / 태양·차양 움직임은 맑은 날 설명용 계산';
 text(cap,30,657,12,'#687480');
 metricSpecs.forEach(([key,dk,title,unit,du,higher],i)=>{
  const x=30+i*306,d=S.tag==='S1'?0:r[dk],good=(d>0)===higher,col=Math.abs(d)<1e-6?'#1e2a38':good?'#307b6b':'#bf512c';
  text(title,x,692,12,'#687480');text(signed(d,2)+du,x,725,25,col,'600');
  text(fmt(base[key],2)+' → '+fmt(r[key],2)+' '+unit,x,747,11,'#687480');
 });
 text('연간 수치는 저장된 시뮬레이션 결과 · 시각 조작으로 재계산하지 않음 · 실제 절감/적용 권장 아님',30,781,11,'#687480');
 if(S.tour){ctx.fillStyle='#e8541e';ctx.fillRect(0,797,W*Math.min(1,(performance.now()-S.tourStart)/60000),3);}
}
function stopTour(){S.tour=false;$('#tour').textContent='▶ 60초 과정 재생';if(S.recorder&&S.recorder.state==='recording')S.recorder.stop();}
function startTour(){
 S.play=false;$('#play').textContent='▶';S.minute=600;S.date='2023-07-21';S.face=90;S.tag='BT_T300';S.shade=true;
 $('#date').value=S.date;$('#face').value='90';$('#alternative').value=S.tag;$('#shade').checked=true;
 S.tour=true;S.tourStart=performance.now();$('#tour').textContent='■ 과정 재생 정지';readControls();stage(0);
}
function frame(now){
 const dt=Math.min(.1,(now-(S.last||now))/1000);S.last=now;S.phase+=dt;
 if(S.ready){
  if(S.tour){
   const elapsed=(now-S.tourStart)/1000;S.phase=elapsed;
   const st=elapsed<10?0:elapsed<20?1:elapsed<37?2:elapsed<49?3:4;if(st!==S.stage)stage(st);
   if(st===2){S.minute=360+(elapsed-20)/17*840;}
   if(st===3){const tag=elapsed<41?'F0':elapsed<45?'S3':'BT_T300';if(tag!==S.tag){S.tag=tag;$('#alternative').value=tag;renderResults();}}
   S.yaw=-.52+Math.sin(elapsed/60*Math.PI)*.45;
   if(elapsed>=60){stopTour();status('60초 과정 재생이 끝났습니다. 건물과 대안을 직접 바꿔 볼 수 있습니다.');}
  }else if(S.play){S.minute=(S.minute+dt*S.speed)%1440;}
  if(S.tour||S.play){updateSnapshot();}
  draw();
 }
 requestAnimationFrame(frame);
}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),10000);}
function csvCell(v){return '"'+String(v??'').replaceAll('"','""')+'"';}
async function init(){
 try{
  const files=['buildings.csv','results_257_cond.csv','alternatives.csv','meta.csv'];
  const rows=await Promise.all(files.map(async name=>{const r=await fetch('../data/db/csv/'+name);if(!r.ok)throw new Error(name+' HTTP '+r.status);return parseCSV(await r.text());}));
  S.buildings=rows[0].map(numeric);S.results=rows[1].map(numeric).filter(r=>['차폐 포함','차폐 제외'].includes(r.cond));S.alts=rows[2];
  if(S.buildings.length!==257||S.results.length!==5140)throw new Error('연구 자료 행 수가 예상 범위와 다릅니다.');
  S.results.forEach(r=>S.index.set(r.sim_name+'|'+r.cond+'|'+r.tag,r));
  const ordered=[...S.buildings].sort((a,b)=>{const prior={ARK:-3,GFC:-2,GST:-1};return(prior[a.sim_name]??0)-(prior[b.sim_name]??0)||(a.name||a.sim_name).localeCompare(b.name||b.sim_name,'ko');});
  $('#building').innerHTML=ordered.map(b=>'<option value="'+esc(b.sim_name)+'">'+esc(b.name||b.sim_name)+' · '+b.floors+'층</option>').join('');
  $('#building').value='ARK';
  $('#alternative').innerHTML=S.alts.map(a=>'<option value="'+a.tag+'">'+esc(a.name)+'</option>').join('');$('#alternative').value=S.tag;
  S.ready=true;$('#building').disabled=false;$('#alternative').disabled=false;
  for(const id of ['tour','play','png','csv'])$('#'+id).disabled=false;
  const canRecord=!!(c.captureStream&&window.MediaRecorder);
  $('#record').disabled=!canRecord;
  if(!canRecord)$('#record').textContent='영상 저장 미지원 브라우저';
  const built=rows[3].find(x=>Object.values(x)[0]==='built');
  $('#version').textContent='데이터 생성: '+(built?Object.values(built)[1]:'CSV 메타데이터 확인')+' / 화면 제작: 2026.11.01 / 257동 × 기준 포함 10조건 × 차폐 2조건';
  readControls();stage(2);status('257동 · 9개 대안 · 차폐 조건별 연간 결과 연결 완료');
  if(new URLSearchParams(location.search).get('autoplay')==='1'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)startTour();
 }catch(e){status('자료를 불러오지 못했습니다: '+e.message+' 새로고침하거나 연구 홈페이지에서 다시 열어 주세요.');$('#status').style.color='#b44825';console.error(e);}
}
['building','alternative','date','face','shade'].forEach(id=>$('#'+id).addEventListener('change',()=>{stopTour();readControls();}));
$('#hour').addEventListener('input',e=>{stopTour();S.play=false;$('#play').textContent='▶';S.minute=+e.target.value;updateSnapshot();});
$('#speed').addEventListener('change',e=>S.speed=+e.target.value);
$('#play').addEventListener('click',()=>{stopTour();S.play=!S.play;$('#play').textContent=S.play?'Ⅱ':'▶';$('#play').setAttribute('aria-label',S.play?'하루 움직임 일시정지':'하루 움직임 재생');});
$('#tour').addEventListener('click',()=>S.tour?stopTour():startTour());
$$('[data-date]').forEach(b=>b.addEventListener('click',()=>{stopTour();$('#date').value=b.dataset.date;readControls();}));
$$('[data-stage]').forEach(b=>b.addEventListener('click',()=>{stopTour();stage(+b.dataset.stage);}));
$('#rotateLeft').addEventListener('click',()=>S.yaw-=.22);$('#rotateRight').addEventListener('click',()=>S.yaw+=.22);
$('#full').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#lab').requestFullscreen();}catch{status('전체 화면을 열 수 없습니다. 브라우저 확대 기능을 이용해 주세요.');}});
let drag=null;c.addEventListener('pointerdown',e=>{drag=e.clientX;c.setPointerCapture(e.pointerId);});
c.addEventListener('pointermove',e=>{if(drag!==null){S.yaw+=(e.clientX-drag)*.008;drag=e.clientX;}});
c.addEventListener('pointerup',()=>drag=null);c.addEventListener('pointercancel',()=>drag=null);
$('#alternatives-chart').addEventListener('click',e=>{const b=e.target.closest('[data-alt]');if(b){stopTour();$('#alternative').value=b.dataset.alt;readControls();}});
$('#alternatives-chart').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const b=e.target.closest('[data-alt]');if(b){e.preventDefault();stopTour();$('#alternative').value=b.dataset.alt;readControls();}}});
$('#png').addEventListener('click',()=>{draw();c.toBlob(blob=>{if(blob)download(blob,'FacadeLab_'+S.id+'_'+S.tag+'.png');});});
$('#csv').addEventListener('click',()=>{
 const rows=S.results.filter(r=>r.sim_name===S.id&&r.cond===cond()),keys=['sim_name','cond','tag','EUI','peak_kW','UDI','PMV_ok','heat','cool','light','dEUI_pct','dpeak_pct','dUDI_pp','dPMV_pp'];
 const body=keys.join(',')+'\r\n'+rows.map(r=>keys.map(k=>csvCell(r[k])).join(',')).join('\r\n');
 download(new Blob(['\uFEFF'+body],{type:'text/csv;charset=utf-8'}),'FacadeLab_'+S.id+'_'+(S.shade?'shaded':'unshaded')+'_annual.csv');
});
$('#embed').addEventListener('click',()=>{
 const url=new URL('./',location.href);url.search='embed=1';
 $('#embed-code').value='<iframe src="'+url.href+'" title="외피 성능 개선 3D 시뮬레이션" width="100%" height="1400" style="border:0;border-radius:8px" allow="fullscreen" loading="lazy"></iframe>';
 $('#embed-dialog').showModal();
});
$('#close-dialog').addEventListener('click',()=>$('#embed-dialog').close());
$('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#embed-code').value);$('#copy').textContent='복사 완료';}catch{$('#embed-code').select();$('#copy').textContent='선택된 코드를 복사하세요';}});
$('#record').addEventListener('click',()=>{
 if(S.recorder&&S.recorder.state==='recording'){stopTour();return;}
 try{
  const types=['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1.42001E','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const mime=types.find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error('지원되는 영상 형식이 없습니다.');
  const stream=c.captureStream(30),chunks=[];
  const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});S.recorder=rec;
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(chunks.length)download(new Blob(chunks,{type:mime}),'FacadeLab_60s_'+S.id+(mime.includes('mp4')?'.mp4':'.webm'));$('#record').textContent='↓ 60초 무음 영상 저장';S.recorder=null;status('영상 저장이 준비되었습니다. 브라우저의 다운로드를 확인하세요.');};
  rec.onerror=e=>{status('영상 저장 중 오류가 발생했습니다. PNG 저장이나 과정 재생을 이용해 주세요.');stopTour();};
  startTour();rec.start(1000);$('#record').textContent='■ 녹화 종료 · 저장';status('60초 무음 영상 녹화 중입니다. 끝나면 자동 저장됩니다. 탭을 열어 두세요.');
 }catch(e){status('영상 저장을 시작하지 못했습니다: '+e.message);}
});
if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('embedded');
document.addEventListener('visibilitychange',()=>{if(document.hidden&&S.play){S.play=false;$('#play').textContent='▶';}});
stage(2);requestAnimationFrame(frame);init();

