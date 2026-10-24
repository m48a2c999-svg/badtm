/* 검증 원장(Verification Ledger): 논문 표·본문의 수치를 공개 원자료에서 브라우저가 직접 다시 계산해 대조한다. */
(function () {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const J = name => window.APP.load(name);
  const bin = (() => { const c = {}; return f => c[f] || (c[f] = fetch('data/v/' + f).then(r => r.arrayBuffer())); })();
  const LV = {
    V0: ['보고값 대조', '원자료를 공개하지 않은 값. 논문 본문과 표 사이의 일치만 확인'],
    V1: ['출력 재집계', 'EnergyPlus 출력(건물별 연간·시간별 값)을 브라우저가 다시 합산·비교. 공개 출력의 산술 재현이며 모델 자체의 타당성 검증은 아님'],
    V2: ['원자료 재계산', '실측 월별 사용량·선별 계산 원자료에서 지표를 처음부터 다시 계산'],
    V3: ['모듈 별도 구현 비교', '계산의 한 모듈(현재는 태양 위치 계산 하나)을 다른 구현으로 계산해 비교. 에너지 성능 전체를 독립적으로 재현한 것은 아님']
  };
  const ST = { ok: ['일치', 'ok'], rd: ['반올림 차이', 'rd'], chk: ['확인 필요', 'chk'], bad: ['불일치', 'bad'], na: ['대조 대상 없음', 'na'] };

  /* ---------- 숫자 처리: 논문 표기의 자릿수로 허용오차를 정한다 ---------- */
  const nums = s => (String(s ?? '').replace(/,/g, '').replace(/−/g, '-').match(/[-+]?\d+(\.\d+)?/g) || []).map(Number);
  const decs = s => { const m = String(s).replace(/,/g, '').match(/[-+−]?\d+(?:\.(\d+))?/); return m && m[1] ? m[1].length : 0; };
  const tolOf = s => 0.5 * Math.pow(10, -decs(s)) + 1e-9;
  const f = (v, d = 2) => v == null || !isFinite(v) ? '—' : (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sg = (v, d = 2) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  // paper: 논문 문자열(수치 하나), calc: 재계산 값, k: 같은 문자열에 여러 수가 있을 때 몇 번째
  function item(label, paper, calc, k = 0, unit = '') {
    const pv = nums(paper)[k], tol = tolOf(String(paper).split(/[\/\[\(]/)[Math.min(k, 9)] || paper);
    const d = calc - pv, ad = Math.abs(d);
    let st = !isFinite(pv) || !isFinite(calc) ? 'na' : ad <= tol ? 'ok' : ad <= 2 * tol + 1e-9 ? 'rd' : 'bad';
    return { label, paper: String(paper), pv, calc, tol, d, st, unit };
  }
  const lim = (label, limit, val, warnOnly) => ({ label, paper: '≤ ' + limit, pv: limit, calc: val, tol: 0, d: NaN, st: val <= limit + 1e-9 ? 'ok' : (warnOnly ? 'chk' : 'bad'), unit: '' });
  const worst = arr => { const o = ['bad', 'chk', 'rd', 'ok', 'na']; for (const s of o) if (arr.some(x => x === s)) return s; return 'na'; };

  /* ---------- 자료 맥락 ---------- */
  let CTX = null;
  async function ctx() {
    if (CTX) return CTX;
    const [tables, det3, ppo, spa, zones, refs, lit, tg257, blk257] = await Promise.all([J('tables'), J('v/det3'), J('v/rl'), J('v/spa_ref'), J('v/zones3'), J('references'), J('literature'), J('targets257'), J('block257')]);
    const raw = new Float32Array(await bin(det3.bin));
    const blkRow = t => { const i = det3.tags.indexOf(t); return i < 0 ? null : raw.subarray(i * 8760, (i + 1) * 8760); };
    const N = det3.buildings;
    const block = t => {
      const h = blkRow(t); if (!h) return null;
      let pk = -1, pi = 0, s = 0; for (let i = 0; i < 8760; i++) { s += h[i]; if (h[i] > pk) { pk = h[i]; pi = i; } }
      const R = det3.runs[t], A = N.reduce((a, n) => a + R[n].area, 0);
      const sumInd = N.reduce((a, n) => a + R[n].peak_kW, 0);
      return { peak: pk, idx: pi, sumInd, CF: pk / sumInd, LF: s / 8760 / pk, EUI: N.reduce((a, n) => a + R[n].area * R[n].EUI, 0) / A };
    };
    const T = no => tables.find(t => t.caption.startsWith(no + '.'));
    const row = (no, pred) => { const t = T(no); return t && t.rows.find(r => typeof pred === 'function' ? pred(r) : r[0] === pred); };
    CTX = { tables, det3, ppo, spa, zones, refs, lit, tg257, blk257, N, block, T, row, blkRow };
    return CTX;
  }
  const hourLabel = i => { const d = new Date(Date.UTC(2021, 0, 1) + i * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}시`; };

  /* ---------- 주장 목록 ---------- */
  const CL = [];
  const add = (id, ch, lv, title, src, run) => CL.push({ id, ch, lv, title, src, run });
  const TAG65 = ['F0', 'S3', 'LH_F0', 'LH_C', 'VF_F0', 'VF_C', 'HV_F0', 'HV_C', 'EC_DL', 'EC_DLS', 'EC_SOL', 'EC_SOLS', 'PK', 'EC_PK', 'BT_T300', 'LT_T300'];

  add('C4-01', '4장', 'V3', '사이트 태양 위치 계산(NOAA 근사식)의 정확도: NREL SPA 대비 고도·방위 오차 0.5° 이내', ['data/v/spa_ref.json', 'assets/solar.js'], async c => {
    let ma = 0, mz = 0, worstCase = null;
    for (const [doy, h, el, az] of c.spa.cases) {
      const p = window.SOLAR.sunPos(doy, h, 37.5005, 127.0365, 9);
      const ea = Math.abs(p.alt - el), ez = Math.abs(((p.az - az) + 540) % 360 - 180);
      if (ea > ma) { ma = ea; worstCase = [doy, h, p.alt, el]; } mz = Math.max(mz, ez);
    }
    return { items: [lim('최대 고도 오차 (°)', 0.5, ma), lim('최대 방위 오차 (°)', 0.5, mz)],
      trace: `기준: ${esc(c.spa.method)}. 12개 날짜 × 7개 시각 = ${c.spa.cases.length}개 경우를 사이트 계산식(SOLAR.sunPos, NOAA 근사)과 비교했다. 실제 최대 오차는 고도 ${ma.toFixed(3)}°, 방위 ${mz.toFixed(3)}°이다(가장 큰 고도 오차: 연중 ${worstCase[0]}일째 ${worstCase[1]}시, 계산 ${worstCase[2].toFixed(2)}° / SPA ${worstCase[3].toFixed(2)}°). 판정 기준은 0.5° 이내이다(사이트의 3D 일조·외피 모듈 계산용 근사식이며, 논문의 EnergyPlus 계산은 EnergyPlus 자체의 태양 위치를 쓴다).` };
  });

  add('C6-01', '6장', 'V2', '구역 판정(L3): 60개 구역 S 19 · R 31 · A 10 (표 6-3)', ['data/v/zones3.json'], async c => {
    const occ = c.zones.occ_hours, cls = fb => fb < 0.15 ? 'S' : fb < 0.45 ? 'R' : 'A', cnt = { S: 0, R: 0, A: 0 }, its = [];
    const F = { 남: 'S', 동: 'E', 북: 'N', 서: 'W' };
    for (const n of c.N) for (const z in c.zones.zones[n]) cnt[cls(c.zones.zones[n][z].hrs_beam_occ / occ)]++;
    const t = c.T('표 6-3'); let cellOk = 0, cellN = 0, firstBad = '';
    t.rows.forEach(r => { for (let b = 1; b <= 5; b++) { const fb = c.zones.zones[r[0]][`B${b}_${F[r[1]]}`].hrs_beam_occ / occ; const [k, v] = r[b + 1].split(' '); cellN++; const okk = k === cls(fb) && Math.abs(fb - +v) <= tolOf(v); if (okk) cellOk++; else if (!firstBad) firstBad = `${r[0]} ${r[1]} B${b}: 표 ${r[b + 1]}, 계산 ${cls(fb)} ${fb.toFixed(4)}`; } });
    its.push(item('S 구역 수', '19', cnt.S), item('R 구역 수', '31', cnt.R), item('A 구역 수', '10', cnt.A)); const ci = item('표 6-3 등급·fb 표기 일치 칸 (60칸)', '60', cellOk); if (cellOk < 60) ci.st = 'chk'; its.push(ci);
    return { items: its, trace: `fb = (재실 2,610시간 중 직달 일사 노출 시간) ÷ ${occ}. 경계값 S < 0.15 ≤ R < 0.45 ≤ A. ${firstBad ? '표기 차이: ' + esc(firstBad) + '. 등급 판정(R)은 같다. fb 0.4498은 반올림하면 0.450이 되어 A 경계값(0.45)과 같아 보이므로, 표에는 0.4498처럼 네 자리로 쓰는 편이 정확하다.' : '60칸 모두 등급과 fb가 표 6-3과 같다.'}` };
  });

  add('C6-02', '6장', 'V1', '기준 안 S1의 건물별 연간 EUI·구성·최대 전력·UDI·열쾌적 (표 6-1)', ['data/v/det3.json'], async c => {
    const R = c.det3.runs.S1, its = [];
    const map = [['EUI (kWh/m²·yr)', 'EUI'], ['냉방 전력 (kWh/m²·yr)', 'Cooling:Electricity'], ['난방 가스 (kWh/m²·yr)', 'Heating:NaturalGas'], ['실내 조명 전력 (kWh/m²·yr)', 'InteriorLights:Electricity'],
      ['기기(플러그) 전력 (kWh/m²·yr)', 'InteriorEquipment:Electricity'], ['외부 조명 전력 (kWh/m²·yr)', 'ExteriorLights:Electricity'], ['급탕 가스 (kWh/m²·yr)', 'WaterSystems:NaturalGas'], ['탄소 배출량 (kgCO₂eq/m²·yr)', 'CO2']];
    c.N.forEach((n, j) => {
      map.forEach(([lab, k]) => { const r = c.row('표 6-1', lab); if (r) its.push(item(`${n} ${lab.split(' (')[0]}`, r[j + 1], R[n][k])); });
      const pk = c.row('표 6-1', '연간 최대 전력 (kW) / 부하율'); its.push(item(`${n} 최대 전력 kW`, pk[j + 1].split('/')[0], R[n].peak_kW), item(`${n} 부하율`, pk[j + 1].split('/')[1], R[n].load_factor));
      const u = c.row('표 6-1', r => r[0].startsWith('UDI')); const [a, b, d] = nums(u[j + 1]);
      its.push(item(`${n} UDI %`, String(a.toFixed(1)), R[n].UDI), item(`${n} UDI 100 lx 미만 %`, String(b.toFixed(1)), R[n].UDI_lo), item(`${n} UDI 2,000 lx 초과 %`, String(d.toFixed(1)), R[n].UDI_hi));
      const p = c.row('표 6-1', r => r[0].startsWith('열쾌적')); its.push(item(`${n} 열쾌적 %`, p[j + 1], R[n].PMV_ok));
      const hv = c.row('표 6-1', r => r[0].startsWith('냉난방')); its.push(item(`${n} 냉난방·공조 관련 kWh/m²`, hv[j + 1].split('(')[0], R[n].HVAC));
    });
    return { items: its, trace: '건물별 EnergyPlus 연간 계산(태그 S1)의 연간 미터 합을 연면적(모델 바닥면적)으로 나눈 값. 최대 전력은 시간별 전력의 연중 최댓값, 부하율 = 평균 ÷ 최대.' };
  });

  add('C6-03', '6장', 'V1', '주변 건물 차폐의 영향: S1 대 S0의 건물별 EUI·구성·최대 전력·주광·열쾌적 변화 (표 6-2)', ['data/v/det3.json'], async c => {
    const A = c.det3.runs.S0, B = c.det3.runs.S1, its = [];
    const pct = (n, k) => 100 * (B[n][k] / A[n][k] - 1);
    const m = [['EUI', 'EUI', pct], ['냉방', 'Cooling:Electricity', pct], ['난방', 'Heating:NaturalGas', pct], ['실내 조명', 'InteriorLights:Electricity', pct], ['팬', 'Fans:Electricity', pct], ['연간 최대 전력', 'peak_kW', pct],
      ['UDI', 'UDI', (n, k) => B[n][k] - A[n][k]], ['열쾌적(PMV ±0.5 비율)', 'PMV_ok', (n, k) => B[n][k] - A[n][k]]];
    m.forEach(([lab, k, fn]) => { const r = c.row('표 6-2', lab); c.N.forEach((n, j) => its.push(item(`${n} ${lab}`, r[j + 1], fn(n, k)))); });
    return { items: its, trace: '변화율 = S1 ÷ S0 − 1(UDI·열쾌적은 %p 차). S0은 주변 건물을 지운 단독 모델, S1은 주변 건물의 정적 차폐를 포함한 기준 모델.' };
  });

  add('C6-04', '6장', 'V1', '시스템 3종의 블록 결과: 블록 EUI·최대 전력·동시계수 (표 6-5, 17개 안)', ['data/v/det3.json', 'data/v/det3_block.bin'], async c => {
    const s1 = c.block('S1'), its = [];
    const t = c.T('표 6-5');
    t.rows.forEach(r => {
      const b = c.block(r[0]); if (!b) return;
      its.push(item(`${r[0]} 블록 EUI`, r[2], b.EUI), item(`${r[0]} 블록 최대 전력 kW`, r[4], b.peak), item(`${r[0]} 동시계수`, r[6], b.CF));
      if (r[0] !== 'S1') its.push(item(`${r[0]} EUI 변화 %`, r[3], 100 * (b.EUI / s1.EUI - 1)), item(`${r[0]} 최대 전력 변화 %`, r[5], 100 * (b.peak / s1.peak - 1)));
    });
    return { items: its, trace: `블록 시간별 전력 = 3개 동 시간별 전력의 합(det3_block.bin). 블록 최대 전력 = 그 연중 최대(S1: ${f(s1.peak, 1)} kW, ${hourLabel(s1.idx)} 구간). 동시계수 = 블록 최대 ÷ 건물별 최대의 합(${f(s1.sumInd, 1)} kW). 블록 EUI = 면적 가중 평균.` };
  });

  add('C6-05', '6장', 'V1', '건물별 EUI·최대 전력 변화 (표 6-6, 16개 안 × 3개 동)', ['data/v/det3.json'], async c => {
    const S1 = c.det3.runs.S1, its = [];
    c.T('표 6-6').rows.forEach(r => { const R = c.det3.runs[r[0]]; if (!R) return; c.N.forEach((n, j) => { its.push(item(`${r[0]} ${n} EUI %`, r[1 + 2 * j], 100 * (R[n].EUI / S1[n].EUI - 1)), item(`${r[0]} ${n} 최대 전력 %`, r[2 + 2 * j], 100 * (R[n].peak_kW / S1[n].peak_kW - 1))); }); });
    return { items: its, trace: '건물별 변화율 = 해당 안 ÷ S1 − 1.' };
  });

  add('C6-06', '6장', 'V1', '건물별 주광(UDI)·열쾌적 지표 (표 6-7)', ['data/v/det3.json'], async c => {
    const its = [];
    c.T('표 6-7').rows.forEach(r => { const R = c.det3.runs[r[0]]; if (!R) return; c.N.forEach((n, j) => its.push(item(`${r[0]} ${n} UDI`, r[1 + 2 * j], R[n].UDI), item(`${r[0]} ${n} 열쾌적`, r[2 + 2 * j], R[n].PMV_ok))); });
    return { items: its, trace: 'UDI = 기준점 조도 100~2,000 lx 비율(재실 시간 기준), 열쾌적 = PMV ±0.5 비율.' };
  });

  add('C6-07', '6장', 'V1', '"창면적비 40%의 상세 3개 동 블록에서 연간 EUI 감소는 모든 시스템에서 1.4% 이하, 건물별 최대는 GST 수평 고정 1.72%" (6.2.1항)', ['data/v/det3.json'], async c => {
    const s1 = c.block('S1'); let mb = 0, mbT = '', mi = 0, miT = '';
    TAG65.forEach(t => { const b = c.block(t); const d = 100 * (b.EUI / s1.EUI - 1); if (-d > mb) { mb = -d; mbT = t; } c.N.forEach(n => { const R = c.det3.runs[t][n], dd = 100 * (R.EUI / c.det3.runs.S1[n].EUI - 1); if (-dd > mi) { mi = -dd; miT = `${t} ${n}`; } }); });
    const it1 = lim('블록 기준 최대 EUI 감소 %', 1.4, +mb.toFixed(1)); it1.calc = mb;
    const it2 = item('건물 기준 최대 EUI 감소 %', '1.72', mi);
    return { items: [it1, it2], trace: `블록 기준 최대 감소는 ${mbT} ${mb.toFixed(2)}%로 "블록 기준 1.4% 이하"와 맞는다. 건물 기준 최대 감소는 ${miT} ${mi.toFixed(2)}%이므로 "1.4% 이하"는 블록 기준으로만 성립한다(문구를 이에 맞게 한정함).` };
  });

  add('C6-08', '6장', 'V1', '주광을 잃는 제어는 블록 최대 전력 +0.02~+3.58%, 주광을 유지한 제어만 올리지 않음(−0.28~−0.60%)', ['data/v/det3.json'], async c => {
    const s1 = c.block('S1'), its = [];
    const loss = ['F0', 'S3', 'LH_F0', 'LH_C', 'VF_F0', 'VF_C', 'HV_F0', 'HV_C', 'EC_SOL', 'EC_SOLS', 'PK', 'EC_PK', 'LT_T300'], keep = ['EC_DL', 'EC_DLS', 'BT_T200', 'BT_T250', 'BT_T300', 'BT_T350', 'BT_T400'];
    const d = t => 100 * (c.block(t).peak / s1.peak - 1);
    const L = loss.map(d), K = keep.filter(t => c.block(t)).map(d);
    its.push(item('주광 손실형 최소 변화 %', '+0.02', Math.min(...L)), item('주광 손실형 최대 변화 %', '+3.58', Math.max(...L)), item('주광 유지형 최대 변화 %', '−0.28', Math.max(...K)), item('주광 유지형 최소 변화 %', '−0.60', Math.min(...K)));
    return { items: its, trace: `주광 손실형: ${loss.join(', ')}. 주광 유지형: ${keep.join(', ')}(5~9월 일사 역치 200~400 W/m² 포함). 변화 = 블록 최대 전력 ÷ S1 − 1.` };
  });

  add('C6-09', '6장', 'V1', '주광 유지 제어의 열쾌적 비율 저하: 전기변색 2.7~11.6%p, 블라인드 일사 기준 1.3~2.4%p (6.2.4항)', ['data/v/det3.json'], async c => {
    const S1 = c.det3.runs.S1, its = [];
    const dl = (ts) => { const v = []; ts.forEach(t => c.N.forEach(n => v.push(S1[n].PMV_ok - c.det3.runs[t][n].PMV_ok))); return v; };
    const e = dl(['EC_DL', 'EC_DLS']), b = dl(['BT_T300']);
    its.push(item('전기변색 최소 저하 %p', '2.7', Math.min(...e)), item('전기변색 최대 저하 %p', '11.6', Math.max(...e)), item('블라인드 일사 기준 최소 저하 %p', '1.3', Math.min(...b)), item('블라인드 일사 기준 최대 저하 %p', '2.4', Math.max(...b)));
    return { items: its, trace: '저하 = S1의 열쾌적 비율 − 해당 안의 열쾌적 비율(건물별). 전기변색은 EC_DL·EC_DLS, 블라인드는 BT_T300.' };
  });

  add('C6-10', '6장', 'V1', '구역 판정에 따른 차등 적용 ZA·ZB (표 6-4)', ['data/v/det3.json'], async c => {
    const s1 = c.block('S1'), its = [];
    c.T('표 6-4').rows.forEach(r => { const b = c.block(r[0]); if (!b) return; its.push(item(`${r[0]} 블록 EUI`, r[2], b.EUI), item(`${r[0]} 블록 최대 전력`, r[4], b.peak)); if (r[0] !== 'S1') its.push(item(`${r[0]} EUI 변화 %`, r[3], 100 * (b.EUI / s1.EUI - 1)), item(`${r[0]} 최대 전력 변화 %`, r[5], 100 * (b.peak / s1.peak - 1))); nums(r[6]).forEach((u, j) => its.push(item(`${r[0]} ${c.N[j]} UDI`, u.toFixed(1), c.det3.runs[r[0]][c.N[j]].UDI))); });
    return { items: its, trace: 'ZA: S 구역 장치 없음, R·A 구역 컷오프. ZB: S 구역 수평 고정, R·A 구역 컷오프.' };
  });

  add('C6-11', '6장', 'V1', '강화학습(PPO·SAC 각 3개 시드) 정책과 비교 기준의 결정론적 평가 — 학습 기상 W1·비학습 기상 W2 (표 6-9)', ['data/v/rl.json'], async c => {
    const its = [], B = c.ppo.baselines, BL = { '장치 없음(S1)': 'S1', '수평 고정 θ = 0°(F0)': 'F0', '고정 θ = 45°(S2)': 'S2', '컷오프(S3)': 'S3' };
    c.T('표 6-9').rows.forEach(r => {
      const m = r[0].match(/^(PPO|SAC) 시드 (\d)$/);
      let w1, w2;
      if (m) { const R = c.ppo.rl[`${m[1]}_s${m[2]}`]; w1 = { EUI: R.W1.EUI, P: R.W1.peak, U: R.W1.UDI, C: R.W1.PMV_ok }; w2 = { EUI: R.W2.EUI, U: R.W2.UDI, C: R.W2.PMV_ok }; }
      else if (BL[r[0]]) { const t = BL[r[0]], a = B.W1[t], b = B.W2[t]; w1 = { EUI: a.EUI, P: a.peak_kW, U: a.UDI, C: a.PMV_ok }; w2 = { EUI: b.EUI, U: b.UDI, C: b.PMV_ok }; }
      else return;
      its.push(item(`${r[0]} EUI W1`, r[1], w1.EUI), item(`${r[0]} 최대 전력 W1 kW`, r[2], w1.P), item(`${r[0]} UDI W1`, r[3], w1.U), item(`${r[0]} 열쾌적 W1`, r[4], w1.C),
               item(`${r[0]} EUI W2`, r[5], w2.EUI), item(`${r[0]} UDI W2`, r[6], w2.U), item(`${r[0]} 열쾌적 W2`, r[7], w2.C));
    });
    return { items: its, trace: '강화학습 정책의 결정론적 평가(result.json)와 같은 건물 ARK의 비교 기준 연간 계산(S1·F0·S2·S3, W1과 비학습 기상 W2)을 표 6-9와 대조했다. H₁ 판정 규칙: 세 비교 기준(S2·S3·F0) 각각에 대해 에너지 감소·열쾌적 유지 이상·주광 유지 이상을 모두 충족해야 하고, PPO와 SAC 모두여야 채택.' };
  });

  add('C6-12', '6장', 'V1', '모델 가정·계산 간격 민감도: 6개 가정 × 7개 안에서 효과의 부호 유지(EUI 40/42, 최대 전력 41/42)와 표 6-14의 기준 안 값 (6.6.4항)', ['data/v/sens3.json', 'data/v/sens3_block.bin'], async c => {
    const S = await J('v/sens3'), buf = new Float32Array(await bin(S.bin));
    const blk = (vr, t) => { const r = vr.runs[t], A = r.area.reduce((a, b) => a + b, 0); const eui = r.EUI.reduce((a, e, k) => a + e * r.area[k], 0) / A; let pk = -1; const o = r.i * 8760; for (let h = 0; h < 8760; h++) if (buf[o + h] > pk) pk = buf[o + h]; return { eui, pk }; };
    const eff = vr => { const b = blk(vr, 'S1'); const o = {}; S.tags.slice(1).forEach(t => { const x = blk(vr, t); o[t] = { e: 100 * (x.eui / b.eui - 1), p: 100 * (x.pk / b.pk - 1) }; }); return { b, o }; };
    const base = eff(S.variants[0]); let nE = 0, nP = 0, tot = 0; const flips = [];
    const paper = { base: ['145.58', '9,875'], O: ['136.09', '14,921'], T10: ['146.91', '9,816'], T4: ['145.15', '9,914'], LE: ['136.38', '9,924'], L6: ['134.30', '8,883'], C2: ['137.41', '7,993'] };
    const items = [];
    S.variants.forEach(vr => {
      const e = eff(vr); items.push(item(`${vr.label}: S1 블록 EUI`, paper[vr.key][0], e.b.eui), item(`${vr.label}: S1 블록 최대 전력 kW`, paper[vr.key][1], e.b.pk));
      if (vr.key === 'base') return;
      S.tags.slice(1).forEach(t => { tot++; const r6 = v => Math.round(v * 100) / 100; if (Math.sign(r6(e.o[t].e)) === Math.sign(r6(base.o[t].e))) nE++; if (Math.sign(r6(e.o[t].p)) === Math.sign(r6(base.o[t].p))) nP++; else flips.push(`${vr.label} ${t} ${sg(base.o[t].p)}% → ${sg(e.o[t].p)}%`); });
    });
    items.push(item('부호가 유지된 비교 수(EUI, 42개 중)', '40', nE), item('부호가 유지된 비교 수(최대 전력, 42개 중)', '41', nP));
    return { items, trace: `각 가정의 S1 대비 블록 변화율을 건물별 연간값(면적 가중 EUI)과 블록 시간별 합(최대 전력)에서 다시 계산했다. 최대 전력 부호가 바뀐 비교: ${flips.join('; ') || '없음'}. 새 기준(대장 면적 보정)에서 계산 간격 6분·15분의 기준 안 블록 EUI와 최대 전력은 10분과 1% 이내로 다르다.` };
  });
  add('C7-01', '7장', 'V1', '원형 스케줄의 3개 동 블록 지표: 건물별 최대의 합·동시계수·부하율 (표 7-1)', ['data/v/det3.json'], async c => {
    const its = [], map = { 'S0 주변 건물 없음': 'S0', 'S1 기준(장치 없음)': 'S1', 'F0 블라인드 수평 고정': 'F0', 'S2 블라인드 고정 45°': 'S2', 'S3 블라인드 컷오프': 'S3' };
    c.T('표 7-1').rows.forEach(r => { const b = c.block(map[r[0]]); if (!b) return; const t = map[r[0]]; its.push(item(`${t} 블록 최대 kW`, r[1], b.peak), item(`${t} 건물별 최대 합 kW`, r[2], b.sumInd), item(`${t} 동시계수`, r[3], b.CF), item(`${t} 부하율`, r[4], b.LF), item(`${t} 블록 EUI`, r[5], b.EUI)); });
    return { items: its, trace: '동시계수 = 블록 최대 ÷ 건물별 최대의 합, 부하율 = 블록 평균 ÷ 블록 최대.' };
  });

  add('C7-02', '7장', 'V1', '운전 스케줄 시차(장치 없음, 운영 변수): D2(±2시간)에서 블록 최대 전력 −4.54%, 동시계수 0.979 (표 7-5)', ['data/v/det3.json', 'data/v/det3_ind_S1D.bin'], async c => {
    const s1 = c.block('S1'), its = [];
    [['원형(시차 없음)', 'S1'], ['D1(±1시간)', 'S1_D1'], ['D2(±2시간)', 'S1_D2']].forEach(([lab, t]) => {
      const r = c.row('표 7-5', lab), b = c.block(t);
      c.N.forEach((n, j) => its.push(item(`${t} ${n} 최대 kW`, r[1 + j].split('(')[0], c.det3.runs[t][n].peak_kW)));
      its.push(item(`${t} 블록 최대 kW`, r[4].split('(')[0], b.peak), item(`${t} 건물별 최대 합`, r[5], b.sumInd), item(`${t} 동시계수`, r[6], b.CF), item(`${t} 부하율`, r[7], b.LF));
    });
    const d2 = c.block('S1_D2'); its.push(item('D2 블록 최대 변화 %', '−4.54', 100 * (d2.peak / s1.peak - 1)));
    return { items: its, trace: `D1: GFC −1시간, ARK 0, GST +1시간. D2: GFC −2, ARK 0, GST +2. 공조 용량은 원형과 같다. D2의 블록 최대 시각: ${hourLabel(d2.idx)} 구간(원형 ${hourLabel(s1.idx)}).` };
  });

  add('C7-03', '7장', 'V1', '외피 작동 역치 균일 배정의 블록 최대 전력 (표 7-4, 균일 200~400 W/m²)', ['data/v/det3.json'], async c => {
    const s1 = c.block('S1'), its = [];
    c.T('표 7-4').rows.filter(r => r[0].startsWith('균일')).forEach(r => { const T = r[0].split(' ')[1]; const e = c.block(T === '300' ? 'EC_SOLS' : 'EC_T' + T), b = c.block('BT_T' + T); if (e) its.push(item(`전기변색 ${T} 블록 최대`, r[1].split('(')[0], e.peak), item(`전기변색 ${T} 변화 %`, r[1].split('(')[1], 100 * (e.peak / s1.peak - 1)), item(`전기변색 ${T} 블록 EUI`, r[2], e.EUI)); if (b) its.push(item(`블라인드 ${T} 블록 최대`, r[3].split('(')[0], b.peak), item(`블라인드 ${T} 블록 EUI`, r[4], b.EUI)); });
    return { items: its, trace: '균일 배정 = 3개 동 모든 구역에 같은 일사 역치를 둔 안(5~9월). 분산 배정(125가지)은 공개 자료에 시간별 출력이 없어 대조하지 않는다.' };
  });

  add('C7-04', '7장', 'V1', '일사·주광 기준 제어와 운전 스케줄 시차의 결합 (표 7-6)', ['data/v/det3.json'], async c => {
    const its = [], base = { 원형: 'S1', 'D1(±1시간)': 'S1_D1', 'D2(±2시간)': 'S1_D2' };
    const tg = { '장치 없음(S1)': '', '장치 없음': '', '전기변색 주광 연동(EC_DLS)': 'EC_DLS', '전기변색 주광 연동': 'EC_DLS', '블라인드 일사 기준, 걷어 올림(BT_T300)': 'BT_T300', '블라인드 일사 기준': 'BT_T300', '대형 루버 일사 기준, 수평(LT_T300)': 'LT_T300', '대형 루버 일사 기준': 'LT_T300' };
    const s1 = c.block('S1');
    c.T('표 7-6').rows.forEach(r => { const B = base[r[0]], sfx = B === 'S1' ? '' : B.slice(2); const t = tg[r[1]] === '' ? B : tg[r[1]] + sfx; const b = c.block(t); if (!b) return; its.push(item(`${t} 블록 EUI`, r[2], b.EUI), item(`${t} 블록 최대`, r[4], b.peak), item(`${t} 동시계수`, r[7], b.CF)); if (r[6] !== '—') its.push(item(`${t} 원형 S1 대비 %`, r[6], 100 * (b.peak / s1.peak - 1))); });
    return { items: its, trace: '같은 시차 조건의 장치 없음 대비 변화와 원형 S1 대비 변화를 함께 확인한다.' };
  });

  add('C5-01', '5장', 'V1', '257동 실측 비교: ASHRAE Guideline 14 월 기준 충족 보정용 2/31·시험용 1/215, 월 CV(RMSE) 중앙값 보정용 28.5%·시험용 45.4% (표 5-6)', ['data/targets257.json'], async c => {
    const med = a => { const b = [...a].sort((x, y) => x - y), n = b.length; return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };
    const M = c.tg257.targets.filter(t => t.meas && t.meas.CV != null), cal = M.filter(t => t.split === 'calib'), tst = M.filter(t => t.split === 'test');
    const pass = a => a.filter(t => t.meas.CV <= 15 && Math.abs(t.meas.NMBE) <= 5).length;
    const its = [item('보정용 동수', '31', cal.length), item('시험용 동수', '215', tst.length), item('보정용 G14 충족 동수', '2', pass(cal)), item('시험용 G14 충족 동수', '1', pass(tst)),
      item('보정용 월 CV(RMSE) 중앙값 %', '28.5', med(cal.map(t => t.meas.CV))), item('시험용 월 CV(RMSE) 중앙값 %', '45.4', med(tst.map(t => t.meas.CV))),
      item('시험용 보정 전 월 CV(RMSE) 중앙값 %', '54.8', med(tst.map(t => t.meas.CV_uncal)))];
    return { items: its, trace: '건물별 월 CV(RMSE)·NMBE(2023–2024 월별 전기, 연면적 정규화)를 내보낸 값에서 동수와 중앙값을 다시 셌다. 판정: 월 CV(RMSE) ≤ 15%, |NMBE| ≤ 5%. 건물별 지표 자체의 재계산(월별 원자료)은 이 원장에 포함하지 않는다.' };
  });

  add('C6-13', '6장', 'V1', '두 신호 제어(기공 원리, P₃): 창면 일사 + 실온 대 창면 일사 한 신호 (표 6-5b)', ['data/v/det3.json', 'data/v/det3_block.bin'], async c => {
    const s1 = c.block('S1'), its = [];
    c.T('표 6-5b').rows.forEach(r => {
      const t = r[0].split(' ')[0], b = c.block(t); if (!b) return;
      its.push(item(`${t} 블록 EUI`, r[2], b.EUI), item(`${t} 블록 최대 전력 kW`, r[4], b.peak));
      if (t !== 'S1') its.push(item(`${t} EUI 변화 %`, r[3], 100 * (b.EUI / s1.EUI - 1)), item(`${t} 최대 전력 변화 %`, r[5], 100 * (b.peak / s1.peak - 1)));
      nums(r[6]).forEach((u, j) => its.push(item(`${t} ${c.N[j]} UDI`, u.toFixed(1), c.det3.runs[t][c.N[j]].UDI)));
      nums(r[7]).forEach((u, j) => its.push(item(`${t} ${c.N[j]} 열쾌적`, u.toFixed(1), c.det3.runs[t][c.N[j]].PMV_ok)));
      nums(r[8]).forEach((u, j) => its.push(item(`${t} ${c.N[j]} 구역당 작동 횟수`, String(u), c.det3.runs[t][c.N[j]].moves)));
    });
    return { items: its, trace: 'TS: 창면 일사 300 W/m² 초과이고 실온 23.5 °C 초과일 때만 작동, TO: 실온 대신 외기 26 °C. 5~9월. 작동 횟수 = 구역별 슬랫각이 0.5° 넘게 바뀐 횟수의 연간 평균(20개 구역).' };
  });

  add('C7-05', '7장', 'V1', '257동 블록 지표: 블록 최대 전력·S1c 대비 변화·동시계수·부하율 (표 7-7)', ['data/block257.json'], async c => {
    const B = c.blk257, its = [];
    c.T('표 7-7').rows.forEach((r, i) => { const s = B.scenarios[i], x = B.summary[s]; if (!x) return;
      its.push(item(`${s} 블록 최대 전력 kW`, r[1], x.peak), item(`${s} 동시계수`, r[4], x.CF), item(`${s} 부하율`, r[5], x.LF));
      if (r[2] !== '—') its.push(item(`${s} S1c 대비 %`, r[2], x.dP)); });
    return { items: its, trace: '블록 = 257동 시간별 전력의 합(block257.json). 표 7-7의 행 순서는 S1c, F0c, LH_F0c, VF_F0c, EC_DLSc, BT_T300c, LT_T300c, S1c_D1, S1c_D2이다. 동시계수 = 블록 최대 ÷ 건물별 최대의 합.' };
  });

  add('C8-01', '8장', 'V1', '생물 원리에서 유도한 전이 가설 P₁~P₃의 판정을 공통 기준으로 다시 내림 (표 8-2)', ['data/v/det3.json', 'data/v/det3_block.bin', 'data/v/principles.json'], async c => {
    const judge = (a, b) => { const A = c.block(a), Bb = c.block(b); const tol = 1e-9;
      const notWorse = [A.EUI <= Bb.EUI + tol, A.peak <= Bb.peak + tol, ...c.N.map(n => c.det3.runs[a][n].UDI >= c.det3.runs[b][n].UDI - tol), ...c.N.map(n => c.det3.runs[a][n].PMV_ok >= c.det3.runs[b][n].PMV_ok - tol)];
      const better = [A.EUI < Bb.EUI, A.peak < Bb.peak, ...c.N.map(n => c.det3.runs[a][n].UDI > c.det3.runs[b][n].UDI), ...c.N.map(n => c.det3.runs[a][n].PMV_ok > c.det3.runs[b][n].PMV_ok)];
      return notWorse.every(Boolean) && better.some(Boolean); };
    const cases = [['P₁', 'ZB', 'S3', '채택'], ['P₁', 'ZA', 'S3', '기각'], ['P₂', 'S3', 'F0', '기각'], ['P₂', 'LH_C', 'LH_F0', '기각'], ['P₂', 'VF_C', 'VF_F0', '기각'], ['P₃', 'EC_TS300', 'EC_SOLS', '채택'], ['P₃', 'BT_TS300', 'BT_T300', '기각']];
    const its = cases.map(([p, a, b, paper]) => { const ok = judge(a, b), calc = ok ? '채택' : '기각'; return { label: `${p} ${a} 대 ${b}`, paper, pv: NaN, calc, tol: 0, d: NaN, st: calc === paper ? 'ok' : 'bad', unit: '' }; });
    return { items: its, trace: '판정 기준(3.4절): 원리 적용 안이 비적용 안보다 블록 EUI·블록 최대 전력을 높이지 않고, 3개 동 모두 UDI·열쾌적 비율을 낮추지 않으면서, 넷 가운데 하나 이상을 개선하면 채택. P₁~P₃은 탐색적 가설(기준은 결과 일부를 본 뒤 정식화). P₄(역치 분산)는 C7-03과 표 7-4 참조.' };
  });

  add('C2-01', '2장·부록', 'V1', '참고문헌 256편, 해외 문헌 DB 660편 · 선정 500편 · A 328편 · B 172편', ['data/references.json', 'data/literature.json'], async c => {
    const sel = c.lit.filter(d => d.sel === '선정500');
    return { items: [item('참고문헌 수', '256', c.refs.length), item('문헌 DB 수', '660', c.lit.length), item('선정 문헌 수', '500', sel.length), item('A 등급', '328', sel.filter(d => d.rel === 'A').length), item('B 등급', '172', sel.filter(d => d.rel === 'B').length)], trace: '공개한 목록 파일의 항목 수를 센다.' };
  });

  /* ---------- 실행·렌더 ---------- */
  const RES = {};
  async function runOne(cl, log) {
    const t0 = performance.now();
    try { const c = await ctx(); const r = await cl.run(c); r.st = worst(r.items.map(x => x.st)); r.ms = performance.now() - t0; RES[cl.id] = r; log && log(`${cl.id}  ${ST[r.st][0].padEnd(6)}  항목 ${r.items.length}  ${r.ms.toFixed(0)} ms`); }
    catch (e) { RES[cl.id] = { st: 'chk', items: [], trace: '실행 오류: ' + esc(e.message) }; log && log(`${cl.id}  오류  ${e.message}`); }
    return RES[cl.id];
  }
  function badge(st) { return `<span class="vb ${ST[st][1]}">${ST[st][0]}</span>`; }
  function summary() {
    const done = CL.filter(c => RES[c.id]);
    const cnt = k => done.filter(c => RES[c.id].st === k).length;
    const items = done.reduce((a, c) => a + RES[c.id].items.length, 0), iok = done.reduce((a, c) => a + RES[c.id].items.filter(x => x.st === 'ok').length, 0);
    $('#v-sum').innerHTML = `<div class="vs"><b>${done.length}</b><span>/ ${CL.length} 주장 실행</span></div>
<div class="vs ok"><b>${cnt('ok')}</b><span>일치</span></div><div class="vs rd"><b>${cnt('rd')}</b><span>반올림 차이</span></div><div class="vs chk"><b>${cnt('chk')}</b><span>확인 필요</span></div><div class="vs bad"><b>${cnt('bad')}</b><span>불일치</span></div>
<div class="vs"><b>${iok}</b><span>/ ${items} 개별 수치 일치</span></div>`;
  }
  function rowHTML(cl) {
    const r = RES[cl.id];
    return `<tr data-id="${cl.id}" class="vrow"><td class="mono">${cl.id}</td><td>${cl.ch}</td><td><span class="lv lv${cl.lv[1]}" title="${esc(LV[cl.lv][1])}">${cl.lv} ${LV[cl.lv][0]}</span></td><td>${esc(cl.title)}</td><td>${r ? r.items.length : '—'}</td><td>${r ? badge(r.st) : '<span class="vb na">대기</span>'}</td></tr>
<tr class="vdet" data-for="${cl.id}" hidden><td colspan="6"></td></tr>`;
  }
  function detailHTML(cl) {
    const r = RES[cl.id]; if (!r) return '';
    return `<div class="vtrace"><div class="mono small">근거 자료: ${cl.src.map(s => `<a href="${s}" target="_blank" rel="noopener">${esc(s)}</a>`).join(' · ')}</div><p>${r.trace}</p>
<div class="tblwrap"><table class="tbl vtab"><thead><tr><th>항목</th><th>논문 표기</th><th>재계산</th><th>차이</th><th>허용오차</th><th>판정</th></tr></thead><tbody>
${r.items.map(x => `<tr class="${x.st}"><td>${esc(x.label)}</td><td class="mono">${esc(x.paper)}</td><td class="mono">${f(x.calc, Math.min(4, decs(x.paper) + 2))}</td><td class="mono">${isFinite(x.d) ? sg(x.d, Math.min(4, decs(x.paper) + 2)) : '—'}</td><td class="mono">±${x.tol.toPrecision(2)}</td><td>${badge(x.st)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* ---------- 가설 판정 추적 ---------- */
  async function hypo() {
    const c = await ctx(), B = c.ppo.baselines, SEEDS = ['s0', 's1', 's2'];
    const cond = (k, w, t) => { const W = c.ppo.rl[k][w], b = B[w][t]; return [W.EUI < b.EUI, W.PMV_ok >= b.PMV_ok, W.UDI >= b.UDI]; };
    const mk = v => v ? '<span class="vb ok">충족</span>' : '<span class="vb bad">미충족</span>';
    const vd = v => v ? '<span class="vb ok">채택</span>' : '<span class="vb bad">기각</span>';
    let h1 = { PPO: true, SAC: true };
    const rows1 = [['S2', 'Case A 고정 45°'], ['S3', 'Case B 컷오프'], ['F0', '고정 θ = 0°']].map(([t, l]) => ['PPO', 'SAC'].map(a => {
      const ks = SEEDS.map(s => cond(`${a}_${s}`, 'W1', t)), all = j => ks.every(k => k[j]), ok = [0, 1, 2].every(all);
      if (!ok) h1[a] = false;
      return `<tr><td>${l}</td><td class="mono">${a}</td><td>${mk(all(0))}</td><td>${mk(all(1))}</td><td>${mk(all(2))}</td><td>${ok ? mk(true) : mk(false)}</td></tr>`; }).join('')).join('');
    const H1 = h1.PPO && h1.SAC;
    let h2 = { PPO: true, SAC: true };
    const rows2 = ['PPO', 'SAC'].map(a => SEEDS.map(s => ['W1', 'W2'].map(w => { const k = cond(`${a}_${s}`, w, 'S3'), ok = k.every(Boolean); if (!ok) h2[a] = false;
      const W = c.ppo.rl[`${a}_${s}`][w], b = B[w].S3;
      return `<tr><td class="mono">${a}</td><td class="mono">${s.slice(1)}</td><td class="mono">${w}</td><td class="mono">${sg(100 * (W.EUI / b.EUI - 1), 2)}%</td><td class="mono">${sg(W.PMV_ok - b.PMV_ok, 1)}%p</td><td class="mono">${sg(W.UDI - b.UDI, 1)}%p</td><td>${mk(ok)}</td></tr>`; }).join('')).join('')).join('');
    const H2 = h2.PPO && h2.SAC;
    const pal = ['#E8541E', '#F08A5D', '#F6B99A', '#1E2A38', '#4A5A6E', '#8A98AA'];
    const curve = (k, i) => { const r = c.ppo.rl[k].reward, mn = Math.min(...r), mx = Math.max(...r); return `<polyline fill="none" stroke="${pal[i]}" stroke-width="1.2" points="${r.map((v, j) => `${(j / (r.length - 1) * 300).toFixed(1)},${(70 - (v - mn) / (mx - mn || 1) * 60).toFixed(1)}`).join(' ')}"/>`; };
    const P = c.T('표 8-2');
    $('#v-hypo').innerHTML = `
<div class="hgrid hg2">
 <div class="card"><div class="hk">H₁ 에너지 절감 ${vd(H1)}</div><p class="small">"SAC와 PPO 모두"가 세 조건(에너지 감소·열쾌적 유지 이상·주광 유지 이상)을 세 비교 기준 모두에 대해, 3개 시드 모두에서 충족해야 채택된다. 아래 표는 결정론적 평가 결과(학습 기상 W1)로 브라우저가 판정을 다시 내린 것이다(PPO ${h1.PPO ? '충족' : '미충족'}, SAC ${h1.SAC ? '충족' : '미충족'}). 시험한 설정은 ARK 1개 동, PPO·SAC 각 3개 시드 × 100회 학습이며, 이 판정을 강화학습 일반으로 넓히지 않는다.</p>
  <div class="tblwrap"><table class="tbl"><thead><tr><th>비교 기준</th><th>알고리즘</th><th>에너지</th><th>열쾌적</th><th>주광</th><th>3개 시드</th></tr></thead><tbody>${rows1}</tbody></table></div>
  <svg viewBox="0 0 300 80" class="spark"><text x="0" y="8" class="mono" style="font-size:7px">학습 보상(에피소드별, 시드별 정규화) — 주황 PPO · 남색 SAC</text>${['PPO', 'SAC'].flatMap((a, ai) => SEEDS.map((s, si) => curve(`${a}_${s}`, ai * 3 + si))).join('')}</svg></div>
 <div class="card"><div class="hk">H₂ 알고리즘 독립성 ${vd(H2)}</div><p class="small">"개선"은 H₁의 조건을 Case B(컷오프) 대비로 적용하고, 두 알고리즘의 모든 시드가 두 기상(W1 학습, W2 비학습)에서 충족해야 채택(4.7.2항). 이 판정 규칙은 두 알고리즘의 시드 0 결과를 본 뒤 문서화되었다(부록 C). 두 알고리즘은 EUI 감소·UDI 감소에서 방향이 같았으나 그것이 가설이 뜻하는 개선은 아니었다.</p>
  <div class="tblwrap" style="max-height:420px"><table class="tbl nw"><thead><tr><th>알고리즘</th><th>시드</th><th>기상</th><th>EUI</th><th>열쾌적</th><th>UDI</th><th>개선 조건</th></tr></thead><tbody>${rows2}</tbody></table></div></div>
</div>
<div class="card"><div class="hk">H₃ 네트워크 효과 <span class="vb na">미검토</span></div><p class="small">이웃 건물 정보를 공유하는 협조 제어와 건물별 독립 제어를 같은 블록에서 비교해야 시험할 수 있다. 건물군 협조 강화학습(S5)을 계산하지 않았으므로 채택도 기각도 하지 않는다. 7장은 시험할 때 확인할 항목(조정 가능한 부하, 새로 생기는 최대 전력 시각, 열쾌적 제약)을 제시한다(7.6.1항).</p></div>
<div class="card"><div class="hk">원리별 전이 가설 P₁~P₄ <span class="vb na">탐색적</span></div><p class="small">생물 원리에서 유도한 제어 규칙을 같은 프레임워크 안에서 시험한 결과(3.4절, 표 8-2). H₁~H₃과 달리 사전 등록 가설이 아니며, P₁~P₃의 판정 기준은 결과 일부를 본 뒤 정식화되었다(부록 C (5)). 원리 적용 안의 판정은 검증 원장 C8-01에서 브라우저가 다시 내린다.</p>
<div class="tblwrap"><table class="tbl"><thead><tr>${P.header.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${P.rows.map(r => `<tr>${r.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>
<div class="card"><div class="hk">결정 시점 기록</div><ol class="tl">${c.ppo.timeline.map(([t, s]) => `<li><span class="mono">${esc(t)}</span> ${esc(s)}</li>`).join('')}</ol>
<p class="small">강화학습 시각은 모델 파일 저장 시각이다. 계산 기준 변경과 재학습 결정은 이전 기준의 PPO 결과를 본 뒤에 내려졌다(부록 C).</p></div>`;
  }

  /* ---------- 무결성 ---------- */
  async function integrity() {
    const el = $('#v-int'); let man;
    try { man = await fetch('data/manifest.json').then(r => r.json()); } catch (e) { el.innerHTML = '<p class="small">manifest.json 없음</p>'; return; }
    const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
    el.innerHTML = `<div class="tblwrap"><table class="tbl"><thead><tr><th>파일</th><th>크기</th><th>출처</th><th>SHA-256(앞 16자)</th><th>브라우저 계산</th></tr></thead><tbody>${man.files.map(m => `<tr data-f="${esc(m.path)}"><td class="mono">${esc(m.path)}</td><td class="mono">${(m.bytes / 1024).toFixed(0)} KB</td><td class="small">${esc(m.source)}</td><td class="mono">${m.sha256.slice(0, 16)}</td><td class="mono" data-h>…</td></tr>`).join('')}</tbody></table></div>`;
    for (const m of man.files) {
      const td = el.querySelector(`tr[data-f="${CSS.escape(m.path)}"] [data-h]`);
      try { const b = await fetch(m.path, { cache: 'no-store' }).then(r => r.arrayBuffer()); const h = hex(await crypto.subtle.digest('SHA-256', b)); td.innerHTML = h === m.sha256 ? `<span class="vb ok">같음</span>` : `<span class="vb bad">다름</span>`; }
      catch (e) { td.textContent = '오류'; }
    }
  }

  function csv() {
    const L = [['claim', 'chapter', 'level', 'title', 'item', 'paper', 'recomputed', 'diff', 'tolerance', 'status']];
    CL.forEach(cl => (RES[cl.id]?.items || []).forEach(x => L.push([cl.id, cl.ch, cl.lv, cl.title, x.label, x.paper, x.calc, x.d, x.tol, ST[x.st][0]])));
    const s = '﻿' + L.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([s], { type: 'text/csv' })); a.download = 'verification_ledger.csv'; a.click();
  }

  function mount() {
    const P = $('#page-verify'); if (P.dataset.ok) return; P.dataset.ok = 1;
    P.innerHTML = `
<div class="vhead"><div><div class="kicker">Verification ledger</div><h1>검증 원장</h1>
<p class="lead">논문의 표와 본문 수치를 공개한 원자료에서 <b>이 브라우저가 직접 다시 계산</b>해 대조합니다. 각 주장에는 검증 수준(V0~V3)과 근거 파일을 함께 표시하고, 대조 결과는 논문 표기의 자릿수에 맞춘 허용오차로 판정합니다. 모든 성능 수치는 EnergyPlus 시뮬레이션 값이며 실측이 아닙니다.</p><p class="small vscope"><b>이 원장이 확인하는 것과 확인하지 않는 것</b>: 논문 수치가 공개한 계산 출력과 산술적으로 일치하는지(재현성)를 확인합니다. 모델이 실제 건물을 잘 나타내는지(타당성)는 확인하지 않습니다. 모델의 타당성은 월별 실측 비교(5.4절, 257동, 기준 충족 보정용 2/31동·시험용 1/215동)와 민감도 계산으로 따로 판단해야 합니다.</p></div>
<div class="vbtns"><button class="btn primary" id="v-run">전체 재계산 실행</button><button class="btn" id="v-csv">결과 CSV 내려받기</button></div></div>
<div id="v-sum" class="vsum"></div>
<div class="lvlegend">${Object.entries(LV).map(([k, v]) => `<div><span class="lv lv${k[1]}">${k} ${v[0]}</span><span class="small">${v[1]}</span></div>`).join('')}</div>
<div class="vgrid"><div class="tblwrap"><table class="tbl vledger"><thead><tr><th>ID</th><th>장</th><th>검증 수준</th><th>주장</th><th>수치</th><th>판정</th></tr></thead><tbody>${CL.map(rowHTML).join('')}</tbody></table></div>
<pre id="v-log" class="vlog">$ ledger ready — ${CL.length} claims</pre></div>
<h2 class="sec">가설 판정 추적</h2><div id="v-hypo"><p class="small">불러오는 중…</p></div>
<h2 class="sec">자료 무결성 (SHA-256)</h2><p class="small">공개 자료 파일의 해시를 빌드할 때 기록해 두고, 지금 브라우저가 내려받은 파일로 다시 계산해 같은지 확인합니다.</p><div id="v-int"></div>`;
    summary();
    const log = s => { const el = $('#v-log'); el.textContent += '\n' + s; el.scrollTop = el.scrollHeight; };
    const refresh = id => { const cl = CL.find(c => c.id === id); const tr = $(`tr.vrow[data-id="${id}"]`); tr.outerHTML = rowHTML(cl); };
    $('#v-run').onclick = async () => { $('#v-run').disabled = true; log('$ run all'); for (const cl of CL) { await runOne(cl, log); const old = $(`tr.vdet[data-for="${cl.id}"]`); const open = old && !old.hidden; old && old.remove(); refresh(cl.id); if (open) { const d = $(`tr.vdet[data-for="${cl.id}"]`); d.hidden = false; d.firstElementChild.innerHTML = detailHTML(cl); } summary(); } log('$ done'); $('#v-run').disabled = false; };
    $('#v-csv').onclick = csv;
    P.addEventListener('click', async e => {
      const tr = e.target.closest('tr.vrow'); if (!tr) return;
      const id = tr.dataset.id, cl = CL.find(c => c.id === id);
      if (!RES[id]) { await runOne(cl, log); refresh(id); summary(); }
      const d = $(`tr.vdet[data-for="${id}"]`); d.hidden = !d.hidden; if (!d.hidden) d.firstElementChild.innerHTML = detailHTML(cl);
    });
    hypo(); integrity();
    $('#v-run').click();
  }
  window.VERIFY = { mount, claims: CL, results: RES, ctx };
})();
