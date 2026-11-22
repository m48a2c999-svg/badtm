# -*- coding: utf-8 -*-
"""3권역 OSM 자료 → 후보 건물 특성표 (2026-11-01, 역삼 257동과 같은 정의)
입력: badtm_osm_{ybd,gbd,cbd}.json (사이트 자료 생성기로 받은 OSM 자료)
출력: candidates_{권역}.csv — 가구 안 건물 가운데 OSM 층수 태그가 6층 이상이거나 높이 ≥ 20 m인 건물의 기하·밀집 특성
      (건축물대장 결합 전 1차 후보. 용도·층수·연면적은 건축물대장으로 확정해야 함)
정의(역삼 257동 t7_features_sb.py와 동일): 등가 직사각형 = 최소 면적 외접 직사각형의 방위·비율, 면적은 윤곽 면적;
  높이 = OSM height, 없으면 층수 × 3.6 m; 주변 건물 = 중심 간 350 m 이내이고 높이/거리 ≥ 0.2;
  가려진 정도(obstr_mean) = 16개 방위 구간에서 중심(중간 높이)에서 본 주변 건물의 최대 앙각의 평균(350 m 이내).
"""
import json, math, sys, os, csv
import numpy as np

D = sys.argv[1] if len(sys.argv) > 1 else '.'

def to_m(lat0, lon0):
    kx = 111320 * math.cos(math.radians(lat0)); ky = 110574
    return lambda lon, lat: np.array([(lon - lon0) * kx, (lat - lat0) * ky])

def poly_area(p):
    x, y = p[:, 0], p[:, 1]; return 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))

def centroid(p):
    x, y = p[:, 0], p[:, 1]; a = np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))
    if abs(a) < 1e-9: return p.mean(axis=0)
    cx = np.sum((x + np.roll(x, -1)) * (x * np.roll(y, -1) - np.roll(x, -1) * y)) / (3 * a)
    cy = np.sum((y + np.roll(y, -1)) * (x * np.roll(y, -1) - np.roll(x, -1) * y)) / (3 * a)
    return np.array([cx, cy])

def hull(pts):
    pts = sorted(set(map(tuple, pts)))
    if len(pts) < 3: return np.array(pts)
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo = []; up = []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return np.array(lo[:-1] + up[:-1])

def eq_rect(p):
    h = hull(p); best = None
    for i in range(len(h)):
        e = h[(i + 1) % len(h)] - h[i]; ang = math.atan2(e[1], e[0])
        c, s = math.cos(-ang), math.sin(-ang); R = np.array([[c, -s], [s, c]])
        q = h @ R.T; w = q[:, 0].max() - q[:, 0].min(); d = q[:, 1].max() - q[:, 1].min()
        if best is None or w * d < best[0]: best = (w * d, ang, w, d)
    _, ang, w, d = best
    if d > w: w, d = d, w; ang += math.pi / 2
    angd = math.degrees(ang)
    while angd > 90: angd -= 180
    while angd <= -90: angd += 180
    A = poly_area(p); k = math.sqrt(A / (w * d)) if w * d > 0 else 1
    return dict(L=w * k, W=d * k, ang=angd, area=A, c=centroid(p))

def height(b):
    h = b.get('height'); lv = b.get('levels')
    try: h = float(h) if h not in (None, '') else None
    except: h = None
    try: lv = float(lv) if lv not in (None, '') else None
    except: lv = None
    if h and h > 0: return h, 'OSM 높이'
    if lv and lv > 0: return lv * 3.6, 'OSM 층수×3.6'
    return None, '없음'

if __name__ == '__main__':
    for reg in ('ybd', 'gbd', 'cbd'):
        J = json.load(open(os.path.join(D, f'badtm_osm_{reg}.json'), encoding='utf-8'))
        allb = J['all']; bld = J['bld']
        lat0 = np.mean([b['ring'][0][1] for b in bld]); lon0 = np.mean([b['ring'][0][0] for b in bld])
        T = to_m(lat0, lon0)
        A = []
        for b in allb:
            p = np.array([T(x, y) for x, y in b['ring']])
            if len(p) < 3: continue
            h, src = height(b)
            A.append(dict(id=b['id'], p=p, c=centroid(p), h=h))
        AC = np.array([a['c'] for a in A]); AH = np.array([a['h'] if a['h'] else np.nan for a in A])
        rows = []; n_unknown = 0
        for b in bld:
            p = np.array([T(x, y) for x, y in b['ring']])
            if len(p) < 3: continue
            h, src = height(b)
            lv = b.get('levels')
            try: lv = int(float(lv)) if lv not in (None, '') else None
            except: lv = None
            if lv is None and h is None: n_unknown += 1; continue
            cand = (lv is not None and lv >= 6) or (lv is None and h is not None and h >= 20)
            if not cand: continue
            r = eq_rect(p); c = r['c']; H = h if h else lv * 3.6; N = lv if lv else max(6, round(H / 3.6))
            d = np.linalg.norm(AC - c, axis=1)
            m = (d > 1) & (d <= 350) & ~np.isnan(AH)
            sect = np.zeros(16)
            for i in np.where(m)[0]:
                el = math.degrees(math.atan2(AH[i] - H / 2, d[i]))
                az = (math.degrees(math.atan2(AC[i][1] - c[1], AC[i][0] - c[0])) + 360) % 360
                k = int(az // 22.5); sect[k] = max(sect[k], el)
            n_nb = int(np.sum(m & (AH / np.maximum(d, 1) >= 0.2)))
            lon = lon0 + c[0] / (111320 * math.cos(math.radians(lat0))); lat = lat0 + c[1] / 110574
            rows.append(dict(id=b['id'], name=b.get('name', ''), type=b.get('type', ''), plan=b.get('plan', ''), block=b.get('block', ''),
                             floors_osm=lv if lv else '', height_m=round(H, 1), height_src=src, fp_area_m2=round(r['area'], 1),
                             Lx_m=round(r['L'], 1), Ly_m=round(r['W'], 1), ang_deg=round(r['ang'], 2), n_nb=n_nb,
                             obstr_mean_deg=round(float(np.mean(np.clip(sect, 0, None))), 2),
                             svf_proxy=round(float(np.mean(np.cos(np.radians(np.clip(sect, 0, None))) ** 2)), 3),
                             lat=round(lat, 6), lon=round(lon, 6)))
        out = os.path.join(D, f'candidates_{reg}.csv')
        with open(out, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
        ob = [r['obstr_mean_deg'] for r in rows]
        print(f"{J['region']}: 가구 안 건물 {len(bld)}, 층수·높이 정보 없음 {n_unknown}, 후보(6층 이상 또는 20 m 이상) {len(rows)}, "
              f"가려진 정도 중앙값 {np.median(ob):.1f}° (역삼 257동 3분위 경계 14.6·22.8°), 주변 건물 수 중앙값 {np.median([r['n_nb'] for r in rows]):.0f}")
