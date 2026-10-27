"""2026-10-27 재계산(연중 같은 조건) 결과를 사이트 DB 입력으로 내보낸다.
입력: scratchpad/mb/res_sb10/*.pkl (257동), scratchpad/sim/res10/*.pkl (상세 3개 동), scratchpad/recalc/out/*.json
출력: tools/derived/recalc.json
태그: 차폐 포함 S1c·F0c·LH_F0c·VF_F0c·S3@c·LH_C@c·VF_C@c·BT_T300@y·LT_T300@y·PKY@c,
      차폐 제외 S1@ns·F0@ns·LH_F0@ns·VF_F0@ns·S3@ns·LH_C@ns·VF_C@ns·BT_T300@yns·LT_T300@yns·PKY@ns,
      이전 판(냉방기 한정) BT_T300c·LT_T300c
모든 값은 EnergyPlus 23.2 시뮬레이션 값이다.
"""
import os, json, pickle, sqlite3, sys
import numpy as np

S = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad'
W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = S + '/mb/res_sb10'; R3 = S + '/sim/res10'
WITH = {'S1': 'S1c', 'F0': 'F0c', 'LH_F0': 'LH_F0c', 'VF_F0': 'VF_F0c', 'S3': 'S3@c', 'LH_C': 'LH_C@c', 'VF_C': 'VF_C@c', 'BT_T300': 'BT_T300c', 'LT_T300': 'LT_T300c', 'PK': 'PKY@c'}
NOSH = {'S1': 'S1@ns', 'F0': 'F0@ns', 'LH_F0': 'LH_F0@ns', 'VF_F0': 'VF_F0@ns', 'S3': 'S3@ns', 'LH_C': 'LH_C@ns', 'VF_C': 'VF_C@ns', 'BT_T300': 'BT_T300@ns', 'LT_T300': 'LT_T300@ns', 'PK': 'PKY@ns'}
SEAS = {'BT_T300': 'BT_T300@y', 'LT_T300': 'LT_T300@y'}   # 2026-10-27 저자 결정: 일사량 기준 제어 본 대안 = 냉방기(5~9월). 연중 작동판은 비교용
ALTS = ['F0', 'LH_F0', 'VF_F0', 'S3', 'LH_C', 'VF_C', 'BT_T300', 'LT_T300', 'PK']
c = sqlite3.connect(os.path.join(W, 'data/db/research.sqlite'))
BL = dict(c.execute('SELECT sim_name, block FROM buildings').fetchall())
names = sorted(BL)

def L(n, t):
    f = f'{RES}/{n}_{t}.pkl'
    if not os.path.exists(f): return None
    d = pickle.load(open(f, 'rb'))
    if 'EUI' not in d or d['err'].get('severe', 1) != 0: return None
    return d

out = {'results': [], 'hourly': {}, 'by_block': {}, 'n_done': {}}
cache = {}
for n in names:
    for grp, M in (('with', WITH), ('nosh', NOSH), ('season', SEAS)):
        for a, t in M.items():
            d = L(n, t)
            if d is None: continue
            cache[(n, grp, a)] = d
for grp, M in (('with', WITH), ('nosh', NOSH), ('season', SEAS)):
    out['n_done'][grp] = {a: sum(1 for n in names if (n, grp, a) in cache) for a in M}

def rel(x, b, k): return None if x is None or b is None or x.get(k) is None or b.get(k) is None else (100 * (x[k] / b[k] - 1) if k in ('EUI', 'peak_kW') else x[k] - b[k])
for n in names:
    for grp, M in (('with', WITH), ('nosh', NOSH), ('season', SEAS)):
        base = cache.get((n, 'with' if grp == 'season' else grp, 'S1'))
        for a in M:
            d = cache.get((n, grp, a))
            if d is None: continue
            out['results'].append({'sim_name': n, 'cond': {'with': '차폐 포함', 'nosh': '차폐 제외', 'season': '차폐 포함(연중 작동)'}[grp], 'tag': a,
                                   'EUI': round(d['EUI'], 4), 'peak_kW': round(d['peak_kW'], 2), 'UDI': round(d.get('UDI'), 3) if d.get('UDI') is not None else None,
                                   'PMV_ok': round(d.get('PMV_ok'), 3) if d.get('PMV_ok') is not None else None,
                                   'heat': round(d['Heating:NaturalGas'], 3), 'cool': round(d['Cooling:Electricity'], 3), 'light': round(d['InteriorLights:Electricity'], 3),
                                   'dEUI_pct': None if a == 'S1' else rel(d, base, 'EUI'), 'dpeak_pct': None if a == 'S1' else rel(d, base, 'peak_kW'),
                                   'dUDI_pp': None if a == 'S1' else rel(d, base, 'UDI'), 'dPMV_pp': None if a == 'S1' else rel(d, base, 'PMV_ok')})

# 257동 합산 시간별(차폐 포함 10개 시나리오) — 모든 건물이 계산된 경우만
for a, t in WITH.items():
    if out['n_done']['with'][a] == len(names):
        out['hourly'][a] = [int(round(x)) for x in sum(np.asarray(cache[(n, 'with', a)]['hourly_kW'], float) for n in names)]
# 대블록별 지표(차폐 포함)
for b in sorted(set(BL.values())):
    ns = [n for n in names if BL[n] == b]
    h0 = sum(np.asarray(cache[(n, 'with', 'S1')]['hourly_kW'], float) for n in ns); E0 = sum(cache[(n, 'with', 'S1')]['EUI'] * cache[(n, 'with', 'S1')]['area'] for n in ns)
    A = sum(cache[(n, 'with', 'S1')]['area'] for n in ns)
    out['by_block'][b] = {'S1': {'peak': float(h0.max()), 'CF': float(h0.max() / sum(cache[(n, 'with', 'S1')]['peak_kW'] for n in ns)), 'EUI': float(E0 / A), 'hour': int(h0.argmax()), 'n': len(ns)}}
    for a in ALTS:
        if not all((n, 'with', a) in cache for n in ns): continue
        h = sum(np.asarray(cache[(n, 'with', a)]['hourly_kW'], float) for n in ns); E = sum(cache[(n, 'with', a)]['EUI'] * cache[(n, 'with', a)]['area'] for n in ns)
        out['by_block'][b][a] = {'peak': float(h.max()), 'dP': float(100 * (h.max() / h0.max() - 1)), 'CF': float(h.max() / sum(cache[(n, 'with', a)]['peak_kW'] for n in ns)),
                                 'EUI': float(E / A), 'dEUI': float(100 * (E / E0 - 1)), 'hour': int(h.argmax())}

# 상세 3개 동, 요약 표(분석 스크립트 결과)
RO = S + '/recalc/out'
for k, f in (('detailed3', 'table3_detailed.json'), ('summary', 'summary.json'), ('enduse', 'enduse.json'), ('gagu_with', 'gagu_with.json'), ('classes', 'classes.json')):
    p = os.path.join(RO, f)
    if os.path.exists(p): out[k] = json.load(open(p, encoding='utf-8'))
TERMS = [('대형 루버', '수평 루버'), ('수직 핀', '수직 루버'), ('태양 추종', '컷오프 각도 제어'), ('일사 기준', '일사량 기준 제어'), ('피크 시간 폐쇄', '피크 시간대 차양 폐쇄'), ('최대 전력', '피크전력'), ('개량', '성능 개선')]
txt = json.dumps(out, ensure_ascii=False, default=float)
for a, b in TERMS: txt = txt.replace(a, b)
txt = txt.replace('일사량 기준 제어 제어', '일사량 기준 제어').replace('피크전력 전력', '피크전력')
open(os.path.join(W, 'tools/derived/recalc.json'), 'w', encoding='utf-8').write(txt)
print(json.dumps(out['n_done'], ensure_ascii=False), len(out['results']), list(out['hourly']))
