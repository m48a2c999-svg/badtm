# -*- coding: utf-8 -*-
"""검토 반영 분석(2026-11-01): ① 같은 작동 기간 비교(연중 / 냉방기), ② 워밍업 100일 민감도(20동, 전 대안·전 지표),
③ 모델 가정 민감도(40동, 냉동기 COP 배수 1.0 / 기기 밀도 1.3). 입력: mb/res_sb10/*.pkl. 출력: tools/derived/review.json
모든 값은 EnergyPlus 23.2 시뮬레이션 값이다."""
import os, json, pickle, glob
import numpy as np, pandas as pd
from scipy.stats import spearmanr
S = '/tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad'
R = S + '/mb/res_sb10'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'derived', 'review.json')
T = pd.read_csv(S + '/mb/targets_sb.csv').sim_name.tolist()
ALT = [('F0', 'F0c', '블라인드 고정'), ('LH_F0', 'LH_F0c', '수평 루버 고정'), ('VF_F0', 'VF_F0c', '수직 루버 고정'),
       ('S3', 'S3@c', '블라인드 컷오프 각도 제어'), ('LH_C', 'LH_C@c', '수평 루버 컷오프 각도 제어'), ('VF_C', 'VF_C@c', '수직 루버 컷오프 각도 제어'),
       ('BT_T300', 'BT_T300c', '블라인드 일사량 기준 제어'), ('LT_T300', 'LT_T300c', '수평 루버 일사량 기준 제어'), ('PKY', 'PKY@c', '피크 시간대 차양 폐쇄')]
_C = {}


def L(n, t):
    k = (n, t)
    if k not in _C:
        f = f'{R}/{n}_{t}.pkl'
        try:
            d = pickle.load(open(f, 'rb'))
            _C[k] = d if 'EUI' in d else None
        except Exception:
            _C[k] = None
    return _C[k]


def delta(n, t, b):
    x, y = L(n, t), L(n, b)
    if x is None or y is None: return None
    r = dict(EUI=100 * (x['EUI'] / y['EUI'] - 1), PK=100 * (x['peak_kW'] / y['peak_kW'] - 1))
    for k in ('UDI', 'PMV_ok'):
        r[k] = (x[k] - y[k]) if (x.get(k) is not None and y.get(k) is not None) else None
    return r


def summ(rows):
    D = [r for r in rows if r]
    if not D: return None
    e = np.array([r['EUI'] for r in D]); p = np.array([r['PK'] for r in D])
    u = np.array([r['UDI'] for r in D if r['UDI'] is not None]); m = np.array([r['PMV_ok'] for r in D if r['PMV_ok'] is not None])
    return dict(n=len(D), eui=float(np.median(e)), eui_dec=int((e < 0).sum()), pk=float(np.median(p)), pk_dec=int((p < 0).sum()),
                both=int(((e < 0) & (p < 0)).sum()), udi=float(np.median(u)) if len(u) else None, pmv=float(np.median(m)) if len(m) else None)


out = {}
# ① 같은 작동 기간 비교
yr = [('F0c', '블라인드 고정'), ('LH_F0c', '수평 루버 고정'), ('VF_F0c', '수직 루버 고정'), ('S3@c', '블라인드 컷오프 각도 제어'),
      ('LH_C@c', '수평 루버 컷오프 각도 제어'), ('VF_C@c', '수직 루버 컷오프 각도 제어'), ('BT_T300@y', '블라인드 일사량 기준 제어(연중)'),
      ('LT_T300@y', '수평 루버 일사량 기준 제어(연중)'), ('PKY@c', '피크 시간대 차양 폐쇄(연중)')]
cs = [('SC@c', '블라인드 컷오프 각도 제어(냉방기)'), ('LH_CS@c', '수평 루버 컷오프 각도 제어(냉방기)'), ('VF_CS@c', '수직 루버 컷오프 각도 제어(냉방기)'),
      ('BT_T300c', '블라인드 일사량 기준 제어(냉방기)'), ('LT_T300c', '수평 루버 일사량 기준 제어(냉방기)'), ('PKS@c', '피크 시간대 차양 폐쇄(냉방기)')]
out['same_period'] = {'yearround': [dict(tag=t, label=l, **(summ([delta(n, t, 'S1c') for n in T]) or {})) for t, l in yr],
                      'cooling': [dict(tag=t, label=l, **(summ([delta(n, t, 'S1c') for n in T]) or {})) for t, l in cs]}
# ② 워밍업 100일
W = sorted({os.path.basename(f).split('_S1c@w100')[0] for f in glob.glob(R + '/*_S1c@w100.pkl')} & set(T))
wu = []
for a, t, l in ALT:
    t100 = t.replace('@c', '') + '@w100'
    d = []
    for n in W:
        r25, r100 = delta(n, t, 'S1c'), delta(n, t100, 'S1c@w100')
        if r25 and r100:
            d.append({k: (r100[k] - r25[k]) if (r25[k] is not None and r100[k] is not None) else None for k in r25})
    if d:
        row = dict(alt=l, n=len(d))
        for k in ('EUI', 'PK', 'UDI', 'PMV_ok'):
            v = np.abs([x[k] for x in d if x[k] is not None])
            row[k + '_med'] = float(np.median(v)) if len(v) else None; row[k + '_max'] = float(v.max()) if len(v) else None
        row['sign_same'] = int(sum(np.sign(delta(n, t, 'S1c')['EUI']) == np.sign(delta(n, t100, 'S1c@w100')['EUI']) for n in W if delta(n, t, 'S1c') and delta(n, t100, 'S1c@w100')))
        wu.append(row)
out['warmup'] = dict(n_bldg=len(W), rows=wu)
# ③ 모델 가정 민감도
sel = json.load(open(S + '/mb/review_sens40.json'))
sens = []
for a, t, l in ALT:
    row = dict(alt=l)
    base = [delta(n, t, 'S1c') for n in sel]
    row['base'] = summ(base)
    for v in ('k10', 'e13'):
        dv = [delta(n, f'{a}@{v}', f'S1@{v}') for n in sel]
        row[v] = summ(dv)
        pairs = [(b['EUI'], x['EUI']) for b, x in zip(base, dv) if b and x]
        if len(pairs) >= 5:
            b_, x_ = np.array(pairs).T
            row[v + '_rho'] = float(spearmanr(b_, x_)[0]); row[v + '_sign_same'] = int((np.sign(b_) == np.sign(x_)).sum()); row[v + '_n'] = len(pairs)
    sens.append(row)
out['sensitivity'] = dict(n_bldg=len(sel), rows=sens)
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(json.dumps(out['same_period'], ensure_ascii=False, indent=0)[:3000])
print('warmup bldg', len(W), 'rows', len(wu), '| sens rows with k10', sum(1 for r in sens if r.get('k10')))
