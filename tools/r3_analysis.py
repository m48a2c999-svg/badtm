# -*- coding: utf-8 -*-
"""서울 오피스 3권역(여의도·마포, 도심, 강남) 계산 결과 분석. 입력: r3_buildings.csv, r3_blocks.csv, r3_status.json(맥 계산 요약, r3_summarize.py 출력)
출력: tools/derived/r3.json(권역별 대안 요약, 가려진 정도 구간, 차폐 포함·제외, 가구 단위), tools/derived/r3_buildings_delta.csv(건물×대안 변화)
역삼 257동과 같은 정의(개선 전 대비 변화율, 가려진 정도 구간 경계 14.6°·22.8°)를 쓴다. 모든 값은 EnergyPlus 23.2 시뮬레이션 값이다.
완료된 건물(20개 조건 모두 계산)만 쓴다."""
import os, sys, json
import numpy as np, pandas as pd
IN = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/Downloads/badtm_r3_summary'
HERE = os.path.dirname(os.path.abspath(__file__))
B = pd.read_csv(os.path.join(IN, 'r3_buildings.csv'))
K = pd.read_csv(os.path.join(IN, 'r3_blocks.csv'))
ST = json.load(open(os.path.join(IN, 'r3_status.json')))
ALT = [('F0', '블라인드 고정'), ('LH_F0', '수평 루버 고정'), ('VF_F0', '수직 루버 고정'), ('S3', '블라인드 컷오프 각도 제어'), ('LH_C', '수평 루버 컷오프 각도 제어'),
       ('VF_C', '수직 루버 컷오프 각도 제어'), ('BT_T300', '블라인드 일사량 기준 제어'), ('LT_T300', '수평 루버 일사량 기준 제어'), ('PKY', '피크 시간대 차양 폐쇄')]
WT = {'F0': 'F0c', 'LH_F0': 'LH_F0c', 'VF_F0': 'VF_F0c', 'S3': 'S3@c', 'LH_C': 'LH_C@c', 'VF_C': 'VF_C@c', 'BT_T300': 'BT_T300c', 'LT_T300': 'LT_T300c', 'PKY': 'PKY@c'}
NT = {a: a + '@ns' for a, _ in ALT}
REG = {'ybd': '여의도·마포', 'cbd': '도심', 'gbd': '강남'}
cnt = B.groupby(['region', 'osm']).tag.nunique()
complete = set(cnt[cnt == 20].index)
B = B[[ (r, o) in complete for r, o in zip(B.region, B.osm)]].copy()
P = B.set_index(['region', 'osm', 'tag'])


def deltas(base_tag, tagmap):
    out = []
    for (reg, osm), g in B.groupby(['region', 'osm']):
        g = g.set_index('tag')
        if base_tag not in g.index: continue
        b = g.loc[base_tag]
        for a, lab in ALT:
            t = tagmap[a]
            if t not in g.index: continue
            x = g.loc[t]
            out.append(dict(region=reg, osm=osm, alt=a, label=lab, obstr=float(b.obstr) if pd.notna(b.obstr) else np.nan, floors=b.floors,
                            dEUI=100 * (x.EUI / b.EUI - 1), dPK=100 * (x.peak_kW / b.peak_kW - 1),
                            dUDI=(x.UDI - b.UDI) if pd.notna(x.UDI) and pd.notna(b.UDI) else np.nan,
                            dPMV=(x.PMV_ok - b.PMV_ok) if pd.notna(x.PMV_ok) and pd.notna(b.PMV_ok) else np.nan,
                            dHeat=(x['Heating:NaturalGas'] - b['Heating:NaturalGas']), dCool=(x['Cooling:Electricity'] - b['Cooling:Electricity']),
                            dLight=(x['InteriorLights:Electricity'] - b['InteriorLights:Electricity'])))
    return pd.DataFrame(out)


DW = deltas('S1c', WT); DN = deltas('S1@ns', NT)
# 강남: 역삼 257동과 겹치는 건물(131동)은 257동 계산(같은 20개 조건, Linux EnergyPlus 23.2)을 그대로 쓰고 다시 계산하지 않았다.
EXPECTED = {'ybd': 79, 'cbd': 94, 'gbd': 363}
S_ = '/tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad'
TG = pd.read_csv(S_ + '/data/r3/targets_sim_gbd.csv', dtype={'osm': str})
import sqlite3
RC = pd.read_sql('SELECT * FROM results_257_cond', sqlite3.connect(os.path.join(HERE, '..', 'data', 'db', 'research.sqlite')))
ov = RC[RC.sim_name.isin(set(TG.osm))]
OB = TG.set_index('osm').obstr_mean.to_dict(); FL = TG.set_index('osm').floors.to_dict()
LAB = dict(ALT); AMAP = {'PK': 'PKY'}
add = {'차폐 포함': [], '차폐 제외': []}
for _, r in ov[ov.cond.isin(['차폐 포함', '차폐 제외'])].iterrows():
    a = AMAP.get(r.tag, r.tag)
    if a == 'S1': continue
    add[r.cond].append(dict(region='gbd', osm=r.sim_name, alt=a, label=LAB[a], obstr=OB.get(r.sim_name, np.nan), floors=FL.get(r.sim_name),
                            dEUI=r.dEUI_pct, dPK=r.dpeak_pct, dUDI=r.dUDI_pp, dPMV=r.dPMV_pp, dHeat=np.nan, dCool=np.nan, dLight=np.nan, src='257'))
DW['src'] = 'mac'; DN['src'] = 'mac'
DW = pd.concat([DW, pd.DataFrame(add['차폐 포함'])], ignore_index=True); DN = pd.concat([DN, pd.DataFrame(add['차폐 제외'])], ignore_index=True)
N_OV = ov.sim_name.nunique()
DW.to_csv(os.path.join(HERE, 'derived', 'r3_buildings_delta.csv'), index=False, encoding='utf-8-sig')


def summ(d):
    if len(d) == 0: return None
    return dict(n=int(len(d)), eui=float(d.dEUI.median()), eui_q1=float(d.dEUI.quantile(.25)), eui_q3=float(d.dEUI.quantile(.75)), eui_dec=int((d.dEUI < 0).sum()),
                pk=float(d.dPK.median()), pk_dec=int((d.dPK < 0).sum()), both=int(((d.dEUI < 0) & (d.dPK < 0)).sum()),
                udi=float(d.dUDI.median()) if d.dUDI.notna().any() else None, pmv=float(d.dPMV.median()) if d.dPMV.notna().any() else None)


def rho(x, y):
    m = x.notna() & y.notna()
    return float(x[m].rank().corr(y[m].rank())) if m.sum() >= 8 else None


out = dict(status=ST, regions={})
for reg in ['ybd', 'cbd', 'gbd']:
    nc = int(sum(1 for r, o in complete if r == reg)) + (N_OV if reg == 'gbd' else 0)
    R = dict(name=REG[reg], n_complete=nc, expected=EXPECTED[reg], complete=bool(nc >= EXPECTED[reg]), n_from_257=(N_OV if reg == 'gbd' else 0), alts=[])
    for a, lab in ALT:
        dw = DW[(DW.region == reg) & (DW.alt == a)]; dn = DN[(DN.region == reg) & (DN.alt == a)]
        row = dict(alt=a, label=lab, with_=summ(dw), nosh=summ(dn), rho_obstr=rho(dw.obstr, dw.dEUI))
        tert = {}
        for nm, lo, hi in (('low', -1e9, 14.6), ('mid', 14.6, 22.8), ('high', 22.8, 1e9)):
            s = dw[(dw.obstr > lo) & (dw.obstr <= hi)] if nm != 'low' else dw[dw.obstr <= hi]
            tert[nm] = summ(s)
        row['tertile'] = tert
        if len(dw) and len(dn):
            m = dw.set_index('osm').dEUI.to_frame('w').join(dn.set_index('osm').dEUI.to_frame('n'), how='inner')
            row['sign_flip'] = int((np.sign(m.w) != np.sign(m.n)).sum())
        R['alts'].append(row)
    # 가구 단위(차폐 포함): 가구 합산 EUI·피크 변화, 둘 다 감소한 가구 수 — 완료 건물만 들어간 가구
    kb = K[K.region == reg]
    if len(kb):
        kb = kb.copy(); kb['blk'] = kb.block
        base = kb[kb.tag == 'S1c'].set_index('blk')
        blk = []
        for a, lab in ALT:
            x = kb[kb.tag == WT[a]].set_index('blk')
            j = x.join(base, rsuffix='_b', how='inner')
            j = j[j.n == j.n_b]
            if len(j) == 0: continue
            de = 100 * (j.EUI / j.EUI_b - 1); dp = 100 * (j.peak_kW / j.peak_kW_b - 1)
            blk.append(dict(alt=a, label=lab, n_blocks=int(len(j)), eui_range=[float(de.min()), float(de.max())], eui_med=float(de.median()),
                            pk_med=float(dp.median()), both=int(((de < 0) & (dp < 0)).sum())))
        R['blocks'] = blk
    out['regions'][reg] = R
json.dump(out, open(os.path.join(HERE, 'derived', 'r3.json'), 'w'), ensure_ascii=False, indent=1, default=float)
for reg, R in out['regions'].items():
    print(reg, R['n_complete'], [(r['alt'], round(r['with_']['eui'], 2) if r['with_'] else None) for r in R['alts']])
