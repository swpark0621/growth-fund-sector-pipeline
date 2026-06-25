# 국민성장펀드 v11 설계

**시장 의존도·레짐 적합성 레이어**

- 문서 버전: v11-design draft 2
- 기반: v7 totalScore, v8/v10 holderCostScore, v10cScore
- 원칙: 기존 점수와 결정은 읽기 전용으로 보존하고, v11 필드만 추가한다.

## 목적

v11은 반도체와 독립적인 종목만 고르기 위한 레이어가 아니다.

v11의 목적은 좋은 종목 후보 중에서 시장/반도체 의존도가 불리하게 작동하는 후보를 줄이고, 레짐에 따라 진입 강도와 비중을 조절하는 것이다.

따라서 반도체 상관이 높다는 사실만으로 탈락시키지 않는다. 진짜 제어 대상은 아래 조합이다.

```text
semiProxyFlag = true
+ 상승 캡처 약함
+ 하락 캡처 큼
+ 잔차 강도 약함
= 불리한 시장 의존성
```

반대로 아래 조합은 살릴 수 있다.

```text
semiCorr 높음
+ 상승 캡처 좋음
+ 하락 캡처 낮음
+ 잔차 강도 양호
= 반도체 장세를 활용하는 전술 후보
```

## v11이 추가하는 필드

```text
betaProfile
dependencyProfile
marketDependencyScore
v11Score
v11Decision
v11Reason
```

`totalScore`, `decision`, `holderCostScore`, `v10cScore`는 변경하지 않는다.

## 베타 모델

단일 반도체 베타가 시장 베타를 같이 먹지 않도록 2팩터 모델을 쓴다.

```text
stockReturn
= alpha
+ betaMarket * KOSPI
+ betaSemiExcess * (SEMI proxy - KOSPI)
+ residual
```

반도체 프록시는 현재 `KODEX Semiconductor ETF(091160)`을 사용한다.

잔차 강도는 같은 윈도우 안의 잔차 합이 아니라, 베타 추정 구간과 평가 구간을 분리한 residual IR을 유니버스 백분위로 환산한다.

## 점수 철학

`marketDependencyScore`는 독립성 점수가 아니라 실행 리스크 점수다.

가중 순서는 다음과 같다.

1. 캡처 비대칭: 덜 빠지고 충분히 오르는가.
2. 잔차 강도: 시장/반도체 베타 제거 후에도 강한가.
3. 의존성 조정: 반도체 프록시가 불리하게 작동하는가, 또는 유리한 베타인가.

반도체 동조성 자체는 감점하지 않는다. `semiProxyFlag`와 나쁜 캡처 구조가 함께 나타날 때만 강하게 감점한다.

## v11Decision

v11은 v10 ENTRY_OK를 절대 완화하지 않는다.

```text
v10 비진입 종목 -> NOT_V10_ENTRY
데이터 부족 -> NO_DATA
v10 ENTRY_OK + 점수/레짐 통과 -> ENTRY
v10 ENTRY_OK + 점수 근접 -> ACCUMULATE_ON_WEAKNESS
v10 ENTRY_OK + 불리한 의존성/캡처 실패 -> WATCH
```

레짐별 기본 임계값:

```text
NARROW_SEMI_LED : 7
RISK_OFF        : 10
BROAD_RISK_ON   : 0
NEUTRAL         : 3
```

`NARROW_SEMI_LED`와 `RISK_OFF`에서는 `ADVERSE_DEPENDENCY`, `asymmetricFailure`, 높은 하락 캡처를 하드 게이트로 본다.

## 구현 파일

```text
scripts/v11-utils.mjs
scripts/collect-beta-regime.mjs
scripts/build-v11-structure-dashboard.mjs
scripts/verify-v11-capture.mjs
data/v11-beta-regime.json
data/v11-execution-dashboard-data.json
data/v11-capture-verification.json
docs/v11.html
```

## 실행 순서

```powershell
npm run v11:collect
npm run v11
npm run v11:verify
```

또는 전체 v11 파이프라인:

```powershell
npm run v11:all
```

## 해석 주의

v11은 방어적인 성격을 가진다. 다만 좋은 반도체 연동 수혜주를 무조건 배제하지 않는다. 목표는 반도체와 독립적인 종목만 고르는 것이 아니라, 같이 빠지기만 하는 불리한 후보를 줄이는 것이다.

검증 스크립트는 v11 베타/의존도 지표를 과거 시점 기준으로 굴려 이후 20거래일을 평가한다. 단, 현재 저장소에는 과거 시점별 v10cScore 재계산값이 없으므로 v10cScore는 최신 점수 기준이라는 한계가 있다.
