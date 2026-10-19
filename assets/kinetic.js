/* 키네틱 시스템 분류: 장치 × 제어 계열 × 미작동 상태 → 결과 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sg = (v, d = 2) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const FC = { B0: '#8C949E', B1: '#1E2A38', B2: '#E8541E', B3: '#F2B33D', B4: '#7A4DA8', B5: '#2C7A6B', B6: '#5E7FA8' };
  let K = null, SB = null, sel = null;

  function chip(s) {
    const cls = s.day === '주광 유지' ? 'keep' : 'loss';
    return `<button class="kchip ${cls}" data-t="${s.tag}" title="${esc(s.logic)}"><b>${s.tag}</b>${s.dEUI != null ? `<span>E ${sg(s.dEUI)}</span><span>P ${sg(s.dP)}</span>` : '<span>표 6-13</span>'}</button>`;
  }
  function matrix() {
    const A = K.axes.device, B = K.axes.family;
    return `<div class="tblwrap kmatwrap"><table class="tbl kmat"><thead><tr><th>제어 계열 \\ 외피 요소</th>${A.map(a => `<th><span class="mono">${a[0]}</span><br>${esc(a[1])}</th>`).join('')}</tr></thead><tbody>
${B.map(b => `<tr><th><span class="kdot" style="background:${FC[b[0]]}"></span><span class="mono">${b[0]}</span> ${esc(b[1])}</th>${A.map(a => `<td>${K.systems.filter(s => s.dev === a[0] && s.fam === b[0]).map(chip).join('') || '<span class="na">—</span>'}</td>`).join('')}</tr>`).join('')}
</tbody></table></div><p class="small">칸 안의 값: E = 3개 동 블록 EUI 변화, P = 블록 최대 전력 변화(S1 대비, %). 진한 테두리 = 주광 유지형(3개 동 모두 UDI 변화 > −2%p), 연한 칸 = 주광 손실형.</p>`;
  }
  function scatter() {
    const S = K.systems.filter(s => s.dEUI != null), W = 640, H = 380, m = { l: 56, r: 16, t: 16, b: 44 };
    const xs = S.map(s => s.dEUI), ys = S.map(s => s.dP);
    const x0 = Math.min(-1.5, ...xs) - .2, x1 = Math.max(3, ...xs) + .2, y0 = Math.min(-.5, ...ys) - .2, y1 = Math.max(3.5, ...ys) + .2;
    const X = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r), Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
    let g = `<rect x="${X(x0)}" y="${Y(0)}" width="${X(0) - X(x0)}" height="${Y(y0) - Y(0)}" fill="#E8F3EE"/>`;
    for (let v = Math.ceil(x0); v <= x1; v++) g += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${H - m.b}" class="gl"/><text x="${X(v)}" y="${H - m.b + 16}" text-anchor="middle">${v}</text>`;
    for (let v = Math.ceil(y0); v <= y1; v++) g += `<line y1="${Y(v)}" y2="${Y(v)}" x1="${m.l}" x2="${W - m.r}" class="gl"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
    g += `<line x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${H - m.b}" class="ax"/><line y1="${Y(0)}" y2="${Y(0)}" x1="${m.l}" x2="${W - m.r}" class="ax"/>`;
    g += `<text x="${X(x0) + 6}" y="${Y(y0) - 8}" class="q">에너지·최대 전력 모두 감소</text>`;
    const used=[]; S.forEach(s => { const keep = s.day === '주광 유지'; let ly = Y(s.dP) - 7, lx = X(s.dEUI) + 9; while (used.some(([a, b]) => Math.abs(a - lx) < 46 && Math.abs(b - ly) < 11)) ly += 12; used.push([lx, ly]); g += `<g class="kpt" data-t="${s.tag}"><circle cx="${X(s.dEUI)}" cy="${Y(s.dP)}" r="6.5" fill="${keep ? FC[s.fam] : '#fff'}" stroke="${FC[s.fam]}" stroke-width="2"/><text x="${lx}" y="${ly}">${s.tag}</text></g>`; });
    g += `<text x="${(W + m.l) / 2}" y="${H - 6}" text-anchor="middle" class="t">블록 EUI 변화 (%, S1 대비)</text><text transform="translate(14,${(H - m.b + m.t) / 2}) rotate(-90)" text-anchor="middle" class="t">블록 최대 전력 변화 (%)</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="kscat">${g}</svg>
<div class="klegend">${K.axes.family.filter(b => S.some(s => s.fam === b[0])).map(b => `<span><i style="background:${FC[b[0]]}"></i>${b[0]} ${esc(b[1])}</span>`).join('')}<span><i class="hollow"></i>속 빈 점 = 주광 손실형</span></div>`;
  }
  function detail(tag) {
    const s = K.systems.find(x => x.tag === tag); if (!s) return '';
    const dv = K.axes.device.find(a => a[0] === s.dev), fm = K.axes.family.find(b => b[0] === s.fam);
    const sb = SB && SB.systems && SB.systems[tag];
    return `<div class="kdet"><div class="kicker">${s.tag}</div><h3>${esc(dv[1])} · ${esc(fm[1])}</h3>
<dl class="kdl"><dt>작동 논리</dt><dd>${esc(s.logic)}</dd><dt>입력 신호</dt><dd>${esc(s.signal)}</dd><dt>작동 기간</dt><dd>${esc(s.period)}</dd><dt>미작동 시 상태</dt><dd>${esc(s.idle)}</dd><dt>외피 요소</dt><dd>${esc(dv[2])}</dd><dt>제어 계열</dt><dd>${esc(fm[2])}</dd></dl>
${s.dEUI != null ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>3개 동 블록</th><th>EUI 변화</th><th>최대 전력 변화</th><th>동시계수</th><th>분류</th></tr></thead><tbody><tr><td>S1 대비</td><td class="mono">${sg(s.dEUI)}%</td><td class="mono">${sg(s.dP)}%</td><td class="mono">${s.CF.toFixed(3)}</td><td>${esc(s.day)}</td></tr></tbody></table></div>
<div class="tblwrap"><table class="tbl"><thead><tr><th>건물</th>${K.buildings.map(n => `<th>${n}</th>`).join('')}</tr></thead><tbody><tr><td>UDI 변화 (%p)</td>${s.dUDI.map(v => `<td class="mono">${sg(v, 1)}</td>`).join('')}</tr><tr><td>열쾌적 변화 (%p)</td>${s.dPMV.map(v => `<td class="mono">${sg(v, 1)}</td>`).join('')}</tr></tbody></table></div>` : `<p class="small">${esc(s.note || '')}</p>`}
${sb ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>4개 대블록 ${SB.n}동(건물별 값)</th><th>EUI 변화 중앙값</th><th>최대 전력 변화 중앙값</th><th>EUI 감소 동수</th></tr></thead><tbody><tr><td>보정 기준 S1c 대비</td><td class="mono">${sg(sb.dEUI_med)}%</td><td class="mono">${sg(sb.dP_med)}%</td><td class="mono">${sb.n_dec}/${SB.n}</td></tr></tbody></table></div>` : ''}
<p class="small"><a href="#/verify">검증 원장</a>에서 이 값이 원자료에서 다시 계산되는지 확인할 수 있습니다.</p></div>`;
  }
  async function mount() {
    const P = $('#page-kinetic'); if (P.dataset.ok) return; P.dataset.ok = 1;
    K = await window.APP.load('v/kinetic');
    try { SB = await window.APP.load('v/kinetic_sb'); } catch (e) { SB = null; }
    P.innerHTML = `<div class="kicker">Kinetic systems · taxonomy</div><h1>키네틱 시스템 분류</h1>
<p class="lead">논문에서 계산한 키네틱 외피를 <b>외피 요소(A) × 제어 계열(B) × 미작동 시 상태</b>로 나누어, 어떤 방식으로 어떤 값이 나왔는지 한 화면에서 보도록 정리했습니다. 결과는 상세 3개 동 블록(ARK·GFC·GST, 창면적비 40%)의 EnergyPlus 계산값입니다.</p>
<div class="kaxes">
 <div class="card"><div class="hk">A 외피 요소</div>${K.axes.device.map(a => `<div class="kax"><span class="mono">${a[0]}</span><b>${esc(a[1])}</b><span class="small">${esc(a[2])}</span></div>`).join('')}</div>
 <div class="card"><div class="hk">B 제어 계열</div>${K.axes.family.map(b => `<div class="kax"><span class="mono"><i class="kdot" style="background:${FC[b[0]]}"></i>${b[0]}</span><b>${esc(b[1])}</b><span class="small">${esc(b[2])}</span></div>`).join('')}</div>
 <div class="card"><div class="hk">미작동 시 상태 — 결과를 가르는 변수</div>${K.axes.idle.map(x => `<div class="kax wide"><b>${esc(x[0])}</b><span class="small">${esc(x[1])}</span></div>`).join('')}
 <p class="small" style="margin-top:.8em">계산한 안 가운데 블록 최대 전력을 올리지 않은 것은 미작동 시 창에서 빠지거나 투명해지는 <b>주광 유지형</b>뿐이었습니다(EC_DL·EC_DLS·BT_T300). 같은 일사 역치 제어라도 미작동 시 창 앞에 남는 대형 루버(LT_T300)는 최대 전력을 올렸습니다.</p></div>
</div>
<h2 class="sec">분류 매트릭스</h2>${matrix()}
<div class="kgrid"><div><h2 class="sec">에너지 대 최대 전력</h2>${scatter()}</div><div id="k-det" class="card"><p class="small">매트릭스나 그래프에서 안을 누르면 작동 방식과 결과가 여기에 표시됩니다.</p></div></div>`;
    P.addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (!t) return; sel = t.dataset.t; $('#k-det').innerHTML = detail(sel); P.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x.dataset.t === sel)); });
    sel = 'BT_T300'; $('#k-det').innerHTML = detail(sel);
  }
  window.KINETIC = { mount };
})();
