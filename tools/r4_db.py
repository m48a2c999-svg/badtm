"""네 지역(도심·강남·여의도·마포) 같은 규칙 자료(r4)의 결과를 연구 데이터베이스에 넣는다 (2026-11-23).
입력: tools/derived/r4/{unified4.json, compare257.json, drive4.json, select_summary.json, buildings_r4.csv}
- 이전 3권역 결과 표(r3_summary·r3_tertile·r3_blocks)는 r4 표로 대체한다(이전 CSV는 data/db/csv/_구버전_3권역/로 옮김).
- districts 표를 네 지역으로 갱신한다.
usage: python3 tools/r4_db.py"""
import json, os, sqlite3, shutil
import pandas as pd
W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(W, 'tools', 'derived', 'r4')
DB = os.path.join(W, 'data', 'db', 'research.sqlite'); CSV = os.path.join(W, 'data', 'db', 'csv')
U = json.load(open(os.path.join(D, 'unified4.json'), encoding='utf-8'))
C257 = json.load(open(os.path.join(D, 'compare257.json'), encoding='utf-8'))
DRV = json.load(open(os.path.join(D, 'drive4.json'), encoding='utf-8')) if os.path.exists(os.path.join(D, 'drive4.json')) else None
SEL = json.load(open(os.path.join(D, 'select_summary.json'), encoding='utf-8'))
LBL = {'F0': '블라인드 고정', 'LH_F0': '수평 루버 고정', 'VF_F0': '수직 루버 고정', 'S3': '블라인드 컷오프 각도 제어', 'LH_C': '수평 루버 컷오프 각도 제어', 'VF_C': '수직 루버 컷오프 각도 제어',
       'BT_T300': '블라인드 일사량 기준 제어', 'LT_T300': '수평 루버 일사량 기준 제어', 'PK': '피크 시간대 차양 폐쇄'}
ADDL = {'SC': '블라인드 컷오프 각도 제어(냉방 기간)', 'LH_CS': '수평 루버 컷오프 각도 제어(냉방 기간)', 'VF_CS': '수직 루버 컷오프 각도 제어(냉방 기간)', 'PKS': '피크 시간대 차양 폐쇄(냉방 기간)',
        'BT_T300Y': '블라인드 일사량 기준 제어(연중)', 'LT_T300Y': '수평 루버 일사량 기준 제어(연중)', 'F0D': '블라인드 고정(야간 걷음)', 'VF_F0X': '수직 루버 고정(장변 배치)', 'VF_CX': '수직 루버 컷오프 각도 제어(장변 배치)'}
VARL = {'k10': '냉동기 COP 배수 1.0', 'e13': '기기 전력밀도 배수 1.3', 'SZ090': '공조 용량 0.9배', 'SZ110': '공조 용량 1.1배', 'GLC': '창 사양: 투명 복층', 'LE': '창 사양: 로이 복층',
        'm2': '운영 스케줄 2시간 앞당김', 'p2': '운영 스케줄 2시간 늦춤', 'FH10.8': '높이 없는 주변 건물 10.8 m', 'FH18': '높이 없는 주변 건물 18 m', 'w100': '워밍업 최대 100일'}
ZONE = {'CBD': ('도심', '세종로·종로2·3가·종로4·5가·명동관광특구 지구단위계획구역 4개 + 도시정비형 재개발구역 등 23개(27개 구역)', 143.0),
        'GBD': ('강남', '테헤란로제2지구 지구단위계획구역', 95.9), 'YBD': ('여의도', '여의도 금융중심 지구단위계획구역(금융 특정개발진흥지구 포함)', 111.3),
        'MPO': ('마포', '마포대로에서 30 m 이내 상업지역(UPIS 용도지역 UQ111)', 16.6)}
RK = {'CBD': 'cbd', 'GBD': 'gbd', 'YBD': 'ybd', 'MPO': 'mpo'}
con = sqlite3.connect(DB)
for t in ('r3_summary', 'r3_tertile', 'r3_blocks') + tuple(f'r4_{x}' for x in ('areas', 'summary', 'tertile', 'fband', 'enduse', 'blocks', 'added', 'sens', 'drive', 'cmp257', 'buildings')):
    con.execute(f'DROP TABLE IF EXISTS {t}')
os.makedirs(os.path.join(CSV, '_구버전_3권역'), exist_ok=True)
for t in ('r3_summary', 'r3_tertile', 'r3_blocks'):
    p = os.path.join(CSV, f'{t}.csv')
    if os.path.exists(p): shutil.move(p, os.path.join(CSV, '_구버전_3권역', f'{t}.csv'))
G = U['areas']
con.execute('''CREATE TABLE r4_areas(area TEXT PRIMARY KEY, name TEXT, zone TEXT, zone_ha REAL, n_blocks INTEGER, n_blocks_target INTEGER, n_bld_in_blocks INTEGER, n INTEGER, n_main_office INTEGER, n_stat INTEGER,
  floors_med REAL, obstr_med REAL, n_low INTEGER, n_mid INTEGER, n_high INTEGER, nb_missing_pct REAL, EUI0_med REAL, EUI0_agg REAL, heat0 REAL, cool0 REAL, light0 REAL, UDI0_med REAL, PMV0_med REAL,
  valid_n INTEGER, cv_med REAL, nmbe_med REAL, pass_both INTEGER, valid_general_n INTEGER, cv_general_med REAL, nmbe_general_med REAL, pass_both_general INTEGER)''')
for A in ['CBD', 'GBD', 'YBD', 'MPO']:
    if A not in G: continue
    f = G[A]['form']; b = G[A]['base']; s = SEL[RK[A]]; v = G[A].get('valid') or {}; va = v.get('building_all') or {}; vs = v.get('building_general') or {}
    nbt = G[A]['blocks']['F0']['n_blocks'] if G[A].get('blocks') and 'F0' in G[A]['blocks'] else None
    con.execute('INSERT INTO r4_areas VALUES(' + ','.join('?' * 31) + ')', (A, ZONE[A][0], ZONE[A][1], ZONE[A][2], s['n_blocks'], nbt, s['n_bld_in_blocks'], f['n'], f['n_main_office'], f['n_stat'],
                f['floors_med'], f['obstr_med'], f['cls'].get('low', 0), f['cls'].get('mid', 0), f['cls'].get('high', 0), s['nb_missing_median_pct'], b['EUI_med'], b['EUI_agg'],
                b['enduse']['heat'], b['enduse']['cool'], b['enduse']['light'], b['UDI_med'], b['PMV_med'], va.get('n'), va.get('CV_med'), va.get('NMBE_med'), va.get('pass_both'), vs.get('n'), vs.get('CV_med'), vs.get('NMBE_med'), vs.get('pass_both')))
con.execute('''CREATE TABLE r4_summary(area TEXT, subset TEXT, alt TEXT, label TEXT, cond TEXT, n INTEGER, dEUI_med REAL, dEUI_q1 REAL, dEUI_q3 REAL, eui_dec INTEGER, dEUI_agg REAL, dpeak_med REAL, peak_dec INTEGER,
  both_dec INTEGER, dUDI_med REAL, dPMV_med REAL, rho_obstr REAL, rho_floors REAL, sign_flip INTEGER, sign_flip_big INTEGER, PRIMARY KEY(area, subset, alt, cond))''')
con.execute('CREATE TABLE r4_tertile(area TEXT, subset TEXT, alt TEXT, tertile TEXT, n INTEGER, dEUI_med REAL, eui_dec INTEGER, dpeak_med REAL, PRIMARY KEY(area, subset, alt, tertile))')
con.execute('CREATE TABLE r4_fband(area TEXT, alt TEXT, fband TEXT, n INTEGER, dEUI_med REAL, PRIMARY KEY(area, alt, fband))')
for A, R in G.items():
    for sub in ('all', 'stat', 'nopublic'):
        V = R.get(sub)
        if not V: continue
        for a in LBL:
            for cd, cn in (('with', '차폐 포함'), ('nosh', '차폐 제외')):
                x = V[cd].get(a)
                if not x: continue
                fl = V['flips'][a] if cd == 'with' else {}
                con.execute('INSERT INTO r4_summary VALUES(' + ','.join('?' * 20) + ')', (A, sub, a, LBL[a], cn, x['n'], x['eui'], x['eui_q1'], x['eui_q3'], x['eui_dec'], x['eui_agg'], x['pk'], x['pk_dec'], x['both'],
                            x['udi'], x['pmv'], x.get('rho_obstr'), x.get('rho_floors'), fl.get('flip'), fl.get('flip_big')))
            for t, x in V['tertile'][a].items():
                con.execute('INSERT INTO r4_tertile VALUES(?,?,?,?,?,?,?,?)', (A, sub, a, t, x['n'], x['eui'], x['eui_dec'], x['pk']))
            if sub == 'all':
                for fb, x in V['fband'][a].items(): con.execute('INSERT INTO r4_fband VALUES(?,?,?,?,?)', (A, a, fb, x['n'], x['eui']))
con.execute('CREATE TABLE r4_enduse(area TEXT, alt TEXT, heat REAL, cool REAL, light REAL, fan REAL, pump REAL, heat_rejection REAL, equip REAL, EUI REAL, PRIMARY KEY(area, alt))')
for A, R in G.items():
    e0 = R['base']['enduse']
    con.execute('INSERT INTO r4_enduse VALUES(?,?,?,?,?,?,?,?,?,?)', (A, 'S1(개선 전, 절대값)', e0['heat'], e0['cool'], e0['light'], e0['fan'], e0['pump'], e0['hr'], e0['equip'], R['base']['EUI_agg']))
    for a, e in R['enduse'].items():
        con.execute('INSERT INTO r4_enduse VALUES(?,?,?,?,?,?,?,?,?,?)', (A, a, e['heat'], e['cool'], e['light'], e['fan'], e['pump'], e['hr'], e['equip'], e['EUI']))
con.execute('CREATE TABLE r4_blocks(area TEXT, alt TEXT, label TEXT, n_blocks INTEGER, dEUI_med REAL, dpeak_med REAL, both_dec INTEGER, CF_med REAL, PRIMARY KEY(area, alt))')
for A, R in G.items():
    for a, x in (R.get('blocks') or {}).items():
        con.execute('INSERT INTO r4_blocks VALUES(?,?,?,?,?,?,?,?)', (A, a, LBL.get(a, '개선 전'), x['n_blocks'], x['deu_med'], x['dpk_med'], x['both'], x['cf_med']))
con.execute('CREATE TABLE r4_added(area TEXT, cond_key TEXT, label TEXT, n INTEGER, dEUI_med REAL, eui_dec INTEGER, dpeak_med REAL, base_dEUI_med REAL, base_eui_dec INTEGER, same_sign INTEGER, rho_obstr REAL, PRIMARY KEY(area, cond_key))')
for A, R in G.items():
    for k, x in (R.get('added') or {}).items():
        con.execute('INSERT INTO r4_added VALUES(?,?,?,?,?,?,?,?,?,?,?)', (A, k, ADDL[k], x['n'], x['eui'], x['eui_dec'], x['pk'], x['base_eui'], x['base_dec'], x['same_sign'], x['rho_obstr']))
con.execute('CREATE TABLE r4_sens(area TEXT, variant TEXT, label TEXT, alt TEXT, n INTEGER, base_dEUI_med REAL, var_dEUI_med REAL, same_sign INTEGER, rho REAL, absdiff_med REAL, absdiff_max REAL, PRIMARY KEY(area, variant, alt))')
for A, R in G.items():
    for vk, V in (R.get('sensitivity') or {}).items():
        if vk == 'ts': continue
        for a, x in V.items():
            con.execute('INSERT INTO r4_sens VALUES(?,?,?,?,?,?,?,?,?,?,?)', (A, vk, VARL[vk], 'PK' if a == 'PKY' else a, x['n'], x['base'], x['var'], x['same_sign'], x['rho'], x['absdiff_med'], x['absdiff_max']))
if DRV:
    con.execute('CREATE TABLE r4_drive(area TEXT, alt TEXT, n INTEGER, op_kWh_m2 REAL, drive_kWh_m2_sb05 REAL, dEUI_med REAL, dEUI_drive_med_sb0 REAL, dEUI_drive_med_sb05 REAL, dEUI_drive_med_sb1 REAL, dec INTEGER, dec_drive_sb05 INTEGER, PRIMARY KEY(area, alt))')
    for reg, R in DRV['areas'].items():
        for a, x in R.items():
            con.execute('INSERT INTO r4_drive VALUES(?,?,?,?,?,?,?,?,?,?,?)', (reg.upper(), a, x['n'], x['op_med'], x['ed_med']['0.5'], x['dEUI_med'], x['dEUI_drive_med']['0.0'], x['dEUI_drive_med']['0.5'], x['dEUI_drive_med']['1.0'], x['dec'], x['dec_drive']['0.5']))
con.execute('CREATE TABLE r4_cmp257(grp TEXT, alt TEXT, cond TEXT, n INTEGER, dEUI_med REAL, eui_dec INTEGER, dpeak_med REAL, PRIMARY KEY(grp, alt, cond))')
for g, nm in (('all257', '역삼 257동 전체'), ('in140', '역삼 257동 중 테헤란로제2지구 가구 안 140동')):
    for cd, cn in (('with', '차폐 포함'), ('nosh', '차폐 제외')):
        for a, x in C257['groups'][g][cd].items():
            con.execute('INSERT INTO r4_cmp257 VALUES(?,?,?,?,?,?,?)', (nm, a, cn, x['n'], x['eui'], x['eui_dec'], x['pk']))
S = C257.get('same') or {}
for cd, cn in (('with', '같은 건물(r4 강남)·차폐 포함'), ('nosh', '같은 건물(r4 강남)·차폐 제외')):
    for a, x in (S.get('alts') or {}).get(cd, {}).items():
        con.execute('INSERT INTO r4_cmp257 VALUES(?,?,?,?,?,?,?)', (cn + ' — 257동 값', a, cn, x['n'], x['med257'], None, None))
        con.execute('INSERT INTO r4_cmp257 VALUES(?,?,?,?,?,?,?)', (cn + ' — r4 값', a, cn, x['n'], x['medr4'], None, None))
# 건물별(지도·표용): 개선 전과 차폐 포함 대안별 EUI 변화
B = pd.read_csv(os.path.join(D, 'buildings_r4.csv'), encoding='utf-8-sig')
B.to_sql('r4_buildings', con, index=False)
# districts 갱신
con.execute('DELETE FROM districts')
for A in ['CBD', 'GBD', 'YBD', 'MPO']:
    if A not in G: continue
    s = SEL[RK[A]]; f = G[A]['form']
    con.execute('INSERT INTO districts VALUES(?,?,?,?,?)', (A, ZONE[A][0], f'{ZONE[A][1]}({ZONE[A][2]} ha, 가구 {s["n_blocks"]}개)',
                f'가구 안 건물 {s["n_bld_in_blocks"]:,}동(OpenStreetMap), 업무 용도 6층 이상 계산 대상 {f["n"]}동(주용도 업무시설 {f["n_main_office"]}동). 20개 조건 + 추가 9개 조건 + 표본 민감도 계산 완료.', '완료'))
con.execute("UPDATE meta SET value=replace(value, ?, ?) WHERE key='basis'", ('계산 대상은 오피스 조사 기준(주용도 업무시설, 6층 이상)을 참고하여 건축물대장 주용도 또는 기타 용도에 업무시설이 포함된 6층 이상 건물(3권역 536동 중 62동은 주용도가 업무시설이 아닌 복합 용도). 여의도는 금융중심지법에 따른 금융중심지(2009). 경계는 지구단위계획구역으로 정함.', '본 연구는 이 세 권역에서 네 지역(도심, 강남, 여의도, 마포)을 정함. 계산 대상은 오피스 조사 기준(주용도 업무시설, 6층 이상)을 참고하여 건축물대장 주용도 또는 기타 용도에 업무시설이 포함된 6층 이상 건물(네 지역 591동 중 70동은 주용도가 업무시설이 아니고 기타 용도에 업무시설이 있는 건물). 여의도는 금융중심지법에 따른 금융중심지(2009). 경계는 도심·강남·여의도는 업무 기능 지구단위계획구역, 마포는 마포대로에서 30 m 이내의 상업지역(용도지역)으로 정함.'))
con.execute("UPDATE meta SET value=? WHERE key='built'", (pd.Timestamp.now(tz='Asia/Seoul').strftime('%Y-%m-%d %H:%M KST'),))
con.commit()
for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'r4_%' OR name='districts' OR name='meta')").fetchall():
    pd.read_sql(f'SELECT * FROM {t}', con).to_csv(os.path.join(CSV, f'{t}.csv'), index=False, encoding='utf-8-sig')
con.execute('VACUUM'); con.close()
c2 = sqlite3.connect(DB)
for (t,) in c2.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'r4_%' ORDER BY name"):
    print(t, c2.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0])
print('DB', os.path.getsize(DB))
