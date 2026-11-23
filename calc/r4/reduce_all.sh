#!/bin/bash
# r4 결과(r4res-00..19 브랜치의 pkl.gz)를 지역별 압축 자료(red_r4{reg}.json.gz)로 줄인다. GitHub Actions에서 실행.
set -eu
R=$GITHUB_WORKSPACE/calc/r4; W=$RUNNER_TEMP/red; mkdir -p $W/res $R/red
URL=https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY
for k in $(seq 0 19) local; do   # 분담 브랜치 이름은 r4res-0..r4res-19(0 채움 없음)
  git ls-remote --exit-code $URL r4res-$k >/dev/null 2>&1 || continue
  git clone -q --depth 1 --branch r4res-$k $URL $W/s$k
  for g in r4cbd r4gbd r4ybd r4mpo; do mkdir -p $W/res/$g; [ -d $W/s$k/res/$g ] && cp $W/s$k/res/$g/*.pkl.gz $W/res/$g/ 2>/dev/null || true; done
  rm -rf $W/s$k
done
for g in r4cbd r4gbd r4ybd r4mpo; do
  n=$(ls $W/res/$g 2>/dev/null | wc -l); echo "$g files $n"; [ "$n" -gt 0 ] || continue
  python3 $R/reduce_r3.py $W/res/$g $g $GITHUB_WORKSPACE/calc/r3/data/r3/targets_sim_$g.csv $W/red_$g.json
  gzip -c $W/red_$g.json > $R/red/red_$g.json.gz
done
ls -la $R/red
