#!/bin/bash
# r4 계산 분담(GitHub Actions): 네 지역(도심·강남·여의도·마포) 같은 규칙 입력, 역삼 257동과 같은 EnergyPlus 23.2.0 Linux·같은 조건.
# 결과(pkl.gz)는 브랜치 r4res-<shard>에 올리고, 다시 실행하면 올린 결과를 캐시로 되살려 이어서 계산한다.
set -u
K=$1; PF=r4res; R=$GITHUB_WORKSPACE/calc; NP=$(nproc)
END=$(( $(date +%s) + ${R4_SECONDS:-19500} ))   # 작업 제한(350분) 전에 계산을 멈추고 마지막 결과를 올리기 위한 마감
REGS="r4cbd r4gbd r4ybd r4mpo"
W=$RUNNER_TEMP/res; mkdir -p $W; cd $W
URL=https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY
if git ls-remote --exit-code $URL $PF-$K >/dev/null 2>&1; then git clone -q --depth 1 --branch $PF-$K $URL rr
else mkdir rr && cd rr && git init -q && git checkout -q -b $PF-$K && echo "r4 results shard $K" > README.md && git add README.md && git -c user.name=claude -c user.email=noreply@anthropic.com commit -qm init && git remote add origin $URL && cd ..; fi
for g in $REGS; do mkdir -p $R/r3/mb/res_r3_$g; [ -d rr/res/$g ] || continue; for f in rr/res/$g/*.pkl.gz; do [ -e "$f" ] && gunzip -c "$f" > $R/r3/mb/res_r3_$g/$(basename "$f" .gz); done; done
push() {
  cd $W/rr; n=0
  for g in $REGS; do mkdir -p res/$g; for f in $R/r3/mb/res_r3_$g/*.pkl; do [ -e "$f" ] || continue; o=res/$g/$(basename $f).gz; [ -e "$o" ] && continue; gzip -c "$f" > "$o"; n=$((n+1)); done; done
  if [ $n -gt 0 ]; then git add -A res && git -c user.name=claude -c user.email=noreply@anthropic.com commit -qm "shard $K +$n" && (git push -q origin $PF-$K || (sleep 10; git push -q origin $PF-$K)) && echo "$(date -u +%H:%M) pushed $n"; fi
  cd - >/dev/null
}
( while true; do sleep 1800; push; done ) & PP=$!
python3 - $K <<'PY'
import json,sys,os
R=os.environ['GITHUB_WORKSPACE']+'/calc'; K=int(sys.argv[1]); J=json.load(open(f"{R}/r4/shards/shard_{K:02d}.json"))
g={}
for w,reg,j in J: g.setdefault((w,reg),[]).append(j)
for (w,reg),L in sorted(g.items()):
    json.dump(L,open(f'{R}/r3/mb/py/r4w{w}_{reg}.json','w')); print(w,reg,len(L))
PY
cd $R/r3/mb/py; export BUNDLE=$R/r3
for f in $(ls r4w*_*.json 2>/dev/null | sort); do left=$(( END - $(date +%s) )); [ $left -le 60 ] && { echo "deadline reached"; break; }; reg=${f#*_}; reg=${reg%.json}; REGION=$reg timeout $left python3 sim_r3.py $f $NP; push; done
kill $PP 2>/dev/null; push
echo "SHARD $K FINISHED $(date -u)"
