import {camera,slatCorners,rayHit,add,sub,mul,clamp,mix} from '../film/geometry.mjs';
import {loadPaperData} from '../film/paper-data.mjs';
const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./experience.css?v=20261101paper1',import.meta.url);document.head.append(style);
const reduce=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(pointer: fine)');
const isEmbedded=new URLSearchParams(location.search).get('embed')==='1';
// Decorative pointer layer: transparent to clicks and absent on touch/reduced-motion by default.
const trail=document.createElement('canvas');trail.id='light-trail';trail.setAttribute('aria-hidden','true');const cursor=document.createElement('div');cursor.id='light-cursor';cursor.setAttribute('aria-hidden','true');
const toggle=document.createElement('button');toggle.id='light-toggle';toggle.type='button';
document.body.append(trail,cursor);if(!isEmbedded)document.body.append(toggle);
let enabled=!reduce.matches&&fine.matches;try{const pref=localStorage.getItem('facade-light-effects');if(pref!==null)enabled=pref==='on'&&fine.matches&&!reduce.matches;}catch{}
const g=trail.getContext('2d'),drops=[];let running=0,last=0,lastSpawn=0,px=-100,py=-100,visible=false,latestEvent=0;
function resize(){const d=Math.min(devicePixelRatio||1,2);trail.width=innerWidth*d;trail.height=innerHeight*d;g.setTransform(d,0,0,d,0,0);}
function setEffects(on,persist=false){enabled=on&&fine.matches&&!reduce.matches;document.documentElement.dataset.lightPointer=enabled?'on':'off';toggle.textContent=enabled?'✦ 빛 효과 켜짐':'✧ 빛 효과 꺼짐';toggle.setAttribute('aria-pressed',String(enabled));toggle.setAttribute('aria-label',enabled?'마우스 빛 효과 끄기':'마우스 빛 효과 켜기');cursor.style.opacity=enabled&&visible?'1':'0';if(!enabled){drops.length=0;cancelAnimationFrame(running);running=0;g.clearRect(0,0,innerWidth,innerHeight);}if(persist)try{localStorage.setItem('facade-light-effects',enabled?'on':'off');}catch{}}
function flow(now){
 const dt=Math.min(.05,(now-(last||now))/1000);last=now;g.clearRect(0,0,innerWidth,innerHeight);
 for(let i=drops.length-1;i>=0;i--){const p=drops[i];p.life-=dt;if(p.life<=0){drops.splice(i,1);continue;}const oldX=p.x,oldY=p.y;p.vy+=200*dt;p.x+=p.vx*dt+Math.sin(p.life*8+p.seed)*12*dt;p.y+=p.vy*dt;const a=p.life/p.max;g.strokeStyle=`rgba(229,165,83,${a*.45})`;g.lineWidth=p.size;g.shadowColor='#f7d49a';g.shadowBlur=6;g.beginPath();g.moveTo(oldX,oldY-3);g.lineTo(p.x,p.y+6);g.stroke();g.fillStyle=`rgba(248,220,163,${a*.7})`;g.fillRect(p.x-.6,p.y,1.2,2);}
 g.shadowBlur=0;
 if(enabled&&visible&&now-latestEvent<550&&now-lastSpawn>32){lastSpawn=now;spawn(px,py,0,2);}
 if(drops.length&&enabled&&!document.hidden)running=requestAnimationFrame(flow);else{running=0;last=0;}
}
function spawn(x,y,vx,count=3){for(let k=0;k<count;k++){if(drops.length>=130)drops.shift();const life=.45+Math.random()*.55;drops.push({x:x+(Math.random()-.5)*7,y:y+5,vx:vx*.08+(Math.random()-.5)*22,vy:22+Math.random()*42,life,max:life,size:.5+Math.random(),seed:Math.random()*8});}if(!running)running=requestAnimationFrame(flow);}
document.addEventListener('pointermove',e=>{if(!enabled||e.pointerType==='touch')return;const dx=e.clientX-px;px=e.clientX;py=e.clientY;visible=true;cursor.style.transform=`translate(${px}px,${py}px)`;cursor.style.opacity='1';cursor.dataset.hover=String(!!e.target.closest('a,button,input,summary,[role=button]'));latestEvent=performance.now();if(latestEvent-lastSpawn>14){lastSpawn=latestEvent;spawn(px,py,dx);}}, {passive:true});
document.addEventListener('pointerout',e=>{if(!e.relatedTarget){visible=false;cursor.style.opacity='0';}},{passive:true});
toggle.addEventListener('click',()=>setEffects(!enabled,true));reduce.addEventListener('change',()=>setEffects(!reduce.matches&&fine.matches));fine.addEventListener('change',()=>setEffects(enabled));window.addEventListener('resize',resize,{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(running);running=0;drops.length=0;cursor.style.opacity='0';g.clearRect(0,0,innerWidth,innerHeight);}});resize();setEffects(enabled);
let beforeFullscreen=enabled;document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement){beforeFullscreen=enabled;setEffects(false);}else setEffects(beforeFullscreen);});

let serial=0;
function mount(host){
 if(host.dataset.lightMounted)return;host.dataset.lightMounted='true';const id='lx-angle-'+(++serial),rootURL=new URL('../',import.meta.url);
 host.innerHTML=`<section class="lx" aria-label="마우스로 체험하는 빛과 외피"><div class="lx-stage"><canvas class="lx-canvas" width="1280" height="600" tabindex="0" aria-label="빛과 차양 체험. 마우스 가로 이동으로 차양 각도, 세로 이동으로 빛의 높이를 바꿉니다. 방향키도 사용할 수 있습니다."></canvas><div class="lx-copy"><p class="lx-eyebrow">INTERACTIVE LIGHT / RESPONSIVE ENVELOPE</p><h2>빛을 움직이고,<br>외피의 반응을 읽다.</h2><p>가로로 움직이면 차양이 회전하고,<br>세로로 움직이면 빛의 높이가 달라집니다.</p><p class="lx-source">작동 원리 체험 · 실제 일사·조도 계산값 아님</p></div><div class="lx-angle-label">수동 체험 각도 <strong class="lx-angle">40°</strong></div><div class="lx-signal"><i></i><span class="lx-state">화면 위로 마우스를 움직여 보세요</span></div><div class="lx-hint">MOVE / DRAG / ARROW KEYS</div></div><div class="lx-controls"><div class="lx-modes" role="group" aria-label="체험 장면"><button data-mode="light" aria-pressed="false">01 빛</button><button data-mode="shade" aria-pressed="true">02 차양</button><button data-mode="results" aria-pressed="false">03 연구 결과</button></div><label class="lx-range" for="${id}">차양 각도 <input id="${id}" type="range" min="0" max="80" step="1" value="40"></label><div class="lx-cta"><a href="${new URL('film/',rootURL).href}">▶ 3분 논문 영상</a><a href="${new URL('lab/',rootURL).href}">데이터 탐색 ↗</a></div></div><div class="lx-metrics" hidden></div><p class="lx-result-note" hidden>자료를 연결하는 중입니다.</p></section>`;
 const c=host.querySelector('canvas'),cx=c.getContext('2d'),range=host.querySelector('input'),angleOut=host.querySelector('.lx-angle'),stateOut=host.querySelector('.lx-state'),metric=host.querySelector('.lx-metrics'),note=host.querySelector('.lx-result-note');
 let x=.5,y=.5,target=.5,current=.5,mode='shade',time=0,activeUntil=0,raf=0,previous=0,inView=false,data=null;
 const captions={light:['빛의 경로를 읽다.','차양을 적용하기 전의 빛 경로를 살펴봅니다.'],shade:['빛을 움직이고,<br>외피의 반응을 읽다.','가로로 움직이면 차양이 회전하고,<br>세로로 움직이면 빛의 높이가 달라집니다.'],results:['움직임의 가치는,<br>연구 결과로 판단하다.','아래 수치는 저장된 연간 연구 결과입니다.<br>마우스 움직임으로 재계산하지 않습니다.']};
 function setMode(next){mode=next;host.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));host.querySelector('.lx-copy h2').innerHTML=captions[mode][0];host.querySelector('.lx-copy p:not(.lx-eyebrow)').innerHTML=captions[mode][1];metric.hidden=note.hidden=mode!=='results';showResults();activate();}
 function showResults(){if(mode!=='results')return;if(!data){note.textContent='연구 결과를 연결하는 중입니다.';return;}const r=data.main.BT_T300,fmt=(v,u)=>(v>0?'+':'')+v.toFixed(2)+u;metric.innerHTML=[['EUI 중앙값',fmt(r.e,'%')],['피크전력 중앙값',fmt(r.peak,'%')],['UDI 중앙값',fmt(r.udi,'%p')],['열쾌적 중앙값',fmt(r.pmv,'%p')]].map(([label,value])=>'<div><span>'+label+'</span><strong>'+value+'</strong></div>').join('');note.textContent='257동 · 차폐 포함 · 냉방기 블라인드 일사량 기준 제어 · 건물별 변화 중앙값 / 실측값 아님';}
 function line(P,a,b,color,width=1,alpha=1){const u=P(a),v=P(b);if(u[2]<=0||v[2]<=0)return;cx.globalAlpha=alpha;cx.strokeStyle=color;cx.lineWidth=width;cx.beginPath();cx.moveTo(u[0],u[1]);cx.lineTo(v[0],v[1]);cx.stroke();cx.globalAlpha=1;}
 function poly(P,ps,fill,stroke){const pts=ps.map(P);cx.beginPath();pts.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1]));cx.closePath();cx.fillStyle=fill;cx.fill();cx.strokeStyle=stroke;cx.lineWidth=.65;cx.stroke();}
 function draw(){
  const a=current*80*Math.PI/180,P=camera([150+(x-.5)*30,65+(y-.5)*15,218],[0,0,0],[866,300],890);cx.fillStyle='#071017';cx.fillRect(0,0,1280,600);
  const gr=cx.createRadialGradient(870,280,20,870,280,450);gr.addColorStop(0,'#193344');gr.addColorStop(1,'#071017');cx.fillStyle=gr;cx.fillRect(0,0,1280,600);
  for(let j=0;j<90;j++){cx.fillStyle='#9cb4be40';cx.fillRect((j*113.7+Math.sin(time+j)*3)%1280,(j*79.6)%600,1,1);}
  const direction=[-.08,-mix(.07,.70,1-y),-1];
  for(let k=0;k<54;k++){const targetPoint=[-42+(k%9)*10.5,-36+Math.floor(k/9)*14.5,0],origin=sub(targetPoint,mul(direction,155)),hit=mode==='light'?null:rayHit(origin,direction,a),length=hit?hit.distance:235,end=add(origin,mul(direction,length));line(P,origin,end,'#deb77f',.65,.2);const t=(time*.27+k*.081)%1;line(P,add(origin,mul(direction,Math.max(0,t-.08)*length)),add(origin,mul(direction,t*length)),hit?'#edc99a':'#afe0e0',1.7,.9);if(!hit)line(P,targetPoint,end,'#83c9cf',.7,.35);}
  if(mode!=='light'){for(const xx of [-50,50])line(P,[xx,-48,0],[xx,48,0],'#819cab',2,.9);const list=Array.from({length:15},(_,j)=>slatCorners((j-7)*6,a)).sort((aa,b)=>P(b[0])[2]-P(aa[0])[2]);for(const p of list){poly(P,p,'#28414e','#7696a5');line(P,p[2],p[3],'#efc58e',1.7,.9);}line(P,[-55,0,0],[55,0,0],'#e9bf85',.7,.7);}
  else{poly(P,[[-49,-47,0],[49,-47,0],[49,47,0],[-49,47,0]],'#123a4330','#668893');}
  const mask=cx.createLinearGradient(0,0,610,0);mask.addColorStop(0,'#071017');mask.addColorStop(.65,'#071017e8');mask.addColorStop(1,'#07101700');cx.fillStyle=mask;cx.fillRect(0,0,620,600);
  angleOut.textContent=Math.round(current*80)+'°';
 }
 function animate(now){const dt=Math.min(.05,(now-(previous||now))/1000);previous=now;time+=dt;current=mix(current,target,reduce.matches?1:Math.min(1,dt*11));draw();if(inView&&!document.hidden&&!reduce.matches&&(now<activeUntil||Math.abs(current-target)>.002))raf=requestAnimationFrame(animate);else{raf=0;previous=0;}}
 function activate(){activeUntil=performance.now()+1700;if(reduce.matches){current=target;draw();}else if(inView&&!raf)raf=requestAnimationFrame(animate);else if(!inView){current=target;draw();}}
 function updatePointer(e){const r=c.getBoundingClientRect();x=clamp((e.clientX-r.left)/r.width);y=clamp((e.clientY-r.top)/r.height);target=x;range.value=Math.round(target*80);stateOut.textContent='마우스 반응 중 · 빛과 차양을 직접 조절';activate();}
 c.addEventListener('pointermove',updatePointer,{passive:true});c.addEventListener('pointerdown',updatePointer,{passive:true});c.addEventListener('pointerleave',()=>{stateOut.textContent='마지막 위치 유지 · 다시 움직이면 반응합니다';});
 c.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')target=clamp(target-.05);if(e.key==='ArrowRight')target=clamp(target+.05);if(e.key==='ArrowUp')y=clamp(y-.07);if(e.key==='ArrowDown')y=clamp(y+.07);x=target;range.value=Math.round(target*80);stateOut.textContent='방향키로 빛과 차양을 조절합니다';activate();});
 range.addEventListener('input',()=>{target=x=Number(range.value)/80;stateOut.textContent='슬라이더로 차양 각도를 조절합니다';activate();});
 host.querySelectorAll('[data-mode]').forEach(b=>{b.addEventListener('click',()=>setMode(b.dataset.mode));b.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')setMode(b.dataset.mode);});b.addEventListener('focus',()=>setMode(b.dataset.mode));});
 const observer=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView)activate();else{cancelAnimationFrame(raf);raf=0;previous=0;}},{threshold:.05});observer.observe(c);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;previous=0;}else if(inView)activate();});
 loadPaperData().then(d=>{data=d;showResults();}).catch(()=>{note.textContent='연구 결과를 불러오지 못했습니다. 새로고침해 주세요.';});draw();
}
function scan(){
 const home=document.querySelector('#page-home');if(home&&!home.querySelector('[data-light-experience]')){const title=home.querySelector('.titleblock');if(title){const host=document.createElement('div');host.setAttribute('data-light-experience','');title.after(host);}}
 document.querySelectorAll('[data-light-experience]:not([data-light-mounted])').forEach(mount);
}
scan();const app=document.querySelector('#app');if(app)new MutationObserver(records=>{if(records.some(r=>r.type==='childList'&&r.target.id==='page-home'))scan();}).observe(app,{childList:true,subtree:true});
