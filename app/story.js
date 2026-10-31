/* 시뮬레이션 과정 — 영상처럼 자동 재생되는 장면 7개.
   모든 수치는 연구 DB(research.sqlite)에서 읽는다(EnergyPlus 23.2 시뮬레이션 값, 실측값이 아님).
   표본 건물: 아크플레이스(ARK, 상세 모델 3개 동 중 하나). 표본 날짜: 257동 합산 피크전력이 난 날(block_257.peak_hour). */
const STORY = { t: 0, sc: 0, play: true, speed: 1, raf: 0, last: 0, built: false };
const SCENES = [];
const smooth = p => p < 0 ? 0 : p > 1 ? 1 : p * p * (3 - 2 * p);
const rng = (p, a, b) => smooth((p - a) / (b - a));
const ft = (x, d = 0) => num(x, d);

function storyData() {
  if (STORY.D) return STORY.D;
  const B = q1("SELECT * FROM buildings WHERE sim_name='ARK'");
  const all = q('SELECT sim_name, name, polygon, lat, lon, floors FROM buildings');
  const R = Object.fromEntries(q('SELECT * FROM results_257 WHERE sim_name=?', [B.sim_name]).map(r => [r.tag, r]));
  const mon = q('SELECT idx, measured, simulated FROM monthly WHERE sim_name=? ORDER BY idx', [B.sim_name]);
  const val = q('SELECT * FROM validation');
  const blk = Object.fromEntries(q('SELECT * FROM block_257').map(r => [r.scenario, r]));
  const ph = blk.S1.peak_hour; const doy = Math.floor(ph / 24);
  const day = new Date(Date.UTC(2023, 0, 1) + doy * 864e5); const ymd = [2023, day.getUTCMonth() + 1, day.getUTCDate()];
  const hr = sc => q('SELECT kW FROM block_257_hourly WHERE scenario=? AND hour>=? AND hour<? ORDER BY hour', [sc, doy * 24, doy * 24 + 24]).map(r => r.kW);
  const H = { S1: hr('S1'), F0: hr('F0'), BT_T300: hr('BT_T300'), S3: hr('S3') };
  const med = {}; for (const t of ORDER257) { const v = q('SELECT dEUI_pct e, dpeak_pct p FROM results_257 WHERE tag=?', [t]); med[t] = { e: median(v.map(x => x.e)), p: median(v.map(x => x.p)), n: v.length, dec: v.filter(x => x.e < 0).length }; }
  const dist = q("SELECT dEUI_pct e FROM results_257 WHERE tag='F0' ORDER BY e").map(x => x.e);
  const eu = Object.fromEntries(q('SELECT * FROM enduse_257').map(r => [r.tag, r]));
  const cb = JSON.parse(META.class_bounds);
  STORY.D = { B, all, R, mon, val, blk, ph, doy, ymd, H, med, dist, eu, cb };
  return STORY.D;
}

/* ---- 공통: SVG 지도 투영 ---- */
function projFn(all) {
  const pts = []; all.forEach(b => { try { JSON.parse(b.polygon).forEach(p => pts.push(p)); } catch (e) { } });
  const la = pts.map(p => p[0]), lo = pts.map(p => p[1]);
  const pc = (arr, r) => { const t = [...arr].sort((a, b) => a - b); return t[Math.floor((t.length - 1) * r)]; };
  const la0 = pc(la, 0.01), la1 = pc(la, 0.99), lo0 = pc(lo, 0.01), lo1 = pc(lo, 0.99);
  const k = Math.cos((la0 + la1) / 2 * Math.PI / 180); const W = 560, Hh = 330, pad = 12;
  const sx = (W - 2 * pad) / ((lo1 - lo0) * k), sy = (Hh - 2 * pad) / (la1 - la0); const s = Math.min(sx, sy);
  const ox = (W - (lo1 - lo0) * k * s) / 2, oy = (Hh - (la1 - la0) * s) / 2;
  return { W, H: Hh, f: p => [ox + (p[1] - lo0) * k * s, Hh - oy - (p[0] - la0) * s] };
}
const poly = (pts, f) => pts.map((p, i) => (i ? 'L' : 'M') + f(p).map(v => v.toFixed(1)).join(',')).join('') + 'Z';

/* ---- 장면 1: 대상지와 257동 ---- */
SCENES.push({
  dur: 9, title: '① 대상지와 건물 — 어디를, 몇 동을 계산하는가',
  html(D) {
    const P = projFn(D.all);
    const paths = D.all.map((b, i) => { let pts; try { pts = JSON.parse(b.polygon); } catch (e) { return ''; } return `<path class="sb${b.sim_name === 'ARK' ? ' ark' : ''}" data-i="${i}" d="${poly(pts, P.f)}"/>`; }).join('');
    const a = P.f([D.B.lat, D.B.lon]);
    return `<div class="stg"><svg viewBox="0 0 ${P.W} ${P.H}" class="smap">${paths}<g class="pin" style="opacity:0" transform="translate(${a[0].toFixed(1)},${a[1].toFixed(1)})"><circle r="9" fill="none" stroke="var(--sun)" stroke-width="2"/><line x1="0" y1="-22" x2="0" y2="-9" stroke="var(--sun)" stroke-width="2"/><text y="-28" text-anchor="middle">${esc(D.B.name)}</text></g></svg>
    <div class="sside"><div class="scount"><b id="s1n">0</b><span>동</span></div>
    <p>서울 강남 역삼역 일대 4개 대블록의 <b>업무 용도 건물 ${D.all.length}동</b>(6층 이상, 업무 용도가 섞인 제2종 근린생활시설 12동 포함). OpenStreetMap 건물 윤곽·높이와 건축물대장 용도·층수·연면적을 결합한다.</p>
    <p class="s1b" style="opacity:0">그중 <b>${esc(D.B.name)}</b>(${D.B.floors}층, ${ft(D.B.height_m)} m, 연면적 ${ft(D.B.gross_area_m2)} m², ${Math.round(D.B.approval_year)}년 사용승인)를 따라가며 수치가 만들어지는 과정을 본다.</p></div></div>`;
  },
  tick(p, el, D) {
    const n = D.all.length; const k = Math.floor(rng(p, 0, 0.6) * n);
    el.querySelectorAll('.sb').forEach((s, i) => s.style.opacity = i < k ? 1 : 0.06);
    el.querySelector('#s1n').textContent = k;
    const v = rng(p, 0.62, 0.8); el.querySelector('.pin').style.opacity = v; el.querySelector('.s1b').style.opacity = v;
  }
});

/* ---- 장면 2: 건물 모델 ---- */
SCENES.push({
  dur: 10, title: '② 건물 모델 — 건물마다 EnergyPlus 모델을 자동으로 만든다',
  html(D) {
    const B = D.B; const nf = B.floors; const fh = Math.min(10, 260 / nf);
    let fl = ''; for (let i = 0; i < nf; i++) fl += `<rect class="fl" x="150" y="${(290 - (i + 1) * fh).toFixed(1)}" width="120" height="${(fh - 1).toFixed(1)}"/>`;
    const nb = [[40, 190, 60, 100], [105, 230, 35, 60], [290, 170, 55, 120], [355, 240, 45, 50], [410, 205, 70, 85]].map(([x, y, w, h]) => `<rect class="nb" x="${x}" y="${y}" width="${w}" height="${h}"/>`).join('');
    return `<div class="stg"><svg viewBox="0 0 560 330" class="smap"><line x1="0" y1="290" x2="560" y2="290" stroke="var(--line)"/>${nb}<g id="s2b">${fl}</g>
    <g id="s2obs" style="opacity:0"><path d="M210 290 L 470 ${(290 - 260 * Math.tan(B.obstruction_deg * Math.PI / 180)).toFixed(1)}" stroke="var(--sun)" stroke-dasharray="4 4" stroke-width="1.5"/><text x="300" y="283" class="sl">가려진 정도 ${ft(B.obstruction_deg, 1)}°(주변 ${B.n_neighbors}동)</text></g>
    <g id="s2w" style="opacity:0"><text x="20" y="30" class="sl">창면적비 40% · 창 U 3.24 W/m²·K · SHGC 0.39 · 가시광 투과율 0.305</text><text x="20" y="48" class="sl">기기 밀도 1.0 · 냉동기 COP 배수 2.0 (보정용 31동으로 결정)</text></g></svg>
    <div class="sside"><p><b>기준 모델</b>: DOE 대형 사무소 기준 모델(Deru et al., 2011)의 외피·설비 사양을 모든 건물에 같은 방식으로 적용하고, 건물마다 윤곽·층수·높이·연면적을 바꾼다.</p>
    <ul class="slist"><li class="s2i">층수 <b>${nf}층</b>, 높이 <b>${ft(B.height_m)} m</b>, 연면적 <b>${ft(B.gross_area_m2)} m²</b></li>
    <li class="s2i">주변 건물 <b>${B.n_neighbors}동</b>을 차폐물로 넣음 → 가려진 정도 <b>${ft(B.obstruction_deg, 1)}°</b></li>
    <li class="s2i">같은 건물을 <b>주변 차폐 제외</b>로도 한 번 더 계산(원고 5.5절)</li>
    <li class="s2i">개선 전(S1)·9개 대안 × 차폐 포함·제외 = 건물당 20회 계산</li></ul></div></div>`;
  },
  tick(p, el, D) {
    const fls = el.querySelectorAll('.fl'); const k = Math.floor(rng(p, 0, 0.4) * fls.length); fls.forEach((f, i) => f.style.opacity = i < k ? 1 : 0.08);
    el.querySelectorAll('.nb').forEach((n, i) => n.style.opacity = rng(p, 0.4 + i * 0.03, 0.55 + i * 0.03));
    el.querySelector('#s2obs').style.opacity = rng(p, 0.6, 0.72); el.querySelector('#s2w').style.opacity = rng(p, 0.75, 0.9);
    el.querySelectorAll('.s2i').forEach((li, i) => li.style.opacity = rng(p, 0.15 + i * 0.2, 0.3 + i * 0.2));
  }
});

/* ---- 장면 3: 실측 비교(보정) ---- */
SCENES.push({
  dur: 10, title: '③ 실측 비교 — 모델을 월별 전기 사용량과 비교해 보정한다',
  html(D) {
    const m = D.mon; const mx = Math.max(...m.map(r => Math.max(r.measured, r.simulated))) * 1.15; const W = 560, Hh = 330, x0 = 50, y0 = 280, bw = 16;
    const bars = m.map((r, i) => { const x = x0 + i * 40; return `<rect class="bm" x="${x}" y="${(y0 - r.measured / mx * 220).toFixed(1)}" width="${bw}" height="${(r.measured / mx * 220).toFixed(1)}"/><rect class="bs" x="${x + bw + 2}" data-h="${(r.simulated / mx * 220).toFixed(1)}" y="${y0}" width="${bw}" height="0"/><text x="${x + bw + 1}" y="${y0 + 16}" class="sl" text-anchor="middle">${i + 1}월</text>`; }).join('');
    const v = D.val; const row = s => v.filter(r => r.subset === s);
    return `<div class="stg"><svg viewBox="0 0 ${W} ${Hh}" class="smap"><line x1="${x0 - 8}" y1="${y0}" x2="${W - 20}" y2="${y0}" stroke="var(--line)"/>${[0.25, 0.5, 0.75].map(k => `<text x="${x0 - 12}" y="${(y0 - k * 220 + 4).toFixed(1)}" class="sl" text-anchor="end">${ft(mx * k, 1)}</text>`).join("")}<text x="${x0 - 12}" y="${y0 - 220 + 4}" class="sl" text-anchor="end">kWh/m²</text>${bars}
    <g transform="translate(60,24)"><rect class="bm" width="12" height="12"/><text x="18" y="11" class="sl">건축HUB 건물에너지정보 월별 전기(2023–2024)</text><rect class="bsl" x="300" width="12" height="12"/><text x="318" y="11" class="sl">EnergyPlus 계산(보정 후)</text></g>
    <text x="60" y="52" class="sl">${esc(D.B.name)} — 보정 후 CV(RMSE) ${ft(D.B.cv_rmse_cal, 1)}%, NMBE ${ft(D.B.nmbe_cal, 1)}%</text></svg>
    <div class="sside"><p>개선 전 모델의 월 전력을 건축HUB 건물에너지정보(2023–2024년 월별 전기)와 비교해 CV(RMSE)·NMBE를 구한다. 보정은 <b>기기 밀도 1.0, 냉동기 COP 배수 2.0</b> 두 값만 바꾸고 보정용 31동으로 정한 뒤, 시험용 215동에는 손대지 않고 적용한다. ${esc(D.B.name)}의 CV(RMSE)는 보정 전 ${ft(D.B.cv_rmse_uncal, 1)}% → 보정 후 ${ft(D.B.cv_rmse_cal, 1)}%로, 전역 배율이므로 이 건물은 보정 후 오차가 오히려 커졌다.</p>
    <table class="stbl"><tr><th></th><th>보정 전</th><th>보정 후</th></tr>
    ${['보정용 31동', '시험용 215동'].map(s => { const a = row(s); return `<tr><td>${s} CV(RMSE) 중앙값</td><td>${ft(a[0].cv_rmse_median, 1)}%</td><td><b>${ft(a[1].cv_rmse_median, 1)}%</b></td></tr>`; }).join('')}</table>
    <p class="small">ASHRAE Guideline 14 월 기준(CV(RMSE) 15% 이하, NMBE ±5% 이내)을 만족한 건물은 보정 후 31동 중 ${row('보정용 31동')[1].n_pass_g14}동, 215동 중 ${row('시험용 215동')[1].n_pass_g14}동 — 결과를 <b>개선 전후의 상대 비교</b>로만 해석한다는 한계를 원고 5.9·7.3절에 밝힌다.</p></div></div>`;
  },
  tick(p, el) {
    const bs = el.querySelectorAll('.bs'); bs.forEach((b, i) => { const h = +b.dataset.h * rng(p, 0.05 + i * 0.04, 0.3 + i * 0.04); b.setAttribute('height', h.toFixed(1)); b.setAttribute('y', (280 - h).toFixed(1)); });
    el.querySelector('.stbl').style.opacity = rng(p, 0.65, 0.8);
  }
});

/* ---- 장면 4: 개선안 작동(하루) ---- */
SCENES.push({
  dur: 14, title: '④ 성능 개선안 — 9개 대안이 하루 동안 어떻게 움직이는가',
  html(D) {
    const [, M, Dd] = D.ymd;
    const rules = ORDER257.map(t => `<li class="s4r" data-t="${t}"><span class="tag ${ALT[t].category === '고정형 차양' ? 'mut' : 'kin'}">${esc(ALT[t].category)}</span> <b>${esc(ALT[t].name)}</b> — ${esc(ALT[t].operation)}${ALT[t].period && ALT[t].period !== '연중' ? ' · ' + esc(ALT[t].period) : ''}</li>`).join('');
    return `<div class="stg"><svg viewBox="0 0 560 330" class="smap"><rect x="0" y="0" width="560" height="330" fill="#FFFBF2"/>
    <circle id="s4sun" r="14" fill="var(--kin)"/><text id="s4t" x="20" y="28" class="sl mono">${M}월 ${Dd}일(TMYx 기상) 06:00</text><text x="540" y="28" class="sl" text-anchor="end">맑은 날 가정의 설명용 간이 계산</text>
    <text id="s4i" x="20" y="48" class="sl">창면 일사 0 W/m²</text>
    <rect x="190" y="90" width="180" height="200" fill="#fff" stroke="var(--ink)" stroke-width="1.5"/>
    <g id="s4bl">${Array.from({ length: 10 }, (_, i) => `<line class="slat" x1="200" y1="${105 + i * 18}" x2="360" y2="${105 + i * 18}" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>`).join('')}</g>
    <text x="200" y="322" class="sl" id="s4s">블라인드 일사량 기준 제어: 걷어 올림</text>
    <g id="s4lv" transform="translate(400,90)">${Array.from({ length: 6 }, (_, i) => `<rect class="lv" x="0" y="${i * 34}" width="40" height="6" fill="var(--sun)"/>`).join('')}<text x="-10" y="-14" class="sl">수평 루버 컷오프 각도</text></g></svg>
    <div class="sside"><p>계산 간격 <b>10분</b>마다 태양 위치와 창면 일사를 보고 장치 상태를 정한다. 표본 날짜는 257동 합산 피크전력이 난 ${M}월 ${Dd}일.</p><ol class="slist srules">${rules}</ol></div></div>`;
  },
  tick(p, el, D) {
    const h = 6 + 14 * p; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const ang = (h - 6) / 14 * Math.PI; const sx = 60 + 440 * (h - 6) / 14, sy = 285 - Math.sin(ang) * 255;
    const sun = el.querySelector('#s4sun'); sun.setAttribute('cx', sx.toFixed(1)); sun.setAttribute('cy', sy.toFixed(1));
    const alt = Math.sin(ang) * 72; const irr = Math.max(0, Math.sin(ang) * Math.cos((h - 13) / 7 * 1.3)) * 620; // 맑은 날 가정의 간이 창면 일사(장면 설명용)
    el.querySelector('#s4t').textContent = `${D.ymd[1]}월 ${D.ymd[2]}일(TMYx 기상) ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    el.querySelector('#s4i').textContent = `창면 일사 약 ${Math.round(irr)} W/m² · 태양 고도 약 ${alt.toFixed(0)}° (간이 값)`;
    const down = D.ymd[1] >= 5 && D.ymd[1] <= 9 && irr > 300; const cut = Math.min(80, alt + 10); // 컷오프 각도는 설명용 간이 값
    el.querySelectorAll('.slat').forEach((s, i) => { s.style.opacity = down ? 1 : (i < 2 ? 1 : 0.12); s.setAttribute('transform', down ? `rotate(${-cut} 280 ${105 + i * 18})` : ''); });
    el.querySelector('#s4s').textContent = down ? `블라인드 일사량 기준 제어: 내림(컷오프 각도, 300 W/m² 초과)` : '블라인드 일사량 기준 제어: 걷어 올림(300 W/m² 이하)';
    el.querySelectorAll('.lv').forEach((r, i) => r.setAttribute('transform', irr > 0 ? `rotate(${-Math.min(70, alt)} 20 ${i * 34 + 3})` : ''));
    const act = ORDER257.map(t => { const k = ALT[t].category === '고정형 차양' ? 'fixed' : t.startsWith('BT') || t.startsWith('LT') ? 'thresh' : t === 'PK' ? 'peak' : 'track'; return k === 'fixed' ? 1 : k === 'thresh' ? down : k === 'peak' ? (h >= 13 && h < 18) : irr >= 1; });
    el.querySelectorAll('.s4r').forEach((li, i) => li.classList.toggle('on', !!act[i]));
  }
});

/* ---- 장면 5: EnergyPlus 계산 결과(시간별) ---- */
SCENES.push({
  dur: 12, title: '⑤ EnergyPlus 계산 — 8,760시간을 10분 간격으로 계산한다',
  html(D) {
    const W = 560, Hh = 330, x0 = 56, x1 = 540, y0 = 290, y1 = 40; const all = [].concat(...Object.values(D.H)); const mn = Math.min(...all) * 0.95, mx = Math.max(...all) * 1.03;
    const X = i => x0 + (x1 - x0) * i / 23, Y = v => y0 - (y0 - y1) * (v - mn) / (mx - mn);
    const line = (k, c) => `<path class="hl" data-k="${k}" d="${D.H[k].map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join('')}" fill="none" stroke="${c}" stroke-width="2.2"/>`;
    const grid = [0, 6, 12, 18, 23].map(i => `<text x="${X(i)}" y="${y0 + 20}" class="sl" text-anchor="middle">${i}시</text>`).join('');
    const yl = [(mn + mx) / 2, mx].map(v => `<text x="${x0 - 6}" y="${Y(v) + 4}" class="sl" text-anchor="end">${ft(v / 1000, 0)}</text>`).join('');
    const pk = D.ph % 24;
    return `<div class="stg"><svg viewBox="0 0 ${W} ${Hh}" class="smap"><line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="var(--line)"/>${grid}${yl}<text x="${x0 - 6}" y="${y1 - 14}" class="sl" text-anchor="end">MW</text>
    ${line('S1', '#8C949E')}${line('F0', '#1E2A38')}${line('S3', '#F2B33D')}${line('BT_T300', '#E8541E')}
    <line id="s5c" x1="${x0}" y1="${y1}" x2="${x0}" y2="${y0}" stroke="var(--sun)" stroke-dasharray="3 3"/>
    <text id="s5v" x="${x0 + 6}" y="${y1 + 4}" class="sl mono"></text>
    <g transform="translate(${x1 - 215},${y0 - 80})" class="sl"><text y="0" fill="#8C949E">— 개선 전(S1)</text><text y="16" fill="#1E2A38">— 블라인드 고정(F0)</text><text y="32" fill="#B9790C">— 블라인드 컷오프 각도 제어(S3)</text><text y="48" fill="#E8541E">— 블라인드 일사량 기준 제어(BT_T300)</text></g></svg>
    <div class="sside"><p>${esc(META.engine)}. 건물마다 <b>개선 전 + 9개 대안 × 차폐 포함·제외</b>를 계산하고 10분 간격의 난방·냉방·조명·팬 에너지와 전력, 실내 조도·PMV를 출력한다.</p>
    <p>그래프는 ${D.ymd[1]}월 ${D.ymd[2]}일 257동 합산 전력(시간별). 개선 전 연간 피크 <b>${ft(D.blk.S1.peak_kW / 1000, 1)} MW</b>가 이날 ${pk}시에 났다. 블라인드 일사량 기준 제어는 ${ft(D.blk.BT_T300.peak_kW / 1000, 1)} MW(${pct(D.blk.BT_T300.dpeak_pct)}), 블라인드 고정은 ${ft(D.blk.F0.peak_kW / 1000, 1)} MW(${pct(D.blk.F0.dpeak_pct)}).</p>
    <div class="slog mono" id="s5log"></div></div></div>`;
  },
  tick(p, el, D) {
    const prog = rng(p, 0, 0.75); el.querySelectorAll('.hl').forEach(h => { const L = h.getTotalLength(); h.style.strokeDasharray = L; h.style.strokeDashoffset = L * (1 - prog); });
    const i = Math.min(23, Math.floor(prog * 23.999)); const x = 56 + (540 - 56) * prog;
    const c = el.querySelector('#s5c'); c.setAttribute('x1', x.toFixed(1)); c.setAttribute('x2', x.toFixed(1));
    el.querySelector('#s5v').textContent = `${String(i).padStart(2, '0')}:00  S1 ${ft(D.H.S1[i])} kW · BT ${ft(D.H.BT_T300[i])} kW`;
    const steps = ['IDF 생성(윤곽·층수·차폐·대안)', '기상 TMYx 2011–2025 읽기', '워밍업 → 연간 계산(10분 × 52,560 간격)', '출력: 에너지·전력·조도·PMV(시간별)', `완료 — 본 대안 기준 257동 × 20회 = 5,140회(작동 기간 비교·민감도 계산은 별도)`];
    el.querySelector('#s5log').innerHTML = steps.map((s, k) => `<div style="opacity:${rng(p, 0.1 + k * 0.17, 0.2 + k * 0.17)}">▸ ${s}</div>`).join('');
  }
});

/* ---- 장면 6: 지표 산출(표본 건물) ---- */
SCENES.push({
  dur: 13, title: '⑥ 지표 산출 — 개선 전 대비 변화율을 건물마다 구한다',
  html(D) {
    const B = D.B, R = D.R; const base = R.S1;
    const row = t => { const r = R[t]; return `<tr class="s6r"><td><span class="tag ${ALT[t].category === '고정형 차양' ? 'mut' : 'kin'}">${esc(ALT[t].category)}</span> ${esc(ALT[t].name)}</td><td class="mono">${ft(r.EUI, 2)}</td><td class="mono ${r.dEUI_pct < 0 ? 'ok' : 'bad'}">${pct(r.dEUI_pct)}</td><td class="mono">${ft(r.peak_kW)}</td><td class="mono ${r.dpeak_pct < 0 ? 'ok' : 'bad'}">${pct(r.dpeak_pct)}</td></tr>`; };
    return `<div class="stg"><div class="sform">
    <div class="fx s6f"><b>EUI</b>(에너지 원단위) = 연간 에너지 사용량 ÷ 연면적 → 개선 전 <b>${ft(base.EUI, 2)} kWh/m²·yr</b> (${esc(B.name)}, 연면적 ${ft(B.gross_area_m2)} m²)</div>
    <div class="fx s6f"><b>피크전력</b> = 시간별 전력의 연간 최댓값 → 개선 전 <b>${ft(base.peak_kW)} kW</b></div>
    <div class="fx s6f"><b>ΔEUI(%)</b> = (EUI<sub>개선</sub> − EUI<sub>개선 전</sub>) ÷ EUI<sub>개선 전</sub> × 100 — 피크전력도 같은 식. 자연채광(UDI)·열쾌적 비율은 차이(%p)</div>
    <div class="fx s6f">예: 블라인드 고정 ${ft(R.F0.EUI, 3)} → (${ft(R.F0.EUI, 3)} − ${ft(base.EUI, 3)}) ÷ ${ft(base.EUI, 3)} × 100 = <b>${pct(R.F0.dEUI_pct)}</b></div></div>
    <table class="stbl s6t"><tr><th>대안</th><th>EUI</th><th>ΔEUI</th><th>피크 kW</th><th>Δ피크</th></tr>${ORDER257.map(row).join('')}</table>
    <p class="small">${esc(B.name)} 1동의 값(주변 차폐 포함). 자연채광(UDI) 개선 전 ${ft(base.UDI, 1)}% → 블라인드 고정 ${ft(R.F0.UDI, 1)}%(${sgn(R.F0.dUDI_pp, 1, '%p')}), 블라인드 일사량 기준 제어 ${ft(R.BT_T300.UDI, 1)}%(${sgn(R.BT_T300.dUDI_pp, 1, '%p')}).</p></div>`;
  },
  tick(p, el) {
    el.querySelectorAll('.s6f').forEach((f, i) => f.style.opacity = rng(p, i * 0.12, 0.1 + i * 0.12));
    el.querySelectorAll('.s6r').forEach((r, i) => r.style.opacity = rng(p, 0.5 + i * 0.045, 0.56 + i * 0.045));
  }
});

/* ---- 장면 7: 257동 → 중앙값 ---- */
SCENES.push({
  dur: 13, title: '⑦ 257동으로 모으기 — 중앙값과 건물 조건별 비교',
  html(D) {
    const d = D.dist, n = d.length; const W = 560, Hh = 330, x0 = 40, x1 = 540, y0 = 170; const mn = Math.min(...d), mx = Math.max(...d); const Y = v => y0 - v / Math.max(Math.abs(mn), Math.abs(mx)) * 120;
    const bars = d.map((v, i) => `<rect class="db" x="${(x0 + (x1 - x0) * i / n).toFixed(1)}" width="${((x1 - x0) / n - 0.4).toFixed(2)}" y="${Math.min(y0, Y(v)).toFixed(1)}" height="${Math.abs(y0 - Y(v)).toFixed(1)}" fill="${v < 0 ? 'var(--ok)' : 'var(--sun)'}"/>`).join('');
    const m = D.med.F0; const mi = Math.floor(n / 2);
    return `<div class="stg"><svg viewBox="0 0 ${W} ${Hh}" class="smap"><line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="var(--ink)"/>${bars}
    <g id="s7m" style="opacity:0"><line x1="${(x0 + (x1 - x0) * mi / n).toFixed(1)}" y1="30" x2="${(x0 + (x1 - x0) * mi / n).toFixed(1)}" y2="${y0 + 100}" stroke="var(--ink)" stroke-dasharray="4 3"/><text x="${(x0 + (x1 - x0) * mi / n + 8).toFixed(1)}" y="42" class="sl">중앙값 ${pct(m.e)} (${n}동 중 ${m.dec}동 감소)</text></g>
    <text x="${x0}" y="${Hh - 10}" class="sl">블라인드 고정 — 257동의 ΔEUI(%)를 작은 값부터 늘어놓은 것. 초록 = 감소, 주황 = 증가</text></svg>
    <div class="sside"><p>건물별 변화율을 대안마다 ${n}동 모아 <b>중앙값</b>으로 보고하고(원고 표 4), 가려진 정도·평면 면적·층수 구간별로 다시 나눈다(표 6, 건물 특성별 페이지).</p>
    <table class="stbl s7t"><tr><th>대안</th><th>ΔEUI 중앙값</th><th>Δ피크 중앙값</th><th>감소 건물</th></tr>${ORDER257.map(t => `<tr class="s7r"><td>${esc(ALT[t].name)}</td><td class="mono ${D.med[t].e < 0 ? 'ok' : 'bad'}">${pct(D.med[t].e)}</td><td class="mono ${D.med[t].p < 0 ? 'ok' : 'bad'}">${pct(D.med[t].p)}</td><td class="mono">${D.med[t].dec}동</td></tr>`).join('')}</table>
    <p class="small">가려진 정도 구간 경계 ${ft(D.cb.obstruction_deg[0], 1)}°·${ft(D.cb.obstruction_deg[1], 1)}°, 평면 면적 ${ft(D.cb.footprint_model_m2[0], 1)}·${ft(D.cb.footprint_model_m2[1], 1)} m²(3분위), 층수 6~10·11~20·21층 이상. 전체 결과는 <a href="#/results">결과</a>·<a href="#/traits">건물 특성별</a> 페이지.</p></div></div>`;
  },
  tick(p, el, D) {
    const bs = el.querySelectorAll('.db'); const k = Math.floor(rng(p, 0, 0.5) * bs.length); bs.forEach((b, i) => b.style.opacity = i < k ? 1 : 0.05);
    el.querySelector('#s7m').style.opacity = rng(p, 0.52, 0.62);
    el.querySelectorAll('.s7r').forEach((r, i) => r.style.opacity = rng(p, 0.6 + i * 0.04, 0.66 + i * 0.04));
  }
});

/* ---- 페이지 ---- */
function pageStory() {
  const D = storyData();
  $('#page-story').innerHTML = `<h1>시뮬레이션 과정 — 수치가 만들어지는 길</h1>
  <p class="lead">대상지에서 건물을 고르고 모델을 만들어 EnergyPlus로 계산한 뒤, 개선 전 대비 변화율을 257동으로 모으기까지를 7개 장면으로 보여 준다. 표본 건물은 상세 모델 3개 동 가운데 <b>${esc(D.B.name)}</b>, 장면 ④의 하루 그림(태양 위치·창면 일사)만 설명용 간이 값이고, 그 밖의 숫자는 모두 연구 DB의 값이다.</p>
  <div class="splayer">
    <div class="sbar"><button class="btn" id="spp">⏸ 일시정지</button><button class="btn ghost" id="sprev">‹ 이전</button><button class="btn ghost" id="snext">다음 ›</button>
      <label class="small">속도 <select id="sspd"><option value="0.6">느리게</option><option value="1" selected>보통</option><option value="1.6">빠르게</option></select></label>
      <div class="sdots">${SCENES.map((s, i) => `<button data-i="${i}" title="${esc(s.title)}"></button>`).join('')}</div></div>
    <div class="sprog" id="sprog"><i id="sfill"></i></div>
    <h2 id="stitle"></h2>
    <div id="sstage"></div>
  </div>
  <h2>장면 설명</h2>
  <ol class="slist">${SCENES.map(s => `<li>${esc(s.title)}</li>`).join('')}</ol>
  ${note('장면 ④의 태양 고도·창면 일사는 설명용 간이 값이며, 장치 상태는 원고 표 2의 작동 규칙을 간이하게 적용한 것이다(주변 차폐·요일 판정 없음). 그 밖의 숫자(건물 제원, 실측 비교, 시간별 전력, EUI·피크전력·변화율·중앙값)는 모두 연구 DB(research.sqlite)의 값이다. ' + SIMNOTE)}`;
  const show = i => { STORY.sc = (i + SCENES.length) % SCENES.length; STORY.t = 0; const s = SCENES[STORY.sc]; $('#stitle').textContent = s.title; $('#sstage').innerHTML = s.html(D); $$('.sdots button').forEach((b, k) => b.classList.toggle('on', k === STORY.sc)); s.tick(0, $('#sstage'), D); };
  $('#spp').addEventListener('click', () => { STORY.play = !STORY.play; $('#spp').textContent = STORY.play ? '⏸ 일시정지' : '▶ 재생'; STORY.last = 0; });
  $('#sprev').addEventListener('click', () => show(STORY.sc - 1)); $('#snext').addEventListener('click', () => show(STORY.sc + 1));
  $('#sspd').addEventListener('change', e => STORY.speed = +e.target.value);
  $$('.sdots button').forEach(b => b.addEventListener('click', () => show(+b.dataset.i)));
  $('#sprog').addEventListener('click', e => { const r = e.currentTarget.getBoundingClientRect(); STORY.t = (e.clientX - r.left) / r.width * SCENES[STORY.sc].dur; });
  show(0);
  const loop = ts => {
    STORY.raf = requestAnimationFrame(loop);
    if (!$('#page-story').classList.contains('on')) { STORY.last = 0; return; }
    if (STORY.last && STORY.play) STORY.t += (ts - STORY.last) / 1000 * STORY.speed; STORY.last = ts;
    const s = SCENES[STORY.sc]; if (STORY.t >= s.dur + 1.2) { show(STORY.sc + 1); return; }
    const p = Math.min(1, STORY.t / s.dur); $('#sfill').style.width = (p * 100).toFixed(1) + '%'; s.tick(p, $('#sstage'), D);
  };
  if (!STORY.raf) STORY.raf = requestAnimationFrame(loop);
}
