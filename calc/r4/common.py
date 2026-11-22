# -*- coding: utf-8 -*-
"""r4(네 지역 같은 규칙) 공용 도구 — 기하(사이트 자료 생성기 gen.js와 같은 정의), API(카카오·건축HUB, 응답 캐시), 표제부 선택.
인증키는 환경변수(KAKAO_REST_KEY, DATA_GO_KR_KEY)로만 받고 파일·로그에 쓰지 않는다."""
import os, json, time, math, urllib.parse, urllib.request, xml.etree.ElementTree as ET

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'out'); os.makedirs(OUT, exist_ok=True)
REGIONS = {'cbd': '도심', 'gbd': '강남', 'ybd': '여의도', 'mpo': '마포'}
K1 = os.environ.get('DATA_GO_KR_KEY', '').strip(); K2 = os.environ.get('KAKAO_REST_KEY', '').strip()

# ---------------- 기하(gen.js와 같은 정의) ----------------
def centroid(r):   # 꼭짓점 평균(닫는 점 제외) — gen.js centroid
    n = (len(r) - 1) or 1
    return [sum(p[0] for p in r[:n]) / n, sum(p[1] for p in r[:n]) / n]

def ring_area(r, lat0):   # gen.js ringArea (MY = lat*110540)
    kx = 111320 * math.cos(math.radians(lat0)); a = 0.0
    j = len(r) - 1
    for i in range(len(r)):
        a += (r[j][0] * kx + r[i][0] * kx) * (r[j][1] * 110540 - r[i][1] * 110540); j = i
    return abs(a / 2)

def in_ring(pt, r):
    c = False; j = len(r) - 1
    for i in range(len(r)):
        xi, yi = r[i]; xj, yj = r[j]
        if ((yi > pt[1]) != (yj > pt[1])) and (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi): c = not c
        j = i
    return c

def in_poly(pt, rings): return bool(rings) and in_ring(pt, rings[0]) and not any(in_ring(pt, h) for h in rings[1:])
def polys_of(g): return [g['coordinates']] if g['type'] == 'Polygon' else (g['coordinates'] if g['type'] == 'MultiPolygon' else [])

def num(x):
    try:
        v = float(x); return v if math.isfinite(v) else None
    except Exception: return None

# ---------------- 캐시 ----------------
class Cache:
    def __init__(self, path):
        self.path = path; self.d = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    def get(self, k): return self.d.get(k)
    def put(self, k, v): self.d[k] = v
    def save(self): json.dump(self.d, open(self.path + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False); os.replace(self.path + '.tmp', self.path)

class LimitReached(Exception): pass

def hide(s):
    s = str(s)
    for k in (K1, K2):
        if k: s = s.replace(k, '***').replace(urllib.parse.quote(k, safe=''), '***')
    return s

STATS = {'kakao': 0, 'title': 0, 'energy': 0, 'errors': 0}

def http(url, headers=None, timeout=30, tries=4):
    last = None
    for k in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=timeout).read().decode('utf-8')
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (401, 403): raise RuntimeError(f'HTTP {e.code}')
            if e.code == 429: time.sleep(20 * (k + 1))
            else: time.sleep(3 * (k + 1))
        except Exception as e:
            last = e; time.sleep(3 * (k + 1))
    STATS['errors'] += 1
    raise RuntimeError(hide(repr(last))[:200])

def skey(): return urllib.parse.unquote(K1) if '%' in K1 else K1

# ---------------- 카카오: 좌표 → 법정동 코드·지번 ----------------
def kakao_lot(C, lon, lat):
    key = f'k:{lon:.7f},{lat:.7f}'
    v = C.get(key)
    if v is not None: return v
    h = {'Authorization': 'KakaoAK ' + K2}
    a = json.loads(http('https://dapi.kakao.com/v2/local/geo/coord2address.json?' + urllib.parse.urlencode({'x': f'{lon:.7f}', 'y': f'{lat:.7f}'}), h))
    r = json.loads(http('https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?' + urllib.parse.urlencode({'x': f'{lon:.7f}', 'y': f'{lat:.7f}'}), h))
    STATS['kakao'] += 2; time.sleep(0.03)
    d = (a.get('documents') or [None])[0] or {}
    ad = d.get('address'); rd = d.get('road_address') or {}
    b = next((x for x in r.get('documents') or [] if x.get('region_type') == 'B'), None)
    if not ad or not b: v = {'ok': False}
    else:
        bc = b.get('code'); sgg, bjd = bc[:5], bc[5:10]
        bun = (ad.get('main_address_no') or '0').zfill(4); ji = (ad.get('sub_address_no') or '0').zfill(4)
        v = dict(ok=True, sgg=sgg, bjd=bjd, plat='1' if ad.get('mountain_yn') == 'Y' else '0', bun=bun, ji=ji, jibun=f'{sgg}-{bjd}-{bun}-{ji}', addr=ad.get('address_name', ''),
                 road=rd.get('address_name', ''), road_bldg=rd.get('building_name', ''), b_code=bc, mountain=ad.get('mountain_yn', 'N'))
    C.put(key, v); return v

# ---------------- 건축HUB 표제부 ----------------
TITLE_F = dict(mgm='mgmBldrgstPk', bldNm='bldNm', dongNm='dongNm', mainPurps='mainPurpsCdNm', etcPurps='etcPurps', grndFlr='grndFlrCnt', ugrndFlr='ugrndFlrCnt', totArea='totArea',
               archArea='archArea', platArea='platArea', heit='heit', useAprDay='useAprDay', mainAtch='mainAtchGbCdNm', regstrKind='regstrKindCdNm', regstrGb='regstrGbCdNm',
               platPlc='platPlc', newPlatPlc='newPlatPlc', vlRatEstmTotArea='vlRatEstmTotArea', bun='bun', ji='ji')
OK_CODES = (None, '', '00', '0', '000', 'NORMAL SERVICE.', '03')   # 03 = NODATA

def _result(root):
    code = root.findtext('.//resultCode') or root.findtext('.//returnReasonCode')
    msg = root.findtext('.//resultMsg') or root.findtext('.//returnAuthMsg') or root.findtext('.//errMsg')
    return (code or '').strip(), (msg or '').strip()

def title(C, sgg, bjd, plat, bun, ji, force=False):
    """표제부 전체(그 지번). ji=None 이면 본번만으로 조회(부번 전체)."""
    key = f't:{sgg}-{bjd}-{plat}-{bun}-{ji if ji is not None else "*"}'
    v = C.get(key)
    if v is not None and not force: return v
    items = []; page = 1; status = 'ok'
    while True:
        q = {'serviceKey': skey(), 'sigunguCd': sgg, 'bjdongCd': bjd, 'platGbCd': plat, 'bun': bun, 'numOfRows': 100, 'pageNo': page}
        if ji is not None: q['ji'] = ji
        x = http('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?' + urllib.parse.urlencode(q)); STATS['title'] += 1
        try: root = ET.fromstring(x)
        except ET.ParseError:
            if 'LIMITED' in x or 'EXCEEDS' in x: raise LimitReached('title daily limit')
            status = 'parse_error'; break
        code, msg = _result(root)
        if code == '22' or 'LIMITED' in msg: raise LimitReached('title daily limit')
        if code not in OK_CODES: status = f'err{code}:{msg[:40]}'; break
        its = list(root.iter('item'))
        for it in its: items.append({k: (it.findtext(t) or '').strip() for k, t in TITLE_F.items()})
        tot = int(num(root.findtext('.//totalCount')) or 0)
        if page * 100 >= tot or not its: break
        page += 1
    time.sleep(0.03)
    v = dict(status=status, items=items)
    if status == 'ok': C.put(key, v)
    return v

def mains(items):
    return [i for i in items if i.get('mainAtch') in ('주건축물', '')] or []

def best_item(items):   # 3권역 규칙: 주건축물 가운데 연면적 최대
    m = mains(items) or items
    return max(m, key=lambda i: num(i.get('totArea')) or 0) if m else None

def is_office(it): return bool(it) and ('업무' in (it.get('mainPurps') or '') or '업무' in (it.get('etcPurps') or ''))

# ---------------- 건물에너지(월별) ----------------
def energy_month(C, cfg, op, L, ym):
    key = f'e:{op}:{L["jibun"]}:{L["plat"]}:{ym}'
    v = C.get(key)
    if v is not None: return v
    q = {'serviceKey': skey(), 'sigunguCd': L['sgg'], 'bjdongCd': L['bjd'], 'platGbCd': L['plat'], 'bun': L['bun'], 'ji': L['ji'], 'useYm': ym, 'numOfRows': 100, 'pageNo': 1}
    x = http(f'{cfg["base"]}/{op}?' + urllib.parse.urlencode(q)); STATS['energy'] += 1
    try: root = ET.fromstring(x)
    except ET.ParseError:
        if 'LIMITED' in x or 'EXCEEDS' in x: raise LimitReached('energy daily limit')
        return None
    code, msg = _result(root)
    if code == '22' or 'LIMITED' in msg: raise LimitReached('energy daily limit')
    if code not in OK_CODES: return None
    items = [{c.tag: (c.text or '').strip() for c in it} for it in root.iter('item')]
    v = dict(n=len(items), qty=sum(num(i.get(cfg['qty'])) or 0 for i in items) if items else None)
    C.put(key, v); time.sleep(0.02); return v
