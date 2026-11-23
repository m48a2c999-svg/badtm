#!/bin/bash
# r4res-0..19, local 결과를 모아 pres/res/<region>/ 에 둔다. 브랜치 사본(pres/git/s<k>)을 남겨 두고 다음부터는 새로 올라온 것만 받는다.
W=/tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad/r4/pres; mkdir -p $W/res $W/git; cd $W/git
URL=$(cd ../../repo && git remote get-url origin)
for k in $(seq 0 19) local; do
  if [ -d s$k/.git ]; then (cd s$k && git fetch -q origin r4res-$k && git reset -q --hard FETCH_HEAD)
  else git clone -q --depth 1 --branch r4res-$k $URL s$k; fi
  for g in r4cbd r4gbd r4ybd r4mpo; do mkdir -p ../res/$g; [ -d s$k/res/$g ] && cp -n s$k/res/$g/*.pkl.gz ../res/$g/ 2>/dev/null; done
done
cd $W; t=0; for g in r4cbd r4gbd r4ybd r4mpo; do n=$(ls res/$g | wc -l); t=$((t+n)); echo $g $n; done; echo total $t
