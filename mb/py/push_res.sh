#!/bin/bash
# 결과 pkl을 gzip해서 결과 저장소(브랜치 r3res-<part>)에 올림. 이미 올린 파일은 건너뜀.
P=$1; R=$2; B=$BUNDLE
W=$B/../res_repo_$P
if [ ! -d $W/.git ]; then
  git clone -q --depth 1 --branch r3-compute https://github.com/m48a2c999-svg/badtm.git $W || exit 1
  cd $W && git checkout -q -B r3res-$P && git rm -rq . && mkdir -p res && echo "r3 results part $P" > README.md && git add README.md && git -c user.name=claude -c user.email=noreply@anthropic.com commit -qm "init r3res-$P"
fi
cd $W; mkdir -p res/$R; n=0
for f in $B/mb/res_r3_$R/*.pkl; do
  [ -e "$f" ] || continue
  g=res/$R/$(basename $f).gz
  [ -e "$g" ] && continue
  gzip -c "$f" > "$g"; n=$((n+1))
done
[ $n -eq 0 ] && exit 0
git add -A res && git -c user.name=claude -c user.email=noreply@anthropic.com commit -qm "r3 $P: +$n results ($(date -u +%H:%M))" && git push -q origin r3res-$P && echo "$(date) pushed $n"
