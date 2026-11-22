# -*- coding: utf-8 -*-
"""r4 ②: 건축물대장 결합(가구 안 건물 전부 + 1차 대상 350 m 안의 가구 밖 건물 전부) — 네 지역 같은 절차 (2026-11-23)
3권역 자료(2026-11-01)와 달라진 점
 - 가구 밖 주변 건물도 OSM 높이 태그 유무와 관계없이 모두 대장을 조회한다(높이 순서를 대상·주변에 같게 쓰기 위함).
 - 가구 안 건물의 지번 결합 실패 보완: 중심 지번의 표제부가 비거나 주건축물이 없으면 (1) 윤곽 안의 다른 점(대표점·내부 격자점)의 지번, (2) 같은 본번의 부번 전체 조회
   가운데 윤곽과 맞는 표제부(건물명 일치, 또는 건축면적이 윤곽 면적의 0.5~2배이고 OSM 층수와 2층 이내)를 차례로 찾는다. 결합 방법은 join 열에 남긴다.
 - 표제부 항목에 용적률 산정 연면적, 일반/집합 구분(regstrGbCdNm)을 함께 받는다.
 - 3권역 자료의 카카오 지번 결과와 표제부는 캐시 씨앗으로 다시 쓰고(같은 좌표·같은 지번), 표제부가 비어 있던 지번은 다시 조회한다.
usage: python3 collect.py cbd gbd ybd mpo
출력: out/badtm_register_{reg}.json, out/badtm_nbreg_{reg}.json, out/collect_status_{reg}.json, out/cache_r4.json"""
import json, os, sys, math, re
import numpy as np
from common import D, OUT, REGIONS, Cache, LimitReached, kakao_lot, title, mains, best_item, is_office, num, hide, STATS, K1, K2
from shapely.geometry import Polygon

C = Cache(os.path.join(OUT, 'cache_r4.json'))

def seed():
    if C.get('_seeded'): return
    n1 = n2 = 0
    for reg in ('cbd', 'gbd', 'ybd'):
        for kind in ('register', 'nbreg'):
            f = os.path.join(D, f'seed/badtm_{kind}_{reg}.json')
            if not os.path.exists(f): continue
            for r in json.load(open(f, encoding='utf-8'))['records']:
                jb = r.get('jibun') or ''
                m = re.match(r'^(\d{5})-(\d{5})-(\d{4})-(\d{4})$', jb)
                if not m or not r.get('c'): continue
                sgg, bjd, bun, ji = m.groups(); plat = '1' if r.get('mountain') == 'Y' else '0'
                lon, lat = r['c']
                k = f'k:{lon:.7f},{lat:.7f}'
                if C.get(k) is None:
                    C.put(k, dict(ok=True, sgg=sgg, bjd=bjd, plat=plat, bun=bun, ji=ji, jibun=jb, addr=r.get('addr', ''), road=r.get('road', ''), road_bldg=r.get('road_bldg', ''),
                                  b_code=r.get('b_code', sgg + bjd), mountain=r.get('mountain', 'N'), seed=True)); n1 += 1
                its = r.get('items') or []
                tk = f't:{sgg}-{bjd}-{plat}-{bun}-{ji}'
                if its and C.get(tk) is None:
                    C.put(tk, dict(status='ok', items=its, seed=kind)); n2 += 1
    C.put('_seeded', True); C.save(); print('seed: kakao', n1, 'title', n2, flush=True)

def inner_points(ring, k=4):
    try:
        P = Polygon(ring).buffer(0)
        if P.is_empty: return []
        pts = [P.representative_point()]
        minx, miny, maxx, maxy = P.bounds
        for fx, fy in ((0.3, 0.3), (0.7, 0.3), (0.3, 0.7), (0.7, 0.7), (0.5, 0.5)):
            from shapely.geometry import Point
            q = Point(minx + fx * (maxx - minx), miny + fy * (maxy - miny))
            if P.contains(q): pts.append(q)
        return [[p.x, p.y] for p in pts[:k + 1]]
    except Exception: return []

def norm(s): return re.sub(r'[\s()\-·.,]|빌딩|타워|센터|사옥|주식회사|\(주\)', '', s or '').lower()

def item_fit(it, b):
    """윤곽 b와 표제부 항목 it의 맞음 정도(작을수록 좋음), 맞지 않으면 None"""
    nm_o, nm_i = norm(b.get('name')), norm(it.get('bldNm'))
    name_ok = bool(nm_o and nm_i and (nm_o in nm_i or nm_i in nm_o))
    aa = num(it.get('archArea')); fp = b.get('area') or 0; fl = num(it.get('grndFlr')); lv = b.get('levels')
    if name_ok: return 0.0
    if aa and fp and 0.5 <= fp / aa <= 2 and (lv is None or (fl is not None and abs(fl - lv) <= 2)):
        return abs(math.log(fp / aa)) + (abs(fl - lv) / 10 if lv is not None and fl is not None else 0.3)
    return None

def safe(f, *a, **k):
    try: return f(*a, **k)
    except LimitReached: raise
    except Exception as e:
        print('api error', hide(repr(e))[:160], flush=True)
        if STATS['errors'] >= 20 and STATS['kakao'] + STATS['title'] == 0: raise SystemExit('API 접근 실패(키·네트워크 확인 필요)')
        return None

def T(L, ji='same', force=False):
    v = safe(title, C, L['sgg'], L['bjd'], L['plat'], L['bun'], L['ji'] if ji == 'same' else ji, force=force)
    return v or dict(status='error', items=[])

def K(lon, lat):
    return safe(kakao_lot, C, lon, lat) or {'ok': False, 'error': True}

def join_building(b):
    L = K(*b['c'])
    rec = dict(lot=L if L.get('ok') else None, join='none', items=[])
    if L.get('ok'):
        t = T(L)
        if not t.get('items') and C.get(f'retry:{L["jibun"]}') is None:   # 표제부가 비어 있던 지번 → 한 번 다시 조회
            t2 = T(L, force=True)
            if t2.get('status') == 'ok': C.put(f'retry:{L["jibun"]}', 1); t = t2
        rec['items'] = t.get('items') or []; rec['title_status'] = t.get('status')
        if mains(rec['items']): rec['join'] = 'centroid'; return rec
    # (1) 윤곽 안 다른 점
    seen = {rec['lot']['jibun']} if rec['lot'] else set()
    for p in inner_points(b['ring']):
        L2 = K(*p)
        if not L2.get('ok') or L2['jibun'] in seen: continue
        seen.add(L2['jibun'])
        t2 = T(L2)
        if mains(t2.get('items') or []):
            rec.update(lot=L2, items=t2['items'], join='inner_point'); return rec
    # (2) 같은 본번의 부번 전체에서 윤곽과 맞는 표제부
    L0 = rec['lot']
    if L0:
        t3 = T(L0, ji=None)
        cands = [(item_fit(it, b), it) for it in mains(t3.get('items') or [])]
        cands = [(c, it) for c, it in cands if c is not None]
        if cands:
            c, it = min(cands, key=lambda x: x[0])
            ji = (it.get('ji') or '0').zfill(4); bun = (it.get('bun') or L0['bun']).zfill(4)
            L3 = dict(L0, bun=bun, ji=ji, jibun=f'{L0["sgg"]}-{L0["bjd"]}-{bun}-{ji}')
            t4 = T(L3)
            rec.update(lot=L3, items=t4.get('items') or [it], join='bun_search', fit=round(c, 3)); return rec
    return rec

def run(reg):
    O = json.load(open(os.path.join(OUT, f'badtm_osm_{reg}.json'), encoding='utf-8'))
    st_path = os.path.join(OUT, f'collect_status_{reg}.json')
    recs = []; done = True
    try:
        for i, b in enumerate(O['bld']):
            j = join_building(b)
            r = {k: b.get(k) for k in ('id', 'name', 'type', 'levels', 'height', 'area', 'c', 'block', 'plan')}
            L = j['lot'] or {}
            r.update(addr=L.get('addr', ''), road=L.get('road', ''), road_bldg=L.get('road_bldg', ''), b_code=L.get('b_code', ''), jibun=L.get('jibun', ''), mountain=L.get('mountain', 'N'),
                     plat=L.get('plat', '0'), items=j['items'], join=j['join'], fit=j.get('fit'), title_status=j.get('title_status'), lot=j['lot'])
            recs.append(r)
            if i % 100 == 0: C.save(); print(reg, 'register', i, '/', len(O['bld']), dict(STATS), flush=True)
        # 1차 대상(가구 안, 표제부 주건축물 중 업무시설·6층 이상이 있는 건물)
        tg = [r for r in recs if any(is_office(it) and (num(it.get('grndFlr')) or 0) >= 6 for it in mains(r['items']))]
        for t in tg:   # 대상 지번은 표제부를 새로 받아 용적률 산정 연면적·일반/집합 구분까지 채운다(씨앗 항목에는 없음)
            L = t['lot']; ck = f't:{L["sgg"]}-{L["bjd"]}-{L["plat"]}-{L["bun"]}-{L["ji"]}'
            cv = C.get(ck)
            if cv and cv.get('seed'):
                t2 = T(L, force=True)
                if t2.get('status') == 'ok' and t2.get('items'): t['items'] = t2['items']
        lat0 = float(np.mean([b['c'][1] for b in O['bld']])); kx = 111320 * math.cos(math.radians(lat0)); ky = 110574
        TC = np.array([[t['c'][0] * kx, t['c'][1] * ky] for t in tg])
        inblk = {b['id'] for b in O['bld']}
        nb = []
        for b in O['all']:
            if b['id'] in inblk or not len(TC): continue
            if np.min(np.hypot(TC[:, 0] - b['c'][0] * kx, TC[:, 1] - b['c'][1] * ky)) <= 350: nb.append(b)
        print(reg, '1차 대상', len(tg), '주변 건물(350 m 안, 가구 밖)', len(nb), flush=True)
        nrec = []
        for i, b in enumerate(nb):
            L = K(*b['c']); items = []
            if L.get('ok'):
                t = T(L); items = t.get('items') or []
            nrec.append(dict(id=b['id'], c=b['c'], jibun=L.get('jibun', ''), items=[{k: it.get(k, '') for k in ('bldNm', 'mainPurps', 'grndFlr', 'totArea', 'archArea', 'heit', 'mainAtch')} for it in items]))
            if i % 200 == 0: C.save(); print(reg, 'nbreg', i, '/', len(nb), dict(STATS), flush=True)
    except LimitReached as e:
        done = False; print('LIMIT', reg, e, flush=True)
    C.save()
    json.dump(dict(region=REGIONS[reg], source='좌표(꼭짓점 평균)→카카오 로컬 API(coord2address, coord2regioncode)→건축HUB 건축물대장 표제부(getBrTitleInfo), r4 2026-11-23. join: centroid/inner_point/bun_search/none', records=recs),
              open(os.path.join(OUT, f'badtm_register_{reg}.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    if done:
        json.dump(dict(region=REGIONS[reg], source='주변 건물(가구 밖, 1차 대상 350 m 이내, OSM 태그와 무관하게 전부) 좌표→카카오→건축HUB 표제부, r4 2026-11-23', records=nrec),
                  open(os.path.join(OUT, f'badtm_nbreg_{reg}.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    jc = {}
    for r in recs: jc[r['join']] = jc.get(r['join'], 0) + 1
    st = dict(region=reg, done=done, n_bld=len(O['bld']), n_register=len(recs), join=jc, stats=dict(STATS))
    json.dump(st, open(st_path, 'w'), ensure_ascii=False, indent=1); print(json.dumps(st, ensure_ascii=False), flush=True)
    return done

if __name__ == '__main__':
    if not K1 or not K2: sys.exit('환경변수 DATA_GO_KR_KEY, KAKAO_REST_KEY 필요')
    seed()
    for reg in sys.argv[1:]:
        if not run(reg): break
