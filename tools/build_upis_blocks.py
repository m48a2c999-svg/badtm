"""서울시 UPIS(서울 열린데이터광장, 2026-09판) 지구단위계획구역을 도시계획도로(시설)로 나눈 가구를 만든다.
입력: UPIS_C_UQ161(지구단위계획구역), UPIS_C_UQ151(도시계획시설 도로), UPIS_C_UQ111(용도지역), UPIS_C_UQ129(개발진흥지구) shp
출력: data/upis/plans.json(구역 목록), data/upis/blocks_<시군구코드>.geojson(가구, WGS84)
usage: python3 tools/build_upis_blocks.py RAW_DIR
가구 = 구역 − 도로, 면적 2,000 m² 이상 조각. 상업지역 비율은 가구 면적 대비 상업지역(중심·일반·근린·유통) 면적."""
import sys, os, glob, json
import geopandas as gpd, pandas as pd
RAW = sys.argv[1]; OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data/upis')
os.makedirs(OUT, exist_ok=True)
rd = lambda k: gpd.read_file(glob.glob(f'{RAW}/**/UPIS_C_{k}.shp', recursive=True)[0], encoding='cp949')
P = rd('UQ161'); R = rd('UQ151'); Z = rd('UQ111'); DV = rd('UQ129')
P['geometry'] = P.geometry.buffer(0); R['geometry'] = R.geometry.buffer(0)
COM = Z[Z.DGM_NM.str.contains('상업', na=False)].copy(); COM['geometry'] = COM.geometry.buffer(0)
SGG = {'11110':'종로구','11140':'중구','11170':'용산구','11200':'성동구','11215':'광진구','11230':'동대문구','11260':'중랑구','11290':'성북구','11305':'강북구','11320':'도봉구','11350':'노원구','11380':'은평구','11410':'서대문구','11440':'마포구','11470':'양천구','11500':'강서구','11530':'구로구','11545':'금천구','11560':'영등포구','11590':'동작구','11620':'관악구','11650':'서초구','11680':'강남구','11710':'송파구','11740':'강동구','11000':'서울시'}
# 시군구 판정: 구역 중심점이 속한 구(자료의 SIGNGU_SE가 11000(시 결정)인 경우가 많아 위치로 다시 정함) — 용도지역 자료로 구 경계를 알 수 없으므로 고시번호 앞 5자리 → 없으면 WTNNC 앞 5자리
def gu(r):
    for k in ('NTFC_SN', 'WTNNC_SN', 'PRESENT_SN'):
        v = str(r.get(k) or '')[:5]
        if v in SGG and v != '11000': return v
    return '11000'
P['gu'] = P.apply(gu, axis=1)
P = P.sort_values('CREATE_DAT', ascending=False).drop_duplicates('PRESENT_SN')
plans = []; feats = {}
Rs = R.sindex; Cs = COM.sindex
for i, p in P.iterrows():
    g = p.geometry
    if g is None or g.is_empty: continue
    near = R.iloc[list(Rs.query(g, predicate='intersects'))]
    b = g.difference(near.union_all()) if len(near) else g
    parts = [x for x in getattr(b, 'geoms', [b]) if x.area >= 2000]
    cn = COM.iloc[list(Cs.query(g, predicate='intersects'))]
    cu = cn.union_all() if len(cn) else None
    com_pct = round(100 * g.intersection(cu).area / g.area, 1) if cu is not None else 0.0
    dv = DV[DV.intersects(g)]
    dvn = [d.DGM_NM for _, d in dv.iterrows() if d.geometry.intersection(g).area > 0.3 * min(d.geometry.area, g.area)]
    pid = p.PRESENT_SN
    plans.append(dict(id=pid, name=p.DGM_NM, gu=p.gu, gu_name=SGG.get(p.gu, ''), area_ha=round(g.area / 1e4, 2), commercial_pct=com_pct,
                      n_blocks=len(parts), notice=(p.NTFC_SN if isinstance(p.NTFC_SN, str) else None), date=(str(p.CREATE_DAT)[:10] if pd.notna(p.CREATE_DAT) else None), promotion=dvn))
    for j, x in enumerate(sorted(parts, key=lambda q: (-q.centroid.y, q.centroid.x))):
        bc = round(100 * x.intersection(cu).area / x.area, 1) if cu is not None else 0.0
        feats.setdefault(p.gu, []).append(dict(geometry=x, plan_id=pid, plan=p.DGM_NM, block=f'{j+1:03d}', area_m2=round(x.area), commercial_pct=bc))
json.dump(dict(source='서울 열린데이터광장 UPIS 2026-09판(UQ161·UQ151·UQ111·UQ129), 법적 효력 없음·참고용', crs='EPSG:4326',
               rule='가구 = 지구단위계획구역 − 도시계획시설(도로), 2,000 m² 이상', gu=SGG, plans=plans), open(f'{OUT}/plans.json', 'w', encoding='utf-8'), ensure_ascii=False)
tot = 0
for gcode, fs in feats.items():
    G = gpd.GeoDataFrame(fs, crs=P.crs).to_crs(4326)
    G['geometry'] = G.geometry.simplify(0.000003)
    G.to_file(f'{OUT}/blocks_{gcode}.geojson', driver='GeoJSON', COORDINATE_PRECISION=6)
    tot += len(G)
# 구역 윤곽(가벼운 판)
PP = P[['PRESENT_SN', 'geometry']].rename(columns={'PRESENT_SN': 'id'}).to_crs(4326); PP['geometry'] = PP.geometry.simplify(0.00001)
PP.to_file(f'{OUT}/plans.geojson', driver='GeoJSON', COORDINATE_PRECISION=6)
print('구역', len(plans), '가구', tot)
