# -*- coding: utf-8 -*-
"""r4 ①: 네 지역의 가구와 OpenStreetMap 건물 윤곽 (2026-11-23)
- 도심·강남·여의도: 3권역 자료와 같은 가구(UPIS 지구단위계획구역 − 도시계획시설 도로, 2,000 m² 이상; blocks/blocks_{reg}.json).
- 마포: 통계 권역 '여의도·마포'의 마포 부분에 업무 기능 지구단위계획구역이 없으므로, 도로명 '마포대로'(OSM)에서 30 m 이내인 상업지역(UPIS UQ111, 2026-09판) 다각형의 합을
  대상 구역으로 하고, 같은 규칙(구역 − 도시계획시설 도로 UQ151, 2,000 m² 이상)으로 가구를 만든다.
- 건물 윤곽: Overpass API, 가구 범위 바깥 400 m까지(차폐 반경 350 m보다 넓게; 3권역 자료의 약 150 m를 넓힘). 건물 중심(꼭짓점 평균)이 든 가구에 배정(gen.js와 같은 규칙).
usage: python3 fetch_osm.py cbd gbd ybd mpo
출력: out/badtm_osm_{reg}.json (3권역 badtm_osm_{reg}.json과 같은 형식), out/area_mpo.geojson"""
import json, os, sys, time, urllib.request, urllib.parse
from common import D, OUT, REGIONS, centroid, ring_area, in_poly, polys_of
EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
PAD_LAT, PAD_LON = 0.0036, 0.0046   # 약 400 m (북위 37.5°)

def overpass(ql, timeout=300):
    last = None
    for k in range(4):
        for ep in EPS:
            try:
                req = urllib.request.Request(ep, data=urllib.parse.urlencode({'data': ql}).encode(), headers={'User-Agent': 'badtm-research/1.0 (doctoral thesis data; github.com/m48a2c999-svg/badtm)'})
                return json.load(urllib.request.urlopen(req, timeout=timeout)), ep
            except Exception as e:
                last = e; print('overpass retry', ep, k, repr(e)[:120], flush=True); time.sleep(15)
    raise SystemExit(f'Overpass 실패: {last!r}')

def mapo_blocks():
    import geopandas as gpd
    from shapely.geometry import LineString, mapping
    from shapely.ops import unary_union
    CRS = 5186
    Cm = gpd.read_file(os.path.join(D, 'blocks/upis_mpo_commercial.geojson')).to_crs(CRS); Rd = gpd.read_file(os.path.join(D, 'blocks/upis_mpo_roads.geojson')).to_crs(CRS)
    Cm['geometry'] = Cm.geometry.buffer(0); Rd['geometry'] = Rd.geometry.buffer(0)
    j, used = overpass('[out:json][timeout:120];way["highway"]["name"="마포대로"](37.530,126.935,37.565,126.966);out tags geom;')
    lines = [LineString([(p['lon'], p['lat']) for p in el['geometry']]) for el in j['elements'] if el.get('geometry') and len(el['geometry']) >= 2]
    if not lines: raise SystemExit('마포대로 선을 찾지 못함')
    axis = unary_union(list(gpd.GeoSeries(lines, crs=4326).to_crs(CRS)))
    sel = Cm[Cm.distance(axis) <= 30]
    zone = unary_union(list(sel.geometry))
    near = Rd[Rd.intersects(zone)]
    b = zone.difference(unary_union(list(near.geometry))) if len(near) else zone
    parts = [x for x in getattr(b, 'geoms', [b]) if x.area >= 2000]
    G4 = gpd.GeoSeries(parts, crs=CRS).to_crs(4326)
    order = sorted(range(len(G4)), key=lambda i: (-G4.iloc[i].centroid.y, G4.iloc[i].centroid.x))
    PID = 'MPO_UQ111_MAPODAERO'; PN = '마포대로변 상업지역'
    feats = [dict(type='Feature', geometry=mapping(G4.iloc[i]), properties=dict(plan_id=PID, plan=PN, block=f'{n+1:03d}', area_m2=round(parts[i].area), commercial_pct=100.0)) for n, i in enumerate(order)]
    plan = dict(id=PID, name=PN, gu='11440', gu_name='마포구', area_ha=round(zone.area / 1e4, 2), commercial_pct=100.0, n_blocks=len(feats), notice=None, date='2026-09 (UPIS)', promotion=[],
                rule='도로명 마포대로(OpenStreetMap)에서 30 m 이내인 상업지역(UPIS UQ111) 다각형의 합 − 도시계획시설 도로(UQ151), 2,000 m² 이상',
                polygons=[dict(id=str(r.PRESENT_SN), name=str(r.DGM_NM), notice=(None if r.NTFC_SN is None or str(r.NTFC_SN) in ('nan', 'None') else str(r.NTFC_SN)), date=str(r.CREATE_DAT)[:10], area_m2=round(r.geometry.area)) for r in sel.itertuples()],
                axis_osm_ways=[el['id'] for el in j['elements'] if el.get('geometry')], axis_length_m=round(axis.length))
    gj = [dict(type='Feature', geometry=mapping(gpd.GeoSeries([zone], crs=CRS).to_crs(4326).iloc[0]), properties=dict(kind='zone', area_ha=plan['area_ha'])),
          dict(type='Feature', geometry=mapping(gpd.GeoSeries([axis], crs=CRS).to_crs(4326).iloc[0]), properties=dict(kind='axis', name='마포대로', length_m=plan['axis_length_m']))] + \
         [dict(type='Feature', geometry=f['geometry'], properties=dict(kind='block', **f['properties'])) for f in feats]
    json.dump(dict(type='FeatureCollection', features=gj), open(os.path.join(OUT, 'area_mpo.geojson'), 'w', encoding='utf-8'), ensure_ascii=False)
    print('마포: 마포대로 %d m, 상업지역 %d개, 구역 %.2f ha, 가구 %d' % (axis.length, len(sel), zone.area / 1e4, len(feats)), flush=True)
    return [plan], feats, f'UPIS UQ111·UQ151 2026-09판 + OSM 마포대로({used})'

for reg in sys.argv[1:]:
    if os.path.exists(os.path.join(OUT, f'badtm_osm_{reg}.json')) and not os.environ.get('FORCE_OSM'):
        print(reg, '이미 받은 OSM 자료를 그대로 쓴다(같은 시점 자료 유지)'); continue
    if reg == 'mpo': plans, feats, bsrc = mapo_blocks()
    else:
        J = json.load(open(os.path.join(D, f'blocks/blocks_{reg}.json'), encoding='utf-8')); plans, feats, bsrc = J['plans'], J['features'], J['source']
    s, w, n, e = 90, 180, -90, -180
    for f in feats:
        for poly in polys_of(f['geometry']):
            for x, y in poly[0]: s = min(s, y); n = max(n, y); w = min(w, x); e = max(e, x)
    lat0 = (s + n) / 2
    bb = f'{s-PAD_LAT:.6f},{w-PAD_LON:.6f},{n+PAD_LAT:.6f},{e+PAD_LON:.6f}'
    j, used = overpass(f'[out:json][timeout:240];(way["building"]({bb});relation["building"]["type"="multipolygon"]({bb}););out tags geom;')
    B = []
    for el in j['elements']:
        ring = None
        if el['type'] == 'way' and el.get('geometry') and len(el['geometry']) > 3: ring = [[p['lon'], p['lat']] for p in el['geometry']]
        elif el['type'] == 'relation' and el.get('members'):
            o = next((m for m in el['members'] if m.get('role') == 'outer' and m.get('geometry')), None)
            if o: ring = [[p['lon'], p['lat']] for p in o['geometry']]
        if not ring: continue
        t = el.get('tags') or {}
        def fnum(v):
            try: return float(v)
            except Exception: return None
        B.append(dict(id=f"{el['type'][0]}{el['id']}", ring=ring, name=t.get('name', ''), type=t.get('building'), levels=fnum(t.get('building:levels')), height=fnum(t.get('height')),
                      area=ring_area(ring, lat0), c=centroid(ring)))
    for f in feats:
        f['properties']['area_m2_web'] = round(sum(ring_area(p[0], lat0) - sum(ring_area(h, lat0) for h in p[1:]) for p in polys_of(f['geometry']))); f['properties']['bld'] = []
    for b in B:
        for f in feats:
            if any(in_poly(b['c'], p) for p in polys_of(f['geometry'])):
                f['properties']['bld'].append(b); b['block'] = f"{f['properties']['plan_id']}-{f['properties']['block']}"; b['plan'] = f['properties']['plan']; break
    for f in feats:
        P = f['properties']; bs = P['bld']; lv = [x['levels'] for x in bs if x['levels'] is not None]
        P['n_bld'] = len(bs); P['footprint_m2'] = round(sum(x['area'] for x in bs)); P['coverage_pct'] = round(100 * P['footprint_m2'] / P['area_m2_web'], 1) if P['area_m2_web'] else None
        P['n_levels_tagged'] = len(lv); P['levels_mean'] = round(sum(lv) / len(lv), 1) if lv else None; P['levels_max'] = max(lv) if lv else None
        P['n_6f_plus'] = sum(1 for v in lv if v >= 6); P['n_office_tag'] = sum(1 for x in bs if x['type'] in ('office', 'commercial'))
        P['floor_area_est_m2'] = round(sum(x['area'] * x['levels'] for x in bs if x['levels'] is not None)) if lv else None
    bld = [b for b in B if b.get('block')]
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    tmpf = os.path.join(OUT, f'badtm_osm_{reg}.json.tmp')
    json.dump(dict(region=REGIONS[reg], source=f'OpenStreetMap via Overpass API (ODbL © OpenStreetMap contributors), fetched {now} via {used}; 가구: {bsrc}; 범위 = 가구 경계 바깥 약 400 m',
                   bbox=[s, w, n, e], pad_deg=[PAD_LAT, PAD_LON], used=used, plans=plans, blocks=feats, bld=bld, all=B), open(tmpf, 'w', encoding='utf-8'), ensure_ascii=False)
    os.replace(tmpf, os.path.join(OUT, f'badtm_osm_{reg}.json'))
    print(f'{reg}: 가구 {len(feats)}, 범위 안 건물 {len(B)}, 가구 안 {len(bld)}, 층수 태그 {sum(1 for b in bld if b["levels"] is not None)}', flush=True)
    time.sleep(5)
