#!/bin/bash
# 박사논문 계산 분담(GitHub Actions): 3권역(강남·여의도) 20개 조건, 검토 반영 계산(냉방기 컷오프 루버·모델 가정 민감도).
# 같은 EnergyPlus 23.2.0 Linux 배포본, 같은 입력·조건. 결과(pkl.gz)는 브랜치 res-<shard>에 올린다.
set -u
K=$1; R=$GITHUB_WORKSPACE/calc; NP=$(nproc)
W=$RUNNER_TEMP/res; mkdir -p $W
cd $W
if git ls-remote --exit-code https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY res-$K >/dev/null 2>&1; then
  git clone -q --depth 1 --branch res-$K https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY rr
else
  mkdir rr && cd rr && git init -q && git checkout -q -b res-$K && echo "calc results shard $K" > README.md && git add README.md && git -c user.name=claude -c user.email=noreply@anthropic.com commit -qm init && git remote add origin https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY && cd ..
fi
# 이미 올린 결과를 캐시로 되살림(다시 실행할 때 이어서 계산)
mkdir -p $R/r3/mb/res_r3_gbd $R/r3/mb/res_r3_ybd $R/sb/mb/res_sb10
for d in r3_gbd r3_ybd sb10; do
  [ -d rr/res/$d ] || continue
  case $d in sb10) T=$R/sb/mb/res_sb10;; *) T=$R/r3/mb/res_$d;; esac
  for f in rr/res/$d/*.pkl.gz; do [ -e "$f" ] && gunzip -c "$f" > $T/$(basename "$f" .gz); done
done
push() {
  cd $W/rr; n=0
  for d in r3_gbd r3_ybd sb10; do
    case $d in sb10) T=$R/sb/mb/res_sb10;; *) T=$R/r3/mb/res_$d;; esac
    mkdir -p res/$d
    for f in $T/*.pkl; do [ -e "$f" ] || continue; g=res/$d/$(basename $f).gz; [ -e "$g" ] && continue; gzip -c "$f" > "$g"; n=$((n+1)); done
  done
  if [ $n -gt 0 ]; then git add -A res && git -c user.name=claude -c user.email=noreply@anthropic.com commit -qm "shard $K +$n" && git push -q origin res-$K && echo "$(date -u +%H:%M) pushed $n"; fi
  cd - >/dev/null
}
( while true; do sleep 2400; push; done ) & PP=$!
python3 - $K <<'PY'
import json,sys,os
R=os.environ['GITHUB_WORKSPACE']+'/calc'; K=int(sys.argv[1]); J=json.load(open(f'{R}/shard_{K:02d}.json'))
g={}
for kind,reg,j in J: g.setdefault((kind,reg),[]).append(j)
for (kind,reg),L in g.items():
    p = f'{R}/r3/mb/py/job_{reg}.json' if kind=='r3' else f'{R}/sb/mb/py/job_sb.json'
    json.dump(L,open(p,'w')); print(kind,reg,len(L))
PY
cd $R/r3/mb/py; export BUNDLE=$R/r3
for reg in gbd ybd; do [ -f job_$reg.json ] && REGION=$reg python3 sim_r3.py job_$reg.json $NP; done
cd $R/sb/mb/py; export BUNDLE=$R/sb
[ -f job_sb.json ] && python3 sim_sb10.py job_sb.json $NP
kill $PP 2>/dev/null; push
echo "SHARD $K FINISHED $(date -u)"
