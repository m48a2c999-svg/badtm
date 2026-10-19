/* 라우터와 페이지(개요·논문·지도·결과·문헌·자료) */
(function () {
  const C = window.CONTENT, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cache = {};
  const load = name => cache[name] || (cache[name] = fetch(`data/${name}.json`).then(r => r.json()));
  window.APP = { load, esc };
  const fmt = (v, d = 2) => v == null || isNaN(v) ? '—' : (+v).toFixed(d);
  const sgn = (v, d = 2) => v == null || isNaN(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const num = s => { if (s == null) return NaN; const t = String(s).replace(/,/g, '').replace('−', '-').replace('%', '').trim(); return parseFloat(t); };

  /* ---------- lightbox ---------- */
  const lb = document.createElement('div'); lb.className = 'lightbox'; lb.innerHTML = '<img alt="">'; document.body.appendChild(lb);
  lb.onclick = () => lb.classList.remove('on');
  document.addEventListener('click', e => { const im = e.target.closest('figure img'); if (im) { lb.firstChild.src = im.src; lb.classList.add('on'); } });
  const fig = (f, cap) => `<figure><img loading="lazy" src="figs/${f}" alt="${esc(cap)}"><figcaption>${esc(cap)}</figcaption></figure>`;

  /* ---------- hero illustration (서명 색상: 태양 추적 주황, 키네틱 작동 황색, 주 구조 남색, 메시 회색) ---------- */
  function heroSVG() {
    let mesh = '', mods = '', floors = '';
    for (let i = 0; i <= 24; i++) mesh += `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="260" />`;
    for (let j = 0; j <= 26; j++) mesh += `<line x1="0" y1="${j * 10}" x2="240" y2="${j * 10}" />`;
    for (let f = 0; f <= 4; f++) floors += `<line x1="-30" y1="${f * 65}" x2="270" y2="${f * 65}" />`;
    const open = [[1, 1], [2, 1], [1, 2], [2, 2], [2, 3]];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = 20 + c * 52, y = 8 + r * 62, isOpen = open.some(o => o[0] === c && o[1] === r);
      const tri = (pts, cls) => `<polygon class="${cls}" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
      if (isOpen) {
        mods += tri([[x, y], [x + 44, y], [x + 22 + 18, y + 26]], 'k1') + tri([[x, y], [x + 22 + 18, y + 26], [x - 2, y + 52]], 'k2') + tri([[x + 44, y], [x + 40, y + 26], [x + 44, y + 52]], 'k3') + tri([[x - 2, y + 52], [x + 40, y + 26], [x + 44, y + 52]], 'k1');
      } else {
        mods += tri([[x, y], [x + 44, y], [x + 22, y + 26]], 'm') + tri([[x, y], [x + 22, y + 26], [x, y + 52]], 'm') + tri([[x + 44, y], [x + 22, y + 26], [x + 44, y + 52]], 'm') + tri([[x, y + 52], [x + 22, y + 26], [x + 44, y + 52]], 'm');
      }
    }
    let rays = '';
    const targets = [[150, 95], [120, 140], [175, 150], [150, 200], [180, 230]];
    targets.forEach(([tx, ty], i) => { rays += `<path class="ray" d="M520 70 Q ${420 - i * 10} ${100 + i * 26} ${tx + 260} ${ty * 0.72 + 120}"/>`; });
    return `<svg viewBox="0 0 600 470" role="img" aria-label="키네틱 외피 모듈과 태양 경로 개념도">
<style>.mesh line{stroke:#8C949E;stroke-width:.5;opacity:.7}.fl line{stroke:#1E2A38;stroke-width:3}.m{fill:#fff;stroke:#1E2A38;stroke-width:.8}.k1{fill:#F2B33D;stroke:#1E2A38;stroke-width:.8}.k2{fill:#FBD98C;stroke:#1E2A38;stroke-width:.8}.k3{fill:#E8A82A;stroke:#1E2A38;stroke-width:.8}.ray{fill:none;stroke:#E8541E;stroke-width:1.6;stroke-dasharray:5 5}.lbl{font:600 10.5px 'IBM Plex Mono',monospace;fill:#1E2A38;letter-spacing:.08em}.lbl2{font:500 9.5px 'IBM Plex Mono',monospace;fill:#6B7480}</style>
<g transform="translate(40,120) matrix(1,-0.32,0,1,0,0)"><g transform="translate(0,0)">
 <rect x="-34" y="-8" width="40" height="290" fill="#E9EBEE" stroke="#1E2A38" stroke-width="1.2"/>
 <g class="fl">${floors}</g>
 <g transform="translate(20,0)"><rect x="0" y="0" width="240" height="260" fill="#fff" stroke="#1E2A38" stroke-width="1"/><g class="mesh">${mesh}</g><g>${mods}</g></g>
</g></g>
<path d="M300 440 Q 120 380 70 300" fill="none" stroke="#E8541E" stroke-width="1.6" stroke-dasharray="5 5"/>
<path d="M330 455 Q 520 430 560 300 Q 590 180 520 70" fill="none" stroke="#E8541E" stroke-width="1.6" stroke-dasharray="5 5"/>
${rays}
<g transform="translate(520,70)"><circle r="13" fill="none" stroke="#E8541E" stroke-width="2.2"/><path d="M0 -26V26M-26 0H26" stroke="#E8541E" stroke-width="2.2"/></g>
<text class="lbl" x="452" y="40">SUN PATH</text>
<g transform="translate(420,330)"><text class="lbl" x="0" y="0">KINETIC MODULATION</text><text class="lbl2" x="0" y="16">ACTIVE POSITION · WIRE GRID MESH</text></g>
<g transform="translate(400,385)" class="lbl2"><rect width="9" height="9" fill="#E8541E"/><text x="14" y="8">SOLAR TRACKING</text><rect y="14" width="9" height="9" fill="#F2B33D"/><text x="14" y="22">KINETIC ACTIVATION</text><rect y="28" width="9" height="9" fill="#1E2A38"/><text x="14" y="36">PRIMARY STRUCTURE</text><rect y="42" width="9" height="9" fill="#8C949E"/><text x="14" y="50">MESH GRID</text></g>
</svg>`;
  }

  /* ---------- pages ---------- */
  function pageHome() {
    const m = C.meta;
    $('#page-home').innerHTML = `
<div class="hero">
  <div>
    <div class="kicker">Doctoral research · 2026</div>
    <h1 class="htitle">${(m.titleParts || [m.titleKo]).map(s => `<span>${esc(s)}</span>`).join(' ')}</h1>
    <p class="lead">— ${esc(m.subKo)} —</p>
    <p style="color:var(--muted);font-size:13.5px;margin:-4px 0 14px">${esc(m.titleEn)}</p>
    <p class="lead">서울 역삼역 일대 업무시설을 대상으로, 공개 자료로 만든 건물 모델 위에서 기존 키네틱 외피(블라인드·루버·핀·전기변색 유리)와 제어 방식이 건물과 건물군의 에너지·최대 전력·주광·열쾌적을 어떻게 바꾸는지 같은 기준으로 비교한 연구입니다.</p>
    <div class="row" style="margin:16px 0 10px"><a class="btn sun" href="#/sim">시뮬레이션 열기</a><a class="btn" href="#/map">지도에서 보기</a><a class="btn ghost" href="#/thesis">논문 요약</a></div>
    <div class="note">${esc(m.status)}</div>
  </div>
  <div class="card tick" style="align-self:start"><div class="kicker" style="margin-bottom:6px">At a glance</div>
    <table class="tbl" style="font-size:13px"><tbody>
    <tr><td>대상지</td><td>서울 강남구 역삼역 일대 업무시설</td></tr>
    <tr><td>상세 분석</td><td>아크플레이스(24층) · 강남파이낸스센터(45층) · GS타워(38층)</td></tr>
    <tr><td>다수 건물</td><td>공개 자료로 자동 생성한 50동 (실측 비교 47동)</td></tr>
    <tr><td>주변 건물</td><td>OpenStreetMap 814동 (모델의 차폐 입력은 높은 건물 81동)</td></tr>
    <tr><td>시스템</td><td>외부 블라인드 80 mm · 대형 루버 300 mm · 수직 핀 · 전기변색 유리</td></tr>
    <tr><td>계산</td><td>EnergyPlus 23.2 · 서울 TMYx 2011–2025</td></tr>
    <tr><td>실측</td><td>건축HUB 월 전기·가스 2023–2024</td></tr></tbody></table></div>
</div>
<figure style="margin:0 0 26px"><img src="figs/concept_yeoksam.svg" alt="같은 태양 아래의 역삼 블록 개념도 — 측정·분석한 50동, 주변 건물, 7월 31일 태양 경로, 프레임워크 6개 층" style="cursor:zoom-in"><figcaption>개념도 — 실제 역삼 블록(OpenStreetMap 외곽선)에 측정·분석한 건물을 색으로 구분하고, 같은 태양(7월 31일 경로) 아래에서 6개 층의 절차로 비교한다. 오른쪽 아래 곡선은 50동 블록의 7월 31일 시간별 전력(EnergyPlus, 원형 스케줄 vs ±2시간 시차).</figcaption></figure>
<div class="kicker">Key results · 시뮬레이션 값</div>
<div class="grid g4">${C.stats.map(s => `<div class="card stat tick"><b class="${s.c}">${esc(s.v)}</b><span>${esc(s.l)}</span><em>${esc(s.e)}</em></div>`).join('')}</div>
<div style="height:28px"></div>
<div class="kicker">Research questions</div>
<div class="grid g3">${C.questions.map(q => `<div class="card"><span class="tag sun">${q[0]}</span><h3 style="margin-top:8px">${esc(q[1])}</h3><p style="font-size:13.5px;color:var(--ink2);margin:0">${esc(q[2])}</p></div>`).join('')}</div>
<div style="height:28px"></div>
<div class="kicker">Framework · 6 layers — <a href="#/framework" style="letter-spacing:0">프레임워크로 말할 수 있는 범위 →</a></div>
<div class="layers">${C.layers.map(l => `<div><b>${l[0]}</b><strong>${esc(l[1])}</strong><small>${esc(l[2])}</small><small style="color:#8a5a06">생물 원리: ${esc(l[3])}</small></div>`).join('')}</div>
<div style="height:28px"></div>
<div class="kicker">Hypotheses</div>
<div class="scroll" style="max-height:none"><table class="tbl"><thead><tr><th>가설</th><th>내용</th><th>판정</th></tr></thead><tbody>
${C.hypotheses.map(h => `<tr><td><b>${h[0]}</b> ${esc(h[1])}</td><td>${esc(h[2])}</td><td><span class="tag ${h[4]}">${esc(h[3])}</span></td></tr>`).join('')}
</tbody></table></div>`;
  }

  function pageThesis() {
    const m = C.meta;
    $('#page-thesis').innerHTML = `
<div class="kicker">Thesis · 장별 요약</div>
<h1 class="htitle" style="font-size:clamp(24px,2.4vw,32px)">${(m.titleParts || [m.titleKo]).map(s => `<span>${esc(s)}</span>`).join(" ")}</h1>
<p style="color:var(--ink2)">${esc(m.author)} · ${esc(m.school)} · 지도교수 ${esc(m.advisor)} · <span class="mono" style="font-size:12px">${esc(m.version)}</span></p>
<div class="warn">${esc(m.status)} 아래 글은 논문 본문을 옮긴 것이 아니라 이 사이트를 위해 다시 쓴 요약입니다.</div>
<div style="height:18px"></div>
<div class="twocol">
  <aside class="toc">${C.chapters.map(c => `<a href="#/thesis/${c.id}" data-jump="${c.id}">${c.n}. ${esc(c.t)}</a>`).join('')}<a href="#/results">→ 결과 표·그림</a><a href="#/lit">→ 참고문헌·문헌 DB</a></aside>
  <div>${C.chapters.map(c => `<article class="chap card" id="${c.id}"><h2><span>CH ${c.n}</span>${esc(c.t)}</h2><ul>${c.pts.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
    ${c.figs.length ? `<div class="grid ${c.figs.length > 1 ? 'g2' : ''}">${c.figs.map(f => fig(f[0], f[1])).join('')}</div>` : ''}</article>`).join('')}</div>
</div>`;
    $$('#page-thesis [data-jump]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }


  function pageFramework() {
    const F = C.framework, cls = { ok: 'kin', warn: 'sun' };
    $('#page-framework').innerHTML = `<div class="kicker">Framework · 무엇을 프레임워크라고 말할 수 있는가</div>
<h1 style="font-size:28px">데이터 기반 성능 평가 프레임워크의 범위</h1>
<p style="color:var(--ink2);max-width:80ch">${esc(F.def)}</p>
<div style="height:10px"></div>
<div class="kicker">층별 구현과 확인 상태</div>
<div class="scroll" style="max-height:none"><table class="tbl"><thead><tr><th>층</th><th>이번 연구에서 실제로 한 것</th><th>확인 방법과 결과</th><th>상태</th></tr></thead><tbody>
${F.rows.map(r => `<tr><td><b class="mono" style="color:var(--sun)">${r[0]}</b><br>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td><span class="tag ${cls[r[5]]}">${esc(r[4])}</span></td></tr>`).join('')}
</tbody></table></div>
<div style="height:18px"></div>
<div class="grid g2">
<div class="card tick"><h3>프레임워크라고 말할 수 있는 근거</h3><ol style="font-size:14px;padding-left:20px;margin:0">${F.can.map(x => `<li style="margin:6px 0">${esc(x)}</li>`).join('')}</ol></div>
<div class="card"><h3>프레임워크로 주장할 수 없는 것</h3><ul style="font-size:14px;padding-left:20px;margin:0">${F.cannot.map(x => `<li style="margin:6px 0">${esc(x)}</li>`).join('')}</ul></div>
</div>
<div style="height:16px"></div>
<div class="card"><h3>발표·논문에서 쓸 표현</h3><table class="tbl"><tbody>${F.say.map(s => `<tr><td style="width:70px"><span class="tag ${s[0] === '권장' ? 'kin' : 'mut'}">${s[0]}</span></td><td>${esc(s[1])}</td></tr>`).join('')}</tbody></table></div>
<div style="height:16px"></div>
<div class="grid g2"><div class="card"><h3>6개 층과 생물 원리</h3><div class="layers" style="grid-template-columns:repeat(2,minmax(0,1fr))">${C.layers.map(l => `<div><b>${l[0]}</b><strong>${esc(l[1])}</strong><small>${esc(l[2])}</small><small style="color:#8a5a06">생물 원리: ${esc(l[3])}</small></div>`).join('')}</div></div>
${fig('new_4_1_framework.png', '그림 4-1. 프레임워크의 6개 층과 층별 확인 방법')}</div>
<p class="note">근거: 논문 표 4-1(층별 입력·처리·출력과 채택한 기존 방법), 표 4-9(층별 검증 방법과 판단 기준), 5.4절·6.3절·6.5절·7.4절, 8.3절(한계).</p>`;
  }

  /* ---------- SVG chart helpers ---------- */
  function scatterSVG(pts, o) {
    const W = 720, H = 420, L = 64, R = 20, T = 20, B = 52;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const x0 = Math.min(...xs, 0) - .3, x1 = Math.max(...xs, 0) + .3, y0 = Math.min(...ys, 0) - .4, y1 = Math.max(...ys, 0) + .4;
    const X = v => L + (v - x0) / (x1 - x0) * (W - L - R), Y = v => T + (y1 - v) / (y1 - y0) * (H - T - B);
    let g = `<line x1="${X(0)}" y1="${T}" x2="${X(0)}" y2="${H - B}" stroke="#1E2A38" stroke-width="1"/><line x1="${L}" y1="${Y(0)}" x2="${W - R}" y2="${Y(0)}" stroke="#1E2A38" stroke-width="1"/>`;
    for (let v = Math.ceil(x0); v <= x1; v += 1) g += `<line x1="${X(v)}" y1="${H - B}" x2="${X(v)}" y2="${H - B + 4}" stroke="#8C949E"/><text x="${X(v)}" y="${H - B + 16}" text-anchor="middle">${v}%</text>`;
    for (let v = Math.ceil(y0); v <= y1; v += 1) g += `<line x1="${L - 4}" y1="${Y(v)}" x2="${L}" y2="${Y(v)}" stroke="#8C949E"/><text x="${L - 7}" y="${Y(v) + 4}" text-anchor="end">${v}%</text>`;
    g += `<text x="${(L + W - R) / 2}" y="${H - 12}" text-anchor="middle">${o.xl}</text><text transform="translate(16,${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${o.yl}</text>`;
    pts.forEach(p => { g += `<g><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="6" fill="${p.c}" stroke="#1E2A38" stroke-width="1"><title>${esc(p.t)}: ΔEUI ${sgn(p.x)}%, Δ최대 전력 ${sgn(p.y)}%</title></circle><text x="${X(p.x) + 9}" y="${Y(p.y) + 4}" style="font-size:10.5px">${esc(p.k)}</text></g>`; });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
  }
  function barsSVG(rows, o) {
    const W = 720, rowH = 30, L = 260, R = 70, T = 14, H = T + rows.length * rowH + 30;
    const vals = rows.map(r => r.v), lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const X = v => L + (v - lo) / (hi - lo || 1) * (W - L - R);
    let g = `<line x1="${X(0)}" y1="${T - 4}" x2="${X(0)}" y2="${H - 24}" stroke="#1E2A38"/>`;
    rows.forEach((r, i) => {
      const y = T + i * rowH, x = Math.min(X(0), X(r.v)), w = Math.abs(X(r.v) - X(0));
      g += `<text x="${L - 8}" y="${y + 18}" text-anchor="end">${esc(r.k)}</text><rect x="${x}" y="${y + 6}" width="${Math.max(1, w)}" height="${rowH - 12}" fill="${r.c}"><title>${esc(r.k)} ${sgn(r.v)}%</title></rect><text x="${r.v >= 0 ? X(r.v) + 6 : X(r.v) - 6}" y="${y + 19}" text-anchor="${r.v >= 0 ? 'start' : 'end'}" style="font-weight:600">${sgn(r.v)}%</text>`;
    });
    g += `<text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle">${o.xl}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
  }
  function lineSVG(series, o) {
    const W = 760, H = 330, L = 64, R = 16, T = 22, B = 40;
    const n = series[0].v.length; let lo = Infinity, hi = -Infinity;
    series.forEach(s => s.v.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); }));
    const pad = (hi - lo) * .08 || 1; lo -= pad; hi += pad;
    const X = i => L + i / (n - 1) * (W - L - R), Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; g += `<line x1="${L}" y1="${Y(v)}" x2="${W - R}" y2="${Y(v)}" stroke="#E3E5E8"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v).toLocaleString()}</text>`; }
    const step = o.xstep || Math.ceil(n / 12);
    for (let i = 0; i < n; i += step) g += `<text x="${X(i)}" y="${H - B + 16}" text-anchor="middle">${o.xlab ? o.xlab(i) : i}</text>`;
    series.forEach(s => { g += `<polyline fill="none" stroke="${s.c}" stroke-width="${s.w || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} points="${s.v.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`; });
    g += `<text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle">${o.xl || ''}</text><text x="${L}" y="${T - 4}" text-anchor="start">${o.yl || ''}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>`;
  }
  window.APP.charts = { lineSVG, barsSVG, scatterSVG };

  /* ---------- results ---------- */
  const KEEP = new Set(['EC_DL', 'EC_DLS', 'BT_T300']);
  const SCN = { S1c: ['기준 S1c', '#1E2A38'], F0c: ['블라인드 수평 고정', '#E8541E'], LH_F0c: ['대형 루버 고정', '#B23A0E'], VF_F0c: ['수직 핀 고정', '#8C949E'], EC_DLSc: ['전기변색 주광 연동', '#F2B33D'], BT_T300c: ['블라인드 일사 기준·수납', '#C98A10'], LT_T300c: ['대형 루버 일사 기준', '#F07A3E'], S1c_D1: ['운전 시차 ±1시간', '#3E8E7E'], S1c_D2: ['운전 시차 ±2시간', '#1F6F5F'] };
  async function pageResults() {
    const el = $('#page-results');
    el.innerHTML = `<div class="kicker">Results · 시뮬레이션 결과 자료</div><h1 style="font-size:28px">결과 데이터</h1>
<p style="color:var(--ink2)">모든 값은 EnergyPlus 23.2(서울 TMYx 2011–2025) 시뮬레이션입니다. 최대 전력은 1시간 평균 전력의 연간 최댓값이며, 같은 모델 안의 안 사이 상대 비교로만 해석합니다.</p>
<div class="tabs" id="rtabs"><button data-p="r1" class="on"><span class="mono">01</span>3개 동 시스템 비교</button><button data-p="r2"><span class="mono">02</span>50동 블록</button><button data-p="r3"><span class="mono">03</span>블록 전력 탐색기</button><button data-p="r4"><span class="mono">04</span>논문 표 29개</button><button data-p="r5"><span class="mono">05</span>그림</button></div>
<div class="pane on" id="r1"></div><div class="pane" id="r2"></div><div class="pane" id="r3"></div><div class="pane" id="r4"></div><div class="pane" id="r5"></div>`;
    $$('#rtabs button').forEach(b => b.onclick = () => { $$('#rtabs button').forEach(x => x.classList.toggle('on', x === b)); $$('#page-results .pane').forEach(p => p.classList.toggle('on', p.id === b.dataset.p)); });
    const [tabs, blk] = await Promise.all([load('tables'), load('block50')]);
    // r1: table 6-5 scatter
    const t65 = tabs.find(t => t.caption.startsWith('표 6-5'));
    const pts = t65.rows.filter(r => r[0] !== 'S1').map(r => ({ k: r[0], t: r[1], x: num(r[3]), y: num(r[5]), c: KEEP.has(r[0]) ? '#F2B33D' : (r[0].startsWith('EC') ? '#FBD98C' : '#E8541E') }));
    $('#r1').innerHTML = `<div class="grid g2"><div class="card"><h3>블록 EUI 변화 vs 블록 최대 전력 변화 (3개 동, S1 대비)</h3>${scatterSVG(pts, { xl: '블록 EUI 변화', yl: '블록 최대 전력 변화' })}
<div class="legend-row"><span><i style="background:#E8541E"></i>주광을 잃는 제어</span><span><i style="background:#F2B33D"></i>주광 유지 제어(EC 주광 연동·BT_T 수납)</span><span><i style="background:#FBD98C"></i>전기변색 일사 기준·피크 착색</span></div></div>
<div class="card"><h3>읽는 법</h3><ul style="font-size:13.5px;padding-left:18px"><li>오른쪽 아래(에너지 감소·피크 감소)에 놓인 안이 없습니다. 에너지를 가장 줄인 수평 고정 장치(F0, LH_F0)는 피크를 올렸습니다.</li><li>피크를 올리지 않은 것은 주광을 유지한 제어뿐이며(−0.08~−0.29%), 이 제어는 열쾌적 비율을 1.3~9.2%p 낮췄습니다.</li><li>피크 시간 차단(PK, EC_PK)은 조명 증가가 공조 전력 감소를 넘어 +3.2% 이상 올렸습니다.</li><li>전기변색 연중 제어(EC_DL, EC_SOL)는 겨울 일사 이득을 잃어 EUI가 늘었습니다.</li></ul>
<div class="note">창면적비 40%, 가시광 투과율 0.305인 DOE 원형 외피 조건의 값입니다.</div></div></div>
<div style="height:14px"></div>${tableHTML(t65)}`;
    // r2: 50동 block bars
    const t77 = tabs.find(t => t.caption.startsWith('표 7-7')), t610 = tabs.find(t => t.caption.startsWith('표 6-10'));
    const bars = t77.rows.filter(r => r[2] !== '—').map(r => ({ k: r[0], v: num(r[2]), c: r[0].includes('시차') ? '#3E8E7E' : (r[0].includes('주광 연동') || r[0].includes('걷어 올림') ? '#F2B33D' : '#E8541E') }));
    $('#r2').innerHTML = `<div class="card"><h3>50동 블록 최대 전력 변화 (보정 기준 S1c 대비)</h3>${barsSVG(bars, { xl: '블록 최대 전력 변화 (%)' })}
<div class="note">주광 유지 제어(−0.01~−0.02%)는 기본 15분 계산의 값이며, 전기변색 주광 연동을 10분 간격으로 다시 계산하면 −0.35%로 달라져 크기는 계산 설정에 민감합니다. ±2시간 시차의 3개 동 블록 EUI는 약 0.38% 늘었고, 50동 시차의 EUI는 산출하지 않았습니다.</div></div>
<div style="height:14px"></div>${tableHTML(t77)}<div style="height:14px"></div>${tableHTML(t610)}`;
    // r3: explorer
    renderExplorer($('#r3'), blk);
    // r4: tables
    $('#r4').innerHTML = `<div class="row"><select id="tsel" style="flex:1;min-width:260px">${tabs.map((t, i) => `<option value="${i}">${esc(t.caption)}</option>`).join('')}</select></div><div id="tview" style="margin-top:12px"></div>`;
    const showT = () => { $('#tview').innerHTML = tableHTML(tabs[+$('#tsel').value]); }; $('#tsel').onchange = showT; showT();
    // r5: figures
    const F = C.chapters.flatMap(c => c.figs.map(f => [f[0], `${c.n}장 · ${f[1]}`]));
    $('#r5').innerHTML = `<div class="grid g3">${F.map(f => fig(f[0], f[1])).join('')}</div>`;
  }
  function tableHTML(t) {
    const isNum = s => /^[−+\-]?[\d,.]+(%|%p)?$/.test(String(s).trim());
    return `<div class="card" style="padding:0"><div style="padding:12px 14px"><h3 style="margin:0">${esc(t.caption)}</h3></div><div class="scroll"><table class="tbl"><thead><tr>${t.header.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map(c => `<td class="${isNum(c) ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${t.note ? `<div class="note" style="margin:10px 14px 14px">${esc(t.note)}</div>` : ''}</div>`;
  }
  function renderExplorer(el, B) {
    const md = d => { const x = window.SOLAR.doyToDate(d + 1); return `${x.m}/${x.d}`; };
    el.innerHTML = `<div class="grid xgrid">
<div class="card"><label class="ctl">날짜 <b id="xdate"></b></label><input type="range" id="xday" min="0" max="364" value="211">
<div class="row" style="margin-top:6px">${B.peak_days.slice(0, 4).map(d => `<button class="btn ghost" style="padding:5px 8px;font-size:12px" data-d="${d}">${md(d)}</button>`).join('')}</div>
<label class="ctl">안 선택</label>${B.scenarios.map(s => `<label class="chk"><input type="checkbox" value="${s}" ${['S1c', 'F0c', 'EC_DLSc', 'S1c_D2'].includes(s) ? 'checked' : ''}><i style="width:12px;height:3px;background:${SCN[s][1]};display:inline-block"></i>${SCN[s][0]}</label>`).join('')}
<div class="note">블록 = 50동 시간별 전력의 합. 시차 안(D1·D2)은 공조 용량을 고정한 EnergyPlus 재계산 결과입니다.</div></div>
<div><div class="card"><h3 id="xtitle"></h3><div id="xchart"></div></div>
<div style="height:12px"></div><div class="card"><h3>연간 요약 (50동 블록)</h3><div class="scroll" style="max-height:none"><table class="tbl"><thead><tr><th>안</th><th>블록 최대 전력 (kW)</th><th>S1c 대비</th><th>동시계수</th><th>최대 시각</th></tr></thead><tbody>
${B.scenarios.map(s => { const r = B.summary[s], d = Math.floor(r.hour / 24), h = r.hour % 24; return `<tr><td>${SCN[s][0]}</td><td class="num">${Math.round(r.peak).toLocaleString()}</td><td class="num">${s === 'S1c' ? '—' : sgn(r.dP) + '%'}</td><td class="num">${r.CF.toFixed(3)}</td><td class="num">${md(d)} ${h}시</td></tr>`; }).join('')}</tbody></table></div></div>
<div style="height:12px"></div><div class="card"><h3>직접 해 보기 — 운전 시각 이동의 단순 근사</h3>
<p style="font-size:13px;color:var(--ink2);margin-top:0">7월 31일 각 건물의 기준 전력 곡선을 시간축으로 옮겨 합한 값입니다. EnergyPlus 재계산과 비교하면, 단순 이동은 효과를 크게 보입니다(공조·축열과 설계일 용량이 함께 움직이지 않기 때문).</p>
<div class="row"><select id="shp"><option value="D1">논문의 D1 배정(±1시간)</option><option value="D2" selected>논문의 D2 배정(±2시간)</option><option value="R1">무작위 ±1시간</option><option value="R2">무작위 ±2시간</option><option value="R3">무작위 ±3시간</option></select><button class="btn ghost" id="shgo">계산</button></div>
<div id="shout" style="margin-top:10px"></div></div></div></div>`;
    const draw = () => {
      const d = +$('#xday', el).value; $('#xdate', el).textContent = md(d);
      const on = $$('input[type=checkbox]', el).filter(c => c.checked).map(c => c.value);
      const ser = on.map(s => ({ v: B.hourly[s].slice(d * 24, d * 24 + 24), c: SCN[s][1], w: s === 'S1c' ? 2.6 : 2, dash: s.startsWith('S1c_') ? '6 4' : null }));
      $('#xtitle', el).textContent = `${md(d)} 블록 시간별 전력 (kW, 시각은 1시간 구간의 시작)`;
      $('#xchart', el).innerHTML = ser.length ? lineSVG(ser, { xl: '시각', yl: 'kW', xstep: 2, xlab: i => `${i}` }) : '<p>안을 선택하세요.</p>';
    };
    $('#xday', el).oninput = draw; $$('input[type=checkbox]', el).forEach(c => c.onchange = draw);
    $$('[data-d]', el).forEach(b => b.onclick = () => { $('#xday', el).value = b.dataset.d; draw(); });
    draw();
    const shift = () => {
      const k = $('#shp', el).value, per = B.per_building_S1c, day = '211', names = Object.keys(per);
      let off = {};
      if (k === 'D1' || k === 'D2') off = B.offsets[k]; else { const m = +k[1]; names.forEach(n => off[n] = Math.round(Math.random() * 2 * m) - m); }
      const tot = new Array(24).fill(0), base = new Array(24).fill(0); let ind = 0;
      names.forEach(n => { const v = per[n][day], o = off[n] || 0; ind += Math.max(...v); for (let h = 0; h < 24; h++) { base[h] += v[h]; tot[(h + o + 24) % 24] += v[h]; } });
      const pb = Math.max(...base), pt = Math.max(...tot), dP = 100 * (pt / pb - 1);
      const simv = (k === 'D1' || k === 'D2') ? B.summary['S1c_' + k] : null;
      $('#shout', el).innerHTML = `${lineSVG([{ v: base, c: '#1E2A38', w: 2.6 }, { v: tot, c: '#E8541E', dash: '6 4' }], { xl: '시각', yl: 'kW', xstep: 2 })}
<div class="readout" style="grid-template-columns:repeat(3,1fr)"><div><span>단순 이동 근사</span><b>${sgn(dP)}% · CF ${(pt / ind).toFixed(3)}</b></div><div><span>EnergyPlus 재계산(공조 용량 고정)</span><b>${simv ? sgn(simv.dP) + '% · CF ' + simv.CF.toFixed(3) : '해당 없음(무작위 배정)'}</b></div><div><span>기준 블록 최대</span><b>${Math.round(pb).toLocaleString()} kW</b></div></div>`;
    };
    $('#shgo', el).onclick = shift; shift();
  }

  /* ---------- map ---------- */
  let MAP = null;
  async function pageMap() {
    const el = $('#page-map');
    if (MAP) { setTimeout(() => MAP.invalidateSize(), 50); return; }
    el.innerHTML = `<div class="kicker">Map · 역삼역 일대</div><h1 style="font-size:28px">대상지 지도</h1>
<p style="color:var(--ink2);margin-top:-4px">상세 분석 3개 동과 다수 건물 50동. 건물을 누르면 실측 비교(월 전기)와 시스템별 효과(템플릿 모델 시뮬레이션)를 볼 수 있습니다.</p>
<div class="mapwrap"><div id="lmap"></div><div class="mapside">
<label class="ctl">색상 기준</label><select id="mmetric" style="width:100%">
<option value="role">구분(상세·보정용·시험용)</option><option value="F0c.dP">블라인드 수평 고정 — 최대 전력 변화</option><option value="F0c.dEUI">블라인드 수평 고정 — EUI 변화</option><option value="EC_DLSc.dP">전기변색 주광 연동 — 최대 전력 변화</option><option value="BT_T300c.dP">블라인드 일사 기준·수납 — 최대 전력 변화</option><option value="VF_F0c.dP">수직 핀 고정 — 최대 전력 변화</option><option value="cv">실측 비교 월 CV(RMSE)</option><option value="height">높이</option></select>
<div id="mleg" style="margin:10px 0"></div>
<input type="search" id="msearch" placeholder="건물 이름 검색" style="width:100%">
<div class="blist" id="mlist" style="margin-top:8px"></div></div></div>
<div class="note">건물 외곽선 © OpenStreetMap contributors (ODbL). 실측은 국토교통부 건축HUB 건물에너지정보 월 전기 사용량(2023–2024)을 대장 연면적으로 나눈 값입니다. 모델 값은 공개 자료로 자동 생성한 템플릿 모델의 시뮬레이션이며 개별 건물의 정밀 예측이 아닙니다.</div>`;
    const [B, T] = await Promise.all([load('buildings'), load('targets50')]);
    const byOsm = Object.fromEntries(T.targets.map(t => [t.osm, t]));
    MAP = L.map('lmap', { zoomControl: true, preferCanvas: false }).setView([37.5008, 127.0368], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(MAP);
    L.circleMarker([37.500622, 127.036456], { radius: 7, color: '#1E2A38', weight: 2, fillColor: '#fff', fillOpacity: 1 }).addTo(MAP).bindTooltip('역삼역', { permanent: true, direction: 'top', offset: [0, -6] });
    const polys = [];
    B.buildings.forEach(b => {
      const t = byOsm[b.id];
      const p = L.polygon(b.ll, { weight: t ? 1.4 : .8, color: '#1E2A38', fillOpacity: t ? .75 : .18, fillColor: '#8C949E' }).addTo(MAP);
      if (t) { p.bindPopup(() => popupHTML(t, b), { maxWidth: 360 }); polys.push({ p, t, b }); }
      else p.bindTooltip(`${b.name || '건물'} · 주변 건물(차폐 입력)`);
    });
    const ramp = (v, lo, hi) => { const x = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); const c = [[30, 42, 56], [242, 179, 61], [232, 84, 30]]; const k = x < .5 ? 0 : 1, f = x < .5 ? x * 2 : (x - .5) * 2; return `rgb(${c[k].map((a, i) => Math.round(a + (c[k + 1][i] - a) * f)).join(',')})`; };
    const div = (v, a) => { if (v == null) return '#E3E5E8'; const x = Math.max(-1, Math.min(1, v / a)); return x >= 0 ? `rgb(${Math.round(255 - 23 * x)},${Math.round(255 - 171 * x)},${Math.round(255 - 225 * x)})` : `rgb(${Math.round(255 + 225 * x)},${Math.round(255 + 168 * x)},${Math.round(255 + 120 * x)})`; };
    const color = () => {
      const m = $('#mmetric').value; let leg = '';
      polys.forEach(({ p, t }) => {
        let c = '#8C949E';
        if (m === 'role') c = t.role === 'detailed' ? '#E8541E' : t.split === 'calib' ? '#F2B33D' : t.split === 'test' ? '#C98A10' : '#FBD98C';
        else if (m === 'cv') c = t.meas && t.meas.CV != null ? ramp(t.meas.CV, 15, 80) : '#E3E5E8';
        else if (m === 'height') c = ramp(t.height, 30, 210);
        else { const [s, k] = m.split('.'); const v = t.sys && t.sys[s] ? t.sys[s][k] : null; c = div(v, k === 'dP' ? 3 : 1.5); }
        p.setStyle({ fillColor: c });
      });
      if (m === 'role') leg = `<div class="maplegend"><div><i style="background:#E8541E"></i>상세 분석 3개 동</div><div><i style="background:#F2B33D"></i>보정용</div><div><i style="background:#C98A10"></i>시험용·홀드아웃</div><div><i style="background:#FBD98C"></i>계산 대상(실측 없음)</div><div><i style="background:#8C949E;opacity:.4"></i>주변 건물(차폐 입력)</div></div>`;
      else if (m === 'cv') leg = `<div class="maplegend">월 CV(RMSE) 15% → 80%<div class="scale" style="margin-top:4px">${[0, .25, .5, .75, 1].map(x => `<i style="background:${ramp(15 + 65 * x, 15, 80)}"></i>`).join('')}</div>ASHRAE G14 월 기준 15%</div>`;
      else if (m === 'height') leg = `<div class="maplegend">높이 30 m → 210 m<div class="scale" style="margin-top:4px">${[0, .25, .5, .75, 1].map(x => `<i style="background:${ramp(30 + 180 * x, 30, 210)}"></i>`).join('')}</div></div>`;
      else { const a = m.endsWith('dP') ? 3 : 1.5; leg = `<div class="maplegend">S1c 대비 변화 (%)<div class="scale" style="margin-top:4px">${[-1, -.5, 0, .5, 1].map(x => `<i style="background:${div(x * a, a)}"></i>`).join('')}</div><div style="display:flex;justify-content:space-between"><span>−${a}% 감소</span><span>+${a}% 증가</span></div></div>`; }
      $('#mleg').innerHTML = leg;
    };
    $('#mmetric').onchange = color; color();
    const list = () => {
      const q = $('#msearch').value.trim();
      $('#mlist').innerHTML = polys.filter(o => !q || o.t.name.includes(q)).sort((a, b) => b.t.height - a.t.height).map(o => `<div data-id="${o.t.osm}"><span>${esc(o.t.name || '(이름 없음 · ' + o.t.osm + ')')}</span><small>${o.t.floors}층 · ${o.t.role === 'detailed' ? '상세' : o.t.split === 'calib' ? '보정용' : o.t.split === 'test' ? '시험용' : '—'}</small></div>`).join('');
      $$('#mlist div').forEach(d => d.onclick = () => { const o = polys.find(x => x.t.osm === d.dataset.id); MAP.fitBounds(o.p.getBounds(), { maxZoom: 18 }); o.p.openPopup(); });
    };
    $('#msearch').oninput = list; list();
    setTimeout(() => MAP.invalidateSize(), 80);
  }
  function popupHTML(t, b) {
    const SN = { F0c: '블라인드 수평 고정', LH_F0c: '대형 루버 고정', VF_F0c: '수직 핀 고정', EC_DLSc: '전기변색 주광 연동', BT_T300c: '블라인드 일사·수납', LT_T300c: '대형 루버 일사 기준' };
    let h = `<h4>${esc(t.name || '(이름 없음)')}</h4><div style="font:12px var(--mono);color:#6B7480">${t.floors}층 · ${t.height} m · 대장 연면적 ${t.totArea.toLocaleString()} m² · ${t.role === 'detailed' ? '상세 분석' : '다수 건물'} ${t.split ? '· ' + (t.split === 'calib' ? '보정용' : '시험용') : ''}</div>`;
    if (t.meas && t.meas.m_meas && t.meas.m_meas.some(v => v != null)) {
      const mm = t.meas.m_meas, ms = t.meas.m_sim, all = [...mm, ...ms].filter(v => v != null), hi = Math.max(...all) * 1.1, W = 300, H = 110, L = 26;
      const X = i => L + i * (W - L - 6) / 11, Y = v => 8 + (hi - v) / hi * (H - 26);
      const pl = (a, c, d) => `<polyline fill="none" stroke="${c}" stroke-width="2" ${d ? 'stroke-dasharray="4 3"' : ''} points="${a.map((v, i) => v == null ? '' : `${X(i)},${Y(v)}`).join(' ')}"/>`;
      h += `<svg viewBox="0 0 ${W} ${H}" style="width:100%;margin-top:6px"><line x1="${L}" y1="${H - 18}" x2="${W - 6}" y2="${H - 18}" stroke="#CDD1D6"/>${pl(mm, '#1E2A38')}${pl(ms, '#E8541E', 1)}${[1, 4, 7, 10].map(m => `<text x="${X(m - 1)}" y="${H - 5}" font-size="9" text-anchor="middle" fill="#6B7480">${m}월</text>`).join('')}<text x="2" y="12" font-size="9" fill="#6B7480">kWh/m²</text></svg>
<div style="font:11px var(--mono)"><span style="color:#1E2A38">━ 실측(2023–24 평균)</span> &nbsp;<span style="color:#E8541E">┅ 모델(전역 배율 적용)</span></div>
<table class="pop-tbl" style="margin-top:4px"><tr><td>연간 실측 / 모델</td><td>${fmt(t.meas.EUI_meas, 1)} / ${fmt(t.meas.EUI_cal, 1)} kWh/m²</td></tr><tr><td>월 CV(RMSE) · NMBE</td><td>${fmt(t.meas.CV, 1)}% · ${sgn(t.meas.NMBE, 1)}%</td></tr></table>`;
    } else h += `<p style="font-size:12px;color:#6B7480;margin:6px 0">실측 비교 자료 없음</p>`;
    if (t.sys) h += `<table class="pop-tbl" style="margin-top:8px"><tr><td><b>시스템 (S1c 대비)</b></td><td><b>EUI · 최대 전력</b></td></tr>${Object.entries(SN).map(([k, n]) => t.sys[k] ? `<tr><td>${n}</td><td>${sgn(t.sys[k].dEUI)}% · ${sgn(t.sys[k].dP)}%</td></tr>` : '').join('')}</table>`;
    if (t.D2 != null) h += `<div style="font:11px var(--mono);color:#6B7480;margin-top:6px">운전 시차 배정: D1 ${t.D1 > 0 ? '+' : ''}${t.D1}h · D2 ${t.D2 > 0 ? '+' : ''}${t.D2}h</div>`;
    return h;
  }

  /* ---------- literature ---------- */
  async function pageLit() {
    const el = $('#page-lit');
    el.innerHTML = `<div class="kicker">Literature</div><h1 style="font-size:28px">문헌</h1>
<div class="tabs" id="ltabs"><button class="on" data-p="l1"><span class="mono">01</span>참고문헌 255편</button><button data-p="l2"><span class="mono">02</span>해외 문헌 DB 660편</button></div>
<div class="pane on" id="l1"></div><div class="pane" id="l2"></div>`;
    $$('#ltabs button').forEach(b => b.onclick = () => { $$('#ltabs button').forEach(x => x.classList.toggle('on', x === b)); $$('#page-lit .pane').forEach(p => p.classList.toggle('on', p.id === b.dataset.p)); });
    const [R, D] = await Promise.all([load('references'), load('literature')]);
    // references
    const groups = [...new Set(R.map(r => r.g))];
    $('#l1').innerHTML = `<div class="row"><input type="search" id="rq" placeholder="저자·제목·학술지 검색" style="flex:1;min-width:220px"><select id="rg"><option value="">전체 (${R.length})</option>${groups.map(g => `<option>${esc(g)}</option>`).join('')}</select></div><div id="rlist" style="margin-top:12px"></div>`;
    const rl = () => { const q = $('#rq').value.trim().toLowerCase(), g = $('#rg').value; const f = R.filter(r => (!g || r.g === g) && (!q || r.t.toLowerCase().includes(q)));
      $('#rlist').innerHTML = `<p class="mono" style="font-size:12px;color:var(--muted)">${f.length}편</p><div class="card" style="padding:6px 16px">${f.map(r => `<p style="font-size:13.5px;margin:8px 0;padding-left:1.4em;text-indent:-1.4em">${esc(r.t.replace(r.url || '§§', '').trim())} ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.replace(/^https?:\/\//, '').slice(0, 60))}</a>` : ''}</p>`).join('')}</div>`; };
    $('#rq').oninput = rl; $('#rg').onchange = rl; rl();
    // literature DB
    const grp = [...new Set(D.map(d => d.grp).filter(Boolean))];
    $('#l2').innerHTML = `<p style="font-size:13.5px;color:var(--ink2);margin-top:0">2026년 10월 15–16일에 수집한 해외 문헌 660편(선정 500편 = 핵심 A + 맥락 B)의 목록입니다(논문 부록 A). 링크는 DOI 또는 공개 원문입니다.</p>
<div class="row"><input type="search" id="dq" placeholder="제목·저자·학술지·메모 검색" style="flex:1;min-width:200px"><select id="dg"><option value="">주제군 전체</option>${grp.map(g => `<option>${esc(g)}</option>`).join('')}</select>
<select id="ds"><option value="">선정 전체</option><option value="선정500">선정 500</option><option value="A">핵심(A)</option><option value="B">맥락(B)</option><option value="미선정">미선정</option></select>
<select id="dy"><option value="">연도 전체</option><option value="2024">2024 이후</option><option value="2020">2020 이후</option><option value="2015">2015 이후</option></select>
<label class="chk"><input type="checkbox" id="doa">공개 원문만</label><select id="dsort"><option value="y">최신순</option><option value="c">피인용순</option></select></div>
<div id="dlist" style="margin-top:12px"></div>`;
    let page = 0;
    const dl = () => {
      const q = $('#dq').value.trim().toLowerCase(), g = $('#dg').value, s = $('#ds').value, y = +$('#dy').value || 0, oa = $('#doa').checked, so = $('#dsort').value;
      let f = D.filter(d => (!g || d.grp === g) && (!y || (d.y || 0) >= y) && (!oa || d.oa) &&
        (!s || (s === '선정500' ? d.sel === '선정500' : s === '미선정' ? d.sel !== '선정500' : (d.sel === '선정500' && d.rel === s))) &&
        (!q || [d.t, d.a, d.j, d.memo, d.sub].join(' ').toLowerCase().includes(q)));
      f.sort((a, b) => so === 'c' ? (b.c || 0) - (a.c || 0) : (b.y || 0) - (a.y || 0));
      const per = 40, pages = Math.max(1, Math.ceil(f.length / per)); page = Math.min(page, pages - 1);
      const sl = f.slice(page * per, page * per + per);
      $('#dlist').innerHTML = `<div class="scroll" style="max-height:none"><table class="tbl"><thead><tr><th>연도</th><th>제목 · 저자 · 학술지</th><th>주제</th><th>피인용</th><th>구분</th></tr></thead><tbody>${sl.map(d => `<tr><td class="num">${d.y ?? ''}</td><td><a href="${esc(d.doi || d.oa || '#')}" target="_blank" rel="noopener">${esc(d.t)}</a><div style="font-size:12px;color:var(--muted)">${esc(d.a || '')} · <i>${esc(d.j || '')}</i>${d.memo ? ' — ' + esc(d.memo) : ''}${d.oa ? ` · <a href="${esc(d.oa)}" target="_blank" rel="noopener">원문</a>` : ''}</div></td><td style="font-size:12px">${esc(d.sub || d.grp || '')}</td><td class="num">${d.c ?? ''}</td><td>${d.sel === '선정500' ? `<span class="tag ${d.rel === 'A' ? 'sun' : 'kin'}">${d.rel || ''}</span>` : '<span class="tag mut">미선정</span>'}</td></tr>`).join('')}</tbody></table></div>
<div class="pager"><button id="pp">‹</button><span>${page + 1} / ${pages} · ${f.length}편</span><button id="pn">›</button></div>`;
      $('#pp').onclick = () => { page = Math.max(0, page - 1); dl(); }; $('#pn').onclick = () => { page = Math.min(pages - 1, page + 1); dl(); };
    };
    ['dq', 'dg', 'ds', 'dy', 'doa', 'dsort'].forEach(id => $('#' + id).addEventListener(id === 'dq' ? 'input' : 'change', () => { page = 0; dl(); }));
    dl();
  }

  function pageAbout() {
    $('#page-about').innerHTML = `<div class="kicker">Data & sources</div><h1 style="font-size:28px">자료·출처·이용 안내</h1>
<div class="grid g2">
<div class="card"><h3>이 사이트에서 할 수 있는 것</h3><ul style="font-size:14px;padding-left:18px">
<li><b>시뮬레이션</b> — 대상지 3D 태양 경로·그림자, 키네틱 외피 모듈의 슬랫각·착색과 실내 조도(근사), 연간 작동 시간 지도.</li>
<li><b>지도</b> — 50동의 실측 비교와 시스템별 효과(템플릿 모델).</li>
<li><b>결과 데이터</b> — 논문의 결과 표 29개, 50동 블록 시간별 전력 탐색.</li>
<li><b>문헌</b> — 참고문헌 255편, 해외 문헌 DB 660편 검색.</li></ul>
<div class="warn">시뮬레이션 탭의 실내 조도·작동 계산은 이 사이트에서 직접 도는 <b>단순 근사(교육용)</b>이며, 논문의 EnergyPlus 결과가 아닙니다. 논문 결과는 "결과 데이터"와 "지도"에 있습니다.</div></div>
<div class="card"><h3>자료 출처</h3><table class="tbl"><tbody>
<tr><td>건물 외곽선·층수</td><td>© OpenStreetMap contributors (ODbL), Overpass API, 2026-10-12 기준</td></tr>
<tr><td>건축물 정보</td><td>국토교통부 건축물대장(공공데이터포털)</td></tr>
<tr><td>월 에너지 사용량</td><td>국토교통부 건축HUB 건물에너지정보(2023–2024)</td></tr>
<tr><td>기상</td><td>Seoul WS 471080 TMYx 2011–2025 (climate.onebuilding.org)</td></tr>
<tr><td>시뮬레이션</td><td>EnergyPlus 23.2, DOE 대형 사무소 원형 모델 기반</td></tr>
<tr><td>지도 타일</td><td>© OpenStreetMap contributors</td></tr>
<tr><td>3D 표현</td><td>three.js · Leaflet</td></tr></tbody></table>
<p style="font-size:12.5px;color:var(--muted)">이 사이트의 대상지 3D·선경로 표현은 Andrew Marsh의 Sun-Path 3D·Daylight Box 같은 교육용 도구의 작동 방식을 참고해 새로 만든 것입니다.</p></div>
<div class="card"><h3>논문 정보</h3><p style="font-size:14px">${esc(C.meta.titleKo)} — ${esc(C.meta.subKo)}<br>${esc(C.meta.author)} · ${esc(C.meta.school)} · 지도교수 ${esc(C.meta.advisor)}</p><p class="mono" style="font-size:12px;color:var(--muted)">${esc(C.meta.version)}</p><div class="note">${esc(C.meta.status)}</div></div>
<div class="card"><h3>이전 사이트</h3><p style="font-size:13.5px">2026년 7월의 이전 BADTM 사이트 파일은 저장소의 <code>old/</code> 폴더에 보존했습니다. 이전 사이트의 수치(예: EUI 절감 40% 내외)는 현재 논문과 맞지 않으므로 인용하지 마십시오.</p></div>
</div>`;
  }

  /* ---------- router ---------- */
  const built = {};
  const PAGES = { home: pageHome, thesis: pageThesis, framework: pageFramework, results: pageResults, map: pageMap, lit: pageLit, about: pageAbout, sim: () => window.SIM && window.SIM.mount(), kinetic: () => window.KINETIC && window.KINETIC.mount(), verify: () => window.VERIFY && window.VERIFY.mount() };
  function route() {
    const h = location.hash.replace(/^#\/?/, ''), [r, sub] = h.split('/'); const key = PAGES[r] ? r : 'home';
    $$('.page').forEach(p => p.classList.toggle('on', p.id === 'page-' + key));
    $$('nav a').forEach(a => a.classList.toggle('on', a.dataset.r === key));
    document.body.classList.remove('navopen');
    if (!built[key] || key === 'map' || key === 'sim') { built[key] = true; PAGES[key](); }
    if (key === 'thesis' && sub) setTimeout(() => { const t = document.getElementById(sub); t && t.scrollIntoView({ block: 'start' }); }, 30);
    else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  window.APP.route = route;
  route();
})();
