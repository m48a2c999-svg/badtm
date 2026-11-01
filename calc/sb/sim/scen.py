from build import BANDS, FAC
ZK=[f'{b}_{f}' for b in BANDS for f in 'SENW']
def allz(spec): return {k:spec for k in ZK}
BASE={
 'S0':{'shading':False,'louver':None},
 'S1':{'shading':True,'louver':None},
 'S2':{'shading':True,'louver':allz(('fixed',45))},
 'S3':{'shading':True,'louver':allz(('cutoff',))},
 'F0':{'shading':True,'louver':allz(('fixed',0))},
 'SC':{'shading':True,'louver':allz(('cutoff_season',))},
}

from classify import zoned
ZA={'S':None,'R':('cutoff',),'A':('cutoff',)}
ZB={'S':('fixed',0),'R':('cutoff',),'A':('cutoff',)}
def zscen(name,tag):
    if '__' in tag:   # 2026-10-19 external-review sensitivity variants: <base>__<var>
        base,var=tag.split('__',1); sc=dict(zscen(name,base))
        if var=='A': sc['area_scale']={'GFC':130934/195032,'GST':90950/169014}.get(name,1.0)   # 10/19 (15-min era)
        elif var=='O': sc['area_scale']=1.0; sc['osm_geom']=True   # v10: OSM outline geometry (no register scaling)
        elif var=='W100': sc['max_warmup']=100   # v10: maximum warm-up days 25 -> 100
        elif var=='H100': sc['dev_max_h']=100.0   # v10: no devices on bands above 100 m
        elif var=='LE': sc['glz']=(1.8,0.30,0.55)
        elif var=='L6': sc['lpd_mult']=0.6
        elif var=='C2': sc['cop_mult']=2.0
        elif var=='Y': sc['yearround']=True            # 2026-10-26: 연중(1~12월) 같은 조건
        elif var=='NS': sc['shading']=False             # 2026-10-26: 주변 건물 차폐 제외
        elif var=='YNS': sc['yearround']=True; sc['shading']=False
        elif var.startswith('T'): sc['timestep']=int(var[1:])
        else: raise KeyError(var)
        return sc
    mz=__import__('re').match(r'(ZA|ZB)_L(\d\d)$',tag)   # v10: lower zoning bound 0.10 / 0.20
    if mz: return zoned(name,ZA if mz.group(1)=='ZA' else ZB,t1=int(mz.group(2))/100)
    if tag=='ZA': return zoned(name,ZA)
    if tag=='ZB': return zoned(name,ZB)
    if tag.endswith('_W65'):
        base=tag[:-4]; sc=dict(zscen(name,base) if base in('ZA','ZB') else BASE[base]); sc['wwr']=0.65; return sc
    # --- existing-system library: large horizontal louver (LH), vertical fins E/W (VF), hybrid (HV), electrochromic (EC) ---
    SN=[k for k in ZK if k[-1] in 'SN']; EW=[k for k in ZK if k[-1] in 'EW']
    if tag=='LH_F0': return {'shading':True,'louver':allz(('fixed',0)),'louver_mat':'ExtLouverL'}
    if tag=='LH_C':  return {'shading':True,'louver':allz(('cutoff',)),'louver_mat':'ExtLouverL'}
    if tag=='VF_F0': return {'shading':True,'fins':{k:('fixed',0) for k in EW}}
    if tag=='VF_C':  return {'shading':True,'fins':{k:('cutoff',) for k in EW}}
    if tag=='HV_F0': return {'shading':True,'louver':{k:('fixed',0) for k in SN},'louver_mat':'ExtLouverL','fins':{k:('fixed',0) for k in EW}}
    if tag=='HV_C':  return {'shading':True,'louver':{k:('cutoff',) for k in SN},'louver_mat':'ExtLouverL','fins':{k:('cutoff',) for k in EW}}
    if tag=='LH_CS': return {'shading':True,'louver':allz(('cutoff_sol_h',-1.0)),'louver_mat':'ExtLouverL'}   # 2026-11-01 검토 반영: 냉방기(5~9월) 컷오프, 그 밖에는 수평(EMS)
    if tag=='VF_CS': return {'shading':True,'fins':{k:('cutoff_sol_h',-1.0) for k in EW}}                     # 2026-11-01 검토 반영: 냉방기 컷오프, 그 밖에는 고정 위치(90°)(EMS)
    if tag=='EC_DL': return {'shading':True,'ec':{k:('dl',) for k in ZK}}
    if tag=='EC_SOL':return {'shading':True,'ec':{k:('sol',300) for k in ZK}}
    if tag=='EC_DLS': return {'shading':True,'ec':{k:('dl','season') for k in ZK}}
    if tag=='EC_SOLS':return {'shading':True,'ec':{k:('sol',300,'season') for k in ZK}}
    m2=__import__('re').match(r'(EC|LT)_T(\d+)$',tag)   # response-threshold experiment (honeybee): threshold in W/m2, May-Sep
    if m2:
        thr=float(m2.group(2))
        if m2.group(1)=='EC': return {'shading':True,'ec':{k:('sol',thr,'season') for k in ZK}}
        return {'shading':True,'louver':{k:('cutoff_sol_h',thr) for k in ZK},'louver_mat':'ExtLouverL'}   # 10/17: off = horizontal (non-retractable)
    ms=__import__('re').match(r'(BT|EC)_T(S|O)(\d+)$',tag)   # 2026-10-23 stomata-principle test: two signals, May-Sep
    if ms:   # TS: window solar > thr AND zone air temp > 23.5 C (internal state); TO: window solar > thr AND outdoor air temp > 26 C
        thr=float(ms.group(3)); kind='zone' if ms.group(2)=='S' else 'oat'; t2=23.5 if kind=='zone' else 26.0
        if ms.group(1)=='EC': return {'shading':True,'ec':{k:('sol2',thr,t2,'season',kind) for k in ZK}}
        return {'shading':True,'louver':{k:('cutoff_sol2',thr,t2,kind) for k in ZK}}
    m3=__import__('re').match(r'BT_T(\d+)$',tag)   # 10/17: retractable 80 mm exterior blind, cut-off only when window solar > thr (May-Sep), else retracted
    if m3:
        return {'shading':True,'louver':{k:('cutoff_sol',float(m3.group(1))) for k in ZK}}
    if tag=='EC_PK': return {'shading':True,'ec':{k:('peak',) for k in ZK}}
    if tag.startswith('FX'):
        return {'shading':True,'louver':allz(('fixed',float(tag[2:])))}
    if tag=='PK':
        sch=['Schedule:Compact','PeakClose','SlatAngleLim','Through: 6/30','For: AllDays','Until: 24:00','90',
             'Through: 8/31','For: Weekdays','Until: 13:00','90','Until: 18:00','1','Until: 24:00','90','For: AllOtherDays','Until: 24:00','90',
             'Through: 12/31','For: AllDays','Until: 24:00','90']
        lv={k:('sched','PeakClose') for k in ZK}; first=ZK[0]; lv[first]=('sched','PeakClose',sch)
        return {'shading':True,'louver':lv}
    if tag=='PKY':   # 2026-10-26: 피크 시간 폐쇄를 연중 평일 13~18시로(모든 대안 연중 같은 조건), 그 밖에는 수평
        sch=['Schedule:Compact','PeakCloseY','SlatAngleLim','Through: 12/31','For: Weekdays','Until: 13:00','90','Until: 18:00','1','Until: 24:00','90',
             'For: AllOtherDays','Until: 24:00','90']
        lv={k:('sched','PeakCloseY') for k in ZK}; first=ZK[0]; lv[first]=('sched','PeakCloseY',sch)
        return {'shading':True,'louver':lv}
    if tag=='PKS':   # 2026-11-01 검토 반영: 피크 시간대 차양 폐쇄를 냉방기(5~9월) 평일 13~18시로(같은 작동 기간 비교용), 그 밖에는 수평
        sch=['Schedule:Compact','PeakCloseS','SlatAngleLim','Through: 4/30','For: AllDays','Until: 24:00','90',
             'Through: 9/30','For: Weekdays','Until: 13:00','90','Until: 18:00','1','Until: 24:00','90','For: AllOtherDays','Until: 24:00','90',
             'Through: 12/31','For: AllDays','Until: 24:00','90']
        lv={k:('sched','PeakCloseS') for k in ZK}; first=ZK[0]; lv[first]=('sched','PeakCloseS',sch)
        return {'shading':True,'louver':lv}
    mem=__import__('re').match(r'(\w+?)_EM(\d\d)$',tag)
    if mem:
        sc=dict(zscen(name,mem.group(1))); sc['slat_em']=int(mem.group(2))/100; return sc
    m=__import__('re').match(r'(\w+?)_D(\d)$',tag)
    if m:
        sc=dict(zscen(name,m.group(1))); off={'1':{'GFC':-1,'ARK':0,'GST':1},'2':{'GFC':-2,'ARK':0,'GST':2}}[m.group(2)]
        sc['shift']=off[name]; return sc
    return BASE[tag]
