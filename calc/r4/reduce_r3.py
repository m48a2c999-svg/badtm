# -*- coding: utf-8 -*-
"""3권역 원계산 결과(pkl/pkl.gz) → 건물·조건별 압축 자료 + 가구별 피크 집계 (2026-11-23, 4개 지역 통일 집계용)
usage: python3 reduce_r3.py <res_dir> <region> <targets_sim_csv> <out_json>
- res_dir 안의 {osm}_{tag}.pkl 또는 .pkl.gz 를 모두 읽는다.
- 건물·조건별: EUI, 면적, 피크, UDI, PMV, 용도별(면적당), 월별 전기·가스·냉방·난방(kWh), 존별 창면 일사·UDI·부하, 1월 난방가스·7월 전기 평균 일 곡선(kW), 워밍업 경고, 용량.
- 가구별(targets의 block): 조건별 시간 전력 합의 피크·발생 시각·건물별 피크 합(동시율 계산용).
역삼 257동 6장 분석(ana2.py)과 같은 양을 같은 정의로 만든다."""
import os, sys, gzip, pickle, json, re, csv
import numpy as np

res_dir, region, tcsv, out = sys.argv[1:5]
T = {r['osm']: r for r in csv.DictReader(open(tcsv, encoding='utf-8-sig'))}
dm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365]

def load(p):
    with (gzip.open(p, 'rb') if p.endswith('.gz') else open(p, 'rb')) as f:
        return pickle.load(f)

def f(x):
    return None if x is None else float(x)

rec = {}; blk = {}
files = sorted(os.listdir(res_dir))
for fn in files:
    if not (fn.endswith('.pkl') or fn.endswith('.pkl.gz')):
        continue
    try:
        R = load(os.path.join(res_dir, fn))
    except Exception as e:
        print('bad', fn, e); continue
    name, tag = R.get('name'), R.get('tag')
    if name is None or 'EUI' not in R:
        continue
    d = dict(EUI=f(R['EUI']), area=f(R['area']), peak_kW=f(R.get('peak_kW')), peak_idx=R.get('peak_idx'),
             UDI=f(R.get('UDI')), PMV_ok=f(R.get('PMV_ok')),
             warm=(R.get('err') or {}).get('warmup_nonconv'),
             eu={k: f(R.get(k)) for k in ('Cooling:Electricity', 'Heating:NaturalGas', 'InteriorLights:Electricity', 'Fans:Electricity',
                                          'Pumps:Electricity', 'HeatRejection:Electricity', 'InteriorEquipment:Electricity',
                                          'Electricity:Facility', 'NaturalGas:Facility', 'WaterSystems:NaturalGas')})
    for k in ('monthly_el_kWh', 'monthly_gas_kWh', 'monthly_cool_el_kWh', 'monthly_heat_gas_kWh'):
        if k in R: d[k] = [float(x) for x in R[k]]
    for k in ('win_inc', 'zone_udi'):
        if k in R and R[k] is not None: d[k] = {z: float(v) for z, v in R[k].items()}
    if 'zone' in R and R['zone'] is not None:
        d['zone'] = {z: {q: float(v.get(q, 0.0)) for q in ('light', 'cool', 'heat')} for z, v in R['zone'].items()}
    if 'hourly_heat_gas' in R and R['hourly_heat_gas'] is not None and len(R['hourly_heat_gas']) == 8760:
        h = np.asarray(R['hourly_heat_gas'], dtype=float); d['jan_heat'] = h[0:dm[1] * 24].reshape(-1, 24).mean(0).tolist()
    if 'hourly_kW' in R and R['hourly_kW'] is not None and len(R['hourly_kW']) == 8760:
        hk = np.asarray(R['hourly_kW'], dtype=float); d['jul_el'] = hk[dm[6] * 24:dm[7] * 24].reshape(-1, 24).mean(0).tolist()
        b = (T.get(name) or {}).get('block')
        if b:
            s = blk.setdefault((b, tag), [np.zeros(8760), 0.0, 0, 0.0])
            s[0] += hk; s[1] += hk.max(); s[2] += 1; s[3] += float(R['area'])
    if R.get('sizing'): d['sizing'] = R['sizing']
    if tag in ('S1c', 'S1@ns') and R.get('meta'):   # r4: 구동 횟수 산정용 기하(drive_counts.py와 같은 항목)
        m = R['meta']; d['meta'] = {k: (m[k].tolist() if hasattr(m.get(k), 'tolist') else m.get(k)) for k in ('ang', 'Lx', 'Ly', 'fh', 'bands', 'counts') if k in m}
    rec.setdefault(name, {})[tag] = d
B = {}
for (b, tag), (s, sp, n, ar) in blk.items():
    B.setdefault(b, {})[tag] = dict(n=n, area=ar, peak_kW=float(s.max()), peak_idx=int(s.argmax()), sum_peaks=sp, CF=float(s.max() / sp) if sp else None,
                                     EUI_el=float(s.sum() / ar) if ar else None)
json.dump(dict(region=region, n_buildings=len(rec), buildings=rec, blocks=B), open(out, 'w'), ensure_ascii=False)
print(region, 'buildings', len(rec), 'records', sum(len(v) for v in rec.values()), 'blocks', len(B))
