# 3권역 EnergyPlus 계산 묶음 (sim-r3 브랜치)
역삼 257동과 같은 모델·대안·조건(20개 태그: 9개 대안 + 개선 전, 주변 차폐 포함·제외)으로 3권역 가구 안 업무시설을 계산한다.
- 입력: data/r3/(OSM 건물·건축물대장 결합 대상·연면적 배율), data/tmyx2011_2025/(서울 TMYx 2011–2025)
- 실행: `REGION=gbd EP_DIR=<EnergyPlus 23.2> RES_DIR=<결과 폴더> python3 mb/py/sim_r3.py mb/py/jobs_r3_gbd.json 2`
- 결과는 건물·태그별 pkl. 이미 있는 pkl은 건너뛰므로 중단 후 다시 실행하면 이어서 계산한다.
