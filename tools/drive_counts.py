"""키네틱 장치의 연간 작동 횟수 산정 (2026-11-01)
원고 표 2의 작동 규칙을 기상 파일(서울 TMYx 2011–2025)·태양 위치(pvlib)·입면 방위에 적용해 10분 간격으로 센다.
주변 차폐는 EnergyPlus 결과의 창면 입사 일사(차폐 포함 ÷ 차폐 제외, 층대·입면별)를 직달일사에 곱해 반영한다.
출력: recalc/out/drive_counts.json — 건물·대안·입면별 창 면적, 각도 조절 횟수(tilt), 내림·올림 횟수(lift)
한계: EnergyPlus의 슬랫 각도 시계열은 저장되지 않아 규칙으로 다시 센 추정값이다. 각도 조절은 '직달일사가 창에 드는 10분 간격마다 1회'로 센다.
"""
import os, json, pickle, math, numpy as np, pandas as pd, pvlib
S = '/tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad'
RES = S + '/mb/res_sb10'; OUT = S + '/recalc/out'
EPW = S + '/data/tmyx2011_2025/KOR_SO_Seoul.WS.471080_TMYx.2011-2025.epw'
WWR = 0.40; LAT, LON, TZ = 37.5665, 126.9780, 9   # 기상 관측소 위치 근사(태양 위치용)
FAC = ['S', 'E', 'N', 'W']; AZ = {'S': 180, 'E': 90, 'N': 0, 'W': 270}
THR = 300.0

# --- 기상: 10분 간격으로 선형 보간 ---
df, meta = pvlib.iotools.read_epw(EPW)
idx = pd.date_range('2023-01-01 00:00', '2023-12-31 23:50', freq='10min', tz='Etc/GMT-9')
h = df[['dni', 'dhi', 'ghi']].copy(); h.index = pd.date_range('2023-01-01 00:30', periods=8760, freq='h', tz='Etc/GMT-9')   # EPW 시간값은 그 시간 끝 기준 → 중앙값으로 둠
w = h.reindex(h.index.union(idx)).interpolate('time').reindex(idx).fillna(0).clip(lower=0)
sp = pvlib.solarposition.get_solarposition(idx, LAT, LON)
alt = sp['apparent_elevation'].values; az = sp['azimuth'].values
up = alt > 0
mon = idx.month.values; dow = idx.dayofweek.values; hr = idx.hour.values + idx.minute.values / 60
cooling = (mon >= 5) & (mon <= 9)
weekday = dow < 5
dni, dhi, ghi = w['dni'].values, w['dhi'].values, w['ghi'].values

def facade_irr(azf):
    """수직면 입사 일사: 직달(cos 입사각), 확산(등방 0.5), 지면 반사(알베도 0.2)"""
    cosinc = np.cos(np.radians(alt)) * np.cos(np.radians(az - azf))
    beam = np.where(up & (cosinc > 0), dni * cosinc, 0.0)
    diff = 0.5 * dhi + 0.5 * 0.2 * ghi
    return beam, diff

def count(beam_shaded, total, tag):
    """규칙별 10분 간격 작동 횟수 (tilt: 각도 조절, lift: 내림/올림 또는 폐쇄/개방 전환)"""
    hasbeam = beam_shaded > 1.0
    if tag in ('S3', 'LH_C', 'VF_C'):   # 컷오프 각도 제어: 직달이 드는 간격마다 조절, 끝나면 수평으로 1회
        on = hasbeam; tilt = int(on.sum()); trans = int(np.sum(on[1:] & ~on[:-1]) + np.sum(~on[1:] & on[:-1]))
        return tilt, 0, trans   # 세 번째: 상태 전환(수평 복귀 포함) — tilt에 더함
    if tag in ('BT_T300', 'LT_T300'):   # 냉방기 5~9월, 창면 입사 > 300 W/m² 일 때 내림(컷오프 각도), 아니면 걷어 올림(블라인드)/수평(루버)
        on = cooling & (total > THR); lift = int(np.sum(on[1:] & ~on[:-1]) + np.sum(~on[1:] & on[:-1]))
        tilt = int(np.sum(on & hasbeam))
        return tilt, lift if tag == 'BT_T300' else 0, (lift if tag == 'LT_T300' else 0)
    if tag == 'PK':   # 평일 13~18시 폐쇄: 하루 2회 전환(폐쇄·개방)
        on = weekday & (hr >= 13) & (hr < 18); trans = int(np.sum(on[1:] & ~on[:-1]) + np.sum(~on[1:] & on[:-1]))
        return 0, 0, trans
    return 0, 0, 0

names = sorted({f.split('_S1c.pkl')[0] for f in os.listdir(RES) if f.endswith('_S1c.pkl')})
out = {}; skipped = []
for n in names:
    try:
        a = pickle.load(open(f'{RES}/{n}_S1c.pkl', 'rb')); b = pickle.load(open(f'{RES}/{n}_S1@ns.pkl', 'rb'))
    except Exception as e:
        skipped.append(n); continue
    m = a['meta']; ang = float(m['ang']); Lx, Ly, fh = float(m['Lx']), float(m['Ly']), float(m['fh'])
    bands = m['bands']; counts = m['counts']
    rec = {}
    for f in FAC:
        azf = (AZ[f] - ang) % 360
        beam, diff = facade_irr(azf)
        L = Lx if f in ('S', 'N') else Ly
        for bi, nfl in enumerate(counts):
            key = f'B{bi + 1}_{f}'
            wi_c, wi_n = a['win_inc'].get(key), b['win_inc'].get(key)
            r = min(1.0, wi_c / wi_n) if wi_c is not None and wi_n else 1.0
            bs = beam * r; total = bs + diff
            area = L * nfl * fh * WWR
            for tag in ['S3', 'LH_C', 'VF_C', 'BT_T300', 'LT_T300', 'PK']:
                if tag == 'VF_C' and f not in ('E', 'W'): continue
                tilt, lift, trans = count(bs, total, tag)
                rec.setdefault(tag, {}).setdefault(f, {'area': 0.0, 'tilt': 0.0, 'lift': 0.0})
                d = rec[tag][f]; d['area'] += area
                # 면적 가중 평균 횟수(모터 1대 기준) — 층대별 횟수를 창 면적으로 가중
                d['tilt'] += (tilt + (trans if tag in ('S3', 'LH_C', 'VF_C', 'PK', 'LT_T300') else 0)) * area
                d['lift'] += lift * area
    for tag in rec:
        for f in rec[tag]:
            d = rec[tag][f]
            if d['area'] > 0: d['tilt'] /= d['area']; d['lift'] /= d['area']
            d['area'] = round(d['area'], 1); d['tilt'] = round(d['tilt'], 1); d['lift'] = round(d['lift'], 1)
    out[n] = dict(area=a['area'], EUI=a['EUI'], rec=rec)
json.dump(dict(note=__doc__, n=len(out), skipped=skipped, data=out), open(OUT + '/drive_counts.json', 'w'), ensure_ascii=False)
print('buildings', len(out), 'skipped', skipped[:5])
ex = out.get('ARK') or out[names[0]]
for tag, fs in ex['rec'].items(): print(tag, {f: (v['area'], v['tilt'], v['lift']) for f, v in fs.items()})
