import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEMI_PROXY,
  appendResidualPercentiles,
  average,
  classifyRegime,
  compactDate,
  computeBetaProfile,
  fetchIndexHistory,
  fetchStockHistory,
  fetchText,
  formatSeoulDate,
  formatSeoulDateTime,
  historyToPairs,
  median,
  parseNumber,
  round,
  scoreMarketDependency,
  sizeFactor,
  sleep,
  strip,
  yearsAgoCompact
} from "./v11-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(__dirname, "..");
export const paths = {
  universe: path.join(root, "data", "v11-universe.json"),
  source: path.join(root, "data", "v11-source-data.json"),
  beta: path.join(root, "data", "v11-beta-regime.json"),
  dashboardData: path.join(root, "data", "v11-execution-dashboard-data.json"),
  dashboardHtml: path.join(root, "docs", "v11.html")
};

export async function runStandaloneV11({ writeHtml = true } = {}) {
  const runNow = new Date();
  const runDate = formatSeoulDate(runNow);
  const start = yearsAgoCompact(3, runNow);
  const end = compactDate(runDate);
  const universe = JSON.parse(fs.readFileSync(paths.universe, "utf8"));
  const items = universe.items ?? [];
  if (!items.length) throw new Error("data/v11-universe.json has no items");

  console.log(`v11 standalone universe: ${items.length} items`);
  console.log(`Collecting index history from ${start} to ${end}`);
  const [kospiHistory, kosdaqHistory, semiHistory] = await Promise.all([
    fetchIndexHistory("KOSPI", 130),
    fetchIndexHistory("KOSDAQ", 130),
    fetchStockHistory(SEMI_PROXY.ticker, { start, end })
  ]);

  const stockHistories = new Map();
  const snapshots = new Map();
  const rows = [];
  const tasks = items.map((item, index) => async () => {
    try {
      const [priceHistory, flowHistory, snapshot] = await Promise.all([
        fetchStockHistory(item.ticker, { start, end }),
        fetchForeignHistory(item.ticker, 14),
        fetchQuoteSnapshot(item.ticker)
      ]);
      const history = mergeHistory(priceHistory, flowHistory);
      stockHistories.set(item.ticker, history);
      snapshots.set(item.ticker, snapshot);
      const row = evaluateStandalone(item, history, snapshot);
      rows.push(row);
      console.log(`[${String(index + 1).padStart(3, "0")}/${items.length}] ${item.company} ${item.ticker}: ${row.v11BaseDecision} ${row.v11BaseScore}`);
    } catch (error) {
      rows.push({
        ...item,
        error: error.message,
        v11BaseDecision: "DATA_FAIL",
        v11Decision: "DATA_FAIL",
        v11BaseScore: 0,
        v11StandaloneScore: null
      });
      stockHistories.set(item.ticker, []);
      console.log(`[${String(index + 1).padStart(3, "0")}/${items.length}] ${item.company} ${item.ticker}: ERROR ${error.message}`);
    }
    await sleep(25);
  });
  await mapLimit(tasks, 5);

  const validRows = rows.filter((row) => !row.error);
  const regime = classifyRegime({ kospiHistory, kosdaqHistory, semiHistory, rows: validRows });
  const profiles = validRows.map((row) => computeBetaProfile({
    row,
    stockHistory: stockHistories.get(row.ticker) ?? [],
    kospiHistory,
    semiHistory
  }));
  appendResidualPercentiles(profiles);
  const profileMap = new Map(profiles.map((profile) => [profile.ticker, profile]));

  for (const row of rows) {
    const profile = profileMap.get(row.ticker) ?? null;
    const dependencyScore = scoreMarketDependency(profile);
    const decision = decideStandalone({ row, profile, dependencyScore, regime });
    row.betaProfile = profile;
    row.dependencyProfile = {
      ...dependencyScore,
      sizeFactor: sizeFactor({ score: dependencyScore.marketDependencyScore, regime }),
      thresholdRegime: regime.state
    };
    row.marketDependencyScore = dependencyScore.marketDependencyScore;
    row.v11StandaloneScore = dependencyScore.marketDependencyScore == null
      ? null
      : Math.round(row.v11BaseScore + dependencyScore.marketDependencyScore);
    row.v11Decision = decision.v11Decision;
    row.v11Reason = decision.reason;
    row.executionPlan = buildExecutionPlan(row);
    row.entryPlan = row.executionPlan;
  }

  const ranked = rows.sort(compareRows);
  const output = {
    meta: {
      title: "국민성장펀드 v11 독립 실행 대시보드",
      version: "v11-standalone",
      runDate,
      updatedAt: formatSeoulDateTime(runNow),
      universeSource: "data/v11-universe.json",
      purpose:
        "v11은 종목 유니버스, 데이터 수집, 기본 점수, 시장 의존도, 레짐, 실행 판단을 이전 버전 산출물 없이 독립적으로 다시 계산합니다.",
      methodology:
        "기존의 정책·가치·기술·수급·평단·체질 방법론을 v11 내부에서 재계산한 뒤, 시장 의존도와 레짐 적합성을 실행 게이트로 더합니다.",
      warning:
        "투자 권유가 아니라 후보 탐색과 실행 조건 점검 프레임워크입니다. 점수와 베타는 추정치이며 데이터 Tier와 시장 레짐을 함께 봐야 합니다."
    },
    market: {
      kospi: marketSummary(kospiHistory),
      kosdaq: marketSummary(kosdaqHistory),
      semiProxy: { ...marketSummary(semiHistory), ticker: SEMI_PROXY.ticker, name: SEMI_PROXY.name }
    },
    regime,
    summary: summarizeStandalone(ranked),
    rules: standaloneRules(),
    entryList: ranked.filter((row) => row.v11Decision === "ENTRY"),
    accumulateList: ranked.filter((row) => row.v11Decision === "ACCUMULATE_ON_WEAKNESS"),
    watchList: ranked.filter((row) => row.v11Decision === "WATCH"),
    triggerList: ranked.filter((row) => row.v11Decision === "WAIT_TRIGGER").slice(0, 35),
    allRows: ranked,
    sources: [
      { title: "v11 독립 유니버스", url: "data/v11-universe.json" },
      { title: "네이버금융 일별 시세 API", url: "https://api.finance.naver.com/siseJson.naver" },
      { title: "네이버금융 투자자 수급 페이지", url: "https://finance.naver.com/" },
      { title: SEMI_PROXY.name, url: SEMI_PROXY.sourceUrl }
    ]
  };

  const sourceData = {
    meta: {
      title: "National Growth Fund v11 standalone source data",
      version: "v11-source-standalone",
      runDate,
      updatedAt: output.meta.updatedAt,
      universeSource: "data/v11-universe.json",
      sourceNote: "Raw market series and snapshots collected by the standalone v11 process."
    },
    universeMeta: universe.meta,
    regime,
    snapshots: Object.fromEntries(snapshots.entries()),
    series: {
      indices: {
        kospi: historyToPairs(kospiHistory),
        kosdaq: historyToPairs(kosdaqHistory),
        semi: historyToPairs(semiHistory)
      },
      stocks: Object.fromEntries([...stockHistories.entries()].map(([ticker, history]) => [ticker, historyToPairs(history)]))
    }
  };
  const betaData = {
    meta: {
      title: "National Growth Fund v11 standalone beta/regime data",
      version: "v11-beta-regime-standalone",
      runDate,
      updatedAt: output.meta.updatedAt,
      purpose: "Standalone market dependency profiles generated from data/v11-universe.json.",
      methodology:
        "Two-factor model: stock return = alpha + betaMarket*KOSPI + betaSemiExcess*(SEMI proxy - KOSPI) + residual.",
      semiProxy: SEMI_PROXY
    },
    regime,
    indexMeta: {
      kospiRows: kospiHistory.length,
      kosdaqRows: kosdaqHistory.length,
      semiRows: semiHistory.length,
      start,
      end
    },
    profiles: Object.fromEntries(profiles.map((profile) => [profile.ticker, profile])),
    profileList: profiles,
    sources: output.sources
  };

  fs.writeFileSync(paths.source, JSON.stringify(sourceData, null, 2) + "\n", "utf8");
  fs.writeFileSync(paths.beta, JSON.stringify(betaData, null, 2) + "\n", "utf8");
  fs.writeFileSync(paths.dashboardData, JSON.stringify(output, null, 2) + "\n", "utf8");
  if (writeHtml) fs.writeFileSync(paths.dashboardHtml, buildStandaloneHtml(output), "utf8");

  console.log(`Generated ${path.relative(root, paths.source)}`);
  console.log(`Generated ${path.relative(root, paths.beta)}`);
  console.log(`Generated ${path.relative(root, paths.dashboardData)}`);
  if (writeHtml) console.log(`Generated ${path.relative(root, paths.dashboardHtml)}`);
  return output;
}

export function rebuildStandaloneHtml() {
  const data = JSON.parse(fs.readFileSync(paths.dashboardData, "utf8"));
  fs.writeFileSync(paths.dashboardHtml, buildStandaloneHtml(data), "utf8");
  console.log(`Generated ${path.relative(root, paths.dashboardHtml)}`);
}

function evaluateStandalone(item, history, snapshot) {
  if (history.length < 60) throw new Error("history too short");
  const latest = history.at(-1);
  const closes = history.map((row) => row.close);
  const highs = history.map((row) => row.high ?? row.close);
  const lows = history.map((row) => row.low ?? row.close);
  const volumes = history.map((row) => row.volume);
  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const ma120 = sma(closes, 120);
  const ma200 = sma(closes, 200);
  const ma600 = sma(closes, 600);
  const rsi14 = rsi(closes, 14);
  const high60 = Math.max(...highs.slice(-60), latest.close);
  const low60 = Math.min(...lows.slice(-60), latest.close);
  const ret5 = pctChange(closes.at(-6), latest.close);
  const ret20 = pctChange(closes.at(-21), latest.close);
  const ret60 = pctChange(closes.at(-61), latest.close);
  const drawdown60Pct = pctChange(high60, latest.close);
  const reboundFromLow60Pct = pctChange(low60, latest.close);
  const avgVol20 = average(volumes.slice(-20)) ?? 0;
  const quote = {
    ...snapshot,
    marketCapEok: snapshot.marketCapEok ?? marketCapFromShares(snapshot.listedShares, latest.close)
  };
  const ret1 = pctChange(closes.at(-2), latest.close);
  const flows = {
    d5: calcFlow(history, 5, quote.marketCapEok),
    d20: calcFlow(history, 20, quote.marketCapEok),
    d60: calcFlow(history, 60, quote.marketCapEok)
  };
  const policy = policyScore(item);
  const value = valueScore(quote, item);
  const technical = technicalScore({
    latest,
    ma5,
    ma20,
    ma60,
    rsi14,
    drawdown60Pct,
    reboundFromLow60Pct,
    ret20,
    volumeRatio: avgVol20 ? latest.volume / avgVol20 : null
  });
  const flowScore = investorFlowScore(flows.d5, flows.d20, flows.d60);
  const risk = riskPenalty(item, quote, { latest, ma20, ma60, rsi14, ret20 });
  const totalScore = Math.round(clamp(policy.score + value.score + technical.score + flowScore.score - risk.penalty, 0, 100));
  const baseDecision = decideBase(totalScore, risk, { latest, ma20, rsi14, ret20 });
  const structuralRegime = buildStructuralRegime(history, latest, ma200, ma600);
  const holderCost = buildHolderCostSignal(history, latest.close);
  const holderCostScore = holderCost.score;
  const v11BaseScore = Math.round(totalScore + holderCostScore);
  const structuralGatePass = structuralRegime.entryEligible || structuralRegime.gate === "REVIEW";
  const v11BaseDecision = baseDecision === "ENTRY_OK" && !structuralGatePass ? "WAIT_TRIGGER" : baseDecision;

  return {
    ...item,
    latestDate: latest.date,
    close: latest.close,
    currentPrice: quote.currentPrice ?? latest.close,
    currentChangePct: quote.currentChangePct,
    currentDiff: quote.currentDiff,
    quoteFetchedAt: quote.quoteFetchedAt,
    priceSource: {
      currentPrice: quote.currentPrice ?? latest.close,
      currentChangePct: quote.currentChangePct,
      currentDiff: quote.currentDiff,
      quoteFetchedAt: quote.quoteFetchedAt,
      analysisClose: latest.close,
      analysisDate: latest.date
    },
    marketCapEok: quote.marketCapEok,
    listedShares: quote.listedShares,
    per: quote.per,
    pbr: quote.pbr,
    roe: quote.roe,
    liquidity: {
      avgVolume20: Math.round(avgVol20),
      volumeRatio: round(avgVol20 ? latest.volume / avgVol20 : null, 2)
    },
    returns: { d1: ret1, d5: ret5, d20: ret20, d60: ret60 },
    technicals: {
      ma5,
      ma20,
      ma60,
      ma120,
      ma200,
      ma600,
      rsi14,
      high60,
      low60,
      drawdown60Pct,
      reboundFromLow60Pct,
      aboveMa20: latest.close >= ma20,
      aboveMa60: latest.close >= ma60,
      ma20SlopePct: pctChange(sma(closes.slice(0, -5), 20), ma20)
    },
    flows,
    policy,
    value,
    technical,
    flowScore,
    risk,
    totalScore,
    holderCost,
    holderCostScore,
    structuralRegime,
    v11BaseDecision,
    v11BaseScore,
    entryPlan: entryPlan(v11BaseDecision, latest.close, ma20, ma60, low60, high60),
    sourceUrl: `https://finance.naver.com/item/main.naver?code=${item.ticker}`
  };
}

async function fetchQuoteSnapshot(ticker) {
  const html = await fetchText(`https://finance.naver.com/item/sise.naver?code=${ticker}`, "euc-kr");
  const text = strip(html);
  const currentPrice = parseNumber(textById(html, "_nowVal"));
  const currentDiff = parseNumber(textById(html, "_diff"));
  const currentChangePct = parseNullableNumber(textById(html, "_rate")?.replace("%", ""));
  const marketCapEok = firstNumber(text.match(/시가총액\s*([\d,]+)\s*억원/));
  const listedShares = firstNumber(text.match(/상장주식수\s*([\d,]+)/));
  const per = parseNullableNumber(text.match(/\bPER\s*([-.\d]+|N\/A)/)?.[1]);
  const pbr = parseNullableNumber(text.match(/\bPBR[\s\S]{0,180}?([-.\d]+|N\/A)\s*(?:배)?\s*l/)?.[1]);
  const roe = parseNullableNumber(text.match(/\bROE[\s\S]{0,120}?([-.\d]+|N\/A)\s*%/)?.[1]);
  return {
    currentPrice,
    currentDiff,
    currentChangePct,
    quoteFetchedAt: formatSeoulDateTime(new Date()),
    marketCapEok,
    listedShares,
    per,
    pbr,
    roe
  };
}

function textById(html, id) {
  const match = html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`));
  return match ? strip(match[1]) : null;
}

async function fetchForeignHistory(ticker, pages) {
  const rows = [];
  for (let page = 1; page <= pages; page += 1) {
    const html = await fetchText(`https://finance.naver.com/item/frgn.naver?code=${ticker}&page=${page}`, "euc-kr");
    const trs = html.match(/<tr onMouseOver[\s\S]*?<\/tr>/g) ?? [];
    for (const tr of trs) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
      if (cells.length !== 9 || !/^\d{4}\.\d{2}\.\d{2}$/.test(cells[0])) continue;
      const close = parseNumber(cells[1]);
      const institutionNetShares = parseNumber(cells[5]);
      const foreignNetShares = parseNumber(cells[6]);
      rows.push({
        date: cells[0].replaceAll(".", "-"),
        institutionNetShares,
        foreignNetShares,
        foreignHoldingRatePct: parseNumber(cells[8]),
        institutionNetValueEok: close && institutionNetShares != null ? round(close * institutionNetShares / 100_000_000, 2) : null,
        foreignNetValueEok: close && foreignNetShares != null ? round(close * foreignNetShares / 100_000_000, 2) : null
      });
    }
    await sleep(15);
  }
  return dedupByDate(rows).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeHistory(priceHistory, flowHistory) {
  const flowMap = new Map(flowHistory.map((row) => [row.date, row]));
  return priceHistory.map((row) => ({ ...row, ...(flowMap.get(row.date) ?? {}) }));
}

async function mapLimit(tasks, limit) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      await task();
    }
  });
  await Promise.all(workers);
}

function policyScore(item) {
  const weights = [
    ["전력", 24],
    ["데이터센터", 23],
    ["AI", 23],
    ["반도체", 22],
    ["방산", 21],
    ["우주", 21],
    ["로봇", 20],
    ["바이오", 18],
    ["이차전지", 17],
    ["핵심광물", 16],
    ["순환공급망", 16],
    ["수소", 15],
    ["OLED", 15],
    ["디스플레이", 15],
    ["미래차", 15],
    ["콘텐츠", 13]
  ];
  const text = `${item.sector} ${item.rationale}`;
  let score = 12;
  for (const [keyword, value] of weights) {
    if (text.includes(keyword)) score = Math.max(score, value);
  }
  if (item.status === "already-selected") score -= 8;
  if (item.status === "watch") score -= 2;
  return { score: clamp(score, 0, 25), memo: item.rationale };
}

function valueScore(quote, item) {
  let score = 12;
  if (quote.marketCapEok == null) score -= 3;
  else if (quote.marketCapEok <= 5000) score += 8;
  else if (quote.marketCapEok <= 30000) score += 7;
  else if (quote.marketCapEok <= 120000) score += 4;
  else score += 1;
  if (quote.pbr != null) {
    if (quote.pbr > 0 && quote.pbr <= 1.3) score += 4;
    else if (quote.pbr <= 2.5) score += 2;
    else if (quote.pbr > 10) score -= 8;
    else if (quote.pbr > 6) score -= 5;
  }
  if (quote.per != null) {
    if (quote.per < 0) score -= 4;
    else if (quote.per > 0 && quote.per <= 18) score += 3;
    else if (quote.per > 60) score -= 5;
    else if (quote.per > 35) score -= 2;
  }
  if (item.status === "watch") score -= 1;
  return { score: clamp(score, 0, 25), memo: `시총 ${quote.marketCapEok ?? "-"}억원, PER ${quote.per ?? "-"}, PBR ${quote.pbr ?? "-"}` };
}

function technicalScore(t) {
  let score = 0;
  if (t.latest.close >= t.ma20) score += 9;
  else if (t.latest.close >= t.ma5) score += 5;
  if (t.latest.close >= t.ma60) score += 8;
  else if (t.ma20 >= t.ma60) score += 4;
  if (t.rsi14 >= 38 && t.rsi14 <= 58) score += 8;
  else if (t.rsi14 >= 30 && t.rsi14 < 38) score += 4;
  else if (t.rsi14 > 70) score -= 3;
  if (t.drawdown60Pct <= -8 && t.drawdown60Pct >= -28) score += 7;
  else if (t.drawdown60Pct < -28 && t.drawdown60Pct >= -45) score += 3;
  else if (t.drawdown60Pct < -45) score -= 5;
  if (t.ret20 > -18 && t.ret20 < 12) score += 5;
  else if (t.ret20 <= -35) score -= 6;
  if (t.reboundFromLow60Pct > 8) score += 4;
  if (t.volumeRatio != null && t.volumeRatio > 0.8 && t.volumeRatio < 2.5) score += 3;
  return { score: clamp(score, 0, 35), memo: `MA20 ${t.latest.close >= t.ma20 ? "상회" : "하회"}, RSI ${round(t.rsi14, 1)}, 60일 고점 대비 ${round(t.drawdown60Pct, 1)}%` };
}

function investorFlowScore(d5, d20, d60) {
  let score = 0;
  if ((d5.foreignPct ?? 0) > 0) score += 4;
  if ((d5.institutionPct ?? 0) > 0) score += 4;
  if ((d20.foreignPct ?? 0) > 0) score += 5;
  if ((d20.institutionPct ?? 0) > 0) score += 5;
  if ((d60.foreignPct ?? 0) > 0) score += 3;
  if ((d60.institutionPct ?? 0) > 0) score += 3;
  return { score: clamp(score, 0, 20), memo: `20일 외국인 ${round(d20.foreignPct, 2)}%, 기관 ${round(d20.institutionPct, 2)}%` };
}

function riskPenalty(item, quote, t) {
  let penalty = 0;
  const notes = [];
  let valuationBlock = false;
  if (item.status === "already-selected") {
    penalty += 8;
    notes.push("기선정 종목");
  }
  if (item.status === "watch") {
    penalty += 3;
    notes.push("관찰군 변동성");
  }
  if (quote.marketCapEok != null && quote.marketCapEok < 700) {
    penalty += 5;
    notes.push("초소형 유동성 리스크");
  }
  if (quote.per != null && quote.per < 0 && quote.pbr != null && quote.pbr > 3) {
    penalty += 8;
    valuationBlock = true;
    notes.push("적자와 고PBR 동시 부담");
  } else if (quote.per != null && quote.per < 0) {
    penalty += 4;
    notes.push("적자 기업");
  }
  if (quote.pbr != null && quote.pbr > 10) {
    penalty += 8;
    valuationBlock = true;
    notes.push("PBR 10배 초과");
  } else if (quote.pbr != null && quote.pbr > 6) {
    penalty += 5;
    notes.push("고PBR 부담");
  }
  if (quote.per != null && quote.per > 60) {
    penalty += 6;
    valuationBlock = true;
    notes.push("PER 60배 초과");
  }
  if (t.ret20 <= -35) {
    penalty += 6;
    notes.push("20일 추세 훼손");
  }
  if (t.latest.close < t.ma20 && t.latest.close < t.ma60) {
    penalty += 5;
    notes.push("MA20·MA60 동시 하회");
  }
  if (t.rsi14 < 28) {
    penalty += 3;
    notes.push("과매도 지속 리스크");
  }
  return { penalty, notes, valuationBlock };
}

function decideBase(totalScore, risk, t) {
  if (totalScore >= 76 && t.latest.close >= t.ma20 && t.rsi14 >= 35 && t.ret20 > -25 && risk.penalty <= 10 && !risk.valuationBlock) return "ENTRY_OK";
  if (totalScore >= 64 && t.rsi14 >= 28 && t.ret20 > -45) return "WAIT_TRIGGER";
  return "AVOID_NOW";
}

function decideStandalone({ row, profile, dependencyScore, regime }) {
  if (row.error) return { v11Decision: "DATA_FAIL", reason: row.error };
  if (row.v11BaseDecision !== "ENTRY_OK") {
    if (row.v11BaseDecision === "WAIT_TRIGGER" && canPromoteWaitTrigger({ row, profile, dependencyScore, regime })) {
      return {
        v11Decision: "ACCUMULATE_ON_WEAKNESS",
        reason: "정책 반등 레짐: 기본 조건은 대기지만 품질·수급·의존도 통과로 약세 분할 후보"
      };
    }
    return { v11Decision: row.v11BaseDecision, reason: `기본 판정 ${row.v11BaseDecision}` };
  }
  if (!profile || dependencyScore.marketDependencyScore == null) {
    return { v11Decision: "NO_DATA", reason: "시장 의존도 데이터 부족" };
  }
  const threshold = thresholdByRegime(regime.state);
  const hardBlock = hardGateBlock(profile, regime.state);
  if (hardBlock) return { v11Decision: "WATCH", reason: hardBlock };
  if (dependencyScore.marketDependencyScore >= threshold) {
    return { v11Decision: "ENTRY", reason: `의존도 점수 ${dependencyScore.marketDependencyScore} >= 레짐 기준 ${threshold}` };
  }
  if (dependencyScore.marketDependencyScore >= threshold - 6) {
    return { v11Decision: "ACCUMULATE_ON_WEAKNESS", reason: `의존도 점수 ${dependencyScore.marketDependencyScore}, 레짐 기준 ${threshold} 근접` };
  }
  return { v11Decision: "WATCH", reason: `의존도 점수 ${dependencyScore.marketDependencyScore}, 레짐 기준 ${threshold} 미달` };
}

function canPromoteWaitTrigger({ row, profile, dependencyScore, regime }) {
  const state = regime?.state ?? "NEUTRAL";
  if (!["POLICY_EVENT_REBOUND", "BROAD_RISK_ON"].includes(state)) return false;
  if (!profile || dependencyScore.marketDependencyScore == null) return false;
  if (hardGateBlock(profile, state)) return false;
  if (row.risk?.valuationBlock || (row.risk?.penalty ?? 99) > 12) return false;
  if ((row.v11BaseScore ?? 0) < 78 || (row.totalScore ?? 0) < 64) return false;
  if ((row.returns?.d20 ?? -100) <= -25 || (row.technicals?.rsi14 ?? 0) < 32) return false;
  const structuralOk = ["PASS", "REVIEW"].includes(row.structuralRegime?.gate) || (row.structuralRegime?.score ?? 0) >= 55;
  if (!structuralOk) return false;
  const shortSetupOk = row.close >= row.technicals?.ma5 || (row.technicals?.reboundFromLow60Pct ?? 0) >= 8;
  if (!shortSetupOk) return false;
  return dependencyScore.marketDependencyScore >= Math.max(0, thresholdByRegime(state) - 2);
}

function buildStructuralRegime(history, latest, ma200, ma600) {
  const basisIndex = history.length >= 600 ? history.length - 600 : 0;
  const basis = history[basisIndex];
  const rows = history.slice(basisIndex);
  const highClose = Math.max(...rows.map((row) => row.close));
  const lowClose = Math.min(...rows.map((row) => row.close));
  const returnPct = pctChange(basis.close, latest.close);
  const days = rows.length;
  const years = Math.max(days / 245, 0.1);
  const cagrPct = basis.close > 0 ? ((latest.close / basis.close) ** (1 / years) - 1) * 100 : null;
  const drawdownFromHighPct = pctChange(highClose, latest.close);
  const maxDrawdownPct = maxDrawdown(rows);
  const metric = {
    returnPct,
    cagrPct,
    drawdownFromHighPct,
    maxDrawdownPct,
    aboveMA200: ma200 != null ? latest.close >= ma200 : false,
    aboveMA600: ma600 != null ? latest.close >= ma600 : false,
    days,
    confidence: 2
  };
  const score = structuralScore(metric);
  const entryEligible = score >= 70 && metric.aboveMA200 && metric.aboveMA600 && returnPct > 0 && drawdownFromHighPct >= -45;
  return {
    mode: "PRICE_ONLY_STANDALONE",
    confidence: 2,
    score,
    gate: entryEligible ? "PASS" : score >= 50 ? "REVIEW" : "BLOCK",
    grade: score >= 80 ? "강한 체질" : score >= 65 ? "개선 체질" : score >= 50 ? "검토 체질" : "약한 체질",
    entryEligible,
    primary: {
      label: "v11 독립 가격 체질",
      date: basis.date,
      latestDate: latest.date,
      basisClose: basis.close,
      latestClose: latest.close,
      returnPct: round(returnPct, 1),
      cagrPct: round(cagrPct, 1),
      highClose,
      lowClose,
      drawdownFromHighPct: round(drawdownFromHighPct, 1),
      maxDrawdownPct: round(maxDrawdownPct, 1),
      aboveMA200: metric.aboveMA200,
      aboveMA600: metric.aboveMA600
    }
  };
}

function structuralScore(metric) {
  let score = metric.confidence * 5;
  if (metric.cagrPct >= 35) score += 25;
  else if (metric.cagrPct >= 20) score += 20;
  else if (metric.cagrPct >= 10) score += 14;
  else if (metric.cagrPct >= 0) score += 8;
  if (metric.returnPct >= 100) score += 10;
  else if (metric.returnPct >= 50) score += 8;
  else if (metric.returnPct >= 20) score += 5;
  else if (metric.returnPct >= 0) score += 3;
  if (metric.aboveMA200) score += 8;
  if (metric.aboveMA600) score += 8;
  if (metric.drawdownFromHighPct >= -15) score += 12;
  else if (metric.drawdownFromHighPct >= -30) score += 8;
  else if (metric.drawdownFromHighPct >= -45) score += 4;
  if (metric.maxDrawdownPct >= -35) score += 12;
  else if (metric.maxDrawdownPct >= -55) score += 6;
  return Math.round(clamp(score, 0, metric.days < 180 ? 50 : metric.days < 365 ? 65 : 100));
}

function buildHolderCostSignal(history, close) {
  const institutionCost = positiveFlowCost(history, "institutionNetShares", 240);
  const foreignCost = positiveFlowCost(history, "foreignNetShares", 240);
  const candidates = [];
  if (institutionCost) {
    candidates.push(scoreHolderCost({
      tier: "B",
      coefficient: 0.7,
      source: "기관 순매수 VWAP",
      estimatedCost: institutionCost.cost,
      holderName: "기관 수급",
      recentAccumulation: institutionCost.netShares > 0,
      disposalPressure: institutionCost.last20NetShares < 0,
      flow: institutionCost
    }, close));
  }
  if (foreignCost && hasForeignAccumulation(history)) {
    candidates.push(scoreHolderCost({
      tier: "B",
      coefficient: 0.7,
      source: "외국인 순매수 VWAP",
      estimatedCost: foreignCost.cost,
      holderName: "외국인 수급",
      recentAccumulation: foreignCost.netShares > 0,
      disposalPressure: foreignCost.last20NetShares < 0,
      flow: foreignCost
    }, close));
  }
  if (!candidates.length) {
    return { tier: "NO_DATA", coefficient: 0, score: 0, signal: "NO_DATA", estimatedCost: null, gapPct: null, memo: "독립 수급 평단 근거 부족" };
  }
  return candidates.sort((a, b) => b.score - a.score)[0];
}

function scoreHolderCost(candidate, close) {
  const gapPct = pctChange(candidate.estimatedCost, close);
  let raw = 0;
  if (gapPct >= -10 && gapPct <= 30) raw += 18;
  else if (gapPct >= -20 && gapPct <= 50) raw += 10;
  else if (gapPct < -20) raw += 3;
  if (candidate.recentAccumulation && gapPct >= -15 && gapPct <= 35) raw += 8;
  if (candidate.holderName) raw += 2;
  const overhang = gapPct >= 50 && candidate.disposalPressure;
  if (overhang) raw -= 12;
  const score = Math.round(clamp(raw * candidate.coefficient, 0, 30));
  return {
    ...candidate,
    score,
    signal: overhang ? "OVERHANG" : score >= 14 ? "ACCUMULATION" : score > 0 ? "NEUTRAL" : "NO_DATA",
    gapPct: round(gapPct, 1),
    estimatedCost: round(candidate.estimatedCost, 0),
    overhang,
    memo: `${candidate.tier} ${candidate.source}, 추정 평단 ${formatPrice(round(candidate.estimatedCost, 0))}, 괴리 ${round(gapPct, 1)}%`
  };
}

function positiveFlowCost(history, shareKey, lookback) {
  const rows = history.slice(-lookback).filter((row) => Number.isFinite(row[shareKey]) && Number.isFinite(row.close));
  const positiveRows = rows.filter((row) => row[shareKey] > 0);
  const shares = sum(positiveRows.map((row) => row[shareKey]));
  if (shares <= 0) return null;
  return {
    cost: sum(positiveRows.map((row) => row.close * row[shareKey])) / shares,
    shares,
    netShares: sum(rows.map((row) => row[shareKey])),
    last20NetShares: sum(rows.slice(-20).map((row) => row[shareKey])),
    firstDate: rows[0]?.date ?? null,
    lastDate: rows.at(-1)?.date ?? null,
    days: rows.length
  };
}

function hasForeignAccumulation(history) {
  const rows = history.slice(-240).filter((row) => row.foreignHoldingRatePct != null);
  if (rows.length < 20) return false;
  const delta = rows.at(-1).foreignHoldingRatePct - rows[0].foreignHoldingRatePct;
  return delta >= 0.15 || sum(rows.slice(-60).map((row) => row.foreignNetShares)) > 0;
}

function calcFlow(history, n, marketCapEok) {
  const rows = history.slice(-n);
  const foreign = sum(rows.map((row) => row.foreignNetValueEok));
  const institution = sum(rows.map((row) => row.institutionNetValueEok));
  return {
    days: rows.length,
    foreignNetValueEok: round(foreign, 2),
    institutionNetValueEok: round(institution, 2),
    foreignPct: marketCapEok ? round(foreign / marketCapEok * 100, 3) : null,
    institutionPct: marketCapEok ? round(institution / marketCapEok * 100, 3) : null
  };
}

function entryPlan(decision, close, ma20, ma60, low60, high60) {
  const stop = Math.max(low60 * 0.97, close * 0.9);
  if (decision === "ENTRY_OK") {
    return {
      action: "staged entry candidate",
      trigger: `40% near ${formatPrice(close)}, 30% on MA20 ${formatPrice(ma20)} hold, 30% on breakout confirmation`,
      invalidation: `close below MA20 ${formatPrice(ma20)} or stop ${formatPrice(stop)}`,
      target: `first ${formatPrice(ma60)}, second ${formatPrice(high60)}`
    };
  }
  if (decision === "WAIT_TRIGGER") {
    return {
      action: "wait for trigger",
      trigger: `recover MA20 ${formatPrice(ma20)} with improving flow`,
      invalidation: `break 60D low ${formatPrice(low60)}`,
      target: "re-evaluate after trigger"
    };
  }
  return {
    action: "watch only",
    trigger: "new data required",
    invalidation: `break 60D low ${formatPrice(low60)}`,
    target: "not actionable"
  };
}

function buildExecutionPlan(row) {
  const price = row.currentPrice ?? row.close;
  const t = row.technicals ?? {};
  const holderCost = row.holderCost?.estimatedCost;
  const stop = round(Math.max((t.low60 ?? price) * 0.97, price * 0.9), 0);
  const softStopBase = t.ma20 != null && t.ma20 < price && t.ma20 > stop ? t.ma20 : price * 0.96;
  const softStop = round(Math.max(stop, softStopBase), 0);
  const trim1 = round(price * 1.08, 0);
  const target2 = round(Math.max(t.ma60 ?? price * 1.12, t.high60 ?? price * 1.15), 0);
  const addLine = round(t.ma20 ?? price, 0);
  const pullbackLine = round(Math.min(price, Math.max(t.ma5 ?? price * 0.97, price * 0.95)), 0);
  const isOverheated = (row.returns?.d20 ?? 0) >= 35 || (t.rsi14 ?? 0) >= 72;
  const isWeakFlow = (row.flows?.d5?.foreignPct ?? 0) < 0 && (row.flows?.d5?.institutionPct ?? 0) < 0;
  const stanceByDecision = {
    ENTRY: "분할 진입",
    ACCUMULATE_ON_WEAKNESS: "약세 분할",
    WAIT_TRIGGER: "트리거 대기",
    WATCH: "관망",
    AVOID_NOW: "제외/관망",
    NO_DATA: "데이터 보류",
    DATA_FAIL: "수집 실패"
  };

  const base = {
    stance: stanceByDecision[row.v11Decision] ?? "관망",
    isOverheated,
    isWeakFlow,
    levels: [
      { label: "현재", kind: "now", price },
      { label: "MA20", kind: "add", price: addLine },
      { label: "손절", kind: "stop", price: stop },
      { label: "축소", kind: "softStop", price: softStop },
      { label: "1차 회수", kind: "trim", price: trim1 },
      { label: "2차 목표", kind: "target", price: target2 }
    ].concat(holderCost ? [{ label: "추정 평단", kind: "holderCost", price: round(holderCost, 0) }] : []),
    buySteps: [],
    sellSteps: [
      { label: "위험 축소", action: "30~50% 축소", trigger: `종가 ${formatPrice(softStop)} 이탈 또는 5일선 회복 실패` },
      { label: "손절", action: "신규 검토 중단", trigger: `${formatPrice(stop)} 이탈` },
      { label: "익절", action: "30% 이상 회수", trigger: `${formatPrice(trim1)} 도달 후 거래대금 둔화` }
    ],
    sessionRules: [
      { window: "장초반", rule: "갭상승 추격보다 눌림과 시초가 지지 확인을 우선한다" },
      { window: "장중", rule: "현재가가 MA20 또는 전일 종가 위에서 버티는지 확인한다" },
      { window: "종가", rule: "종가가 MA20 위면 유지, 아래면 다음 날 비중을 줄인다" }
    ],
    riskSwitches: [
      isOverheated ? "20일 급등 또는 RSI 과열: 신규 비중을 절반으로 축소" : "과열 낮음: 분할 기준 유지",
      isWeakFlow ? "5일 외국인·기관 동반 순매도: 매수 보류 또는 비중 축소" : "단기 수급 급악화 아님",
      `레짐: ${row.dependencyProfile?.thresholdRegime ?? "-"} · 사이즈 계수 ${row.dependencyProfile?.sizeFactor ?? "-"}`,
      `의존도: ${row.dependencyProfile?.dependencyLabel ?? "NO_DATA"} · 점수 ${row.marketDependencyScore ?? "NO_DATA"}`,
      row.risk?.notes?.length ? `리스크: ${row.risk.notes.join(" · ")}` : "특이 리스크 없음"
    ]
  };

  if (row.v11Decision === "ENTRY") {
    base.buySteps = [
      { label: "1차", weight: "40%", price, rule: "현재가가 시초가·MA20 위에서 버티면 분할 시작" },
      { label: "2차", weight: "30%", price: addLine, rule: `종가 ${formatPrice(addLine)} 위 유지 확인` },
      { label: "3차", weight: "30%", price: round((t.high60 ?? price) * 1.01, 0), rule: "거래대금 동반 돌파 확인" }
    ];
  } else if (row.v11Decision === "ACCUMULATE_ON_WEAKNESS") {
    base.buySteps = [
      { label: "1차", weight: "25~30%", price: pullbackLine, rule: `눌림 ${formatPrice(pullbackLine)} 부근에서 양봉 전환 확인` },
      { label: "2차", weight: "30%", price: addLine, rule: `종가 ${formatPrice(addLine)} 회복` },
      { label: "3차", weight: "관찰", price: round((t.high60 ?? price) * 1.01, 0), rule: "고점 돌파는 추격보다 재평가 후 실행" }
    ];
  } else if (row.v11Decision === "WAIT_TRIGGER") {
    base.buySteps = [
      { label: "대기", weight: "0%", price, rule: "현재는 진입 금지" },
      { label: "트리거", weight: "관찰", price: addLine, rule: `MA20 ${formatPrice(addLine)} 회복과 수급 개선 동시 확인` }
    ];
  } else {
    base.buySteps = [
      { label: "대기", weight: "0%", price, rule: "v11 진입 조건 미충족" }
    ];
  }

  return base;
}

function summarizeStandalone(rows) {
  const scored = rows.filter((row) => row.marketDependencyScore != null);
  const entries = rows.filter((row) => row.v11Decision === "ENTRY");
  return {
    universeCount: rows.length,
    scoredCount: scored.length,
    dataFail: rows.filter((row) => row.error).length,
    baseEntryOk: rows.filter((row) => row.v11BaseDecision === "ENTRY_OK").length,
    v11Entry: entries.length,
    v11Accumulate: rows.filter((row) => row.v11Decision === "ACCUMULATE_ON_WEAKNESS").length,
    waitTrigger: rows.filter((row) => row.v11Decision === "WAIT_TRIGGER").length,
    avoidNow: rows.filter((row) => row.v11Decision === "AVOID_NOW").length,
    noData: rows.filter((row) => row.v11Decision === "NO_DATA").length,
    adverseDependency: rows.filter((row) => row.betaProfile?.adverseDependency).length,
    favorableBeta: rows.filter((row) => row.betaProfile?.favorableBeta).length,
    semiProxy: rows.filter((row) => row.betaProfile?.semiProxyFlag).length,
    medianSemiCorrAll: round(median(scored.map((row) => row.betaProfile?.semiCorr)), 3),
    medianSemiCorrEntry: round(median(entries.map((row) => row.betaProfile?.semiCorr)), 3),
    avgCaptureRatioEntry: round(average(entries.map((row) => row.betaProfile?.captureRatio)), 3),
    byDecision: countBy(rows, "v11Decision"),
    byDependencyLabel: countBy(rows, (row) => row.dependencyProfile?.dependencyLabel ?? "NO_DATA")
  };
}

function standaloneRules() {
  return [
    "v11은 이전 버전 대시보드가 아니라 data/v11-universe.json을 입력으로 읽습니다.",
    "정책, 가치, 기술, 수급, 체질, 독립 수급 평단을 v11 내부에서 다시 계산합니다.",
    "시장 의존도는 기본 심사 뒤에 잔차 강도, 상승/하락 캡처, 불리한 반도체 의존성을 점검하는 실행 게이트입니다.",
    "반도체 상관이 높다는 이유만으로 배제하지 않습니다. 상승 캡처가 약하고 하락 캡처가 큰 조합만 문제로 봅니다.",
    "NO_DATA는 0점이 아니라 별도 보류 상태입니다. 결측 데이터로 ENTRY를 만들지 않습니다.",
    "정책 이벤트성 광폭 반등장에서는 좋은 WAIT_TRIGGER를 약세 분할 후보로 승격할 수 있습니다."
  ];
}

function compareRows(a, b) {
  return (Number.isFinite(b.v11StandaloneScore) ? b.v11StandaloneScore : -Infinity) -
    (Number.isFinite(a.v11StandaloneScore) ? a.v11StandaloneScore : -Infinity) ||
    (b.v11BaseScore ?? 0) - (a.v11BaseScore ?? 0);
}

function countBy(rows, keyOrFn) {
  const get = typeof keyOrFn === "function" ? keyOrFn : (row) => row[keyOrFn];
  return rows.reduce((acc, row) => {
    const key = get(row) ?? "UNKNOWN";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function buildStandaloneHtml(data) {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll("</script", "<\\/script");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.meta.title)}</title>
  <style>
    :root{color-scheme:light;--bg:#f5f7f8;--ink:#17202a;--muted:#657282;--line:#d8e0e6;--surface:#fff;--nav:#17212b;--teal:#0f766e;--green:#126c43;--gold:#9a6515;--red:#973f35;--orange:#b45309;--blue:#2f5ea8}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI","Malgun Gothic",Arial,sans-serif;line-height:1.5}a{color:inherit}button,input{font:inherit}
    .layout{min-height:100vh;display:grid;grid-template-columns:300px minmax(0,1fr)}aside{position:sticky;top:0;height:100vh;overflow:auto;padding:24px 20px;background:var(--nav);color:#f8fafc}main{min-width:0;padding:clamp(16px,2.4vw,30px)}
    h1,h2,h3,p{margin-top:0;overflow-wrap:break-word}h1{font-size:22px;line-height:1.25;letter-spacing:0}h2{font-size:29px;line-height:1.2;letter-spacing:0;margin-bottom:8px}h3{font-size:18px;letter-spacing:0;margin-bottom:10px}.muted{color:var(--muted)}
    .brand p{color:#d7e0e8;font-size:13px}.side-box{display:grid;gap:7px;margin:16px 0;padding:13px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(255,255,255,.06);font-size:12px;color:#d7e0e8}.nav-list{display:grid;gap:7px}.nav-link{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;min-height:39px;padding:8px 10px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(255,255,255,.05);text-decoration:none;color:#f8fafc;font-size:13px;font-weight:800}.nav-link:hover{background:#fff;color:var(--ink)}
    .tag,.badge{display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}.tag{background:rgba(255,255,255,.12)}.badge.entry{background:#e5f3f0;color:var(--teal)}.badge.acc{background:#fff3df;color:var(--orange)}.badge.watch{background:#f8e8e6;color:var(--red)}.badge.no{background:#eceff3;color:#596579}.badge.neutral{background:#e9eef8;color:var(--blue)}
    .hero,.band,.metric,.regime{border:1px solid var(--line);border-radius:8px;background:var(--surface)}.hero{padding:clamp(18px,2.4vw,28px);margin-bottom:16px;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr);gap:18px;align-items:end}.kicker{margin-bottom:8px;color:var(--teal);font-size:13px;font-weight:900}.hero p{color:var(--muted)}
    .regime{margin-bottom:16px;padding:16px 18px;border-left:5px solid var(--teal)}.regime.narrow{border-left-color:var(--orange)}.regime.risk{border-left-color:var(--red)}.regime.broad{border-left-color:var(--green)}.regime strong{display:block;font-size:20px}.regime-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:10px}.regime-grid span{display:block;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;font-size:12px}.regime-grid b{display:block;font-size:18px}
    .metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}.metric{min-height:104px;padding:15px}.metric strong{display:block;font-size:27px;line-height:1.1}.metric span{display:block;margin-top:6px;color:var(--muted);font-size:12px}.band{padding:18px;margin-bottom:16px}.head{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.head p{max-width:920px;margin-bottom:0;color:var(--muted);font-size:13px}
    .toolbar{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-bottom:12px}.segmented{display:flex;flex-wrap:wrap;gap:6px}.segmented button{min-height:34px;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;cursor:pointer;font-size:13px;font-weight:800}.segmented button.active{border-color:var(--teal);background:#e5f3f0;color:var(--teal)}.search{width:min(360px,100%);min-height:36px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:#fff}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fff}table{width:100%;min-width:1920px;border-collapse:collapse}th,td{padding:10px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}th{position:sticky;top:0;z-index:1;background:#edf3f4;color:#334155}tr:last-child td{border-bottom:0}.num{font-variant-numeric:tabular-nums;white-space:nowrap}.company{font-weight:900}.note{display:block;margin-top:5px;color:var(--muted);font-size:12px;line-height:1.42}.teal{color:var(--teal);font-weight:900}
    .sources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sources a{min-height:58px;padding:11px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;text-decoration:none;font-size:13px}.sources span{display:block;margin-top:4px;color:var(--muted);font-size:12px}
    footer{color:var(--muted);font-size:12px}@media(max-width:1120px){.layout{grid-template-columns:1fr}aside{position:static;height:auto}.nav-list{grid-template-columns:repeat(3,minmax(150px,1fr))}.hero,.metrics,.regime-grid{grid-template-columns:1fr 1fr}}@media(max-width:720px){main{padding:14px}.nav-list{display:flex;overflow:auto;padding-bottom:4px}.nav-link{min-width:150px}.hero,.metrics,.regime-grid,.sources{grid-template-columns:1fr}h2{font-size:23px}table{min-width:1420px}}
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><h1>${escapeHtml(data.meta.title)}</h1><p>v11 독립 산출 프로세스</p></div>
      <div class="side-box">
        <span>기준일: ${escapeHtml(data.meta.runDate)}</span>
        <span>갱신: ${escapeHtml(data.meta.updatedAt)}</span>
        <span>레짐: ${escapeHtml(data.regime.state)}</span>
        <span>진입: ${data.summary.v11Entry} / 기본 진입: ${data.summary.baseEntryOk}</span>
      </div>
      <nav class="nav-list">
        <a class="nav-link" href="#overview"><span>개요</span><span class="tag">v11</span></a>
        <a class="nav-link" href="#entry"><span>즉시 진입</span><span class="tag">ENTRY</span></a>
        <a class="nav-link" href="#accumulate"><span>약세 분할</span><span class="tag">분할</span></a>
        <a class="nav-link" href="#wait"><span>트리거 대기</span><span class="tag">대기</span></a>
        <a class="nav-link" href="#all"><span>전체 후보</span><span class="tag">전체</span></a>
        <a class="nav-link" href="#sources"><span>출처</span><span class="tag">Src</span></a>
      </nav>
    </aside>
    <main>
      <section class="hero" id="overview">
        <div><p class="kicker">v11 독립 대시보드</p><h2>종목 선정, 데이터 수집, 평가, 시장 의존도, 실행 판단을 v11 내부에서 다시 계산합니다.</h2><p>${escapeHtml(data.meta.purpose)}</p></div>
        <div><p>${escapeHtml(data.meta.warning)}</p></div>
      </section>
      <section class="regime ${regimeClass(data.regime.state)}"><strong>${escapeHtml(data.regime.state)}</strong><span>${escapeHtml(data.regime.guidance)}</span><div class="regime-grid" id="regimeGrid"></div></section>
      <section class="metrics" id="metrics"></section>
      <section class="band" id="entry"><div class="head"><div><h3>v11 즉시 진입</h3><p>기본 품질, 체질, 시장 의존도, 레짐 게이트를 모두 통과한 후보입니다.</p></div></div><div class="table-wrap"><table>${tableHead()}<tbody id="entryRows"></tbody></table></div></section>
      <section class="band" id="accumulate"><div class="head"><div><h3>약세 분할진입</h3><p>정책 반등 레짐에서 기본 조건은 대기지만 품질·수급·의존도 조건이 좋아 눌림 매수를 검토할 후보입니다.</p></div></div><div class="table-wrap"><table>${tableHead()}<tbody id="accRows"></tbody></table></div></section>
      <section class="band" id="wait"><div class="head"><div><h3>트리거 대기</h3><p>점수는 양호하지만 가격, 체질, 수급 중 일부 조건 확인이 더 필요한 후보입니다.</p></div></div><div class="table-wrap"><table>${tableHead()}<tbody id="waitRows"></tbody></table></div></section>
      <section class="band" id="all"><div class="toolbar"><div><h3 style="margin-bottom:4px;">전체 v11 후보</h3><p class="muted" style="margin-bottom:0;font-size:13px;">v11StandaloneScore = v11BaseScore + marketDependencyScore. 시장 의존도 결측은 0점으로 대체하지 않습니다.</p></div><input class="search" id="search" type="search" placeholder="종목명, 코드, 섹터 검색"></div><div class="segmented" id="filters"></div><div class="table-wrap"><table>${tableHead()}<tbody id="allRows"></tbody></table></div></section>
      <section class="band" id="sources"><div class="head"><div><h3>출처</h3><p>v11은 자체 유니버스 파일과 현재 시장 데이터 수집으로 산출합니다.</p></div></div><div class="sources" id="sourceList"></div></section>
      <footer><code>node scripts/run-v11-standalone-process.mjs</code>로 생성. 데이터: <code>data/v11-execution-dashboard-data.json</code>.</footer>
    </main>
  </div>
  <script>
    const DATA=${json}; let filter="all"; let search="";
    const fmt=(v,d=2)=>v==null?"-":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:d});
    const pct=(v)=>v==null?"-":fmt(v,2)+"%";
    const price=(v)=>v==null?"-":Number(v).toLocaleString("ko-KR")+"원";
    const score=(v)=>v==null?"NO_DATA":(v>0?"+":"")+fmt(v,0);
    const metrics=[
      ["전체 후보",DATA.summary.universeCount,"독립 유니버스"],
      ["기본 진입",DATA.summary.baseEntryOk,"의존도 적용 전"],
      ["즉시 진입",DATA.summary.v11Entry,"최종 ENTRY"],
      ["약세 분할",DATA.summary.v11Accumulate,"눌림 후보"],
      ["불리한 의존",DATA.summary.adverseDependency,"전체 후보"]
    ];
    document.querySelector("#metrics").innerHTML=metrics.map(([a,b,c])=>\`<div class="metric"><strong>\${fmt(b,0)}</strong><span>\${escapeHtml(a)} · \${escapeHtml(c)}</span></div>\`).join("");
    const regimeItems=[["KOSDAQ 1D",pct(DATA.regime.kosdaqRet1)],["KOSDAQ 20D",pct(DATA.regime.kosdaqRet20)],["당일 상승비율",fmt(DATA.regime.dayBreadth,3)],["MA20 상회",fmt(DATA.regime.breadth,3)],["진입/기본",DATA.summary.v11Entry+"/"+DATA.summary.baseEntryOk]];
    document.querySelector("#regimeGrid").innerHTML=regimeItems.map(([a,b])=>\`<span><b>\${escapeHtml(b)}</b>\${escapeHtml(a)}</span>\`).join("");
    document.querySelector("#entryRows").innerHTML=DATA.entryList.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("즉시 진입 후보가 없습니다.");
    document.querySelector("#accRows").innerHTML=DATA.accumulateList.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("약세 분할 후보가 없습니다.");
    document.querySelector("#waitRows").innerHTML=DATA.triggerList.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("트리거 대기 후보가 없습니다.");
    function renderFilters(){const vals=["all","ENTRY","ACCUMULATE_ON_WEAKNESS","WAIT_TRIGGER","WATCH","AVOID_NOW","NO_DATA","DATA_FAIL"];document.querySelector("#filters").innerHTML=vals.map(v=>\`<button class="\${filter===v?"active":""}" data-filter="\${v}">\${v==="all"?"All":label(v)}</button>\`).join("");document.querySelectorAll("#filters button").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;renderFilters();renderAll()}));}
    function renderAll(){const needle=search.trim().toLowerCase();const rows=DATA.allRows.filter(r=>(filter==="all"||r.v11Decision===filter)&&(!needle||[r.company,r.ticker,r.sector,r.rationale,r.dependencyProfile?.dependencyLabel].join(" ").toLowerCase().includes(needle))).slice(0,140);document.querySelector("#allRows").innerHTML=rows.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("표시할 후보가 없습니다.");}
    function rowHtml(r,i){const p=r.betaProfile||{};const d=r.dependencyProfile||{};const e=r.executionPlan||{};const buy=(e.buySteps||[])[0]||{};const sell=(e.sellSteps||[])[0]||{};return \`<tr><td class="num">\${i+1}</td><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><strong>\${price(r.currentPrice??r.close)}</strong><span class="note">조회 \${escapeHtml(r.quoteFetchedAt??"-")} · 등락 \${pct(r.currentChangePct)}</span><span class="note">일봉 기준 \${escapeHtml(r.latestDate)} · \${price(r.close)}</span></td><td><span class="badge \${decisionClass(r.v11Decision)}">\${label(r.v11Decision)}</span><span class="note">\${escapeHtml(r.v11Reason)}</span></td><td><strong>\${r.v11StandaloneScore??"-"}</strong><span class="note">기본 \${r.v11BaseScore??"-"} · 의존 <span class="teal">\${score(r.marketDependencyScore)}</span></span></td><td><strong>\${r.totalScore??"-"}</strong><span class="note">정책 \${r.policy?.score??"-"} · 가치 \${r.value?.score??"-"} · 기술 \${r.technical?.score??"-"} · 수급 \${r.flowScore?.score??"-"}</span></td><td><strong class="teal">\${score(r.marketDependencyScore)}</strong><span class="note">\${depLabel(d.dependencyLabel)} · 비중 \${d.sizeFactor??"-"}</span><span class="note">잔차 \${d.components?.residualScore??"-"} / 캡처 \${d.components?.captureScore??"-"} / 조정 \${d.components?.dependencyAdjustment??"-"}</span></td><td>βM \${fmt(p.betaMarket,2)}<span class="note">βSemiExcess \${fmt(p.betaSemiExcess,2)} · 상관 \${fmt(p.semiCorr,2)}</span><span class="note">캡처 \${fmt(p.captureRatio,2)} · 상승 \${fmt(p.upCapture,2)} · 하락 \${fmt(p.lossCapture,2)}</span></td><td><strong>\${escapeHtml(e.stance??"-")}</strong><span class="note">매수: \${escapeHtml(b.weight??"-")} · \${escapeHtml(b.rule??"-")}</span><span class="note">매도: \${escapeHtml(sell.action??"-")} · \${escapeHtml(sell.trigger??"-")}</span></td><td>\${r.structuralRegime?.score??"-"}<span class="note">\${escapeHtml(r.structuralRegime?.gate??"-")} · \${escapeHtml(r.structuralRegime?.grade??"-")}</span><span class="note">평단 \${r.holderCostScore??"-"} · \${escapeHtml(r.holderCost?.memo??"")}</span></td><td>Tier \${escapeHtml(p.tier??"NO_DATA")}<span class="note">\${p.alignedReturnDays??0}일 · \${escapeHtml((p.notes||[]).join(" · "))}</span></td></tr>\`;}
    function emptyRow(text){return \`<tr><td colspan="11" class="muted">\${escapeHtml(text)}</td></tr>\`;}
    function decisionClass(d){return d==="ENTRY"?"entry":d==="ACCUMULATE_ON_WEAKNESS"?"acc":d==="WATCH"?"watch":d==="NO_DATA"||d==="DATA_FAIL"?"no":d==="WAIT_TRIGGER"?"acc":"neutral";}
    function label(d){return {ENTRY:"즉시진입",ACCUMULATE_ON_WEAKNESS:"약세분할",WATCH:"관망",WAIT_TRIGGER:"대기",AVOID_NOW:"제외",NO_DATA:"데이터부족",DATA_FAIL:"수집실패"}[d]??d;}
    function depLabel(d){return {ADVERSE_DEPENDENCY:"불리한 의존",FAVORABLE_BETA:"유리한 베타",INDEPENDENT_STRENGTH:"독립 강세",NEUTRAL_DEPENDENCY:"중립 의존",NO_DATA:"데이터 부족"}[d]??escapeHtml(d??"NO_DATA");}
    function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
    document.querySelector("#search").addEventListener("input",e=>{search=e.target.value;renderAll()});
    document.querySelector("#sourceList").innerHTML=DATA.sources.map(s=>\`<a href="\${escapeHtml(s.url)}" target="_blank" rel="noreferrer"><strong>\${escapeHtml(s.title)}</strong><span>\${escapeHtml(s.url)}</span></a>\`).join("");
    renderFilters();renderAll();
  </script>
</body>
</html>`;
}

function tableHead() {
  return `<thead><tr><th>#</th><th>종목</th><th>현재가</th><th>판정</th><th>v11 점수</th><th>기본 점수</th><th>시장 의존도</th><th>베타·캡처</th><th>진입·매도 전략</th><th>체질·평단</th><th>Tier</th></tr></thead>`;
}

function regimeClass(state) {
  if (state === "NARROW_SEMI_LED") return "narrow";
  if (state === "RISK_OFF") return "risk";
  if (state === "BROAD_RISK_ON") return "broad";
  return "";
}

function thresholdByRegime(state) {
  return {
    POLICY_EVENT_REBOUND: 0,
    NARROW_SEMI_LED: 7,
    RISK_OFF: 10,
    BROAD_RISK_ON: 0,
    NEUTRAL: 3
  }[state] ?? 3;
}

function hardGateBlock(profile, state) {
  if ((state === "NARROW_SEMI_LED" || state === "RISK_OFF") && profile.asymmetricFailure) return "상승/하락 캡처 비대칭 실패";
  if ((state === "NARROW_SEMI_LED" || state === "RISK_OFF") && profile.adverseDependency) return "취약 레짐의 불리한 반도체 의존성";
  if (state === "RISK_OFF" && profile.lossCapture != null && profile.lossCapture > 1 && profile.captureRatio != null && profile.captureRatio < 1.1) {
    return "위험회피장 대비 하락 캡처 과다";
  }
  return null;
}

function marketSummary(history) {
  const latest = history.at(-1);
  const prev = history.at(-2);
  return {
    code: "INDEX",
    latestDate: latest?.date ?? null,
    now: latest?.close ?? null,
    changePct: prev?.close && latest?.close ? round((latest.close / prev.close - 1) * 100, 2) : null
  };
}

function marketCapFromShares(listedShares, close) {
  return listedShares && close ? round(listedShares * close / 100_000_000, 0) : null;
}

function parseNullableNumber(value) {
  if (value == null || value === "N/A") return null;
  const n = parseNumber(value);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(match) {
  return match ? parseNumber(match[1]) : null;
}

function dedupByDate(rows) {
  return [...new Map(rows.map((row) => [row.date, row])).values()];
}

function sma(values, n) {
  const arr = values.slice(-n).filter(Number.isFinite);
  return arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length, 2) : null;
}

function rsi(values, period) {
  const arr = values.slice(-(period + 1));
  if (arr.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < arr.length; i += 1) {
    const diff = arr[i] - arr[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return round(100 - 100 / (1 + avgGain / avgLoss), 2);
}

function pctChange(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return round((to / from - 1) * 100, 4);
}

function maxDrawdown(rows) {
  let peak = rows[0]?.close ?? 0;
  let worst = 0;
  for (const row of rows) {
    if (row.close > peak) peak = row.close;
    if (peak > 0) worst = Math.min(worst, (row.close / peak - 1) * 100);
  }
  return worst;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatPrice(value) {
  return value == null ? "-" : `${Number(value).toLocaleString("ko-KR")}원`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
