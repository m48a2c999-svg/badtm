/* 자료 생성기 — 지역(권역·구역·구)을 입력하면 공식 가구 경계와 건물 자료를 자동으로 만든다.
   단계: ① 구역·가구(서울시 UPIS, 사이트에 탑재) → ② 건물 윤곽(OpenStreetMap, Overpass API를 브라우저에서 호출)
        → ③ 건물을 가구에 배정 → ④ 가구별 지표 → ⑤ 내려받기(GeoJSON·CSV·작업 기록)
   EnergyPlus 계산은 브라우저에서 하지 않는다(계산 엔진 단계). */
'use strict';
const GEN = { plans: null, gu: null, sel: new Set(), blocks: null, bld: null, map: null, layer: null, log: [] };
const PRESET = {
  // 도심: 세종로·종로2·3가·종로4·5가·명동관광특구 + 도심 핵심부(광화문·시청·무교다동·을지로·남대문) 도시정비형 재개발구역 등(서울 UPIS UQ161 2026-09)
  '도심(CBD)': ['11110UQ161PS201908270002', '11110UQ161PS202405270003', '11110UQ161PS202308280002', '11140UQ161PS202403210003',
    '11000UQ161PS201912150057', '11000UQ161PS202012175029', '11000UQ161PS201912150198', '11140UQ161PS202409030001', '11140UQ161PS202405290001',
    '11110UQ161PS202412160001', '99999UQ161PS202404020001', '11110UQ161PS202412100001', '11110UQ161PS202505140001', '11110UQ161PS202411250001',
    '11110UQ161PS202408060003', '11140UQ161PS202403210001', '11140UQ161PS202409020002', '11140UQ161PS202504100001', '11140UQ161PS202502250001',
    '11140UQ161PS202405140003', '11140UQ161PS202403260001', '11140UQ161PS202409020001', '11140UQ161PS202504070001', '11140UQ161PS202408280001',
    '11140UQ161PS202407110001', '11110UQ161PS202405270002', '11140UQ161PS202604290001'],
  '강남(GBD)': ['11680UQ161PS202505140001'],
  '여의도·마포(YBD)': ['11000UQ161PS202411250001'],
};
const GEN_MAX_PLANS = 30, GEN_MAX_HA = 600;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];


/* Overpass 질의: 서버마다 시간 제한(기본 90초)을 두고, 실패하면 다음 서버 → 한 바퀴 더 시도 */
async function overpassQuery(ql, onWait = () => {}, ms = 90000) {
  let err = '';
  for (let round = 0; round < 2; round++) {
    for (const u of OVERPASS) {
      const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), ms);
      try {
        const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(ql), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal });
        if (r.ok) { const d = await r.json(); clearTimeout(tm); return { data: d, used: u }; }
        err = 'HTTP ' + r.status;
      } catch (x) { err = x.name === 'AbortError' ? '시간 초과' : x.message; }
      clearTimeout(tm);
      const last = round === 1 && u === OVERPASS[OVERPASS.length - 1];
      if (!last) onWait(`${u.split('/')[2]} 응답 없음(${err}) — 다른 서버로 다시 시도`);
    }
    if (round === 0) await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('OpenStreetMap 서버에 접속하지 못했다(' + err + '). 잠시 뒤 다시 시도해 주세요.');
}

async function genLoadPlans() {
  if (GEN.plans) return;
  const j = await (await fetch('data/upis/plans.json')).json();
  GEN.plans = j.plans; GEN.gu = j.gu; GEN.src = j.source; GEN.rule = j.rule;
}
function pageGen() {
  $('#page-gen').innerHTML = `
  <div class="kicker">연구 시스템 · 자료 생성기</div><h1>지역을 넣으면 가구와 건물 자료가 만들어진다</h1>
  <p>권역을 고르거나 구역·구 이름을 검색해 선택하면, 법으로 결정·고시된 지구단위계획구역을 도시계획도로로 나눈 <b>가구(블록)</b>와 그 안에서 OpenStreetMap에 등록된 <b>건물</b>을 자동으로 모아 가구별 표를 만든다. 결과는 계산 엔진(EnergyPlus)의 입력으로 쓰도록 내려받을 수 있다.</p>
  <div class="grid g2" style="grid-template-columns:minmax(0,1fr) minmax(0,1.3fr)">
    <div class="card">
      <h3>① 지역 입력</h3>
      <div class="ctrl"><label>권역(국가승인통계 오피스 권역 기준)<select id="gpre"><option value="">— 선택 —</option>${Object.keys(PRESET).map(k => `<option>${k}</option>`).join('')}</select></label></div>
      <div class="ctrl"><label style="flex:1">구역·구 이름 검색<input type="search" id="gq" placeholder="예: 테헤란로, 여의도, 강남구, 용산"></label>
      <label>상업지역 비율<select id="gcom"><option value="0">전체</option><option value="50">50% 이상</option><option value="80">80% 이상</option></select></label></div>
      <div id="glist" class="tblwrap" style="max-height:300px"></div>
      <p class="small" id="gselinfo"></p>
      <button class="btn sun" id="grun">자료 만들기</button> <button class="btn ghost" id="gclear">선택 지우기</button>
      <h3 style="margin-top:16px">진행</h3><ol id="gsteps" class="small"></ol>
    </div>
    <div><div id="gmap" style="height:460px;border:1px solid var(--line)"></div><div id="gleg" class="maplegend" style="margin-top:6px">색 = 가구의 건폐율(건물 윤곽 면적 합 ÷ 가구 면적)</div></div>
  </div>
  <h2>가구별 결과</h2><div id="gout"><p class="small">아직 만든 자료가 없다.</p></div>
  <h2>시스템 구성</h2>
  <div class="flow"><div><b>입력</b>권역 · 구역 · 구 이름</div><div><b>① 경계</b>지구단위계획구역(UQ161) − 도시계획도로(UQ151) = 가구(2,000 m² 이상), 상업지역(UQ111) 비율</div><div><b>② 건물</b>OpenStreetMap 건물 윤곽·층수 태그(Overpass API)</div><div><b>③ 배정·지표</b>건물 중심점 → 가구, 건물 수·건폐율·층수</div><div><b>④ 계산 엔진</b>건축물대장 결합 → EnergyPlus 자동 모델 → 개량 대안 → DB</div></div>
  <div id="gnote"></div>${note('② 건물 윤곽은 OpenStreetMap 기여자 자료(ODbL)로, 빠진 건물이나 층수 태그가 없는 건물이 있다. ④ 계산 엔진 단계(건축물대장 결합·EnergyPlus)는 이 페이지에서 실행하지 않으며, 내려받은 자료를 입력으로 쓴다. 지금 계산 엔진이 자동으로 돌아가는 범위는 역삼 257동 절차(자동 모델·실측 비교·개량 대안)이고, 다른 지역은 재계산 단계에서 이 자료로 확장한다.')}`;
  $('#gpre').addEventListener('change', () => { const k = $('#gpre').value; if (!k) return; GEN.sel = new Set(PRESET[k]); $('#gq').value = ''; genList(); });
  $('#gq').addEventListener('input', genList); $('#gcom').addEventListener('change', genList);
  $('#grun').addEventListener('click', genRun); $('#gclear').addEventListener('click', () => { GEN.sel.clear(); genList(); });
  GEN.map = L.map('gmap', { scrollWheelZoom: false }).setView([37.535, 126.99], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(GEN.map);
  genLoadPlans().then(() => { $('#gnote').innerHTML = note(`① 경계 자료: ${esc(GEN.src)}. ${esc(GEN.rule)}. 서울 지구단위계획구역 ${GEN.plans.length}개, 가구 ${GEN.plans.reduce((a, p) => a + p.n_blocks, 0)}개가 탑재되어 있다.`); genList(); });
}
function genList() {
  if (!GEN.plans) return;
  const s = ($('#gq').value || '').trim(), cm = +$('#gcom').value;
  let rows = GEN.plans.filter(p => p.commercial_pct >= cm && p.n_blocks > 0);
  if (s) rows = rows.filter(p => p.name.includes(s) || (p.gu_name || '').includes(s));
  else rows = rows.filter(p => GEN.sel.has(p.id));
  rows = rows.slice(0, 200);
  $('#glist').innerHTML = `<table class="tbl nw"><thead><tr><th></th><th>구역</th><th>구</th><th style="text-align:right">면적(ha)</th><th style="text-align:right">상업%</th><th style="text-align:right">가구</th></tr></thead><tbody>${rows.map(p => `<tr><td><input type="checkbox" data-id="${p.id}" ${GEN.sel.has(p.id) ? 'checked' : ''}></td><td>${esc(p.name)}${p.promotion && p.promotion.length ? ' <span class="tag kin">개발진흥지구</span>' : ''}</td><td>${esc(p.gu_name)}</td><td class="num">${num(p.area_ha, 1)}</td><td class="num">${num(p.commercial_pct, 0)}</td><td class="num">${p.n_blocks}</td></tr>`).join('') || '<tr><td colspan="6" class="small">검색어를 넣거나 권역을 고르세요.</td></tr>'}</tbody></table>`;
  $$('#glist input[type=checkbox]').forEach(c => c.addEventListener('change', () => { c.checked ? GEN.sel.add(c.dataset.id) : GEN.sel.delete(c.dataset.id); genSelInfo(); }));
  genSelInfo();
}
function genSelInfo() { const ps = GEN.plans.filter(p => GEN.sel.has(p.id)); $('#gselinfo').textContent = ps.length ? `선택 ${ps.length}개 구역 · 가구 ${ps.reduce((a, p) => a + p.n_blocks, 0)}개 · ${num(ps.reduce((a, p) => a + p.area_ha, 0), 1)} ha` : '선택한 구역 없음'; }
function step(t, cls = '', html = false) { GEN.log.push(`${new Date().toISOString()} ${t}`); const li = document.createElement('li'); if (html) li.innerHTML = t; else li.textContent = t; if (cls) li.className = cls; $('#gsteps').appendChild(li); return li; }

/* ---- 기하 도우미(경위도 → 국지 평면 m) ---- */
let LAT0 = 37.5;
const MX = lon => lon * 111320 * Math.cos(LAT0 * Math.PI / 180), MY = lat => lat * 110540;
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (MX(r[j][0]) + MX(r[i][0])) * (MY(r[j][1]) - MY(r[i][1])); return Math.abs(a / 2); }
function polyArea(rings) { return rings.length ? ringArea(rings[0]) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0) : 0; }
function inRing(pt, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c; } return c; }
function inPoly(pt, rings) { return rings.length && inRing(pt, rings[0]) && !rings.slice(1).some(h => inRing(pt, h)); }
function polysOf(geom) { return geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []; }
function centroid(r) { let x = 0, y = 0; const n = r.length - 1 || 1; for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; } return [x / n, y / n]; }

/* ---- 지역 자료 만들기(자료 생성기·실시간 시뮬레이션 공용) ----
   planIds: 지구단위계획구역 ID 목록. 반환: { plans, blocks(가구 GeoJSON 피처), all(범위 안 모든 건물), bld(가구 안 건물), used, bbox } */
async function genFetch(planIds, onStep = () => {}) {
  await genLoadPlans();
  const sel = new Set(planIds);
  const ps = GEN.plans.filter(p => sel.has(p.id));
  if (!ps.length) throw new Error('구역을 먼저 선택하세요.');
  if (ps.length > GEN_MAX_PLANS || ps.reduce((a, p) => a + p.area_ha, 0) > GEN_MAX_HA) throw new Error(`한 번에 ${GEN_MAX_PLANS}개 구역·${GEN_MAX_HA} ha까지만 만든다(OpenStreetMap 서버 부담). 선택을 줄여 주세요.`);
  const s1 = onStep('① 공식 가구 경계 불러오는 중…');
  const files = [...new Set(ps.map(p => p.gu))];
  const feats = [];
  for (const g of files) { const j = await (await fetch(`data/upis/blocks_${g}.geojson`)).json(); feats.push(...j.features.filter(f => sel.has(f.properties.plan_id))); }
  if (!feats.length) throw new Error('선택한 구역에 2,000 m² 이상인 가구가 없다.');
  let s = 90, w = 180, n = -90, e = -180;
  for (const f of feats) for (const poly of polysOf(f.geometry)) for (const [x, y] of poly[0]) { s = Math.min(s, y); n = Math.max(n, y); w = Math.min(w, x); e = Math.max(e, x); }
  LAT0 = (s + n) / 2;
  feats.forEach(f => { f.properties.area_m2_web = Math.round(polysOf(f.geometry).reduce((a, r) => a + polyArea(r), 0)); f.properties.bld = []; });
  if (s1) s1.textContent = `① 가구 ${feats.length}개 (${ps.length}개 구역)`;
  const s2 = onStep('② OpenStreetMap 건물 윤곽 받는 중… (수십 초 걸릴 수 있음)');
  const pad = 0.0015; const bb = `${(s - pad).toFixed(6)},${(w - pad).toFixed(6)},${(n + pad).toFixed(6)},${(e + pad).toFixed(6)}`;
  const ql = `[out:json][timeout:120];(way["building"](${bb});relation["building"]["type"="multipolygon"](${bb}););out tags geom;`;
  const { data, used } = await overpassQuery(ql, t => { if (s2) s2.textContent = '② ' + t; else onStep('② ' + t); }, 130000);
  const B = [];
  for (const el of data.elements) {
    let ring = null;
    if (el.type === 'way' && el.geometry && el.geometry.length > 3) ring = el.geometry.map(p => [p.lon, p.lat]);
    else if (el.type === 'relation' && el.members) { const o = el.members.find(m => m.role === 'outer' && m.geometry); if (o) ring = o.geometry.map(p => [p.lon, p.lat]); }
    if (!ring) continue;
    const t = el.tags || {}; const lv = parseFloat(t['building:levels']); const h = parseFloat(t.height);
    B.push({ id: `${el.type[0]}${el.id}`, ring, name: t.name || '', type: t.building, levels: Number.isFinite(lv) ? lv : null, height: Number.isFinite(h) ? h : null, area: ringArea(ring), c: centroid(ring) });
  }
  if (s2) s2.textContent = `② 건물 윤곽 ${B.length}동 (${used.split('/')[2]}, 가구 경계 바깥 150 m 포함)`;
  const s3 = onStep('③ 건물을 가구에 배정하는 중…');
  let assigned = 0;
  for (const b of B) { for (const f of feats) { if (polysOf(f.geometry).some(r => inPoly(b.c, r))) { f.properties.bld.push(b); b.block = `${f.properties.plan_id}-${f.properties.block}`; b.plan = f.properties.plan; assigned++; break; } } }
  if (s3) s3.textContent = `③ 가구 안 건물 ${assigned}동 (가구 밖 ${B.length - assigned}동은 주변 차폐용으로만 사용)`;
  for (const f of feats) {
    const bs = f.properties.bld, P = f.properties; const lv = bs.map(b => b.levels).filter(v => v != null);
    P.n_bld = bs.length; P.footprint_m2 = Math.round(bs.reduce((a, b) => a + b.area, 0)); P.coverage_pct = P.area_m2_web ? +(100 * P.footprint_m2 / P.area_m2_web).toFixed(1) : null;
    P.n_levels_tagged = lv.length; P.levels_mean = lv.length ? +(lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1) : null; P.levels_max = lv.length ? Math.max(...lv) : null;
    P.n_6f_plus = lv.filter(v => v >= 6).length; P.n_office_tag = bs.filter(b => ['office', 'commercial'].includes(b.type)).length;
    P.floor_area_est_m2 = lv.length ? Math.round(bs.filter(b => b.levels != null).reduce((a, b) => a + b.area * b.levels, 0)) : null;
  }
  return { plans: ps, blocks: feats, all: B, bld: B.filter(b => b.block), used, bbox: [s, w, n, e] };
}
async function genRun() {
  $('#gsteps').innerHTML = ''; GEN.log = []; $('#gout').innerHTML = '';
  $('#grun').disabled = true;
  try {
    const R = await genFetch([...GEN.sel], step);
    GEN.blocks = R.blocks; GEN.bld = R.bld; GEN.all = R.all; GEN.last = R;
    step(`④ 가구별 지표 계산 완료 · 층수 태그가 있는 건물 ${GEN.bld.filter(b => b.levels != null).length}/${GEN.bld.length}동`);
    genDraw(); genTable(R.plans, R.used);
    step('⑤ 아래에서 결과를 내려받거나, <a href="#/live">실시간 시뮬레이션</a>에서 이 지역을 바로 돌려 볼 수 있다.', 'neg', true);
  } catch (x) { step('오류: ' + x.message, 'pos'); }
  $('#grun').disabled = false;
}
function covColor(v) { if (v == null) return '#ccc'; const t = Math.max(0, Math.min(1, v / 70)); const a = [246, 211, 191], b = [176, 57, 26]; return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`; }
function genDraw() {
  if (GEN.layer) GEN.layer.remove();
  GEN.layer = L.layerGroup().addTo(GEN.map);
  const gj = L.geoJSON({ type: 'FeatureCollection', features: GEN.blocks }, { style: f => ({ color: '#1E2A38', weight: 1, fillColor: covColor(f.properties.coverage_pct), fillOpacity: .7 }), onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties.plan)} 가구 ${f.properties.block}<br>건물 ${f.properties.n_bld}동 · 건폐율 ${f.properties.coverage_pct ?? '—'}%`) }).addTo(GEN.layer);
  for (const b of GEN.bld) L.polygon(b.ring.map(([x, y]) => [y, x]), { color: '#333', weight: .5, fill: false }).addTo(GEN.layer);
  GEN.map.fitBounds(gj.getBounds(), { padding: [10, 10] });
}
function genTable(ps, used) {
  const rows = GEN.blocks.map(f => f.properties);
  const tot = k => rows.reduce((a, r) => a + (r[k] || 0), 0);
  $('#gout').innerHTML = `<div class="grid g4" style="margin-bottom:12px"><div class="card stat"><b>${rows.length}</b><span>가구</span></div><div class="card stat"><b>${num(tot('n_bld'))}</b><span>건물(OpenStreetMap)</span></div><div class="card stat"><b>${num(tot('n_6f_plus'))}</b><span>6층 이상(층수 태그 기준)</span></div><div class="card stat"><b>${num(tot('area_m2_web') / 1e4, 1)} ha</b><span>가구 면적</span></div></div>
  <p><button class="btn" id="dl1">가구 GeoJSON</button> <button class="btn ghost" id="dl2">가구 CSV</button> <button class="btn ghost" id="dl3">건물 CSV</button> <button class="btn ghost" id="dl4">작업 기록(JSON)</button></p>` +
    table([{ h: '구역', k: 'plan' }, { h: '가구', k: 'block' }, { h: '면적(m²)', k: 'area_m2_web', num: 1, f: v => num(v) }, { h: '상업%', k: 'commercial_pct', num: 1, f: v => num(v, 0) }, { h: '건물', k: 'n_bld', num: 1 }, { h: '건폐율%', k: 'coverage_pct', num: 1, f: v => v == null ? '—' : num(v, 1) }, { h: '층수 태그', k: 'n_levels_tagged', num: 1 }, { h: '평균 층수', k: 'levels_mean', num: 1, f: v => v == null ? '—' : num(v, 1) }, { h: '최고 층수', k: 'levels_max', num: 1, f: v => v ?? '—' }, { h: '6층 이상', k: 'n_6f_plus', num: 1 }], rows, { nw: 1, maxh: 460 }) +
    note('건폐율은 OpenStreetMap 건물 윤곽 면적 합을 가구 면적으로 나눈 값이다. 층수는 OpenStreetMap에 층수 태그가 있는 건물만 반영되므로, 계산 엔진 단계에서 건축물대장(층수·연면적·용도)으로 바꾼다.');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const save = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const csv = (cols, rs) => '﻿' + cols.join(',') + '\n' + rs.map(r => cols.map(c => { const v = r[c]; return v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v; }).join(',')).join('\n');
  const bcols = ['plan_id', 'plan', 'block', 'area_m2_web', 'commercial_pct', 'n_bld', 'footprint_m2', 'coverage_pct', 'n_levels_tagged', 'levels_mean', 'levels_max', 'n_6f_plus', 'n_office_tag', 'floor_area_est_m2'];
  $('#dl1').onclick = () => save(`blocks_${stamp}.geojson`, JSON.stringify({ type: 'FeatureCollection', features: GEN.blocks.map(f => ({ type: 'Feature', geometry: f.geometry, properties: Object.fromEntries(bcols.map(c => [c, f.properties[c]])) })) }), 'application/geo+json');
  $('#dl2').onclick = () => save(`blocks_${stamp}.csv`, csv(bcols, rows), 'text/csv');
  $('#dl3').onclick = () => save(`buildings_${stamp}.csv`, csv(['id', 'block', 'plan', 'name', 'type', 'levels', 'height', 'area', 'lon', 'lat'], GEN.bld.map(b => ({ ...b, area: Math.round(b.area), lon: b.c[0].toFixed(6), lat: b.c[1].toFixed(6) }))), 'text/csv');
  $('#dl4').onclick = () => save(`manifest_${stamp}.json`, JSON.stringify({ created: new Date().toISOString(), plans: ps.map(p => ({ id: p.id, name: p.name, notice: p.notice })), boundary_source: GEN.src, block_rule: GEN.rule, buildings_source: 'OpenStreetMap contributors (ODbL) via ' + used, n_blocks: rows.length, n_buildings: GEN.bld.length, log: GEN.log }, null, 1), 'application/json');
}
