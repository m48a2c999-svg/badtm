#!/bin/bash
# 사용: bash run_part.sh <part>   (part = jobs_part_<part>.json; REGION은 파일 안 첫 작업의 이름 접두로 판단하지 않고 PART_REGION 환경변수로 줌)
# 1) EnergyPlus 23.2.0 (Ubuntu22.04 x86_64, 원본과 같은 바이너리)을 /opt/ep에 설치  2) 작업 실행(2개 병렬, pkl 캐시로 이어서)
# 3) 30분마다 결과(pkl.gz)를 git 브랜치 r3res-<part>에 push
set -u
P=$1; R=$2
B=$(cd "$(dirname "$0")/../.." && pwd); export BUNDLE=$B
EPD=/opt/ep/EnergyPlus-23.2.0-7636e6b3e9-Linux-Ubuntu22.04-x86_64
if [ ! -x $EPD/energyplus ]; then
  mkdir -p /opt/ep && cd /opt/ep && curl -sSL -o ep.tgz https://github.com/NREL/EnergyPlus/releases/download/v23.2.0/EnergyPlus-23.2.0-7636e6b3e9-Linux-Ubuntu22.04-x86_64.tar.gz && tar xzf ep.tgz && rm ep.tgz
  rm -rf $EPD/{Documentation,ExampleFiles/[!R]*,WeatherData,PostProcess/EP-Compare,DataSets/FMUs} 2>/dev/null
fi
cd $B/mb/py
pusher() {
  while true; do
    sleep 1800
    bash $B/mb/py/push_res.sh $P $R >> $B/mb/py/push_$P.log 2>&1
  done
}
pusher & PP=$!
REGION=$R python3 sim_r3.py jobs_part_$P.json 2 >> run_$P.log 2>&1
kill $PP 2>/dev/null
bash $B/mb/py/push_res.sh $P $R >> $B/mb/py/push_$P.log 2>&1
echo "PART $P FINISHED $(date)" >> run_$P.log
