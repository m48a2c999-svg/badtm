# r3-compute — 서울 오피스 3권역 EnergyPlus 계산 묶음(연구 계산용 브랜치)

역삼 257동과 같은 모델·기상·계산 조건(20개 조건: 개선 전과 9개 대안 × 주변 차폐 포함·제외)으로 3권역 대상 건물을 계산한다.
`bash mb/py/run_part.sh <part> <region>` — part: cbda, cbdb (도심), gbda, gbdb, gbdc (강남). 결과는 브랜치 `r3res-<part>`에 pkl.gz로 올라간다.
EnergyPlus 23.2.0 (Ubuntu22.04 x86_64 공식 배포본)을 /opt/ep에 설치해 쓴다. 입력은 OpenStreetMap(ODbL)과 건축물대장(공공데이터) 가공 자료.
