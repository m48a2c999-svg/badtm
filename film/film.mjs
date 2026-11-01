import {parseCSV,numeric,regionAround} from '../lab/data-engine.mjs';
import {clamp,mix,smooth,ramp,add,sub,mul,camera,rayHit,slatCorners,chapterAt} from './geometry.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#film'),ctx=canvas.getContext('2d',{alpha:false}),W=1920,H=1080,DURATION=60;
const C={white:'#e4e8e6',grey:'#78868e',gold:'#e7b881',cyan:'#9ed4d0'};
const S={t:0,playing:false,last:0,ready:false,chapter:-1,rec:null,recordURL:null,buildings:[],region:[],points:[],results:null};
const titles=[
 ['DATA / 01','도시의 정보가 하나의 형상이 됩니다.','위치·윤곽·높이를 모아 계산의 출발점을 만듭니다. 입자는 데이터가 모이는 과정을 표현합니다.'],
 ['ENVELOPE / 02','형상에서, 빛을 다루는 외피로.','도시의 규모에서 외피의 디테일로 이동합니다. 확대된 차양은 작동 원리를 설명하는 별도 모형입니다.'],
 ['LIGHT / 03','먼저, 입면에 닿는 빛을 읽습니다.','수평 루버 일사량 기준 제어의 작동 조건은 5~9월, 입면 일사량 300 W/m² 초과입니다.'],
 ['MOTION / 04','회전축을 중심으로 같은 각도를 바꿉니다.','모든 날개가 함께 회전하며 직달광의 경로를 바꿉니다. 회전각과 속도는 설명을 위한 연출입니다.'],
 ['SPACE / 05','통과한 빛이 실내 공간을 바꿉니다.','차양을 통과하거나 차단되는 경로를 비교합니다. 이 장면의 광선과 밝기는 실제 조도·열량 계산값이 아닙니다.'],
 ['PERFORMANCE / 06','움직임의 가치는 결과로 판단합니다.','아크플레이스·차폐 포함·수평 루버 일사량 기준 제어의 저장된 연간 결과입니다. 에너지·피크·채광·열쾌적을 함께 읽습니다.']
];
const rand=i=>{const x=Math.sin(i*127.1+311.7)*43758.5453123;return x-Math.floor(x);};
const fmt=(v,d=2)=>Number(v).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=(v,d=2)=>(v>0?'+':'')+fmt(v,d);
const mono='"SFMono-Regular",Consolas,monospace',sans='-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif';
function text(s,x,y,size=22,color=C.white,weight=400,align='left',font=sans){ctx.font=weight+' '+size+'px '+font;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(s,x,y);}
function line2(a,b,color,width=1,alpha=1){if(alpha<=0)return;ctx.globalAlpha=clamp(alpha);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();ctx.globalAlpha=1;}
function path2(points,fill,stroke=null,width=1,alpha=1){ctx.globalAlpha=clamp(alpha);ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}ctx.globalAlpha=1;}
function line3(P,a,b,color=C.white,width=1,alpha=1){const p=P(a),q=P(b);if(p[2]>2&&q[2]>2)line2(p,q,color,width,alpha);}
function poly3(P,points,fill,stroke,width=1,alpha=1){const p=points.map(P);if(p.every(v=>v[2]>2))path2(p,fill,stroke,width,alpha);}
function glow(x,y,r,color,alpha=.3){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.globalAlpha=alpha;ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.globalAlpha=1;}
function point(P,p,r=1.5,color=C.white,alpha=.8){const s=P(p);if(s[2]<2||s[0]<-20||s[0]>W+20||s[1]<-20||s[1]>H+20)return;ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(s[0],s[1],r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
function base(t){
 ctx.fillStyle='#030507';ctx.fillRect(0,0,W,H);
 const g=ctx.createRadialGradient(W*.56,H*.48,20,W*.52,H*.48,W*.65);g.addColorStop(0,'#101b22');g.addColorStop(.6,'#070d11');g.addColorStop(1,'#020304');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 // Low-contrast spatial dust. Its density carries no quantitative meaning.
 for(let i=0;i<210;i++){const x=(rand(i+10)*W+t*(rand(i+200)-.5)*2+W)%W,y=rand(i+400)*H;ctx.fillStyle=`rgba(184,201,210,${.04+rand(i+700)*.2})`;ctx.fillRect(x,y,rand(i+80)>.96?2:1,rand(i+80)>.96?2:1);}
}
function frameLabels(t){
 text('F /',64,66,25,C.gold,500,'left',mono);text('FACADE RETROFIT LAB',126,64,15,'#c0caca',400,'left',mono);
 text('LIGHT → ENVELOPE → PERFORMANCE',W-64,64,13,'#65767e',400,'right',mono);
 text('CONCEPT VISUALIZATION · 움직임·광선은 설명용',64,H-36,15,'#75848d');text('ARK / SEOUL',W-64,H-36,14,'#88979e',400,'right',mono);
 const st=chapterAt(t);text(String(st+1).padStart(2,'0')+' / 06',W-64,118,17,C.gold,400,'right',mono);
}
function caption(k,title,subline,opacity=1){
 ctx.globalAlpha=opacity;text(k,64,867,15,C.gold,400,'left',mono);text(title,64,928,45,C.white,500);text(subline,66,975,20,'#95a3ac');ctx.globalAlpha=1;
}
function city(t,alpha=1,zoom=0){
 ctx.save();ctx.globalAlpha=alpha;
 const yaw=.66+t*.025,dist=mix(820,390,zoom),P=camera([Math.sin(yaw)*dist,dist*.47,Math.cos(yaw)*dist],[0,35,0],[1040,500],1450);
 const collect=ramp(t,1.5,7.4),build=ramp(t,4.5,9);
 // Sparse city edges resolve as the point cloud settles onto the real footprints.
 S.region.forEach(b=>{const target=b.sim_name==='ARK',ring=b.ring,h=b.height_m*build;
  for(let i=0;i<ring.length;i++){const a=ring[i],v=ring[(i+1)%ring.length];const aa=[a[0],h,a[1]],bb=[v[0],h,v[1]];
   line3(P,aa,bb,target?C.gold:'#6a8793',target?1.8:.6,alpha*build*(target?.9:.25));
   if(i%2===0||target)line3(P,[a[0],0,a[1]],aa,target?'#aeb5ae':'#4b6874',target?1.2:.6,alpha*build*(target?.6:.19));
  }
  if(target&&build>.1){for(let j=1;j<b.floors;j++)for(let i=0;i<ring.length;i++){const a=ring[i],v=ring[(i+1)%ring.length];line3(P,[a[0],h*j/b.floors,a[1]],[v[0],h*j/b.floors,v[1]],'#879b9a',.6,alpha*.42);}}
 });
 for(let i=0;i<S.points.length;i++){
  const p=S.points[i],a=i*.618+t*.13,rad=150+rand(i+31)*390,phase=(1-collect);
  const source=[Math.cos(a)*rad,80+Math.sin(a*.7+t*.15)*220,Math.sin(a)*rad];
  const v=p.map((x,j)=>mix(source[j],x,collect));const tail=v.map((x,j)=>x+(source[j]-x)*.035*phase);
  line3(P,tail,v,i%17===0?C.gold:'#bfccd3',.95,alpha*(.22+.5*phase));point(P,v,(i%29===0?2.5:1.3)*(.8+.4*phase),i%17===0?C.gold:C.white,alpha*(.5+.45*rand(i)));
 }
 const roof=P([0,S.ark.height_m+10,0]);
 if(t>7){text('ARK',roof[0]+15,roof[1]-16,18,C.gold,400,'left',mono);}
 ctx.restore();
}
function panel(P,angle,{alpha=1,edges=true}={}){
 // Each blade is a rigid plane, with one shared rotation angle and a fixed axis.
 for(const x of [-50,50]){line3(P,[x,-48,0],[x,48,0],'#596c76',3,alpha);line3(P,[x,-48,-4],[x,48,-4],'#253f4b',4,alpha);}
 line3(P,[-50,-48,0],[50,-48,0],'#789199',1,alpha);line3(P,[-50,48,0],[50,48,0],'#789199',1,alpha);
 const blades=Array.from({length:15},(_,i)=>({i,points:slatCorners((i-7)*6,angle)}));blades.sort((a,b)=>P(a.points[0])[2]-P(b.points[0])[2]).reverse();
 for(const b of blades){const corners=b.points,luminance=Math.round(31+Math.sin(angle)*22);const fill=`rgb(${luminance-5},${luminance+7},${luminance+13})`;
  const under=corners.map(p=>[p[0],p[1]-.48,p[2]]);poly3(P,under,'#0c161c',null,1,alpha);
  poly3(P,corners,fill,'#7f939b',.7,alpha);
  line3(P,corners[2],corners[3],C.gold,1.8,alpha*.85);line3(P,corners[0],corners[1],'#c6d4d5',1,alpha*.62);
  for(const x of [-49,49])point(P,[x,(b.i-7)*6,0],1.8,C.gold,alpha*.8);
  if(edges&&b.i===7)line3(P,[-55,0,0],[55,0,0],'#c5a476',.8,alpha*.6);
 }
}
function beamGeometry(angle){
 const beams=[];
 for(let i=0;i<81;i++){
  const x=-43+(i%9)*10.2,y=-40+Math.floor(i/9)*10.1;
  const target=[x,y,0],direction=[-.06,-.30,-1],origin=sub(target,mul(direction,155));
  const hit=rayHit(origin,direction,angle),end=hit?hit.point:add(origin,mul(direction,235));
  beams.push({origin,direction,end,hit});
 }return beams;
}
function beams(P,angle,t,{alpha=1,detail=false}={}){
 for(const [i,b] of beamGeometry(angle).entries()){
  line3(P,b.origin,b.end,C.gold,detail?1:.75,alpha*(i%9===4?.28:.12));
  const speed=(t*.32+rand(i+120))%1,trail=.07;
  const endT=b.hit?b.hit.distance:235;
  const a=add(b.origin,mul(b.direction,Math.max(0,speed-trail)*endT)),p=add(b.origin,mul(b.direction,speed*endT));
  line3(P,a,p,b.hit?C.gold:'#d1e1dc',1.8,alpha*.82);point(P,p,1.9,b.hit?C.gold:C.white,alpha*.95);
  if(b.hit){
   point(P,b.hit.point,1.65,C.gold,alpha*.85);
   if(i%3===0){const refl=add(b.hit.point,mul(b.hit.reflected,19));line3(P,b.hit.point,refl,'#d4a476',.8,alpha*.18);}
  }else{
   const front=add(b.origin,mul(b.direction,155));line3(P,front,b.end,C.cyan,1,alpha*.35);
  }
 }
}
function orbitLines(P,t,alpha=1){
 for(let k=0;k<3;k++){
  let prev=null;
  for(let i=0;i<=90;i++){const a=i/90*Math.PI*1.7+t*.1+k*.9,p=[Math.cos(a)*(90+k*10),Math.sin(a)*(47+k*4),Math.sin(a*.75+k)*(50+k*10)];if(prev)line3(P,prev,p,k===0?C.gold:'#b4c5cc',.75,alpha*.14);prev=p;}
 }
}
function facade(t){
 const p=ramp(t,10,15);
 if(t<15)city(9+(t-10)*.5,1-p,p*.7);
 const orbit=(t-10)*.025;
 const angle=t<30?.12:mix(.12,1.08,ramp(t,30.5,36.5));
 const eye=t<20?[mix(210,138,p),mix(95,70,p),mix(260,205,p)]:[138+Math.sin(orbit)*20,70+Math.cos(orbit)*6,205];
 const P=camera(eye,[0,0,0],[1060,465],1390);
 if(t<20){orbitLines(P,t,p*(1-ramp(t,17,20)));panel(P,.12,{alpha:p});
  // Gather particles along blade edges before resolving into a solid surface.
  for(let i=0;i<400;i++){const blade=i%15,x=-48+rand(i+80)*96,a=i*.2+t*.3,collect=ramp(t,10,16),target=[x,(blade-7)*6,0];const source=[Math.cos(a)*140,Math.sin(a*.6)*85,Math.sin(a)*120];point(P,target.map((v,j)=>mix(source[j],v,collect)),1.4,i%7?C.white:C.gold,p*(1-ramp(t,16,19))*.8);}
  const mark=P([55,0,0]);text('ROTATION AXIS',mark[0]+25,mark[1]+5,15,'#b9c7c8',400,'left',mono);line2(mark,[mark[0]+18,mark[1]],C.gold,1,.8);
 }else{
  const lightAlpha=ramp(t,20,23);beams(P,angle,t,{alpha:lightAlpha});panel(P,angle);
  if(t<30){const sensor=P([50,0,6]);glow(sensor[0],sensor[1],28,C.gold,.35);text('INCIDENT LIGHT',80,250,16,C.gold,400,'left',mono);text('300',76,335,76,C.white,300,'left',mono);text('W/m²',258,333,24,'#9dacb4',400,'left',mono);text('5—9월 · 일사량 초과 시 작동',80,378,20,'#a5b2b7');text('연구의 제어 조건 / 현재 일사 계측값 아님',80,414,15,'#617680');
  }else{
   const pt=P([53,0,0]),rad=64;ctx.strokeStyle=C.gold;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(pt[0],pt[1],rad*.5,rad,.1,-Math.PI/2,-Math.PI/2+angle*1.5);ctx.stroke();
   text('ONE AXIS. ONE RESPONSE.',80,244,16,C.gold,400,'left',mono);text('함께 회전하고',80,305,37,C.white,500);text('빛의 경로를 바꿉니다.',80,355,30,'#b2c0c6');text('동일 제어각 · 고정 회전축',80,405,18,'#788f9c');
  }
 }
 const labels=t<20?['02 / ENVELOPE','형상에서, 움직이는 외피로.','도시의 규모에서 차양의 회전축과 깊이로 이동합니다.']:t<30?['03 / SENSING','빛을 읽습니다.','일사량과 작동 계절이 차양을 움직이는 조건이 됩니다.']:['04 / RESPONSE','각도가 바뀌면, 빛의 길도 달라집니다.','수평 루버의 작동 원리 · 회전각·속도는 설명용 연출'];
 caption(...labels);
}
function room(P,angle,t,opacity=1){
 const floor=[[-55,-48,3],[55,-48,3],[55,-48,-110],[-55,-48,-110]];
 poly3(P,floor,'#0d1b23','#35505b',.8,opacity);poly3(P,[[-55,-48,-110],[55,-48,-110],[55,49,-110],[-55,49,-110]],'#0a1318','#243b47',.6,opacity);
 for(let z=-10;z>=-110;z-=20)line3(P,[-55,-48,z],[55,-48,z],'#28414c',.6,opacity*.6);
 for(let x=-50;x<=50;x+=20)line3(P,[x,-48,0],[x,-48,-110],'#28414c',.6,opacity*.6);
 for(const b of beamGeometry(angle)){
  if(b.hit)continue;
  const distance=(-48-b.origin[1])/b.direction[1],pt=add(b.origin,mul(b.direction,distance));
  if(pt[2]<-110||pt[2]>0||Math.abs(pt[0])>52)continue;
  const patch=[[pt[0]-3,-47.8,pt[2]-4],[pt[0]+3,-47.8,pt[2]-4],[pt[0]+3,-47.8,pt[2]+4],[pt[0]-3,-47.8,pt[2]+4]];
  poly3(P,patch,'#9ac7c34d',null,1,opacity);
 }
 beams(P,angle,t,{alpha:opacity*.5});panel(P,angle,{alpha:opacity,edges:false});
}
function space(t){
 const P1=camera([174,112,213],[0,-2,-29],[495,475],1080),P2=camera([174,112,213],[0,-2,-29],[1420,475],1080);
 const a=ramp(t,40,41.5);
 ctx.save();ctx.beginPath();ctx.rect(0,150,930,665);ctx.clip();room(P1,.12,t,a);ctx.restore();
 ctx.save();ctx.beginPath();ctx.rect(990,150,930,665);ctx.clip();room(P2,1.08,t,a);ctx.restore();
 line2([960,160],[960,767],'#283b45',1,.8);
 text('OPEN / 수평 대기',462,164,21,'#a8b9c0',400,'center',mono);text('RESPONSE / 각도 조절',1390,164,21,C.gold,400,'center',mono);
 text('직달광의 통과 경로',462,785,20,'#96b6bb',400,'center');text('차양에서 차단·반사되는 경로',1390,785,20,C.gold,400,'center');
 caption('05 / SPACE','빛의 변화가 공간에 닿습니다.','광선 경로 개념 비교 · 실제 조도분포·냉방부하를 나타낸 화면은 아닙니다.');
}
function performance(t){
 const p=ramp(t,50,52),r=S.results,base=S.baseline;
 for(let k=0;k<4;k++){
  const y=390+k*85;
  for(let i=0;i<150;i++){const x=240+i*10,offset=(1-p)*Math.sin(i*.04-t*.2+k)*80;ctx.globalAlpha=.15+rand(i+k*45)*.25;ctx.fillStyle=k%2?C.gold:C.cyan;ctx.fillRect(x,y+offset,1.3,1.3);}
 }
 ctx.globalAlpha=1;
 text('SAVED ENERGYPLUS RESULTS',64,187,16,C.gold,400,'left',mono);text('움직였다는 사실보다,',64,256,45,C.white,500);text('무엇이 달라졌는가.',64,319,45,C.white,500);
 text('아크플레이스 · 차폐 포함 · 수평 루버 일사량 기준 제어(LT_T300)',66,368,20,'#91a3ad');
 const specs=[['EUI','dEUI_pct','에너지원단위','%','kWh/m²·yr'],['peak_kW','dpeak_pct','피크전력','%','kW'],['UDI','dUDI_pp','유용조도 UDI','%p','%'],['PMV_ok','dPMV_pp','열쾌적 허용시간','%p','%']];
 specs.forEach(([key,delta,label,unit,valueUnit],i)=>{
  const x=64+i*462,reveal=ramp(t,51+i*.7,52.3+i*.7);ctx.save();ctx.globalAlpha=reveal;ctx.fillStyle='#071017ed';ctx.fillRect(x-10,445,432,225);line2([x,447],[x+405,447],'#4d6874',1,reveal);ctx.globalAlpha=reveal;
  text(label,x,489,21,'#9bafb9');text(signed(r[delta]),x,571,64,i<2?(r[delta]<0?C.cyan:C.gold):(r[delta]>0?C.cyan:C.gold),300,'left',mono);text(unit,x+315,569,24,'#849ca8',400,'left',mono);
  text(fmt(base[key])+' → '+fmt(r[key]),x,619,20,'#cfdbdf',400,'left',mono);text(valueUnit,x,652,16,'#718996',400,'left',mono);ctx.restore();
 });
 caption('06 / PERFORMANCE','에너지와 공간의 질을 함께 읽습니다.','저장된 연간 시뮬레이션 결과 · 실측값 아님 · 효과 크기와 한계는 추가 검증');
 if(t>57){text('EXPLORE THE DATA  ↗',W-66,750,16,C.gold,400,'right',mono);}
}
function draw(){
 if(!S.ready){base(0);text('LOADING RESEARCH DATA',W/2,H/2,20,C.grey,400,'center',mono);return;}
 const t=S.t;base(t);
 if(t<10){city(t);caption('01 / DATA','도시의 정보가 외피가 되기까지.','257동의 위치·윤곽·높이 → 모델의 형상과 입력 조건');
  if(t<5){const opacity=1-ramp(t,2.5,5);ctx.globalAlpha=opacity;text('LIGHT IN',80,256,55,C.white,300,'left',mono);text('MOTION',80,325,55,C.white,300,'left',mono);ctx.globalAlpha=1;}
 }else if(t<40)facade(t);else if(t<50)space(t);else performance(t);
 // Brief dissolves connect changes of scale, while the objects keep smooth motion within shots.
 for(const cut of [20,40,50]){const opacity=1-Math.min(1,Math.abs(t-cut)/.45);if(opacity>0){ctx.fillStyle=`rgba(3,5,7,${opacity*.82})`;ctx.fillRect(0,0,W,H);}}
 frameLabels(t);
}
function update(){
 $('#seek').value=S.t;$('#clock').textContent='00:'+String(Math.floor(Math.min(59,S.t))).padStart(2,'0')+' / 01:00';if(S.t>=60)$('#clock').textContent='01:00 / 01:00';
 const i=chapterAt(S.t);if(i!==S.chapter){S.chapter=i;$('#chapter-kicker').textContent=titles[i][0];$('#chapter-title').textContent=titles[i][1];$('#chapter-copy').textContent=titles[i][2];$$('[data-time]').forEach((el,k)=>el.setAttribute('aria-current',k===i?'true':'false'));}
 $('#play').textContent=S.playing?'Ⅱ':'▶';$('#play').setAttribute('aria-label',S.playing?'영상 일시정지':'영상 재생');
}
function stopRecording(){if(S.rec?.state==='recording')S.rec.stop();}
function play(fromStart=false){if(!S.ready)return;if(fromStart||S.t>=60)S.t=0;S.playing=true;S.last=0;$('#start').hidden=true;update();}
function pause(){S.playing=false;S.last=0;stopRecording();update();draw();}
function seek(t){pause();S.t=clamp(t,0,60);$('#start').hidden=true;update();draw();}
function loop(ts){
 if(S.playing&&S.ready){if(S.last)S.t=Math.min(60,S.t+(ts-S.last)/1000);S.last=ts;update();draw();if(S.t>=60){pause();}}
 requestAnimationFrame(loop);
}
async function init(){
 try{
  const [bb,rr]=await Promise.all(['buildings.csv','results_257_cond.csv'].map(async name=>{const r=await fetch('../data/db/csv/'+name);if(!r.ok)throw Error(name+' '+r.status);return parseCSV(await r.text()).map(numeric);}));
  S.buildings=bb;S.ark=bb.find(b=>b.sim_name==='ARK');S.region=regionAround(bb,'ARK').filter(b=>Math.hypot(b.x,b.y)<340);
  S.results=rr.find(r=>r.sim_name==='ARK'&&r.cond==='차폐 포함'&&r.tag==='LT_T300');S.baseline=rr.find(r=>r.sim_name==='ARK'&&r.cond==='차폐 포함'&&r.tag==='S1');
  if(bb.length!==257||!S.results||!S.baseline)throw Error('연구 자료를 확인할 수 없습니다.');
  for(let i=0;i<2100;i++){const b=S.region[i%S.region.length],ring=b.ring,j=Math.floor(rand(i+22)*ring.length),a=ring[j],q=ring[(j+1)%ring.length],f=rand(i+66),h=i%3===0?b.height_m:rand(i+99)*b.height_m;S.points.push([mix(a[0],q[0],f),h,mix(a[1],q[1],f)]);}
  S.ready=true;$('#data-status').textContent='연구 자료 연결 완료 · 257동 / ARK / 차폐 포함 / LT_T300';
  for(const id of ['start','play','poster'])$('#'+id).disabled=false;
  $('#record').disabled=!(canvas.captureStream&&window.MediaRecorder);if($('#record').disabled)$('#record').textContent='이 브라우저는 영상 저장 미지원';
  // The cover uses the same scene as the film, at its most legible formation state.
  S.t=17;draw();S.t=0;update();
  if(new URLSearchParams(location.search).get('autoplay')==='1'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)play(true);
 }catch(e){$('#data-status').textContent='자료를 불러오지 못했습니다. 새로고침해 주세요. '+e.message;console.error(e);}
}
$('#start').addEventListener('click',()=>play(true));$('#play').addEventListener('click',()=>S.playing?pause():play());$('#restart').addEventListener('click',()=>{stopRecording();play(true);});
$('#seek').addEventListener('input',e=>seek(Number(e.target.value)));$$('[data-time]').forEach(el=>el.addEventListener('click',()=>seek(Number(el.dataset.time)+.6)));
$('#full').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#player').requestFullscreen();}catch{$('#data-status').textContent='전체 화면을 열 수 없습니다. 브라우저 확대 기능을 이용해 주세요.';}});
canvas.tabIndex=0;canvas.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();S.playing?pause():play();}if(e.code==='ArrowRight'){e.preventDefault();seek(S.t+5);}if(e.code==='ArrowLeft'){e.preventDefault();seek(S.t-5);}});
$('#poster').addEventListener('click',()=>canvas.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='Facade_Concept_'+String(Math.floor(S.t)).padStart(2,'0')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),15000);}));
$('#record').addEventListener('click',()=>{
 if(S.rec?.state==='recording'){pause();return;}
 try{
  const mime=['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1.42001E','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('지원되는 영상 형식이 없습니다.');
  const stream=canvas.captureStream(30),chunks=[],rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});S.rec=rec;
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());S.rec=null;$('#record').textContent='60초 영상 만들기';if(!chunks.length){$('#data-status').textContent='영상이 생성되지 않았습니다. 다시 시도해 주세요.';return;}if(S.recordURL)URL.revokeObjectURL(S.recordURL);S.recordURL=URL.createObjectURL(new Blob(chunks,{type:mime}));const link=$('#video-download');link.href=S.recordURL;link.download='Facade_Concept_Film'+(mime.includes('mp4')?'.mp4':'.webm');link.hidden=false;$('#video-preview').src=S.recordURL;$('#video-preview').hidden=false;$('#data-status').textContent='녹화가 완료되었습니다. 미리보기를 확인한 뒤 완성 영상 다운로드를 눌러 저장하세요.';};
  rec.onerror=()=>{pause();$('#data-status').textContent='녹화 오류가 발생했습니다. 현재 장면 저장이나 웹 재생을 이용해 주세요.';};
  play(true);rec.start(1000);$('#record').textContent='녹화 종료 · 미리보기';$('#data-status').textContent='60초 영상을 녹화하고 있습니다. 이 탭을 열어 두세요.';
 }catch(e){$('#data-status').textContent='영상 저장을 시작하지 못했습니다: '+e.message;}
});
$('#embed').addEventListener('click',()=>{const url=new URL('./',location.href);url.search='embed=1';$('#embed-code').value='<div style="position:relative;padding-top:calc(56.25% + 128px)"><iframe src="'+url.href+'" title="빛에 응답하는 외피 개념 영상" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="fullscreen" loading="lazy"></iframe></div>';$('#embed-dialog').showModal();});
$('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#embed-code').value);$('#copy').textContent='복사 완료';}catch{$('#embed-code').select();$('#copy').textContent='선택한 코드를 복사하세요';}});$('#close-dialog').addEventListener('click',()=>$('#embed-dialog').close());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&S.playing){pause();$('#data-status').textContent='화면을 벗어나 재생을 멈췄습니다. 재생 버튼으로 이어 볼 수 있습니다.';}});
window.addEventListener('pagehide',()=>{stopRecording();if(S.recordURL)URL.revokeObjectURL(S.recordURL);});
if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('embedded');
draw();init();requestAnimationFrame(loop);
