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
const sgn = (x, d = 2, u = '') => (x == null || Number.isNaN(+x)) ? '—' : (+(+x).toFixed(d) === 0 ? (0).toFixed(d) + u : (+x > 0 ? '+' : '−') + Math.abs(+x).toFixed(d) + u);
const pct = (x, d = 2) => sgn(x, d, '%');
const pp = (x, d = 2) => sgn(x, d, '%p');
const pr = (a, b, d = 2) => `${sgn(a, d)}~${pct(b, d)}`;   // 범위 표기: +0.88~+1.32%(원고와 같은 형식)
const num = (x, d = 0) => (x == null || Number.isNaN(+x)) ? '—' : (+x).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
const bad = x => (x == null ? '' : +x > 0 ? 'pos' : +x < 0 ? 'neg' : '');      // EUI·피크전력: 증가 = 나쁨
const good = x => (x == null ? '' : +x < 0 ? 'pos' : +x > 0 ? 'neg' : '');     // UDI·열쾌적: 감소 = 나쁨
const median = a => { const s = a.filter(v => v != null && !Number.isNaN(v)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quant = (a, p) => { const s = a.filter(v => v != null).sort((x, y) => x - y); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; }
function spearman(x, y) { const ok = x.map((v, i) => v != null && y[i] != null); const xs = x.filter((_, i) => ok[i]), ys = y.filter((_, i) => ok[i]); const rx = ranks(xs), ry = ranks(ys); const n = rx.length, mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; } return { rho: sxy / Math.sqrt(sxx * syy), n }; }

// 본문 범위의 대안과 표시 순서
const ORDER = ['F0', 'LH_F0', 'VF_F0', 'S3', 'LH_C', 'VF_C', 'BT_T300', 'LT_T300', 'PK'];
const ORDER257 = ORDER;   // 2026-10-27: 9개 대안 모두 257동에서 같은 계산 기간(연중)으로 계산, 일사량 기준 제어는 냉방기 작동
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
const METRIC = { dEUI_pct: { label: 'EUI 변화', f: pct, cls: bad }, dpeak_pct: { label: '건물 피크전력 변화', f: pct, cls: bad }, dUDI_pp: { label: 'UDI 변화', f: pp, cls: good }, dPMV_pp: { label: '열쾌적 비율 변화', f: pp, cls: good } };
const CONT = { obstruction_deg: '평균 차폐각(°)', footprint_model_m2: '모델 평면 면적(m²)', floors: '지상 층수', approval_year: '사용승인 연도' };

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
const SIMNOTE = 'EnergyPlus 23.2 시뮬레이션 값이며 실측값이 아니다. 예비심사 원고 기준 예비 결과(9개 대안, 계산 기간 연중, 일사량 기준 제어는 냉방기 5~9월 작동, 2026-10-27~28 재계산)이다.';

/* ---------------- 페이지: 개요 ---------------- */
function pageHome() {
  const nB = q1('SELECT COUNT(*) n FROM buildings').n;
  const nAlt = ORDER.length;
  const r = {}; for (const t of ORDER257) { const v = q('SELECT dEUI_pct e, dpeak_pct p FROM results_257 WHERE tag=?', [t]); r[t] = { e: median(v.map(x => x.e)), p: median(v.map(x => x.p)), both: v.filter(x => x.e < 0 && x.p < 0).length, n: v.length }; }
  const eMeds = Object.values(r).map(x => x.e);
  const obs = cls => q("SELECT dEUI_pct e, dpeak_pct p FROM v_results WHERE tag=? AND obstruction_class=?", [cls[0], cls[1]]);
  const f0hi = obs(['F0', '많이 가려짐']), lhlo = obs(['LH_F0', '적게 가려짐']), lhhi = obs(['LH_F0', '많이 가려짐']);
  const cb = JSON.parse(META.class_bounds);
  $('#page-home').innerHTML = `
  <div class="titleblock">
    <div class="kicker">예비심사 원고 기준 · 2026-10-27~28 재계산(일사량 기준 제어는 냉방기 작동, 차폐 포함·제외)</div>
    <h1>${esc(META.title_ko)}</h1>
    <p class="en">${esc(META.title_en)}</p>
    <div class="small">${esc(META.author)}</div>
  </div>
  <div class="purpose"><b>연구 목적</b><br>${esc(META.purpose)}</div>
  <div class="grid g4" style="margin:18px 0">
    <div class="card tick stat"><b>${nB}동</b><span>역삼역 일대 4개 대블록의 업무 용도 건물</span><em>상세 모델 3개 동 포함</em></div>
    <div class="card tick stat"><b>${nAlt}개</b><span>외피 성능 개선안</span><em>고정형 차양 3 · 키네틱 파사드 6</em></div>
    <div class="card tick stat"><b class="sun">${pr(Math.min(...eMeds), Math.max(...eMeds))}</b><span>257동 건물별 EUI 변화 중앙값의 범위</span><em>9개 대안, 주변 차폐 포함</em></div>
    <div class="card tick stat"><b class="kin">${r.BT_T300.both}동</b><span>EUI와 피크전력을 함께 줄인 건물(블라인드 일사량 기준 제어, 257동 중)</span><em>나머지 8개 대안은 ${Math.max(...ORDER257.filter(t => t !== 'BT_T300').map(t => r[t].both))}동 이하</em></div>
  </div>
  <div class="grid g2">
    <div class="card"><h3>연구 질문</h3><ol class="qlist">
      <li>외피 성능을 개선하면 기존 업무시설의 연간 에너지 사용량, 피크전력, 자연채광, 열쾌적은 개선 전보다 얼마나 달라지는가?</li>
      <li>고정형 차양과 키네틱 파사드는 어떤 지표에서 서로 다르며, 그 차이의 원인은 무엇인가?</li>
      <li>밀집지역의 건물 조건(주변 건물에 가려진 정도, 평면 규모, 층수)에 따라 효과는 어떻게 달라지며, 각 대안을 적용할 만한 조건은 무엇인가?</li></ol></div>
    <div class="card"><h3>독창성</h3><p>${esc(META.originality)}</p><h3>범위</h3><p>${esc(META.scope)}</p></div>
  </div>
  <h2>연구 흐름</h2>
  <div class="flow"><div><b>01 자료 결합</b>OpenStreetMap 건물 윤곽·높이 + 건축물대장 용도·층수·연면적</div><div><b>02 자동 모델</b>건물마다 EnergyPlus 모델(DOE 대형 사무소 기준 모델, 주변 건물 차폐)</div><div><b>03 실측 비교</b>건축HUB 월별 전기와 비교(ASHRAE Guideline 14)</div><div><b>04 성능 개선안</b>고정형 차양 · 키네틱 파사드 적용, 개선 전후 비교</div><div><b>05 건물 조건별 지표</b>가려진 정도·평면 규모·층수별 효과, 주변 차폐 포함·제외 비교, 블록 피크전력(보조)</div></div>
  <h2>예비 결과 요약</h2>
  <div class="grid g3">
    <div class="card"><h3>① 연중 작동하는 키네틱은 EUI를 높였다</h3><p>EUI 중앙값이 줄어든 대안은 고정형 3종(블라인드 고정 ${pct(r.F0.e)})과 냉방기에만 작동하는 일사량 기준 제어 2종(블라인드 ${pct(r.BT_T300.e)}, 수평 루버 ${pct(r.LT_T300.e)})이었다. 연중 작동하는 키네틱 4종(컷오프 각도 제어 3종, 피크 시간대 차양 폐쇄)은 모두 늘었다(${pr(Math.min(...['S3', 'LH_C', 'VF_C', 'PK'].map(t => r[t].e)), Math.max(...['S3', 'LH_C', 'VF_C', 'PK'].map(t => r[t].e)))}). 원인은 컷오프 각도 제어에서는 겨울 일사 취득 감소에 따른 난방 증가, 피크 시간대 차양 폐쇄에서는 자연채광 감소에 따른 조명 증가였다.</p><a href="#/results">결과 →</a></div>
    <div class="card"><h3>② 피크전력을 줄인 것은 하나</h3><p>블라인드 일사량 기준 제어(냉방기)만 피크전력을 줄였고 EUI와 피크전력을 함께 줄인 건물도 가장 많았으나(${r.BT_T300.both}동), 크기는 매우 작았다(EUI ${pct(r.BT_T300.e)}, 피크전력 ${pct(r.BT_T300.p)}, 블록 −0.34%·약 205 kW). 같은 대안을 연중 작동시키면 겨울 난방이 늘어 EUI가 +2.98%로 바뀌었다. 피크 시간대 차양 폐쇄는 피크전력을 가장 크게 높였다(${pct(r.PK.p)}).</p><a href="#/alts">성능 개선안 →</a></div>
    <div class="card"><h3>③ 밀집 조건이 방향을 바꾼다</h3><p>8개 대안은 주변 건물에 많이 가려진 건물일수록 EUI 증가가 작거나 감소가 컸다(ρ = −0.59~−0.74). 많이 가려진 건물에서는 연중 작동하는 키네틱 일부도 EUI가 줄었다(블라인드 컷오프 각도 제어 −1.07%, 수평 루버 컷오프 각도 제어 −0.75%). 블라인드 일사량 기준 제어만 덜 가려진 건물에서 감소가 컸다(ρ = +0.57). 많이 가려진 건물(평균 차폐각 ${cb.obstruction_deg[1]}° 초과)에서는 블라인드 고정의 EUI 감소(${pct(median(f0hi.map(x => x.e)))})가 가장 컸고, 수평 루버 고정은 많이 가려진 건물에서 ${pct(median(lhhi.map(x => x.e)))}, 적게 가려진 건물(${cb.obstruction_deg[0]}° 이하)에서 ${pct(median(lhlo.map(x => x.e)))}로 방향이 뒤집혔다(구간에 따라 방향이 뒤집힌 대안 6개). 같은 건물에서 주변 차폐를 빼고 계산하면 블라인드 일사량 기준 제어를 제외한 8개 대안의 EUI 변화가 모두 높아졌다(블라인드 고정 −1.18% → +0.02%, 연중 작동 키네틱 4종 +3.51~+7.28%). 고정형의 절감은 주로 주변 건물에 이미 가려진 조건에서 나타났고, 블라인드 일사량 기준 제어만 차폐를 빼도 감소를 유지하였다(−0.13%).</p><a href="#/traits">건물 특성별 →</a></div>
  </div>
  ${note('결론의 성격: "키네틱 파사드가 좋다"를 보이는 것이 아니라, 서울 업무시설 밀집지역의 기존 건물에서 어떤 성능 개선이 어떤 건물 조건에서 얼마만큼 효과가 있고 없는지를 수치로 밝히는 평가 연구이다. ' + SIMNOTE)}`;
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
  <h1>서울 오피스 3권역 — 계산을 마친 역삼 257동과 계산 예정 가구</h1>
  <p>지도에는 연구 대상인 3권역(도심, 강남, 여의도·마포)의 지구단위계획구역과 가구 경계가 모두 나온다. 그 가운데 EnergyPlus 계산을 마친 것은 강남 테헤란로의 역삼역사거리를 중심으로 간선도로(봉은사로·역삼로·강남대로·언주로, 내부의 테헤란로·논현로)로 나뉜 4개 대블록 안의 지상 6층 이상 건물 가운데 업무 용도이고 공개 자료로 모델을 만들 수 있었던 257동(업무시설 245동, 업무 용도가 섞인 제2종 근린생활시설 12동)이며, 건물별 결과 색은 이 257동에만 있다. 나머지 가구(도심·여의도와 강남의 다른 가구)는 경계만 표시하고 2027년 1~3월에 계산한다. 지도의 건물이나 표의 행을 누르면 건물별 개선 전후 결과와 실측 비교를 볼 수 있다.</p>
  <p class="small">연구 대상은 국가승인통계가 정한 서울 오피스 3권역(도심, 강남, 여의도·마포) 안의 업무 기능 지구단위계획구역 가구이다(강남 테헤란로제2지구 가구 82개, 여의도 금융중심 21개, 도심 27개 구역 가구 87개; <a href="#/plan">향후 계획</a>). 지금까지 EnergyPlus 계산을 마친 것은 강남 권역의 이 257동이며(그중 140동이 테헤란로제2지구 가구 40개 안), 이 페이지와 결과 페이지의 수치는 모두 이 257동의 예비 결과이다. 도심·여의도와 강남의 나머지 가구는 2027년 1~3월에 계산한다(가구·건물 자료는 <a href="#/gen">자료 생성기</a>에서 볼 수 있다).</p>
  <div class="ctrl">
    <label>권역<select id="mregion"><option value="">3권역 전체</option><option value="강남(GBD)">강남 — 역삼 257동 계산 완료</option><option value="도심(CBD)">도심 — 계산 예정</option><option value="여의도·마포(YBD)">여의도·마포 — 계산 예정</option><option value="yeoksam">역삼 4개 대블록(확대)</option></select></label>
    <label>지도 색 기준<select id="mcolor"><option value="block">대블록</option><option value="obstruction_class">주변 건물에 가려진 정도</option><option value="footprint_class">평면 면적(모델)</option><option value="floors_class">지상 층수</option><option value="dEUI_pct">대안별 EUI 변화</option><option value="dpeak_pct">대안별 피크전력 변화</option></select></label>
    <label>대안<select id="malt">${alts}</select></label>
    <label>주변 차폐<select id="mcond"><option value="차폐 포함">포함(본 결과)</option><option value="차폐 제외">제외(비교)</option></select></label>
    <label>검색<input type="search" id="msearch" placeholder="건물 이름"></label>
    <label>대블록<select id="mblock"><option value="">전체</option><option>NE</option><option>NW</option><option>SE</option><option>SW</option></select></label>
  </div>
  <div class="grid g2" style="grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)">
    <div><div id="map"></div><div id="mleg" class="maplegend" style="margin-top:6px"></div></div>
    <div class="card detail" id="bdetail"><h3>건물을 선택하세요</h3><p class="small">지도에서 건물을 누르거나 아래 표에서 행을 누르면 여기에 나타난다.</p></div>
  </div>
  <h2>건물 목록</h2><div id="btable"></div>
  ${note('평면 면적은 등가 직사각형 모델의 평면 면적, 가려진 정도는 창에서 본 주변 건물의 평균 차폐각이다. ' + SIMNOTE)}`;
  ['mcolor', 'malt', 'mblock', 'mcond'].forEach(id => $('#' + id).addEventListener('change', () => { drawMap(); drawBTable(); }));
  $('#mregion').addEventListener('change', () => zoomRegion($('#mregion').value));
  $('#msearch').addEventListener('input', drawBTable);
}
const mcond = () => ($('#mcond') || {}).value || '차폐 포함';
function siteRows() {
  const t = $('#malt').value, blk = $('#mblock').value, s = ($('#msearch').value || '').trim();
  const cd = mcond();
  let sql = `SELECT b.*, r.dEUI_pct, r.dpeak_pct, r.dUDI_pp FROM buildings b LEFT JOIN results_257_cond r ON r.sim_name=b.sim_name AND r.tag=? AND r.cond=? WHERE 1=1`; const p = [t, cd];
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
    drawRegions();
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
  else { const lim = mode === 'dEUI_pct' ? 2 : 3; leg = `${altName($('#malt').value)}(주변 차폐 ${mcond() === '차폐 제외' ? '제외' : '포함'}) · ${METRIC[mode].label}: ` + [-lim, -lim / 2, 0, lim / 2, lim].map(v => `<span><i style="background:${divColor(v, lim)}"></i>${pct(v, 1)}</span>`).join(' ') + ' (초록 = 감소, 빨강 = 증가)'; }
  $('#mleg').innerHTML = leg;
}
/* 3권역(도심·강남·여의도·마포)의 지구단위계획구역·가구 경계를 대상지 지도에 겹친다. 자료: data/upis(서울 UPIS 2026-09, 자료 생성기와 같은 파일).
   계산을 마친 건물은 역삼 257동뿐이므로 다른 가구는 경계만 그린다(상태는 districts 표). */
const REG = { layers: {}, bounds: {}, done: false };
const REG_COL = { '도심(CBD)': '#7a4f9d', '강남(GBD)': '#1f6f8b', '여의도·마포(YBD)': '#b06a2a' };
async function drawRegions() {
  if (REG.done || typeof PRESET === 'undefined') return; REG.done = true;
  const D = Object.fromEntries(q('SELECT code, name, status FROM districts').map(r => [r.code, r]));
  const CODE = { '도심(CBD)': 'CBD', '강남(GBD)': 'GBD', '여의도·마포(YBD)': 'YBD' };
  const gbdDone = new Set(q('SELECT DISTINCT plan_id || "-" || gagu k FROM gbd_assign').map(r => r.k));
  const nDone = Object.fromEntries(q('SELECT plan_id || "-" || gagu k, COUNT(*) n FROM gbd_assign GROUP BY 1').map(r => [r.k, r.n]));
  try {
    const [plans, pj] = await Promise.all([fetch('data/upis/plans.geojson').then(r => r.json()), fetch('data/upis/plans.json').then(r => r.json())]);
    const info = Object.fromEntries(pj.plans.map(p => [p.id, p]));
    const gus = new Set(Object.values(PRESET).flat().map(id => info[id] && info[id].gu).filter(Boolean));
    const blocks = {};
    await Promise.all([...gus].map(async g => { try { const j = await (await fetch(`data/upis/blocks_${g}.geojson`)).json(); for (const f of j.features) (blocks[f.properties.plan_id] = blocks[f.properties.plan_id] || []).push(f); } catch (e) { } }));
    for (const [reg, ids] of Object.entries(PRESET)) {
      const col = REG_COL[reg], st = (D[CODE[reg]] || {}).status || '';
      const g = L.featureGroup();
      const sel = new Set(ids); let nb = 0;
      for (const f of plans.features) {
        if (!sel.has(f.properties.id)) continue;
        const p = info[f.properties.id] || {};
        L.geoJSON(f, { style: { color: col, weight: 2.2, dashArray: '8 5', fill: false } }).bindTooltip(`${esc(p.name || f.properties.id)} · ${reg} · ${esc(st)}`).addTo(g);
        for (const b of blocks[f.properties.id] || []) {
          const k = `${b.properties.plan_id}-${b.properties.block}`; const nd = nDone[k];
          L.geoJSON(b, { style: { color: col, weight: 0.8, fillColor: col, fillOpacity: nd ? 0.22 : 0.06 } })
            .bindTooltip(`${esc(p.name || '')} 가구 ${b.properties.block} · ${num(b.properties.area_m2)} m²` + (nd ? ` · 257동 중 ${nd}동 계산 완료(가구별 예비 수치)` : ` · EnergyPlus 계산 예정(2027년 1~3월)`)).addTo(g); nb++;
        }
      }
      g.addTo(MAP); REG.layers[reg] = g;
      if (g.getLayers().length) {
        REG.bounds[reg] = g.getBounds();
        L.marker(g.getBounds().getCenter(), { icon: L.divIcon({ className: 'reglabel', html: `<span style="border-color:${col};color:${col}">${esc(reg)}<br><small>가구 ${nb}개 · ${esc(st)}</small></span>`, iconSize: [160, 40], iconAnchor: [80, 20] }), interactive: false }).addTo(MAP);
      }
    }
    const all = L.featureGroup(Object.values(REG.layers)); REG.bounds[''] = all.getBounds();
    if (!$('#mregion').value) MAP.fitBounds(all.getBounds().pad(0.05));
    MAP.on('zoomend', () => { const z = MAP.getZoom(); Object.values(REG.layers).forEach(g => g.eachLayer(l => { if (l.setStyle && l.options.style && !l.options.style.dashArray) l.setStyle({ weight: z >= 14 ? 0.8 : 0.3 }); })); });
  } catch (e) { console.warn('권역 경계 표시 실패', e); }
}
function zoomRegion(v) {
  if (!MAP) return;
  if (v === 'yeoksam') { const c = JSON.parse(q1("SELECT value v FROM block_meta WHERE key='center'").v); MAP.setView(c, 16); return; }
  const b = REG.bounds[v]; if (b) MAP.fitBounds(b.pad(0.05));
}
function drawBTable() {
  const rows = siteRows().sort((a, b) => { const x = a[SORT.k], y = b[SORT.k]; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * SORT.d; });
  const t = altName($('#malt').value) + (mcond() === '차폐 제외' ? '(차폐 제외)' : '');
  $('#btable').innerHTML = `<p class="small">${rows.length}동 · 열 제목을 누르면 정렬된다.</p>` + table([
    { h: '건물', k: 'name', sort: 1 }, { h: '블록', k: 'block', sort: 1 }, { h: '층수', k: 'floors', num: 1, sort: 1 }, { h: '평면(m²)', k: 'footprint_model_m2', num: 1, sort: 1, f: v => num(v) },
    { h: '가려진 정도(°)', k: 'obstruction_deg', num: 1, sort: 1, f: v => num(v, 1) }, { h: '사용승인', k: 'approval_year', num: 1, sort: 1, f: v => v ?? '—' },
    { h: mcond() === '차폐 제외' ? '개선 전 EUI(차폐 포함)' : '개선 전 EUI', k: 'base_EUI', num: 1, sort: 1, f: v => num(v, 1) }, { h: `${t} EUI`, k: 'dEUI_pct', num: 1, sort: 1, f: v => pct(v), cls: bad },
    { h: `${t} 피크전력`, k: 'dpeak_pct', num: 1, sort: 1, f: v => pct(v), cls: bad }], rows, { maxh: 460, nw: 1, rowAttr: r => ` data-s="${esc(r.sim_name)}" style="cursor:pointer"${SEL === r.sim_name ? ' class="sel"' : ''}` });
  $$('#btable tbody tr').forEach(tr => tr.addEventListener('click', () => selectBuilding(tr.dataset.s, true)));
  $$('#btable th[data-k]').forEach(th => th.addEventListener('click', () => { const k = th.dataset.k; SORT = { k, d: SORT.k === k ? -SORT.d : -1 }; drawBTable(); }));
}
function selectBuilding(s, pan) {
  SEL = s; const b = q1('SELECT * FROM buildings WHERE sim_name=?', [s]);
  const rs = q('SELECT r.*, a.name FROM results_257 r JOIN alternatives a ON a.tag=r.tag WHERE r.sim_name=?', [s]).filter(r => ORDER257.includes(r.tag)).sort((x, y) => ORDER257.indexOf(x.tag) - ORDER257.indexOf(y.tag));
  const ns = Object.fromEntries(q("SELECT tag, dEUI_pct, dpeak_pct FROM results_257_cond WHERE cond='차폐 제외' AND sim_name=?", [s]).map(r => [r.tag, r])); rs.forEach(r => { r.nsE = ns[r.tag] ? ns[r.tag].dEUI_pct : null; r.nsP = ns[r.tag] ? ns[r.tag].dpeak_pct : null; });
  const m = q('SELECT * FROM monthly WHERE sim_name=? ORDER BY idx', [s]);
  $('#bdetail').innerHTML = `<h3>${esc(b.name)}</h3>
  <dl class="kv"><dt>대블록</dt><dd>${b.block}</dd><dt>층수 · 높이</dt><dd>${b.floors}층 · ${num(b.height_m, 0)} m</dd><dt>연면적(대장)</dt><dd>${b.gross_area_m2 ? num(b.gross_area_m2) + ' m²' : '—'}</dd><dt>평면 면적(모델)</dt><dd>${num(b.footprint_model_m2)} m² (${b.footprint_class})</dd><dt>가려진 정도</dt><dd>${num(b.obstruction_deg, 1)}° (${b.obstruction_class})</dd><dt>사용승인</dt><dd>${b.approval_year ?? '—'}</dd><dt>모델</dt><dd>${b.role}</dd><dt>개선 전</dt><dd>EUI ${num(b.base_EUI, 1)} kWh/m²·yr · 최대 ${num(b.base_peak_kW, 0)} kW</dd></dl>
  ${table([{ h: '대안', k: 'name' }, { h: 'EUI', k: 'dEUI_pct', num: 1, f: v => pct(v), cls: bad }, { h: '피크전력', k: 'dpeak_pct', num: 1, f: v => pct(v), cls: bad }, { h: 'UDI', k: 'dUDI_pp', num: 1, f: v => pp(v, 1), cls: good }, { h: '열쾌적', k: 'dPMV_pp', num: 1, f: v => pp(v, 1), cls: good }, { h: 'EUI(차폐 제외)', k: 'nsE', num: 1, f: v => pct(v), cls: bad }, { h: '피크전력(차폐 제외)', k: 'nsP', num: 1, f: v => pct(v), cls: bad }], rs, { nw: 1 })}
  <p class="small">앞의 네 열은 주변 차폐 포함(본 결과), 뒤의 두 열은 같은 건물에서 주변 건물 차폐를 뺀 계산(비교)으로, 각각 같은 조건의 개선 전 대비이다.</p>
  ${m.length ? `<h3 style="margin-top:12px">월별 전력: 실측과 모델(보정 후)</h3>${lineChart([{ label: '실측(건축HUB)', v: m.map(x => x.measured), c: COL.ink }, { label: '모델(보정 후)', v: m.map(x => x.simulated), c: COL.sun, dash: '5 3' }], 12, { h: 230, yd: 1, yl: 'kWh/m²', xt: [[0, '1월'], [3, '4월'], [6, '7월'], [9, '10월'], [11, '12월']] })}<p class="small">CV(RMSE) ${num(b.cv_rmse_cal, 1)}%(보정 전 ${num(b.cv_rmse_uncal, 1)}%) · NMBE ${sgn(b.nmbe_cal, 1)}% · ${b.split || ''}</p>` : '<p class="small">실측 비교 자료 없음</p>'}`;
  drawMap(); drawBTable();
  if (pan && b.lat) MAP.setView([b.lat, b.lon], 17);
}

/* ---------------- 페이지: 성능 개선안 ---------------- */
function pageAlts() {
  const rows = q('SELECT * FROM alternatives');
  const main = ORDER.map(t => rows.find(r => r.tag === t));
  const cols = [{ h: '구분', k: 'category' }, { h: '대안', k: 'name', f: (v, r) => `<b>${esc(v)}</b>` }, { h: '장치', k: 'device' }, { h: '작동', k: 'operation' }, { h: '기간', k: 'period' }, { h: '작동하지 않을 때', k: 'idle_state' }, { h: '자연채광', k: 'daylight' }, { h: '계산 범위', k: 'in_257', f: (v, r) => [r.in_3bldg ? '3개 동' : '', v ? '257동' : ''].filter(Boolean).join(' · ') }];
  $('#page-alts').innerHTML = `
  <div class="kicker">외피 성능 개선안</div><h1>고정형 차양 3종 · 키네틱 파사드 6종</h1>
  <p>개선 전은 장치 없이 주변 건물 차폐만 반영한 모델이다. 본 연구에서 키네틱 파사드는 외피 요소가 물리적으로 움직이는 가동형 외부 차양(블라인드·루버)으로 한정한다(고정형·가동형 구분: 「건축물의 에너지절약설계기준」 제5조). 장치를 ① 무엇이 움직이는가(장치)와 ② 언제 움직이는가(제어)의 두 축으로 정리하였다.</p>
  ${table(cols, main)}
  ${note('모든 장치는 설계일 계산에서 작동하지 않게 하여, 같은 건물의 대안들이 같은 공조 용량을 쓰게 하였다. 9개 대안은 같은 257동·같은 보정 모델·같은 기상(TMYx)·같은 계산 간격(10분)·같은 계산 기간(연중 1~12월)으로 계산하였다(2026-10-27 재계산). 일사량 기준 제어 2종은 냉방기(5~9월)에만 작동하고 난방기에는 블라인드는 걷어 올리고 수평 루버는 수평으로 두며, 연중 작동시킨 결과는 작동 기간 비교 자료로만 쓴다.')}
  <h2>자연채광을 유지하는가</h2>
  <div class="grid g2"><div class="card"><h3>자연채광 손실형</h3><p>작동하지 않을 때도 장치가 창 앞에 남는다. 고정형 3종, 컷오프 각도 제어 3종, 수평 루버 일사량 기준 제어, 피크 시간대 차양 폐쇄가 여기에 속한다. 일사를 막아 냉방을 줄이지만, 자연채광을 잃어 조명 전력이 늘어난다.</p></div>
  <div class="card"><h3>자연채광 유지형</h3><p>작동 기준을 넘을 때만 창을 가리고 그 밖에는 창에서 빠진다. 블라인드 일사량 기준 제어(걷어 올림)가 유일하다. 냉방기(5~9월)에만 작동시켜 EUI와 피크전력을 함께 줄였으나(−0.07%, −0.01%) 크기는 매우 작다. 연중 작동시키면 겨울 일사 취득을 막아 난방이 늘었다(EUI +2.98%).</p></div></div>
`;
}

/* ---------------- 페이지: 결과 ---------------- */
function pageResults() {
  const base = JSON.parse(META.base_3bldg);
  const r3 = q('SELECT r.*, a.name, a.category FROM results_3bldg r JOIN alternatives a ON a.tag=r.tag').filter(r => ORDER.includes(r.tag)).sort((a, b) => ORDER.indexOf(a.tag) - ORDER.indexOf(b.tag));
  const rng = (r, k) => { const v = ['ARK', 'GFC', 'GST'].map(n => r[`${k}_${n}`]); const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? sgn(lo, 1) : `${sgn(lo, 1)}~${sgn(hi, 1)}`; };
  const g = ORDER257.map(t => { const v = q('SELECT * FROM results_257 WHERE tag=?', [t]); const f = k => v.map(x => x[k]); return { tag: t, label: altName(t), e: f('dEUI_pct'), p: f('dpeak_pct'), u: f('dUDI_pp'), c: f('dPMV_pp'), n: v.length, both: v.filter(x => x.dEUI_pct < 0 && x.dpeak_pct < 0).length }; });
  const iqr = v => `${pr(quant(v, .25), quant(v, .75))}`;
  const eu = q('SELECT * FROM enduse_257'); const eu0 = eu.find(r => r.tag === 'S1'); const euR = ORDER.map(t => ({ ...eu.find(r => r.tag === t), name: altName(t) }));
  // 주변 차폐 포함·제외(같은 건물끼리 짝지어 비교)
  const sh = ORDER.map(t => { const w = q("SELECT sim_name, dEUI_pct e, dpeak_pct p, dUDI_pp u FROM results_257_cond WHERE cond='차폐 포함' AND tag=?", [t]); const o = Object.fromEntries(q("SELECT sim_name, dEUI_pct e, dpeak_pct p, dUDI_pp u FROM results_257_cond WHERE cond='차폐 제외' AND tag=?", [t]).map(r => [r.sim_name, r]));
    const pr = w.filter(r => o[r.sim_name]); return { tag: t, name: altName(t), n: pr.length, ew: median(pr.map(r => r.e)), eo: median(pr.map(r => o[r.sim_name].e)), pw: median(pr.map(r => r.p)), po: median(pr.map(r => o[r.sim_name].p)), uw: median(pr.map(r => r.u)), uo: median(pr.map(r => o[r.sim_name].u)), flip: pr.filter(r => Math.sign(r.e) !== Math.sign(o[r.sim_name].e)).length }; });
  const ctx = (() => { const w = Object.fromEntries(q("SELECT sim_name, EUI, peak_kW, UDI FROM results_257_cond WHERE cond='차폐 포함' AND tag='S1'").map(r => [r.sim_name, r])); const o = q("SELECT sim_name, EUI, peak_kW, UDI FROM results_257_cond WHERE cond='차폐 제외' AND tag='S1'"); return { n: o.length, e: median(o.map(r => 100 * (w[r.sim_name].EUI / r.EUI - 1))), p: median(o.map(r => 100 * (w[r.sim_name].peak_kW / r.peak_kW - 1))), u: median(o.map(r => w[r.sim_name].UDI - r.UDI)) }; })();
  // 작동 기간(냉방기 본 대안 대 연중 비교)
  const per = ['BT_T300', 'LT_T300'].map(t => [['차폐 포함', '냉방기(5~9월, 본 대안)', '차폐 포함'], ['차폐 포함(연중 작동)', '연중(1~12월, 비교)', '차폐 포함'], ['차폐 제외', '냉방기(5~9월)', '차폐 제외'], ['차폐 제외(연중 작동)', '연중(1~12월, 비교)', '차폐 제외']].map(([cd, per, sh]) => { const y = q("SELECT dEUI_pct e, dpeak_pct p, dUDI_pp u FROM results_257_cond WHERE cond=? AND tag=?", [cd, t]); return y.length ? { name: altName(t), per, sh, e: median(y.map(r => r.e)), p: median(y.map(r => r.p)), u: median(y.map(r => r.u)), d: y.filter(r => r.e < 0).length, n: y.length } : null; }).filter(Boolean)).flat();
  const blk = q("SELECT * FROM block_257 ORDER BY rowid");
  const pk = q1("SELECT peak_hour h FROM block_257 WHERE scenario='S1'").h; const d0 = Math.floor(pk / 24) * 24;
  const hr = sc => q('SELECT kW FROM block_257_hourly WHERE scenario=? AND hour>=? AND hour<? ORDER BY hour', [sc, d0, d0 + 24]).map(x => x.kW);
  const day = new Date(Date.UTC(2023, 0, 1) + d0 / 24 * 864e5); const dl = `${day.getUTCMonth() + 1}월 ${day.getUTCDate()}일`;
  const nsDone = Math.min(...sh.map(x => x.n));
  $('#page-results').innerHTML = `
  <div class="kicker">예비 결과 · 9개 대안(2026-10-27~28 재계산)</div><h1>개선 전후 비교</h1>
  <p>9개 대안은 같은 257동, 같은 보정 모델, 같은 기상(서울 TMYx 2011–2025), 같은 계산 간격(10분), 같은 계산 기간(연중 1~12월)으로 계산하였다. 일사량 기준 제어 2종만 냉방기(5~9월)에 작동하고 난방기에는 블라인드를 걷어 올리고 수평 루버를 수평으로 둔다. 설계일에는 모든 장치가 작동하지 않아 같은 건물의 대안들이 같은 공조 용량을 쓴다.</p>
  <h2>1. 상세 3개 동</h2>
  <p>아크플레이스·강남파이낸스센터·GS타워의 상세 모델. 개선 전 블록 EUI ${num(base.EUI, 2)} kWh/m²·yr, 블록 피크전력 ${num(base.peak_kW)} kW 대비 변화이다. 오른쪽 두 열은 주변 건물 차폐를 뺀 같은 계산(차폐 제외 개선 전 대비)이다.</p>
  ${table([{ h: '구분', k: 'category' }, { h: '대안', k: 'name' }, { h: '블록 EUI', k: 'dEUI_pct', num: 1, f: v => pct(v), cls: bad }, { h: '블록 피크전력', k: 'dpeak_pct', num: 1, f: v => pct(v), cls: bad }, { h: 'UDI(3개 동, %p)', k: 'dUDI_ARK', num: 1, f: (v, r) => rng(r, 'dUDI') }, { h: '열쾌적(3개 동, %p)', k: 'dPMV_ARK', num: 1, f: (v, r) => rng(r, 'dPMV') }, { h: 'EUI(차폐 제외)', k: 'dEUI_nosh_pct', num: 1, f: v => pct(v), cls: bad }, { h: '피크전력(차폐 제외)', k: 'dpeak_nosh_pct', num: 1, f: v => pct(v), cls: bad }], r3, { nw: 1 })}
  ${barsChart(r3.map(r => ({ label: r.name, e: r.dEUI_pct, p: r.dpeak_pct })), [{ key: 'e', label: '블록 EUI 변화', color: COL.ink }, { key: 'p', label: '블록 피크전력 변화', color: COL.sun }])}
  <p>EUI를 줄인 대안은 고정형 3종과 냉방기에만 작동하는 일사량 기준 제어 2종이었고, 연중 작동하는 키네틱 4종은 모두 EUI가 늘었다. 컷오프 각도 제어는 세 장치 모두 같은 장치의 고정보다 EUI와 피크전력이 컸다(수직 루버 피크전력은 예외). 서울 사무소에서 고정 차양의 절감이 키네틱 운전보다 컸다는 Lee(2019)와 같은 방향이다. 피크전력을 줄인 것은 블라인드 일사량 기준 제어뿐이었고(−0.48%), 피크 시간대 차양 폐쇄는 가장 크게 높였다. 3개 동의 피크 시각(7월 31일 16시)에 부하를 나누어 보면, 피크 시간대 차양 폐쇄는 냉방 부하가 565 kW 줄었으나 그에 따른 공조 전력 감소는 142 kW에 그쳤고, 조명 전력이 487 kW 늘어 피크전력이 345 kW 늘었다.</p>
  <h2>2. 257동(건물별)</h2>
  ${table([{ h: '대안', k: 'label' }, { h: 'EUI 중앙값', k: 'e', num: 1, f: v => pct(median(v)), cls: v => bad(median(v)) }, { h: '사분위 범위', k: 'e', num: 1, f: v => iqr(v) }, { h: 'EUI 감소 동수', k: 'e', num: 1, f: (v, r) => `${v.filter(x => x < 0).length} (${Math.round(100 * v.filter(x => x < 0).length / r.n)}%)` }, { h: '피크전력 중앙값', k: 'p', num: 1, f: v => pct(median(v)), cls: v => bad(median(v)) }, { h: '피크전력 감소 동수', k: 'p', num: 1, f: (v, r) => `${v.filter(x => x < 0).length} (${Math.round(100 * v.filter(x => x < 0).length / r.n)}%)` }, { h: '둘 다 감소', k: 'both', num: 1, f: (v, r) => `${v} (${Math.round(100 * v / r.n)}%)` }, { h: 'UDI 중앙값', k: 'u', num: 1, f: v => pp(median(v), 1), cls: v => good(median(v)) }, { h: '열쾌적 중앙값', k: 'c', num: 1, f: v => pp(median(v), 1), cls: v => good(median(v)) }], g, { nw: 1 })}
  <div><div><h3>EUI 변화 분포</h3>${stripChart(g.map(x => ({ label: x.label, v: x.e })), { color: COL.ink })}</div><div><h3>건물 피크전력 변화 분포</h3>${stripChart(g.map(x => ({ label: x.label, v: x.p })), { color: COL.sun })}</div></div>
  <p class="small">점 = 건물, 상자 = 사분위 범위, 주황 선 = 중앙값. 보정 기준(기기 밀도 1.0, 냉동기 COP 배수 2.0) 대비.</p>
  <h2>3. EUI 변화의 용도별 원인(257동 합산)</h2>
  ${table([{ h: '대안', k: 'name' }, { h: '난방(가스)', k: 'heat', num: 1, f: v => sgn(v, 2) }, { h: '냉방', k: 'cool', num: 1, f: v => sgn(v, 2) }, { h: '조명', k: 'light', num: 1, f: v => sgn(v, 2) }, { h: '팬·펌프·냉각탑', k: 'fan_pump_tower', num: 1, f: v => sgn(v, 2) }, { h: '합계(EUI)', k: 'EUI', num: 1, f: (v, r) => `${sgn(v, 2)} (${pct(r.dEUI_pct)})`, cls: bad }], euR, { nw: 1 })}
  <p>단위: 개선 전 대비 kWh/m²·yr. 개선 전 기준값은 난방 ${num(eu0.heat, 2)}, 냉방 ${num(eu0.cool, 2)}, 조명 ${num(eu0.light, 2)}, 팬·펌프·냉각탑 ${num(eu0.fan_pump_tower, 2)} kWh/m²·yr이며, EUI(기기·외부 조명·급탕 포함)는 ${num(eu0.EUI, 2)} kWh/m²·yr이다. 냉방 감소는 모든 대안에서 작았고(−0.28~−0.06), 자연채광을 막는 대안은 조명이 늘었다. EUI의 방향은 대부분의 대안에서 난방이 정했다. 고정형과 수평 루버 일사량 기준 제어(난방기 수평)는 난방이 줄어 EUI가 줄었다. 블라인드 고정의 난방 감소는 야간(−3.4 GWh)이 주간(−2.5 GWh)보다 커, 창 외측의 차양층이 창의 열손실을 줄인 효과로 해석된다. 컷오프 각도 제어는 겨울 낮에 일사 취득을 막아 난방이 늘었다. 블라인드 일사량 기준 제어(냉방기)는 난방 증가가 작고(+0.18) 냉방·팬·펌프·냉각탑 감소가 더 커 EUI가 조금 줄었다. 피크 시간대 차양 폐쇄는 조명 증가로 EUI가 늘었다.</p>
  <h2>4. 주변 차폐 포함·제외 비교(같은 건물끼리)</h2>
  ${nsDone < 257 ? `<div class="warn">차폐 제외 계산 진행 중: 257동을 모두 계산한 대안만 표에 넣었다(${sh.filter(r => r.n >= 257).map(r => esc(r.name)).join(', ')}). 나머지 대안은 2026-10-28에 반영한다.</div>` : ''}
  <p>같은 건물·같은 대안을 주변 건물 차폐를 넣고 뺀 두 경우로 계산하여, 밀집 환경이 개선 효과를 얼마나 바꾸는지 직접 분리한다. 주변 차폐 자체(개선 전)는 EUI를 ${pct(ctx.e)}, 피크전력을 ${pct(ctx.p)}, UDI를 ${pp(ctx.u, 1)} 바꾸었다(${ctx.n}동 건물별 중앙값).</p>
  ${table([{ h: '대안', k: 'name' }, { h: 'n', k: 'n', num: 1 }, { h: 'EUI(차폐 포함)', k: 'ew', num: 1, f: v => pct(v), cls: bad }, { h: 'EUI(차폐 제외)', k: 'eo', num: 1, f: v => pct(v), cls: bad }, { h: '피크전력(포함)', k: 'pw', num: 1, f: v => pct(v), cls: bad }, { h: '피크전력(제외)', k: 'po', num: 1, f: v => pct(v), cls: bad }, { h: 'UDI(포함)', k: 'uw', num: 1, f: v => pp(v, 1) }, { h: 'UDI(제외)', k: 'uo', num: 1, f: v => pp(v, 1) }, { h: 'EUI 방향이 바뀐 건물', k: 'flip', num: 1, f: (v, r) => r.n ? `${v} (${Math.round(100 * v / r.n)}%)` : '—' }], sh.filter(r => r.n >= 257), { nw: 1 })}
  <p>차폐를 빼면 블라인드 일사량 기준 제어를 제외한 8개 대안의 EUI 변화가 모두 높아졌다. 고정형의 절감은 건물별 중앙값 기준으로 사라지거나 증가로 바뀌었고, 연중 작동하는 키네틱 4종은 EUI 증가가 4~6배로 커져 EUI를 줄인 건물이 한 동도 없었다. 주변 건물이 없으면 차양이 막는 겨울 일사와 잃게 하는 자연채광이 많아지기 때문으로 해석된다(블라인드 컷오프 각도 제어의 난방 증가 +1.04 → +6.69 kWh/m²·yr, 257동 합산). 난방기에 걷어 올리는 블라인드 일사량 기준 제어만 차폐를 빼도 EUI 감소를 유지하였다. 주변 건물을 넣지 않은 단일 건물 계산은 주변 건물보다 낮은 건물이 많은 밀집지역의 효과를 다르게 평가할 수 있다.</p>
  <h2>5. 작동 기간에 따른 차이(일사량 기준 제어)</h2>
  ${table([{ h: '대안', k: 'name' }, { h: '주변 차폐', k: 'sh' }, { h: '작동 기간', k: 'per' }, { h: 'EUI 중앙값', k: 'e', num: 1, f: v => pct(v), cls: bad }, { h: 'EUI 감소 동수', k: 'd', num: 1, f: (v, r) => `${v}/${r.n}` }, { h: '피크전력 중앙값', k: 'p', num: 1, f: v => pct(v), cls: bad }, { h: 'UDI 중앙값', k: 'u', num: 1, f: v => pp(v, 1) }], per, { nw: 1 })}
  <p>피크전력 중앙값은 두 기간에서 같았다(피크가 7월 31일에 생김). 연중 작동하면 겨울에도 창면 일사량이 300 W/m²를 넘는 시간마다 차양이 내려와 난방이 늘었다. 그래서 일사량 기준 제어는 냉방기(5~9월)에만 작동시키는 것을 본 대안으로 하였다(연중 결과를 본 뒤 정한 것이다). 주변 차폐를 뺀 조건에서도 같은 방향이었다. 연중 작동시키면 EUI가 블라인드 일사량 기준 제어는 −0.13%에서 +8.92%로, 수평 루버 일사량 기준 제어는 +2.09%에서 +5.17%로 늘고, EUI를 줄인 건물이 한 동도 없었다(차폐 제외·연중 작동 행은 원고에 싣지 않은 비교 계산, 2026-10-28 완료). 각 행은 같은 주변 차폐 조건의 개선 전 대비이다. 피크 시간대 차양 폐쇄는 상세 3개 동에서만 두 기간을 비교하였다(연중 평일 13~18시 EUI +0.56%·피크전력 +3.49%, 7~8월 평일 13~18시 EUI −1.31%·피크전력 +3.49%).</p>
  <h2>6. 블록 합산 피크전력(보조 지표)</h2>
  ${table([{ h: '대안', k: 'label' }, { h: '블록 피크전력(kW)', k: 'peak_kW', num: 1, f: v => num(v) }, { h: '변화', k: 'dpeak_pct', num: 1, f: (v, r) => r.scenario === 'S1' ? '—' : pct(v), cls: (v, r) => r.scenario === 'S1' ? '' : bad(v) }, { h: '동시율', k: 'CF', num: 1, f: v => num(v, 3) }, { h: '부하율', k: 'LF', num: 1, f: v => num(v, 3) }, { h: '블록 EUI 변화', k: 'dEUI_pct', num: 1, f: (v, r) => r.scenario === 'S1' || v == null ? '—' : pct(v) }], blk, { nw: 1 })}
  ${lineChart([{ label: '개선 전', v: hr('S1'), c: COL.ink }, { label: '블라인드 고정', v: hr('F0'), c: COL.sun }, { label: '블라인드 일사량 기준 제어', v: hr('BT_T300'), c: COL.ok, dash: '5 3' }, { label: '피크 시간대 차양 폐쇄', v: hr('PK'), c: COL.red, dash: '2 2' }], 24, { yl: '257동 합산 전력(kW)', xt: [[0, '0시'], [6, '6시'], [12, '12시'], [16, '16시'], [23, '23시']] })}
  <p class="small">${dl}(개선 전 블록 피크전력이 생긴 날)의 시간별 합산 전력. 부하율은 연평균 전력 ÷ 블록 피크전력이다.</p>
  <p>9개 대안의 동시율 0.993~1.000은 257동이 거의 같은 시각에 피크 부하를 낸다는 뜻이며, 블록 피크전력은 건물별 효과의 합과 같은 방향으로 움직였다. 블록 피크전력을 가장 크게 낮춘 것은 외피가 아니라 건물 운전 시간의 시차였다(±2시간 −3.31%).</p>
  ${note(SIMNOTE)}`;
}

/* ---------------- 페이지: 건물 특성별 ---------------- */
function pageTraits() {
  $('#page-traits').innerHTML = `
  <div class="kicker">밀집 조건에 따른 효과</div><h1>같은 성능 개선, 다른 건물 — 효과의 방향이 바뀐다</h1>
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
  ${note('구간 경계: 가려진 정도와 평면 면적은 257동의 3분위, 층수는 6~10·11~20·21층 이상(21층 이상은 10동뿐이므로 경향으로만 본다). 3권역 계산에서는 구간 경계를 그 결과를 보기 전에 정한다. ' + SIMNOTE)}`;
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
  $('#ttab').innerHTML = `<p class="small">셀 = ${M.label}의 건물별 중앙값 · "둘 다 감소" = EUI와 피크전력을 함께 줄인 건물의 비율</p>` + h;
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
  const cnt = (t, c, l) => q(`SELECT COUNT(*) n FROM v_results WHERE tag=? AND ${c}=? AND dEUI_pct < 0`, [t, l])[0].n;
  const kin = ['S3', 'LH_C', 'VF_C', 'PK'];   // 연중 작동하는 키네틱 4종
  const lo = kin.map(t => med(t, 'obstruction_class', '적게 가려짐', 'dEUI_pct'));
  const all = t => q('SELECT dEUI_pct e, dpeak_pct p FROM results_257 WHERE tag=?', [t]);
  const bt = all('BT_T300'), btY = q("SELECT dEUI_pct e FROM results_257_cond WHERE cond='차폐 포함(연중 작동)' AND tag='BT_T300'"), pk = all('PK');
  const lp = q("SELECT tag, peak_kW FROM block_257 WHERE tag IN ('S1','BT_T300','PK')"), bk = Object.fromEntries(lp.map(r => [r.tag, r.peak_kW]));
  const ns = t => q("SELECT dEUI_pct e FROM results_257_cond WHERE cond='차폐 제외' AND tag=?", [t]).map(r => r.e);
  const nsm = t => median(ns(t)), rng = ts => { const v = ts.map(nsm); return `${pr(Math.min(...v), Math.max(...v))}`; };
  const allU = t => median(q('SELECT dUDI_pp u FROM results_257 WHERE tag=?', [t]).map(r => r.u));
  const rows = [
    { c: `주변 건물에 많이 가려진 건물(평균 차폐각 ${cb.obstruction_deg[1]}° 초과)`, a: '권장: 블라인드 고정 · 수직 루버 고정', e: `EUI ${pct(med('F0', 'obstruction_class', '많이 가려짐', 'dEUI_pct'))}·${pct(med('VF_F0', 'obstruction_class', '많이 가려짐', 'dEUI_pct'))}(86동 중 ${cnt('F0', 'obstruction_class', '많이 가려짐')}·${cnt('VF_F0', 'obstruction_class', '많이 가려짐')}동 감소), 피크전력 ${pct(med('F0', 'obstruction_class', '많이 가려짐', 'dpeak_pct'))}·${pct(med('VF_F0', 'obstruction_class', '많이 가려짐', 'dpeak_pct'))}(세 구간 중 가장 작음)`, w: `UDI 감소, 피크전력은 여전히 증가. 수평 루버 고정(EUI ${pct(med('LH_F0', 'obstruction_class', '많이 가려짐', 'dEUI_pct'))})은 UDI 감소가 커(전체 중앙값 ${pp(allU('LH_F0'), 1)}) 제외` },
    { c: `주변 건물에 적게 가려진 건물(${cb.obstruction_deg[0]}° 이하)`, a: '권장: 블라인드 고정, 블라인드 일사량 기준 제어(냉방기, 효과 작음) / 비권장: 연중 작동 키네틱 4종, 수평 루버(고정·일사량 기준 제어)', e: `블라인드 고정 EUI ${pct(med('F0', 'obstruction_class', '적게 가려짐', 'dEUI_pct'))}(${cnt('F0', 'obstruction_class', '적게 가려짐')}동 감소), 블라인드 일사량 기준 제어 ${pct(med('BT_T300', 'obstruction_class', '적게 가려짐', 'dEUI_pct'))}(${cnt('BT_T300', 'obstruction_class', '적게 가려짐')}동 감소); 키네틱 4종 EUI ${pr(Math.min(...lo), Math.max(...lo))}, 수평 루버 ${pct(med('LH_F0', 'obstruction_class', '적게 가려짐', 'dEUI_pct'))}·${pct(med('LT_T300', 'obstruction_class', '적게 가려짐', 'dEUI_pct'))}`, w: '컷오프 각도 제어는 겨울 난방 증가가 큼' },
    { c: '피크전력이 중요한 건물·블록', a: '조건부 권장: 블라인드 일사량 기준 제어(냉방기 5~9월; 유일하게 피크전력 감소, 효과 미미)', e: `피크전력 ${pct(median(bt.map(r => r.p)))}(${bt.filter(r => r.p < 0).length}동 감소), 블록 ${pct(100 * (bk.BT_T300 / bk.S1 - 1))}(약 ${num(bk.S1 - bk.BT_T300)} kW), EUI ${pct(median(bt.map(r => r.e)))}, 둘 다 감소 ${bt.filter(r => r.p < 0 && r.e < 0).length}동(${Math.round(100 * bt.filter(r => r.p < 0 && r.e < 0).length / bt.length)}%)`, w: `감소 폭이 매우 작아 방향만 의미가 있음. 평면이 큰 건물에서 EUI 감소가 상대적으로 큼(대 ${pct(med('BT_T300', 'footprint_class', '대', 'dEUI_pct'))}, 소 ${pct(med('BT_T300', 'footprint_class', '소', 'dEUI_pct'))}). 연중 작동하면 EUI ${pct(median(btY.map(r => r.e)))}` },
    { c: '주변 건물이 거의 없는 건물(차폐 제외 조건에 가까움)', a: '권장(효과 작음): 블라인드 일사량 기준 제어(냉방기) / 권장 근거 없음: 나머지 8개 대안', e: `차폐 제외 시 블라인드 일사량 기준 제어만 EUI 감소(${pct(nsm('BT_T300'))}, ${ns('BT_T300').filter(v => v < 0).length}동); 고정형 3종 ${rng(['F0', 'LH_F0', 'VF_F0'])}, 연중 작동 키네틱 4종 ${rng(kin)}, 수평 루버 일사량 기준 제어 ${pct(nsm('LT_T300'))}`, w: '블라인드 고정은 257동 합산으로는 감소가 일부 남음(−0.57%). 피크전력은 블라인드 일사량 기준 제어를 제외한 8개 대안에서 차폐 포함보다 더 증가' },
    { c: '모든 건물', a: '비권장: 피크 시간대 차양 폐쇄', e: `피크전력 ${pct(median(pk.map(r => r.p)))}(블록 ${pct(100 * (bk.PK / bk.S1 - 1))}), UDI ${pp(allU('PK'), 1)}`, w: '오후에 닫으면 조명 증가가 냉방 감소보다 큼' }];
  $('#tcond').innerHTML = table([{ h: '건물 조건', k: 'c' }, { h: '권장·비권장', k: 'a', f: v => `<b>${esc(v)}</b>` }, { h: '근거(257동 중앙값)', k: 'e' }, { h: '주의할 점', k: 'w' }], rows);
}

/* ---------------- 페이지: 실측 비교 ---------------- */
function pageValid() {
  const v = q('SELECT * FROM validation');
  const cv = q("SELECT cv_rmse_cal c, cv_rmse_uncal u FROM buildings WHERE cv_rmse_cal IS NOT NULL AND split='시험용'");
  const bins = [0, 15, 30, 45, 60, 75, 90, 1e9], lab = ['15 미만', '15~30', '30~45', '45~60', '60~75', '75~90', '90 이상'];
  const hist = k => lab.map((_, i) => cv.filter(r => r[k] >= bins[i] && r[k] < bins[i + 1]).length);
  const hc = hist('c'), hu = hist('u'); const mx = Math.max(...hc, ...hu);
  const W = 760, H = 260, L = 50, B = 40, T = 30, bw = (W - L - 20) / lab.length;
  let s = '';
  lab.forEach((l, i) => { const x0 = L + i * bw; [[hu[i], COL.mut], [hc[i], COL.sun]].forEach(([n, c], j) => { const h = n / mx * (H - T - B); s += `<rect x="${x0 + 6 + j * (bw / 2 - 6)}" y="${H - B - h}" width="${bw / 2 - 8}" height="${h}" fill="${c}"><title>${n}동</title></rect><text x="${x0 + 6 + j * (bw / 2 - 6) + (bw / 2 - 8) / 2}" y="${H - B - h - 4}" text-anchor="middle">${n}</text>`; }); s += `<text x="${x0 + bw / 2}" y="${H - B + 16}" text-anchor="middle">${l}%</text>`; });
  s += `<line class="zero" x1="${L}" x2="${W - 20}" y1="${H - B}" y2="${H - B}"/><rect x="${L}" y="8" width="11" height="11" fill="${COL.mut}"/><text x="${L + 16}" y="17">보정 전</text><rect x="${L + 90}" y="8" width="11" height="11" fill="${COL.sun}"/><text x="${L + 106}" y="17">보정 후</text><line x1="${L + bw}" x2="${L + bw}" y1="${T}" y2="${H - B}" stroke="${COL.ok}" stroke-dasharray="4 3"/><text x="${L + bw + 4}" y="${T + 10}" fill="${COL.ok}">ASHRAE G14 기준 15%</text>`;
  $('#page-valid').innerHTML = `
  <div class="kicker">실측 비교</div><h1>모델은 개별 건물을 예측하지 못한다 — 그래서 상대 비교로만 쓴다</h1>
  <p>개선 전 모델의 월 전력을 건축HUB 건물에너지정보(2023–2024년 월별 전기)와 비교하여 ASHRAE Guideline 14의 월 기준(CV(RMSE) 15% 이하, NMBE ±5% 이내)에 대조하였다. 보정은 모든 건물에 공통인 전역 배율(${esc(META.calibration)})로 제한하였다.</p>
  ${table([{ h: '집합', k: 'subset' }, { h: '단계', k: 'stage' }, { h: '동수', k: 'n', num: 1 }, { h: 'CV(RMSE) 중앙값', k: 'cv_rmse_median', num: 1, f: v => num(v, 1) + '%' }, { h: '사분위', k: 'cv_rmse_q1', num: 1, f: (x, r) => `${num(r.cv_rmse_q1, 1)}~${num(r.cv_rmse_q3, 1)}%` }, { h: 'NMBE 중앙값', k: 'nmbe_median', num: 1, f: v => sgn(v, 1) + '%' }, { h: 'G14 충족', k: 'n_pass_g14', num: 1, f: (x, r) => `${x}/${r.n}동` }], v, { nw: 1 })}
  <h3>시험용 건물의 CV(RMSE) 분포</h3>${svgEl(W, H, s)}
  <p>보정 후 시험용 215동의 월 CV(RMSE) 중앙값은 ${num(v.find(r => r.subset.startsWith('시험') && r.stage === '보정 전').cv_rmse_median, 1)}%에서 ${num(v.find(r => r.subset.startsWith('시험') && r.stage === '보정 후').cv_rmse_median, 1)}%로 줄었으나, 기준을 충족한 건물은 보정용 ${v.find(r => r.subset.startsWith('보정') && r.stage === '보정 후').n_pass_g14}/31동, 시험용 ${v.find(r => r.subset.startsWith('시험') && r.stage === '보정 후').n_pass_g14}/215동이었다. 따라서 결과는 개별 건물의 에너지 사용 예측이 아니라 같은 모델 위에서 개선 전후를 비교한 상대값으로만 해석한다. 건물별 월별 비교는 <a href="#/site">대상지·건물</a>에서 건물을 선택하면 볼 수 있다.</p>
  ${note('실측 원자료는 지번 단위 월별 사용량이며, 지역난방·가스 흡수식 냉방 등 모델(전기 냉동기)과 다른 설비의 영향이 섞여 있을 수 있다.')}`;
}

/* ---------------- 페이지: 향후 계획 ---------------- */
function pagePlan() {
  const D = q('SELECT * FROM districts');
  $('#page-plan').innerHTML = `
  <div class="kicker">한계와 향후 계획</div><h1>재계산, 그리고 국가승인통계의 서울 오피스 3권역으로</h1>
  <h2>재계산(2026-10-28 기준)</h2><ol>
  <li><b>같은 조건</b> — 완료. 9개 대안을 같은 257동·보정 모델·기상·계산 간격·계산 기간(연중 1~12월)으로 다시 계산하였다. 일사량 기준 제어 2종은 작동 기간 비교에 따라 냉방기(5~9월)에만 작동시키는 것을 본 대안으로 정하였다(2026-10-27). 피크 시간대 차양 폐쇄는 연중 평일 13~18시.</li>
  <li><b>257동 대안 구성</b> — 완료. 컷오프 각도 제어 3종과 피크 시간대 차양 폐쇄를 257동에 추가하였다.</li>
  <li><b>차폐 포함·제외 비교</b> — 완료(2026-10-28). 9개 대안 × 257동 × 차폐 포함·제외. 차폐를 빼면 블라인드 일사량 기준 제어를 제외한 8개 대안의 EUI 변화가 모두 높아졌다(결과 4절).</li>
  <li><b>대안·지표 확정</b> — 연중 작동하는 컷오프 각도 제어와 피크 시간대 차양 폐쇄의 작동 기간을 일사량 기준 제어와 같은 방식으로 검토하고, 적용 조건의 판단 기준을 남은 3권역 계산의 결과를 보기 전에 확정한다. 이미 결과를 본 작동 기간 비교와 차폐 제외 비교를 근거로 정한 기준은 그 사실을 밝힌다.</li>
  <li><b>기준 상태와 변수</b> — 개선 전 기준을 기준 모델 외피가 아니라 대상 건물의 기존 상태(창면적비·유리 사양 등 확인 가능한 범위)에 가깝게 맞추고, 효과 차이를 설명할 변수는 주변 차폐·방위·창면적비 등 소수로 한정한다.</li>
  <li><b>밀집 조건 지표</b> — 평균 차폐각 외에 천공차폐율(장윤배·이성룡, 2001) 등 밀집 조건을 나타내는 지표를 정리하고, 3권역 계산에 쓸 구간 경계를 그 결과를 보기 전에 정한다.</li>
  <li><b>지표 추가</b> — 공간 주광 자율성(sDA)과 과다 일사 노출(ASE)을 추가하고, 눈부심은 대표 실에서 계산하거나 한계로 밝힌다.</li>
  <li><b>워밍업</b> — EnergyPlus 워밍업 미수렴 경고가 있었던 건물(약 100동)은 워밍업 기간을 늘려 다시 계산한다. 워밍업 기간을 25일에서 100일로 늘린 민감도 계산(20동)에서 블라인드 고정의 EUI 변화율은 중앙값 0.0004%p, 최대 0.10%p만 달라졌다.</li></ol>
  <h2>확장 — 업무 기능 지구단위계획구역의 가구별 전체 건물</h2>
  <div class="card"><p><b>권역의 근거.</b> ${esc(META.basis)}</p><p><b>가구(분석 단위).</b> 국내에는 "업무지구"라는 법정 용도지역이 없으므로, 도시관리계획으로 결정·고시된 지구단위계획구역을 도시계획도로로 나눈 가구(街區, 2,000 m² 이상)를 분석 단위로 쓴다(결정도의 가구 번호와는 재계산 전에 대조). 가구 안의 모든 건물을 모아 주변 차폐와 가구 합산에 쓰고, 개선 효과의 분석 대상은 업무시설 6층 이상 건물로 한다. <a href="#/gen">자료 생성기</a>에서 권역을 고르면 가구와 건물 자료를 바로 만들 수 있다.</p></div>
  ${table([{ h: '권역', k: 'code', f: (v, r) => `<b>${v}</b> ${esc(r.name)}` }, { h: '범위', k: 'extent' }, { h: '내용', k: 'note' }, { h: '상태', k: 'status', f: v => `<span class="tag ${v === "진행 중" ? "sun" : "mut"}" style="white-space:nowrap">${esc(v)}</span>` }], D)}
  ${gbdSection()}
  <div class="flow"><div><b>경계</b>지구단위계획구역 − 도시계획도로 = 가구(서울 UPIS 2026-09)</div><div><b>건물</b>OpenStreetMap 윤곽 + 건축물대장·건축HUB(공공데이터 포털)</div><div><b>모델</b>저층·소규모는 간이 모델 — 오차는 역삼 257동에서 상세 모델과 먼저 비교</div><div><b>지표</b>건물 조건별·가구별 개선 효과</div></div>
  <h2>한계</h2><ol><li>모든 결과는 시뮬레이션 값이며, 실측 기준을 충족한 건물이 적어 상대 비교로만 해석한다.</li><li>외피와 설비는 기준 모델 값이며, 실제 건물의 외피·설비·운전 시간은 반영하지 못하였다. 다수 건물의 효과 크기는 냉동기 효율 가정(COP 배수 2.0)에 따라 달라진다.</li><li>성능 개선 비용, 장기 성능, 실제 작동, 재실자 만족도는 다루지 않는다.</li><li>컷오프 각도 제어와 피크 시간대 차양 폐쇄는 연중 작동시켰으므로, 계절별로 작동을 달리하는 실제 운영과는 다를 수 있다. 작동 기간의 영향은 일사량 기준 제어(257동)와 피크 시간대 차양 폐쇄(상세 3개 동)에서만 비교하였다. 또한 약 100동에서 워밍업 미수렴 경고가 있었으며, 민감도 계산(20동)에서 대안 간 비교에 미치는 영향은 작았다.</li></ol>
  <h2>일정(안)</h2>${table([{ h: '시기', k: 'a' }, { h: '내용', k: 'b' }], [{ a: '2026년 11월 9일', b: '예비심사: 목적·방법·예비 결과·재계산과 확장 계획 발표' }, { a: '2026년 11~12월', b: '대안·지표 확정(컷오프 각도 제어·피크 시간대 차양 폐쇄의 작동 기간 포함), sDA·ASE 추가, 워밍업 미수렴 건물 재계산' }, { a: '2027년 1~3월', b: '3권역 가구별 자료 확보(건축물대장 결합), 간이 모델 검증, 가구별 계산' }, { a: '2027년 4~6월', b: '분석·집필, 본심사 원고' }, { a: '2027년 9월', b: '학위 수여' }])}`;
}


/* 강남 권역 가구별 예비 수치(테헤란로제2지구 가구 안 140동) */
function gbdSection() {
  const G = q('SELECT * FROM gbd_blocks'); if (!G.length) return '';
  const all = G.find(r => r.gagu === 'ALL'), blk = G.filter(r => r.gagu !== 'ALL'); if (!all) return '';
  const rows = ORDER257.map(t => ({ name: altName(t), dE: all[t + '_dE'], dP: all[t + '_dP'], both: all[t + '_both'], bothG: blk.filter(r => r[t + '_dE'] < 0 && r[t + '_dP'] < 0).length, rng: `${pr(Math.min(...blk.map(r => r[t + '_dE'])), Math.max(...blk.map(r => r[t + '_dE'])))}` }));
  return `<h2>강남 권역 가구별 예비 수치 — 테헤란로제2지구 가구 ${blk.length}개, ${all.n}동</h2>
  <p>역삼 257동 가운데 테헤란로제2지구 지구단위계획구역의 가구 안에 있는 ${all.n}동을 가구별로 묶어, 이미 계산한 EnergyPlus 시간별 결과를 더하였다(가구 EUI = 가구 안 건물의 연간 에너지 합 ÷ 연면적 합, 가구 피크전력 = 시간별 전력 합의 연간 최댓값, 개선 전(보정 기준) 대비). 가구 안의 다른 건물(6층 미만 등)은 아직 계산하지 않았으므로 가구 전체 값이 아니다. 블라인드 일사량 기준 제어에서 둘 다 감소한 가구 35개 가운데 4개는 피크전력 감소가 0.01% 미만이다(가구 049·062·071·078).</p>
  ${table([{ h: '대안', k: 'name' }, { h: '140동 합산 EUI', k: 'dE', num: 1, f: v => pct(v), cls: bad }, { h: '140동 합산 피크전력', k: 'dP', num: 1, f: v => pct(v), cls: bad }, { h: '가구별 EUI 범위', k: 'rng', num: 1 }, { h: '둘 다 감소한 가구', k: 'bothG', num: 1, f: v => `${v}/${blk.length}` }, { h: '둘 다 감소한 건물', k: 'both', num: 1, f: v => `${v}/${all.n}` }], rows, { nw: 1 })}
  <details><summary class="small">가구별 표 보기(${blk.length}개 가구)</summary>${table([{ h: '가구', k: 'gagu' }, { h: '건물', k: 'n', num: 1 }, ...['F0', 'S3', 'BT_T300'].flatMap(t => [{ h: altName(t) + ' EUI', k: t + '_dE', num: 1, f: v => pct(v), cls: bad }, { h: '피크전력', k: t + '_dP', num: 1, f: v => pct(v), cls: bad }])], blk, { nw: 1, maxh: 420 })}</details>
  ${note('가구 번호는 서울 UPIS 지구단위계획구역(UQ161)을 도시계획도로(UQ151)로 나눈 순번이며 결정도의 가구 번호와는 재계산 전에 대조한다. ' + SIMNOTE)}`;
}

/* ---------------- 페이지: 데이터베이스 ---------------- */
const PRESETS = {
  '대안별 257동 요약': "-- 평균값(원고와 사이트의 표는 중앙값)\nSELECT a.name AS 대안, COUNT(*) AS 동수,\n       ROUND(AVG(r.dEUI_pct), 3) AS EUI_변화_평균,\n       SUM(r.dEUI_pct < 0) AS EUI_감소_동수,\n       SUM(r.dEUI_pct < 0 AND r.dpeak_pct < 0) AS 둘다_감소_동수\nFROM results_257 r JOIN alternatives a ON a.tag = r.tag\nWHERE a.category NOT LIKE '범위 제외%' AND a.tag <> 'S1'\nGROUP BY r.tag ORDER BY a.sort",
  '많이 가려진 건물 상위 10동': "SELECT name, block, floors, obstruction_deg, obstruction_class\nFROM buildings ORDER BY obstruction_deg DESC LIMIT 10",
  '가려진 정도 × 블라인드 고정': "SELECT obstruction_class, COUNT(*) n, ROUND(AVG(dEUI_pct), 3) EUI_평균, ROUND(AVG(dpeak_pct), 3) 피크전력_평균\nFROM v_results WHERE tag = 'F0' GROUP BY obstruction_class",
  '대블록별 블록 피크전력': "SELECT block, scenario, peak_kW, dpeak_pct, CF, peak_time\nFROM block_257_by_block WHERE scenario IN ('S1', 'F0', 'BT_T300', 'PK') ORDER BY block, scenario",
  '실측 기준 충족 건물': "SELECT name, split, cv_rmse_cal, nmbe_cal FROM buildings\nWHERE cv_rmse_cal <= 15 AND ABS(nmbe_cal) <= 5",
};
function pageDb() {
  const tabs = q("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name");
  const desc = { meta: '연구 메타 정보(제목·목적·범위·독창성·구간 경계)', blocks: '4개 대블록(경계, 건물 수, 개선 전 블록 지표)', block_meta: '대상지 중심·도로', buildings: '257동 건물 속성(형태·밀집 조건·실측 비교·좌표·윤곽)', alternatives: '성능 개선안(구분·장치·작동·자연채광·계산 범위)', results_3bldg: '상세 3개 동 블록 결과(개선 전 대비, 차폐 포함·제외)', results_257: '257동 × 대안 건물별 결과(보정 기준 대비)', block_257: '257동 블록 합산 지표', block_257_by_block: '대블록별 블록 지표', block_257_hourly: '257동 합산 시간별 전력(8,760시간 × 개선 전·9개 대안·운전 시차 2개)', results_257_cond: '257동 × 대안 × 조건(차폐 포함·차폐 제외, 일사량 기준 제어 비교용 차폐 포함(연중 작동)·차폐 제외(연중 작동)) 결과와 용도별 원단위', enduse_257: '257동 합산 용도별 원단위 변화(난방·냉방·조명·팬·펌프·냉각탑)', validation: '실측 비교 요약(ASHRAE G14)', monthly: '건물별 월별 전력: 실측과 모델(보정 후)', districts: '서울 오피스 3권역 확장 계획', gbd_blocks: '강남 테헤란로제2지구 가구별 예비 수치(257동 중 140동, 대안별 EUI·피크전력 변화)', gbd_assign: '257동 건물 → 테헤란로제2지구 가구 배정', v_results: '보기: 결과 + 대안 + 건물 조건 결합' };
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
const PAGES = { home: pageHome, site: pageSite, alts: pageAlts, results: pageResults, traits: pageTraits, valid: pageValid, plan: pagePlan, db: pageDb, gen: () => pageGen(), live: () => pageLive() };
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
