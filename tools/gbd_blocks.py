import json,sqlite3,pickle,numpy as np,statistics as st,csv
MB='/tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad/mb/res_sb10/'
PLAN='11680UQ161PS202505140001'
B=[f for f in json.load(open('/home/claude/badtm/data/upis/blocks_11680.geojson'))['features'] if f['properties']['plan_id']==PLAN]
def inring(x,y,r):
    c=False;j=len(r)-1
    for i in range(len(r)):
        xi,yi=r[i];xj,yj=r[j]
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi: c=not c
        j=i
    return c
def polys(g): return [g['coordinates']] if g['type']=='Polygon' else g['coordinates']
def inpoly(x,y,g): return any(inring(x,y,p[0]) and not any(inring(x,y,h) for h in p[1:]) for p in polys(g))
c=sqlite3.connect('/home/claude/badtm/data/db/research.sqlite')
bl=c.execute('select sim_name,lat,lon,obstruction_class,block,floors from buildings').fetchall()
ALTS=['F0','LH_F0','VF_F0','BT_T300','LT_T300','S3' ]
ALTS=['F0','LH_F0','VF_F0','BT_T300','LT_T300']
assign={}
for n,lat,lon,oc,blk,fl in bl:
    for f in B:
        if inpoly(lon,lat,f['geometry']): assign[n]=f['properties']['block']; break
print('assigned',len(assign))
cache={}
def load(n,t):
    k=(n,t)
    if k not in cache:
        d=pickle.load(open(MB+f'{n}_{t}c.pkl','rb')); cache[k]=(d['EUI']*d['area'],d['hourly_kW'])
    return cache[k]
res=c.execute('select sim_name,tag,dEUI_pct,dpeak_pct from results_257').fetchall()
R={(a,b):(x,y) for a,b,x,y in res}
groups={}
for n,b in assign.items(): groups.setdefault(b,[]).append(n)
groups['ALL']=list(assign)
rows=[]
for g,ns in sorted(groups.items(),key=lambda kv:(kv[0]=='ALL',kv[0])):
    E0=sum(load(n,'S1')[0] for n in ns); H0=sum(load(n,'S1')[1] for n in ns)
    row={'block':g,'n':len(ns),'peak0_kW':int(round(float(H0.max())))}
    for a in ALTS:
        E=sum(load(n,a)[0] for n in ns); H=sum(load(n,a)[1] for n in ns)
        row[f'{a}_dE']=round(100*(E-E0)/E0,2); row[f'{a}_dP']=round(float(100*(H.max()-H0.max())/H0.max()),2)
        row[f'{a}_both']=sum(1 for n in ns if R[(n,a)][0]<0 and R[(n,a)][1]<0)
    rows.append(row)
pass
json.dump({'assign':assign,'rows':rows},open('gbd_blocks.json','w'),ensure_ascii=False,indent=1)
with open('gbd_blocks.csv','w',newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
import numpy as np
blk=[r for r in rows if r['block']!='ALL']
print('n 가구',len(blk),'sizes',sorted(r['n'] for r in blk))
oc={n:o for n,_,_,o,_,_ in bl}
ob={r[0]:r[1] for r in c.execute('select sim_name,obstruction_deg from buildings')}
for a in ALTS:
    dE=[r[f'{a}_dE'] for r in blk]; dP=[r[f'{a}_dP'] for r in blk]
    both=sum(1 for r in blk if r[f'{a}_dE']<0 and r[f'{a}_dP']<0)
    print(a,'dE range',min(dE),max(dE),'med',np.median(dE),'dP range',min(dP),max(dP),'med',np.median(dP),'both-가구',both, 'ALL',[r for r in rows if r['block']=='ALL'][0][f'{a}_dE'],[r for r in rows if r['block']=='ALL'][0][f'{a}_dP'])
# 가구 mean obstruction vs F0_dE (n>=3)
from scipy.stats import spearmanr
big=[r for r in blk if r['n']>=3]
mo=[np.mean([ob[n] for n in groups[r['block']]]) for r in big]
for a in ALTS: print(a,'rho(가구 평균차폐각, dE) n>=3',len(big),round(spearmanr(mo,[r[f'{a}_dE'] for r in big])[0],2))
import collections
print(collections.Counter(oc[n] for n in assign))
