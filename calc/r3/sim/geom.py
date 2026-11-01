import json, math, os
import numpy as np
D=json.load(open(os.environ.get('OSM_JSON',os.path.join(os.path.dirname(os.path.abspath(__file__)),'../data/osm_v2.json'))))   # 2026-10-20 v10: osm_v2 for all runs
_asf=os.environ.get('AREA_SCALE_JSON', os.path.join(os.path.dirname(os.path.abspath(__file__)),'../data/area_scale.json'))   # 2026-11-01: 3권역은 환경변수로 지정
AREA_SCALE=json.load(open(_asf))['scale'] if os.path.exists(_asf) else {}   # 2026-10-20 v10: register-based floor-area scale per OSM id   # 2026-10-19: OSM_JSON=../data/osm_v2.json for the 4-superblock set
B=D['buildings']
TARGETS={'ARK':'w561726140','GFC':'w117823787','GST':'w562011101'}
FLOORS={'ARK':(24,(1,8,7,7,1)),'GFC':(45,(1,15,14,14,1)),'GST':(38,(1,12,12,12,1))}
def poly_area(p):
    p=np.array(p); x,y=p[:,0],p[:,1]
    return 0.5*abs(np.dot(x,np.roll(y,-1))-np.dot(y,np.roll(x,-1)))
def centroid(p):
    p=[tuple(q) for q in p]; p=np.array(p[:-1] if p[0]==p[-1] else p)
    x,y=p[:,0],p[:,1]; a=np.dot(x,np.roll(y,-1))-np.dot(y,np.roll(x,-1))
    cx=np.sum((x+np.roll(x,-1))*(x*np.roll(y,-1)-np.roll(x,-1)*y))/(3*a)
    cy=np.sum((y+np.roll(y,-1))*(x*np.roll(y,-1)-np.roll(x,-1)*y))/(3*a)
    return np.array([cx,cy])
def hull(pts):
    pts=sorted(set(map(tuple,pts)))
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo=[];up=[]
    for p in pts:
        while len(lo)>=2 and cross(lo[-2],lo[-1],p)<=0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up)>=2 and cross(up[-2],up[-1],p)<=0: up.pop()
        up.append(p)
    return np.array(lo[:-1]+up[:-1])
def eq_rect(b):
    """equivalent rectangle: min-area bounding rect orientation & aspect, area = footprint area"""
    p=np.array(b['p']); h=hull(p); best=None
    for i in range(len(h)):
        e=h[(i+1)%len(h)]-h[i]; ang=math.atan2(e[1],e[0])
        c,s=math.cos(-ang),math.sin(-ang); R=np.array([[c,-s],[s,c]])
        q=h@R.T; w=q[:,0].max()-q[:,0].min(); d=q[:,1].max()-q[:,1].min()
        if best is None or w*d<best[0]: best=(w*d,ang,w,d)
    _,ang,w,d=best
    if d>w: w,d=d,w; ang+=math.pi/2
    # normalize angle to (-90,90]
    angd=math.degrees(ang)
    while angd>90: angd-=180
    while angd<=-90: angd+=180
    A=poly_area(p); k=math.sqrt(A/(w*d))
    return dict(L=w*k,W=d*k,ang=angd,area=A,c=centroid(p))
def height(b):
    if b['h']: return b['h']
    if b['lv']: return b['lv']*3.6
    return None
if __name__=='__main__':
    byid={b['id']:b for b in B}
    for k,i in TARGETS.items():
        r=eq_rect(byid[i]); print(k, {kk:(round(v,1) if not isinstance(v,np.ndarray) else v.round(1)) for kk,v in r.items()}, 'h',height(byid[i]))
    for k,i in TARGETS.items():
        c=eq_rect(byid[i])['c']; n=0
        for b in B:
            if b['id']==i: continue
            h=height(b)
            if h is None: continue
            cb=centroid(b['p']); d=np.linalg.norm(cb-c)
            if d<=350 and h/d>=0.2: n+=1
        print(k,'neighbors',n)
    a=eq_rect(byid[TARGETS['ARK']])['c'];g=eq_rect(byid[TARGETS['GFC']])['c'];s=eq_rect(byid[TARGETS['GST']])['c']
    print('GFC-ARK',np.linalg.norm(g-a),'GFC-GST',np.linalg.norm(g-s),'ARK-GST',np.linalg.norm(a-s))


# ---- multi-building extension (2026-10-16): any OSM building can become a target ----
def split_floors(N):
    """5 bands: ground floor, low/mid/high thirds, top floor (same scheme as the 3 original buildings)."""
    N = int(N)
    if N < 5:
        raise ValueError('need >= 5 floors')
    rest = N - 2; a = rest // 3; c = rest // 3; b = rest - a - c
    return (N, (1, a, b, c, 1))


def register(osm_id, floors=None, height_m=None):
    """Register an OSM way id as a simulation target; floors from building register if given, else OSM levels."""
    byid = {b['id']: b for b in B}
    b = byid[osm_id]
    N = int(floors or b['lv'] or round(height(b) / 3.9))
    TARGETS[osm_id] = osm_id
    FLOORS[osm_id] = split_floors(N)
    if height_m:
        b['h'] = float(height_m)
    return osm_id
