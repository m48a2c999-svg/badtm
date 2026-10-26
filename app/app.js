/* Facade Retrofit Lab — 연구 데이터베이스(SQLite, sql.js) 기반 사이트
   모든 성능 수치는 data/db/research.sqlite에서 질의한다. 수치는 EnergyPlus 시뮬레이션 값이다. */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let DB = null;
const META = {};
const q = (sql, p = []) => { const st = DB.prepare(sql); st.bind(p); const o = []; while (st.step()) o.push(st.getAsObject()); st.free(); return o; };
const q1 = (sql, p = []) => q(sql, p)[0] || {};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sgn = (x, d = 2, u = '') => (x == null || Number.isNaN(+x)) ? '—' : ((+x > 0 ? '+' : +x < 0 ? '−' : '') + Math.abs(+x).toFixed(d) + u);
const pct = (x, d = 2) => sgn(x, d, '%');
const pp = (x, d = 2) => sgn(x, d, '%p');
const num = (x, d = 0) => (x == null || Number.isNaN(+x)) ? '—' : (+x).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
const bad = x => (x == null ? '' : +x > 0 ? 'pos' : +x < 0 ? 'neg' : '');      // EUI·최대 전력: 증가 = 나쁨
const good = x => (x == null ? '' : +x < 0 ? 'pos' : +x > 0 ? 'neg' : '');     // UDI·열쾌적: 감소 = 나쁨
const median = a => { const s = a.filter(v => v != null && !Number.isNaN(v)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (a, p) => { const s = a.filter(v => v != null).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
function spearman(x, y) { const ok = x.map((v, i) => v != null && y[i] != null); const xs = x.filter((_, i) => ok[i]), ys = y.filter((_, i) => ok[i]); const rx = ranks(xs), ry = ranks(ys); const n = rx.length, mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; } return { rho: sxy / Math.sqrt(sxx * syy), n }; }

// 본문 범위의 대안(전기변색 유리 제외)과 표시 순서
const ORDER = ['F0', 'LH_F0', 'VF_F0', 'S3', 'LH_C', 'VF_C', 'BT_T300', 'LT_T300', 'PK'];
const ORDER257 = ['F0', 'LH_F0', 'VF_F0', 'BT_T300', 'LT_T300'];
let ALT = {};
const altName = t => (ALT[t] ? ALT[t].name : t);
const COL = { ink: '#1E2A38', sun: '#E8541E', kin: '#F2B33D', ok: '#2F7D6B', red: '#B0391A', mut: '#8C949E', line: '#CDD1D6' };
const CLASS_DEF = {
  obstruction_class: { label: '주변 건물에 가려진 정도', levels: ['적게 가려짐', '중간', '많이 가려짐'] },
  footprint_class: { label: '평면 면적(모델)', levels: ['소', '중', '대'] },
  floors_class: { label: '지상 층수', levels: ['6~10층', '11~20층', '21층 이상'] },
  block: { label: '대블록', levels: ['NE', 'NW', 'SE', 'SW'] },
  era_class: { label: '사용승인 연도', levels: ['1995년 이전', '1996~2005년', '2006년 이후', '미상'] },
};
const METRIC = { dEUI_pct: { label: 'EUI 변화', f: pct, cls: bad }, dpeak_pct: { label: '건물 최대 전력 변화', f: pct, cls: bad }, dUDI_pp: { label: 'UDI 변화', f: pp, cls: good }, dPMV_pp: { label: '열쾌적 비율 변화', f: pp, cls: good } };
const CONT = { obstruction_deg: '평균 차폐각(°)', footprint_model_m2: '모델 평면 면적(m²)', floors: '지상 층수', sky_view_proxy: '천공률 대용값', approval_year: '사용승인 연도' };

/* ---------------- SVG charts ---------------- */
function svgEl(w, h, inner) { return `<svg class="svgc" viewBox="0 0 ${w} ${h}" role="img">${inner}</svg>`; }
function niceTicks(lo, hi, n = 5) { const span = hi - lo || 1; const step0 = span / n; const mag = 10 ** Math.floor(Math.log10(step0)); const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= step0) || step0; const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10)); return out; }
// 대안별 가로 막대(두 지표)
function barsChart(rows, keys, opt = {}) {
  const W = 760, rowH = 34, L = 190, R = 30, T = 30, B = 30, H = T + B + rows.length * rowH;
  const vals = rows.flatMap(r => keys.map(k => r[k.key])).filter(v => v != null);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals); const pad = (hi - lo) * 0.08 || 0.5; lo -= pad; hi += pad;
  const x = v => L + (v - lo) / (hi - lo) * (W - L - R);
  let s = '';
  for (const t of niceTicks(lo, hi, 6)) s += `<line class="ax" x1="${x(t)}" x2="${x(t)}" y1="${T - 6}" y2="${H - B}"/><text x="${x(t)}" y="${H - B + 16}" text-anchor="middle">${sgn(t, Math.abs(t) < 1 && t !== 0 ? 1 : 0)}${opt.unit || '%'}</text>`;
  s += `<line class="zero" x1="${x(0)}" x2="${x(0)}" y1="${T - 6}" y2="${H - B}"/>`;
  const bh = (rowH - 10) / keys.length;
  rows.forEach((r, i) => {
    const y0 = T + i * rowH + 4;
    s += `<text x="${L - 8}" y="${y0 + rowH / 2}" text-anchor="end" dominant-baseline="middle">${esc(r.label)}</text>`;
    keys.forEach((k, j) => { const v = r[k.key]; if (v == null) return; const a = x(Math.min(0, v)), b = x(Math.max(0, v)); s += `<rect x="${a}" y="${y0 + j * bh}" width="${Math.max(1, b - a)}" height="${bh - 2}" fill="${k.color}"><title>${esc(r.label)} · ${k.label} ${sgn(v)}%</title></rect>`; });
  });
  s += keys.map((k, j) => `<rect x="${L + j * 150}" y="6" width="11" height="11" fill="${k.color}"/><text x="${L + 16 + j * 150}" y="15">${esc(k.label)}</text>`).join('');
  return svgEl(W, H, s);
}
// 대안별 분포(점 + 사분위 상자 + 중앙값)
function stripChart(groups, opt = {}) {
  const W = 760, rowH = 40, L = 150, R = 20, T = 14, B = 30, H = T + B + groups.length * rowH;
  const all = groups.flatMap(g => g.v);
  let lo = Math.min(0, quant(all, 0.005)), hi = Math.max(0, quant(all, 0.995)); const pad = (hi - lo) * 0.05; lo -= pad; hi += pad;
  const x = v => L + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * (W - L - R);
  let s = '';
  for (const t of niceTicks(lo, hi, 7)) s += `<line class="ax" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - B}"/><text x="${x(t)}" y="${H - B + 16}" text-anchor="middle">${sgn(t, Math.abs(t) < 1 && t !== 0 ? 1 : 0)}${opt.unit || '%'}</text>`;
  s += `<line class="zero" x1="${x(0)}" x2="${x(0)}" y1="${T}" y2="${H - B}"/>`;
  groups.forEach((g, i) => {
    const yc = T + i * rowH + rowH / 2;
    s += `<text x="${L - 8}" y="${yc}" text-anchor="end" dominant-baseline="middle">${esc(g.label)}</text>`;
    let seed = 7 + i * 13; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    g.v.forEach(v => { s += `<circle cx="${x(v)}" cy="${yc + (rnd() - 0.5) * (rowH - 14)}" r="2.1" fill="${opt.color || COL.ink}" fill-opacity=".35"/>`; });
    const q1v = quant(g.v, .25), q3v = quant(g.v, .75), md = median(g.v);
    s += `<rect x="${x(q1v)}" y="${yc - 9}" width="${Math.max(1, x(q3v) - x(q1v))}" height="18" fill="none" stroke="${COL.ink}" stroke-width="1.2"/><line x1="${x(md)}" x2="${x(md)}" y1="${yc - 12}" y2="${yc + 12}" stroke="${COL.sun}" stroke-width="3"><title>중앙값 ${sgn(md)}${opt.unit || '%'}</title></line>`;
  });
  return svgEl(W, H, s);
}
function scatterChart(pts, xl, yl, opt = {}) {
  const W = 760, H = 380, L = 64, R = 20, T = 16, B = 46;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  let xlo = Math.min(...xs), xhi = Math.max(...xs), ylo = Math.min(0, quant(ys, 0.005)), yhi = Math.max(0, quant(ys, 0.995));
  const px = (xhi - xlo) * 0.04 || 1, py = (yhi - ylo) * 0.06 || 0.5; xlo -= px; xhi += px; ylo -= py; yhi += py;
  const sx = v => L + (v - xlo) / (xhi - xlo) * (W - L - R), sy = v => T + (yhi - Math.max(ylo, Math.min(yhi, v))) / (yhi - ylo) * (H - T - B);
  let s = '';
  for (const t of niceTicks(ylo, yhi, 6)) s += `<line class="ax" x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${L - 6}" y="${sy(t)}" text-anchor="end" dominant-baseline="middle">${sgn(t, Math.abs(t) < 1 && t !== 0 ? 1 : 0)}</text>`;
  for (const t of niceTicks(xlo, xhi, 7)) s += `<line class="ax" x1="${sx(t)}" x2="${sx(t)}" y1="${T}" y2="${H - B}"/><text x="${sx(t)}" y="${H - B + 16}" text-anchor="middle">${num(t, t % 1 ? 1 : 0).replace(/,/g, opt.noComma ? '' : ',')}</text>`;
  s += `<line class="zero" x1="${L}" x2="${W - R}" y1="${sy(0)}" y2="${sy(0)}"/>`;
  pts.forEach(p => { s += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="3.2" fill="${p.c || COL.sun}" fill-opacity=".6"><title>${esc(p.t || '')}</title></circle>`; });
  s += `<text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">${esc(xl)}</text><text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(yl)}</text>`;
  return svgEl(W, H, s);
}
function lineChart(series, n, opt = {}) {
  const W = 760, H = opt.h || 300, L = 70, R = 20, T = 30, B = 40;
  const all = series.flatMap(s => s.v).filter(v => v != null);
  let lo = opt.lo ?? Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const sx = i => L + i / (n - 1) * (W - L - R), sy = v => T + (hi - v) / (hi - lo) * (H - T - B);
  let s = '';
  for (const t of niceTicks(lo, hi, 5)) s += `<line class="ax" x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${L - 6}" y="${sy(t)}" text-anchor="end" dominant-baseline="middle">${num(t, opt.yd || 0)}</text>`;
  (opt.xt || []).forEach(([i, lab]) => { s += `<text x="${sx(i)}" y="${H - B + 16}" text-anchor="middle">${esc(lab)}</text>`; });
  series.forEach((se, k) => {
    const d = se.v.map((v, i) => v == null ? '' : `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join('');
    s += `<path d="${d}" fill="none" stroke="${se.c}" stroke-width="${se.w || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/>`;
    s += `<rect x="${L + k * 190}" y="8" width="14" height="3" fill="${se.c}"/><text x="${L + 20 + k * 190}" y="13">${esc(se.label)}</text>`;
  });
  if (opt.yl) s += `<text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(opt.yl)}</text>`;
  return svgEl(W, H, s);
}

/* ---------------- 공통 표 ---------------- */
function table(cols, rows, opt = {}) {
  const th = cols.map(c => `<th${c.num ? ' style="text-align:right"' : ''}${c.sort ? ` data-k="${c.k}" style="cursor:pointer${c.num ? ';text-align:right' : ''}"` : ''}>${esc(c.h)}</th>`).join('');
  const tr = rows.map(r => `<tr${opt.rowAttr ? opt.rowAttr(r) : ''}>${cols.map(c => { const v = c.f ? c.f(r[c.k], r) : esc(r[c.k]); const cl = [c.num ? 'num' : '', c.cls ? c.cls(r[c.k], r) : ''].filter(Boolean).join(' '); return `<td${cl ? ` class="${cl}"` : ''}>${v}</td>`; }).join('')}</tr>`).join('');
  return `<div class="tblwrap"${opt.maxh ? ` style="max-height:${opt.maxh}px"` : ''}><table class="tbl${opt.nw ? ' nw' : ''}"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}
const note = t => `<div class="note">${t}</div>`;
const SIMNOTE = 'EnergyPlus 23.2 시뮬레이션 값이며 실측값이 아니다. 예비심사 원고 기준 예비 결과로, 개량 대안과 지표를 확정한 뒤 재계산한다.';

/* ---------------- 페이지: 개요 ---------------- */
function pageHome() {
  const nB = q1('SELECT COUNT(*) n FROM buildings').n;
  const nAlt = ORDER.length;
  const r = {}; for (const t of ORDER257) { const v = q('SELECT dEUI_pct e, dpeak_pct p FROM results_257 WHERE tag=?', [t]); r[t] = { e: median(v.map(x => x.e)), p: median(v.map(x => x.p)), both: v.filter(x => x.e < 0 && x.p < 0).length, n: v.length }; }
  const eMeds = Object.values(r).map(x => x.e);
  const obs = cls => q("SELECT dEUI_pct e, dpeak_pct p FROM v_results WHERE tag=? AND obstruction_class=?", [cls[0], cls[1]]);
  const f0hi = obs(['F0', '많이 가려짐']), lhlo = obs(['LH_F0', '적게 가려짐']);
  const cb = JSON.parse(META.class_bounds);
  $('#page-home').innerHTML = `
  <div class="titleblock">
    <div class="kicker">예비심사 원고 기준 · 2026-10-26</div>
    <h1>${esc(META.title_ko)}</h1>
    <p class="en">${esc(META.title_en)}</p>
    <div class="small">${esc(META.author)}</div>
  </div>
  <div class="purpose"><b>연구 목적</b><br>${esc(META.purpose)}</div>
  <div class="grid g4" style="margin:18px 0">
    <div class="card tick stat"><b>${nB}동</b><span>역삼역 일대 4개 대블록의 업무시설</span><em>상세 모델 3개 동 포함</em></div>
    <div class="card tick stat"><b>${nAlt}개</b><span>외피 개량 대안</span><em>고정형 차양 3 · 키네틱 파사드 6</em></div>
    <div class="card tick stat"><b class="sun">${pct(Math.min(...eMeds))} ~ ${pct(Math.max(...eMeds))}</b><span>257동 건물별 EUI 변화 중앙값의 범위</span><em>계산한 5개 대안</em></div>
    <div class="card tick stat"><b class="kin">${r.BT_T300.both}동(${Math.round(100 * r.BT_T300.both / r.BT_T300.n)}%)</b><span>EUI와 최대 전력을 함께 줄인 건물 — 블라인드 일사 기준</span><em>나머지 대안은 ${Math.min(...ORDER257.filter(t => t !== 'BT_T300').map(t => r[t].both))}~${Math.max(...ORDER257.filter(t => t !== 'BT_T300').map(t => r[t].both))}동</em></div>
  </div>
  <div class="grid g2">
    <div class="card"><h3>연구 질문</h3><ol class="qlist">
      <li>외피를 개량하면 기존 업무시설의 연간 에너지 사용량, 최대 전력, 주광, 열쾌적은 개량 전보다 얼마나 달라지는가?</li>
      <li>고정형 차양과 키네틱 파사드는 어떤 지표에서 서로 다르며, 그 차이의 원인은 무엇인가?</li>
      <li>밀집지역의 건물 조건(주변 건물에 가려진 정도, 평면 규모, 층수)에 따라 효과는 어떻게 달라지며, 각 대안을 적용할 만한 조건은 무엇인가?</li></ol></div>
    <div class="card"><h3>독창성</h3><p>${esc(META.originality)}</p><h3>범위</h3><p>${esc(META.scope)}</p></div>
  </div>
  <h2>연구 흐름</h2>
  <div class="flow"><div><b>01 자료 결합</b>OpenStreetMap 건물 윤곽·높이 + 건축물대장 용도·층수·연면적</div><div><b>02 자동 모델</b>건물마다 EnergyPlus 모델(DOE 대형 사무소 원형, 주변 건물 차폐)</div><div><b>03 실측 비교</b>건축HUB 월별 전기와 비교(ASHRAE Guideline 14)</div><div><b>04 개량 대안</b>고정형 차양 · 키네틱 파사드 적용, 개량 전후 비교</div><div><b>05 건물 조건별 지표</b>가려진 정도·평면 규모·층수별 효과, 블록 최대 전력(보조)</div></div>
  <h2>예비 결과 요약</h2>
  <div class="grid g3">
    <div class="card"><h3>① 효과는 작다</h3><p>257동 건물별 EUI 변화 중앙값은 ${pct(Math.min(...eMeds))}~${pct(Math.max(...eMeds))}였다. 주광을 막는 대안은 조명 전력이 늘어 최대 전력을 높였다.</p><a href="#/results">결과 →</a></div>
    <div class="card"><h3>② 주광 유지가 갈림길</h3><p>작동하지 않을 때 걷어 올리는 블라인드의 일사 기준 제어만 EUI(${pct(r.BT_T300.e)})와 최대 전력(${pct(r.BT_T300.p)})을 함께 줄였다. 태양 추종은 세 장치 모두 같은 장치의 고정보다 EUI가 컸다.</p><a href="#/alts">개량 대안 →</a></div>
    <div class="card"><h3>③ 밀집 조건이 방향을 바꾼다</h3><p>많이 가려진 건물(평균 차폐각 ${cb.obstruction_deg[1]}° 초과)에서 블라인드 고정의 EUI 감소가 ${pct(median(f0hi.map(x => x.e)))}로 가장 컸고, 적게 가려진 건물(${cb.obstruction_deg[0]}° 이하)에서는 대형 루버 고정이 EUI ${pct(median(lhlo.map(x => x.e)))}, 최대 전력 ${pct(median(lhlo.map(x => x.p)))}로 둘 다 나빠졌다.</p><a href="#/traits">건물 특성별 →</a></div>
  </div>
  ${note('결론의 성격: "키네틱 파사드가 좋다"를 보이는 것이 아니라, 서울 업무시설 밀집지역의 기존 건물에서 어떤 개량이 어떤 건물 조건에서 얼마만큼 효과가 있고 없는지를 수치로 밝히는 검증 연구이다. ' + SIMNOTE)}`;
}

/* ---------------- 페이지: 대상지·건물 ---------------- */
let MAP = null, LAYER = null, SEL = null, SORT = { k: 'floors', d: -1 };
const blockColor = { NE: '#1E2A38', NW: '#E8541E', SE: '#2F7D6B', SW: '#B9790C' };
const seq3 = ['#F6D3BF', '#EE8A55', '#B0391A'];
function divColor(v, lim) { if (v == null) return '#ccc'; const t = Math.max(-1, Math.min(1, v / lim)); const mix = (a, b, u) => a.map((x, i) => Math.round(x + (b[i] - x) * u)); const mid = [238, 236, 230], neg = [47, 125, 107], pos = [176, 57, 26]; const c = t < 0 ? mix(mid, neg, -t) : mix(mid, pos, t); return `rgb(${c.join(',')})`; }
function pageSite() {
  const alts = ORDER257.map(t => `<option value="${t}">${esc(altName(t))}</option>`).join('');
  $('#page-site').innerHTML = `
  <div class="kicker">대상지 · 건물 데이터베이스</div>
  <h1>역삼역 일대 4개 대블록, 업무시설 257동</h1>
  <p>강남 테헤란로의 역삼역사거리를 중심으로 간선도로(봉은사로·역삼로·강남대로·언주로, 내부의 테헤란로·논현로)로 나뉜 4개 대블록 안의 지상 6층 이상 건물 가운데 업무 용도이고 공개 자료로 모델을 만들 수 있었던 257동(업무시설 245동, 업무 용도가 섞인 제2종 근린생활시설 12동)이다. 지도의 건물이나 표의 행을 누르면 건물별 개량 전후 결과와 실측 비교를 볼 수 있다.</p>
  <div class="ctrl">
    <label>지도 색 기준<select id="mcolor"><option value="block">대블록</option><option value="obstruction_class">주변 건물에 가려진 정도</option><option value="footprint_class">평면 면적(모델)</option><option value="floors_class">지상 층수</option><option value="dEUI_pct">대안별 EUI 변화</option><option value="dpeak_pct">대안별 최대 전력 변화</option></select></label>
    <label>대안<select id="malt">${alts}</select></label>
    <label>검색<input type="search" id="msearch" placeholder="건물 이름"></label>
    <label>대블록<select id="mblock"><option value="">전체</option><option>NE</option><option>NW</option><option>SE</option><option>SW</option></select></label>
  </div>
  <div class="grid g2" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)">
    <div><div id="map"></div><div id="mleg" class="maplegend" style="margin-top:6px"></div></div>
    <div class="card detail" id="bdetail"><h3>건물을 선택하세요</h3><p class="small">지도에서 건물을 누르거나 아래 표에서 행을 누르면 여기에 나타난다.</p></div>
  </div>
  <h2>건물 목록</h2><div id="btable"></div>
  ${note('평면 면적은 등가 직사각형 모델의 평면 면적, 가려진 정도는 창에서 본 주변 건물의 평균 차폐각이다. ' + SIMNOTE)}`;
  ['mcolor', 'malt', 'mblock'].forEach(id => $('#' + id).addEventListener('change', () => { drawMap(); drawBTable(); }));
  $('#msearch').addEventListener('input', drawBTable);
}
function siteRows() {
  const t = $('#malt').value, blk = $('#mblock').value, s = ($('#msearch').value || '').trim();
  let sql = `SELECT b.*, r.dEUI_pct, r.dpeak_pct, r.dUDI_pp FROM buildings b LEFT JOIN results_257 r ON r.sim_name=b.sim_name AND r.tag=? WHERE 1=1`; const p = [t];
  if (blk) { sql += ' AND b.block=?'; p.push(blk); }
  if (s) { sql += ' AND b.name LIKE ?'; p.push('%' + s + '%'); }
  return q(sql, p);
}
function colorOf(b, mode) {
  if (mode === 'block') return blockColor[b.block];
  if (CLASS_DEF[mode]) return seq3[CLASS_DEF[mode].levels.indexOf(b[mode])] || '#ccc';
  return divColor(b[mode], mode === 'dEUI_pct' ? 2 : 3);
}
function drawMap() {
  if (!MAP) {
    const c = JSON.parse(q1("SELECT value v FROM block_meta WHERE key='center'").v);
    MAP = L.map('map', { scrollWheelZoom: false }).setView(c, 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(MAP);
    for (const b of q('SELECT * FROM blocks')) L.polygon(JSON.parse(b.polygon), { color: COL.ink, weight: 2, dashArray: '6 4', fill: false }).bindTooltip(`${b.block} 대블록 · ${b.n_buildings}동`).addTo(MAP);
  }
  if (LAYER) LAYER.remove();
  LAYER = L.layerGroup().addTo(MAP);
  const mode = $('#mcolor').value; const rows = siteRows();
  for (const b of rows) {
    if (!b.polygon) continue;
    const pg = L.polygon(JSON.parse(b.polygon), { color: SEL === b.sim_name ? COL.sun : '#333', weight: SEL === b.sim_name ? 3 : 0.6, fillColor: colorOf(b, mode), fillOpacity: 0.85 });
    pg.bindTooltip(`${esc(b.name)} · ${b.floors}층`); pg.on('click', () => selectBuilding(b.sim_name, false)); pg.addTo(LAYER);
  }
  let leg = '';
  if (mode === 'block') leg = Object.entries(blockColor).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join(' ');
  else if (CLASS_DEF[mode]) leg = `${CLASS_DEF[mode].label}: ` + CLASS_DEF[mode].levels.slice(0, 3).map((l, i) => `<span><i style="background:${seq3[i]}"></i>${l}</span>`).join(' ');
  else { const lim = mode === 'dEUI_pct' ? 2 : 3; leg = `${altName($('#malt').value)} · ${METRIC[mode].label}: ` + [-lim, -lim / 2, 0, lim / 2, lim].map(v => `<span><i style="background:${divColor(v, lim)}"></i>${pct(v, 1)}</span>`).join(' ') + ' (초록 = 감소, 빨강 = 증가)'; }
  $('#mleg').innerHTML = leg;
}
function drawBTable() {
  const rows = siteRows().sort((a, b) => { const x = a[SORT.k], y = b[SORT.k]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * SORT.d; });
  const t = altName($('#malt').value);
  $('#btable').innerHTML = `<p class="small">${rows.length}동 · 열 제목을 누르면 정렬된다.</p>` + table([
    { h: '건물', k: 'name', sort: 1 }, { h: '블록', k: 'block', sort: 1 }, { h: '층수', k: 'floors', num: 1, sort: 1 }, { h: '평면(m²)', k: 'footprint_model_m2', num: 1, sort: 1, f: v => num(v) },
    { h: '가려진 정도(°)', k: 'obstruction_deg', num: 1, sort: 1, f: v => num(v, 1) }, { h: '사용승인', k: 'approval_year', num: 1, sort: 1, f: v => v ?? '—' },
    { h: '개량 전 EUI', k: 'base_EUI', num: 1, sort: 1, f: v => num(v, 1) }, { h: `${t} EUI`, k: 'dEUI_pct', num: 1, sort: 1, f: v => pct(v), cls: bad },
    { h: `${t} 최대 전력`, k: 'dpeak_pct', num: 1, sort: 1, f: v => pct(v), cls: bad }], rows, { maxh: 460, nw: 1, rowAttr: r => ` data-s="${esc(r.sim_name)}" style="cursor:pointer"${SEL === r.sim_name ? ' class="sel"' : ''}` });
  $$('#btable tbody tr').forEach(tr => tr.addEventListener('click', () => selectBuilding(tr.dataset.s, true)));
  $$('#btable th[data-k]').forEach(th => th.addEventListener('click', () => { const k = th.dataset.k; SORT = { k, d: SORT.k === k ? -SORT.d : -1 }; drawBTable(); }));
}
function selectBuilding(s, pan) {
  SEL = s; const b = q1('SELECT * FROM buildings WHERE sim_name=?', [s]);
  const rs = q('SELECT r.*, a.name FROM results_257 r JOIN alternatives a ON a.tag=r.tag WHERE r.sim_name=?', [s]).filter(r => ORDER257.includes(r.tag)).sort((x, y) => ORDER257.indexOf(x.tag) - ORDER257.indexOf(y.tag));
  const m = q('SELECT * FROM monthly WHERE sim_name=? ORDER BY idx', [s]);
  $('#bdetail').innerHTML = `<h3>${esc(b.name)}</h3>
  <dl class="kv"><dt>대블록</dt><dd>${b.block}</dd><dt>층수 · 높이</dt><dd>${b.floors}층 · ${num(b.height_m, 0)} m</dd><dt>연면적(대장)</dt><dd>${b.gross_area_m2 ? num(b.gross_area_m2) + ' m²' : '—'}</dd><dt>평면 면적(모델)</dt><dd>${num(b.footprint_model_m2)} m² (${b.footprint_class})</dd><dt>가려진 정도</dt><dd>${num(b.obstruction_deg, 1)}° (${b.obstruction_class})</dd><dt>사용승인</dt><dd>${b.approval_year ?? '—'}</dd><dt>모델</dt><dd>${b.role}</dd><dt>개량 전</dt><dd>EUI ${num(b.base_EUI, 1)} kWh/m²·yr · 최대 ${num(b.base_peak_kW, 0)} kW</dd></dl>
  ${table([{ h: '대안', k: 'name' }, { h: 'EUI', k: 'dEUI_pct', num: 1, f: v => pct(v), cls: bad }, { h: '최대 전력', k: 'dpeak_pct', num: 1, f: v => pct(v), cls: bad }, { h: 'UDI', k: 'dUDI_pp', num: 1, f: v => pp(v, 1), cls: good }, { h: '열쾌적', k: 'dPMV_pp', num: 1, f: v => pp(v, 1), cls: good }], rs, { nw: 1 })}
  ${m.length ? `<h3 style="margin-top:12px">월별 전력: 실측과 모델(보정 후)</h3>${lineChart([{ label: '실측(건축HUB)', v: m.map(x => x.measured), c: COL.ink }, { label: '모델(보정 후)', v: m.map(x => x.simulated), c: COL.sun, dash: '5 3' }], 12, { h: 230, yd: 1, yl: 'kWh/m²', xt: [[0, '1월'], [3, '4월'], [6, '7월'], [9, '10월'], [11, '12월']] })}<p class="small">CV(RMSE) ${num(b.cv_rmse_cal, 1)}%(보정 전 ${num(b.cv_rmse_uncal, 1)}%) · NMBE ${sgn(b.nmbe_cal, 1)}% · ${b.split || ''}</p>` : '<p class="small">실측 비교 자료 없음</p>'}`;
  drawMap(); drawBTable();
  if (pan && b.lat) MAP.setView([b.lat, b.lon], 17);
}

/* ---------------- 페이지: 개량 대안 ---------------- */
function pageAlts() {
  const rows = q('SELECT * FROM alternatives');
  const main = ORDER.map(t => rows.find(r => r.tag === t));
  const cols = [{ h: '구분', k: 'category' }, { h: '대안', k: 'name', f: (v, r) => `<b>${esc(v)}</b>${r.principle ? ` <span class="tag kin">${r.principle}</span>` : ''}` }, { h: '장치', k: 'device' }, { h: '작동', k: 'operation' }, { h: '기간', k: 'period' }, { h: '작동하지 않을 때', k: 'idle_state' }, { h: '주광', k: 'daylight' }, { h: '계산 범위', k: 'in_257', f: (v, r) => [r.in_3bldg ? '3개 동' : '', v ? '257동' : ''].filter(Boolean).join(' · ') }];
  const extra = rows.filter(r => !ORDER.includes(r.tag) && r.tag !== 'S1');
  $('#page-alts').innerHTML = `
  <div class="kicker">외피 개량 대안</div><h1>고정형 차양 3종 · 키네틱 파사드 6종</h1>
  <p>개량 전은 장치 없이 주변 건물 차폐만 반영한 모델이다. 본 연구에서 키네틱 파사드는 외피 요소가 물리적으로 움직여 형태가 바뀌는 외피로 한정한다(블라인드·루버·핀). 장치를 ① 무엇이 움직이는가(장치)와 ② 언제 움직이는가(제어)의 두 축으로 정리하였다.</p>
  ${table(cols, main)}
  ${note('모든 장치는 설계일 계산에서 작동하지 않게 하여, 같은 건물의 대안들이 같은 공조 용량을 쓰게 하였다. 257동에서는 고정형 3종과 일사 기준 2종만 계산하였고, 태양 추종 3종과 피크 시간 폐쇄는 재계산에서 추가한다. <span class="tag kin">P2</span> 표시는 생체모방 원리에서 유도한 규칙과 대응하는 대안이다(<a href="#/bio">생체모방 원리</a>).')}
  <h2>주광을 유지하는가</h2>
  <div class="grid g2"><div class="card"><h3>주광 손실형</h3><p>작동하지 않을 때도 장치가 창 앞에 남는다. 고정형 3종, 태양 추종 3종, 대형 루버 일사 기준, 피크 시간 폐쇄가 여기에 속한다. 일사를 막아 냉방을 줄이지만, 주광을 잃어 조명 전력이 늘어난다.</p></div>
  <div class="card"><h3>주광 유지형</h3><p>작동 기준을 넘을 때만 창을 가리고 그 밖에는 창에서 빠진다. 블라인드 일사 기준(걷어 올림)이 유일하다. 결과에서 최대 전력을 낮춘 것은 이 유형뿐이었다.</p></div></div>
  <details style="margin-top:18px"><summary><b>범위 밖·원리 시험 대안(참고)</b> — 전기변색 유리(가변 유리)와 생체모방 원리 시험용 규칙</summary>${table(cols, extra)}<p class="small">전기변색 유리는 움직이지 않고 재료의 성질이 바뀌는 가변 유리이므로 연구 범위에서 제외하였다. 계산 결과는 데이터베이스에 참고로 보존한다.</p></details>`;
}

/* ---------------- 페이지: 결과 ---------------- */
function pageResults() {
  const base = JSON.parse(META.base_3bldg);
  const r3 = q('SELECT r.*, a.name, a.category FROM results_3bldg r JOIN alternatives a ON a.tag=r.tag').filter(r => ORDER.includes(r.tag)).sort((a, b) => ORDER.indexOf(a.tag) - ORDER.indexOf(b.tag));
  const rng = (r, k) => { const v = ['ARK', 'GFC', 'GST'].map(n => r[`${k}_${n}`]); const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? sgn(lo, 1) : `${sgn(lo, 1)} ~ ${sgn(hi, 1)}`; };
  const g = ORDER257.map(t => { const v = q('SELECT * FROM results_257 WHERE tag=?', [t]); const f = k => v.map(x => x[k]); return { tag: t, label: altName(t), e: f('dEUI_pct'), p: f('dpeak_pct'), u: f('dUDI_pp'), c: f('dPMV_pp'), n: v.length, both: v.filter(x => x.dEUI_pct < 0 && x.dpeak_pct < 0).length }; });
  const blk = q("SELECT * FROM block_257 WHERE tag IS NULL OR tag NOT LIKE 'EC%' ORDER BY rowid");
  const pk = q1("SELECT peak_hour h FROM block_257 WHERE scenario='S1c'").h; const d0 = Math.floor(pk / 24) * 24;
  const hr = sc => q('SELECT kW FROM block_257_hourly WHERE scenario=? AND hour>=? AND hour<? ORDER BY hour', [sc, d0, d0 + 24]).map(x => x.kW);
  const day = new Date(Date.UTC(2023, 0, 1) + d0 / 24 * 864e5); const dl = `${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일`;
  $('#page-results').innerHTML = `
  <div class="kicker">예비 결과</div><h1>개량 전후 비교</h1>
  <h2>1. 상세 3개 동</h2>
  <p>아크플레이스·강남파이낸스센터·GS타워의 상세 모델. 개량 전 블록 EUI ${num(base.EUI, 2)} kWh/m²·yr, 블록 최대 전력 ${num(base.peak_kW)} kW 대비 변화이다.</p>
  ${table([{ h: '구분', k: 'category' }, { h: '대안', k: 'name' }, { h: '블록 EUI', k: 'dEUI_pct', num: 1, f: v => pct(v), cls: bad }, { h: '블록 최대 전력', k: 'dpeak_pct', num: 1, f: v => pct(v), cls: bad }, { h: 'UDI(3개 동, %p)', k: 'dUDI_ARK', num: 1, f: (v, r) => rng(r, 'dUDI') }, { h: '열쾌적(3개 동, %p)', k: 'dPMV_ARK', num: 1, f: (v, r) => rng(r, 'dPMV') }], r3, { nw: 1 })}
  ${barsChart(r3.map(r => ({ label: r.name, e: r.dEUI_pct, p: r.dpeak_pct })), [{ key: 'e', label: '블록 EUI 변화', color: COL.ink }, { key: 'p', label: '블록 최대 전력 변화', color: COL.sun }])}
  <p>창 앞에 남아 주광을 막는 대안은 UDI를 낮추고(수평 장치는 크게) 최대 전력을 높였다. 블라인드 일사 기준(걷어 올림)만 UDI를 유지하면서 EUI와 최대 전력을 함께 줄였다. 태양 추종은 세 장치 모두 같은 장치의 고정보다 EUI가 컸고, 최대 전력은 블라인드·대형 루버에서 컸다(수직 핀은 +0.02% 대 +0.57%). 피크 시간 폐쇄는 최대 전력을 가장 크게 높였다.</p>
  <h2>2. 257동(건물별)</h2>
  ${table([{ h: '대안', k: 'label' }, { h: 'EUI 중앙값', k: 'e', num: 1, f: v => pct(median(v)), cls: v => bad(median(v)) }, { h: 'EUI 감소 동수', k: 'e', num: 1, f: (v, r) => `${v.filter(x => x < 0).length} (${Math.round(100 * v.filter(x => x < 0).length / r.n)}%)` }, { h: '최대 전력 중앙값', k: 'p', num: 1, f: v => pct(median(v)), cls: v => bad(median(v)) }, { h: '최대 전력 감소 동수', k: 'p', num: 1, f: (v, r) => `${v.filter(x => x < 0).length} (${Math.round(100 * v.filter(x => x < 0).length / r.n)}%)` }, { h: '둘 다 감소', k: 'both', num: 1, f: (v, r) => `${v} (${Math.round(100 * v / r.n)}%)` }, { h: 'UDI 중앙값', k: 'u', num: 1, f: v => pp(median(v)), cls: v => good(median(v)) }, { h: '열쾌적 중앙값', k: 'c', num: 1, f: v => pp(median(v)), cls: v => good(median(v)) }], g, { nw: 1 })}
  <div><div><h3>EUI 변화 분포</h3>${stripChart(g.map(x => ({ label: x.label, v: x.e })), { color: COL.ink })}</div><div><h3>건물 최대 전력 변화 분포</h3>${stripChart(g.map(x => ({ label: x.label, v: x.p })), { color: COL.sun })}</div></div>
  <p class="small">점 = 건물, 상자 = 사분위 범위, 주황 선 = 중앙값. 보정 기준(기기 밀도 1.0, 냉동기 COP 배수 2.0) 대비.</p>
  <h2>3. 블록 합산 최대 전력(보조 지표)</h2>
  ${table([{ h: '대안', k: 'label' }, { h: '블록 최대 전력(kW)', k: 'peak_kW', num: 1, f: v => num(v) }, { h: '변화', k: 'dpeak_pct', num: 1, f: (v, r) => r.scenario === 'S1c' ? '—' : pct(v), cls: (v, r) => r.scenario === 'S1c' ? '' : bad(v) }, { h: '동시계수', k: 'CF', num: 1, f: v => num(v, 3) }, { h: '부하율', k: 'LF', num: 1, f: v => num(v, 3) }, { h: '블록 EUI 변화', k: 'dEUI_pct', num: 1, f: (v, r) => r.scenario === 'S1c' || v == null ? '—' : pct(v) }], blk, { nw: 1 })}
  ${lineChart([{ label: '개량 전', v: hr('S1c'), c: COL.ink }, { label: '블라인드 고정', v: hr('F0c'), c: COL.sun }, { label: '블라인드 일사 기준', v: hr('BT_T300c'), c: COL.ok, dash: '5 3' }], 24, { yl: '257동 합산 전력(kW)', xt: [[0, '0시'], [6, '6시'], [12, '12시'], [16, '16시'], [23, '23시']] })}
  <p class="small">${dl}(개량 전 블록 최대 전력이 생긴 날)의 시간별 합산 전력.</p>
  <p>동시계수 0.994는 257동이 거의 같은 시각에 최대 부하를 낸다는 뜻이며, 블록 최대 전력은 건물별 효과의 합과 같은 방향으로 움직였다. 블록 최대 전력을 가장 크게 바꾼 것은 외피가 아니라 건물 운전 시간의 시차였다.</p>
  ${note(SIMNOTE)}`;
}

/* ---------------- 페이지: 건물 특성별 ---------------- */
function pageTraits() {
  $('#page-traits').innerHTML = `
  <div class="kicker">밀집 조건에 따른 효과</div><h1>같은 개량, 다른 건물 — 효과의 방향이 바뀐다</h1>
  <p>257동을 건물 조건의 3개 구간으로 나누어 대안별 효과를 비교한다. 아래 표는 데이터베이스에 SQL로 질의해 브라우저에서 바로 계산한 값이다.</p>
  <div class="ctrl"><label>건물 조건<select id="tcls">${Object.entries(CLASS_DEF).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
  <label>지표<select id="tmet">${Object.entries(METRIC).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label></div>
  <div id="ttab"></div><div class="sql" id="tsql"></div>
  <h2>연속 변수와의 관계</h2>
  <div class="ctrl"><label>대안<select id="salt">${ORDER257.map(t => `<option value="${t}">${esc(altName(t))}</option>`).join('')}</select></label>
  <label>x축<select id="sx">${Object.entries(CONT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
  <label>y축<select id="sy">${Object.entries(METRIC).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label></div>
  <div id="scat"></div>
  <h2>예비 적용 조건</h2><div id="tcond"></div>
  ${note('구간 경계: 가려진 정도와 평면 면적은 257동의 3분위, 층수는 6~10·11~20·21층 이상(21층 이상은 10동뿐이므로 경향으로만 본다). 재계산에서는 구간 경계를 결과를 보기 전에 정한다. ' + SIMNOTE)}`;
  ['tcls', 'tmet'].forEach(id => $('#' + id).addEventListener('change', drawTraitTable));
  ['salt', 'sx', 'sy'].forEach(id => $('#' + id).addEventListener('change', drawScatter));
  drawTraitTable(); drawScatter(); drawConditions();
}
function drawTraitTable() {
  const c = $('#tcls').value, m = $('#tmet').value, M = METRIC[m];
  const sql = `SELECT ${c} AS grp, tag, ${m} AS v, (dEUI_pct < 0 AND dpeak_pct < 0) AS both\nFROM v_results\nWHERE tag IN (${ORDER257.map(t => `'${t}'`).join(', ')})`;
  const rows = q(sql); const lv = CLASS_DEF[c].levels.filter(l => rows.some(r => r.grp === l));
  const cell = (l, t) => { const s = rows.filter(r => r.grp === l && r.tag === t); const md = median(s.map(r => r.v)); const b = s.filter(r => r.both).length; return { md, n: s.length, b }; };
  let h = `<div class="tblwrap"><table class="tbl nw"><thead><tr><th>${CLASS_DEF[c].label}</th><th style="text-align:right">동수</th>${ORDER257.map(t => `<th style="text-align:right">${esc(altName(t))}</th>`).join('')}</tr></thead><tbody>`;
  for (const l of lv) { const n = rows.filter(r => r.grp === l && r.tag === ORDER257[0]).length; h += `<tr><td><b>${esc(l)}</b></td><td class="num">${n}</td>${ORDER257.map(t => { const x = cell(l, t); return `<td class="num ${M.cls(x.md)}">${M.f(x.md)}<br><span class="small">둘 다 감소 ${Math.round(100 * x.b / x.n)}%</span></td>`; }).join('')}</tr>`; }
  h += '</tbody></table></div>';
  $('#ttab').innerHTML = `<p class="small">셀 = ${M.label}의 건물별 중앙값 · "둘 다 감소" = EUI와 최대 전력을 함께 줄인 건물의 비율</p>` + h;
  $('#tsql').textContent = '-- 이 표를 만든 질의(중앙값은 브라우저에서 계산)\n' + sql + ';';
}
function drawScatter() {
  const t = $('#salt').value, x = $('#sx').value, y = $('#sy').value;
  const rows = q(`SELECT b.name, b.${x} AS x, r.${y} AS y, b.obstruction_class AS oc FROM results_257 r JOIN buildings b ON b.sim_name=r.sim_name WHERE r.tag=? AND b.${x} IS NOT NULL`, [t]);
  const sp = spearman(rows.map(r => r.x), rows.map(r => r.y));
  const oc = { '적게 가려짐': seq3[0], '중간': seq3[1], '많이 가려짐': seq3[2] };
  $('#scat').innerHTML = scatterChart(rows.map(r => ({ x: r.x, y: r.y, c: oc[r.oc], t: `${r.name}: ${num(r.x, 1)}, ${sgn(r.y)}` })), CONT[x], `${METRIC[y].label} (${y.endsWith('pp') ? '%p' : '%'})`, { noComma: x === 'approval_year' }) +
    `<p class="small">${esc(altName(t))} · 순위 상관 Spearman ρ = <b>${sgn(sp.rho, 2)}</b> (n = ${sp.n}) · 점 색: 가려진 정도(연한 = 적게, 진한 = 많이)</p>`;
}
function drawConditions() {
  const cb = JSON.parse(META.class_bounds);
  const med = (t, c, l, k) => median(q(`SELECT ${k} v FROM v_results WHERE tag=? AND ${c}=?`, [t, l]).map(r => r.v));
  const share = (t, c, l) => { const v = q(`SELECT dEUI_pct e, dpeak_pct p FROM v_results WHERE tag=? AND ${c}=?`, [t, l]); return Math.round(100 * v.filter(r => r.e < 0 && r.p < 0).length / v.length); };
  const rows = [
    { c: `주변 건물에 많이 가려진 건물(평균 차폐각 ${cb.obstruction_deg[1]}° 초과)`, a: '블라인드 고정 · 수직 핀 고정', e: `EUI ${pct(med('F0', 'obstruction_class', '많이 가려짐', 'dEUI_pct'))} · ${pct(med('VF_F0', 'obstruction_class', '많이 가려짐', 'dEUI_pct'))}, 최대 전력 ${pct(med('F0', 'obstruction_class', '많이 가려짐', 'dpeak_pct'))} · ${pct(med('VF_F0', 'obstruction_class', '많이 가려짐', 'dpeak_pct'))}(증가 폭이 가장 작음)`, w: 'UDI 감소, 최대 전력은 여전히 증가' },
    { c: `적게 가려진 건물(${cb.obstruction_deg[0]}° 이하)`, a: '블라인드 일사 기준(걷어 올림)', e: `EUI ${pct(med('BT_T300', 'obstruction_class', '적게 가려짐', 'dEUI_pct'))}, 최대 전력 ${pct(med('BT_T300', 'obstruction_class', '적게 가려짐', 'dpeak_pct'))}, 둘 다 감소 ${share('BT_T300', 'obstruction_class', '적게 가려짐')}%`, w: '감소 폭이 작음(1% 미만), 열쾌적 비율 조금 낮아짐' },
    { c: '적게 가려진 건물', a: '비권장: 대형 루버 고정·일사 기준', e: `EUI ${pct(med('LH_F0', 'obstruction_class', '적게 가려짐', 'dEUI_pct'))}·${pct(med('LT_T300', 'obstruction_class', '적게 가려짐', 'dEUI_pct'))}, 최대 전력 ${pct(med('LH_F0', 'obstruction_class', '적게 가려짐', 'dpeak_pct'))}·${pct(med('LT_T300', 'obstruction_class', '적게 가려짐', 'dpeak_pct'))}, 둘 다 감소 ${share('LH_F0', 'obstruction_class', '적게 가려짐')}%`, w: '—' },
    { c: '평면이 큰 건물', a: '블라인드 일사 기준', e: `EUI ${pct(med('BT_T300', 'footprint_class', '대', 'dEUI_pct'))}(소 ${pct(med('BT_T300', 'footprint_class', '소', 'dEUI_pct'))})`, w: '—' },
    { c: '최대 전력이 중요한 건물·블록', a: '블라인드 일사 기준', e: '주광을 잃는 대안은 모두 최대 전력을 높임', w: '피크 시간에 닫는 규칙은 오히려 불리(3개 동 +3.49%)' }];
  $('#tcond').innerHTML = table([{ h: '건물 조건', k: 'c' }, { h: '권장·비권장 대안', k: 'a', f: v => `<b>${esc(v)}</b>` }, { h: '근거(257동 중앙값)', k: 'e' }, { h: '주의할 점', k: 'w' }], rows);
}

/* ---------------- 페이지: 실측 비교 ---------------- */
function pageValid() {
  const v = q('SELECT * FROM validation');
  const cv = q("SELECT cv_rmse_cal c, cv_rmse_uncal u FROM buildings WHERE cv_rmse_cal IS NOT NULL AND split='시험용'");
  const bins = [0, 15, 30, 45, 60, 75, 90, 1e9], lab = ['~15', '15~30', '30~45', '45~60', '60~75', '75~90', '90~'];
  const hist = k => lab.map((_, i) => cv.filter(r => r[k] >= bins[i] && r[k] < bins[i + 1]).length);
  const hc = hist('c'), hu = hist('u'); const mx = Math.max(...hc, ...hu);
  const W = 760, H = 260, L = 50, B = 40, T = 30, bw = (W - L - 20) / lab.length;
  let s = '';
  lab.forEach((l, i) => { const x0 = L + i * bw; [[hu[i], COL.mut], [hc[i], COL.sun]].forEach(([n, c], j) => { const h = n / mx * (H - T - B); s += `<rect x="${x0 + 6 + j * (bw / 2 - 6)}" y="${H - B - h}" width="${bw / 2 - 8}" height="${h}" fill="${c}"><title>${n}동</title></rect><text x="${x0 + 6 + j * (bw / 2 - 6) + (bw / 2 - 8) / 2}" y="${H - B - h - 4}" text-anchor="middle">${n}</text>`; }); s += `<text x="${x0 + bw / 2}" y="${H - B + 16}" text-anchor="middle">${l}%</text>`; });
  s += `<line class="zero" x1="${L}" x2="${W - 20}" y1="${H - B}" y2="${H - B}"/><rect x="${L}" y="8" width="11" height="11" fill="${COL.mut}"/><text x="${L + 16}" y="17">보정 전</text><rect x="${L + 90}" y="8" width="11" height="11" fill="${COL.sun}"/><text x="${L + 106}" y="17">보정 후</text><line x1="${L + bw}" x2="${L + bw}" y1="${T}" y2="${H - B}" stroke="${COL.ok}" stroke-dasharray="4 3"/><text x="${L + bw + 4}" y="${T + 10}" fill="${COL.ok}">ASHRAE G14 기준 15%</text>`;
  $('#page-valid').innerHTML = `
  <div class="kicker">실측 비교</div><h1>모델은 개별 건물을 예측하지 못한다 — 그래서 상대 비교로만 쓴다</h1>
  <p>개량 전 모델의 월 전력을 건축HUB 건물에너지정보(2023–2024년 월별 전기)와 비교하여 ASHRAE Guideline 14의 월 기준(CV(RMSE) 15% 이하, NMBE ±5% 이내)에 대조하였다. 보정은 모든 건물에 공통인 전역 배율(${esc(META.calibration)})로 제한하였다.</p>
  ${table([{ h: '집합', k: 'subset' }, { h: '단계', k: 'stage' }, { h: '동수', k: 'n', num: 1 }, { h: 'CV(RMSE) 중앙값', k: 'cv_rmse_median', num: 1, f: v => num(v, 1) + '%' }, { h: '사분위', k: 'cv_rmse_q1', num: 1, f: (x, r) => `${num(r.cv_rmse_q1, 1)} ~ ${num(r.cv_rmse_q3, 1)}%` }, { h: 'NMBE 중앙값', k: 'nmbe_median', num: 1, f: v => sgn(v, 1) + '%' }, { h: 'G14 충족', k: 'n_pass_g14', num: 1, f: (x, r) => `${x}/${r.n}동` }], v, { nw: 1 })}
  <h3>시험용 건물의 CV(RMSE) 분포</h3>${svgEl(W, H, s)}
  <p>보정 후 시험용 215동의 월 CV(RMSE) 중앙값은 ${num(v.find(r => r.subset.startsWith('시험') && r.stage === '보정 전').cv_rmse_median, 1)}%에서 ${num(v.find(r => r.subset.startsWith('시험') && r.stage === '보정 후').cv_rmse_median, 1)}%로 줄었으나, 기준을 충족한 건물은 보정용 ${v.find(r => r.subset.startsWith('보정') && r.stage === '보정 후').n_pass_g14}/31동, 시험용 ${v.find(r => r.subset.startsWith('시험') && r.stage === '보정 후').n_pass_g14}/215동이었다. 따라서 결과는 개별 건물의 에너지 사용 예측이 아니라 같은 모델 위에서 개량 전후를 비교한 상대값으로만 해석한다. 건물별 월별 비교는 <a href="#/site">대상지·건물</a>에서 건물을 선택하면 볼 수 있다.</p>
  ${note('실측 원자료는 지번 단위 월별 사용량이며, 지역난방·가스 흡수식 냉방 등 모델(전기 냉동기)과 다른 설비의 영향이 섞여 있을 수 있다.')}`;
}

/* ---------------- 페이지: 생체모방 원리 ---------------- */
function pageBio() {
  const P = q('SELECT * FROM principles');
  const vcls = v => v.startsWith('채택') ? 'ok' : v.startsWith('기각') ? 'no' : 'mix';
  $('#page-bio').innerHTML = `
  <div class="kicker">부록 · 생체모방 제어 원리 4개</div><h1>생물 원리에서 유도한 제어 규칙은 통했는가</h1>
  <p>본 연구의 이전 단계에서는 외피 장치의 제어 규칙 일부를 생물의 환경 반응 원리에서 유도하였다. 원리는 ISO 18458:2015의 하향식 절차(기능 분석 → 추상화 → 전이)로, ① 외피의 빛·열 조절과 같은 기능을 가진 생물 기작일 것, ② 기존 외피 장치의 제어 규칙으로 옮길 수 있을 것, ③ 생물학 문헌으로 기작이 확인될 것을 기준으로 후보 아홉 가지 가운데 네 가지를 골랐다.</p>
  <div class="grid g2">${P.map(p => `<div class="card pcard"><h3><span class="mono">${p.code.replace('P', 'P')}</span>${esc(p.name)} <span class="small">— ${esc(p.organism)}</span></h3>
    <p><b>생물 원리.</b> ${esc(p.biology)}</p><p><b>외피 제어 규칙.</b> ${esc(p.rule)}</p><p><b>비교.</b> ${esc(p.comparison)}</p>
    <p><span class="verdict ${vcls(p.verdict)}">${esc(p.verdict)}</span></p><p class="small">${esc(p.evidence)}</p></div>`).join('')}</div>
  <h2>판정 기준</h2><p>원리 적용 안이 비교 안보다 블록 EUI와 블록 최대 전력을 높이지 않고, 3개 동 모두에서 UDI와 열쾌적 비율을 낮추지 않으면서, 넷 가운데 하나 이상을 개선하면 채택이다. P₄는 분산 배정이 블록 최대 전력을 낮추는지로 판정하였다. P₁~P₃의 판정 기준은 결과 일부를 본 뒤 정한 것이다.</p>
  <h2>본 연구에서의 위치</h2>
  <div class="card"><p>네 원리 가운데 P₂·P₃·P₄는 기각되었고, 채택된 P₁(ZB)도 비교 대상인 전 구역 태양 추종보다 나았을 뿐 개량 전(장치 없음)보다 나은 것은 아니었다. 또한 태양 추종(P₂)과 두 신호 작동(P₃)은 공학에서 이미 쓰이는 제어 규칙과 겹친다. 따라서 본 연구는 생체모방 원리를 연구의 틀로 두지 않고, 키네틱 파사드 제어 대안의 일부를 생물 원리에서 유도한 규칙으로 함께 시험한 결과로만 보고한다(예비심사 원고 부록).</p></div>
  ${note('상세 3개 동 블록의 EnergyPlus 시뮬레이션 값. P₃의 전기변색 유리 두 신호 안(이전 계산에서 채택)은 전기변색 유리를 연구 범위에서 제외함에 따라 판정에서 뺐다.')}`;
}

/* ---------------- 페이지: 향후 계획 ---------------- */
function pagePlan() {
  const D = q('SELECT * FROM districts');
  $('#page-plan').innerHTML = `
  <div class="kicker">한계와 향후 계획</div><h1>재계산, 그리고 국가승인통계의 서울 오피스 3권역으로</h1>
  <h2>재계산</h2><ol>
  <li><b>대안·지표 확정</b> — 재계산 전에 개량 대안, 지표, 적용 조건의 판단 기준을 확정한다.</li>
  <li><b>257동</b> — 태양 추종 3종과 피크 시간 폐쇄를 257동에서도 계산하여 3개 동과 같은 대안 구성으로 맞춘다.</li>
  <li><b>차폐 포함·제외 비교</b> — 같은 건물에서 주변 건물 차폐를 넣은 경우와 뺀 경우를 대안별로 계산하여 밀집환경의 영향을 분리한다.</li>
  <li><b>밀집 조건 지표</b> — 평균 차폐각 외에 입면별 하늘 가림 비율 등 밀집 조건을 나타내는 지표를 정리하고, 구간 경계를 결과를 보기 전에 정한다.</li>
  <li><b>지표 추가</b> — 공간 주광 자율성(sDA)과 과다 일사 노출(ASE)을 추가하고, 눈부심은 대표 실에서 계산하거나 한계로 밝힌다.</li></ol>
  <h2>확장 — 업무 기능 지구단위계획구역의 가구별 전체 건물</h2>
  <div class="card"><p><b>권역의 근거.</b> ${esc(META.basis)}</p><p><b>블록.</b> 국내에는 "업무지구"라는 법정 용도지역이 없으므로, 도시관리계획으로 결정·고시된 지구단위계획구역을 도시계획도로로 나눈 가구(街區, 2,000 m² 이상)를 블록으로 쓴다(결정도의 가구 번호와는 재계산 전에 대조). 가구 안의 모든 건물을 모아 주변 차폐와 가구 합산에 쓰고, 개량 효과의 분석 대상은 업무시설 6층 이상 건물로 한다. <a href="#/gen">자료 생성기</a>에서 권역을 고르면 가구와 건물 자료를 바로 만들 수 있다.</p></div>
  ${table([{ h: '권역', k: 'code', f: (v, r) => `<b>${v}</b> ${esc(r.name)}` }, { h: '범위', k: 'extent' }, { h: '내용', k: 'note' }, { h: '상태', k: 'status', f: v => `<span class="tag ${v === "진행 중" ? "sun" : "mut"}" style="white-space:nowrap">${esc(v)}</span>` }], D)}
  ${gbdSection()}
  <div class="flow"><div><b>경계</b>지구단위계획구역 − 도시계획도로 = 가구(서울 UPIS 2026-09)</div><div><b>건물</b>OpenStreetMap 윤곽 + 건축물대장·건축HUB(공공데이터 포털)</div><div><b>모델</b>저층·소규모는 간이 모델 — 오차는 역삼 257동에서 상세 모델과 먼저 비교</div><div><b>지표</b>건물 조건별·가구별 개량 효과</div></div>
  <h2>한계</h2><ol><li>모든 결과는 시뮬레이션 값이며, 실측 기준을 충족한 건물이 적어 상대 비교로만 해석한다.</li><li>외피와 설비는 원형 모델 값이며, 실제 건물의 외피·설비·운전 시간은 반영하지 못하였다. 다수 건물의 효과 크기는 냉동기 효율 가정(COP 배수 2.0)에 따라 달라진다.</li><li>개량 비용, 장기 성능, 실제 작동, 재실자 만족도는 다루지 않는다. 전기변색 유리 같은 가변 유리는 범위에서 제외하였다.</li></ol>
  <h2>일정(안)</h2>${table([{ h: '시기', k: 'a' }, { h: '내용', k: 'b' }], [{ a: '2026년 11월 9일', b: '예비심사: 목적·방법·예비 결과·재계산과 확장 계획 발표' }, { a: '2026년 11~12월', b: '대안·지표 확정, 상세 3개 동·257동 재계산, sDA·ASE 추가' }, { a: '2027년 1~3월', b: '3권역 가구별 자료 확보(건축물대장 결합), 간이 모델 검증, 가구별 계산' }, { a: '2027년 4~6월', b: '분석·집필, 본심사 원고' }, { a: '2027년 9월', b: '학위 수여' }])}`;
}


/* 강남 권역 가구별 예비 수치(테헤란로제2지구 가구 안 140동) */
function gbdSection() {
  const G = q('SELECT * FROM gbd_blocks'); if (!G.length) return '';
  const all = G.find(r => r.gagu === 'ALL'), blk = G.filter(r => r.gagu !== 'ALL'); if (!all) return '';
  const rows = ORDER257.map(t => ({ name: altName(t), dE: all[t + '_dE'], dP: all[t + '_dP'], both: all[t + '_both'], bothG: blk.filter(r => r[t + '_dE'] < 0 && r[t + '_dP'] < 0).length, rng: `${pct(Math.min(...blk.map(r => r[t + '_dE'])))} ~ ${pct(Math.max(...blk.map(r => r[t + '_dE'])))}` }));
  return `<h2>강남 권역 가구별 예비 수치 — 테헤란로제2지구 가구 ${blk.length}개, ${all.n}동</h2>
  <p>역삼 257동 가운데 테헤란로제2지구 지구단위계획구역의 가구 안에 있는 ${all.n}동을 가구별로 묶어, 이미 계산한 EnergyPlus 시간별 결과를 더하였다(가구 EUI = 가구 안 건물의 연간 에너지 합 ÷ 연면적 합, 가구 최대 전력 = 시간별 전력 합의 연간 최댓값, 개량 전(보정 기준) 대비). 가구 안의 다른 건물(6층 미만 등)은 아직 계산하지 않았으므로 가구 전체 값이 아니다.</p>
  ${table([{ h: '대안', k: 'name' }, { h: '140동 합산 EUI', k: 'dE', num: 1, f: v => pct(v), cls: bad }, { h: '140동 합산 최대 전력', k: 'dP', num: 1, f: v => pct(v), cls: bad }, { h: '가구별 EUI 범위', k: 'rng', num: 1 }, { h: '둘 다 감소한 가구', k: 'bothG', num: 1, f: v => `${v}/${blk.length}` }, { h: '둘 다 감소한 건물', k: 'both', num: 1, f: v => `${v}/${all.n}` }], rows, { nw: 1 })}
  <details><summary class="small">가구별 표 보기(${blk.length}개 가구)</summary>${table([{ h: '가구', k: 'gagu' }, { h: '건물', k: 'n', num: 1 }, { h: '개량 전 최대 전력(kW)', k: 'peak0_kW', num: 1, f: v => num(v) }, ...['F0', 'BT_T300', 'LH_F0'].flatMap(t => [{ h: altName(t) + ' EUI', k: t + '_dE', num: 1, f: v => pct(v), cls: bad }, { h: '최대 전력', k: t + '_dP', num: 1, f: v => pct(v), cls: bad }])], blk, { nw: 1, maxh: 420 })}</details>
  ${note('가구 번호는 서울 UPIS 지구단위계획구역(UQ161)을 도시계획도로(UQ151)로 나눈 순번이며 결정도의 가구 번호와는 재계산 전에 대조한다. ' + SIMNOTE)}`;
}

/* ---------------- 페이지: 데이터베이스 ---------------- */
const PRESETS = {
  '대안별 257동 요약': "SELECT a.name AS 대안, COUNT(*) AS 동수,\n       ROUND(AVG(r.dEUI_pct), 3) AS EUI_변화_평균,\n       SUM(r.dEUI_pct < 0) AS EUI_감소_동수,\n       SUM(r.dEUI_pct < 0 AND r.dpeak_pct < 0) AS 둘다_감소_동수\nFROM results_257 r JOIN alternatives a ON a.tag = r.tag\nWHERE a.category NOT LIKE '범위 제외%' AND a.tag <> 'S1'\nGROUP BY r.tag ORDER BY a.sort",
  '많이 가려진 건물 상위 10동': "SELECT name, block, floors, obstruction_deg, obstruction_class\nFROM buildings ORDER BY obstruction_deg DESC LIMIT 10",
  '가려진 정도 × 블라인드 고정': "SELECT obstruction_class, COUNT(*) n, ROUND(AVG(dEUI_pct), 3) EUI_평균, ROUND(AVG(dpeak_pct), 3) 최대전력_평균\nFROM v_results WHERE tag = 'F0' GROUP BY obstruction_class",
  '대블록별 블록 최대 전력': "SELECT block, scenario, peak_kW, dpeak_pct, CF, peak_time\nFROM block_257_by_block WHERE scenario IN ('S1c', 'F0c', 'BT_T300c') ORDER BY block, scenario",
  '실측 기준 충족 건물': "SELECT name, split, cv_rmse_cal, nmbe_cal FROM buildings\nWHERE cv_rmse_cal <= 15 AND ABS(nmbe_cal) <= 5",
};
function pageDb() {
  const tabs = q("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name");
  const desc = { meta: '연구 메타 정보(제목·목적·범위·독창성·구간 경계)', blocks: '4개 대블록(경계, 건물 수, 개량 전 블록 지표)', block_meta: '대상지 중심·도로', buildings: '257동 건물 속성(형태·밀집 조건·실측 비교·좌표·윤곽)', alternatives: '개량 대안(구분·장치·작동·주광·계산 범위·원리)', results_3bldg: '상세 3개 동 블록 결과(개량 전 대비)', results_257: '257동 × 대안 건물별 결과(보정 기준 대비)', block_257: '257동 블록 합산 지표', block_257_by_block: '대블록별 블록 지표', block_257_hourly: '257동 합산 시간별 전력(8,760시간 × 9개 안)', validation: '실측 비교 요약(ASHRAE G14)', monthly: '건물별 월별 전력: 실측과 모델(보정 후)', principles: '생체모방 제어 원리 4개와 판정', districts: '3대 업무권역 확장 계획', gbd_blocks: '강남 테헤란로제2지구 가구별 예비 수치(257동 중 140동, 대안별 EUI·최대 전력 변화)', gbd_assign: '257동 건물 → 테헤란로제2지구 가구 배정', v_results: '보기: 결과 + 대안 + 건물 조건 결합' };
  const sch = tabs.map(t => { const cols = q(`PRAGMA table_info(${t.name})`).map(c => c.name); const n = q1(`SELECT COUNT(*) n FROM ${t.name}`).n; return { name: t.name, type: t.type === 'view' ? '보기' : '표', n, d: desc[t.name] || '', cols: cols.join(', ') }; });
  const csv = tabs.filter(t => t.type === 'table' && t.name !== 'block_257_hourly');
  $('#page-db').innerHTML = `
  <div class="kicker">연구 데이터베이스</div><h1>SQLite 하나에 모든 수치를 담았다</h1>
  <p>이 사이트의 모든 표와 그림은 <code>data/db/research.sqlite</code>를 브라우저에서 열어(sql.js) 질의한 결과이다. 데이터베이스는 계산 결과 내보내기와 원자료에서 <code>tools/build_db.py</code>로 다시 만들 수 있다. 생성 시각 ${esc(META.built)}.</p>
  <p><a class="btn sun" href="data/db/research.sqlite" download>research.sqlite 내려받기</a> &nbsp; ${csv.map(t => `<a class="tag" href="data/db/csv/${t.name}.csv" download>${t.name}.csv</a>`).join('')}</p>
  <h2>구성</h2>${table([{ h: '이름', k: 'name', f: v => `<code>${v}</code>` }, { h: '종류', k: 'type' }, { h: '행', k: 'n', num: 1, f: v => num(v) }, { h: '내용', k: 'd' }, { h: '열', k: 'cols', f: v => `<span class="small mono">${esc(v)}</span>` }], sch)}
  <h2>SQL 질의</h2>
  <div class="ctrl"><label>예시<select id="qpre">${Object.keys(PRESETS).map(k => `<option>${esc(k)}</option>`).join('')}</select></label><button class="btn" id="qrun">실행</button></div>
  <textarea class="sqlin" id="qtxt" spellcheck="false"></textarea><div id="qout"></div>
  ${note('브라우저 안의 사본에서만 실행되며 원본 파일은 바뀌지 않는다. 결과는 최대 500행까지 표시한다. ' + SIMNOTE)}`;
  const setPre = () => { $('#qtxt').value = PRESETS[$('#qpre').value]; };
  $('#qpre').addEventListener('change', () => { setPre(); runQ(); }); $('#qrun').addEventListener('click', runQ); setPre(); runQ();
}
function runQ() {
  try { const res = DB.exec($('#qtxt').value); if (!res.length) { $('#qout').innerHTML = '<p class="small">결과 없음</p>'; return; } const r = res[res.length - 1]; const rows = r.values.slice(0, 500).map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])));
    $('#qout').innerHTML = `<p class="small">${r.values.length}행</p>` + table(r.columns.map(c => ({ h: c, k: c, f: v => typeof v === 'number' ? num(v, Number.isInteger(v) ? 0 : 3) : esc(v) })), rows, { nw: 1, maxh: 420 });
  } catch (e) { $('#qout').innerHTML = `<div class="warn">${esc(e.message)}</div>`; }
}

/* ---------------- 라우팅 ---------------- */
const PAGES = { home: pageHome, site: pageSite, alts: pageAlts, results: pageResults, traits: pageTraits, valid: pageValid, bio: pageBio, plan: pagePlan, db: pageDb, gen: () => pageGen(), live: () => pageLive() };
const BUILT = {};
function route() {
  const r = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'home'; const key = PAGES[r] ? r : 'home';
  if (!BUILT[key]) { PAGES[key](); BUILT[key] = 1; }
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + key));
  $$('nav a').forEach(a => a.classList.toggle('on', a.dataset.r === key));
  document.body.classList.remove('navopen');
  if (key === 'gen' && GEN.map) setTimeout(() => GEN.map.invalidateSize(), 0);
  if (key === 'live' && LIVE.map) setTimeout(() => { LIVE.map.invalidateSize(); liveDraw(); }, 0);
  if (key === 'site') { setTimeout(() => { drawMap(); MAP.invalidateSize(); if (!$('#btable').innerHTML) drawBTable(); }, 0); }
  window.scrollTo(0, 0);
}
(async function boot() {
  try {
    const SQL = await initSqlJs({ locateFile: f => 'app/vendor/' + f });
    const buf = await (await fetch('data/db/research.sqlite')).arrayBuffer();
    DB = new SQL.Database(new Uint8Array(buf));
    for (const r of q('SELECT key, value FROM meta')) META[r.key] = r.value;
    for (const a of q('SELECT * FROM alternatives')) ALT[a.tag] = a;
    $('#boot').remove();
    window.addEventListener('hashchange', route); route();
  } catch (e) { $('#boot').innerHTML = `데이터베이스를 불러오지 못했습니다: ${esc(e.message)}`; console.error(e); }
})();
