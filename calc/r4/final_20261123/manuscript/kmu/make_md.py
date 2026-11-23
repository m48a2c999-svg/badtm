import re,sys
F={};cur=None
for ln in open('front.txt').read().split('\n'):
    if ln.startswith('@'): cur=ln[1:].strip(); F[cur]=[]; continue
    if ln.strip() and cur: F[cur].append(ln.strip())
o=['# 서울 업무시설 밀집지역 기존 건물의 외피 성능 개선에 따른 에너지 성능 평가','## — 키네틱 파사드 적용 시뮬레이션을 중심으로 —','',
   'Energy Performance Evaluation of Envelope Improvements for Existing Buildings in Office-Dense Areas of Seoul — A Simulation Study of Kinetic Facade Applications','',
   '박사학위논문 · 국민대학교 일반대학원 건축학과 · 조승완 · 지도교수 박미애','',
   '> 본 md는 텍스트 확인용이다. 제출본은 같은 폴더의 docx·pdf(B5, 그림·표 포함)이다.','','# 국문요약','']
o+= [p+'\n' for p in F['ABSKO']]+[F['KWKO'][0],'']
def conv(fn):
    out=[];intab=False
    for ln in open(fn).read().split('\n'):
        if ln.startswith('|W'): intab=False; out.append(''); continue
        if ln.startswith('|'):
            if not intab: out.append(ln); out.append('|'+'---|'*(ln.count('|')-1)); intab=True
            else: out.append(ln)
            continue
        if intab: intab=False; out.append('')
        if ln.startswith('#'): out+=['',ln,'']
        elif ln.startswith('FIG '): out.append(f'![{ln[4:].split(";")[0]}](figs/{ln[4:].split(";")[0]})')
        elif ln.startswith('FC '): out+=['*'+ln[3:]+'*','']
        elif ln.startswith('NOTE '): out+=['> '+ln[5:],'']
        elif ln.startswith('TC '): out+=['**'+ln[3:]+'**','']
        elif ln.startswith('EQ '): out+=['`'+ln[3:]+'`','']
        elif ln.startswith('BL '):
            t=ln[3:]; a,b=(t.split('  ',1)+[''])[:2]; out.append(f'- **{a}** {b}')
        elif ln.strip(): out+=[ln,'']
    return out
for f in ['c1_intro.txt', 'c2_theory.txt', 'c3_lit.txt', 'c4_method.txt', 'c5_results.txt', 'c6_detail.txt', 'c7_r4.txt', 'c8_disc.txt', 'c9_concl.txt']: o+=conv(f)
o+=['','# 참고문헌','']
for l in open('refs.txt').read().split('\n'):
    if l.strip() in ('국내 문헌','국외 문헌'): o+=['','## '+l.strip(),'']
    elif l.strip(): o.append('- '+l.strip())
o+=['','# Abstract','']+[p+'\n' for p in F['ABSEN']]+[F['KWEN'][0],'']
o+=conv('appx_A_r4.txt')
o+=conv('appx_B.txt')
o+=['','# 감사의 글','']+[p+'\n' for p in F['ACK']]
txt='\n'.join(o)
txt=re.sub(r'\n{3,}','\n\n',txt)
open(sys.argv[1],'w').write(txt+'\n')
print(len(txt))
