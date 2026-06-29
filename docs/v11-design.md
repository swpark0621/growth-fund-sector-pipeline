# 국민성장펀드 v11 독립 실행 설계

## 목적

v11은 독립 실행 프로세스다.

종목 선정, 데이터 수집, 기본 점수, 시장 의존도, 레짐 판단, 최종 실행 판단 과정에서 v7, v8, v10, entry-monitor 또는 기존 대시보드 산출물을 런타임 입력으로 읽지 않는다.

기존 모델의 방법론은 유지하되 v11 내부에서 다시 계산한다.

- 정책 적합도
- 가치/밸류에이션 부담
- 기술적 위치
- 외국인/기관 수급
- 가격 기반 체질
- 독립 수급 VWAP 기반 평단
- 시장 의존도와 레짐 적합성

v11의 목적은 반도체와 독립적인 종목만 고르는 것이 아니다. 좋은 재료와 안전성을 가진 후보 중에서 시장/반도체 의존도가 불리하게 작동하는 후보를 줄이고, 정책 이벤트성 광폭 반등장에서는 약세 분할 후보를 놓치지 않도록 실행 레일을 나누는 것이다.

## Dependency Audit

### Removed Runtime Dependencies

The previous v11 implementation depended on:

```text
data/v10-execution-dashboard-data.json
v10cScore
decision === ENTRY_OK
v10 entryList/allRows
```

Those are no longer runtime inputs.

### Current Runtime Inputs

```text
data/v11-universe.json
Naver daily stock prices
Naver foreign/institution flow pages
Naver quote/current price/valuation pages
KOSPI daily index
KOSDAQ daily index
KODEX Semiconductor ETF daily price as semi proxy
```

### Current Runtime Outputs

```text
data/v11-source-data.json
data/v11-beta-regime.json
data/v11-execution-dashboard-data.json
data/v11-capture-verification.json
docs/v11.html
```

## Process

### 1. Universe

`data/v11-universe.json` is the standalone candidate definition file.

It contains:

```text
ticker
company
sector
status
rationale
```

It does not contain prior version scores or decisions. Scores must be recomputed by v11.

### 2. Data Collection

`scripts/run-v11-standalone-process.mjs` collects:

- stock daily OHLCV
- foreign/institution daily net flow
- quote/current price/valuation fields
- KOSPI/KOSDAQ index history
- semiconductor proxy history

The collected raw series are stored in `data/v11-source-data.json`.

현재가 필드는 일봉 산출 기준가와 분리한다.

```text
currentPrice      = 조회 시점 네이버 현재가
currentChangePct  = 조회 시점 등락률
quoteFetchedAt    = 현재가 조회 시각
close             = 일봉 계산 기준 종가
latestDate        = 일봉 기준일
```

### 3. Base Evaluation

v11 computes:

```text
policy.score
value.score
technical.score
flowScore.score
risk.penalty
totalScore
holderCostScore
structuralRegime
v11BaseScore = totalScore + holderCostScore
v11BaseDecision
```

This is the older model's methodology reimplemented inside v11, not imported from older dashboard data.

### 4. Market Dependency

v11 then computes:

```text
betaMarket
betaSemiExcess
semiCorr
residualIR
residualStrengthPct
upCapture
lossCapture
captureRatio
marketDependencyScore
```

The beta model is:

```text
stockReturn
= alpha
+ betaMarket * KOSPI
+ betaSemiExcess * (SEMI proxy - KOSPI)
+ residual
```

The goal is not to reject semiconductor-linked names. The goal is to reject adverse dependency:

```text
high semi dependency
+ poor upside/downside capture
+ weak residual strength
= adverse dependency
```

### 5. Regime

레짐(regime)은 "지금 시장이 어떤 장세인가"를 뜻하는 v11의 시장 모드다. 같은 종목이라도 좁은 반도체 장, 위험회피장, 정책 이벤트 반등장에서는 진입 기준과 비중을 다르게 적용한다.

v11은 20일 추세뿐 아니라 당일 광폭 반등도 본다.

```text
정책 이벤트 반등장(POLICY_EVENT_REBOUND)
= KOSDAQ 1D 급등
+ KOSDAQ의 KOSPI 대비 당일 상대강도
+ 유니버스 당일 상승 비율
```

이 레짐은 2026-06-29처럼 코스닥이 정책/메가프로젝트 재료로 광범위하게 뛴 날을 반영하기 위한 보정이다. 이때는 추격 매수는 제한하지만, 품질·수급·체질·시장 의존도 조건을 통과한 `WAIT_TRIGGER`를 `ACCUMULATE_ON_WEAKNESS`로 승격할 수 있다.

### 6. Final Decision

`v11Decision` is native to v11:

```text
ENTRY
ACCUMULATE_ON_WEAKNESS
WAIT_TRIGGER
WATCH
AVOID_NOW
NO_DATA
DATA_FAIL
```

`v11StandaloneScore` is:

```text
v11StandaloneScore = v11BaseScore + marketDependencyScore
```

`NO_DATA` is not converted into a zero score.

`ENTRY`는 여전히 보수적 즉시 진입 후보이고, `ACCUMULATE_ON_WEAKNESS`는 정책 반등장에 맞춘 분할 진입 후보다. 둘을 같은 의미로 보지 않는다.

### 7. Execution Plan

각 행은 v10의 실행전략을 계승한 `executionPlan`을 가진다.

```text
stance
levels: 현재, MA20, 손절, 축소, 1차 회수, 2차 목표, 추정 평단
buySteps
sellSteps
sessionRules
riskSwitches
```

대시보드는 `현재가`, `조회 시점`, `일봉 기준가`, `진입/매도 전략`을 함께 표시한다.

## Commands

Full standalone refresh:

```powershell
npm run v11:standalone
```

Rebuild HTML from existing standalone data:

```powershell
npm run v11
```

Full refresh plus verification:

```powershell
npm run v11:all
```

Verification only:

```powershell
npm run v11:verify
```

## Verification

`scripts/verify-v11-capture.mjs` compares:

```text
baseEntry: rows where v11BaseDecision === ENTRY_OK
v11Entry: rows where v11Decision === ENTRY
v11Actionable: rows where v11Decision is ENTRY or ACCUMULATE_ON_WEAKNESS
baseScoreTop / v11ScoreTop: score-top baskets kept as reference only
```

The primary read is baseEntry versus v11Entry, because v11 uses market dependency as a final risk gate. It is not an independence-only ranking system. The score-top comparison is kept only to show how the additive score behaves.

It no longer compares against v10.

The verification uses forward 20 trading days over recent rolling periods. Fundamental scores are still latest static scores, so this is a sanity test, not a full point-in-time backtest.

## Invariants

- v11 runtime does not read prior version dashboard JSON.
- v11 universe, data collection, scoring, dependency profile, decision, dashboard, and verification are all generated under v11.
- Older version files may remain in the repository, but they are not inputs to the v11 process.
- The design remains defensive but does not blindly prefer semiconductor independence.
