# -*- coding: utf-8 -*-
"""r4 계산 목록: 네 지역 대상 전부 × (20개 기본 조건 + calc5와 같은 추가 9개 조건), 지역별 표본 40동 × 모델 가정 민감도 (2026-11-23)
기본 20개 = 개선 전과 9개 대안 × 주변 차폐 포함·제외(역삼 257동·3권역과 같음). 추가 9개 = 냉방 기간 작동 키네틱 4종(SC, LH_CS, VF_CS, PKS), 일사량 기준 제어 연중 2종(BT_T300__Y, LT_T300__Y),
블라인드 고정 야간 걷음(F0D), 수직 루버 장변 배치 2종(VF_F0X, VF_CX).
표본 40동: 257동 평균 차폐각 3분위 경계(14.637°·22.777°)의 세 구간에서 13·14·13동을 차폐각 순으로 고르게 고른다(구간 동수가 모자라면 그 구간 전부, 모자란 수는 다른 구간에 나눔).
강남 표본은 역삼 257동과 OSM ID가 같은 건물을 뺀 집합에서 고른다. 표본 20동(워밍업 100일) = 표본 40동의 짝수 번째, 그림자 매 계산 간격 갱신 4동 = 표본 40동의 5·17·26·36번째.
usage: python3 make_jobs_r4.py → shards/shard_00..19.json, r4_samples.json"""
import json, csv, os, math
import numpy as np
D = os.path.dirname(os.path.abspath(__file__)); SIMD = os.path.join(D, '..', 'r3', 'data', 'r3')
REGS = ['cbd', 'gbd', 'ybd', 'mpo']; B1, B2 = 14.637, 22.777
BASE10 = ['S1', 'F0', 'LH_F0', 'VF_F0', 'BT_T300', 'LT_T300', 'S3', 'LH_C', 'VF_C', 'PKY']
CTAG = {'S1': 'S1c', 'F0': 'F0c', 'LH_F0': 'LH_F0c', 'VF_F0': 'VF_F0c', 'BT_T300': 'BT_T300c', 'LT_T300': 'LT_T300c', 'S3': 'S3@c', 'LH_C': 'LH_C@c', 'VF_C': 'VF_C@c', 'PKY': 'PKY@c'}
ADD9 = ['SC@c', 'LH_CS@c', 'VF_CS@c', 'PKS@c', 'BT_T300__Y@c', 'LT_T300__Y@c', 'F0D@c', 'VF_F0X@c', 'VF_CX@c']
OV = {'epd_mult': 1.0, 'cop_mult': 2.0, '_enduse': True}
ids257 = set(json.load(open(os.path.join(D, 'ids_257.json'))))
summ = json.load(open(os.path.join(D, 'out', 'select_summary.json')))

def pick(rows, n_each=(13, 14, 13)):
    cls = [[r for r in rows if r['ob'] <= B1], [r for r in rows if B1 < r['ob'] <= B2], [r for r in rows if r['ob'] > B2]]
    q = list(n_each)
    for _ in range(3):
        deficit = sum(max(0, q[i] - len(cls[i])) for i in range(3))
        q = [min(q[i], len(cls[i])) for i in range(3)]
        spare = [i for i in range(3) if len(cls[i]) > q[i]]
        while deficit and spare:
            for i in list(spare):
                if deficit and len(cls[i]) > q[i]: q[i] += 1; deficit -= 1
                if len(cls[i]) <= q[i]: spare.remove(i)
    out = []
    for c, k in zip(cls, q):
        c = sorted(c, key=lambda r: (r['ob'], r['id']))
        if k: out += [c[int(round(x))] for x in np.linspace(0, len(c) - 1, k)]
    return [r['id'] for r in out]

jobs = []; samples = {'rule': __doc__.split('\n')[3:6], 'sample40': {}, 'sample20_warmup': {}, 'shadow_ts4': {}, 'fh_regions': []}
for reg in REGS:
    g = f'r4{reg}'
    T = list(csv.DictReader(open(os.path.join(SIMD, f'targets_sim_{g}.csv'), encoding='utf-8-sig')))
    ids = [t['osm'] for t in T]
    for i in ids:
        for b in BASE10:
            jobs.append([1, g, [i, CTAG[b], dict(OV), True]]); jobs.append([1, g, [i, f'{b}@ns', dict(OV, shading=False), True]])
        for t in ADD9: jobs.append([2, g, [i, t, dict(OV), True]])
    rows = [dict(id=t['osm'], ob=float(t['obstr_mean'])) for t in T if not (reg == 'gbd' and t['osm'] in ids257)]
    s40 = pick(rows); s20 = s40[::2]; s4 = [s40[k] for k in (4, 16, 25, 35)] if len(s40) >= 36 else [s40[int(round(x))] for x in np.linspace(0, len(s40) - 1, min(4, len(s40)))]
    samples['sample40'][reg] = s40; samples['sample20_warmup'][reg] = s20; samples['shadow_ts4'][reg] = s4
    fh = summ[reg]['nb_missing_median_pct'] > 0.5
    if fh: samples['fh_regions'].append(reg)
    for i in s40:
        for b in BASE10:
            jobs.append([3, g, [i, f'{b}@k10', dict(OV, cop_mult=1.0), True]]); jobs.append([3, g, [i, f'{b}@e13', dict(OV, epd_mult=1.3), True]])
            jobs.append([3, g, [i, f'{b}__SZ090@b1', dict(OV), True]]); jobs.append([3, g, [i, f'{b}__SZ110@b1', dict(OV), True]])
            jobs.append([4, g, [i, f'{b}__GLC@b3', dict(OV), True]]); jobs.append([4, g, [i, f'{b}__LE@b3', dict(OV), True]])
            jobs.append([4, g, [i, f'{b}@m2', dict(OV, shift=-2), True]]); jobs.append([4, g, [i, f'{b}@p2', dict(OV, shift=2), True]])
            if fh: jobs.append([5, g, [i, f'{b}__FH10.8@b2', dict(OV), True]]); jobs.append([5, g, [i, f'{b}__FH18@b2', dict(OV), True]])
    for i in s20:
        for b in BASE10: jobs.append([5, g, [i, f'{b}@w100', dict(OV, max_warmup=100), True]])
    for i in s4:
        for b in ('S1', 'F0', 'S3', 'BT_T300', 'PKY'): jobs.append([5, g, [i, f'{b}@ts', dict(OV, shadow_ts=True), True]])
    print(reg, 'targets', len(ids), 'sample40', len(s40), 'FH', fh)
# 같은 건물의 조건을 한 분담에 몰지 않도록 (물결, 지역, 건물) 순으로 섞어 20개 분담에 돌려 배정
jobs.sort(key=lambda j: (j[0], j[2][0], j[2][1]))
SH = [[] for _ in range(20)]
for k, j in enumerate(jobs): SH[k % 20].append(j)
os.makedirs(os.path.join(D, 'shards'), exist_ok=True)
for k, L in enumerate(SH): json.dump(L, open(os.path.join(D, 'shards', f'shard_{k:02d}.json'), 'w'))
json.dump(samples, open(os.path.join(D, 'r4_samples.json'), 'w'), ensure_ascii=False, indent=0)
from collections import Counter
print('jobs', len(jobs), Counter(j[0] for j in jobs), 'per shard', len(SH[0]))
