import {parseCSV,numeric} from '../lab/data-engine.mjs';
export const TAGS=['F0','LH_F0','VF_F0','S3','LH_C','VF_C','BT_T300','LT_T300','PK'];
export const SHORT={F0:'블라인드 고정',LH_F0:'수평 루버 고정',VF_F0:'수직 루버 고정',S3:'블라인드 컷오프',LH_C:'수평 루버 컷오프',VF_C:'수직 루버 컷오프',BT_T300:'블라인드 일사량 제어',LT_T300:'수평 루버 일사량 제어',PK:'피크 시간대 폐쇄'};
export const median=a=>{const b=a.filter(Number.isFinite).sort((a,b)=>a-b),m=b.length>>1;return b.length?b.length%2?b[m]:(b[m-1]+b[m])/2:NaN;};
export function summarize(rows){return Object.fromEntries(TAGS.map(tag=>{const r=rows.filter(x=>x.tag===tag);return[tag,{n:r.length,e:median(r.map(x=>x.dEUI_pct)),peak:median(r.map(x=>x.dpeak_pct)),udi:median(r.map(x=>x.dUDI_pp)),pmv:median(r.map(x=>x.dPMV_pp)),both:r.filter(x=>x.dEUI_pct<0&&x.dpeak_pct<0).length}];}));}
export function buildPaperData({buildings,results,validation,blocks,meta,alternatives}){
 const included=results.filter(r=>r.cond==='차폐 포함'),excluded=results.filter(r=>r.cond==='차폐 제외'),year=results.filter(r=>r.cond==='차폐 포함(연중 작동)');
 if(buildings.length!==257||included.length!==2570||excluded.length!==2570)throw Error('257동의 차폐 조건별 자료 구성이 예상과 다릅니다.');
 const valid=validation.find(r=>r.subset==='시험용 215동'&&r.stage==='보정 후'),before=validation.find(r=>r.subset==='시험용 215동'&&r.stage==='보정 전');
 if(!valid||!before)throw Error('시험용 건물 검증 자료가 없습니다.');
 const main=summarize(included),without=summarize(excluded),annual=summarize(year),block=Object.fromEntries(blocks.map(r=>[r.scenario,r]));
 if(TAGS.some(t=>main[t].n!==257||without[t].n!==257)||annual.BT_T300.n!==257)throw Error('대안별 표본 수가 예상과 다릅니다.');
 return{buildings,results,meta:Object.fromEntries(meta.map(r=>[r.key,r.value])),alternatives,main,without,annual,valid,before,block,n:buildings.length,runs:included.length+excluded.length,blockPeakSaved:Number(block.S1.peak_kW)-Number(block.BT_T300.peak_kW)};
}
let pending;
export function loadPaperData(){
 if(!pending)pending=(async()=>{const names={buildings:'buildings.csv',results:'results_257_cond.csv',validation:'validation.csv',blocks:'block_257.csv',meta:'meta.csv',alternatives:'alternatives.csv'};const values=await Promise.all(Object.entries(names).map(async([key,name])=>{const url=new URL('../data/db/csv/'+name,import.meta.url);const r=await fetch(url);if(!r.ok)throw Error(name+' HTTP '+r.status);return[key,parseCSV(await r.text()).map(numeric)];}));return buildPaperData(Object.fromEntries(values));})().catch(e=>{pending=null;throw e;});
 return pending;
}
export const CHAPTERS=[
 {start:0,end:18,key:'QUESTION',label:'연구 질문',title:'움직이는 외피는, 언제 효과적인가?',copy:'외피 개선은 에너지·피크전력·채광·열쾌적을 얼마나 바꾸며, 밀집지역의 건물 조건에 따라 효과는 어떻게 달라지는가?',source:'원고 1.4절·2장'},
 {start:18,end:36,key:'SAMPLE',label:'연구 대상',title:'역삼역 일대 257동에서 비교합니다.',copy:'4개 대블록, 지상 6층 이상 업무 용도 건물 257동입니다. 상세 모델 3개 동을 포함하며, 업무시설 245동과 업무 용도가 섞인 제2종 근린생활시설 12동으로 구성됩니다.',source:'원고 4.1절'},
 {start:36,end:54,key:'METHOD',label:'계산 방법',title:'같은 조건에서, 개선 전후를 계산합니다.',copy:'공개 형상 자료와 DOE 기준 모델로 EnergyPlus 23.2 모델을 구성합니다. 서울 TMYx 2011–2025 기상, 10분 간격, 연간 8,760시간을 사용하며, 개선 전 포함 10조건과 차폐 포함·제외를 비교합니다.',source:'원고 4.2~4.4절'},
 {start:54,end:72,key:'ALTERNATIVES',label:'9개 대안',title:'장치보다, 언제 어떻게 움직이는가.',copy:'고정형 차양 3종과 키네틱 파사드 6종을 비교합니다. 컷오프 제어 3종과 피크 시간대 폐쇄는 연중, 일사량 기준 제어 2종은 냉방기 5~9월에 작동합니다.',source:'원고 표 2'},
 {start:72,end:96,key:'ENERGY',label:'에너지 결과',title:'움직이는 외피가 항상 에너지를 줄이지는 않습니다.',copy:'차폐 포함 조건의 257동 건물별 EUI 변화 중앙값입니다. 고정형 3종과 냉방기 일사량 기준 제어 2종은 감소했지만, 연중 작동 키네틱 4종은 증가했습니다. 겨울 일사 차단과 조명 증가를 함께 살펴야 합니다.',source:'원고 표 4·5 / results_257_cond.csv'},
 {start:96,end:114,key:'SEASON',label:'작동 계절',title:'같은 블라인드도 작동 계절에 따라 달라집니다.',copy:'블라인드 일사량 기준 제어의 냉방기 작동과 연중 작동을 비교합니다. 냉방기 작동 조건은 연중 결과를 확인한 뒤 정했으므로, 두 결과를 함께 보고하고 추가 검증해야 합니다.',source:'원고 5.6절·표 8'},
 {start:114,end:132,key:'DENSITY',label:'주변 차폐',title:'주변 건물은 효과의 방향까지 바꿉니다.',copy:'같은 257동에서 주변 차폐만 넣고 뺀 비교입니다. 블라인드 고정의 EUI 변화 중앙값은 차폐 포함 시 감소하지만, 제외하면 작은 증가로 바뀝니다. 밀집 조건은 결과를 바꾸는 분석 변수입니다.',source:'원고 5.5절·표 7'},
 {start:132,end:150,key:'TRADE-OFF',label:'함께 보는 지표',title:'감소한 건물 수와 효과 크기를 함께 봅니다.',copy:'냉방기 블라인드 일사량 기준 제어에서 EUI와 피크전력을 함께 줄인 건물은 174동입니다. 그러나 중앙값의 감소 폭은 매우 작고, 열쾌적 비율은 낮아졌습니다. 하나의 지표만으로 적용을 결정하지 않습니다.',source:'원고 표 4·9'},
 {start:150,end:168,key:'VALIDATION',label:'검증과 한계',title:'연구 결과의 한계도 같은 비중으로 보고합니다.',copy:'시험용 215동의 월 CV(RMSE) 중앙값은 보정 후에도 45.4%이며, 제시된 월 기준 충족은 1동입니다. 실제 외피·설비·운전 조건의 부족, 냉동기 COP 배수 2.0 가정, 약 100동의 워밍업 미수렴 경고가 남아 있어 상대 효과도 추가 검증이 필요합니다.',source:'원고 4.5·5.9·7.3절 / validation.csv'},
 {start:168,end:180,key:'CONCLUSION',label:'결론과 후속 연구',title:'건물 조건에 맞는 적용 근거를 찾습니다.',copy:'이번 257동의 연구 결과는 제어 방식·작동 계절·주변 차폐를 함께 평가해야 함을 보여 줍니다. 보정과 수렴 개선, 구동 에너지·비용 검토, 서울 3권역으로의 확장 계산이 후속 과제입니다.',source:'원고 6~7장'}
];
export function chapterIndex(t){const n=CHAPTERS.findIndex(c=>t<c.end);return n<0?CHAPTERS.length-1:Math.max(0,n);}
