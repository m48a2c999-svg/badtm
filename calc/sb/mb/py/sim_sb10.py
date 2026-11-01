"""[4 superblocks, 2026-10-19] copy of sim50.py with targets_sb.csv, osm_v2.json, res_sb. Multi-building EnergyPlus driver: build -> run -> compact extraction -> delete bulky outputs.
usage: python3 sim50.py <jobfile.json>   (list of [name, tag, scen_overrides, full])
Results: mb/res/{name}_{tag}.pkl ; run dirs: sim/runs50/{name}_{tag} (only err/meta/in.idf kept)
"""
import os, sys, json, pickle, sqlite3, subprocess, time, re
import numpy as np, pandas as pd
S = os.environ.get('BUNDLE', os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../..')))
SIM = S + '/sim'; RES = S + '/mb/res_sb10'; RUNS = SIM + '/runs_sb10'   # v10 (2026-10-20): 10-min timestep, register-scaled geometry (build.py defaults)
os.environ['OSM_JSON'] = S + '/data/osm_v2.json'
sys.path.insert(0, SIM)
os.makedirs(RES, exist_ok=True); os.makedirs(RUNS, exist_ok=True)
J2KWH = 1 / 3.6e6
V50 = {'abs_scale': True}          # model rule for the 50-building set (applied to all 50 incl. ARK/GFC/GST)


def targets():
    return pd.read_csv(S + '/mb/targets_sb.csv', dtype={'key': str})


def setup(name):
    os.chdir(SIM)
    import geom
    if name in ('ARK', 'GFC', 'GST'):
        return
    T = targets().set_index('sim_name')
    t = T.loc[name]
    b = {x['id']: x for x in geom.B}[t.osm]
    h = None if b['h'] else float(t.floors) * 3.6
    geom.register(t.osm, int(t.floors), h)


def scen_for(name, tag, over):
    from scen import zscen
    base = tag.split('@')[0]           # tag like 'S1', 'S1@e1.2_c0.8' (calibration variant), 'F0_D1' (shift given in over)
    base = re.sub(r'_D\d$', '', base)
    base = {'S1u': 'S1', 'S1c': 'S1'}.get(base, base)
    base = re.sub(r'c$', '', base) if base.endswith('c') and base[:-1] in ('F0', 'LH_F0', 'VF_F0', 'EC_DLS', 'LT_T300', 'BT_T300') else base
    sc = dict(zscen(name, base))
    sc.update(V50); sc.update(over or {})
    return sc


def q1(c, sql, a=()):
    r = c.execute(sql, a).fetchone()
    return r[0] if r else None


def light_extract(d):
    c = sqlite3.connect(os.path.join(d, 'eplusout.sql'))
    area = float(q1(c, "select Value from TabularDataWithStrings where ReportName='AnnualBuildingUtilityPerformanceSummary' and TableName='Building Area' and RowName='Total Building Area'"))
    env = q1(c, 'select max(EnvironmentPeriodIndex) from Time')
    R = {'area': area}
    for m in ['Electricity:Facility', 'NaturalGas:Facility', 'Cooling:Electricity', 'Heating:NaturalGas',
              'InteriorLights:Electricity', 'Fans:Electricity', 'Pumps:Electricity', 'HeatRejection:Electricity',
              'InteriorEquipment:Electricity', 'ExteriorLights:Electricity', 'WaterSystems:NaturalGas']:
        v = q1(c, """select sum(r.Value) from ReportData r join ReportDataDictionary d on r.ReportDataDictionaryIndex=d.ReportDataDictionaryIndex
                     join Time t on r.TimeIndex=t.TimeIndex where d.Name=? and d.ReportingFrequency='Run Period' and t.EnvironmentPeriodIndex=?""", (m, env))
        R[m] = (v or 0.0) * J2KWH / area
    R['EUI'] = R['Electricity:Facility'] + R['NaturalGas:Facility']
    for m, k in (('Electricity:Facility', 'el'), ('NaturalGas:Facility', 'gas')):
        rows = c.execute("""select t.Month, r.Value from ReportData r join ReportDataDictionary d on r.ReportDataDictionaryIndex=d.ReportDataDictionaryIndex
                     join Time t on r.TimeIndex=t.TimeIndex where d.Name=? and d.ReportingFrequency='Hourly' and t.EnvironmentPeriodIndex=? order by r.TimeIndex""", (m, env)).fetchall()
        mon = np.array([x[0] for x in rows]); v = np.array([x[1] for x in rows]) * J2KWH
        R['monthly_%s_kWh' % k] = [float(v[mon == i].sum()) for i in range(1, 13)]
        if k == 'el':
            R['hourly_kW'] = v.astype(np.float32)
            R['peak_kW'] = float(v.max()); R['peak_idx'] = int(v.argmax()); R['load_factor'] = float(v.mean() / v.max())
        R['n_hours_' + k] = len(v)
    # stage-2 end uses (present only when _enduse outputs were requested)
    for nm, k, var in (('Cooling:Electricity', 'cool_el', False), ('Heating:NaturalGas', 'heat_gas', False), ('Boiler Heating Energy', 'boiler_heat', True)):
        rows = c.execute("""select t.Month, r.Value from ReportData r join ReportDataDictionary d on r.ReportDataDictionaryIndex=d.ReportDataDictionaryIndex
                     join Time t on r.TimeIndex=t.TimeIndex where d.Name=? and d.ReportingFrequency='Hourly' and t.EnvironmentPeriodIndex=? order by r.TimeIndex""", (nm, env)).fetchall()
        if len(rows) == 8760:
            mon = np.array([x[0] for x in rows]); v = np.array([x[1] for x in rows]) * J2KWH
            R['hourly_' + k] = v.astype(np.float32); R['monthly_%s_kWh' % k] = [float(v[mon == i].sum()) for i in range(1, 13)]
    # consistency: hourly sum vs run-period meter
    R['chk_el'] = sum(R['monthly_el_kWh']) / (R['Electricity:Facility'] * area) if R['Electricity:Facility'] else None
    c.close()
    return R


def errsum(err):
    sevl = [l for l in err.split('\n') if '** Severe  **' in l]
    warm = sum('CheckWarmupConvergence' in l for l in sevl)          # warm-up non-convergence: recorded, not a failure
    sev = len(sevl) - warm; fat = len(re.findall(r'\*\*  Fatal  \*\*', err))
    ok = 'EnergyPlus Completed Successfully' in err
    m = re.search(r'Completed Successfully-- (\d+) Warning; (\d+) Severe Errors; Elapsed Time=(.*)', err)
    return dict(ok=ok, severe=sev, fatal=fat, warmup_nonconv=warm, n_warn=int(m.group(1)) if m else None,
                elapsed=m.group(3) if m else None)


def job(a):
    name, tag, over, full = a
    out = os.path.join(RES, f'{name}_{tag}.pkl')
    if os.path.exists(out):
        try:
            if 'EUI' in pickle.load(open(out, 'rb')):
                return name, tag, 'cached'
        except Exception:
            pass
    t0 = time.time()
    setup(name)
    from build import build, EP, EPW
    sc = scen_for(name, tag, over)
    d = os.path.join(RUNS, f'{name}_{tag}'); os.makedirs(d, exist_ok=True)
    txt, meta = build(name, sc, run_weather=True, extra_outputs=full)
    if sc.get('_enduse'):   # stage-2: extra hourly end-use outputs (reporting only, no effect on results)
        txt += '\nOutput:Meter,\n    Cooling:Electricity,\n    Hourly;\n\nOutput:Meter,\n    Heating:NaturalGas,\n    Hourly;\n\nOutput:Variable,\n    *,\n    Boiler Heating Energy,\n    Hourly;\n'
    open(os.path.join(d, 'in.idf'), 'w').write(txt)
    json.dump({k: (v if not hasattr(v, 'item') else v.item()) for k, v in meta.items()}, open(os.path.join(d, 'meta.json'), 'w'), default=float)
    subprocess.run([EP + '/energyplus', '-w', os.path.realpath(EPW), '-d', d, 'in.idf'], cwd=d, capture_output=True, text=True)
    err = open(os.path.join(d, 'eplusout.err')).read()
    es = errsum(err)
    R = {'name': name, 'tag': tag, 'scen_over': over, 'err': es, 'meta': meta, 'wall_s': None}
    if es['ok'] and es['severe'] == 0 and es['fatal'] == 0:
        R.update(light_extract(d))
        if full:
            from extract import extract
            F = extract(d)
            for k in ('PMV_ok', 'UDI', 'UDI_lo', 'UDI_hi', 'zone_udi', 'win_inc', 'zone'):
                R[k] = F[k] if not hasattr(F[k], 'item') else float(F[k])
    R['wall_s'] = time.time() - t0
    pickle.dump(R, open(out, 'wb'))
    # keep only err/meta/(idf for S1); everything else is bulky
    for f in os.listdir(d):
        if f in ('eplusout.err', 'meta.json') or (f == 'in.idf' and tag == 'S1'):
            continue
        try: os.remove(os.path.join(d, f))
        except OSError: pass
    return name, tag, ('ok %.0fs sev=%d warm=%d' % (R['wall_s'], es['severe'], es['warmup_nonconv'])) if es['ok'] else 'FAILED ' + str(es)


if __name__ == '__main__':
    from concurrent.futures import ProcessPoolExecutor
    jobs = json.load(open(sys.argv[1]))
    npar = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    t0 = time.time()
    with ProcessPoolExecutor(npar) as ex:
        for r in ex.map(job, [tuple(j) for j in jobs]):
            print(time.strftime('%H:%M:%S'), r, flush=True)
    print('DONE', len(jobs), 'jobs in %.1f min' % ((time.time() - t0) / 60), flush=True)
