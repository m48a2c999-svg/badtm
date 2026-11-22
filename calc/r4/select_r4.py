# -*- coding: utf-8 -*-
"""r4 ③: 대상 선별·속성·가려진 정도·EnergyPlus 입력 — 네 지역 같은 규칙 (2026-11-23)
규칙
 - 대상 = 가구 안 윤곽 가운데, 짝지어진 표제부(주건축물)의 주용도 또는 기타 용도에 업무시설이 있고 지상 6층 이상인 건물.
 - 윤곽–표제부 짝짓기(같은 지번에 결합된 윤곽과 그 지번의 주건축물): 비용 = |ln(윤곽 면적/건축면적)| + |ln(OSM 층수/지상층수)|(OSM 층수가 없으면 0.3)
   + 결합 방법 가중(윤곽 중심 0, 윤곽 안 다른 점 0.5, 같은 본번 부번 조회 1.0) − 이름 일치 0.5 의 합이 최소가 되도록 짝짓는다(헝가리안 방법, 주건축물 1건인 지번에도 적용;
   윤곽 면적/건축면적이 1/3~3 밖이면 짝짓지 않음). 결합 보완(윤곽 안 다른 점·부번 조회)으로 이웃 지번의 표제부가 붙은 윤곽이, 그 지번의 제 윤곽보다 크다는 이유로 표제부를 가져가지 않도록 함.
   건축면적이 비어 있는 표제부는 (용적률 산정 연면적 또는 연면적) ÷ 층수로 대신하고, 그것도 없으면 면적 항을 0.5로 둔다. OSM 건물 유형이 지붕·캐노피·주차장 등인 윤곽은 짝짓기에서 뺀다. 어느 짝도 맞지 않으면 가장 좋은 결합 방법의 윤곽 가운데 가장 큰 윤곽에 연면적이 가장 큰 표제부를 붙인다(윤곽이 건축면적의 1/5 미만이면 붙이지 않음).
 - 표제부 지상층수가 0으로 내려온 경우(조회 시점의 원자료 값), 같은 표제부(관리번호)의 2026-11-01 조회 값이 있으면 그 값을 쓴다.
 - 높이(대상·주변 모두 같은 순서): 짝지어진 표제부 높이 > OSM 높이 > 표제부 지상층수×3.6 m > OSM 층수×3.6 m. 높이 값은 층당 2.4~7.0 m 안일 때만 쓴다(층수가 있을 때).
   짝지어지지 않은 같은 지번의 부분 윤곽: OSM 높이 > OSM 층수×3.6 > (주건축물이 1건인 지번이면 그 표제부 높이 > 층수×3.6). 어느 것도 없으면 차폐면에서 뺀다.
 - 가려진 정도(평균 차폐각): 대상 중심(중간 높이)에서 350 m 안 건물의 16방위 최대 앙각의 평균(역삼 257동·3권역과 같은 정의).
 - 면적 보정 = 짝지어진 표제부의 용적률 산정 연면적 ÷ (윤곽 면적 × 지상층수), 등가 폭 하한 9.65 m, 0.25~3.0 밖은 잘라내고 표시(3권역 규칙과 같음).
usage: python3 select_r4.py cbd gbd ybd mpo
출력: out/targets_{reg}.csv, out/neighbors_{reg}.csv, out/select_summary.json, ../r3/data/r3/{osm,targets_sim,area_scale}_r4{reg}.(json|csv)"""
import json, math, os, sys, csv
import numpy as np
from scipy.optimize import linear_sum_assignment
from common import D, OUT, REGIONS, mains, best_item, is_office, num
from prep_regions import to_m, centroid as m_centroid, eq_rect, poly_area
SIMD = os.path.join(D, '..', 'r3', 'data', 'r3')

def h_rule(it, b, part=None):
    """part=None: 짝지어진 윤곽(표제부 우선). part='single': 주건축물 1건 지번의 부분 윤곽. part='multi': 여러 건 지번의 짝 없는 윤곽. part='nb': 주변 건물.
    높이 값(표제부 높이, OSM 높이)은 층수(표제부 지상층수, 없으면 OSM 층수)가 있을 때 층당 2.4~7.0 m 안일 때만 쓰고, 밖이면 다음 순서로 넘어간다."""
    ih = num(it.get('heit')) if it else None; ih = ih if ih and ih > 0 else None
    fl = num(it.get('grndFlr')) if it else None; fl = fl if fl and fl > 0 else None
    oh = b.get('height') if b.get('height') and b['height'] > 0 else None; ol = b.get('levels') if b.get('levels') and b['levels'] > 0 else None
    def ok(v, ref): return v and (ref is None or 2.4 <= v / ref <= 7.0)
    if part in (None, 'nb'):
        ref = fl or ol
        for v, s in ((ih if ok(ih, ref) else None, '대장 높이'), (oh if ok(oh, ref) else None, 'OSM 높이'), (fl and fl * 3.6, '대장 층수×3.6'), (ol and ol * 3.6, 'OSM 층수×3.6')):
            if v: return float(v), s, (int(fl) if fl else (int(ol) if ol else None))
    elif part == 'single':
        for v, s in ((oh if ok(oh, ol) else None, 'OSM 높이(부분 윤곽)'), (ol and ol * 3.6, 'OSM 층수×3.6(부분 윤곽)'), (ih if ok(ih, fl) else None, '대장 높이(부분 윤곽)'), (fl and fl * 3.6, '대장 층수×3.6(부분 윤곽)')):
            if v: return float(v), s, (int(ol) if ol else (int(fl) if fl else None))
    else:
        for v, s in ((oh if ok(oh, ol) else None, 'OSM 높이'), (ol and ol * 3.6, 'OSM 층수×3.6')):
            if v: return float(v), s, (int(ol) if ol else None)
    return None, '없음', None

JOINW = {'centroid': 0.0, 'inner_point': 0.5, 'bun_search': 1.0}
NONBLD = {'roof', 'carport', 'canopy', 'construction', 'ruins', 'bridge', 'grandstand', 'shed', 'hut', 'kiosk', 'toilets', 'garage', 'garages', 'container', 'tent', 'parking', 'parkingbuilding'}
def _norm(x): return ''.join(ch for ch in str(x or '').lower() if ch.isalnum())
def match_lot(outs, items):
    """outs: [(bid, fp_m2, osm_lv, join, osm_name)], items: 주건축물 목록 → {bid: (item, how, cost)}"""
    if not items or not outs: return {}
    how = 'single' if len(items) == 1 else 'hungarian'
    Cm = np.full((len(outs), len(items)), 99.0)
    for i, (bid, fp, lv, jn, nm) in enumerate(outs):
        for j, it in enumerate(items):
            aa = num(it.get('archArea')); fl = num(it.get('grndFlr'))
            if not (aa and aa > 0):   # 건축면적이 비어 있으면 (용적률 산정 연면적 또는 연면적) ÷ 층수로 대신함
                va = num(it.get('vlRatEstmTotArea')); ta = num(it.get('totArea')); ug = num(it.get('ugrndFlr')) or 0
                aa = (va / fl) if va and fl else ((ta / (fl + ug)) if ta and fl else None)
            if not fp: continue
            if aa and aa > 0:
                r = fp / aa
                if not (1 / 3 <= r <= 3): continue
                ca = abs(math.log(r))
            else: ca = 0.5   # 면적 정보가 없는 표제부
            c = ca + (abs(math.log(lv / fl)) if lv and fl and lv > 0 and fl > 0 else 0.3) + JOINW.get(jn, 1.0)
            a, b_ = _norm(nm), _norm(f"{it.get('bldNm') or ''}{it.get('dongNm') or ''}")
            if a and b_ and (a in b_ or b_ in a): c -= 0.5
            Cm[i, j] = max(0.0, c)
    ri, ci = linear_sum_assignment(Cm)
    res = {outs[i][0]: (items[j], how, round(float(Cm[i, j]), 3)) for i, j in zip(ri, ci) if Cm[i, j] < 99}
    if not res:   # 어느 짝도 맞지 않으면: 가장 좋은 결합 방법의 윤곽 가운데 가장 큰 윤곽 ← 연면적 최대 표제부
        bj = min(JOINW.get(o[3], 1.0) for o in outs)
        o = max([o for o in outs if JOINW.get(o[3], 1.0) == bj], key=lambda o: o[1]); it = best_item(items); aa = num(it.get('archArea')) or ((num(it.get('vlRatEstmTotArea')) or 0) / (num(it.get('grndFlr')) or 1)) or None
        if not (aa and aa > 0 and o[1] / aa < 0.2): res = {o[0]: (it, 'fallback_best', None)}   # 윤곽이 건축면적의 1/5 미만이면 붙이지 않음
    return res

summary = {}
for reg in sys.argv[1:]:
    O = json.load(open(os.path.join(OUT, f'badtm_osm_{reg}.json'), encoding='utf-8'))
    R = json.load(open(os.path.join(OUT, f'badtm_register_{reg}.json'), encoding='utf-8'))['records']
    N = json.load(open(os.path.join(OUT, f'badtm_nbreg_{reg}.json'), encoding='utf-8'))['records']
    rec = {r['id']: r for r in R}; nbr = {r['id']: r for r in N}
    # 표제부 지상층수 0 → 같은 관리번호의 2026-11-01 조회 값(seed)
    SEEDF = {}
    for sf in (f'seed/badtm_register_{reg}.json', f'seed/badtm_nbreg_{reg}.json'):
        sp = os.path.join(D, sf)
        if os.path.exists(sp):
            for r0 in json.load(open(sp, encoding='utf-8'))['records']:
                for it0 in r0.get('items') or []:
                    if it0.get('mgm') and (num(it0.get('grndFlr')) or 0) > 0: SEEDF[it0['mgm']] = it0['grndFlr']
    FLR_FIX = []
    for r in list(R) + list(N):
        for it in r.get('items') or []:
            if (num(it.get('grndFlr')) or 0) <= 0 and it.get('mgm') in SEEDF:
                it['grndFlr_src'] = f"r4 조회 {it.get('grndFlr')} → 2026-11-01 조회 {SEEDF[it['mgm']]}"; it['grndFlr'] = SEEDF[it['mgm']]; FLR_FIX.append([r['id'], it.get('bldNm'), it['grndFlr_src']])
    bld = O['bld']; allb = O['all']; byid = {b['id']: b for b in allb}
    lat0 = np.mean([b['ring'][0][1] for b in bld]); lon0 = np.mean([b['ring'][0][0] for b in bld]); T = to_m(lat0, lon0)
    poly = {b['id']: np.array([T(x, y) for x, y in b['ring']]) for b in allb}
    fpa = {k: poly_area(p) if len(p) >= 3 else 0 for k, p in poly.items()}
    # 같은 지번의 윤곽–표제부 짝짓기
    lots = {}
    for b in bld:
        r = rec.get(b['id'])
        if (b.get('type') or '') in NONBLD: continue   # 지붕·캐노피 등 건물이 아닌 윤곽은 짝짓기에서 뺀다
        if r and r.get('jibun') and mains(r.get('items') or []): lots.setdefault(r['jibun'], []).append(b['id'])
    M = {}; lot_items = {}
    for jb, ids in lots.items():
        its = mains(rec[ids[0]]['items']); lot_items[jb] = its
        M.update(match_lot([(i, fpa[i], byid[i].get('levels'), rec[i].get('join'), byid[i].get('name')) for i in ids], its))
    # 모든 건물의 높이·층수
    H = {}; HS = {}; LV = {}
    for b in allb:
        i = b['id']
        if i in M: h, s, lv = h_rule(M[i][0], b)
        elif i in rec and rec[i].get('jibun') in lot_items:
            its = lot_items[rec[i]['jibun']]; h, s, lv = h_rule(its[0] if len(its) == 1 else None, b, 'single' if len(its) == 1 else 'multi')
        elif i in nbr and nbr[i].get('items'): h, s, lv = h_rule(best_item(nbr[i]['items']), b, 'nb')
        else: h, s, lv = h_rule(None, b, 'nb')
        H[i] = h; HS[i] = s; LV[i] = lv
    ids = [b['id'] for b in allb if len(poly[b['id']]) >= 3]
    AC = np.array([m_centroid(poly[i]) for i in ids]); AH = np.array([H[i] if H[i] else np.nan for i in ids])
    with open(os.path.join(OUT, f'neighbors_{reg}.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f); w.writerow(['id', 'height_m', 'height_src', 'levels']); [w.writerow([i, round(H[i], 1) if H[i] else '', HS[i], LV[i] or '']) for i in ids]
    rows = []
    for b in bld:
        i = b['id']
        if i not in M: continue
        it, how, cost = M[i]
        if not is_office(it) or (num(it.get('grndFlr')) or 0) < 6: continue
        p = poly[i]
        if len(p) < 3: continue
        r = eq_rect(p); c = r['c']; Hh = H[i]; Nf = int(num(it.get('grndFlr')))
        d = np.linalg.norm(AC - c, axis=1); m = (d > 1) & (d <= 350) & ~np.isnan(AH)
        sect = np.zeros(16)
        for k in np.where(m)[0]:
            el = math.degrees(math.atan2(AH[k] - Hh / 2, d[k])); az = (math.degrees(math.atan2(AC[k][1] - c[1], AC[k][0] - c[0])) + 360) % 360
            q = int(az // 22.5); sect[q] = max(sect[q], el)
        n_nb = int(np.sum(m & (AH / np.maximum(d, 1) >= 0.2)))
        rr = rec[i]; jb = rr['jibun']
        miss = int(np.sum((d > 1) & (d <= 350) & np.isnan(AH))); tot = int(np.sum((d > 1) & (d <= 350)))
        rows.append(dict(id=i, reg_name=it.get('bldNm', ''), osm_name=b.get('name', ''), jibun=rr.get('addr', ''), key=jb, road=rr.get('road', ''), plan=b.get('plan', ''), block=b.get('block', ''),
                         main_purps=it.get('mainPurps', ''), etc_purps=it.get('etcPurps', ''), regstr_gb=it.get('regstrGb', ''), regstr_kind=it.get('regstrKind', ''), dong=it.get('dongNm', ''),
                         grnd_flr=Nf, ugrnd_flr=it.get('ugrndFlr', ''), tot_area_m2=it.get('totArea', ''), arch_area_m2=it.get('archArea', ''), vl_area_m2=it.get('vlRatEstmTotArea', ''),
                         height_m=round(Hh, 1), height_src=HS[i], use_apr=it.get('useAprDay', ''), fp_area_m2=round(r['area'], 1), Lx_m=round(r['L'], 1), Ly_m=round(r['W'], 1), ang_deg=round(r['ang'], 2),
                         n_nb=n_nb, obstr_mean_deg=round(float(np.mean(np.clip(sect, 0, None))), 2), svf_proxy=round(float(np.mean(np.cos(np.radians(np.clip(sect, 0, None))) ** 2)), 3),
                         nb_missing_h=miss, nb_total=tot, main_only=('업무' in (it.get('mainPurps') or '')), join=rr.get('join'), match=how, match_cost=cost if cost is not None else '',
                         n_main_items_lot=len(lot_items.get(jb, [])), lat=round(b['c'][1], 6), lon=round(b['c'][0], 6), mgm=it.get('mgm', '')))
    lotn = {}
    for x in rows: lotn[x['key']] = lotn.get(x['key'], 0) + 1
    for x in rows: x['lot_n_targets'] = lotn[x['key']]
    with open(os.path.join(OUT, f'targets_{reg}.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    # ---- EnergyPlus 입력(make_region_inputs.py와 같은 형식) ----
    lat0r = round(float(np.mean([b['c'][1] for b in bld])), 4); lon0r = round(float(np.mean([b['c'][0] for b in bld])), 4)
    phi = math.radians(lat0r)
    mlat = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi); mlon = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
    TT = lambda lon, lat: [round((lon - lon0r) * mlon, 1), round((lat - lat0r) * mlat, 1)]
    B = []
    for b in allb:
        p = [TT(x, y) for x, y in b['ring']]
        if len(p) < 4: continue
        it = M.get(b['id'], (None,))[0]
        B.append(dict(id=b['id'], name=(it or {}).get('bldNm') or b.get('name') or '', en=None, lv=LV[b['id']], h=H[b['id']], b=b.get('type'), addr='', a=round(poly_area(np.array(p))), c=[round(v) for v in TT(*b['c'])], p=p))
    BI = {x['id']: x for x in B}; tag = f'r4{reg}'
    json.dump(dict(source=f'OpenStreetMap via Overpass API ({O["source"][:80]}…); heights: 짝지어진 표제부 높이 > OSM 높이 > 표제부 층수×3.6 > OSM 층수×3.6', license='ODbL, © OpenStreetMap contributors',
                   ref=dict(lat0=lat0r, lon0=lon0r, m_per_deg_lat=round(mlat, 2), m_per_deg_lon=round(mlon, 2)), filter='all buildings; buildings without height are not used as shading context', n_total=len(B), buildings=B),
              open(os.path.join(SIMD, f'osm_{tag}.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    srows = []; scale = {}; flags = []
    for t in rows:
        Nf = t['grnd_flr']; fp = t['fp_area_m2']; vl = num(t['vl_area_m2']); s = 1.0
        if vl and vl > 0 and fp * Nf > 0:
            s = vl / (fp * Nf); Wd = t['Ly_m'] * math.sqrt(s)
            if Wd < 9.65: s2 = (9.65 / t['Ly_m']) ** 2; flags.append([t['id'], f'width cap s {s:.5f}->{s2:.3f} (floor 9.65 m)']); s = s2
        else: flags.append([t['id'], 'no register vl'])
        if s < 0.25 or s > 3.0: flags.append([t['id'], f'scale {s:.3f} out of [0.25, 3.0] -> clipped']); s = min(3.0, max(0.25, s))
        scale[t['id']] = round(s, 5)
        bb = BI[t['id']]
        srows.append(dict(osm=t['id'], key=t['key'], name=t['reg_name'] or t['osm_name'], purp=t['main_purps'], etcPurps=t['etc_purps'], floors=Nf, heit=t['height_m'], totArea=t['tot_area_m2'], archArea=t['arch_area_m2'],
                          useAprDay=t['use_apr'], role='r4', sim_name=f'{reg}_{t["id"]}', fp_area=fp, osm_lv=bb['lv'], osm_h=bb['h'], eq_L=t['Lx_m'], eq_W=t['Ly_m'], ang=t['ang_deg'], sim_height=t['height_m'],
                          plan=t['plan'], block=t['block'], obstr_mean=t['obstr_mean_deg'], n_nb=t['n_nb'], regstr_gb=t['regstr_gb'], match=t['match'], join=t['join']))
    with open(os.path.join(SIMD, f'targets_sim_{tag}.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(srows[0].keys())); w.writeheader(); w.writerows(srows)
    json.dump(dict(note='area scale = matched register vlRatEstmTotArea / (OSM footprint x register floors); 1.0 where missing; width floor 9.65 m; clip 0.25-3.0', scale=scale, flags=flags),
              open(os.path.join(SIMD, f'area_scale_{tag}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    ob = [x['obstr_mean_deg'] for x in rows]
    jc = {}; mc = {}
    for x in rows: jc[x['join']] = jc.get(x['join'], 0) + 1; mc[x['match']] = mc.get(x['match'], 0) + 1
    summary[reg] = dict(name=REGIONS[reg], n_blocks=len(O['blocks']), n_bld_in_blocks=len(bld), n_all=len(allb), n_register_joined=sum(1 for b in bld if b['id'] in rec and mains(rec[b['id']].get('items') or [])),
                        n_targets=len(rows), n_main_office=sum(1 for x in rows if x['main_only']), floors_median=float(np.median([x['grnd_flr'] for x in rows])), obstr_median=float(np.median(ob)),
                        n_low_mid_high=[sum(1 for v in ob if v <= 14.637), sum(1 for v in ob if 14.637 < v <= 22.777), sum(1 for v in ob if v > 22.777)],
                        nb_missing_median_pct=float(np.median([100 * x['nb_missing_h'] / x['nb_total'] for x in rows if x['nb_total']])), join=jc, match=mc,
                        n_heights=sum(1 for v in H.values() if v), n_scale_flags=len(flags), floor_fix=FLR_FIX)
    print(reg, json.dumps(summary[reg], ensure_ascii=False), flush=True)
json.dump(summary, open(os.path.join(OUT, 'select_summary.json'), 'w'), ensure_ascii=False, indent=1)
