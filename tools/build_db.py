"""연구 데이터베이스(SQLite) 생성.
입력: archive/v11/data(사이트 v11 자료, EnergyPlus 결과 내보내기)와 계산 원자료(mb/*.csv).
출력: data/db/research.sqlite, data/db/csv/*.csv
모든 성능 값은 EnergyPlus 23.2 시뮬레이션 값이다. 실측은 건축HUB 월별 전기 사용량(2023–2024)만 가리킨다.
usage: python3 tools/build_db.py [MB_DIR]
"""
import json, os, sqlite3, sys, csv
import pandas as pd

W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(W, 'archive/v11/data')
MB = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad/mb'
OUT = os.path.join(W, 'data/db')
os.makedirs(os.path.join(OUT, 'csv'), exist_ok=True)
DB = os.path.join(OUT, 'research.sqlite')
if os.path.exists(DB):
    os.remove(DB)
con = sqlite3.connect(DB)
J = lambda p: json.load(open(os.path.join(A, p), encoding='utf-8'))

# ---------------- meta ----------------
meta = [
    ('title_ko', '서울 업무시설 밀집지역의 외피 개량에 따른 에너지 성능 검증 — 키네틱 파사드 적용 시뮬레이션을 중심으로 —'),
    ('title_en', 'Energy Performance Verification of Facade Retrofits in Office-Dense Areas of Seoul: A Simulation Study of Kinetic Facade Applications'),
    ('purpose', '본 연구는 서울 업무시설 밀집지역의 기존 건물을 대상으로 키네틱 파사드 및 외피 개량 대안을 적용하고, 시뮬레이션을 통해 개량 전후의 에너지 성능 변화를 비교·검증하여 건물 특성에 따른 효과와 적용 조건을 도출하는 데 목적이 있다.'),
    ('author', '조승완 · 국민대학교 일반대학원 건축학과 박사과정 · 지도교수 박미애'),
    ('engine', 'EnergyPlus 23.2, 서울 TMYx 2011–2025, 계산 간격 10분, 연간 8,760시간'),
    ('prototype', 'DOE 대형 사무소 기준 모델(Deru et al., 2011): 창면적비 40%, 창 U 3.24 W/m²·K, SHGC 0.39, 가시광 투과율 0.305'),
    ('calibration', '전역 배율: 기기 밀도 1.0 × 냉동기 COP 배수 2.0(보정용 31동으로 결정)'),
    ('status', '예비심사(2026-11-09) 원고 기준 예비 결과. 개량 대안과 지표를 확정한 뒤 재계산 예정.'),
    ('scope', '키네틱 파사드 = 외피 요소가 물리적으로 움직여 형태가 바뀌는 외피(블라인드·루버·핀). 움직이지 않고 물성이 바뀌는 전기변색 유리는 범위에서 제외(데이터는 참고로 보존).'),
    ('originality', '밀집지역이라는 조건(주변 건물에 가린 정도·평면 규모·층수)이 개량 효과의 크기와 방향을 바꾼다는 것을 실제 업무시설 257동으로 정량화하고 건물 조건별 적용 조건을 제시. 블록 합산 최대 전력은 동시계수 0.994로 건물별 합과 거의 같아 보조 지표.'),
    ('built', pd.Timestamp.now(tz='Asia/Seoul').strftime('%Y-%m-%d %H:%M KST')),
]
con.execute('CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)')
con.executemany('INSERT INTO meta VALUES(?,?)', meta)

# ---------------- blocks ----------------
T = J('targets257.json')
G = T['blocks']
con.execute('CREATE TABLE blocks(block TEXT PRIMARY KEY, name TEXT, area_ha REAL, n_buildings INTEGER, polygon TEXT, peak_S1c_kW REAL, CF_S1c REAL, EUI_S1c REAL, peak_time TEXT)')
B = J('block257.json')
bb = B['by_block']
bnames = {'NE': '북동(봉은사로·테헤란로·언주로·논현로)', 'NW': '북서(봉은사로·강남대로·테헤란로·논현로)',
          'SE': '남동(테헤란로·역삼로·언주로·논현로)', 'SW': '남서(테헤란로·강남대로·역삼로·논현로)'}
for k, v in G['blocks'].items():
    s = bb[k]['S1c']
    con.execute('INSERT INTO blocks VALUES(?,?,?,?,?,?,?,?,?)', (k, bnames.get(k, k), v['area_ha'], s['n'], json.dumps(v['latlng']), round(s['peak'], 1), round(s['CF'], 4), round(s['EUI'], 2), s['when']))
con.execute('CREATE TABLE block_meta(key TEXT PRIMARY KEY, value TEXT)')
con.executemany('INSERT INTO block_meta VALUES(?,?)', [('center', json.dumps(G['center'])), ('roads', json.dumps(G['roads'], ensure_ascii=False))])

# ---------------- buildings ----------------
F = pd.read_csv(os.path.join(MB, 'features_sb10.csv'))
TS = pd.read_csv(os.path.join(MB, 'targets_sb.csv'), dtype={'key': str})
F = F.merge(TS[['sim_name', 'useAprDay', 'purp', 'archArea']], on='sim_name', how='left')
F = F.set_index('sim_name')
rows = []
for t in T['targets']:
    n = t['sim']; f = F.loc[n]
    yr = int(f.useAprDay // 10000) if pd.notna(f.useAprDay) else None
    ll = t.get('ll')
    cen = [round(sum(p[0] for p in ll) / len(ll), 6), round(sum(p[1] for p in ll) / len(ll), 6)] if ll else [None, None]
    base = t.get('base') or {}
    meas = t.get('meas') or {}
    rows.append(dict(sim_name=n, osm_id=t['osm'], name=t['name'], block=t['q'], role=('상세 모델' if t['role'] == 'detailed' else '다수 건물 모델'),
                     use_register=f.purp, floors=t['floors'], height_m=t['height'], gross_area_m2=t['totArea'], footprint_model_m2=round(float(f.fp_area), 1),
                     approval_year=yr, aspect=round(float(f.aspect), 3), orient_deg=round(float(f.ang), 2), n_neighbors=int(f.n_nb),
                     obstruction_deg=round(float(f.obstr_mean), 2), sky_view_proxy=round(float(f.svf_proxy), 3), surf_vol=round(float(f.surf_vol), 4),
                     split={'calib': '보정용', 'cal': '보정용', 'test': '시험용'}.get(t.get('split'), t.get('split')),
                     base_EUI=base.get('EUI'), base_peak_kW=base.get('peak'), base_UDI=base.get('UDI'), base_PMV_ok=base.get('PMV'),
                     cv_rmse_cal=meas.get('CV'), nmbe_cal=meas.get('NMBE'), cv_rmse_uncal=meas.get('CV_uncal'),
                     shift_D1_h=t.get('D1'), shift_D2_h=t.get('D2'), lat=cen[0], lon=cen[1], polygon=json.dumps(ll) if ll else None))
BD = pd.DataFrame(rows)
# 구간(건물 특성 비교용): 층수 고정 경계, 평면 면적·가린 정도는 3분위
BD['floors_class'] = pd.cut(BD.floors, [0, 10, 20, 999], labels=['6~10층', '11~20층', '21층 이상']).astype(str)
BD['footprint_class'] = pd.qcut(BD.footprint_model_m2, 3, labels=['소', '중', '대']).astype(str)
BD['obstruction_class'] = pd.qcut(BD.obstruction_deg, 3, labels=['적게 가림', '중간', '많이 가림']).astype(str)
BD['era_class'] = pd.cut(BD.approval_year.astype(float), [0, 1995, 2005, 2100], labels=['1995년 이전', '1996~2005년', '2006년 이후']).astype(str).replace('nan', '미상')
BD.to_sql('buildings', con, index=False)
q = {c: [round(float(x), 1) for x in pd.qcut(BD[c], 3, retbins=True)[1][1:3]] for c in ('footprint_model_m2', 'obstruction_deg')}
con.execute("INSERT INTO meta VALUES('class_bounds', ?)", (json.dumps(q),))

# ---------------- alternatives ----------------
ALT = [
    # tag, 구분, 이름, 장치, 작동, 기간, 미작동 시, 주광, 원리, 3동, 257동, 257동 태그
    ('S1', '개량 전', '장치 없음', '—', '주변 건물 차폐만 반영', '—', '—', '—', None, 1, 1, 'S1c'),
    ('F0', '고정형 차양', '블라인드 고정', '외부 블라인드 80 mm, 4개 입면', '슬랫 수평(0°) 고정', '연중', '창 앞', '주광 손실', None, 1, 1, 'F0c'),
    ('LH_F0', '고정형 차양', '대형 루버 고정', '대형 수평 루버 300 mm, 4개 입면', '수평 고정', '연중', '창 앞', '주광 손실', None, 1, 1, 'LH_F0c'),
    ('VF_F0', '고정형 차양', '수직 핀 고정', '수직 핀 300 mm, 동·서 입면', '고정', '연중', '창 앞', '주광 손실', None, 1, 1, 'VF_F0c'),
    ('S3', '키네틱 파사드', '블라인드 태양 추종', '외부 블라인드 80 mm', '직사광을 막는 각도로 슬랫을 매시 조절(컷오프)', '연중', '창 앞(추종)', '주광 손실', 'P2', 1, 0, None),
    ('BT_T300', '키네틱 파사드', '블라인드 일사 기준', '외부 블라인드 80 mm', '창면 일사 300 W/m² 초과 시 내림(컷오프)', '5~9월', '걷어 올림', '주광 유지', None, 1, 1, 'BT_T300c'),
    ('LT_T300', '키네틱 파사드', '대형 루버 일사 기준', '대형 수평 루버 300 mm', '창면 일사 300 W/m² 초과 시 컷오프', '5~9월', '창 앞(수평)', '주광 손실', None, 1, 1, 'LT_T300c'),
    ('EC_DLS', '범위 제외(가변 유리)', '전기변색 주광 연동', '전기변색 유리(SHGC 0.39 ↔ 0.09)', '기준점 500 lx를 유지하도록 착색 정도를 연속 조절', '5~9월', '투명', '주광 유지', None, 1, 1, 'EC_DLSc'),
    ('EC_SOLS', '범위 제외(가변 유리)', '전기변색 일사 기준', '전기변색 유리', '창면 일사 300 W/m² 초과 시 착색', '5~9월', '투명', '주광 유지', None, 1, 0, None),
    ('PK', '키네틱 파사드', '피크 시간 폐쇄', '외부 블라인드 80 mm', '수평 고정 + 7~8월 평일 13~18시 폐쇄', '연중', '창 앞', '주광 손실', None, 1, 0, None),
    ('BT_TS300', '키네틱 파사드(원리 시험)', '블라인드 두 신호', '외부 블라인드 80 mm', '창면 일사 300 W/m² 초과이고 실온 23.5 °C 초과일 때만 내림', '5~9월', '걷어 올림', '주광 유지', 'P3', 1, 0, None),
    ('EC_TS300', '범위 제외(가변 유리)', '전기변색 두 신호', '전기변색 유리', '창면 일사 300 W/m² 초과이고 실온 23.5 °C 초과일 때만 착색', '5~9월', '투명', '주광 유지', 'P3', 1, 0, None),
    ('LH_C', '키네틱 파사드', '대형 루버 태양 추종', '대형 수평 루버 300 mm', '컷오프 연속 추종', '연중', '창 앞(추종)', '주광 손실', 'P2', 1, 0, None),
    ('VF_C', '키네틱 파사드', '수직 핀 태양 추종', '수직 핀 300 mm, 동·서', '컷오프 연속 추종', '연중', '창 앞(추종)', '주광 손실', 'P2', 1, 0, None),
    ('ZA', '키네틱 파사드(원리 시험)', '구역 차등 A', '외부 블라인드 80 mm', '가려진 구역 장치 없음, 나머지 구역 태양 추종', '연중', '창 앞', '주광 손실', 'P1', 1, 0, None),
    ('ZB', '키네틱 파사드(원리 시험)', '구역 차등 B', '외부 블라인드 80 mm', '가려진 구역 수평 고정, 나머지 구역 태양 추종', '연중', '창 앞', '주광 손실', 'P1', 1, 0, None),
]
con.execute('''CREATE TABLE alternatives(tag TEXT PRIMARY KEY, category TEXT, name TEXT, device TEXT, operation TEXT, period TEXT, idle_state TEXT, daylight TEXT,
               principle TEXT, in_3bldg INTEGER, in_257 INTEGER, tag_257 TEXT, sort INTEGER)''')
con.executemany('INSERT INTO alternatives VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', [a + (i,) for i, a in enumerate(ALT)])

# ---------------- results: 3 detailed buildings (block of 3) ----------------
K = J('v/kinetic.json')
N3 = K['buildings']
con.execute('CREATE TABLE results_3bldg(tag TEXT PRIMARY KEY, dEUI_pct REAL, dpeak_pct REAL, CF REAL, dUDI_ARK REAL, dUDI_GFC REAL, dUDI_GST REAL, dPMV_ARK REAL, dPMV_GFC REAL, dPMV_GST REAL)')
for s in K['systems']:
    if s['tag'] not in {a[0] for a in ALT} or s.get('dEUI') is None:
        continue
    u, p = s['dUDI'], s['dPMV']
    con.execute('INSERT INTO results_3bldg VALUES(?,?,?,?,?,?,?,?,?,?)', (s['tag'], s['dEUI'], s['dP'], s['CF'], *u, *p))
con.execute("INSERT INTO meta VALUES('base_3bldg', ?)", (json.dumps({'EUI': 145.58, 'peak_kW': 9875, 'buildings': N3}),))

# ---------------- results: 257 buildings ----------------
S = pd.read_csv(os.path.join(MB, 'sb10_sys.csv'))
S = S.rename(columns={'tag': 'tag_257', 'PMV_ok': 'PMV_ok'})
inv = {a[11]: a[0] for a in ALT if a[11]}
S['tag'] = S.tag_257.map(inv)
S = S[['sim_name', 'tag', 'EUI', 'peak_kW', 'UDI', 'PMV_ok', 'dEUI_pct', 'dpeak_pct', 'dUDI_pp', 'dPMV_pp']].round(4)
S.to_sql('results_257', con, index=False)
con.execute('CREATE INDEX ix_r257 ON results_257(tag, sim_name)')

# ---------------- block (257) ----------------
con.execute('CREATE TABLE block_257(scenario TEXT PRIMARY KEY, label TEXT, tag TEXT, peak_kW REAL, dpeak_pct REAL, CF REAL, LF REAL, peak_hour INTEGER, dEUI_pct REAL)')
BEUI = {'S1c': 0.0, 'F0c': -1.25, 'LH_F0c': -0.38, 'VF_F0c': -0.29, 'EC_DLSc': -0.12, 'BT_T300c': -0.12, 'LT_T300c': -0.37}  # 학위논문 v12 표 5-17
lab = {'S1c': ('개량 전(장치 없음)', 'S1'), 'F0c': ('블라인드 고정', 'F0'), 'LH_F0c': ('대형 루버 고정', 'LH_F0'), 'VF_F0c': ('수직 핀 고정', 'VF_F0'),
       'EC_DLSc': ('전기변색 주광 연동', 'EC_DLS'), 'BT_T300c': ('블라인드 일사 기준', 'BT_T300'), 'LT_T300c': ('대형 루버 일사 기준', 'LT_T300'),
       'S1c_D1': ('참고: 운전 시간 시차 ±1시간, 장치 없음', None), 'S1c_D2': ('참고: 운전 시간 시차 ±2시간, 장치 없음', None)}
for k, v in B['summary'].items():
    con.execute('INSERT INTO block_257 VALUES(?,?,?,?,?,?,?,?,?)', (k, lab[k][0], lab[k][1], v['peak'], v['dP'], v['CF'], v['LF'], v['hour'], BEUI.get(k)))
con.execute('CREATE TABLE block_257_by_block(block TEXT, scenario TEXT, peak_kW REAL, dpeak_pct REAL, CF REAL, EUI REAL, dEUI_pct REAL, peak_time TEXT, PRIMARY KEY(block, scenario))')
for b, d in bb.items():
    for sc, v in d.items():
        R = lambda x, k: None if x is None else round(x, k)
        con.execute('INSERT INTO block_257_by_block VALUES(?,?,?,?,?,?,?,?)', (b, sc, R(v['peak'], 1), R(v['dP_pct'], 3), R(v['CF'], 4), R(v.get('EUI'), 2), R(v.get('dEUI_pct'), 3), v['when']))
con.execute('CREATE TABLE block_257_hourly(scenario TEXT, hour INTEGER, kW INTEGER, PRIMARY KEY(scenario, hour)) WITHOUT ROWID')
for sc, arr in B['hourly'].items():
    con.executemany('INSERT INTO block_257_hourly VALUES(?,?,?)', [(sc, i, int(x)) for i, x in enumerate(arr)])

# ---------------- validation ----------------
VR = T['validation']
con.execute('CREATE TABLE validation(subset TEXT, stage TEXT, n INTEGER, cv_rmse_median REAL, cv_rmse_q1 REAL, cv_rmse_q3 REAL, nmbe_median REAL, n_pass_g14 INTEGER, PRIMARY KEY(subset, stage))')
for sub, lab2 in (('calib31', '보정용 31동'), ('test_all', '시험용 215동')):
    for st, l3 in (('uncal', '보정 전'), ('cal', '보정 후')):
        v = VR[sub][st]
        con.execute('INSERT INTO validation VALUES(?,?,?,?,?,?,?,?)', (lab2, l3, v['n'], round(v['CV_med'], 1), round(v['CV_q1'], 1), round(v['CV_q3'], 1), round(v['NMBE_med'], 1), v['pass_both']))
con.execute('CREATE TABLE monthly(sim_name TEXT, idx INTEGER, measured REAL, simulated REAL, PRIMARY KEY(sim_name, idx)) WITHOUT ROWID')
for t in T['targets']:
    m = t.get('meas')
    if m and m.get('m_meas') and m.get('m_sim'):
        con.executemany('INSERT INTO monthly VALUES(?,?,?,?)', [(t['sim'], i, a, b) for i, (a, b) in enumerate(zip(m['m_meas'], m['m_sim']))])

# ---------------- principles ----------------
PR = [
    ('P1', '공간 분화', '피부', '피부는 부위마다 땀샘·혈류가 달라 필요한 곳에서만 체온을 조절한다.', '부하가 크고 효과가 나는 구역에만 가동 장치를 둔다(입면 4개 × 층대 5개 = 20개 구역 판정).',
     'ZB / 전 구역 태양 추종(S3)', '채택(ZB) · 기각(ZA)', 'ZB는 S3보다 EUI(+0.80% / +0.82%)와 블록 최대 전력(+1.35% / +1.80%)이 낮고 UDI·열쾌적이 같거나 높음. ZA는 열쾌적 1.7~2.1%p 낮아 기각. 둘 다 개량 전보다는 EUI·최대 전력이 높음.'),
    ('P2', '일사 조절', '솔방울·해바라기', '솔방울 비늘은 습도에 따라, 해바라기는 태양 위치에 따라 연속적·가역적으로 움직인다.', '태양 위치에 따라 직사광을 막는 각도로 연속 조절한다(태양 추종, 컷오프).',
     '태양 추종 / 같은 장치의 고정', '기각', '블라인드·대형 루버·수직 핀 모두 태양 추종이 고정보다 EUI가 크고(+0.82 / −1.39%, +0.46 / −0.86%, +0.70 / −0.13%) 열쾌적 2.4~6.3%p 낮음.'),
    ('P3', '신호 통합', '잎의 기공', '기공은 빛·이산화탄소·수분 등 여러 신호를 함께 판단해 열고 닫는다.', '창면 일사와 실내 온도가 함께 기준을 넘을 때만 작동한다(일사 300 W/m² 초과이고 실온 23.5 °C 초과, 5~9월).',
     '두 신호 / 일사 한 신호(블라인드)', '기각', '블라인드는 EUI(−0.32% / −0.30%)·최대 전력(−0.52% / −0.48%)은 나았으나 UDI 0.1~0.2%p 낮아 기각. 참고: 전기변색 유리 두 신호 안은 이전 계산에서 채택이었으나 전기변색 유리를 연구 범위에서 제외함.'),
    ('P4', '집단 분산', '꿀벌 무리', '꿀벌은 개체마다 반응 기준이 달라 무리 전체의 반응이 한꺼번에 몰리지 않는다.', '같은 자극에 대한 작동 기준을 건물마다 다르게 배정한다(200~400 W/m²).',
     '125가지 분산 배정 / 모든 건물 300 W/m²', '기각', '분산 배정의 블록 최대 전력은 균일 배정 대비 −0.09~+0.20%로 낮아지지 않음.'),
]
con.execute('CREATE TABLE principles(code TEXT PRIMARY KEY, name TEXT, organism TEXT, biology TEXT, rule TEXT, comparison TEXT, verdict TEXT, evidence TEXT)')
con.executemany('INSERT INTO principles VALUES(?,?,?,?,?,?,?,?)', PR)

# ---------------- districts (plan) ----------------
DS = [
    ('GBD', '강남', '테헤란로 일대(강남역~삼성역)', '역삼역사거리 4개 대블록 257동 계산 완료(예비 결과). 나머지 블록은 확장 예정.', '진행 중'),
    ('CBD', '서울도심', '광화문·시청·종각·을지로 일대', '간선도로 기준 블록 구분, 블록 안 모든 건물 자료 확보 예정(공공데이터 포털·건축HUB, 브라우저로 내려받기).', '계획'),
    ('YBD', '여의도', '여의도 업무지구', '간선도로 기준 블록 구분, 블록 안 모든 건물 자료 확보 예정.', '계획'),
]
con.execute('CREATE TABLE districts(code TEXT PRIMARY KEY, name TEXT, extent TEXT, note TEXT, status TEXT)')
con.executemany('INSERT INTO districts VALUES(?,?,?,?,?)', DS)

# ---------------- views ----------------
con.executescript('''
CREATE VIEW v_results AS
  SELECT r.*, a.name AS alt_name, a.category, a.daylight, b.name AS bldg_name, b.block, b.floors, b.floors_class, b.footprint_model_m2, b.footprint_class,
         b.obstruction_deg, b.obstruction_class, b.approval_year, b.era_class, b.role
  FROM results_257 r JOIN alternatives a ON a.tag = r.tag JOIN buildings b ON b.sim_name = r.sim_name;
''')
con.commit()

# CSV exports
for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall():
    if t == 'block_257_hourly':
        continue
    df = pd.read_sql(f'SELECT * FROM {t}', con)
    df.to_csv(os.path.join(OUT, 'csv', f'{t}.csv'), index=False, encoding='utf-8-sig')
con.execute('VACUUM')
con.close()
print('DB', os.path.getsize(DB), 'bytes')
c2 = sqlite3.connect(DB)
for (t,) in c2.execute("SELECT name FROM sqlite_master WHERE type in ('table','view') ORDER BY name"):
    print(t, c2.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0])
