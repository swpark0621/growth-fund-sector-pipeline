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
  }

  const ranked = rows.sort(compareRows);
  const output = {
    meta: {
      title: "National Growth Fund v11 standalone dashboard",
      version: "v11-standalone",
      runDate,
      updatedAt: formatSeoulDateTime(runNow),
      universeSource: "data/v11-universe.json",
      purpose:
        "Standalone v11 recomputes candidate selection, market data collection, scoring, dependency evaluation, and execution decision without reading prior version dashboard outputs.",
      methodology:
        "The process reimplements the existing policy/value/technical/flow/holder-cost/structure method, then adds market dependency and regime suitability as native v11 gates.",
      warning:
        "This is a screening and execution-condition framework, not investment advice. Scores are estimates and must be interpreted with data tier and market regime."
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
      { title: "Standalone v11 universe", url: "data/v11-universe.json" },
      { title: "Naver Finance stock daily API", url: "https://api.finance.naver.com/siseJson.naver" },
      { title: "Naver Finance investor flow pages", url: "https://finance.naver.com/" },
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
    marketCapEok: quote.marketCapEok,
    listedShares: quote.listedShares,
    per: quote.per,
    pbr: quote.pbr,
    roe: quote.roe,
    liquidity: {
      avgVolume20: Math.round(avgVol20),
      volumeRatio: round(avgVol20 ? latest.volume / avgVol20 : null, 2)
    },
    returns: { d5: ret5, d20: ret20, d60: ret60 },
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
  const marketCapEok = firstNumber(text.match(/시가총액\s*([\d,]+)\s*억원/));
  const listedShares = firstNumber(text.match(/상장주식수\s*([\d,]+)/));
  const per = parseNullableNumber(text.match(/\bPER\s*([-.\d]+|N\/A)/)?.[1]);
  const pbr = parseNullableNumber(text.match(/\bPBR[\s\S]{0,180}?([-.\d]+|N\/A)\s*(?:배)?\s*l/)?.[1]);
  const roe = parseNullableNumber(text.match(/\bROE[\s\S]{0,120}?([-.\d]+|N\/A)\s*%/)?.[1]);
  return { marketCapEok, listedShares, per, pbr, roe };
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
  return { score: clamp(score, 0, 25), memo: `market cap ${quote.marketCapEok ?? "-"} eok, PER ${quote.per ?? "-"}, PBR ${quote.pbr ?? "-"}` };
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
  return { score: clamp(score, 0, 35), memo: `MA20 ${t.latest.close >= t.ma20 ? "above" : "below"}, RSI ${round(t.rsi14, 1)}, drawdown60 ${round(t.drawdown60Pct, 1)}%` };
}

function investorFlowScore(d5, d20, d60) {
  let score = 0;
  if ((d5.foreignPct ?? 0) > 0) score += 4;
  if ((d5.institutionPct ?? 0) > 0) score += 4;
  if ((d20.foreignPct ?? 0) > 0) score += 5;
  if ((d20.institutionPct ?? 0) > 0) score += 5;
  if ((d60.foreignPct ?? 0) > 0) score += 3;
  if ((d60.institutionPct ?? 0) > 0) score += 3;
  return { score: clamp(score, 0, 20), memo: `20D foreign ${round(d20.foreignPct, 2)}%, institution ${round(d20.institutionPct, 2)}%` };
}

function riskPenalty(item, quote, t) {
  let penalty = 0;
  const notes = [];
  let valuationBlock = false;
  if (item.status === "already-selected") {
    penalty += 8;
    notes.push("already selected");
  }
  if (item.status === "watch") {
    penalty += 3;
    notes.push("watch-list volatility");
  }
  if (quote.marketCapEok != null && quote.marketCapEok < 700) {
    penalty += 5;
    notes.push("micro liquidity risk");
  }
  if (quote.per != null && quote.per < 0 && quote.pbr != null && quote.pbr > 3) {
    penalty += 8;
    valuationBlock = true;
    notes.push("loss-making and high PBR");
  } else if (quote.per != null && quote.per < 0) {
    penalty += 4;
    notes.push("loss-making");
  }
  if (quote.pbr != null && quote.pbr > 10) {
    penalty += 8;
    valuationBlock = true;
    notes.push("PBR above 10");
  } else if (quote.pbr != null && quote.pbr > 6) {
    penalty += 5;
    notes.push("high PBR");
  }
  if (quote.per != null && quote.per > 60) {
    penalty += 6;
    valuationBlock = true;
    notes.push("PER above 60");
  }
  if (t.ret20 <= -35) {
    penalty += 6;
    notes.push("20D trend damage");
  }
  if (t.latest.close < t.ma20 && t.latest.close < t.ma60) {
    penalty += 5;
    notes.push("below MA20 and MA60");
  }
  if (t.rsi14 < 28) {
    penalty += 3;
    notes.push("deep oversold risk");
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
    return { v11Decision: row.v11BaseDecision, reason: `base decision is ${row.v11BaseDecision}` };
  }
  if (!profile || dependencyScore.marketDependencyScore == null) {
    return { v11Decision: "NO_DATA", reason: "market dependency data is insufficient" };
  }
  const threshold = thresholdByRegime(regime.state);
  const hardBlock = hardGateBlock(profile, regime.state);
  if (hardBlock) return { v11Decision: "WATCH", reason: hardBlock };
  if (dependencyScore.marketDependencyScore >= threshold) {
    return { v11Decision: "ENTRY", reason: `dependency score ${dependencyScore.marketDependencyScore} >= threshold ${threshold}` };
  }
  if (dependencyScore.marketDependencyScore >= threshold - 6) {
    return { v11Decision: "ACCUMULATE_ON_WEAKNESS", reason: `dependency score ${dependencyScore.marketDependencyScore} near threshold ${threshold}` };
  }
  return { v11Decision: "WATCH", reason: `dependency score ${dependencyScore.marketDependencyScore} below threshold ${threshold}` };
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
    grade: score >= 80 ? "strong structure" : score >= 65 ? "improving structure" : score >= 50 ? "review structure" : "weak structure",
    entryEligible,
    primary: {
      label: "standalone price structure",
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
      source: "institution VWAP accumulation",
      estimatedCost: institutionCost.cost,
      holderName: "institution flow",
      recentAccumulation: institutionCost.netShares > 0,
      disposalPressure: institutionCost.last20NetShares < 0,
      flow: institutionCost
    }, close));
  }
  if (foreignCost && hasForeignAccumulation(history)) {
    candidates.push(scoreHolderCost({
      tier: "B",
      coefficient: 0.7,
      source: "foreign VWAP accumulation",
      estimatedCost: foreignCost.cost,
      holderName: "foreign flow",
      recentAccumulation: foreignCost.netShares > 0,
      disposalPressure: foreignCost.last20NetShares < 0,
      flow: foreignCost
    }, close));
  }
  if (!candidates.length) {
    return { tier: "NO_DATA", coefficient: 0, score: 0, signal: "NO_DATA", estimatedCost: null, gapPct: null, memo: "no standalone flow cost evidence" };
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
    memo: `${candidate.tier} ${candidate.source}, cost ${round(candidate.estimatedCost, 0)}, gap ${round(gapPct, 1)}%`
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
    "v11 reads data/v11-universe.json, not prior version dashboard outputs.",
    "Candidate score is recomputed from policy, value, technical, investor-flow, structure, and standalone flow-cost evidence.",
    "Market dependency is native to v11: residual strength, capture asymmetry, and adverse semi dependency are evaluated after base screening.",
    "High semiconductor correlation is not rejected by itself. It becomes a problem only when capture asymmetry and residual weakness are unfavorable.",
    "NO_DATA is separated from zero score. It cannot be upgraded into ENTRY by missing beta data.",
    "Regime changes the dependency threshold and size factor."
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
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fff}table{width:100%;min-width:1660px;border-collapse:collapse}th,td{padding:10px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}th{position:sticky;top:0;z-index:1;background:#edf3f4;color:#334155}tr:last-child td{border-bottom:0}.num{font-variant-numeric:tabular-nums;white-space:nowrap}.company{font-weight:900}.note{display:block;margin-top:5px;color:var(--muted);font-size:12px;line-height:1.42}.teal{color:var(--teal);font-weight:900}
    .sources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sources a{min-height:58px;padding:11px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;text-decoration:none;font-size:13px}.sources span{display:block;margin-top:4px;color:var(--muted);font-size:12px}
    footer{color:var(--muted);font-size:12px}@media(max-width:1120px){.layout{grid-template-columns:1fr}aside{position:static;height:auto}.nav-list{grid-template-columns:repeat(3,minmax(150px,1fr))}.hero,.metrics,.regime-grid{grid-template-columns:1fr 1fr}}@media(max-width:720px){main{padding:14px}.nav-list{display:flex;overflow:auto;padding-bottom:4px}.nav-link{min-width:150px}.hero,.metrics,.regime-grid,.sources{grid-template-columns:1fr}h2{font-size:23px}table{min-width:1180px}}
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><h1>${escapeHtml(data.meta.title)}</h1><p>Standalone v11 process</p></div>
      <div class="side-box">
        <span>Run date: ${escapeHtml(data.meta.runDate)}</span>
        <span>Updated: ${escapeHtml(data.meta.updatedAt)}</span>
        <span>Regime: ${escapeHtml(data.regime.state)}</span>
        <span>Entry: ${data.summary.v11Entry} / Base entry: ${data.summary.baseEntryOk}</span>
      </div>
      <nav class="nav-list">
        <a class="nav-link" href="#overview"><span>Overview</span><span class="tag">v11</span></a>
        <a class="nav-link" href="#entry"><span>Entry</span><span class="tag">Entry</span></a>
        <a class="nav-link" href="#accumulate"><span>Weakness</span><span class="tag">Accum</span></a>
        <a class="nav-link" href="#wait"><span>Triggers</span><span class="tag">Wait</span></a>
        <a class="nav-link" href="#all"><span>All Rows</span><span class="tag">All</span></a>
        <a class="nav-link" href="#sources"><span>Sources</span><span class="tag">Src</span></a>
      </nav>
    </aside>
    <main>
      <section class="hero" id="overview">
        <div><p class="kicker">v11 Standalone Dashboard</p><h2>Universe, data collection, scoring, dependency gate, and decision are all recomputed inside v11.</h2><p>${escapeHtml(data.meta.purpose)}</p></div>
        <div><p>${escapeHtml(data.meta.warning)}</p></div>
      </section>
      <section class="regime ${regimeClass(data.regime.state)}"><strong>${escapeHtml(data.regime.state)}</strong><span>${escapeHtml(data.regime.guidance)}</span><div class="regime-grid" id="regimeGrid"></div></section>
      <section class="metrics" id="metrics"></section>
      <section class="band" id="entry"><div class="head"><div><h3>v11 ENTRY</h3><p>Standalone candidates that pass base quality, structure, dependency, and regime gates.</p></div></div><div class="table-wrap"><table>${tableHead()}<tbody id="entryRows"></tbody></table></div></section>
      <section class="band" id="accumulate"><div class="head"><div><h3>ACCUMULATE_ON_WEAKNESS</h3><p>Base-quality candidates near the dependency threshold.</p></div></div><div class="table-wrap"><table>${tableHead()}<tbody id="accRows"></tbody></table></div></section>
      <section class="band" id="wait"><div class="head"><div><h3>WAIT_TRIGGER</h3><p>Standalone candidates with reasonable base score but incomplete entry conditions.</p></div></div><div class="table-wrap"><table>${tableHead()}<tbody id="waitRows"></tbody></table></div></section>
      <section class="band" id="all"><div class="toolbar"><div><h3 style="margin-bottom:4px;">All v11 Rows</h3><p class="muted" style="margin-bottom:0;font-size:13px;">v11StandaloneScore = v11BaseScore + marketDependencyScore. Missing dependency data is not treated as zero.</p></div><input class="search" id="search" type="search" placeholder="company, ticker, sector"></div><div class="segmented" id="filters"></div><div class="table-wrap"><table>${tableHead()}<tbody id="allRows"></tbody></table></div></section>
      <section class="band" id="sources"><div class="head"><div><h3>Sources</h3><p>Standalone v11 uses its own universe file and fresh market data collection.</p></div></div><div class="sources" id="sourceList"></div></section>
      <footer>Generated by <code>node scripts/run-v11-standalone-process.mjs</code>. Data: <code>data/v11-execution-dashboard-data.json</code>.</footer>
    </main>
  </div>
  <script>
    const DATA=${json}; let filter="all"; let search="";
    const fmt=(v,d=2)=>v==null?"-":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:d});
    const pct=(v)=>v==null?"-":fmt(v,2)+"%";
    const score=(v)=>v==null?"NO_DATA":(v>0?"+":"")+fmt(v,0);
    const metrics=[
      ["Universe",DATA.summary.universeCount,"standalone candidates"],
      ["Base ENTRY_OK",DATA.summary.baseEntryOk,"before dependency gate"],
      ["v11 ENTRY",DATA.summary.v11Entry,"final entry"],
      ["Accumulate",DATA.summary.v11Accumulate,"weakness only"],
      ["Adverse dep.",DATA.summary.adverseDependency,"universe"]
    ];
    document.querySelector("#metrics").innerHTML=metrics.map(([a,b,c])=>\`<div class="metric"><strong>\${fmt(b,0)}</strong><span>\${escapeHtml(a)} · \${escapeHtml(c)}</span></div>\`).join("");
    const regimeItems=[["KOSPI 20D",pct(DATA.regime.kospiRet20)],["KOSDAQ RS",pct(DATA.regime.kosdaqRS)],["SEMI RS",pct(DATA.regime.semiRS)],["Breadth",fmt(DATA.regime.breadth,3)],["Entry/Base",DATA.summary.v11Entry+"/"+DATA.summary.baseEntryOk]];
    document.querySelector("#regimeGrid").innerHTML=regimeItems.map(([a,b])=>\`<span><b>\${escapeHtml(b)}</b>\${escapeHtml(a)}</span>\`).join("");
    document.querySelector("#entryRows").innerHTML=DATA.entryList.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("No v11 ENTRY candidates.");
    document.querySelector("#accRows").innerHTML=DATA.accumulateList.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("No weakness-accumulation candidates.");
    document.querySelector("#waitRows").innerHTML=DATA.triggerList.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("No trigger candidates.");
    function renderFilters(){const vals=["all","ENTRY","ACCUMULATE_ON_WEAKNESS","WAIT_TRIGGER","WATCH","AVOID_NOW","NO_DATA","DATA_FAIL"];document.querySelector("#filters").innerHTML=vals.map(v=>\`<button class="\${filter===v?"active":""}" data-filter="\${v}">\${v==="all"?"All":label(v)}</button>\`).join("");document.querySelectorAll("#filters button").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;renderFilters();renderAll()}));}
    function renderAll(){const needle=search.trim().toLowerCase();const rows=DATA.allRows.filter(r=>(filter==="all"||r.v11Decision===filter)&&(!needle||[r.company,r.ticker,r.sector,r.rationale,r.dependencyProfile?.dependencyLabel].join(" ").toLowerCase().includes(needle))).slice(0,140);document.querySelector("#allRows").innerHTML=rows.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("No rows.");}
    function rowHtml(r,i){const p=r.betaProfile||{};const d=r.dependencyProfile||{};return \`<tr><td class="num">\${i+1}</td><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><span class="badge \${decisionClass(r.v11Decision)}">\${label(r.v11Decision)}</span><span class="note">\${escapeHtml(r.v11Reason)}</span></td><td><strong>\${r.v11StandaloneScore??"-"}</strong><span class="note">base \${r.v11BaseScore??"-"} · dep <span class="teal">\${score(r.marketDependencyScore)}</span></span></td><td><strong>\${r.totalScore??"-"}</strong><span class="note">policy \${r.policy?.score??"-"} · value \${r.value?.score??"-"} · tech \${r.technical?.score??"-"} · flow \${r.flowScore?.score??"-"}</span></td><td><strong class="teal">\${score(r.marketDependencyScore)}</strong><span class="note">\${escapeHtml(d.dependencyLabel??"NO_DATA")} · size \${d.sizeFactor??"-"}</span><span class="note">RS \${d.components?.residualScore??"-"} / CAP \${d.components?.captureScore??"-"} / DEP \${d.components?.dependencyAdjustment??"-"}</span></td><td>βM \${fmt(p.betaMarket,2)}<span class="note">βSemiExcess \${fmt(p.betaSemiExcess,2)} · corr \${fmt(p.semiCorr,2)}</span></td><td>\${fmt(p.captureRatio,2)}<span class="note">up \${fmt(p.upCapture,2)} · loss \${fmt(p.lossCapture,2)} · IR \${fmt(p.residualIR,2)}</span></td><td>\${r.structuralRegime?.score??"-"}<span class="note">\${escapeHtml(r.structuralRegime?.gate??"-")} · \${escapeHtml(r.structuralRegime?.grade??"-")}</span></td><td>\${r.holderCostScore??"-"}<span class="note">\${escapeHtml(r.holderCost?.signal??"-")} · \${escapeHtml(r.holderCost?.memo??"")}</span></td><td>Tier \${escapeHtml(p.tier??"NO_DATA")}<span class="note">\${p.alignedReturnDays??0} days · \${escapeHtml((p.notes||[]).join(" · "))}</span></td></tr>\`;}
    function emptyRow(text){return \`<tr><td colspan="11" class="muted">\${escapeHtml(text)}</td></tr>\`;}
    function decisionClass(d){return d==="ENTRY"?"entry":d==="ACCUMULATE_ON_WEAKNESS"?"acc":d==="WATCH"?"watch":d==="NO_DATA"||d==="DATA_FAIL"?"no":d==="WAIT_TRIGGER"?"acc":"neutral";}
    function label(d){return {ENTRY:"ENTRY",ACCUMULATE_ON_WEAKNESS:"Weakness",WATCH:"WATCH",WAIT_TRIGGER:"WAIT",AVOID_NOW:"AVOID",NO_DATA:"NO_DATA",DATA_FAIL:"DATA_FAIL"}[d]??d;}
    function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
    document.querySelector("#search").addEventListener("input",e=>{search=e.target.value;renderAll()});
    document.querySelector("#sourceList").innerHTML=DATA.sources.map(s=>\`<a href="\${escapeHtml(s.url)}" target="_blank" rel="noreferrer"><strong>\${escapeHtml(s.title)}</strong><span>\${escapeHtml(s.url)}</span></a>\`).join("");
    renderFilters();renderAll();
  </script>
</body>
</html>`;
}

function tableHead() {
  return `<thead><tr><th>#</th><th>Company</th><th>Decision</th><th>v11 Score</th><th>Base Score</th><th>Dependency</th><th>Beta</th><th>Capture</th><th>Structure</th><th>Flow Cost</th><th>Tier</th></tr></thead>`;
}

function regimeClass(state) {
  if (state === "NARROW_SEMI_LED") return "narrow";
  if (state === "RISK_OFF") return "risk";
  if (state === "BROAD_RISK_ON") return "broad";
  return "";
}

function thresholdByRegime(state) {
  return {
    NARROW_SEMI_LED: 7,
    RISK_OFF: 10,
    BROAD_RISK_ON: 0,
    NEUTRAL: 3
  }[state] ?? 3;
}

function hardGateBlock(profile, state) {
  if (profile.asymmetricFailure) return "asymmetric capture failure";
  if ((state === "NARROW_SEMI_LED" || state === "RISK_OFF") && profile.adverseDependency) return "adverse dependency in fragile regime";
  if (state === "RISK_OFF" && profile.lossCapture != null && profile.lossCapture > 1 && profile.captureRatio != null && profile.captureRatio < 1.1) {
    return "downside capture too high for risk-off";
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
  return value == null ? "-" : `${Number(value).toLocaleString("ko-KR")} KRW`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
