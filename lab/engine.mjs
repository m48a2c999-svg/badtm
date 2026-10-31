const ASH = { A: [1230, 1215, 1186, 1136, 1104, 1088, 1085, 1107, 1151, 1192, 1221, 1233], B: [.142, .144, .156, .180, .196, .205, .207, .201, .177, .160, .149, .142], C: [.058, .060, .071, .097, .121, .134, .136, .122, .092, .073, .063, .057] };
const D2R = Math.PI / 180;

/* ---------- 태양 위치(NOAA) ---------- */
export function sunPos(ymd, minLocal, lat, lon) {
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
export function clearSky(alt, month) { if (alt <= 0) return { dn: 0, dh: 0 }; const A = ASH.A[month - 1], B = ASH.B[month - 1], C = ASH.C[month - 1]; const dn = A * Math.exp(-B / Math.sin(alt * D2R)); return { dn, dh: C * dn }; }

