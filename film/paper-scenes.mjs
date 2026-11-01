import {camera,ramp,mix} from './geometry.mjs';
import {CHAPTERS,TAGS,SHORT,chapterIndex} from './paper-data.mjs';
export function createPaperRenderer(api,S){
 const {ctx,text,line2,base,city,panel,beams,caption}=api;
 const white='#e4e8e6',muted='#91a6b1',gold='#e7b881',cyan='#9ed4d0',mono='"SFMono-Regular",Consolas,monospace';
 const n=(v,d=2)=>Number(v).toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
 const s=(v,d=2)=>(v>0?'+':'')+n(v,d);
 function wrap(value,x,y,width,size=25,color=muted,line=41){let buffer='',row=0;ctx.font=size+'px -apple-system,"Apple SD Gothic Neo",sans-serif';for(const ch of value){if(ctx.measureText(buffer+ch).width>width){text(buffer,x,y+row*line,size,color);buffer='';row++;}buffer+=ch;}if(buffer)text(buffer,x,y+row*line,size,color);}
 function heading(k,title,subtitle=''){text(k,66,177,18,gold,400,'left',mono);text(title,64,243,48,white,500);if(subtitle)text(subtitle,66,292,23,muted);}
 function rule(y){line2([66,y],[1854,y],'#29424e',1,.8);}
 function compare(left,right,note){
  [left,right].forEach((v,i)=>{const x=110+i*940;ctx.fillStyle='#0b1720';ctx.fillRect(x,357,800,360);text(v.label,x+36,413,25,muted);text(s(v.value)+'%',x+34,550,99,v.value<0?cyan:gold,300,'left',mono);wrap(v.copy,x+38,615,700,24,muted,38);});
  text('→',960,540,55,gold,300,'center');text(note,110,768,22,muted);
 }
 function frame(t){
  const i=chapterIndex(t),ch=CHAPTERS[i];text('F /',64,66,25,gold,500,'left',mono);text('FACADE RETROFIT LAB / THESIS FILM',126,64,15,'#b5c6cd',400,'left',mono);text(String(i+1).padStart(2,'0')+' / 10',1855,67,17,gold,400,'right',mono);
  text('시뮬레이션 연구 결과 · 움직임·광선은 설명용',64,1044,16,'#788f9b');text(ch.source,1855,1044,16,'#788f9b',400,'right');
 }
 return function drawPaper(){
  const t=S.t,p=S.paper,i=chapterIndex(t),ch=CHAPTERS[i],local=t-ch.start;base(t);
  if(!p)return;
  if(i===0){
   city(3+local*.30,.24,.15);ctx.fillStyle='#03090dd9';ctx.fillRect(38,124,1260,650);
   text('DOCTORAL RESEARCH / RESEARCH FINDINGS',66,178,17,gold,400,'left',mono);
   text('서울 업무시설 밀집지역',64,264,57,white,500);text('기존 건물의 외피 성능 개선 평가',64,338,57,white,500);
   const qs=['에너지·피크전력·채광·열쾌적은 얼마나 달라지는가?','고정형과 키네틱 파사드의 차이는 무엇에서 생기는가?','주변 차폐·평면 규모·층수는 적용 효과를 어떻게 바꾸는가?'];
   qs.forEach((q,k)=>{const y=472+k*92;text('0'+(k+1),68,y,30,gold,400,'left',mono);text(q,141,y,28,white);line2([141,y+27],[1120,y+27],'#29424e',1,.6);});
   caption('01 / RESEARCH QUESTION','어떤 건물에서, 어떤 성능이, 얼마나 달라질까요?','조승완 · 국민대학교 건축학과 박사과정 · 지도교수 박미애 / 논문 핵심 요약');
  }else if(i===1){
   city(2+local*.65,1,.12);ctx.fillStyle='#050c12e8';ctx.fillRect(45,142,620,620);
   text('YEOKSAM / FOUR BLOCKS',80,204,19,gold,400,'left',mono);text('257',72,397,158,white,300,'left',mono);text('동',415,392,46,muted);
   text('업무시설 245 + 업무 혼합 용도 12',80,466,28,white);text('지상 6층 이상 · 상세 모델 3동 포함',80,518,26,muted);rule(782);
   ['NE 50','NW 47','SE 53','SW 107'].forEach((v,k)=>text(v,80+k*440,826,26,gold,400,'left',mono));
   caption('02 / SAMPLE','실제 밀집지역의 건물 조건을 비교합니다.','현재 계산 범위: 역삼역 일대 4개 대블록 / 형상 예시: 아크플레이스 주변');
  }else if(i===2){
   heading('03 / METHOD','동일 조건의 비교가 출발점입니다.','EnergyPlus 23.2 · 서울 TMYx 2011–2025 · 10분 간격 · 연간 8,760시간');
   const boxes=[['공개 자료','건물 윤곽·높이','용도·층수·연면적'],['기준 모델','DOE 대형 사무소','창·설비 공통 가정'],['개선안 적용','개선 전 + 9개 대안','주변 차폐 포함·제외'],['결과 산출','EUI·피크전력','UDI·PMV 허용시간']];
   boxes.forEach((b,k)=>{const x=66+k*460;ctx.fillStyle='#10212c';ctx.fillRect(x,365,400,245);text('0'+(k+1),x+25,414,20,gold,400,'left',mono);text(b[0],x+25,474,32,white,500);text(b[1],x+25,528,23,muted);text(b[2],x+25,569,23,muted);if(k<3){line2([x+406,485],[x+452,485],gold,2,.6);const pos=(local*.2+k*.23)%1;ctx.fillStyle=gold;ctx.beginPath();ctx.arc(x+406+46*pos,485,4,0,Math.PI*2);ctx.fill();}});
   text(n(p.runs,0),66,750,78,cyan,300,'left',mono);text('본 대안 계산 / 257동 × 기준 포함 10조건 × 차폐 2조건',400,748,27,muted);
   caption('03 / REPRODUCIBLE COMPARISON','계산 조건을 맞추고, 지표를 나누어 읽습니다.','보정 가정: 기기 밀도 1.0 · 냉동기 COP 배수 2.0 / 계절 비교·민감도 계산은 별도');
  }else if(i===3){
   heading('04 / ALTERNATIVES','고정형 3종과 키네틱 6종을 비교합니다.');
   const rows=[['고정형 3종','블라인드 · 수평 루버 · 수직 루버'],['컷오프 제어 3종','직달일사를 막는 각도 · 연중 작동'],['일사량 제어 2종','5~9월 · 입면 일사 300 W/m² 초과'],['피크 시간 제어 1종','평일 13~18시 폐쇄 · 연중 작동']];
   rows.forEach((r,k)=>{const y=359+k*108;text(r[0],66,y,29,k===2?gold:white,500);text(r[1],66,y+43,23,muted);});
   const P=camera([145,75,210],[0,0,0],[1410,508],1040),angle=mix(.12,1.08,(Math.sin(local*.35-Math.PI/2)+1)/2);beams(P,angle,t,{alpha:.45});panel(P,angle);
   caption('04 / CONTROL','제어 신호와 작동 계절을 구분합니다.','오른쪽은 수평 루버 작동 원리의 예시 / 정확한 제어각·일사량 출력 재현은 아닙니다.');
  }else if(i===4){
   heading('05 / ENERGY RESULTS','연중 작동 키네틱 4종은 EUI가 증가했습니다.','257동 건물별 EUI 변화 중앙값 · 차폐 포함 · 음수=에너지 감소 / 양수=증가');
   const x0=1125,scale=390,max=Math.max(...TAGS.map(tag=>Math.abs(p.main[tag].e))),progress=S.playing?ramp(local,0,4):1;
   line2([x0,325],[x0,808],'#77919e',1,.7);text('감소 ←',1047,326,18,cyan,400,'right');text('→ 증가',1200,326,18,gold);
   TAGS.forEach((tag,k)=>{const r=p.main[tag],y=370+k*52,len=Math.abs(r.e)/max*scale*progress;text(SHORT[tag],66,y+8,24,tag==='BT_T300'?gold:white);ctx.fillStyle=r.e<0?cyan:gold;ctx.globalAlpha=.85;ctx.fillRect(r.e<0?x0-len:x0,y-19,len,25);ctx.globalAlpha=1;text(s(r.e)+'%',1710,y+8,28,r.e<0?cyan:gold,400,'right',mono);});
   caption('05 / FINDING 01','냉방 감소만으로 전체 에너지 절감을 판단할 수 없습니다.','겨울 일사 차단에 따른 난방 증가, 채광 감소에 따른 조명 증가를 함께 검토합니다.');
  }else if(i===5){
   heading('06 / OPERATING SEASON','작동 계절이 결과를 바꿉니다.','블라인드 일사량 기준 제어 · 257동 건물별 EUI 변화 중앙값 · 차폐 포함');
   compare({label:'냉방기 작동 / 5~9월',value:p.main.BT_T300.e,copy:'난방기에는 블라인드를 걷어 올립니다.'},{label:'연중 작동 / 1~12월',value:p.annual.BT_T300.e,copy:'겨울 일사 차단으로 난방이 늘어납니다.'},'장치는 같아도 작동 기간이 다르면 결과가 달라집니다.');
   caption('06 / FINDING 02','같은 장치의 다른 운전을 함께 보고합니다.','냉방기 작동 조건은 연중 결과 확인 후 선택 / 후속 표본에서 추가 검증 필요');
  }else if(i===6){
   heading('07 / SURROUNDING OBSTRUCTION','주변 차폐는 분석 조건입니다.','동일한 257동 · 동일한 블라인드 고정 대안 · 건물별 EUI 변화 중앙값');
   compare({label:'주변 건물 차폐 포함',value:p.main.F0.e,copy:'밀집지역의 주변 차폐면을 모델에 포함합니다.'},{label:'주변 건물 차폐 제외',value:p.without.F0.e,copy:'같은 건물에서 주변 차폐면만 제외합니다.'},'각 변화율은 해당 차폐 조건의 개선 전 모델과 비교합니다.');
   caption('07 / FINDING 03','주변 차폐에 따라 효과의 크기와 방향이 달라집니다.','한 건물의 결과를 모든 건물에 그대로 적용하지 않고, 건물 조건별로 평가합니다.');
  }else if(i===7){
   const r=p.main.BT_T300;heading('08 / MULTIPLE CRITERIA','함께 감소한 건물은 '+r.both+'동, 효과 크기는 작습니다.','냉방기 블라인드 일사량 기준 제어 · 차폐 포함 · 257동');
   for(let k=0;k<257;k++){ctx.fillStyle=k<r.both?cyan:'#273d49';ctx.beginPath();ctx.arc(83+(k%29)*29,372+Math.floor(k/29)*29,6.3,0,Math.PI*2);ctx.fill();}
   text(r.both+' / 257',66,728,57,cyan,300,'left',mono);text('EUI와 건물 피크전력이 모두 감소',66,776,23,muted);
   const values=[['EUI',r.e,'%'],['건물 피크전력',r.peak,'%'],['유용조도 UDI',r.udi,'%p'],['열쾌적 허용시간',r.pmv,'%p']];values.forEach((v,k)=>{const y=367+k*104;text(v[0],1110,y,24,muted);text(s(v[1])+v[2],1818,y+4,45,k<2?cyan:v[1]>0?cyan:gold,300,'right',mono);line2([1110,y+29],[1818,y+29],'#2c4552',1,.8);});
   caption('08 / TRADE-OFF','변화의 방향뿐 아니라 크기와 상충도 확인합니다.','257동 전력 합산의 피크 변화: '+s(Number(p.block.BT_T300.dpeak_pct))+'% / 약 '+n(p.blockPeakSaved,0)+' kW 감소');
  }else if(i===8){
   heading('09 / VALIDATION','개별 건물 예측의 정확도에는 한계가 남습니다.','건축HUB 월 전기와 비교 · 시험용 215동 · 보정 후');
   text('CV(RMSE) 중앙값',66,386,28,muted);text(n(p.before.cv_rmse_median,1)+'%',66,503,88,'#708c9c',300,'left',mono);text('→',460,490,54,gold);text(n(p.valid.cv_rmse_median,1)+'%',580,503,88,gold,300,'left',mono);text('보정 전',66,555,24,muted);text('보정 후',580,555,24,muted);
   text(p.valid.n_pass_g14+' / '+p.valid.n,1240,486,82,gold,300,'left',mono);text('원고에서 제시한 월 기준 충족',1240,545,25,muted);
   const limits=['실제 외피·설비·운전 조건 부족','냉동기 COP 배수 2.0 가정의 영향','약 100동의 워밍업 미수렴 경고'];limits.forEach((v,k)=>text('0'+(k+1)+'   '+v,66,665+k*55,28,white));
   caption('09 / LIMITATIONS','상대적인 개선 효과도 추가 검증이 필요합니다.','보정 개선·수렴 재계산·입력 가정 민감도·구동 에너지와 비용 검토');
  }else{
   const P=camera([178,78,240],[0,0,0],[1500,500],1050);panel(P,.32+Math.sin(local*.2)*.12,{alpha:.36});
   text('CONCLUSION / EXTENSION',66,183,18,gold,400,'left',mono);text('건물 조건에 맞는',64,290,64,white,500);text('적용 근거를 찾는 연구.',64,382,64,white,500);
   ['제어 방식 · 작동 계절 · 주변 차폐를 함께 평가','보정·워밍업·민감도 검증을 보강','구동 전력 추정과 서울 오피스 3권역 536동 계산'].forEach((v,k)=>{text('0'+(k+1),66,527+k*89,26,gold,400,'left',mono);text(v,145,527+k*89,31,white);});
   caption('10 / RESEARCH CONTRIBUTION','이번 257동의 연구 결과를 후속 검증으로 이어갑니다.','도심·여의도·마포 등 확장 범위의 결과를 이미 계산한 것으로 해석하지 않습니다.');
  }
  const fade=1-ramp(local,0,.45);if(t>0&&fade>0){ctx.fillStyle='rgba(3,5,7,'+fade*.75+')';ctx.fillRect(0,110,1920,905);}frame(t);
 };
}
