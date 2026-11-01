import json
OCC_H=2610
T1,T2=0.15,0.45
def classes(name,t1=T1,t2=T2):
    g=json.load(open(f'screen_{name}.json'))
    out={}
    for k,v in g.items():
        fb=v['hrs_beam_occ']/OCC_H
        out[k]='S' if fb<t1 else ('R' if fb<t2 else 'A')
    return out
def zoned(name,mapping,t1=T1,t2=T2):
    c=classes(name,t1,t2); lv={}
    for k,cl in c.items():
        spec=mapping[cl]
        if spec is not None: lv[k]=spec
    return {'shading':True,'louver':lv}
if __name__=='__main__':
    for n in ['ARK','GFC','GST']:
        c=classes(n); print(n,{x:sum(1 for v in c.values() if v==x) for x in 'SRA'},c)
