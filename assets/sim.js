/* 시뮬레이션: (1) 대상지 3D 태양 경로·그림자 (2) 키네틱 외피 모듈과 실내 조도 근사 (3) 연간 작동·조도 지도 */
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const S = window.SOLAR, A = window.APP, $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const COL = { ink: 0x1E2A38, sun: 0xE8541E, kin: 0xF2B33D, mesh: 0x8C949E, ctx: 0xDADDE1, tgt: 0xB7BDC5, ground: 0xEFEDE7 };
const state = { doy: 212, hour: 16.5, playing: false };
let WX = null, BLD = null, TG = null, mounted = false;

function dateLabel(doy) { const d = S.doyToDate(doy); return `${d.m}월 ${d.d}일`; }
function wxAt(doy, hour) { const i = Math.max(0, Math.min(8759, (doy - 1) * 24 + Math.floor(hour))); return { DNI: WX.DNI[i], DHI: WX.DHI[i], GHI: WX.GHI[i], T: WX.T[i], i }; }
function weekday(doy) { return ((doy - 1 + 3) % 7) < 5; } // 2026-01-01 목요일 기준
function label3(text, color = '#1E2A38', size = 64) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.font = `600 ${size}px IBM Plex Mono, monospace`; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); sp.scale.set(40, 20, 1); return sp;
}

/* ================= 1. 대상지 3D ================= */
const SITE = {};
function buildSite(el) {
  const W = el.clientWidth, H = el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(W, H);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xF7F6F2);
  const cam = new THREE.PerspectiveCamera(40, W / H, 1, 5000);
  const det = BLD.buildings.filter(b => b.role === 'detailed');
  const cen = det.reduce((a, b) => { const c = b.xy.reduce((s, p) => [s[0] + p[0] / b.xy.length, s[1] + p[1] / b.xy.length], [0, 0]); return [a[0] + c[0] / det.length, a[1] + c[1] / det.length]; }, [0, 0]);
  const root = new THREE.Group(); root.position.set(-cen[0], 0, cen[1]); scene.add(root);
  cam.position.set(-520, 520, 620); const ctl = new OrbitControls(cam, renderer.domElement); ctl.target.set(0, 40, 0); ctl.maxPolarAngle = Math.PI * 0.495; ctl.update();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xD8D4CC, 0.85));
  const sunL = new THREE.DirectionalLight(0xFFF3E0, 1.6); sunL.castShadow = true;
  sunL.shadow.mapSize.set(4096, 4096); Object.assign(sunL.shadow.camera, { left: -480, right: 480, top: 480, bottom: -480, near: 10, far: 2000 }); sunL.shadow.bias = -0.0004;
  scene.add(sunL); scene.add(sunL.target);
  // ground + mesh grid
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: COL.ground }));
  gnd.rotation.x = -Math.PI / 2; gnd.receiveShadow = true; scene.add(gnd);
  const grid = new THREE.GridHelper(1600, 80, 0xC9CDD2, 0xDDE0E3); grid.position.y = 0.2; scene.add(grid);
  // buildings
  const mats = { context: new THREE.MeshLambertMaterial({ color: COL.ctx }), target: new THREE.MeshLambertMaterial({ color: COL.tgt }), detailed: new THREE.MeshLambertMaterial({ color: COL.kin }) };
  const edgeM = new THREE.LineBasicMaterial({ color: COL.ink, transparent: true, opacity: 0.55 });
  SITE.meshes = []; SITE.ctxGroup = new THREE.Group(); root.add(SITE.ctxGroup);
  BLD.buildings.forEach(b => {
    const sh = new THREE.Shape(b.xy.map(p => new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: b.h, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mats[b.role]); m.castShadow = true; m.receiveShadow = true; m.userData = b;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeM);
    const g = new THREE.Group(); g.add(m); g.add(e);
    (b.role === 'context' ? SITE.ctxGroup : root).add(g); SITE.meshes.push(m);
  });
  // labels for detailed
  det.forEach(b => { const c = b.xy.reduce((s, p) => [s[0] + p[0] / b.xy.length, s[1] + p[1] / b.xy.length], [0, 0]); const lb = label3(b.sim, '#B23A0E', 56); lb.position.set(c[0], b.h + 18, -c[1]); root.add(lb); });
  // sun path dome
  const R = 430; SITE.R = R; const dome = new THREE.Group(); scene.add(dome); SITE.dome = dome;
  const ring = (r, y, col, op = 1) => { const pts = []; for (let a = 0; a <= 360; a += 3) pts.push(new THREE.Vector3(r * Math.sin(a * Math.PI / 180), y, -r * Math.cos(a * Math.PI / 180))); return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: op < 1, opacity: op })); };
  dome.add(ring(R, 0.5, COL.ink));
  [30, 60].forEach(alt => { const a = alt * Math.PI / 180; dome.add(ring(R * Math.cos(a), R * Math.sin(a), COL.mesh, 0.45)); });
  for (let az = 0; az < 360; az += 15) { const r1 = az % 90 === 0 ? R + 26 : R + 12, a = az * Math.PI / 180; dome.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(R * Math.sin(a), 0.5, -R * Math.cos(a)), new THREE.Vector3(r1 * Math.sin(a), 0.5, -r1 * Math.cos(a))]), new THREE.LineBasicMaterial({ color: COL.ink }))); }
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, az]) => { const s = label3(t, t === 'N' ? '#E8541E' : '#1E2A38', 72); const a = az * Math.PI / 180; s.position.set((R + 52) * Math.sin(a), 8, -(R + 52) * Math.cos(a)); dome.add(s); });
  const toV = (alt, az, r = R) => { const v = S.sunVec(alt, az); return new THREE.Vector3(r * v[0], r * v[2], -r * v[1]); };
  SITE.toV = toV;
  const dayLine = (doy, col, op) => { const pts = []; for (let h = 0; h <= 24; h += 0.1) { const p = S.sunPos(doy, h); if (p.alt > -1) pts.push(toV(Math.max(0, p.alt), p.az)); } return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op })); };
  [[172, 0xE8541E, .45], [80, COL.mesh, .7], [356, COL.ink, .6]].forEach(([d, c, o]) => dome.add(dayLine(d, c, o)));
  for (let h = 5; h <= 19; h++) { const pts = []; for (let d = 1; d <= 366; d += 5) { const p = S.sunPos(Math.min(365, d), h); if (p.alt > 0) pts.push(toV(p.alt, p.az)); } if (pts.length > 2) dome.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: COL.mesh, transparent: true, opacity: .45 }))); }
  SITE.sel = null;
  const sun = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 16), new THREE.MeshBasicMaterial({ color: COL.sun })); scene.add(sun);
  const halo = new THREE.Mesh(new THREE.RingGeometry(16, 19, 40), new THREE.MeshBasicMaterial({ color: COL.sun, side: THREE.DoubleSide })); scene.add(halo);
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: COL.sun, dashSize: 8, gapSize: 6 })); scene.add(ray);
  Object.assign(SITE, { renderer, scene, cam, ctl, sunL, sun, halo, ray, root, el, cen });
  const onR = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  new ResizeObserver(onR).observe(el);
  const loop = () => { requestAnimationFrame(loop); if (state.playing && SITE.visible) { state.hour += 0.04; if (state.hour > 20.5) state.hour = 5; syncTime(); } if (SITE.visible) renderer.render(scene, cam); };
  loop();
}
function zoneSamples() { // 상세 3개 동의 입면 4 × 층대 5 표본점(등가 직사각형)
  const F = { ARK: [24, [1, 8, 7, 7, 1]], GFC: [45, [1, 15, 14, 14, 1]], GST: [38, [1, 12, 12, 12, 1]] };
  const out = [];
  TG.targets.filter(t => t.role === 'detailed').forEach(t => {
    const b = BLD.buildings.find(x => x.id === t.osm); const c = b.xy.reduce((s, p) => [s[0] + p[0] / b.xy.length, s[1] + p[1] / b.xy.length], [0, 0]);
    const a = t.ang * Math.PI / 180, ux = [Math.cos(a), Math.sin(a)], uy = [-Math.sin(a), Math.cos(a)];
    const faces = [[uy, t.eqW / 2], [[-uy[0], -uy[1]], t.eqW / 2], [ux, t.eqL / 2], [[-ux[0], -ux[1]], t.eqL / 2]];
    const [nf, bands] = F[t.sim], fh = t.height / nf; let f0 = 0;
    bands.forEach((n, bi) => { const z = (f0 + n / 2) * fh; f0 += n;
      faces.forEach(([nv, d]) => { const az = ((Math.atan2(nv[0], nv[1]) * 180 / Math.PI) + 360) % 360; out.push({ sim: t.sim, band: bi, az, p: new THREE.Vector3(c[0] + nv[0] * (d + 1.5), z, -(c[1] + nv[1] * (d + 1.5))), n: [nv[0], nv[1]] }); }); });
  });
  return out;
}
function updateSite() {
  if (!SITE.renderer) return;
  const p = S.sunPos(state.doy, state.hour), up = p.alt > 0;
  const v = SITE.toV(Math.max(-2, p.alt), p.az);
  SITE.sun.position.copy(v); SITE.halo.position.copy(v); SITE.halo.lookAt(SITE.cam.position);
  SITE.sun.visible = SITE.halo.visible = up;
  SITE.ray.geometry.setFromPoints([new THREE.Vector3(0, 0, 0), v]); SITE.ray.computeLineDistances(); SITE.ray.visible = up;
  const L = SITE.toV(Math.max(1, p.alt), p.az, 900); SITE.sunL.position.copy(L); SITE.sunL.target.position.set(0, 0, 0);
  SITE.sunL.intensity = up ? 0.6 + 1.2 * Math.min(1, p.alt / 40) : 0; SITE.sunL.castShadow = up && $('#s-shadow').checked;
  // selected day path
  if (SITE.sel) { SITE.dome.remove(SITE.sel); SITE.sel.geometry.dispose(); }
  const pts = []; for (let h = 0; h <= 24; h += 0.1) { const q = S.sunPos(state.doy, h); if (q.alt > 0) pts.push(SITE.toV(q.alt, q.az)); }
  if (pts.length > 2) { SITE.sel = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 1.6, 6, false), new THREE.MeshBasicMaterial({ color: COL.sun })); SITE.dome.add(SITE.sel); }
  // HUD
  const w = wxAt(state.doy, state.hour), rs = S.sunriseSet(state.doy);
  $('#s-hud').innerHTML = `<b>${dateLabel(state.doy)} ${S.fmtH(state.hour)}</b> KST<br>고도 ${p.alt.toFixed(1)}° · 방위 ${p.az.toFixed(1)}°<br>일출 ${S.fmtH(rs.rise)} · 일몰 ${S.fmtH(rs.set)}<br>TMYx DNI ${w.DNI} · DHI ${w.DHI} W/m²<br>기온 ${w.T} °C`;
  // zone sunlit (raycast against neighbours)
  if (!SITE.zones) SITE.zones = zoneSamples();
  const rc = new THREE.Raycaster(); const dir = new THREE.Vector3(...[S.sunVec(p.alt, p.az)].map(s => [s[0], s[2], -s[1]])[0]).normalize();
  const cnt = { ARK: 0, GFC: 0, GST: 0 }, faceOK = { ARK: 0, GFC: 0, GST: 0 };
  if (up && w.DNI > 0) {
    SITE.root.updateMatrixWorld(true);
    SITE.zones.forEach(z => {
      const sv = S.sunVec(p.alt, p.az); const cosi = sv[0] * z.n[0] + sv[1] * z.n[1]; if (cosi <= 0.02) return; faceOK[z.sim]++;
      const o = z.p.clone().add(SITE.root.position); rc.set(o, dir); rc.far = 2000;
      const hit = rc.intersectObjects(SITE.meshes.filter(m => m.visible && m.userData.sim !== z.sim), false);
      if (!hit.length) cnt[z.sim]++;
    });
  }
  $('#s-zones').innerHTML = ['ARK', 'GFC', 'GST'].map(k => `<div><span>${k} 직달 일사 구역</span><b>${cnt[k]} / 20</b></div>`).join('') + `<div><span>태양을 향한 구역 중 가려짐</span><b>${['ARK', 'GFC', 'GST'].reduce((s, k) => s + faceOK[k] - cnt[k], 0)}</b></div>`;
}

/* ================= 2. 키네틱 외피 모듈 ================= */
const MOD = {};
function facadeOptions() {
  const opts = [];
  TG.targets.filter(t => t.role === 'detailed').forEach(t => {
    const a = t.ang;
    const az = d => (((90 - d) % 360) + 360) % 360; // xy 각도(동=0, 반시계) → 방위(북=0, 시계)
    [[a + 90, '장변'], [a - 90, '장변'], [a, '단변'], [a + 180, '단변']].forEach(([d, s]) => { const A = az(d); const nm = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round(A / 45) % 8]; opts.push({ k: `${t.sim}-${Math.round(A)}`, A, label: `${t.sim} · ${nm}향 ${s} (${Math.round(A)}°)` }); });
  });
  return opts.sort((p, q) => p.k.localeCompare(q.k));
}
function buildModule(el) {
  const W = el.clientWidth, H = el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(W, H); el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xF7F6F2);
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.05, 200); const R = S.ROOM;
  cam.position.set(R.W / 2 - 5.5, 6.2, -R.D - 6.5); const ctl = new OrbitControls(cam, renderer.domElement); ctl.target.set(R.W / 2, 1.0, -R.D / 2 + 0.6); ctl.update();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xCFCBC2, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(-4, 8, -6); scene.add(dl);
  const wallM = new THREE.MeshLambertMaterial({ color: 0xF4F3EF, side: THREE.DoubleSide }), frameM = new THREE.MeshLambertMaterial({ color: COL.ink });
  const g = new THREE.Group(); scene.add(g);
  // floor with heatmap texture
  const cv = document.createElement('canvas'); cv.width = 240; cv.height = 180; const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.W, R.D), new THREE.MeshBasicMaterial({ map: tex })); floor.rotation.x = -Math.PI / 2; floor.position.set(R.W / 2, 0.001, -R.D / 2); g.add(floor);
  // facade wall with opening (z = 0)
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  box(R.W + .3, R.sill, .25, R.W / 2, R.sill / 2, .125, wallM); box(R.W + .3, R.H - R.head + .3, .25, R.W / 2, (R.head + R.H + .3) / 2, .125, wallM);
  box(.15, R.H + .3, .25, -.075, (R.H + .3) / 2, .125, wallM); box(.15, R.H + .3, .25, R.W + .075, (R.H + .3) / 2, .125, wallM);
  // side walls (transparent) & outline
  const side = new THREE.MeshLambertMaterial({ color: 0xE9E7E1, transparent: true, opacity: .35, side: THREE.DoubleSide });
  const sw = new THREE.Mesh(new THREE.PlaneGeometry(R.D, R.H), side); sw.rotation.y = Math.PI / 2; sw.position.set(0, R.H / 2, -R.D / 2); g.add(sw);
  const sw2 = sw.clone(); sw2.position.x = R.W; g.add(sw2);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(R.W, R.H, R.D)), new THREE.LineBasicMaterial({ color: COL.ink })); outline.position.set(R.W / 2, R.H / 2, -R.D / 2); g.add(outline);
  // mullions + glass
  for (let i = 1; i < 4; i++) box(.025, R.head - R.sill, .05, i * R.W / 4, (R.sill + R.head) / 2, .04, new THREE.MeshLambertMaterial({ color: 0x6B7480 }));
  const glassM = new THREE.MeshPhongMaterial({ color: 0x9FB6C3, transparent: true, opacity: .22, side: THREE.DoubleSide, shininess: 90 });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(R.W, R.head - R.sill), glassM); glass.position.set(R.W / 2, (R.sill + R.head) / 2, .06); g.add(glass);
  // exterior mesh grid frame (signature)
  const meshFrame = new THREE.Group(); g.add(meshFrame);
  const lm = new THREE.LineBasicMaterial({ color: COL.mesh, transparent: true, opacity: .5 }); const pts = [];
  for (let x = 0; x <= R.W + 1e-6; x += 0.3) pts.push(new THREE.Vector3(x, 0, .75), new THREE.Vector3(x, R.H + .3, .75));
  for (let y = 0; y <= R.H + .31; y += 0.3) pts.push(new THREE.Vector3(0, y, .75), new THREE.Vector3(R.W, y, .75));
  meshFrame.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lm));
  // device group
  const dev = new THREE.Group(); g.add(dev);
  // sun rays
  const rays = new THREE.Group(); scene.add(rays);
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(.35, 20, 14), new THREE.MeshBasicMaterial({ color: COL.sun })); scene.add(sunBall);
  // workplane label
  Object.assign(MOD, { renderer, scene, cam, ctl, cv, tex, dev, rays, sunBall, glassM, el });
  new ResizeObserver(() => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }).observe(el);
  const loop = () => { requestAnimationFrame(loop); if (MOD.visible) renderer.render(scene, cam); }; loop();
}
function drawDevice(st) {
  const R = S.ROOM, dev = MOD.dev; while (dev.children.length) { const c = dev.children.pop(); c.geometry && c.geometry.dispose(); }
  const mK = new THREE.MeshLambertMaterial({ color: st.active ? COL.kin : 0xC7CCD2 }), mE = new THREE.LineBasicMaterial({ color: COL.ink });
  const add = (geo, x, y, z, rx = 0, ry = 0) => { const m = new THREE.Mesh(geo, mK); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); dev.add(m); const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mE); e.position.copy(m.position); e.rotation.copy(m.rotation); dev.add(e); };
  if (st.dev === 'blind80' || st.dev === 'louver300') {
    const g = S.DEV[st.dev], z0 = st.dev === 'blind80' ? .14 : .32;
    if (!st.present) { add(new THREE.BoxGeometry(R.W, .16, .12), R.W / 2, R.head + .1, z0); return; }
    const geo = new THREE.BoxGeometry(R.W, .006, g.w), n = Math.floor((R.head - R.sill) / g.s);
    for (let k = 0; k < n; k++) { const y = R.head - (k + .5) * g.s; add(geo, R.W / 2, y, z0 + g.w / 2 * Math.cos(st.beta * Math.PI / 180) * 0, st.beta * Math.PI / 180); }
  } else if (st.dev === 'fin300') {
    if (!st.present) return; const g = S.DEV.fin300, geo = new THREE.BoxGeometry(.008, R.head - R.sill + .2, g.w), n = Math.floor(R.W / g.s);
    for (let k = 0; k <= n; k++) add(geo, k * g.s, (R.sill + R.head) / 2, .32, 0, (st.beta || 0) * Math.PI / 180 * (st.gammaH > 0 ? -1 : 1));
  }
}
function heatColor(E) { // UDI 구간 색: <100 남색 계열, 100–2000 황색 그라데이션, >2000 주황
  if (E < 100) { const t = E / 100; return [Math.round(40 + 120 * t), Math.round(54 + 110 * t), Math.round(72 + 100 * t)]; }
  if (E <= 2000) { const t = Math.log(E / 100) / Math.log(20); return [Math.round(251 - 9 * t), Math.round(236 - 57 * t), Math.round(196 - 135 * t)]; }
  const t = Math.min(1, Math.log(E / 2000) / Math.log(10)); return [Math.round(240 - 8 * t), Math.round(122 - 38 * t), Math.round(62 - 32 * t)];
}
function moduleCalc(doy, hour, A, mode, T, nx, nz, np) {
  const p = S.sunPos(doy, hour - 0.0), w = wxAt(doy, hour), sv = S.sunVec(p.alt, p.az), sl = S.toFacade(sv, A);
  if (p.alt <= 0) { w.DNI = 0; }
  const ew = (A > 45 && A < 135) || (A > 225 && A < 315);
  const st = S.facadeState(sl, w, A, mode, { month: S.doyToDate(doy).m, T, weekday: weekday(doy), hour, ew });
  const r = S.roomGrid(sl, w, st, nx, nz, np[0], np[1]);
  return { p, w, sl, st, r };
}
function updateModule() {
  if (!MOD.renderer) return;
  const A = +$('#m-face').value, mode = $('#m-mode').value, T = +$('#m-T').value;
  $('#m-Tv').textContent = `${T} W/m²`;
  const { p, w, sl, st, r } = moduleCalc(state.doy, state.hour, A, mode, T, 40, 30, [16, 8]);
  // heatmap
  const g = MOD.cv.getContext('2d'), cw = MOD.cv.width / r.nx, ch = MOD.cv.height / r.nz;
  let udi = 0, hi = 0, dir = 0;
  for (let j = 0; j < r.nz; j++) for (let i = 0; i < r.nx; i++) {
    const E = r.E[j * r.nx + i], c = heatColor(E); if (E >= 100 && E <= 2000) udi++; if (E > 2000) hi++; if (r.direct[j * r.nx + i]) dir++;
    g.fillStyle = `rgb(${c})`; g.fillRect(i * cw, (r.nz - 1 - j) * ch, cw + .5, ch + .5);
    if (r.direct[j * r.nx + i]) { g.fillStyle = 'rgba(232,84,30,.28)'; g.fillRect(i * cw, (r.nz - 1 - j) * ch, cw + .5, ch + .5); }
  }
  g.strokeStyle = 'rgba(30,42,56,.25)'; g.lineWidth = 1; for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(i * MOD.cv.width / 6, 0); g.lineTo(i * MOD.cv.width / 6, MOD.cv.height); g.stroke(); }
  for (let j = 0; j <= 4; j++) { g.beginPath(); g.moveTo(0, j * MOD.cv.height / 4); g.lineTo(MOD.cv.width, j * MOD.cv.height / 4); g.stroke(); }
  MOD.tex.needsUpdate = true;
  drawDevice(st);
  const vt = S.GLASS.VT + (S.GLASS.VT_tint - S.GLASS.VT) * (r.tint || 0);
  MOD.glassM.color.setRGB(0.62 - 0.3 * (r.tint || 0), 0.71 - 0.25 * (r.tint || 0), 0.76 - 0.1 * (r.tint || 0)); MOD.glassM.opacity = 0.22 + 0.5 * (r.tint || 0);
  // sun & rays (local room coords: x=sl0, y=sl1, z=sl2)
  while (MOD.rays.children.length) MOD.rays.children.pop();
  const R = S.ROOM, sunUp = p.alt > 0 && sl[2] > 0 && sl[1] > 0;
  MOD.sunBall.visible = p.alt > 0;
  if (p.alt > 0) MOD.sunBall.position.set(R.W / 2 + sl[0] * 9, R.head + sl[1] * 9, sl[2] * 9);
  if (sunUp && w.DNI > 0) {
    const m = new THREE.LineDashedMaterial({ color: COL.sun, dashSize: .18, gapSize: .12 });
    for (let k = 0; k < 4; k++) for (let q = 0; q < 2; q++) {
      const x0 = .6 + k * (R.W - 1.2) / 3, y0 = R.sill + .2 + q * (R.head - R.sill - .4);
      const a = new THREE.Vector3(x0 + sl[0] * 4, y0 + sl[1] * 4, sl[2] * 4), b = new THREE.Vector3(x0, y0, 0);
      const t = (y0 - R.wp) / sl[1]; const c = new THREE.Vector3(x0 - sl[0] * t, R.wp, -sl[2] * t);
      const L = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b, c.z > -R.D ? c : b]), m); L.computeLineDistances(); MOD.rays.add(L);
    }
  }
  const n = r.nx * r.nz, stTxt = st.dev == null ? '장치 없음' : st.dev === 'ec' ? (r.tint > 0.01 ? `착색 ${(r.tint * 100).toFixed(0)}%` : '투명') : !st.present ? (st.dev === 'fin300' ? '해당 입면 없음(남·북)' : '수납(걷어 올림)') : `슬랫 ${st.beta.toFixed(0)}°${st.active ? ' · 작동' : ''}`;
  $('#m-hud').innerHTML = `<b>${S.MODES[mode].label}</b><br>입면 방위 ${A.toFixed(0)}° · ${dateLabel(state.doy)} ${S.fmtH(state.hour)}<br>상태: ${stTxt}`;
  $('#m-read').innerHTML = [
    ['창면 입사 일사', `${Math.round(st.Iwin)} W/m²`], ['입사각', sl[2] > 0 && p.alt > 0 ? `${(Math.acos(Math.min(1, sl[2])) * 180 / Math.PI).toFixed(0)}°` : '태양이 뒤쪽'],
    ['프로파일각', st.phi == null ? '—' : `${st.phi.toFixed(1)}°`], ['컷오프 슬랫각', st.cut == null ? '—' : `${st.cut.toFixed(1)}°`],
    ['가시광 투과율', vt.toFixed(3)], ['기준점 조도(창에서 3 m)', `${Math.round(r.ref).toLocaleString()} lx`],
    ['UDI 100–2,000 lx', `${(100 * udi / n).toFixed(0)}% 면적`], ['2,000 lx 초과', `${(100 * hi / n).toFixed(0)}% 면적`],
    ['직달 일사 유입', `${(100 * dir / n).toFixed(0)}% 면적`], ['평균 작업면 조도', `${Math.round(r.mean).toLocaleString()} lx`], ['TMYx DNI · DHI', `${w.DNI} · ${w.DHI} W/m²`]
  ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
}
/* ---------- 연간 계산 ---------- */
async function annual() {
  const A = +$('#m-face').value, T = +$('#m-T').value, out = $('#m-annual'), btn = $('#m-run'); btn.disabled = true;
  const modes = ['none', 'F0', 'S2', 'S3', 'BT', 'LT', 'VF', 'EC_DLS', 'EC_DL', 'EC_SOL'];
  const occ = []; for (let d = 1; d <= 365; d++) if (weekday(d)) for (let h = 8; h < 18; h++) occ.push([d, h + 0.5]);
  const res = {};
  // 월 × 시각 창면 일사 평균과 작동 비율(선택 제어)
  const sel = $('#m-mode').value, irr = Array.from({ length: 12 }, () => new Float64Array(24)), act = Array.from({ length: 12 }, () => new Float64Array(24)), cnt = Array.from({ length: 12 }, () => new Float64Array(24));
  for (let d = 1; d <= 365; d++) for (let h = 0; h < 24; h++) {
    const p = S.sunPos(d, h + .5), w = wxAt(d, h + .5); if (p.alt <= 0) w.DNI = 0; const sl = S.toFacade(S.sunVec(p.alt, p.az), A), m = S.doyToDate(d).m - 1;
    const ew = (A > 45 && A < 135) || (A > 225 && A < 315);
    const st = S.facadeState(sl, w, A, sel, { month: m + 1, T, weekday: weekday(d), hour: h + .5, ew });
    irr[m][h] += st.Iwin; act[m][h] += st.active ? 1 : 0; cnt[m][h]++;
  }
  for (const mode of modes) {
    out.innerHTML = `<p class="mono" style="font-size:12px">계산 중… ${S.MODES[mode].label}</p>`; await new Promise(r => setTimeout(r, 15));
    let udi = 0, sun = 0, hiS = 0, act2 = 0, refU = 0, refLo = 0;
    for (const [d, h] of occ) {
      const { st, r } = moduleCalc(d, h, A, mode, T, 8, 6, [8, 4]); let u = 0, s = 0, hh = 0;
      for (let k = 0; k < r.E.length; k++) { const E = r.E[k]; if (E >= 100 && E <= 2000) u++; if (E > 2000) hh++; if (r.direct[k]) s++; }
      udi += u / r.E.length; hiS += hh / r.E.length; if (r.ref >= 100 && r.ref <= 2000) refU++; if (r.ref < 100) refLo++; sun += s > 0 ? 1 : 0; act2 += st.active ? 1 : 0;
    }
    res[mode] = { udi: 100 * udi / occ.length, hi: 100 * hiS / occ.length, sun, act: act2, ref: 100 * refU / occ.length, lo: 100 * refLo / occ.length };
  }
  btn.disabled = false;
  const hm = (M, mx, col) => { const c = document.createElement('canvas'); c.width = 24 * 14; c.height = 12 * 14; const g = c.getContext('2d');
    for (let m = 0; m < 12; m++) for (let h = 0; h < 24; h++) { const v = cnt[m][h] ? M[m][h] / cnt[m][h] : 0, t = Math.min(1, v / mx); g.fillStyle = col(t); g.fillRect(h * 14, m * 14, 14, 14); }
    return c.toDataURL(); };
  const orange = t => `rgb(${Math.round(255 - 23 * t)},${Math.round(255 - 171 * t)},${Math.round(255 - 225 * t)})`, amber = t => `rgb(${Math.round(255 - 13 * t)},${Math.round(255 - 76 * t)},${Math.round(255 - 194 * t)})`;
  out.innerHTML = `<div class="grid g2"><div><h3 style="margin:.2em 0">월 × 시각 평균 창면 일사 (0–600 W/m²)</h3><img class="heat" src="${hm(irr, 600, orange)}"><div class="mono" style="font-size:11px;display:flex;justify-content:space-between"><span>0시</span><span>12시</span><span>24시 · 행: 1→12월</span></div></div>
<div><h3 style="margin:.2em 0">작동 비율 — ${S.MODES[sel].label}</h3><img class="heat" src="${hm(act, 1, amber)}"><div class="mono" style="font-size:11px">흰색 0% → 황색 100% · 일사 기준 ${T} W/m²</div></div></div>
<div class="scroll" style="max-height:none;margin-top:10px"><table class="tbl"><thead><tr><th>제어</th><th>UDI 100–2,000 lx<br>(기준점, 시간 비율)</th><th>기준점 100 lx 미만</th><th>UDI 면적·시간 평균</th><th>2,000 lx 초과 면적</th><th>직달 일사 유입 시간</th><th>작동 시간</th></tr></thead><tbody>
${modes.map(m => `<tr ${m === sel ? 'style="background:#FFF6E3"' : ''}><td>${S.MODES[m].label}</td><td class="num"><b>${res[m].ref.toFixed(1)}%</b></td><td class="num">${res[m].lo.toFixed(1)}%</td><td class="num">${res[m].udi.toFixed(1)}%</td><td class="num">${res[m].hi.toFixed(1)}%</td><td class="num">${res[m].sun} h</td><td class="num">${res[m].act} h</td></tr>`).join('')}</tbody></table></div>
<div class="note">재실 시간(평일 08–18시, 2,610시간)·작업면 0.8 m 기준의 단순 근사입니다. 기준점은 논문의 EnergyPlus 주광 기준점과 같은 위치(창에서 3 m, 중앙)입니다. 반사·주변 건물 차폐·프레임은 단순화했으며 EnergyPlus 결과(논문 표 6-7)와 값이 다릅니다. 경향 비교용으로만 쓰십시오.</div>`;
}

/* ================= UI ================= */
function syncTime() {
  $$('.t-doy').forEach(i => i.value = state.doy); $$('.t-hour').forEach(i => i.value = state.hour);
  $$('.t-dlab').forEach(s => s.textContent = dateLabel(state.doy)); $$('.t-hlab').forEach(s => s.textContent = S.fmtH(state.hour));
  if (SITE.visible) updateSite(); if (MOD.visible) updateModule();
}
function timeCtl() {
  return `<label class="ctl">날짜 <b class="t-dlab"></b></label><input type="range" class="t-doy" min="1" max="365" step="1">
<div class="row" style="gap:4px;margin-top:4px">${[['춘분', 80], ['하지', 172], ['피크일 7/31', 212], ['추분', 266], ['동지', 356]].map(([t, d]) => `<button class="btn ghost" style="padding:4px 7px;font-size:11.5px" data-doy="${d}">${t}</button>`).join('')}</div>
<label class="ctl">시각 (KST) <b class="t-hlab"></b></label><input type="range" class="t-hour" min="4" max="21" step="0.25">`;
}
function ui(page) {
  page.innerHTML = `<div class="kicker">Simulation · 역삼 블록</div><h1 style="font-size:28px">시뮬레이션</h1>
<p style="color:var(--ink2);margin-top:-4px">태양 위치와 서울 TMYx 기상(2011–2025)으로 대상지의 그림자와 키네틱 외피의 작동을 직접 바꿔 보는 도구입니다. 논문의 EnergyPlus 결과는 <a href="#/results">결과 데이터</a>에 있습니다.</p>
<div class="tabs" id="stabs"><button class="on" data-p="sp1"><span class="mono">01</span>대상지 3D · 태양 경로</button><button data-p="sp2"><span class="mono">02</span>키네틱 외피 모듈 · 실내 조도</button></div>
<div class="pane on" id="sp1"><div class="simwrap"><div class="simside">${timeCtl()}
<div class="row" style="margin-top:10px"><button class="btn sun" id="s-play">▶ 하루 재생</button></div>
<label class="ctl" style="margin-top:14px">표시</label>
<label class="chk"><input type="checkbox" id="s-shadow" checked>그림자</label><label class="chk"><input type="checkbox" id="s-ctx" checked>주변 건물(차폐 입력)</label><label class="chk"><input type="checkbox" id="s-dome" checked>태양 경로 돔</label>
<label class="ctl" style="margin-top:14px">상세 3개 동 · 구역(입면 4 × 층대 5) 중 직달 일사</label><div class="readout" id="s-zones"></div>
<div class="note">구역 판정(L3)은 이렇게 시각마다 주변 건물에 가리는지를 따져 재실 시간 중 직달 일사 비율 fb를 구한 것입니다. 표본점은 등가 직사각형 입면 중앙입니다.</div>
<div class="legend-row"><span><i style="background:#F2B33D"></i>상세 3개 동</span><span><i style="background:#B7BDC5"></i>다수 건물</span><span><i style="background:#DADDE1"></i>주변 건물</span><span><i style="background:#E8541E"></i>태양·경로</span></div>
</div><div class="simview" id="s-view"><div class="hud" id="s-hud"></div><div class="hud2">드래그: 회전 · 휠: 확대 · 우클릭: 이동<br>© OpenStreetMap contributors</div></div></div></div>
<div class="pane" id="sp2"><div class="simwrap"><div class="simside">${timeCtl()}
<label class="ctl">입면 (상세 3개 동, 등가 직사각형)</label><select id="m-face" style="width:100%"></select>
<label class="ctl">제어 방식</label><select id="m-mode" style="width:100%">${Object.entries(S.MODES).map(([k, v]) => `<option value="${k}" ${k === 'BT' ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
<label class="ctl">일사 기준(BT·LT·EC 일사) <b id="m-Tv"></b></label><input type="range" id="m-T" min="200" max="400" step="50" value="300">
<div class="readout" id="m-read"></div>
<label class="ctl" style="margin-top:12px">작업면 조도 색</label><div class="scale">${[30, 80, 150, 400, 900, 1600, 3000, 8000].map(v => `<i style="background:rgb(${heatColor(v)})"></i>`).join('')}</div><div class="mono" style="font-size:10.5px;display:flex;justify-content:space-between"><span>&lt;100</span><span>100–2,000 lx (UDI)</span><span>&gt;2,000</span></div>
<div class="note">외주부 존(폭 6 m, 깊이 4.57 m, 천장 2.74 m, 창면적비 40%, 가시광 투과율 0.305)의 단순 근사입니다. 하늘·지면 확산, 직달, 내부 반사(분할 플럭스)만 다룹니다.</div>
</div><div class="simview" id="m-view"><div class="hud" id="m-hud"></div><div class="hud2">바닥 색 = 작업면 조도 · 주황 빗금 = 직달 일사<br>점선 = 태양 광선</div></div></div>
<div class="card" style="margin-top:14px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">연간 지도 — 선택한 입면에서 제어 방식 비교</h3><button class="btn sun" id="m-run">연간 계산 (약 5–15초)</button></div><div id="m-annual" style="margin-top:10px"><p style="font-size:13px;color:var(--muted)">버튼을 누르면 8,760시간의 창면 일사·작동 비율과 재실 시간 2,610시간의 조도 지표를 계산합니다.</p></div></div></div>`;
}
async function mount() {
  const page = $('#page-sim');
  if (!mounted) {
    mounted = true; page.innerHTML = '<p class="mono">불러오는 중…</p>';
    [WX, BLD, TG] = await Promise.all([A.load('weather'), A.load('buildings'), A.load('targets50')]);
    ui(page);
    $('#m-face').innerHTML = facadeOptions().map(o => `<option value="${o.A}" ${o.k.startsWith('ARK') && Math.abs(o.A - 248) < 10 ? 'selected' : ''}>${o.label}</option>`).join('');
    if (!$('#m-face').value || !$('#m-face').selectedOptions.length) $('#m-face').selectedIndex = 0;
    $$('#stabs button').forEach(b => b.onclick = () => { $$('#stabs button').forEach(x => x.classList.toggle('on', x === b)); $$('#page-sim .pane').forEach(p => p.classList.toggle('on', p.id === b.dataset.p)); show(); });
    $$('.t-doy').forEach(i => i.oninput = () => { state.doy = +i.value; syncTime(); });
    $$('.t-hour').forEach(i => i.oninput = () => { state.hour = +i.value; syncTime(); });
    $$('[data-doy]').forEach(b => b.onclick = () => { state.doy = +b.dataset.doy; syncTime(); });
    $('#s-play').onclick = () => { state.playing = !state.playing; $('#s-play').textContent = state.playing ? '❚❚ 정지' : '▶ 하루 재생'; };
    $('#s-shadow').onchange = updateSite; $('#s-ctx').onchange = () => { SITE.ctxGroup.visible = $('#s-ctx').checked; SITE.meshes.forEach(m => { if (m.userData.role === 'context') m.visible = $('#s-ctx').checked; }); updateSite(); };
    $('#s-dome').onchange = () => { SITE.dome.visible = $('#s-dome').checked; };
    ['m-face', 'm-mode'].forEach(id => $('#' + id).onchange = updateModule); $('#m-T').oninput = updateModule;
    $('#m-run').onclick = annual;
  }
  show();
}
function show() {
  const on = id => $('#' + id) && $('#' + id).classList.contains('on');
  SITE.visible = on('sp1') && $('#page-sim').classList.contains('on'); MOD.visible = on('sp2') && $('#page-sim').classList.contains('on');
  if (SITE.visible && !SITE.renderer) buildSite($('#s-view'));
  if (MOD.visible && !MOD.renderer) buildModule($('#m-view'));
  syncTime();
}
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/sim')) { SITE.visible = false; MOD.visible = false; state.playing = false; } });
window.SIM = { mount };
if (location.hash.startsWith('#/sim')) mount();
