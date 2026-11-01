import sqlite3, json, os, sys, re
import numpy as np

TAGB = {'BOT': 'B1', 'LOW': 'B2', 'MID': 'B3', 'HIGH': 'B4', 'TOP': 'B5'}
FAC = {'1': 'S', '2': 'E', '3': 'N', '4': 'W'}
J2KWH = 1 / 3.6e6


def series(c, var, key=None):
    q = """select d.KeyValue, r.Value, r.TimeIndex from ReportData r join ReportDataDictionary d
           on r.ReportDataDictionaryIndex=d.ReportDataDictionaryIndex
           join Time t on r.TimeIndex=t.TimeIndex
           where d.Name=? and d.ReportingFrequency='Hourly' and t.EnvironmentPeriodIndex=(select max(EnvironmentPeriodIndex) from Time)
           order by r.TimeIndex"""
    out = {}
    for k, v, ti in c.execute(q, (var,)):
        out.setdefault(k, []).append(v)
    return {k: np.array(v) for k, v in out.items()}


def meter_total(c, name):
    q = """select sum(r.Value) from ReportData r join ReportDataDictionary d on r.ReportDataDictionaryIndex=d.ReportDataDictionaryIndex
           join Time t on r.TimeIndex=t.TimeIndex
           where d.Name=? and d.ReportingFrequency='Run Period' and t.EnvironmentPeriodIndex=(select max(EnvironmentPeriodIndex) from Time)"""
    v = c.execute(q, (name,)).fetchone()[0]
    return (v or 0.0) * J2KWH


def zkey(zone):
    m = re.match(r'PERIMETER_(BOT|LOW|MID|HIGH|TOP)_ZN_(\d)', zone)
    return f'{TAGB[m.group(1)]}_{FAC[m.group(2)]}' if m else None


def extract(d):
    meta = json.load(open(os.path.join(d, 'meta.json')))
    counts = meta['counts']
    mult = {'B1': 1, 'B2': counts[1], 'B3': counts[2], 'B4': counts[3], 'B5': 1}
    c = sqlite3.connect(os.path.join(d, 'eplusout.sql'))
    area = float(c.execute("select Value from TabularDataWithStrings where ReportName='AnnualBuildingUtilityPerformanceSummary' and TableName='Building Area' and RowName='Total Building Area'").fetchone()[0])
    R = {'area': area}
    for m in ['Electricity:Facility', 'NaturalGas:Facility', 'Cooling:Electricity', 'Heating:NaturalGas',
              'InteriorLights:Electricity', 'Fans:Electricity', 'Pumps:Electricity', 'HeatRejection:Electricity',
              'InteriorEquipment:Electricity', 'ExteriorLights:Electricity', 'WaterSystems:NaturalGas']:
        R[m] = meter_total(c, m) / area
    R['EUI'] = R['Electricity:Facility'] + R['NaturalGas:Facility']
    R['HVAC'] = R['Cooling:Electricity'] + R['Heating:NaturalGas'] + R['Fans:Electricity'] + R['Pumps:Electricity'] + R['HeatRejection:Electricity']
    R['E_ctrl'] = None
    el = series(c, 'Electricity:Facility')
    if not el:
        q = """select r.Value from ReportData r join ReportDataDictionary d on r.ReportDataDictionaryIndex=d.ReportDataDictionaryIndex
               join Time t on r.TimeIndex=t.TimeIndex where d.Name='Electricity:Facility' and d.ReportingFrequency='Hourly'
               and t.EnvironmentPeriodIndex=(select max(EnvironmentPeriodIndex) from Time) order by r.TimeIndex"""
        el = np.array([v for (v,) in c.execute(q)])
    else:
        el = list(el.values())[0]
    kw = el * J2KWH  # kWh per hour = kW mean
    R['peak_kW'] = float(kw.max())
    R['peak_idx'] = int(kw.argmax())
    R['load_factor'] = float(kw.mean() / kw.max())
    R['hourly_kW'] = kw.tolist()
    R['CO2'] = R['Electricity:Facility'] * 0.4173 + R['NaturalGas:Facility'] * 0.2020
    # comfort & daylight
    alt = list(series(c, 'Site Solar Altitude Angle').values())[0]
    occ = series(c, 'Zone People Occupant Count')
    pmv = series(c, 'Zone Thermal Comfort Fanger Model PMV')
    ill = series(c, 'Daylighting Reference Point 1 Illuminance')
    num_p = den_p = 0.0
    num_u = num_lo = num_hi = den_u = 0.0
    zone_udi = {}
    for zone, o in occ.items():
        k = zkey(zone)
        if not k:
            continue
        w = o * mult[k[:2]]
        pm = [v for kk, v in pmv.items() if kk.startswith(zone)]
        if pm:
            pm = pm[0]
            num_p += np.sum(w * (np.abs(pm) <= 0.5)); den_p += np.sum(w)
        il = [v for kk, v in ill.items() if kk.startswith(zone)][0]
        day = (alt > 5) & (o > 0)
        wd = w * day
        ok = (il >= 100) & (il <= 2000)
        num_u += np.sum(wd * ok); num_lo += np.sum(wd * (il < 100)); num_hi += np.sum(wd * (il > 2000)); den_u += np.sum(wd)
        zone_udi[k] = float(np.sum(wd * ok) / np.sum(wd))
    R['PMV_ok'] = 100 * num_p / den_p
    R['UDI'] = 100 * num_u / den_u
    R['UDI_lo'] = 100 * num_lo / den_u
    R['UDI_hi'] = 100 * num_hi / den_u
    R['zone_udi'] = zone_udi
    # window incident solar (annual kWh/m2) per zone
    inc = series(c, 'Surface Outside Face Incident Solar Radiation Rate per Area')
    zi = {}
    for k, v in inc.items():
        m = re.match(r'PERIMETER_(BOT|LOW|MID|HIGH|TOP)_ZN_(\d)_WALL_\w+_WINDOW$', k)
        if m:
            zi[f'{TAGB[m.group(1)]}_{FAC[m.group(2)]}'] = float(v.sum() / 1000)
    R['win_inc'] = zi
    # slat angle actuation
    sl = series(c, 'Surface Window Blind Slat Angle')
    act = {}
    for k, v in sl.items():
        m = re.match(r'PERIMETER_(BOT|LOW|MID|HIGH|TOP)_ZN_(\d)_WALL_\w+_WINDOW$', k)
        if m:
            th = 90 - v
            act[f'{TAGB[m.group(1)]}_{FAC[m.group(2)]}'] = dict(mean_dtheta=float(np.mean(np.abs(np.diff(th)))),
                                                               moves=int(np.sum(np.abs(np.diff(th)) > 0.5)),
                                                               day_mean_theta=float(np.mean(th[alt > 5])))
    R['act'] = act
    # per-zone lights & sensible loads (kWh, multiplied)
    zl = series(c, 'Zone Lights Electricity Energy'); zc = series(c, 'Zone Air System Sensible Cooling Energy'); zh = series(c, 'Zone Air System Sensible Heating Energy')
    pz = {}
    for zone in occ:
        k = zkey(zone)
        if not k:
            continue
        mm = mult[k[:2]]
        g = lambda S: float(sum(v.sum() for kk, v in S.items() if kk.startswith(zone)) * J2KWH * mm)
        pz[k] = dict(light=g(zl), cool=g(zc), heat=g(zh))
    R['zone'] = pz
    return R


if __name__ == '__main__':
    for d in sys.argv[1:]:
        R = extract(d)
        print(os.path.basename(d), {k: round(v, 2) for k, v in R.items() if isinstance(v, float)})
