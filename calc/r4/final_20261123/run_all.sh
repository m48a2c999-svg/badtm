#!/bin/bash
# 결과 축약 → 통합 지표 → 구동 전력량 → 257동 비교 → 표 → 그림
S=/tmp/claude-0/-home-claude/d855b01c-4d65-5c73-a219-ae59fd128dc1/scratchpad
set -e
cd $S/r4/pres; for g in r4cbd r4gbd r4ybd r4mpo; do python3 $S/r4/repo/calc/r4/reduce_r3.py res/$g $g $S/r4/repo/calc/r3/data/r3/targets_sim_$g.csv $S/r4/pred/red_$g.json && gzip -f $S/r4/pred/red_$g.json; done
cd $S/uni; python3 derive4.py $S/r4/pred $S/r4/repo/calc/r4/out $S/r4/repo/calc/r3/data/r3 2>&1 | grep -v Warn | grep -v "R\['enduse'\]" | tail -8
python3 drive4.py $S/r4/pred $S/r4/repo/calc/r4/out | tail -4
python3 compare257.py /home/claude/badtm/data/db/research.sqlite $S/r4/repo/calc/r4/out $S/r4/pred | head -2
python3 c7_tables.py out4 $S/r4/repo/calc/r4/out > /dev/null && echo tables-ok
cd $S/t2/kmu && python3 figs4.py $S/r4/repo/calc/r4/out $S/r4/pred $S/uni/out4 2>&1 | tail -6
