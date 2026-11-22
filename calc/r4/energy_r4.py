# -*- coding: utf-8 -*-
"""r4 ④: 대상 지번의 월별 전기·가스 사용량 2023-01~2024-12 (건축HUB 건물에너지, 지번 합계) — 3권역 자료와 같은 형식 (2026-11-23)
usage: python3 energy_r4.py probe            # 서비스 주소·변수 확인(응답 코드와 항목 이름만 출력, 키는 출력하지 않음) → out/energy_api.json
       python3 energy_r4.py cbd gbd ybd mpo  # 수집. 3권역 자료(seed/badtm_energy_*.json)에 24개월이 모두 있는 지번은 그대로 쓴다.
출력: out/badtm_energy_{reg}.json"""
import os, sys, json, csv, time
from common import D, OUT, REGIONS, Cache, LimitReached, energy_month, num, hide, STATS, K1
C = Cache(os.path.join(OUT, 'cache_r4_energy.json'))
CAND = [dict(base='https://apis.data.go.kr/1613000/BldEngyHubService', el='getBeElctyUsgInfo', gas='getBeGasUsgInfo'),
        dict(base='https://apis.data.go.kr/1611000/BldEngyService', el='getBeElctyUsgInfo', gas='getBeGasUsgInfo')]
YM = [f'{y}{m:02d}' for y in (2023, 2024) for m in range(1, 13)]

def probe():
    import urllib.parse, xml.etree.ElementTree as ET
    from common import http, skey, _result
    L = dict(sgg='11560', bjd='11000', plat='0', bun='0060', ji='0000')   # 여의도동 60(3권역 자료에 값이 있는 지번)
    ok = None
    for c in CAND:
        for op in (c['el'], c['gas']):
            for extra in ({}, {'_type': 'xml'}):
                q = {'serviceKey': skey(), 'sigunguCd': L['sgg'], 'bjdongCd': L['bjd'], 'platGbCd': L['plat'], 'bun': L['bun'], 'ji': L['ji'], 'useYm': '202401', 'numOfRows': 10, 'pageNo': 1, **extra}
                try:
                    x = http(f'{c["base"]}/{op}?' + urllib.parse.urlencode(q), tries=2)
                    try:
                        root = ET.fromstring(x); code, msg = _result(root); items = [{e.tag: (e.text or '').strip() for e in it} for it in root.iter('item')]
                        print('PROBE', c['base'].split('/')[-2:], op, extra, 'code', code, 'msg', msg[:60], 'n', len(items), 'keys', sorted(items[0].keys()) if items else None)
                        if items:
                            print('   sample', {k: v for k, v in items[0].items() if k not in ('platPlc', 'newPlatPlc')})
                            if ok is None and op == c['el']:
                                qk = next((k for k in items[0] if 'qty' in k.lower() or 'usg' in k.lower() and k.lower() != 'useym'), None)
                                ok = dict(c, qty=qk)
                    except ET.ParseError: print('PROBE', c['base'].split('/')[-2:], op, 'non-xml', hide(x[:160]))
                except Exception as e: print('PROBE', c['base'].split('/')[-2:], op, 'ERROR', hide(repr(e))[:160])
                break
    if ok:
        json.dump(ok, open(os.path.join(OUT, 'energy_api.json'), 'w'), indent=1); print('energy_api', ok)
    return ok

def _month(cfg, op, L, ym):
    """한 달 값. 일시 오류는 None(캐시하지 않음, 다음 실행에서 다시 조회)."""
    try: return energy_month(C, cfg, op, L, ym)
    except LimitReached: raise
    except Exception as e:
        STATS['errors'] += 1; return None

def run(reg, cfg, workers=int(os.environ.get('ENERGY_WORKERS', '6'))):
    import threading
    from concurrent.futures import ThreadPoolExecutor
    lock = threading.Lock(); _put = C.put
    def put(k, v):
        with lock: _put(k, v)
    C.put = put
    def save():
        with lock: d = dict(C.d)
        json.dump(d, open(C.path + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False); os.replace(C.path + '.tmp', C.path)
    seed = {}
    f = os.path.join(D, f'seed/badtm_energy_{reg}.json')
    if os.path.exists(f): seed = json.load(open(f, encoding='utf-8'))['data']
    T = list(csv.DictReader(open(os.path.join(OUT, f'targets_{reg}.csv'), encoding='utf-8-sig')))
    R = {r['id']: r for r in json.load(open(os.path.join(OUT, f'badtm_register_{reg}.json'), encoding='utf-8'))['records']}
    lots = {}
    for t in T:
        r = R[t['id']]; L = r.get('lot')
        if not L: continue
        lots.setdefault(L['jibun'], [L, []])[1].append(t['id'])
    E = {}; done = True; n_seed = 0
    def write():
        json.dump(dict(region=REGIONS[reg], source=f'건축HUB 건물에너지 지번별 전기·가스 월별 사용량 2023-01~2024-12, 지번 합계; 3권역 자료(2026-11-01)에 있던 지번 {n_seed}개는 그 값을 씀; r4 2026-11-23', api=cfg, data=E),
                  open(os.path.join(OUT, f'badtm_energy_{reg}.json.tmp'), 'w', encoding='utf-8'), ensure_ascii=False)
        os.replace(os.path.join(OUT, f'badtm_energy_{reg}.json.tmp'), os.path.join(OUT, f'badtm_energy_{reg}.json'))
    def one(L):
        res = {}
        for ym in YM:
            for op in (cfg['el'], cfg['gas']): res[(op, ym)] = _month(cfg, op, L, ym)
        return res
    todo = []
    for jb, (L, ids) in sorted(lots.items()):
        s = seed.get(jb)
        if s and len(s.get('el') or {}) == 24 and len(s.get('gas') or {}) == 24:
            E[jb] = dict(ids=ids, el=s['el'], gas=s['gas'], complete=True, src='seed 2026-11-01'); n_seed += 1; continue
        if not cfg: E[jb] = dict(ids=ids, el=(s or {}).get('el', {}), gas=(s or {}).get('gas', {}), complete=False, src='seed(부분)' if s else 'none'); continue
        todo.append((jb, L, ids))
    try:
        with ThreadPoolExecutor(workers) as ex:
            for k, ((jb, L, ids), res) in enumerate(zip(todo, ex.map(lambda x: one(x[1]), todo))):
                el = {ym: v['qty'] for (op, ym), v in res.items() if op == cfg['el'] and v and v['qty'] is not None}
                gas = {ym: v['qty'] for (op, ym), v in res.items() if op == cfg['gas'] and v and v['qty'] is not None}
                E[jb] = dict(ids=ids, el=el, gas=gas, complete=all(v is not None for v in res.values()), src='api r4')
                if k % 10 == 0: save(); write(); print(reg, 'energy', k, '/', len(todo), dict(STATS), flush=True)
    except LimitReached as e:
        done = False; print('LIMIT', reg, e, flush=True)
    save(); write(); C.put = _put
    print(reg, 'lots', len(lots), 'seed', n_seed, 'api', len(todo), 'complete', sum(1 for v in E.values() if v['complete']), 'done', done, dict(STATS), flush=True)
    return done

if __name__ == '__main__':
    if not K1: sys.exit('DATA_GO_KR_KEY 필요')
    if sys.argv[1:] == ['probe']: probe(); sys.exit(0)
    cfgp = os.path.join(OUT, 'energy_api.json'); cfg = json.load(open(cfgp)) if os.path.exists(cfgp) else None
    for reg in sys.argv[1:]:
        if not run(reg, cfg): break
