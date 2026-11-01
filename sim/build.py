"""Reconstructed EnergyPlus model generator (Yeoksam 3 buildings).
DOE RefBldgLargeOfficeNew2004 -> footprint/orientation/floors from OSM, 5 floor bands with multipliers,
exterior louvers (WindowMaterial:Blind) per facade x band zone (20 control zones), surrounding buildings as shading.
"""
import re, math, os, sys, json
import numpy as np
from geom import B, TARGETS, FLOORS, eq_rect, centroid, height, AREA_SCALE

EP = '/opt/ep/EnergyPlus-23.2.0-7636e6b3e9-Linux-Ubuntu22.04-x86_64'
REF = EP + '/ExampleFiles/RefBldgLargeOfficeNew2004_Chicago.idf'
HERE = os.path.dirname(os.path.abspath(__file__))
EPW = HERE + '/../data/tmyx2011_2025/KOR_SO_Seoul.WS.471080_TMYx.2011-2025.epw'
DDY = HERE + '/../data/tmyx2011_2025/KOR_SO_Seoul.WS.471080_TMYx.2011-2025.ddy'
FH0 = 3.9624            # reference floor-to-floor
LX0, LY0 = 73.1070, 48.7381
PD = 4.5732             # perimeter depth
FAC = {1: 'S', 2: 'E', 3: 'N', 4: 'W'}   # ZN_1 south, 2 east, 3 north, 4 west
BANDS = ['B1', 'B2', 'B3', 'B4', 'B5']    # 최하층, 저층대, 중층대, 고층대, 최상층


def parse(txt):
    body = re.sub(r'!.*', '', txt)
    objs = []
    for o in body.split(';'):
        f = [x.strip() for x in o.split(',')]
        if f and f[0]:
            objs.append(f)
    return objs


def dump(objs):
    return '\n'.join(',\n    '.join(o) + ';\n' for o in objs)


def pmap(v, L0, L):
    if v <= PD + 1e-6:
        return v
    if v >= L0 - PD - 1e-6:
        return L - (L0 - v)
    return PD + (v - PD) * (L - 2 * PD) / (L0 - 2 * PD)


def band_floors(name):
    N, counts = FLOORS[name]
    out = []
    f = 1
    for c in counts:
        out.append((f, f + c - 1))
        f += c
    assert f - 1 == N
    return out


def neighbors(name):
    byid = {b['id']: b for b in B}
    tb = byid[TARGETS[name]]
    c = eq_rect(tb)['c']
    out = []
    for b in B:
        if b['id'] == tb['id']:
            continue
        h = height(b)
        if h is None:
            continue
        d = np.linalg.norm(centroid(b['p']) - c)
        if d <= 350 and h / d >= 0.2:
            out.append((b, h))
    return out


def _shift_arr(arr, sh):
    return arr[-sh:] + arr[:-sh]


def _emit(out, arr):
    for h in range(24):
        if h == 23 or arr[h + 1] != arr[h]:
            out += ['Until: %02d:00' % (h + 1), arr[h]]


def shift_compact(o, sh, keep_dd=True):
    """Shift every day profile of a Schedule:Compact by sh hours (wrap-around within the day, hourly resolution).
    keep_dd=True (2026-10-17 capacity fix): design-day profiles are NOT shifted, so autosizing (design days only)
    gives the same HVAC capacities as the unshifted base model; only the annual operation is shifted."""
    DD = ('SummerDesignDay', 'WinterDesignDay')
    head = o[:3]; out = list(head); i = 3; assigned = set()
    while i < len(o):
        f = o[i]
        if re.match(r'\s*Through:', f):
            out.append(f); i += 1; assigned = set(); continue
        if re.match(r'\s*For:', f):
            toks = f.split(':', 1)[1].split(); i += 1
            hv = []
            while i < len(o) and re.match(r'\s*Until:', o[i]):
                m = re.match(r'\s*Until:\s*(\d+):(\d+)', o[i]); assert m.group(2) == '00', o[i]
                hv.append((int(m.group(1)), o[i + 1])); i += 2
            arr = []; prev = 0
            for hh, v in hv:
                arr += [v] * (hh - prev); prev = hh
            assert len(arr) == 24, (o[1], hv)
            if not keep_dd:
                out.append(f); _emit(out, _shift_arr(arr, sh)); continue
            if 'AllDays' in toks:
                toks = [x for x in toks if x != 'AllDays'] + list(DD) + ['AllOtherDays']
            dd_here = [x for x in toks if x in DD]
            if 'AllOtherDays' in toks:
                dd_here += [x for x in DD if x not in assigned and x not in dd_here]
            rest = [x for x in toks if x not in DD]
            if dd_here:
                out.append('For: ' + ' '.join(dd_here)); _emit(out, arr); assigned.update(dd_here)
            if rest:
                out.append('For: ' + ' '.join(rest)); _emit(out, _shift_arr(arr, sh))
            continue
        # lines like 'For WinterDesignDay' (missing colon in the reference IDF) are passed through unshifted
        if re.match(r'\s*For\s', f):
            for x in DD:
                if x in f: assigned.add(x)
        out.append(f); i += 1
    return out

def build(name, scen, run_weather=True, extra_outputs=True):
    """scen: dict with keys
       shading: bool (surrounding buildings)
       louver: None | dict zone_key->('fixed',theta)|('cutoff',)|('sched',sched_name)|None   zone_key like 'B3_S'
    """
    ref = parse(open(REF).read())
    N, counts = FLOORS[name]
    bf = band_floors(name)
    tb = {b['id']: b for b in B}[TARGETS[name]]
    er = eq_rect(tb)
    H = height(tb)
    Lx, Ly, ang = er['L'], er['W'], er['ang']
    _asc = scen.get('area_scale', AREA_SCALE.get(TARGETS[name], 1.0))   # v10 default: register-based floor area (same centroid, aspect, orientation); scen area_scale=1.0 -> OSM outline
    if _asc and _asc != 1.0:
        Lx, Ly = Lx * math.sqrt(_asc), Ly * math.sqrt(_asc)
    fh = H / N
    zrep = {}
    for i, (a, b) in enumerate(bf):
        cen = (a + b) / 2.0
        zrep[BANDS[i]] = (cen - 1) * fh if 0 < i < 4 else ((N - 1) * fh if i == 4 else 0.0)
    zrep['B5'] = (N - 1) * fh

    drop_types = {'SizingPeriod:DesignDay', 'Site:Location', 'RunPeriodControl:DaylightSavingTime',
                  'Output:Variable', 'Output:Meter', 'Output:Table:Monthly', 'Output:Table:TimeBins',
                  'Output:SQLite', 'Output:Surfaces:Drawing', 'Output:Surfaces:List', 'Output:Constructions',
                  'Output:VariableDictionary', 'UtilityCost:Tariff', 'UtilityCost:Qualify',
                  'UtilityCost:Charge:Simple', 'UtilityCost:Charge:Block', 'UtilityCost:Variable',
                  'Output:Table:SummaryReports', 'OutputControl:Table:Style', 'Output:EnvironmentalImpactFactors',
                  'EnvironmentalImpactFactors', 'FuelFactors', 'OutputControl:ReportingTolerances'}
    objs = [o for o in ref if o[0] not in drop_types]

    # ---- clone mid band (B3) into B2 and B4 ----
    pat = re.compile(r'Core_mid|Perimeter_mid|MidFloor_Plenum|VAV_2', re.I)
    skip_types = {'ScheduleTypeLimits'}
    tok = {'B2': ('Core_low', 'Perimeter_low', 'LowFloor_Plenum', 'VAV_L'),
           'B4': ('Core_high', 'Perimeter_high', 'HighFloor_Plenum', 'VAV_H')}
    new = []
    plant_branch_map = {}
    for o in objs:
        if o[0] in skip_types:
            continue
        s = ','.join(o)
        if not pat.search(s):
            continue
        for bk, (c, p, pl, v) in tok.items():
            o2 = [re.sub('VAV_2', v, re.sub('MidFloor_Plenum', pl, re.sub('Perimeter_mid', p, re.sub('Core_mid', c, x, flags=re.I), flags=re.I), flags=re.I), flags=re.I) for x in o]
            if o[0] == 'Branch' and not pat.search(o[1]):
                o2[1] = o[1] + ' ' + bk
                plant_branch_map.setdefault(o[1], []).append(o2[1])
            if o[0] == 'WaterUse:Connections' and False:
                pass
            new.append(o2)
    # plant lists: insert cloned branch names
    for o in objs:
        if o[0] in ('BranchList', 'Connector:Splitter', 'Connector:Mixer'):
            i = 1
            while i < len(o):
                if o[i] in plant_branch_map and (o[0] != 'Connector:Mixer' or i > 2) and (o[0] != 'Connector:Splitter' or i > 2):
                    for nm in plant_branch_map[o[i]][::-1]:
                        o.insert(i + 1, nm)
                    i += len(plant_branch_map[o[i]])
                i += 1
    objs += new

    # ---- band membership of zones ----
    def band_of(s):
        if re.search(r'_bot|_bottom|GroundFloor', s): return 'B1'
        if re.search(r'_low|LowFloor', s): return 'B2'
        if re.search(r'_mid|MidFloor', s): return 'B3'
        if re.search(r'_high|HighFloor', s): return 'B4'
        if re.search(r'_top|TopFloor|Building_Roof', s): return 'B5'
        return None

    zone_ref_z = {'B1': 0.0, 'B2': 5 * FH0, 'B3': 5 * FH0, 'B4': 5 * FH0, 'B5': 11 * FH0}
    mult = {'B1': 1, 'B2': counts[1], 'B3': counts[2], 'B4': counts[3], 'B5': 1}

    for o in objs:
        if o[0] == 'Zone':
            bnd = band_of(o[1])
            if bnd:
                o[7] = str(mult[bnd])
        if o[0] in ('BuildingSurface:Detailed', 'FenestrationSurface:Detailed'):
            # zone of surface
            if o[0] == 'BuildingSurface:Detailed':
                zn = o[4]
                nv_idx = 10
            else:
                zn = o[4]  # building surface name
                nv_idx = 9
            bnd = band_of(o[1]) or band_of(zn)
            # vertices start: find numeric triples at end
            # BuildingSurface: fields 0 type,1 name,2 type,3 constr,4 zone,5 space,6 obc,7 obco,8 sun,9 wind,10 viewfactor,11 nverts, then xyz
            if o[0] == 'BuildingSurface:Detailed':
                start = 12
            else:
                # Fenestration: 0 type,1 name,2 type,3 constr,4 bsurf,5 obc,6 viewfactor,7 frame,8 multiplier,9 nverts, xyz
                start = 10
            wwr = scen.get('wwr')
            for k in range(start, len(o), 3):
                x, y, z = float(o[k]), float(o[k + 1]), float(o[k + 2])
                if wwr and o[0] == 'FenestrationSurface:Detailed':
                    zf = z - (zone_ref_z[bnd] if bnd else 0.0)  # height above reference floor
                    hwin = wwr * FH0
                    lo, hi = 0.1, 0.1 + hwin
                    z = (zone_ref_z[bnd] if bnd else 0.0) + (lo if zf < 1.7 else hi)
                x = pmap(x, LX0, Lx)
                y = pmap(y, LY0, Ly)
                if bnd in ('B2', 'B3', 'B4', 'B5'):
                    z = z - zone_ref_z[bnd] + zrep[bnd]
                o[k], o[k + 1], o[k + 2] = '%.4f' % x, '%.4f' % y, '%.4f' % z
        if o[0] == 'Building':
            o[2] = '%.2f' % (-ang)
            o[6] = 'FullExterior'
            if scen.get('max_warmup'): o[7] = str(int(scen['max_warmup']))   # v10 warm-up robustness check
        if o[0] == 'Timestep':
            o[1] = str(int(scen.get('timestep', 6)))   # v10 (2026-10-20): default 6 steps/h (10 min), as the DOE prototype; 15 min did not converge for tall models
        if o[0] == 'ShadowCalculation':
            # PolygonClipping, Periodic, 20
            o[1:] = ['PolygonClipping', 'Periodic', '20', '15000']
        if o[0] == 'SimulationControl':
            o[5] = 'YES' if run_weather else 'NO'
            o[4] = 'NO'
        if o[0] == 'RunPeriod':
            o[8] = ''  # day of week -> from weather file
    # ---- operating-schedule time shift (building-specific schedule diversity) ----
    sh = scen.get('shift', 0)
    if sh:
        SHIFT_SCH = {'BLDG_OCC_SCH', 'BLDG_LIGHT_SCH', 'BLDG_EQUIP_SCH', 'HVACOperationSchd', 'CLGSETP_SCH', 'HTGSETP_SCH',
                     'MinOA_MotorizedDamper_Sched', 'INFIL_QUARTER_ON_SCH', 'BLDG_SWH_SCH', 'BLDG_ELEVATORS'}
        for o in objs:
            if o[0] == 'Schedule:Compact' and o[1] in SHIFT_SCH:
                o[:] = shift_compact(o, sh)
    # ---- multi-building (v50, 2026-10-16): size-consistent absolute loads + calibration multipliers ----
    # all keys optional; absent -> IDF identical to the 3-building version
    if scen.get('abs_scale'):
        # reference DOE large office: 12 floors + basement, 73.107 x 48.738 m -> 46,320 m2
        ref_area = 13 * LX0 * LY0
        mod_area = (N + 1) * Lx * Ly           # modelled floors + basement (same rule as reference)
        fa = mod_area / ref_area
        ff = (Lx * Ly) / (LX0 * LY0)           # per-floor footprint ratio (SWH flow is per floor zone)
        for o in objs:
            if o[0] == 'Exterior:Lights':
                o[3] = '%.3f' % (float(o[3]) * fa)
            elif o[0] == 'Exterior:FuelEquipment' and o[1] == 'Elevators':
                o[4] = '%.3f' % (float(o[4]) * fa)
            elif o[0] == 'WaterUse:Equipment':
                o[3] = '%.6g' % (float(o[3]) * ff)
    for key, typ in (('epd_mult', 'ElectricEquipment'), ('lpd_mult', 'Lights')):
        mlt = scen.get(key)
        if mlt is not None and mlt != 1.0:
            for o in objs:
                if o[0] == typ and o[4] == 'Watts/Area':
                    o[6] = '%.4f' % (float(o[6]) * mlt)
    glz = scen.get('glz')   # 2026-10-19 sensitivity: base window (U, SHGC, VT); EC clear state follows the base window
    if glz:
        for o in objs:
            if o[0] == 'WindowMaterial:SimpleGlazingSystem' and o[1] == 'NonRes Fixed Assembly Window':
                o[2:] = ['%.4f' % glz[0], '%.4f' % glz[1], '%.4f' % glz[2]]
    cm = scen.get('cop_mult')
    if cm is not None and cm != 1.0:
        for o in objs:
            if o[0] == 'Chiller:Electric:ReformulatedEIR':
                o[3] = '%.4f' % (float(o[3]) * cm)
    bm = scen.get('base_mult')   # scales the unoccupied-hours (night/weekend) plug fraction of BLDG_EQUIP_SCH
    if bm is not None and bm != 1.0:
        for o in objs:
            if o[0] == 'Schedule:Compact' and o[1] == 'BLDG_EQUIP_SCH':
                for i in range(len(o) - 1):
                    if o[i].startswith('Until:') and float(o[i + 1]) <= 0.40 + 1e-9:
                        o[i + 1] = '%.3f' % min(1.0, float(o[i + 1]) * bm)
    # ---- location + design days from ddy ----
    ddy = parse(open(DDY).read())
    loc = [o for o in ddy if o[0] == 'Site:Location'][0]
    dds = [o for o in ddy if o[0] == 'SizingPeriod:DesignDay' and
           (('Htg 99.6% Condns DB' in o[1]) or ('Clg 1% Condns DB=>MWB' in o[1]))]
    assert len(dds) == 2, [o[1] for o in ddy if o[0] == 'SizingPeriod:DesignDay']
    objs += [loc] + dds

    # ---- world placement: local->world: R(ang) * local + T ----
    a = math.radians(ang)
    R = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])
    T = er['c'] - R @ np.array([Lx / 2, Ly / 2])

    # ---- shading (surrounding buildings, faces toward target) ----
    if scen.get('shading', True):
        for b, h in neighbors(name):
            r = eq_rect(b)
            _ns = 1.0 if scen.get('osm_geom') else AREA_SCALE.get(b['id'], 1.0)   # v10: neighbours that are register-matched targets use the same floor-area scale
            if _ns != 1.0:
                r = dict(r, L=r['L'] * math.sqrt(_ns), W=r['W'] * math.sqrt(_ns))
            ca, sa = math.cos(math.radians(r['ang'])), math.sin(math.radians(r['ang']))
            ux, uy = np.array([ca, sa]), np.array([-sa, ca])
            c = r['c']
            corners = [c + (-r['L'] / 2) * ux + (-r['W'] / 2) * uy, c + (r['L'] / 2) * ux + (-r['W'] / 2) * uy,
                       c + (r['L'] / 2) * ux + (r['W'] / 2) * uy, c + (-r['L'] / 2) * ux + (r['W'] / 2) * uy]
            for i in range(4):
                p1, p2 = corners[i], corners[(i + 1) % 4]
                mid = (p1 + p2) / 2
                n = np.array([(p2 - p1)[1], -(p2 - p1)[0]])  # outward for CCW polygon
                if np.dot(n, er['c'] - mid) <= 0:
                    continue  # face not toward target
                q1, q2 = p1 - T, p2 - T
                # world coords relative to building origin (Shading:Site is in world coords; building origin at T)
                verts = [(q1[0], q1[1], h), (q1[0], q1[1], 0.0), (q2[0], q2[1], 0.0), (q2[0], q2[1], h)]
                o = ['Shading:Site:Detailed', 'SH_%s_%d' % (b['id'], i), '', '4']
                for v in verts:
                    o += ['%.3f' % v[0], '%.3f' % v[1], '%.3f' % v[2]]
                objs.append(o)

    # ---- daylighting (perimeter zones, ref point 3 m from window, 0.8 m) ----
    for bi, bnd in enumerate(BANDS):
        tag = {'B1': 'bot', 'B2': 'low', 'B3': 'mid', 'B4': 'high', 'B5': 'top'}[bnd]
        z0 = zrep[bnd]
        for zn in (1, 2, 3, 4):
            zone = 'Perimeter_%s_ZN_%d' % (tag, zn)
            if zn == 1: x, y = Lx / 2, 3.0
            if zn == 2: x, y = Lx - 3.0, Ly / 2
            if zn == 3: x, y = Lx / 2, Ly - 3.0
            if zn == 4: x, y = 3.0, Ly / 2
            objs.append(['Daylighting:ReferencePoint', zone + '_DRP', zone, '%.3f' % x, '%.3f' % y, '%.3f' % (z0 + 0.8)])
            objs.append(['Daylighting:Controls', zone + '_DC', zone, 'SplitFlux', '', 'Continuous', '0.3', '0.2', '', '',
                         '', '', '22', '', zone + '_DRP', '1.0', '500'])

    # ---- louvers / vertical fins / electrochromic glazing ----
    lv = scen.get('louver') or {}
    fins = scen.get('fins') or {}
    ec = scen.get('ec') or {}
    _hmax = scen.get('dev_max_h')   # v10: devices only on bands whose representative floor is below this height (wind-rating limit of exterior blinds)
    if _hmax:
        _keep = lambda d: {k: v for k, v in d.items() if zrep[k.split('_')[0]] <= _hmax}
        lv, fins, ec = _keep(lv), _keep(fins), _keep(ec)
    lmat = scen.get('louver_mat', 'ExtLouver')
    assert not (set(lv) & set(fins)) and not (set(lv) & set(ec)) and not (set(fins) & set(ec))
    if lv or fins or ec:
        # 80 mm exterior venetian blind (original), 300 mm large horizontal louver, 300 mm vertical fin: same slat optics
        em = str(scen.get('slat_em', 0.9))   # slat long-wave emissivity (default 0.9; sensitivity tag *_EM10 uses 0.1)
        opt = ['221', '0', '0.88', '0.88', '0', '0.88', '0.88', '0', '0.88', '0.88', '0', '0.88', '0.88', '0', em, em]
        objs.append(['WindowMaterial:Blind', 'ExtLouver', 'Horizontal', '0.080', '0.085', '0.001', '90'] + opt +
                    ['0.150', '0.5', '0.5', '0.5', '0.5', '0', '180'])
        if lmat == 'ExtLouverL': objs.append(['WindowMaterial:Blind', 'ExtLouverL', 'Horizontal', '0.300', '0.250', '0.020', '90'] + opt +
                    ['0.200', '0.5', '0.5', '0.5', '0.5', '5', '175'])
        if fins: objs.append(['WindowMaterial:Blind', 'ExtFin', 'Vertical', '0.300', '0.250', '0.020', '90'] + opt +
                    ['0.200', '0.5', '0.5', '0.5', '0.5', '5', '175'])
        # electrochromic: clear state = base window (U 3.24, SHGC 0.39, VT 0.305); tinted state = View tint-4 SHGC 0.09, VT 0.01
        if ec:
            objs.append(['WindowMaterial:SimpleGlazingSystem', 'EC Tinted Glass', '3.23646', '0.09', '0.01'])
            objs.append(['Construction', 'Window EC Tinted', 'EC Tinted Glass'])
            objs.append(['Schedule:Compact', 'ECPeak', 'On/Off', 'Through: 6/30', 'For: AllDays', 'Until: 24:00', '0',
                         'Through: 8/31', 'For: SummerDesignDay WinterDesignDay', 'Until: 24:00', '0',
                         'For: Weekdays', 'Until: 13:00', '0', 'Until: 18:00', '1', 'Until: 24:00', '0',
                         'For: AllOtherDays', 'Until: 24:00', '0', 'Through: 12/31', 'For: AllDays', 'Until: 24:00', '0'])
    if lv or fins or ec:
        objs.append(['ScheduleTypeLimits', 'SlatAngleLim', '0', '180', 'Continuous'])
        # louvers are inactive on sizing design days -> identical HVAC sizing across louver scenarios
        objs.append(['Schedule:Compact', 'LouverAvail', 'On/Off', 'Through: 12/31',
                     'For: SummerDesignDay WinterDesignDay', 'Until: 24:00', '0', 'For: AllOtherDays', 'Until: 24:00', '1'])
        if scen.get('yearround'):   # 2026-10-26 저자 지시: 모든 대안을 연중(1~12월) 같은 조건으로 — 일사 기준 제어도 연중 작동
            objs.append(['Schedule:Compact', 'LouverSeason', 'On/Off', 'Through: 12/31',
                         'For: SummerDesignDay WinterDesignDay', 'Until: 24:00', '0', 'For: AllOtherDays', 'Until: 24:00', '1'])
        else:
            objs.append(['Schedule:Compact', 'LouverSeason', 'On/Off', 'Through: 4/30', 'For: AllDays', 'Until: 24:00', '0',
                         'Through: 9/30', 'For: SummerDesignDay WinterDesignDay', 'Until: 24:00', '0', 'For: AllOtherDays', 'Until: 24:00', '1',
                         'Through: 12/31', 'For: AllDays', 'Until: 24:00', '0'])
        ems_sol = []
        for bi, bnd in enumerate(BANDS):
            tag = {'B1': 'bot', 'B2': 'low', 'B3': 'mid', 'B4': 'high', 'B5': 'top'}[bnd]
            for zn in (1, 2, 3, 4):
                key = '%s_%s' % (bnd, FAC[zn])
                zone = 'Perimeter_%s_ZN_%d' % (tag, zn)
                wall = {1: 'South', 2: 'East', 3: 'North', 4: 'West'}[zn]
                win = '%s_Wall_%s_Window' % (zone, wall)
                es = ec.get(key)
                if es is not None:
                    avl = 'LouverSeason' if 'season' in es else 'LouverAvail'   # season: May-Sep only
                    if es[0] == 'dl':      # modulate tint to meet the daylighting illuminance setpoint (500 lx)
                        row = ['MeetDaylightIlluminanceSetpoint', avl, '', 'Yes', 'No', '', '', '', '', zone + '_DC']
                    elif es[0] == 'sol':   # tint when incident solar on window > setpoint (W/m2)
                        row = ['OnIfHighSolarOnWindow', avl, '%g' % es[1], 'Yes', 'No', '', '', '', '', '']
                    elif es[0] == 'sol2':  # 2026-10-23: two signals - window solar > setpoint AND zone air temperature > setpoint 2
                        ct2 = 'OnIfHighOutdoorAirTempAndHighSolarOnWindow' if es[-1] == 'oat' else 'OnIfHighZoneAirTempAndHighSolarOnWindow'
                        row = [ct2, avl, '%g' % es[2], 'Yes', 'No', '', '', '', '%g' % es[1], '']   # E+: Setpoint = temperature (C), Setpoint 2 = solar (W/m2)
                    elif es[0] == 'peak':  # fully tinted on Jul-Aug weekdays 13-18 h (peak hours)
                        row = ['OnIfScheduleAllows', 'ECPeak', '', 'Yes', 'No', '', '', '', '', '']
                    objs.append(['WindowShadingControl', 'WSC_' + key, zone, '1', 'SwitchableGlazing', 'Window EC Tinted']
                                + row + ['Sequential', win])
                    continue
                spec = lv.get(key)
                mat = lmat
                if spec is None:
                    spec = fins.get(key); mat = 'ExtFin'
                if spec is None:
                    continue
                if spec[0] == 'fixed':
                    phi = 90.0 - spec[1]
                    sch = 'Slat_' + key
                    objs.append(['Schedule:Constant', sch, 'SlatAngleLim', '%.2f' % phi])
                    ctl, sname = 'ScheduledSlatAngle', sch
                elif spec[0] == 'cutoff':
                    ctl, sname = 'BlockBeamSolar', ''
                elif spec[0] == 'cutoff_season':
                    ctl, sname = 'BlockBeamSolar', ''
                elif spec[0] == 'cutoff_sol':          # deploy (cut-off angle) only when window solar > threshold, May-Sep
                    ctl, sname = 'BlockBeamSolar', ''
                elif spec[0] == 'cutoff_sol2':         # 2026-10-23: deploy only when window solar > thr AND zone air temp > thr2 (May-Sep), else retracted
                    ctl, sname = 'BlockBeamSolar', ''
                elif spec[0] == 'cutoff_sol_h':        # 2026-10-17 fix: non-retractable louver stays in front of the window;
                    ctl, sname = 'BlockBeamSolar', ''  # cut-off angle when window solar > threshold (May-Sep), else horizontal (EMS)
                    ems_sol.append((win, float(spec[1])))
                elif spec[0] == 'sched':
                    ctl, sname = 'ScheduledSlatAngle', spec[1]
                avail = 'LouverSeason' if spec[0] in ('cutoff_season', 'cutoff_sol', 'cutoff_sol2') else 'LouverAvail'
                ctype, sp = ('OnIfHighSolarOnWindow', '%g' % spec[1]) if spec[0] == 'cutoff_sol' else (('OnIfHighOutdoorAirTempAndHighSolarOnWindow' if spec[3] == 'oat' else 'OnIfHighZoneAirTempAndHighSolarOnWindow'), '%g' % spec[1]) if spec[0] == 'cutoff_sol2' else ('OnIfScheduleAllows', '')
                sp2 = ''
                if spec[0] == 'cutoff_sol2': sp, sp2 = '%g' % spec[2], '%g' % spec[1]   # E+: Setpoint = temperature (C), Setpoint 2 = solar (W/m2)
                objs.append(['WindowShadingControl', 'WSC_' + key, zone, '1', 'ExteriorBlind', '', ctype,
                             avail, sp, 'Yes', 'No', mat, ctl, sname, sp2, '', 'Sequential', win])
                if spec[0] == 'sched' and len(spec) > 2:
                    objs.append(spec[2])

        if ems_sol:   # EMS: horizontal slats (phi = 90 deg, theta = 0) unless season & incident window solar > threshold
            sens, acts, prog = [], [], ['EnergyManagementSystem:Program', 'LouverSolarCtl']
            for j, (w, thr) in enumerate(ems_sol):
                sens.append(['EnergyManagementSystem:Sensor', 'Sol%d' % j, w, 'Surface Outside Face Incident Solar Radiation Rate per Area'])
                acts.append(['EnergyManagementSystem:Actuator', 'Slat%d' % j, w, 'Window Shading Control', 'Slat Angle'])
                prog += ['IF (Season > 0.5) && (Sol%d > %g)' % (j, thr), 'SET Slat%d = Null' % j, 'ELSE', 'SET Slat%d = 90' % j, 'ENDIF']
            objs.append(['EnergyManagementSystem:Sensor', 'Season', 'LouverSeason', 'Schedule Value'])
            objs += sens + acts + [prog]
            objs.append(['EnergyManagementSystem:ProgramCallingManager', 'LouverSolarMgr', 'BeginZoneTimestepBeforeInitHeatBalance', 'LouverSolarCtl'])

    # ---- outputs ----
    objs.append(['Output:SQLite', 'SimpleAndTabular'])
    objs.append(['Output:Table:SummaryReports', 'AllSummary'])
    objs.append(['OutputControl:Table:Style', 'CommaAndHTML'])
    for m in ['Electricity:Facility', 'NaturalGas:Facility', 'Cooling:Electricity', 'Heating:NaturalGas',
              'InteriorLights:Electricity', 'Fans:Electricity', 'Pumps:Electricity', 'HeatRejection:Electricity',
              'InteriorEquipment:Electricity', 'ExteriorLights:Electricity', 'WaterSystems:NaturalGas',
              'Heating:Electricity']:
        objs.append(['Output:Meter', m, 'RunPeriod'])
    objs.append(['Output:Meter', 'Electricity:Facility', 'Hourly'])
    objs.append(['Output:Meter', 'NaturalGas:Facility', 'Hourly'])
    if extra_outputs:
        for v in ['Zone Thermal Comfort Fanger Model PMV', 'Zone People Occupant Count',
                  'Daylighting Reference Point 1 Illuminance', 'Zone Lights Electricity Energy',
                  'Zone Air System Sensible Cooling Energy', 'Zone Air System Sensible Heating Energy',
                  'Site Solar Altitude Angle']:
            objs.append(['Output:Variable', '*', v, 'Hourly'])
        if ec:
            objs.append(['Output:Variable', '*', 'Surface Window Switchable Glazing Switching Factor', 'Hourly'])
        for v in ['Surface Outside Face Incident Solar Radiation Rate per Area', 'Surface Window Blind Slat Angle',
                  'Surface Outside Face Incident Beam Solar Radiation Rate per Area']:
            objs.append(['Output:Variable', '*', v, 'Hourly'])
    meta = dict(name=name, Lx=Lx, Ly=Ly, ang=ang, H=H, N=N, fh=fh, zrep=zrep, bands=bf, counts=counts,
                n_neighbors=len(neighbors(name)) if scen.get('shading', True) else 0)
    return dump(objs), meta


if __name__ == '__main__':
    name = sys.argv[1]
    txt, meta = build(name, {'shading': True, 'louver': None})
    open('test_%s.idf' % name, 'w').write(txt)
    print(meta)
