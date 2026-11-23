# -*- coding: utf-8 -*-
"""r4 계산 재배분: 모든 r4res-* 브랜치에 이미 있는 결과를 빼고, 남은 작업을 20개 분담에 고르게 다시 나눈다 (2026-11-23).
결과 파일 이름 = res/<region>/<name>_<tag>.pkl.gz. 처음 목록(shards_orig/)은 그대로 두고 shards/만 새로 쓴다.
usage: GH_REPO=owner/repo python3 rebalance_r4.py"""
import json, os, subprocess, glob, shutil
D = os.path.dirname(os.path.abspath(__file__)); repo = os.environ.get('GH_REPO', 'm48a2c999-svg/badtm')
if not os.path.isdir(os.path.join(D, 'shards_orig')): shutil.copytree(os.path.join(D, 'shards'), os.path.join(D, 'shards_orig'))
jobs = []
for f in sorted(glob.glob(os.path.join(D, 'shards_orig', 'shard_*.json'))): jobs += json.load(open(f))
done = set()
for k in [str(i) for i in range(20)] + ['local']:   # r4res-local: 로컬에서 계산한 분담 끝부분
    out = subprocess.run(['gh', 'api', f'repos/{repo}/git/trees/r4res-{k}?recursive=1', '--jq', '.tree[] | select(.path|test("pkl")) | .path'], capture_output=True, text=True).stdout.split()
    for p in out:
        parts = p.split('/'); done.add((parts[1], parts[2].replace('.pkl.gz', '')))
left = [j for j in jobs if (j[1], f"{j[2][0]}_{j[2][1]}") not in done]
RSV = os.path.join(D, 'local_reserved.json')   # 로컬에서 계산 중인 작업(끝나면 r4res-local에 올라옴): 이번 재배분에서 뺀다
if os.path.exists(RSV):
    rs = {(j[1], f"{j[2][0]}_{j[2][1]}") for j in json.load(open(RSV))}
    n0 = len(left); left = [j for j in left if (j[1], f"{j[2][0]}_{j[2][1]}") not in rs]; print('reserved for local', n0 - len(left))
left.sort(key=lambda j: (j[0], j[1], j[2][0], j[2][1]))
SH = [[] for _ in range(20)]
for k, j in enumerate(left): SH[k % 20].append(j)
for k, L in enumerate(SH): json.dump(L, open(os.path.join(D, 'shards', f'shard_{k:02d}.json'), 'w'))
from collections import Counter
print('total', len(jobs), 'done', len(done), 'left', len(left), 'per shard', len(SH[0]), Counter(j[0] for j in left))
