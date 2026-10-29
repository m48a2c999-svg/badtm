/* =====================================================================
   실시간 시뮬레이션(간이) — 지도 위에서 태양·그림자·키네틱 파사드 작동을 시간에 따라 움직여 본다.
   · 태양 위치: NOAA 태양 위치 계산식(서울 표준시 UTC+9)
   · 외피 일사: ASHRAE 맑은 날 모델(월별 A·B·C 계수) — 직달 + 천공 확산(수직면 1/2) + 지면 반사(반사율 0.2)
   · 주변 차폐: 건물 윤곽 × 높이로, 입면 중앙(높이 1/2) 점에서 태양 방향으로 가린 건물이 있는지 판정
   · 작동 규칙: 원고 표 2의 작동 기준(일사량 기준 제어는 5~9월 창면 일사량 300 W/m², 컷오프 각도 제어, 평일 13~18시 폐쇄)을 간이하게 적용
   · 에너지: 역삼 257동만 EnergyPlus 23.2 시간별 결과(block_257_hourly)를 함께 보여 준다.
   이 페이지의 일사·작동 값은 맑은 날 가정의 간이 계산이며 EnergyPlus 계산 값이 아니다.
   ===================================================================== */
const LIVE = { loadReq: 0, map: null, canvas: null, R: null, t: 12 * 60, play: false, speed: 30, rule: 'BT_T300', mode: 'state', hDef: 12, date: null, slots: null, busy: false, sel: null, last: 0, job: 0 };
const LRULE = {   // 9개 대안 — 원고 표 2와 같은 작동 규칙(일사량 기준 제어만 5~9월), ep = 257동 EnergyPlus 시간별 결과의 시나리오 이름
  F0: { name: '블라인드 고정', kind: 'fixed', ep: 'F0', txt: '슬랫 수평으로 항상 창 앞(움직이지 않음)' },
  LH_F0: { name: '수평 루버 고정', kind: 'fixed', ep: 'LH_F0', txt: '수평 루버(300 mm)가 항상 창 앞(움직이지 않음)' },
  VF_F0: { name: '수직 루버 고정', kind: 'fixed', ep: 'VF_F0', txt: '동·서 입면 수직 루버(움직이지 않음)' },
  S3: { name: '블라인드 컷오프 각도 제어', kind: 'track', ep: 'S3', txt: '입면에 직달일사가 들면 직달일사를 막는 각도(컷오프 각도)로 슬랫을 조절, 아니면 수평' },
  LH_C: { name: '수평 루버 컷오프 각도 제어', kind: 'track', ep: 'LH_C', txt: '같은 방식의 컷오프 각도 제어(수평 루버)' },
  VF_C: { name: '수직 루버 컷오프 각도 제어', kind: 'track', ep: 'VF_C', txt: '같은 방식의 컷오프 각도 제어(동·서 수직 루버). 간이 계산의 작동 비율은 모든 입면의 직달일사 비율로 표시' },
  BT_T300: { name: '블라인드 일사량 기준 제어', kind: 'thresh', ep: 'BT_T300', txt: '냉방기(5~9월)에 창면 입사 일사량 300 W/m² 초과 시 내림, 그 밖과 난방기(10~4월)에는 걷어 올림' },
  LT_T300: { name: '수평 루버 일사량 기준 제어', kind: 'thresh', ep: 'LT_T300', txt: '냉방기(5~9월)에 창면 입사 일사량 300 W/m² 초과 시 컷오프 각도, 그 밖과 난방기(10~4월)에는 수평' },
  PK: { name: '피크 시간대 차양 폐쇄', kind: 'peak', ep: 'PK', txt: '연중 평일 13~18시 슬랫 폐쇄, 그 밖에는 수평(요일은 EnergyPlus 계산과 같은 2023년 달력 기준)' },
};
// ASHRAE 맑은 날 모델 월별 계수(A: W/m², B: 무차원, C: 확산 계수)
const ASH = { A: [1230, 1215, 1186, 1136, 1104, 1088, 1085, 1107, 1151, 1192, 1221, 1233], B: [.142, .144, .156, .180, .196, .205, .207, .201, .177, .160, .149, .142], C: [.058, .060, .071, .097, .121, .134, .136, .122, .092, .073, .063, .057] };
const D2R = Math.PI / 180;

/* ---------- 태양 위치(NOAA) ---------- */
function sunPos(ymd, minLocal, lat, lon) {
  const [Y, M, D] = ymd; const tz = 9;
  const a = Math.floor((14 - M) / 12), y = Y + 4800 - a, m = M + 12 * a - 3;
  const jdn = D + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  const jd = jdn - 0.5 + (minLocal - tz * 60) / 1440;
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const Mn = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(Mn * D2R) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mn * D2R) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mn * D2R) * 0.000289;
  const lam = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * T) * D2R);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos((125.04 - 1934.136 * T) * D2R);
  const dec = Math.asin(Math.sin(eps * D2R) * Math.sin(lam * D2R));
  const yv = Math.tan(eps * D2R / 2) ** 2;
  const eqt = 4 / D2R * (yv * Math.sin(2 * L0 * D2R) - 2 * e * Math.sin(Mn * D2R) + 4 * e * yv * Math.sin(Mn * D2R) * Math.cos(2 * L0 * D2R) - 0.5 * yv * yv * Math.sin(4 * L0 * D2R) - 1.25 * e * e * Math.sin(2 * Mn * D2R));
  const tst = minLocal + eqt + 4 * lon - 60 * tz;
  const ha = (tst / 4 - 180) * D2R, la = lat * D2R;
  const cz = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cz)));
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(la) * Math.cos(zen) - Math.sin(dec)) / (Math.cos(la) * Math.sin(zen))))) / D2R;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { alt: 90 - zen / D2R, az };
}
function clearSky(alt, month) { if (alt <= 0) return { dn: 0, dh: 0 }; const A = ASH.A[month - 1], B = ASH.B[month - 1], C = ASH.C[month - 1]; const dn = A * Math.exp(-B / Math.sin(alt * D2R)); return { dn, dh: C * dn }; }

/* ---------- 지역 준비: 건물 → 국지 평면(m), 입면, 격자 ---------- */
function liveBuildRegion(src) {
  // src: { name, targets:[{id,name,ring:[[lon,lat]..],h,hsrc,block,sim?}], obstacles:[...같은 형식], blocks?: GeoJSON 피처, ep?: true }
  const all = [...src.targets.map(b => ({ ...b, tgt: 1 })), ...src.obstacles.map(b => ({ ...b, tgt: 0 }))];
  let la = 0, lo = 0; for (const b of src.targets) { la += b.c[1]; lo += b.c[0]; } la /= src.targets.length; lo /= src.targets.length;
  const kx = 111320 * Math.cos(la * D2R), ky = 110540;
  const toXY = ([x, y]) => [(x - lo) * kx, (y - la) * ky];
  let Hmax = 0;
  for (const b of all) {
    const P = b.ring.map(toXY); if (P.length > 1 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1]) P.pop();
    let A = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) A += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]);
    const ccw = A < 0; // 위 식은 시계 방향일 때 양수
    b.P = P; b.area = Math.abs(A / 2);
    b.bb = [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
    Hmax = Math.max(Hmax, b.h);
    if (b.tgt) {
      b.F = [];
      // 짧은 변(곡선 윤곽)은 이어 붙여 현 길이 3 m 이상의 입면으로 만든다
      const seg = []; let st = 0;
      for (let i = 1; i <= P.length; i++) { const e = P[i % P.length]; if (Math.hypot(e[0] - P[st][0], e[1] - P[st][1]) >= 3 || i === P.length) { seg.push([P[st], e]); st = i % P.length; } }
      for (const [p, q2] of seg) {
        const dx = q2[0] - p[0], dy = q2[1] - p[1]; const len = Math.hypot(dx, dy); if (len < 1) continue;
        let nx = dy / len, ny = -dx / len; if (!ccw) { nx = -nx; ny = -ny; }
        b.F.push({ len, nx, ny, naz: (Math.atan2(nx, ny) / D2R + 360) % 360, mx: (p[0] + q2[0]) / 2 + nx * 0.3, my: (p[1] + q2[1]) / 2 + ny * 0.3 });
      }
      b.Flen = b.F.reduce((a, f) => a + f.len, 0) || 1;
    }
  }
  // 격자(50 m)
  const G = new Map(), CS = 50; const key = (i, j) => i * 100003 + j;
  all.forEach((b, k) => { for (let i = Math.floor(b.bb[0] / CS); i <= Math.floor(b.bb[2] / CS); i++) for (let j = Math.floor(b.bb[1] / CS); j <= Math.floor(b.bb[3] / CS); j++) { const kk = key(i, j); if (!G.has(kk)) G.set(kk, []); G.get(kk).push(k); } });
  return { ...src, all, tg: all.filter(b => b.tgt), la, lo, kx, ky, Hmax, G, CS, key, ray: 0, mark: new Int32Array(all.length) };
}
function segHitsPoly(x0, y0, x1, y1, P) {
  // 선분이 다각형 안에서 시작하거나 변과 교차하면 참
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if (((yi > y0) !== (yj > y0)) && (x0 < (xj - xi) * (y0 - yi) / (yj - yi) + xi)) inside = !inside;
    const d = (x1 - x0) * (yj - yi) - (y1 - y0) * (xj - xi); if (Math.abs(d) < 1e-12) continue;
    const t = ((xi - x0) * (yj - yi) - (yi - y0) * (xj - xi)) / d, u = ((xi - x0) * (y1 - y0) - (yi - y0) * (x1 - x0)) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return inside;
}
function shadedAt(R, self, x, y, z, ux, uy, tanA) {
  const reach = Math.min(1500, Math.max(0, (R.Hmax - z) / tanA)); if (reach <= 0) return false;
  const stamp = ++R.ray; const CS = R.CS;
  // 격자 칸을 빠짐없이 따라가는 DDA(Amanatides–Woo)
  let i = Math.floor(x / CS), j = Math.floor(y / CS); const si = ux > 0 ? 1 : -1, sj = uy > 0 ? 1 : -1;
  const tdx = Math.abs(ux) > 1e-12 ? CS / Math.abs(ux) : Infinity, tdy = Math.abs(uy) > 1e-12 ? CS / Math.abs(uy) : Infinity;
  let tmx = Math.abs(ux) > 1e-12 ? ((ux > 0 ? (i + 1) * CS - x : x - i * CS) / Math.abs(ux)) : Infinity, tmy = Math.abs(uy) > 1e-12 ? ((uy > 0 ? (j + 1) * CS - y : y - j * CS) / Math.abs(uy)) : Infinity;
  for (let t = 0; t <= reach; ) {
    const cell = R.G.get(R.key(i, j));
    if (cell) for (const k of cell) {
      if (R.mark[k] === stamp) continue; R.mark[k] = stamp; const n = R.all[k]; if (n === self || n.h <= z) continue;
      const L = Math.min(1500, (n.h - z) / tanA);
      if (n.bb[0] > Math.max(x, x + ux * L) || n.bb[2] < Math.min(x, x + ux * L) || n.bb[1] > Math.max(y, y + uy * L) || n.bb[3] < Math.min(y, y + uy * L)) continue;
      if (segHitsPoly(x, y, x + ux * L, y + uy * L, n.P)) return true;
    }
    if (tmx < tmy) { t = tmx; tmx += tdx; i += si; } else { t = tmy; tmy += tdy; j += sj; }
  }
  return false;
}
/* 한 시각(분)의 건물별 상태 계산 → Float32Array(nB×5): [평균 일사, 직사 입면 비율, 일사 300 초과 비율, 직달 평균, 차폐로 가려진 직사 입면 비율] */
function liveSlot(R, ymd, minute) {
  const sp = sunPos(ymd, minute, R.la, R.lo); const cs = clearSky(sp.alt, ymd[1]);
  const out = new Float32Array(R.tg.length * 5);
  const ux = Math.sin(sp.az * D2R), uy = Math.cos(sp.az * D2R), tanA = Math.tan(Math.max(sp.alt, 0.5) * D2R), ca = Math.cos(sp.alt * D2R);
  const diffV = cs.dh * 0.5, grd = 0.2 * (cs.dn * Math.sin(Math.max(sp.alt, 0) * D2R) + cs.dh) * 0.5;
  R.tg.forEach((b, i) => {
    let Isum = 0, lit = 0, hi = 0, dir = 0, blk = 0;
    for (const f of b.F) {
      let Ib = 0; const cosT = ca * Math.cos((sp.az - f.naz) * D2R);
      if (sp.alt > 0 && cosT > 0) { if (shadedAt(R, b, f.mx, f.my, b.h / 2, ux, uy, tanA)) blk += f.len; else { Ib = cs.dn * cosT; lit += f.len; } }
      const I = Ib + diffV + grd; Isum += I * f.len; dir += Ib * f.len; if (I > 300) hi += f.len;
    }
    const o = i * 5; out[o] = Isum / b.Flen; out[o + 1] = lit / b.Flen; out[o + 2] = hi / b.Flen; out[o + 3] = dir / b.Flen; out[o + 4] = blk / b.Flen;
  });
  return { sp, cs, v: out };
}
// 원고 표 2: 일사량 기준 제어는 냉방기(5~9월), 나머지는 연중 작동(2026-10-27). 피크 시간대 차양 폐쇄는 평일 13~18시.
// 요일은 EnergyPlus 계산 연도(2023년 달력, 1월 1일 일요일) 기준으로 판정하여 EnergyPlus 시간별 전력과 맞춘다.
const isCooling = () => { const [, M] = LIVE.ymd || ymdOf(LIVE.date); return M >= 5 && M <= 9; };   // 일사량 기준 제어는 냉방기(5~9월)에만 작동(2026-10-27)
const isPeakTime = (minute = LIVE.t) => { const [, M, D] = LIVE.ymd || ymdOf(LIVE.date); const wd = new Date(Date.UTC(2023, M - 1, D)).getUTCDay(); const h = minute / 60; return wd >= 1 && wd <= 5 && h >= 13 && h < 18; };
function moveFrac(rule, v, o, minute = LIVE.t) { const k = LRULE[rule].kind; return k === 'thresh' ? (isCooling() ? v[o + 2] : 0) : k === 'track' ? v[o + 1] : k === 'peak' ? (isPeakTime(minute) ? 1 : 0) : 0; }

/* ---------- 지역 불러오기 ---------- */
function ringOfDb(poly) { const p = JSON.parse(poly); return p.map(([la, lo]) => [lo, la]); }
async function liveLoadYeoksam(msg) {
  const B = q('SELECT sim_name, name, block, height_m, floors, polygon, lat, lon FROM buildings');
  const targets = B.map(b => ({ id: b.sim_name, name: b.name || b.sim_name, ring: ringOfDb(b.polygon), h: b.height_m, hsrc: '모델 높이', block: b.block, sim: b.sim_name, c: [b.lon, b.lat] }));
  let obstacles = [], note2 = '';
  try {
    msg('주변 건물(OpenStreetMap) 불러오는 중…');
    let s = 90, w = 180, n = -90, e = -180; for (const t of targets) for (const [x, y] of t.ring) { s = Math.min(s, y); n = Math.max(n, y); w = Math.min(w, x); e = Math.max(e, x); }
    const pad = 0.003, bb = `${(s - pad).toFixed(6)},${(w - pad).toFixed(6)},${(n + pad).toFixed(6)},${(e + pad).toFixed(6)}`;
    const ql = `[out:json][timeout:60];(way["building"](${bb}););out tags geom;`;
    const { data } = await overpassQuery(ql, t => msg('주변 건물: ' + t), 70000);
    for (const el of data.elements) {
      if (!el.geometry || el.geometry.length < 4) continue; const ring = el.geometry.map(p => [p.lon, p.lat]); const c = centroid(ring);
      if (targets.some(t => inRing(c, t.ring) || inRing(t.c, ring) || t.ring.some(p => inRing(p, ring)))) continue;
      const hh = liveHeight(el.tags || {}); obstacles.push({ id: 'w' + el.id, name: (el.tags || {}).name || '', ring, h: hh.h, hsrc: hh.src, noH: !!hh.noH, c });
    }
    note2 = `주변 건물 ${obstacles.length}동(OpenStreetMap)을 차폐에 포함.`;
  } catch (x) { note2 = '주변 건물(OpenStreetMap)을 불러오지 못해 257동끼리의 차폐만 반영.'; }
  return { name: '역삼역 일대 257동', targets, obstacles, ep: true, note: note2 };
}
function liveHeight(t) {
  const h = parseFloat(t.height), lv = parseFloat(t['building:levels']);
  if (Number.isFinite(h) && h > 0) return { h, src: 'OSM 높이' };
  if (Number.isFinite(lv) && lv > 0) return { h: lv * 3.5, src: 'OSM 층수 × 3.5 m' };
  return { h: LIVE.hDef, src: `층수 정보 없음 → ${LIVE.hDef} m 가정`, noH: true };
}
async function liveLoadPlans(ids, label, msg) {
  const R = await genFetch(ids, t => { msg(t); return null; });
  const conv = b => { const hh = b.height ? { h: b.height, src: 'OSM 높이' } : b.levels ? { h: b.levels * 3.5, src: 'OSM 층수 × 3.5 m' } : { h: LIVE.hDef, src: `층수 정보 없음 → ${LIVE.hDef} m 가정`, noH: true }; return { id: b.id, name: b.name, ring: b.ring, h: hh.h, hsrc: hh.src, noH: !!hh.noH, block: b.block ? b.block.split('-').pop() : '', plan: b.plan || '', c: b.c, levels: b.levels }; };
  const targets = R.bld.map(conv), obstacles = R.all.filter(b => !b.block).map(conv);
  if (!targets.length) throw new Error('가구 안 건물이 없다.');
  const nh = targets.filter(t => t.noH).length;
  return { name: label, targets, obstacles, blocks: R.blocks, ep: false, note: `가구 ${R.blocks.length}개 · 가구 안 건물 ${targets.length}동 · 주변 차폐용 건물 ${obstacles.length}동. 높이·층수 정보가 없는 건물 ${nh}동(${Math.round(100 * nh / targets.length)}%)은 ${LIVE.hDef} m로 가정.` };
}

/* ---------- 페이지 ---------- */
function pageLive() {
  const peakH = q1("SELECT peak_hour FROM block_257 WHERE scenario='S1'").peak_hour ?? 5080;
  const pk = new Date(Date.UTC(2026, 0, 1) + Math.floor(peakH / 24) * 864e5); LIVE.peakDate = pk.toISOString().slice(0, 10); LIVE.peakHour = peakH % 24;
  LIVE.date = LIVE.peakDate;
  const regionOpts = [['yeoksam', '역삼 257동 — EnergyPlus 결과 연동'], ...Object.keys(PRESET).map(k => ['p:' + k, k + ' 권역(가구 안 전체 건물)']), ['gen', '자료 생성기에서 만든 지역']];
  $('#page-live').innerHTML = `
  <div class="kicker">연구 시스템 · 실시간 시뮬레이션</div><h1>지도 위에서 태양·그림자·키네틱 파사드를 움직여 본다</h1>
  <p>지역을 고르고 날짜와 성능 개선 대안을 정하면, 시간에 따라 태양 위치와 건물 그림자, 입면이 받는 일사, 키네틱 파사드의 작동 상태가 지도 위에서 움직인다. 다른 지역(권역·구역 이름)을 넣으면 그 지역의 가구·건물 자료를 바로 만들어 같은 계산을 하고, 결과를 CSV로 내려받을 수 있다. <b>역삼 257동</b>을 고르면 같은 날의 EnergyPlus 시간별 전력 결과가 함께 움직인다.</p>
  <div class="live-grid">
    <div class="card live-ctrl">
      <h3>① 지역</h3>
      <div class="ctrl"><label style="flex:1">지역<select id="lreg">${regionOpts.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></label></div>
      <div class="ctrl"><label style="flex:1">또는 구역·구 이름<input type="search" id="lq" placeholder="예: 여의도, 테헤란로, 마곡, 용산" list="lqlist"></label><datalist id="lqlist"></datalist><button class="btn ghost" id="lqgo">불러오기</button></div>
      <div class="ctrl"><label>높이 정보 없는 건물<select id="lhdef"><option value="12">12 m(약 3~4층)</option><option value="20">20 m(약 6층)</option><option value="35">35 m(약 10층)</option></select></label></div>
      <p class="small" id="lmsg">지역을 불러오는 중…</p>
      <h3>② 날짜·대안</h3>
      <div class="ctrl"><label>날짜<input type="date" id="ldate" value="${LIVE.date}" min="2026-01-01" max="2026-12-31"></label></div>
      <div class="chips" id="ldays">
        <button data-d="${LIVE.peakDate}">257동 연간 피크전력일</button><button data-d="2026-06-21">하지</button><button data-d="2026-03-20">춘분</button><button data-d="2026-09-23">추분</button><button data-d="2026-12-21">동지</button></div>
      <div class="ctrl"><label style="flex:1">성능 개선안(작동 규칙)<select id="lrule">${Object.entries(LRULE).map(([k, r]) => `<option value="${k}"${k === LIVE.rule ? ' selected' : ''}>${r.kind === 'fixed' ? '고정형 · ' : '키네틱 · '}${esc(r.name)}</option>`).join('')}</select></label></div>
      <p class="small" id="lruletxt"></p>
      <div class="ctrl"><label>지도 색<select id="lmode"><option value="state">작동 상태</option><option value="irr">입면 평균 일사(W/m²)</option><option value="shade">주변 건물에 가려진 직사 입면 비율</option></select></label></div>
      <h3>③ 시간</h3>
      <div class="timebar"><button class="btn sun" id="lplay">▶ 재생</button><b id="lclock" class="mono">12:00</b><select id="lspeed"><option value="10">10분/초</option><option value="30" selected>30분/초</option><option value="60">60분/초</option></select></div>
      <input type="range" id="ltime" min="0" max="1430" step="10" value="720" style="width:100%">
      <div id="lsun" class="small mono"></div>
      <h3>④ 내려받기</h3>
      <p><button class="btn ghost" id="ldl1">건물별 시간별 CSV</button> <button class="btn ghost" id="ldl2">지역 하루 요약 CSV</button></p>
    </div>
    <div class="live-main">
      <div id="lmapwrap" style="position:relative"><div id="lmap" style="height:520px;border:1px solid var(--line)"></div><canvas id="lcanvas" style="position:absolute;inset:0;pointer-events:none;z-index:450"></canvas><div id="lcomp" class="lcomp"></div></div>
      <div id="lleg" class="maplegend" style="margin-top:6px"></div>
      <div class="grid g4" id="lstats" style="margin:12px 0"></div>
      <div id="lchart"></div><div id="lchart2"></div>
      <div id="lbinfo"></div>
    </div>
  </div>
  ${note('이 페이지의 일사·그림자·작동 상태는 <b>맑은 날 가정의 간이 계산</b>(태양 위치 NOAA 식, ASHRAE 맑은 날 일사 모델, 건물 윤곽 × 높이 차폐)으로 브라우저에서 바로 계산한 값이며, EnergyPlus 계산 값이 아니다. 입면 일사는 건물 입면마다 중앙(높이 1/2) 한 점에서 판정한 길이 가중 평균이다. 에너지(전력) 곡선은 역삼 257동의 EnergyPlus 23.2 시간별 결과(서울 TMYx 실제 기상)이므로, 구름이 있는 날은 맑은 날 일사와 맞지 않을 수 있다. 다른 지역의 에너지 성능은 2027년 1~3월에 EnergyPlus로 계산한다.')}`;
  // 지도
  LIVE.map = L.map('lmap', { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false }).setView([37.5005, 127.0365], 16);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap contributors © CARTO' }).addTo(LIVE.map);
  LIVE.canvas = $('#lcanvas');
  LIVE.map.on('move zoom resize viewreset', liveDraw);
  LIVE.map.on('click', liveClick);
  // 이벤트
  $('#lreg').addEventListener('change', () => liveLoad($('#lreg').value));
  $('#lqgo').addEventListener('click', () => liveLoad('q:' + $('#lq').value.trim()));
  $('#lq').addEventListener('keydown', e => { if (e.key === 'Enter') liveLoad('q:' + $('#lq').value.trim()); });
  $('#lhdef').addEventListener('change', () => { LIVE.hDef = +$('#lhdef').value; if (!LIVE.src) return; const fix = b => { if (b.noH) { b.h = LIVE.hDef; b.hsrc = `층수 정보 없음 → ${LIVE.hDef} m 가정`; } }; LIVE.src.targets.forEach(fix); LIVE.src.obstacles.forEach(fix); LIVE.src.note = (LIVE.src.note || '').replace(/\d+ m로 가정/, LIVE.hDef + ' m로 가정'); LIVE.R = liveBuildRegion(LIVE.src); LIVE.sel = null; liveDay(); });
  $('#ldate').addEventListener('change', () => { LIVE.date = $('#ldate').value || LIVE.peakDate; liveDay(); });
  $$('#ldays button').forEach(b => b.addEventListener('click', () => { $('#ldate').value = b.dataset.d; LIVE.date = b.dataset.d; liveDay(); }));
  $('#lrule').addEventListener('change', () => { LIVE.rule = $('#lrule').value; liveRuleTxt(); liveCharts(); liveDraw(); liveStats(); });
  $('#lmode').addEventListener('change', () => { LIVE.mode = $('#lmode').value; liveDraw(); liveLegend(); });
  $('#ltime').addEventListener('input', () => { LIVE.t = +$('#ltime').value; liveTick(); });
  $('#lplay').addEventListener('click', () => { LIVE.play = !LIVE.play; $('#lplay').textContent = LIVE.play ? '❚❚ 멈춤' : '▶ 재생'; if (LIVE.play) { LIVE.last = performance.now(); requestAnimationFrame(liveAnim); } });
  $('#lspeed').addEventListener('change', () => { LIVE.speed = +$('#lspeed').value; });
  $('#ldl1').addEventListener('click', liveCsvBld); $('#ldl2').addEventListener('click', liveCsvDay);
  genLoadPlans().then(() => { $('#lqlist').innerHTML = [...new Set(GEN.plans.filter(p => p.n_blocks > 0 && p.commercial_pct >= 50).map(p => p.name))].slice(0, 400).map(n => `<option value="${esc(n)}">`).join(''); });
  liveRuleTxt(); liveLegend();
  LIVE.t = LIVE.peakHour * 60 + 30; $('#ltime').value = LIVE.t;
  liveLoad('yeoksam');
}
function liveRuleTxt() { const r = LRULE[LIVE.rule]; $('#lruletxt').innerHTML = `${esc(r.txt)}.${r.ep ? '' : ' <span class="tag mut">257동 EnergyPlus 결과 없음(상세 3개 동만 계산)</span>'}`; }
function liveMsg(t) { const el = $('#lmsg'); if (el) el.innerHTML = t; }
async function liveLoad(key) {
  const req = ++LIVE.loadReq; LIVE.job++; LIVE.slots = null;
  try {
    let src;
    if (key === 'yeoksam') src = await liveLoadYeoksam(liveMsg);
    else if (key.startsWith('p:')) src = await liveLoadPlans(PRESET[key.slice(2)], key.slice(2) + ' 권역', liveMsg);
    else if (key === 'gen') {
      if (!GEN.last) throw new Error('자료 생성기에서 아직 만든 지역이 없다. <a href="#/gen">자료 생성기</a>에서 먼저 만들거나 위에 구역·구 이름을 넣어 주세요.');
      src = await liveLoadPlans(GEN.last.plans.map(p => p.id), '자료 생성기 지역', liveMsg);
    } else if (key.startsWith('q:')) {
      const s = key.slice(2); if (!s) throw new Error('구역·구 이름을 넣어 주세요.');
      await genLoadPlans();
      let ps = GEN.plans.filter(p => p.n_blocks > 0 && (p.name.includes(s) || (p.gu_name || '').includes(s)));
      if (!ps.length) throw new Error(`"${esc(s)}"에 맞는 지구단위계획구역이 없다.`);
      ps.sort((a, b) => b.commercial_pct - a.commercial_pct || b.area_ha - a.area_ha);
      const pick = []; let ha = 0; for (const p of ps) { if (pick.length >= 12 || ha + p.area_ha > 300) break; pick.push(p); ha += p.area_ha; }
      if (!pick.length) pick.push(ps[0]);
      src = await liveLoadPlans(pick.map(p => p.id), `"${s}" 검색 구역 ${pick.length}개`, liveMsg);
      src.note += ` 검색에 맞는 구역 ${ps.length}개 중 상업지역 비율이 높은 ${pick.length}개(${num(ha, 1)} ha)를 사용.`;
    }
    if (req !== LIVE.loadReq) return; // 그 사이 다른 지역을 고름
    LIVE.src = src; LIVE.srcKey = key; LIVE.R = liveBuildRegion(src); LIVE.sel = null; $('#lbinfo').innerHTML = '';
    liveMsg(`<b>${esc(src.name)}</b> — 계산 대상 ${num(LIVE.R.tg.length)}동. ${esc(src.note || '')}`);
    if (LIVE.blkLayer) LIVE.blkLayer.remove();
    if (src.blocks) LIVE.blkLayer = L.geoJSON({ type: 'FeatureCollection', features: src.blocks }, { style: { color: '#1E2A38', weight: 1, dashArray: '4 3', fill: false }, interactive: false }).addTo(LIVE.map);
    const lls = LIVE.R.tg.flatMap(b => b.ring.map(([x, y]) => [y, x])); LIVE.map.fitBounds(L.latLngBounds(lls), { padding: [12, 12] });
    await liveDay();
  } catch (x) { if (req === LIVE.loadReq) liveMsg('<span class="pos">' + (x.message || x) + '</span>'); }
}
function ymdOf(s) { const [Y, M, D] = s.split('-').map(Number); return [Y, M, D]; }
async function liveDay() {
  if (!LIVE.R) return; const R = LIVE.R, ymd = ymdOf(LIVE.date), job = ++LIVE.job;
  LIVE.slots = new Array(144).fill(null); LIVE.ymd = ymd;
  // 현재 시각부터 먼저 계산해 바로 보이게 한 뒤 하루 전체를 나누어 계산
  const cur = Math.min(143, Math.round(LIVE.t / 10)); LIVE.slots[cur] = liveSlot(R, ymd, cur * 10); liveTick();
  const t0 = performance.now(); let done = 1;
  let tb = performance.now();
  for (let k = 0; k < 144; k++) {
    if (job !== LIVE.job) return;
    if (!LIVE.slots[k]) { LIVE.slots[k] = liveSlot(R, ymd, k * 10); done++; }
    if (performance.now() - tb > 40) { liveMsg(`<b>${esc(LIVE.src.name)}</b> — 하루 계산 중 ${Math.round(100 * done / 144)}%`); await new Promise(r => setTimeout(r, 0)); tb = performance.now(); }
  }
  if (job !== LIVE.job) return;
  const dt = (performance.now() - t0) / 1000;
  liveMsg(`<b>${esc(LIVE.src.name)}</b> — 계산 대상 ${num(R.tg.length)}동 · 하루 144개 시각(10분 간격) 계산 ${dt.toFixed(1)}초. ${esc(LIVE.src.note || '')}`);
  liveCharts(); liveTick();
}
function liveCur() { if (!LIVE.slots) return null; const k = Math.min(143, Math.round(LIVE.t / 10)); if (!LIVE.slots[k]) LIVE.slots[k] = liveSlot(LIVE.R, LIVE.ymd, k * 10); return LIVE.slots[k]; }
function liveAnim(now) {
  if (!LIVE.play) return;
  const dt = (now - LIVE.last) / 1000; LIVE.last = now;
  LIVE.t = (LIVE.t + dt * LIVE.speed) % 1440; $('#ltime').value = Math.floor(LIVE.t / 10) * 10; liveTick(true);
  requestAnimationFrame(liveAnim);
}
function liveTick() {
  if (!LIVE.R) return; const m = Math.floor(LIVE.t); $('#lclock').textContent = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  liveDraw(); liveStats(); liveCursor(); if (LIVE.sel) liveBInfo();
}
/* ---------- 지도 그리기(캔버스) ---------- */
function stateColor(v) { const a = [205, 222, 235], b = [232, 84, 30]; const t = Math.max(0, Math.min(1, v)); return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`; }
function irrColor(v) { const t = Math.max(0, Math.min(1, v / 600)); const a = [240, 236, 226], b = [176, 57, 26]; return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`; }
function hull(pts) { pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } up.pop(); lo.pop(); return lo.concat(up); }
function liveDraw() {
  const R = LIVE.R, cv = LIVE.canvas; if (!R || !cv) return;
  const sz = LIVE.map.getSize(), dpr = window.devicePixelRatio || 1; if (cv.width !== sz.x * dpr || cv.height !== sz.y * dpr) { cv.width = sz.x * dpr; cv.height = sz.y * dpr; cv.style.width = sz.x + 'px'; cv.style.height = sz.y + 'px'; }
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, sz.x, sz.y);
  const o = LIVE.map.latLngToContainerPoint([R.la, R.lo]), ex = LIVE.map.latLngToContainerPoint([R.la, R.lo + 100 / R.kx]), ny = LIVE.map.latLngToContainerPoint([R.la + 100 / R.ky, R.lo]);
  const sx = (ex.x - o.x) / 100, sy = (ny.y - o.y) / 100; const X = p => o.x + p[0] * sx, Y = p => o.y + p[1] * sy;
  const sp = sunPos(LIVE.ymd || ymdOf(LIVE.date), LIVE.t, R.la, R.lo);
  // 그림자(연속 시간)
  if (sp.alt > 0.5) {
    // 그림자 다각형(m 좌표)은 1분 단위로 캐시하고, 지도 이동 때는 좌표 변환만 다시 한다
    const mk = `${LIVE.date}|${Math.round(LIVE.t)}`;
    if (!R.hc || R.hc.k !== mk) {
      const L1 = 1 / Math.tan(sp.alt * D2R), dx = -Math.sin(sp.az * D2R) * L1, dy = -Math.cos(sp.az * D2R) * L1;
      R.hc = { k: mk, H: R.all.map(b => { const l = Math.min(b.h * L1, 1500) / L1; return hull([...b.P, ...b.P.map(p => [p[0] + dx * l, p[1] + dy * l])]); }) };
    }
    const path = new Path2D();
    for (const H of R.hc.H) { path.moveTo(X(H[0]), Y(H[0])); for (let i = 1; i < H.length; i++) path.lineTo(X(H[i]), Y(H[i])); path.closePath(); }
    ctx.fillStyle = 'rgba(30,42,56,0.22)'; ctx.fill(path, 'nonzero');
  } else { ctx.fillStyle = 'rgba(30,42,56,0.18)'; ctx.fillRect(0, 0, sz.x, sz.y); }
  // 주변 건물
  ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(30,42,56,.45)'; ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (const b of R.all) { if (b.tgt) continue; ctx.beginPath(); b.P.forEach((p, i) => i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  // 대상 건물
  const S = liveCur(); const rule = LIVE.rule, kind = LRULE[rule].kind;
  R.tg.forEach((b, i) => {
    let col = '#ddd';
    if (S) { const oo = i * 5; col = LIVE.mode === 'irr' ? irrColor(S.v[oo]) : LIVE.mode === 'shade' ? stateColor(S.v[oo + 4] / Math.max(1e-6, S.v[oo + 1] + S.v[oo + 4])) : kind === 'fixed' ? '#9AA7B4' : stateColor(moveFrac(rule, S.v, oo)); if (LIVE.mode === 'shade' && S.v[oo + 1] + S.v[oo + 4] === 0) col = '#bbb'; }
    ctx.beginPath(); b.P.forEach((p, k) => k ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = b === LIVE.sel ? 2.5 : 0.8; ctx.strokeStyle = b === LIVE.sel ? '#E8541E' : '#1E2A38'; ctx.stroke();
  });
  liveCompass(sp);
}
function liveCompass(sp) {
  const a = sp.az * D2R, r = 26, up = sp.alt > 0; const x = 34 + Math.sin(a) * r * Math.cos(Math.max(0, sp.alt) * D2R), y = 34 - Math.cos(a) * r * Math.cos(Math.max(0, sp.alt) * D2R);
  $('#lcomp').innerHTML = `<svg viewBox="0 0 68 68" width="68" height="68"><circle cx="34" cy="34" r="${r}" fill="rgba(255,255,255,.85)" stroke="#1E2A38" stroke-width="1"/><text x="34" y="11" text-anchor="middle" font-size="8">N</text>${up ? `<line x1="34" y1="34" x2="${x}" y2="${y}" stroke="#E8541E" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="5" fill="#F2B33D" stroke="#E8541E"/>` : '<text x="34" y="37" text-anchor="middle" font-size="8">밤</text>'}</svg><div class="mono small">고도 ${sp.alt.toFixed(1)}°<br>방위 ${sp.az.toFixed(0)}°</div>`;
  $('#lsun').textContent = `태양 고도 ${sp.alt.toFixed(1)}°, 방위각 ${sp.az.toFixed(0)}°(북=0°, 시계 방향) · 맑은 날 직달 일사 ${Math.round(clearSky(sp.alt, (LIVE.ymd || [0, 6])[1]).dn)} W/m²`;
}
function liveLegend() {
  const m = LIVE.mode;
  $('#lleg').innerHTML = m === 'state' ? '대상 건물 색 = 지금 움직여 작동 중인 입면의 비율(파랑 0% → 주황 100%), 회색 = 고정형(움직이지 않음) · 회색 반투명 = 그림자 · 흰색 = 주변 건물(차폐용)'
    : m === 'irr' ? '대상 건물 색 = 입면이 받는 평균 일사(직달+확산+반사, 맑은 날 가정, 0 → 600 W/m² 이상)' : '대상 건물 색 = 해가 드는 방향 입면 가운데 주변 건물에 가려진 비율(파랑 0% → 주황 100%), 진회색 = 해가 드는 입면 없음';
}
function liveStats() {
  const S = liveCur(); if (!S) return; const R = LIVE.R, n = R.tg.length; let I = 0, mv = 0, lit = 0, blk = 0, L = 0;
  R.tg.forEach((b, i) => { const o = i * 5, w = b.Flen; I += S.v[o] * w; mv += moveFrac(LIVE.rule, S.v, o) * w; lit += S.v[o + 1] * w; blk += S.v[o + 4] * w; L += w; });
  const k = LRULE[LIVE.rule].kind;
  $('#lstats').innerHTML = `<div class="card stat"><b>${num(I / L)}</b><span>입면 평균 일사(W/m², 맑은 날)</span></div><div class="card stat"><b>${num(100 * lit / L, 0)}%</b><span>직달일사가 드는 입면</span></div><div class="card stat"><b>${num(100 * blk / Math.max(1e-9, lit + blk), 0)}%</b><span>해가 드는 방향 입면 중 주변 건물에 가려진 비율</span></div><div class="card stat"><b class="sun">${k === 'fixed' ? '고정' : num(100 * mv / L, 0) + '%'}</b><span>${k === 'fixed' ? '고정형 — 항상 창 앞' : '지금 작동 중인 입면(' + esc(LRULE[LIVE.rule].name) + ')'}</span></div>`;
}
/* ---------- 하루 곡선 ---------- */
function liveSeries() {
  const R = LIVE.R, S = LIVE.slots; if (!S || S.some(s => !s)) return null; const L = R.tg.reduce((a, b) => a + b.Flen, 0);
  return S.map((s, k) => { let I = 0, mv = 0, lit = 0, blk = 0; R.tg.forEach((b, i) => { const o = i * 5; I += s.v[o] * b.Flen; mv += moveFrac(LIVE.rule, s.v, o, k * 10) * b.Flen; lit += s.v[o + 1] * b.Flen; blk += s.v[o + 4] * b.Flen; }); return { alt: s.sp.alt, az: s.sp.az, I: I / L, mv: 100 * mv / L, lit: 100 * lit / L, blk: 100 * blk / L }; });
}
function chartSvg(id, title, series, yl, opt = {}) {
  const W = 760, H = 210, Lp = 56, Rp = 14, T = 26, B = 30; const n = opt.n || 144, xmax = opt.xmax || 1440;
  const all = series.flatMap(s => s.v.filter(v => v != null)); let hi = Math.max(opt.hi || 0, ...all), lo = opt.lo ?? Math.min(0, ...all); if (hi === lo) hi = lo + 1;
  const X = i => Lp + (opt.xs ? opt.xs(i) : i * 10) / xmax * (W - Lp - Rp), Yv = v => T + (hi - v) / (hi - lo) * (H - T - B);
  let s = `<text x="${Lp}" y="14" font-weight="600">${esc(title)}</text>`;
  for (const t of niceTicks(lo, hi, 4)) s += `<line class="ax" x1="${Lp}" x2="${W - Rp}" y1="${Yv(t)}" y2="${Yv(t)}"/><text x="${Lp - 6}" y="${Yv(t)}" text-anchor="end" dominant-baseline="middle">${num(t, opt.yd || 0)}</text>`;
  for (let h = 0; h <= 24; h += 3) s += `<text x="${Lp + h * 60 / xmax * (W - Lp - Rp)}" y="${H - B + 16}" text-anchor="middle">${h}시</text>`;
  series.forEach((se, k) => { const d = se.v.map((v, i) => v == null ? '' : `${i && se.v[i - 1] != null ? 'L' : 'M'}${X(i).toFixed(1)},${Yv(v).toFixed(1)}`).join(''); s += `<path d="${d}" fill="none" stroke="${se.c}" stroke-width="${se.w || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/><rect x="${W - Rp - 300 + k * 150}" y="7" width="14" height="3" fill="${se.c}"/><text x="${W - Rp - 282 + k * 150}" y="12">${esc(se.label)}</text>`; });
  s += `<text transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(yl)}</text>`;
  s += `<line id="${id}-cur" class="lcur" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#E8541E" stroke-width="1.5"/>`;
  return `<svg class="svgc" id="${id}" data-l="${Lp}" data-w="${W - Lp - Rp}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
}
function liveCharts() {
  const se = liveSeries(); if (!se) { $('#lchart').innerHTML = ''; $('#lchart2').innerHTML = ''; return; }
  LIVE.series = se; const kind = LRULE[LIVE.rule].kind;
  const ser = [{ label: '입면 평균 일사(W/m²)', c: COL.ink, v: se.map(x => x.I) }];
  const ser2 = [{ label: '직달일사가 드는 입면(%)', c: COL.mut, v: se.map(x => x.lit), dash: '4 3' }];
  if (kind !== 'fixed') ser2.push({ label: '작동 중인 입면(%)', c: COL.sun, v: se.map(x => x.mv) });
  let h = chartSvg('lc1', `${LIVE.src.name} · ${LIVE.date} · 맑은 날 간이 계산`, ser, 'W/m²') + chartSvg('lc2', `${LRULE[LIVE.rule].name}의 작동 — 하루 변화${LRULE[LIVE.rule].kind === 'thresh' && !isCooling() ? '(난방기: 작동 안 함)' : ''}`, ser2, '%', { hi: 100 });
  $('#lchart').innerHTML = h;
  // EnergyPlus 곡선(역삼 257동)
  if (LIVE.src.ep) {
    const ymd = LIVE.ymd, doy = Math.round((Date.UTC(2026, ymd[1] - 1, ymd[2]) - Date.UTC(2026, 0, 1)) / 864e5);
    const get = sc => q('SELECT hour, kW FROM block_257_hourly WHERE scenario=? AND hour>=? AND hour<? ORDER BY hour', [sc, doy * 24, doy * 24 + 24]).map(r => r.kW);
    const base = get('S1'), ep = LRULE[LIVE.rule].ep, alt = ep ? get(ep) : null;
    const xs = i => i * 60 + 30;
    const s3 = [{ label: '개선 전', c: COL.mut, v: base, dash: '5 3' }]; if (alt) s3.push({ label: LRULE[LIVE.rule].name, c: COL.sun, v: alt });
    const sum = a => a.reduce((x, y) => x + y, 0);
    const txt = alt ? `이 날 257동 합산 전력량: 개선 전 ${num(sum(base) / 1000, 1)} MWh → ${esc(LRULE[LIVE.rule].name)} ${num(sum(alt) / 1000, 1)} MWh(${pct(100 * (sum(alt) - sum(base)) / sum(base))}), 일 최대 ${num(Math.max(...base))} → ${num(Math.max(...alt))} kW(${pct(100 * (Math.max(...alt) - Math.max(...base)) / Math.max(...base))}).` : '이 대안은 257동에서 계산하지 않았다(상세 3개 동만 계산).';
    $('#lchart2').innerHTML = chartSvg('lc3', `EnergyPlus 23.2 · 257동 합산 시간별 전력(${LIVE.date}, 서울 TMYx)`, s3, 'kW', { xs, lo: 0 }) + `<p class="small">${txt} ${SIMNOTE}</p>`;
  } else $('#lchart2').innerHTML = `<p class="small">이 지역의 에너지(전력) 값은 아직 EnergyPlus로 계산하지 않았다. 위 곡선은 맑은 날 가정의 일사와 작동 상태이며, 에너지 계산은 재계산 단계(2027년 1~3월)에서 건축물대장을 결합한 뒤 수행한다.</p>`;
  liveCursor();
}
function liveCursor() { for (const id of ['lc1', 'lc2', 'lc3']) { const sv = document.getElementById(id); if (!sv) continue; const x = +sv.dataset.l + LIVE.t / 1440 * +sv.dataset.w; const ln = document.getElementById(id + '-cur'); ln.setAttribute('x1', x); ln.setAttribute('x2', x); } }
/* ---------- 건물 선택 ---------- */
function liveClick(e) {
  const R = LIVE.R; if (!R) return; const x = (e.latlng.lng - R.lo) * R.kx, y = (e.latlng.lat - R.la) * R.ky;
  LIVE.sel = R.tg.find(b => x >= b.bb[0] && x <= b.bb[2] && y >= b.bb[1] && y <= b.bb[3] && inRing([x, y], b.P)) || null; liveDraw(); liveBInfo();
}
function liveBInfo() {
  const b = LIVE.sel; if (!b) { $('#lbinfo').innerHTML = ''; return; } const R = LIVE.R, i = R.tg.indexOf(b), S = liveCur(); if (!S) return;
  const sp = S.sp, cs = S.cs, ux = Math.sin(sp.az * D2R), uy = Math.cos(sp.az * D2R), tanA = Math.tan(Math.max(sp.alt, 0.5) * D2R), ca = Math.cos(sp.alt * D2R);
  const dirName = a => ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round(a / 45) % 8];
  const rows = b.F.filter(f => f.len >= 5).map(f => { const cosT = ca * Math.cos((sp.az - f.naz) * D2R); const face = sp.alt > 0 && cosT > 0; const sh = face && shadedAt(R, b, f.mx, f.my, b.h / 2, ux, uy, tanA); const Ib = face && !sh ? cs.dn * cosT : 0; const I = Ib + cs.dh * 0.5 + 0.2 * (cs.dn * Math.sin(Math.max(sp.alt, 0) * D2R) + cs.dh) * 0.5; const k = LRULE[LIVE.rule].kind; const st = k === 'fixed' ? '고정(창 앞)' : k === 'thresh' ? (isCooling() && I > 300 ? (LIVE.rule === 'BT_T300' ? '내림' : '컷오프') : (LIVE.rule === 'BT_T300' ? '걷어 올림' : '수평') + (isCooling() ? '' : '(난방기)')) : k === 'peak' ? (isPeakTime() ? '폐쇄' : '수평') : (Ib > 0 ? '컷오프 각도' : '수평'); return { o: `${dirName(f.naz)}(${f.naz.toFixed(0)}°)`, len: f.len, s: !face ? '해 반대편' : sh ? '주변 건물에 가려짐' : '직달일사', I, st }; });
  let ep = '';
  if (b.sim) { const r = q('SELECT tag, dEUI_pct, dpeak_pct FROM results_257 WHERE sim_name=?', [b.sim]); const m = Object.fromEntries(r.map(x => [x.tag, x])); const t = LIVE.rule; ep = m[t] ? `<p class="small">EnergyPlus 결과(이 건물, ${esc(LRULE[t].name)}, 보정 기준 대비): EUI ${pct(m[t].dEUI_pct)}, 건물 피크전력 ${pct(m[t].dpeak_pct)}. <a href="#/site">대상지·건물</a>에서 자세히.</p>` : ''; }
  $('#lbinfo').innerHTML = `<div class="card"><h3>${esc(b.name || b.id)} <span class="small">${b.block ? '가구 ' + esc(b.block) : ''} · 높이 ${num(b.h, 1)} m(${esc(b.hsrc)})</span></h3>${table([{ h: '입면 방향', k: 'o' }, { h: '길이(m)', k: 'len', num: 1, f: v => num(v, 0) }, { h: '직달일사', k: 's' }, { h: '일사(W/m²)', k: 'I', num: 1, f: v => num(v) }, { h: '작동', k: 'st' }], rows, { nw: 1, maxh: 260 })}<p class="small">길이 5 m 이상 입면만 표시. 입면 중앙(높이 ${num(b.h / 2, 1)} m) 한 점에서 판정한 맑은 날 간이 계산.</p>${ep}</div>`;
}
/* ---------- CSV ---------- */
function liveSave(name, text) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function liveCsvBld() {
  if (!LIVE.slots || LIVE.slots.some(s => !s)) { liveMsg('하루 계산이 끝난 뒤 내려받을 수 있다.'); return; }
  const R = LIVE.R, rule = LIVE.rule; const q2 = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['id,name,plan,block,lon,lat,height_m,height_source,date,time,sun_alt_deg,sun_az_deg,facade_irr_Wm2,sunlit_frac,shaded_by_neighbors_frac,over300_frac,moving_frac_' + rule];
  for (let k = 0; k < 144; k += 6) { const s = LIVE.slots[k]; if (s.sp.alt <= 0) continue; const tm = `${String(k / 6).padStart(2, '0')}:00`;
    R.tg.forEach((b, i) => { const o = i * 5; lines.push([b.id, q2(b.name), q2(b.plan), b.block || '', b.c[0].toFixed(6), b.c[1].toFixed(6), b.h.toFixed(1), q2(b.hsrc), LIVE.date, tm, s.sp.alt.toFixed(2), s.sp.az.toFixed(1), s.v[o].toFixed(1), s.v[o + 1].toFixed(3), s.v[o + 4].toFixed(3), s.v[o + 2].toFixed(3), moveFrac(rule, s.v, o, k * 10).toFixed(3)].join(',')); }); }
  liveSave(`live_buildings_${LIVE.date}_${rule}.csv`, lines.join('\n'));
}
function liveCsvDay() {
  const se = LIVE.series || liveSeries(); if (!se) { liveMsg('하루 계산이 끝난 뒤 내려받을 수 있다.'); return; }
  const lines = ['region,date,rule,time,sun_alt_deg,sun_az_deg,facade_irr_mean_Wm2,sunlit_pct,shaded_by_neighbors_pct,moving_pct'];
  se.forEach((x, k) => lines.push([`"${String(LIVE.src.name).replace(/"/g, '""')}"`, LIVE.date, LIVE.rule, `${String(Math.floor(k / 6)).padStart(2, '0')}:${String(k % 6 * 10).padStart(2, '0')}`, x.alt.toFixed(2), x.az.toFixed(1), x.I.toFixed(1), x.lit.toFixed(1), x.blk.toFixed(1), x.mv.toFixed(1)].join(',')));
  liveSave(`live_region_${LIVE.date}_${LIVE.rule}.csv`, lines.join('\n'));
}
