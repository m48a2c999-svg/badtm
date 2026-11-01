import {regionAround} from '../lab/data-engine.mjs';
import {clamp,mix,smooth,ramp,add,sub,mul,camera,rayHit,slatCorners,chapterAt} from './geometry.mjs';
import {loadPaperData,CHAPTERS,chapterIndex} from './paper-data.mjs';
import {createPaperRenderer} from './paper-scenes.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const canvas=$('#film'),ctx=canvas.getContext('2d',{alpha:false}),W=1920,H=1080,DURATION=180;
const C={white:'#e4e8e6',grey:'#78868e',gold:'#e7b881',cyan:'#9ed4d0'};
const S={t:0,playing:false,last:0,ready:false,chapter:-1,rec:null,recordURL:null,buildings:[],region:[],points:[],results:null};
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
const paperRenderer=createPaperRenderer({ctx,text,line2,base,city,panel,beams,caption},S);
const clock=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
$('#chapters').innerHTML=CHAPTERS.map((c,i)=>'<button data-time="'+c.start+'"><span>'+String(i+1).padStart(2,'0')+' / '+clock(c.start)+'</span>'+c.label+'</button>').join('');
$('#transcript').innerHTML=CHAPTERS.map((c,i)=>'<article><h3>'+String(i+1).padStart(2,'0')+' · '+c.title+'</h3><p>'+c.copy+'</p><small>'+c.source+'</small></article>').join('');
function draw(){if(!S.ready){base(0);text('LOADING RESEARCH DATA',W/2,H/2,20,C.grey,400,'center',mono);return;}paperRenderer();}
function update(){
 $('#seek').value=S.t;$('#clock').textContent=clock(S.t)+' / '+clock(DURATION);
 const i=chapterIndex(S.t);if(i!==S.chapter){S.chapter=i;const c=CHAPTERS[i];$('#chapter-kicker').textContent=String(i+1).padStart(2,'0')+' / '+c.key;$('#chapter-title').textContent=c.title;$('#chapter-copy').textContent=c.copy;$('#chapter-source').textContent=c.source;$$('[data-time]').forEach((el,k)=>el.setAttribute('aria-current',k===i?'true':'false'));}
 $('#play').textContent=S.playing?'Ⅱ':'▶';$('#play').setAttribute('aria-label',S.playing?'영상 일시정지':'영상 재생');
}
function stopRecording(){if(S.rec?.state==='recording')S.rec.stop();}
function play(fromStart=false){if(!S.ready)return;if(fromStart||S.t>=DURATION)S.t=0;S.playing=true;S.last=0;$('#start').hidden=true;update();}
function pause(){S.playing=false;S.last=0;stopRecording();update();draw();}
function seek(t){pause();S.t=clamp(t,0,DURATION);$('#start').hidden=true;update();draw();}
function loop(ts){
 if(S.playing&&S.ready){if(S.last)S.t=Math.min(DURATION,S.t+(ts-S.last)/1000);S.last=ts;update();draw();if(S.t>=DURATION){pause();}}
 requestAnimationFrame(loop);
}
async function init(){
 try{
  const data=await loadPaperData();S.paper=data;const bb=data.buildings;
  S.buildings=bb;S.ark=bb.find(b=>b.sim_name==='ARK');S.region=regionAround(bb,'ARK').filter(b=>Math.hypot(b.x,b.y)<340);
  for(let i=0;i<2100;i++){const b=S.region[i%S.region.length],ring=b.ring,j=Math.floor(rand(i+22)*ring.length),a=ring[j],q=ring[(j+1)%ring.length],f=rand(i+66),h=i%3===0?b.height_m:rand(i+99)*b.height_m;S.points.push([mix(a[0],q[0],f),h,mix(a[1],q[1],f)]);}
  S.ready=true;$('#data-status').textContent='논문 데이터 연결 완료 · 257동 · 9개 대안 · 차폐 포함·제외 · 검증 자료';
  for(const id of ['start','play','poster'])$('#'+id).disabled=false;
  $('#record').disabled=!(canvas.captureStream&&window.MediaRecorder);if($('#record').disabled)$('#record').textContent='이 브라우저는 영상 저장 미지원';
  // The cover uses the same scene as the film, at its most legible formation state.
  S.t=0;draw();update();
  if(new URLSearchParams(location.search).get('autoplay')==='1'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)play(true);
 }catch(e){$('#data-status').textContent='자료를 불러오지 못했습니다. 새로고침해 주세요. '+e.message;console.error(e);}
}
$('#start').addEventListener('click',()=>play(true));$('#play').addEventListener('click',()=>S.playing?pause():play());$('#restart').addEventListener('click',()=>{stopRecording();play(true);});
$('#seek').addEventListener('input',e=>seek(Number(e.target.value)));$$('[data-time]').forEach(el=>el.addEventListener('click',()=>seek(Number(el.dataset.time)+.6)));
$('#full').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#player').requestFullscreen();}catch{$('#data-status').textContent='전체 화면을 열 수 없습니다. 브라우저 확대 기능을 이용해 주세요.';}});
canvas.tabIndex=0;canvas.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();S.playing?pause():play();}if(e.code==='ArrowRight'){e.preventDefault();seek(S.t+5);}if(e.code==='ArrowLeft'){e.preventDefault();seek(S.t-5);}});
$('#poster').addEventListener('click',()=>canvas.toBlob(blob=>{if(!blob)return;const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='Facade_Thesis_'+String(Math.floor(S.t)).padStart(2,'0')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),15000);}));
$('#record').addEventListener('click',()=>{
 if(S.rec?.state==='recording'){pause();return;}
 try{
  const mime=['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1.42001E','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw Error('지원되는 영상 형식이 없습니다.');
  const stream=canvas.captureStream(30),chunks=[],rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});S.rec=rec;
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());S.rec=null;$('#record').textContent='3분 논문 영상 만들기';if(!chunks.length){$('#data-status').textContent='영상이 생성되지 않았습니다. 다시 시도해 주세요.';return;}if(S.recordURL)URL.revokeObjectURL(S.recordURL);S.recordURL=URL.createObjectURL(new Blob(chunks,{type:mime}));const link=$('#video-download');link.href=S.recordURL;link.download='Facade_Thesis_Film'+(mime.includes('mp4')?'.mp4':'.webm');link.hidden=false;$('#video-preview').src=S.recordURL;$('#video-preview').hidden=false;$('#data-status').textContent='녹화가 완료되었습니다. 미리보기를 확인한 뒤 완성 영상 다운로드를 눌러 저장하세요.';};
  rec.onerror=()=>{pause();$('#data-status').textContent='녹화 오류가 발생했습니다. 현재 장면 저장이나 웹 재생을 이용해 주세요.';};
  play(true);rec.start(1000);$('#record').textContent='녹화 종료 · 미리보기';$('#data-status').textContent='3분 논문 영상을 녹화하고 있습니다. 이 탭을 열어 두세요.';
 }catch(e){$('#data-status').textContent='영상 저장을 시작하지 못했습니다: '+e.message;}
});
$('#embed').addEventListener('click',()=>{const url=new URL('./',location.href);url.search='embed=1';$('#embed-code').value='<div style="position:relative;padding-top:calc(56.25% + 200px)"><iframe src="'+url.href+'" title="외피 성능 개선 연구 3분 논문 영상" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="fullscreen" loading="lazy"></iframe></div>';$('#embed-dialog').showModal();});
$('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#embed-code').value);$('#copy').textContent='복사 완료';}catch{$('#embed-code').select();$('#copy').textContent='선택한 코드를 복사하세요';}});$('#close-dialog').addEventListener('click',()=>$('#embed-dialog').close());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&S.playing){pause();$('#data-status').textContent='화면을 벗어나 재생을 멈췄습니다. 재생 버튼으로 이어 볼 수 있습니다.';}});
window.addEventListener('pagehide',()=>{stopRecording();if(S.recordURL)URL.revokeObjectURL(S.recordURL);});
if(new URLSearchParams(location.search).get('embed')==='1')document.body.classList.add('embedded');
draw();init();requestAnimationFrame(loop);
