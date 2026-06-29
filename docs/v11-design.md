# National Growth Fund v11 Standalone Design

## Purpose

v11 is now a standalone process.

It does not read v7, v8, v10, entry-monitor, or any prior dashboard output when selecting candidates, collecting data, scoring rows, classifying regime, or making final decisions.

The process still inherits the older model's methodology:

- policy fit
- value and valuation burden
- technical setup
- foreign/institution flow
- price-only structural regime
- smart-money cost zone from standalone flow VWAP
- market dependency and regime suitability

But those methods are recomputed inside v11 from its own universe file and fresh market data.

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
Naver quote/valuation pages
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
- quote/valuation fields
- KOSPI/KOSDAQ index history
- semiconductor proxy history

The collected raw series are stored in `data/v11-source-data.json`.

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

### 5. Final Decision

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
