/* 서울 오피스 네 지역(도심·강남·여의도·마포) — 같은 수집·결합·선별 절차와 같은 계산으로 만든 591동의 결과(원고 제7장).
   표는 research.sqlite의 r4_* 표에서 질의한다. 모든 성능 값은 EnergyPlus 23.2 시뮬레이션 값이다. */
'use strict';
const R4A = ['CBD', 'GBD', 'YBD', 'MPO'];
const R4N = { CBD: '도심', GBD: '강남', YBD: '여의도', MPO: '마포' };
const R4COL = { CBD: '#7a4f9d', GBD: '#1f6f8b', YBD: '#b06a2a', MPO: '#2f7d6b' };
const r4ok = () => { try { return q("SELECT COUNT(*) n FROM r4_areas")[0].n > 0; } catch (e) { return false; } };
const R4ST = { alt: 'F0', cond: '차폐 포함', subset: 'all', ter: 'F0' };
const TERL = { low: '적게 가려짐', mid: '중간', high: '많이 가려짐' };

function r4Section() {
  if (!r4ok()) return '';
  const A = q('SELECT * FROM r4_areas'); const tot = A.reduce((s, r) => s + r.n, 0);
  const alts = ORDER.map(t => `<option value="${t}">${esc(altName(t))}</option>`).join('');
  return `<h2 id="r4">서울 오피스 네 지역 — 같은 절차로 만든 ${num(tot)}동</h2>
  <p>국가승인통계의 서울 오피스 세 권역(도심, 강남, 여의도·마포)에서 정한 네 지역(도심, 강남, 여의도, 마포)의 업무 용도 6층 이상 건물에, 하나의 자료 생성 절차(OpenStreetMap 윤곽 + 건축물대장 표제부 결합, 같은 높이 규칙, 350 m 안 주변 건물 전부 조회)와 역삼 257동과 같은 모델·기상·계산 간격·대안을 적용하였다(원고 제7장, 부록 A.2). 강남의 계산 대상 가운데 257동과 같은 건물도 257동의 결과를 쓰지 않고 이 절차로 다시 계산하였다. 마포는 업무 기능 지구단위계획구역이 없어 마포대로에서 30 m 이내의 상업지역(용도지역)을 구역으로 하였다.</p>
  ${table([{ h: '지역', k: 'name', f: (v, r) => `<b style="color:${R4COL[r.area]}">${esc(v)}</b>` }, { h: '대상 구역', k: 'zone' }, { h: '면적', k: 'zone_ha', num: 1, f: v => num(v, 1) + ' ha' },
    { h: '가구(계산 대상 있음)', k: 'n_blocks', num: 1, f: (v, r) => `${v} (${r.n_blocks_target ?? '—'})` }, { h: '계산 대상', k: 'n', num: 1, f: (v, r) => `${v}동` }, { h: '주용도 업무', k: 'n_main_office', num: 1 },
    { h: '지상층 중앙값', k: 'floors_med', num: 1, f: v => num(v) + '층' }, { h: '평균 차폐각 중앙값', k: 'obstr_med', num: 1, f: v => num(v, 1) + '°' },
    { h: '적게/중간/많이 가려짐', k: 'n_low', num: 1, f: (v, r) => `${r.n_low} / ${r.n_mid} / ${r.n_high}` }, { h: '350 m 안 높이 없는 건물', k: 'nb_missing_pct', num: 1, f: v => num(v, 1) + '%' }], A, { nw: 1 })}
  <h3>개선 전 상태와 실측 비교</h3>
  ${table([{ h: '지역', k: 'name' }, { h: '개선 전 EUI 중앙값', k: 'EUI0_med', num: 1, f: v => num(v, 1) }, { h: '지역 합산 EUI', k: 'EUI0_agg', num: 1, f: v => num(v, 2) },
    { h: '난방/냉방/조명(지역 합산)', k: 'heat0', num: 1, f: (v, r) => `${num(r.heat0, 1)} / ${num(r.cool0, 1)} / ${num(r.light0, 1)}` }, { h: 'UDI 비율', k: 'UDI0_med', num: 1, f: v => num(v, 1) + '%' },
    { h: '실측 비교(24개월)', k: 'valid_n', num: 1, f: v => v == null ? '—' : v + '동' }, { h: '월 CV(RMSE) 중앙값', k: 'cv_med', num: 1, f: v => v == null ? '—' : num(v, 1) + '%' },
    { h: '월 NMBE 중앙값', k: 'nmbe_med', num: 1, f: v => v == null ? '—' : sgn(v, 1, '%') }, { h: '월 기준 충족', k: 'pass_both', num: 1, f: (v, r) => v == null ? '—' : `${v}/${r.valid_n}` }, { h: '일반건축물만: CV / NMBE', k: 'valid_general_n', num: 1, f: (v, r) => v ? `${num(r.cv_general_med, 1)}% / ${sgn(r.nmbe_general_med, 1, '%')} <span class="small">(${v}동)</span>` : '—' }], A, { nw: 1 })}
  ${note('EUI 단위 kWh/(m²·yr). 실측 비교는 건축HUB 월별 전기(2023–2024, 지번 합계)와 원고 4.6.1항과 같은 방법(월 기준: CV(RMSE) 15% 이하, NMBE ±5% 이내). NMBE가 음수이면 모델이 실측보다 크다. 집합건축물(오피스텔·주상복합)은 지번 에너지 자료와 대장 연면적이 가리키는 범위가 다를 수 있어 일반건축물만의 값을 함께 둔다. 결과는 개별 건물의 절대량이 아니라 같은 모델 위의 개선 전후 상대 비교로 해석한다.')}
  <h3>대안별 결과</h3>
  <div class="ctrl"><label>주변 차폐<select id="r4cond"><option value="차폐 포함">포함(본 결과)</option><option value="차폐 제외">제외(비교)</option></select></label>
    <label>대상<select id="r4sub"><option value="all">계산 대상 전체</option><option value="stat">통계 대응 부분집합(주용도 업무·일반건축물, 공공·오피스텔 제외)</option><option value="nopublic">공공 청사·외국 공관 제외</option></select></label></div>
  <div id="r4alts"></div>
  <h3>가려진 정도 구간별 EUI 변화</h3>
  <div class="ctrl"><label>대안<select id="r4ter">${alts}</select></label></div>
  <div id="r4tert"></div>
  <div id="r4more"></div>`;
}
function r4Bind() {
  if (!r4ok()) return;
  const draw = () => { R4ST.cond = $('#r4cond').value; R4ST.subset = $('#r4sub').value; R4ST.ter = $('#r4ter').value; r4DrawAlts(); r4DrawTer(); };
  ['r4cond', 'r4sub', 'r4ter'].forEach(id => $('#' + id).addEventListener('change', draw));
  draw(); r4DrawMore();
}
function r4DrawAlts() {
  const S = q('SELECT * FROM r4_summary WHERE cond=? AND subset=?', [R4ST.cond, R4ST.subset]);
  const C = q("SELECT * FROM r4_cmp257 WHERE cond=? AND grp LIKE '역삼%'", [R4ST.cond]);
  const ns = Object.fromEntries(R4A.map(a => [a, (S.find(r => r.area === a) || {}).n]));
  const rows = ORDER.map(t => {
    const o = { name: altName(t) };
    for (const a of R4A) { const r = S.find(x => x.area === a && x.alt === t); o[a] = r ? r.dEUI_med : null; o[a + '_d'] = r ? r.eui_dec : null; o[a + '_agg'] = r ? r.dEUI_agg : null; }
    const c1 = C.find(x => x.alt === t && x.grp === '역삼 257동 전체'), c2 = C.find(x => x.alt === t && x.grp.startsWith('역삼 257동 중'));
    o.y = c1 ? c1.dEUI_med : null; o.y140 = c2 ? c2.dEUI_med : null; return o;
  });
  const cols = [{ h: '대안', k: 'name' }, ...R4A.map(a => ({ h: `${R4N[a]}(${ns[a] ?? '—'}동)`, k: a, num: 1, f: (v, r) => v == null ? '—' : `${pct(v)} <span class="small">(${r[a + '_d']})</span>`, cls: bad })),
    { h: '역삼 257동', k: 'y', num: 1, f: v => pct(v), cls: bad }, { h: '257동 중 가구 안 140동', k: 'y140', num: 1, f: v => pct(v), cls: bad }];
  const rows2 = ORDER.map(t => { const o = { name: altName(t) }; for (const a of R4A) { const r = S.find(x => x.area === a && x.alt === t) || {}; o[a] = r; } return o; });
  const cols2 = [{ h: '대안', k: 'name' }, ...R4A.map(a => ({ h: R4N[a], k: a, num: 1, f: v => v.n == null ? '—' : `${pct(v.dpeak_med)} / ${sgn(v.dUDI_med, 1, '%p')} / ρ ${v.rho_obstr == null ? '—' : sgn(v.rho_obstr, 2)}` + (R4ST.cond === '차폐 포함' && v.sign_flip != null ? ` / ${v.sign_flip}` : '') }))];
  $('#r4alts').innerHTML = `<p class="small">건물별 EUI 변화의 중앙값(개선 전 대비, 같은 주변 차폐 조건의 개선 전 기준). 괄호는 EUI가 줄어든 건물 수.</p>${table(cols, rows, { nw: 1 })}
    <p class="small">피크전력 변화 중앙값 / UDI 변화 중앙값 / 평균 차폐각과의 Spearman ρ${R4ST.cond === '차폐 포함' ? ' / 차폐를 빼면 증감 방향이 바뀌는 건물 수' : ''}</p>${table(cols2, rows2, { nw: 1 })}
    ${note('지역 합산 EUI 변화(모델 바닥면적 가중)와 건물별 값은 데이터베이스의 r4_summary 표에 있다. 역삼 257동 열은 원고 표 5-2·5-6, 140동 열은 그 가운데 테헤란로제2지구 가구 안의 건물이다. ' + SIMNOTE)}`;
}
function r4DrawTer() {
  const T = q('SELECT * FROM r4_tertile WHERE alt=? AND subset=?', [R4ST.ter, R4ST.subset]);
  const rows = ['low', 'mid', 'high'].map(t => { const o = { t: TERL[t] }; for (const a of R4A) o[a] = T.find(x => x.area === a && x.tertile === t) || {}; return o; });
  $('#r4tert').innerHTML = table([{ h: '가려진 정도(257동 3분위 경계 14.6°·22.8°)', k: 't' }, ...R4A.map(a => ({ h: R4N[a], k: a, num: 1, f: v => v.n ? `${pct(v.dEUI_med)} <span class="small">(${v.n}동)</span>` : '—', cls: v => bad(v.dEUI_med) }))], rows, { nw: 1 }) +
    note('차폐 포함 결과. 구간 경계는 모든 지역에 역삼 257동의 3분위 경계를 그대로 적용하였다(같은 가려진 정도의 건물끼리 비교).');
}
function r4DrawMore() {
  let h = '';
  const B = q('SELECT * FROM r4_blocks');
  if (B.length) {
    const rows = ORDER.map(t => { const o = { name: altName(t) }; for (const a of R4A) o[a] = B.find(x => x.area === a && x.alt === t) || {}; return o; });
    const nb = Object.fromEntries(R4A.map(a => [a, (B.find(x => x.area === a) || {}).n_blocks]));
    h += `<h3>가구 단위 수치</h3>${table([{ h: '대안', k: 'name' }, ...R4A.map(a => ({ h: `${R4N[a]}(가구 ${nb[a] ?? '—'}개)`, k: a, num: 1, f: v => v.n_blocks ? `${pct(v.dEUI_med)} / ${pct(v.dpeak_med)} <span class="small">(${v.both_dec})</span>` : '—' }))], rows, { nw: 1 })}
      ${note('가구 안 계산 건물의 시간별 결과를 더한 가구 EUI 변화 / 가구 피크전력 변화의 가구별 중앙값(차폐 포함). 괄호는 둘 다 줄어든 가구 수. 가구 안의 6층 미만 건물 등은 빠져 있어 가구 전체 값은 아니다.')}`;
  }
  const AD = q('SELECT * FROM r4_added');
  if (AD.length) {
    const keys = [...new Set(AD.map(r => r.cond_key))];
    const rows = keys.map(k => { const o = { name: (AD.find(r => r.cond_key === k) || {}).label }; for (const a of R4A) o[a] = AD.find(r => r.area === a && r.cond_key === k) || {}; return o; });
    h += `<h3>작동 기간·장치 배치를 바꾼 조건</h3>${table([{ h: '조건', k: 'name' }, ...R4A.map(a => ({ h: R4N[a], k: a, num: 1, f: v => v.n ? `${pct(v.dEUI_med)} <span class="small">(${v.eui_dec}/${v.n})</span> · 기본 ${pct(v.base_dEUI_med)}` : '—' }))], rows, { nw: 1 })}
      ${note('건물별 EUI 변화 중앙값(차폐 포함, 개선 전 대비). "기본"은 같은 건물의 표준 조건(연중 작동 또는 냉방 기간 작동, 단변 배치, 야간에도 내림) 결과.')}`;
  }
  const DV = (() => { try { return q('SELECT * FROM r4_drive'); } catch (e) { return []; } })();
  if (DV.length) {
    const ks = ['S3', 'LH_C', 'VF_C', 'BT_T300', 'LT_T300', 'PK'];
    const rows = ks.map(k => { const o = { name: altName(k) }; for (const a of R4A) o[a] = DV.find(r => r.area === a && r.alt === k) || {}; return o; });
    h += `<h3>키네틱 장치의 구동 전력량</h3>${table([{ h: '대안', k: 'name' }, ...R4A.map(a => ({ h: R4N[a], k: a, num: 1, f: v => v.n ? `${num(v.drive_kWh_m2_sb05, 3)} kWh/(m²·yr) · ${pct(v.dEUI_drive_med_sb05)} <span class="small">(${v.dec_drive_sb05})</span>` : '—' }))], rows, { nw: 1 })}
      ${note('원고 식 (4-1)·(4-2), 표 4-5 사양(작동 중 110 W, 대기전력 0.5 W, 각도 조절 2초·내림/올림 30초, 모터당 창 6 m²)으로 구한 건물별 구동 전력량 중앙값과, 이를 더한 EUI 변화 중앙값(괄호는 그래도 EUI가 줄어든 건물 수).')}`;
  }
  const SE = q('SELECT * FROM r4_sens');
  if (SE.length) {
    const vs = [...new Set(SE.map(r => r.variant))];
    const rows = vs.map(v => { const o = { name: (SE.find(r => r.variant === v) || {}).label }; for (const a of R4A) { const x = SE.filter(r => r.area === a && r.variant === v); o[a] = x.length ? { ss: x.reduce((s, r) => s + r.same_sign, 0), n: x.reduce((s, r) => s + r.n, 0), rmin: Math.min(...x.filter(r => r.rho != null).map(r => r.rho)) } : null; } return o; });
    h += `<h3>모델 가정의 민감도(지역별 표본)</h3>${table([{ h: '변형', k: 'name' }, ...R4A.map(a => ({ h: R4N[a], k: a, num: 1, f: v => v ? `${v.ss}/${v.n} <span class="small">(ρ ≥ ${v.rmin.toFixed(2)})</span>` : '—' }))], rows, { nw: 1 })}
      ${note('지역마다 평균 차폐각 3구간에서 고르게 고른 40동(마포는 33동; 워밍업은 그중 20동, 마포 17동)의 9개 대안 EUI 변화가 보정 기준과 같은 방향인 건물·대안 수 / 전체 수, 괄호는 대안별 Spearman 순위 상관의 최솟값. 높이 보완은 350 m 안 높이 없는 건물이 0.5%를 넘는 지역만 계산. 창 사양을 바꾸면 방향이 크게 바뀐다: 투명 복층 수준 창에서는 블라인드 일사량 기준 제어를 뺀 8개 대안의 중앙값이 네 지역 모두 증가였고, 저방사 복층 수준 창에서는 블라인드 고정의 중앙값이 0 가까이(−0.27~+0.13%)로 옮겨 갔다(원고 7.8.1항; 역삼 257동의 4.6.2항과 같은 결과). 그림자를 매 계산 간격 갱신한 지역별 4동에서는 4개 대안의 EUI 변화 차이가 0.35%p 이하였고 방향이 바뀐 조합은 없었다.')}`;
  }
  $('#r4more').innerHTML = h;
}
/* 대상지 지도: 네 지역 계산 대상 건물(점)을 대안별 EUI 변화 색으로 겹친다(역삼 257동 윤곽 위). */
let R4LAYER = null;
function r4DrawMarkers(alt, cond, mode) {
  if (!r4ok() || !MAP) return;
  if (R4LAYER) R4LAYER.remove();
  R4LAYER = L.layerGroup().addTo(MAP);
  const col = 'dEUI_' + alt + (cond === '차폐 제외' ? '_nosh' : '');
  let rows; try { rows = q(`SELECT area, osm, name, floors, obstr_deg, lat, lon, ${col} AS v FROM r4_buildings`); } catch (e) { return; }
  const lim = 2;
  for (const b of rows) {
    if (b.lat == null) continue;
    const fc = mode === 'dEUI_pct' ? divColor(b.v, lim) : R4COL[b.area];
    L.circleMarker([b.lat, b.lon], { radius: 4, color: '#222', weight: 0.6, fillColor: fc, fillOpacity: 0.9 })
      .bindTooltip(`${esc(b.name || b.osm)} · ${R4N[b.area]} · ${b.floors}층 · 평균 차폐각 ${num(b.obstr_deg, 1)}° · ${esc(altName(alt))} EUI ${pct(b.v)}(${cond})`).addTo(R4LAYER);
  }
}
