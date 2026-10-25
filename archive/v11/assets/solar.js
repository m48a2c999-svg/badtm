/* 태양 위치·창면 일사·슬랫 투과·실내 조도 근사 계산 (교육용 단순 모델) */
(function () {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const SITE = { lat: 37.5005, lon: 127.0365, tz: 9 };
  const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function doyToDate(doy) { let m = 0, d = doy; while (d > MDAYS[m]) { d -= MDAYS[m]; m++; } return { m: m + 1, d }; }
  function dateToDoy(m, d) { let s = 0; for (let i = 0; i < m - 1; i++) s += MDAYS[i]; return s + d; }
  // NOAA 근사식. hour: 표준시(KST) 소수 시각
  function sunPos(doy, hour, lat = SITE.lat, lon = SITE.lon, tz = SITE.tz) {
    const g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = hour * 60 + eqt + 4 * lon - 60 * tz;
    const ha = (tst / 4 - 180) * D2R, la = lat * D2R;
    const cz = Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha);
    const zen = Math.acos(Math.max(-1, Math.min(1, cz)));
    let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(dec) * Math.cos(la)) * R2D + 180;
    az = (az + 360) % 360;
    return { alt: 90 - zen * R2D, az, dec: dec * R2D, eqt };
  }
  // 단위 벡터 (동, 북, 위)
  function sunVec(alt, az) { const a = alt * D2R, z = az * D2R; return [Math.sin(z) * Math.cos(a), Math.cos(z) * Math.cos(a), Math.sin(a)]; }
  function sunriseSet(doy) {
    let rise = null, set = null, prev = sunPos(doy, 0).alt;
    for (let h = 0.05; h <= 24; h += 0.05) { const a = sunPos(doy, h).alt; if (prev < -0.83 && a >= -0.83) rise = h; if (prev >= -0.83 && a < -0.83) set = h; prev = a; }
    return { rise, set };
  }
  const fmtH = h => h == null ? '—' : `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;

  // 입면 좌표계: 바깥 법선 방위 A(북=0, 시계방향). local = [x(입면 오른쪽), y(위), z(바깥)]
  function toFacade(v, A) { const a = A * D2R; const r = [Math.cos(a), -Math.sin(a), 0], n = [Math.sin(a), Math.cos(a), 0]; return [v[0] * r[0] + v[1] * r[1], v[2], v[0] * n[0] + v[1] * n[1]]; }

  // 수평 슬랫 직달 투과율: 폭 w, 간격 s, 기울기 beta(0 = 수평, 커질수록 닫힘), 프로파일각 phi
  function slatFrac(w, s, beta, tanPhi) {
    const b = beta * D2R; const blk = w * (Math.sin(b) + Math.cos(b) * tanPhi) / s;
    return Math.max(0, Math.min(1, 1 - blk));
  }
  function cutoffAngle(w, s, phiDeg) { // 직달을 막는 최소 슬랫각
    const phi = phiDeg * D2R; const x = (s / w) * Math.cos(phi);
    if (x >= 1) return 89; // 슬랫 폭이 간격보다 좁아 낮은 태양을 완전히 막을 수 없을 때는 최대로 닫는다
    const b = Math.asin(x) * R2D - phiDeg; return Math.max(0, Math.min(89, b));
  }
  const DEV = {
    blind80: { w: 0.080, s: 0.085, label: '외부 블라인드 80 mm' },
    louver300: { w: 0.30, s: 0.25, label: '대형 수평 루버 300 mm' },
    fin300: { w: 0.30, s: 0.25, label: '수직 회전 핀 300 mm' }
  };
  const MODES = {
    none: { label: '장치 없음 (S1)', dev: null },
    F0: { label: '블라인드 수평 고정 (F0)', dev: 'blind80' },
    S2: { label: '블라인드 고정 45° (S2)', dev: 'blind80' },
    S3: { label: '블라인드 컷오프 (S3)', dev: 'blind80' },
    PK: { label: '블라인드 피크 시간 폐쇄 (PK)', dev: 'blind80' },
    BT: { label: '블라인드 일사 기준·미작동 시 수납 (BT_T)', dev: 'blind80' },
    LT: { label: '대형 루버 일사 기준·미작동 시 수평 (LT_T)', dev: 'louver300' },
    VF: { label: '수직 핀 컷오프 (VF_C, 동·서 입면)', dev: 'fin300' },
    EC_DL: { label: '전기변색 주광 연동 500 lx, 연중 (EC_DL)', dev: 'ec' },
    EC_DLS: { label: '전기변색 주광 연동 500 lx, 5~9월 (EC_DLS)', dev: 'ec' },
    EC_SOL: { label: '전기변색 일사 기준 착색, 연중 (EC_SOL)', dev: 'ec' }
  };
  const GLASS = { VT: 0.305, SHGC: 0.39, VT_tint: 0.01, SHGC_tint: 0.09 };
  const ROOM = { W: 6.0, D: 4.57, H: 2.74, sill: 0.80, head: 2.38, wp: 0.80 }; // DOE 대형 사무소 외주부 존 근사(창면적비 40%)
  const K_DIR = 100, K_DIF = 120, RHO_G = 0.2;

  // 한 시각의 외부 조건 → 입면 조건
  function facadeState(sunL, wx, A, mode, opt) {
    const { DNI, DHI, GHI } = wx; const out = { mode, dev: MODES[mode].dev };
    const cosi = Math.max(0, sunL[2]); out.cosi = cosi;
    out.Iwin = DNI * cosi + DHI * 0.5 + GHI * RHO_G * 0.5; // 수직면 등방 근사
    out.sunFront = sunL[2] > 0 && sunL[1] > 0;
    out.phi = out.sunFront ? Math.atan2(sunL[1], sunL[2]) * R2D : null;          // 수직 그림자각(프로파일각)
    out.gammaH = out.sunFront ? Math.atan2(sunL[0], sunL[2]) * R2D : null;        // 수평 그림자각
    const month = opt.month, summer = month >= 5 && month <= 9, T = opt.T ?? 300;
    out.beta = null; out.present = false; out.tint = 0; out.active = false; out.summer = summer;
    const d = MODES[mode].dev;
    if (d === 'blind80' || d === 'louver300') {
      const g = DEV[d]; const cut = out.sunFront ? cutoffAngle(g.w, g.s, out.phi) : 0; out.cut = cut;
      if (mode === 'F0') { out.present = true; out.beta = 0; }
      else if (mode === 'S2') { out.present = true; out.beta = 45; }
      else if (mode === 'S3') { out.present = true; out.beta = out.sunFront ? cut : 0; out.active = out.sunFront; }
      else if (mode === 'PK') { out.present = true; const pk = (month === 7 || month === 8) && opt.weekday && opt.hour >= 13 && opt.hour < 18; out.beta = pk ? 89 : 0; out.active = pk; }
      else if (mode === 'BT') { out.active = summer && out.Iwin > T; out.present = out.active; out.beta = out.active ? cut : null; }
      else if (mode === 'LT') { out.active = summer && out.Iwin > T; out.present = true; out.beta = out.active ? cut : 0; }
    } else if (d === 'fin300') {
      const ew = opt.ew; const g = DEV.fin300; out.present = ew;
      const gh = out.sunFront ? Math.abs(out.gammaH) : 0; out.cut = out.sunFront ? cutoffAngle(g.w, g.s, gh) : 0;
      out.beta = ew ? (out.sunFront ? out.cut : 0) : null; out.active = ew && out.sunFront;
    } else if (d === 'ec') {
      if (mode === 'EC_SOL') { out.active = out.Iwin > T; out.tint = out.active ? 1 : 0; }
      // EC_DL, EC_DLS: 조도에 따라 room 계산에서 결정
    }
    return out;
  }
  // 장치 투과율(방향별): 실내에서 바깥으로 향하는 방향 d(local), 반환 0..1
  function devTrans(st, d) {
    if (!st.present || st.beta == null) return 1;
    const f = devGeom(st, d), tr = 0.22 * (1 - Math.min(89, st.beta) / 90); // 슬랫 반사(반사율 0.88)로 들어오는 몫의 근사
    return f + (1 - f) * tr;
  }
  function geomTrans(st, d) { return (!st.present || st.beta == null) ? 1 : devGeom(st, d); }
  function devGeom(st, d) {
    if (st.dev === 'fin300') { const g = DEV.fin300; const t = Math.abs(d[0] / Math.max(1e-6, d[2])); return slatFrac(g.w, g.s, st.beta, t); }
    const g = DEV[st.dev]; const t = d[1] / Math.max(1e-6, d[2]); // 위로 향하면 양(하늘), 아래면 음
    if (t >= 0) return slatFrac(g.w, g.s, st.beta, t);
    // 아래쪽(지면) 방향: 슬랫 윗면 반사를 무시하고 대칭 근사
    return 0.5 * slatFrac(g.w, g.s, 0, -t);
  }
  // 실내 작업면 조도 격자 (nx × nz) + 기준점(창에서 3 m, 높이 0.8 m — 논문의 EnergyPlus 주광 기준점과 같은 위치)
  function roomGrid(sunL, wx, st, nx = 24, nz = 18, npx = 12, npy = 6) {
    const R = ROOM, VT = GLASS.VT, out = new Float32Array(nx * nz), dir = new Uint8Array(nx * nz);
    const Lz = 9 * wx.DHI * K_DIF / (7 * Math.PI), Lgnd = wx.GHI * RHO_G * K_DIF / Math.PI; // CIE 흐린 하늘 휘도 분포
    const tintVT = t => VT + (GLASS.VT_tint - VT) * t;
    const dA = (R.W / npx) * ((R.head - R.sill) / npy);
    const Aw = R.W * (R.head - R.sill), Atot = 2 * (R.W * R.D + R.W * R.H + R.D * R.H), RHO = 0.35;
    let tauSky = 0, wsum = 0; for (let e = 5; e < 90; e += 10) { const s = Math.sin(e * Math.PI / 180), c = Math.cos(e * Math.PI / 180), wgt = (1 + 2 * s) / 3 * c * c; tauSky += devTrans(st, [0, s, c]) * wgt; wsum += wgt; } tauSky /= wsum;
    const tauGnd = devTrans(st, [0, -0.3, 0.954]);
    const sunOK = wx.DNI > 0 && sunL[1] > 0 && sunL[2] > 0;
    const sunIn = sunOK ? wx.DNI * K_DIR * sunL[2] * devTrans(st, sunL) : 0, fSun = sunOK ? geomTrans(st, sunL) : 0;
    const EvExt = 0.396 * wx.DHI * K_DIF * tauSky + 0.5 * wx.GHI * RHO_G * K_DIF * tauGnd + sunIn;
    function point(px, pz, vt) {
      const py = R.wp; let E = 0;
      for (let a = 0; a < npx; a++) for (let b = 0; b < npy; b++) {
        const qx = (a + 0.5) / npx * R.W, qy = R.sill + (b + 0.5) / npy * (R.head - R.sill);
        const vx = qx - px, vy = qy - py, vz = -pz, r2 = vx * vx + vy * vy + vz * vz, r = Math.sqrt(r2);
        const d = [vx / r, vy / r, vz / r]; if (d[1] <= 0) continue;
        E += Lz * (1 + 2 * d[1]) / 3 * vt * devTrans(st, d) * d[1] * d[2] * dA / r2;
      }
      let Ed = 0, hit = 0;
      if (sunOK && fSun > 0.02) {
        const t = -pz / sunL[2]; const qx = px + t * sunL[0], qy = py + t * sunL[1];
        if (qx >= 0 && qx <= R.W && qy >= R.sill && qy <= R.head) { Ed = wx.DNI * K_DIR * vt * fSun * sunL[1]; hit = 1; }
      }
      return [E + Ed, hit];
    }
    function calc(tint) {
      const vt = tintVT(tint), irc = Aw * vt * EvExt * RHO / (Atot * (1 - RHO)); let sum = 0;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const [E, h] = point((i + 0.5) / nx * R.W, -(j + 0.5) / nz * R.D, vt); out[j * nx + i] = E + irc; dir[j * nx + i] = h; sum += E + irc; }
      return { mean: sum / out.length, ref: point(R.W / 2, -3.0, vt)[0] + irc };
    }
    let tint = st.tint || 0, res = calc(tint);
    if (st.mode === 'EC_DL' || (st.mode === 'EC_DLS' && st.summer)) {
      if (res.ref > 500) { let lo = 0, hi = 1; for (let k = 0; k < 9; k++) { const m = (lo + hi) / 2, vt = tintVT(m); const r = point(R.W / 2, -3.0, vt)[0] + Aw * vt * EvExt * RHO / (Atot * (1 - RHO)); if (r > 500) lo = m; else hi = m; } tint = hi; res = calc(tint); }
      st.tint = tint; st.active = tint > 0.01;
    }
    return { E: out, direct: dir, nx, nz, mean: res.mean, ref: res.ref, tint };
  }
  window.SOLAR = { SITE, sunPos, sunVec, sunriseSet, fmtH, doyToDate, dateToDoy, toFacade, slatFrac, cutoffAngle, facadeState, roomGrid, MODES, DEV, GLASS, ROOM, MDAYS };
})();
