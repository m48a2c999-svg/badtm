#!/bin/bash
# Colab에서 3권역 계산 실행: bash run_colab.sh <region>   (Google Drive가 /content/drive에 마운트되어 있어야 함)
# 결과 pkl은 /content/res_<region>에 쓰고, 30분마다 새 파일만 Drive의 chunk_*.tar로 옮긴다. 다시 실행하면 Drive의 chunk를 먼저 풀어 이어서 계산한다.
set -e
REG=${1:-gbd}
OUT="/content/drive/MyDrive/ELMO COMPANY/2026 cowork/11_프로젝트 공용 작업파일/국민대 박사과정/박사논문_생체모방 건물군 키네틱파사드 데이터 기반 성능 평가 프레임워크/최종본 작업/3권역_계산결과_웹/$REG"
mkdir -p "$OUT"
cd /content
[ -d b ] || git clone -q --depth 1 -b sim-r3 https://github.com/m48a2c999-svg/badtm b
EPD=/content/EnergyPlus-23.2.0-7636e6b3e9-Linux-Ubuntu22.04-x86_64
if [ ! -x $EPD/energyplus ]; then
  wget -q https://github.com/NREL/EnergyPlus/releases/download/v23.2.0/EnergyPlus-23.2.0-7636e6b3e9-Linux-Ubuntu22.04-x86_64.tar.gz -O ep.tgz
  tar xzf ep.tgz && rm ep.tgz
fi
RES=/content/res_$REG; mkdir -p $RES
for t in "$OUT"/chunk_*.tar; do [ -f "$t" ] && tar xf "$t" -C $RES; done
echo "restored $(ls $RES | wc -l) results"
( while true; do sleep 1800; cd $RES; ls *.pkl 2>/dev/null | sort > /tmp/all.txt; cat "$OUT"/chunk_*.list 2>/dev/null | sort > /tmp/sent.txt; comm -23 /tmp/all.txt /tmp/sent.txt > /tmp/new.txt; if [ -s /tmp/new.txt ]; then n=$(date +%Y%m%d_%H%M%S); tar cf "$OUT/chunk_$n.tar" -T /tmp/new.txt && cp /tmp/new.txt "$OUT/chunk_$n.list"; fi; done ) &
cd /content/b/mb/py
REGION=$REG EP_DIR=$EPD RES_DIR=$RES python3 sim_r3.py jobs_r3_$REG.json $(nproc) 2>&1 | tee -a /content/log_$REG.txt | grep -v cached || true
# 끝나면 남은 파일도 옮긴다
cd $RES; ls *.pkl | sort > /tmp/all.txt; cat "$OUT"/chunk_*.list 2>/dev/null | sort > /tmp/sent.txt; comm -23 /tmp/all.txt /tmp/sent.txt > /tmp/new.txt
[ -s /tmp/new.txt ] && { n=$(date +%Y%m%d_%H%M%S); tar cf "$OUT/chunk_$n.tar" -T /tmp/new.txt; cp /tmp/new.txt "$OUT/chunk_$n.list"; }
echo "ALL DONE $REG"
