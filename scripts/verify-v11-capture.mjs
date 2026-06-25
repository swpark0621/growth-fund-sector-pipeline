import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendResidualPercentiles,
  average,
  captureStats,
  classifyRegime,
  computeBetaProfile,
  cutoffHistory,
  decideV11,
  median,
  pairsToHistory,
  round,
  scoreMarketDependency,
  toReturnMap
} from "./v11-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const v10Path = path.join(root, "data", "v10-execution-dashboard-data.json");
const betaPath = path.join(root, "data", "v11-beta-regime.json");
const outputPath = path.join(root, "data", "v11-capture-verification.json");
const HORIZON = 20;
const TOP_N = 10;

function main() {
  const v10 = JSON.parse(fs.readFileSync(v10Path, "utf8"));
  const beta = JSON.parse(fs.readFileSync(betaPath, "utf8"));
  const rows = v10.allRows ?? [];
  const histories = {
    kospi: pairsToHistory(beta.series.indices.kospi),
    kosdaq: pairsToHistory(beta.series.indices.kosdaq),
    semi: pairsToHistory(beta.series.indices.semi),
    stocks: Object.fromEntries(Object.entries(beta.series.stocks).map(([ticker, pairs]) => [ticker, pairsToHistory(pairs)]))
  };
  const marketDates = histories.kospi.map((row) => row.date);
  const rebalanceDates = marketDates
    .slice(220, Math.max(220, marketDates.length - HORIZON))
    .filter((_, index) => index % HORIZON === 0)
    .slice(-12);

  const periods = rebalanceDates.map((asOfDate) => evaluatePeriod({ rows, histories, asOfDate }));
  const output = {
    meta: {
      title: "v11 capture verification",
      mode: "rolling_forward_price_test_with_static_v10_scores",
      caveat:
        "v11 dependency metrics are calculated only with data available at each rebalance date and evaluated over the next 20 trading days. v10cScore itself is the latest available score, not a historical point-in-time score.",
      horizonTradingDays: HORIZON,
      topN: TOP_N,
      periodCount: periods.length
    },
    summary: summarize(periods),
    periods
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`Generated ${path.relative(root, outputPath)}`);
  console.log(`v10 top capture avg: ${output.summary.v10TopAvgCaptureRatio}`);
  console.log(`v11 top capture avg: ${output.summary.v11TopAvgCaptureRatio}`);
}

function evaluatePeriod({ rows, histories, asOfDate }) {
  const kospiHistory = cutoffHistory(histories.kospi, asOfDate);
  const kosdaqHistory = cutoffHistory(histories.kosdaq, asOfDate);
  const semiHistory = cutoffHistory(histories.semi, asOfDate);
  const regime = classifyRegime({ kospiHistory, kosdaqHistory, semiHistory, rows });

  const profiles = rows.map((row) => {
    const stockHistory = histories.stocks[row.ticker] ?? [];
    return computeBetaProfile({
      row,
      stockHistory,
      kospiHistory: histories.kospi,
      semiHistory: histories.semi,
      asOfDate
    });
  });
  appendResidualPercentiles(profiles);
  const profileMap = new Map(profiles.map((profile) => [profile.ticker, profile]));
  const scored = rows.map((row) => {
    const profile = profileMap.get(row.ticker);
    const score = scoreMarketDependency(profile);
    const baseScore = Number.isFinite(row.v10cScore) ? row.v10cScore : row.totalScore;
    const v11Score = score.marketDependencyScore == null || !Number.isFinite(baseScore)
      ? null
      : baseScore + score.marketDependencyScore;
    const decision = decideV11({ row, profile, score, regime });
    return { row, profile, score, v11Score, v11Decision: decision.v11Decision };
  }).filter((item) => item.score.marketDependencyScore != null);

  const topN = Math.min(TOP_N, scored.length);
  const v10Top = [...scored]
    .sort((a, b) => (b.row.v10cScore ?? b.row.totalScore ?? 0) - (a.row.v10cScore ?? a.row.totalScore ?? 0))
    .slice(0, topN);
  const v11Top = [...scored]
    .sort((a, b) => (b.v11Score ?? -Infinity) - (a.v11Score ?? -Infinity))
    .slice(0, topN);
  const currentV10Entries = scored.filter((item) => item.row.decision === "ENTRY_OK");
  const currentV11Entries = currentV10Entries.filter((item) => item.v11Decision === "ENTRY");

  return {
    asOfDate,
    regime: regime.state,
    v10Top: basketMetrics({ basket: v10Top, histories, asOfDate }),
    v11Top: basketMetrics({ basket: v11Top, histories, asOfDate }),
    v10EntryCount: currentV10Entries.length,
    v11EntryCount: currentV11Entries.length,
    v10EntryAvgBetaSemiExcess: round(average(currentV10Entries.map((item) => item.profile.betaSemiExcess)), 3),
    v11EntryAvgBetaSemiExcess: round(average(currentV11Entries.map((item) => item.profile.betaSemiExcess)), 3),
    v10TopTickers: v10Top.map((item) => item.row.ticker),
    v11TopTickers: v11Top.map((item) => item.row.ticker)
  };
}

function basketMetrics({ basket, histories, asOfDate }) {
  const marketReturns = toReturnMap(histories.kospi);
  const semiReturns = toReturnMap(histories.semi);
  const stockReturnMaps = basket.map((item) => ({
    ticker: item.row.ticker,
    returns: toReturnMap(histories.stocks[item.row.ticker] ?? [])
  }));
  const futureDates = [...marketReturns.keys()].filter((date) => date > asOfDate).slice(0, HORIZON);
  const obs = [];
  for (const date of futureDates) {
    const stockReturns = stockReturnMaps
      .map((item) => item.returns.get(date))
      .filter(Number.isFinite);
    if (!stockReturns.length || !marketReturns.has(date) || !semiReturns.has(date)) continue;
    obs.push({
      date,
      stock: average(stockReturns),
      market: marketReturns.get(date),
      semi: semiReturns.get(date)
    });
  }
  const capture = captureStats(obs);
  return {
    count: basket.length,
    realizedDays: obs.length,
    periodReturnPct: round((Math.exp(obs.reduce((total, row) => total + row.stock, 0)) - 1) * 100, 2),
    marketReturnPct: round((Math.exp(obs.reduce((total, row) => total + row.market, 0)) - 1) * 100, 2),
    semiCorr: round(corr(obs.map((row) => row.stock), obs.map((row) => row.semi)), 3),
    upCapture: round(capture.upCapture, 3),
    lossCapture: round(capture.lossCapture, 3),
    captureRatio: round(capture.captureRatio, 3),
    avgBetaSemiExcess: round(average(basket.map((item) => item.profile.betaSemiExcess)), 3),
    adverseDependencyCount: basket.filter((item) => item.profile.adverseDependency).length
  };
}

function summarize(periods) {
  const narrow = periods.filter((period) => period.regime === "NARROW_SEMI_LED");
  return {
    v10TopAvgCaptureRatio: round(average(periods.map((period) => period.v10Top.captureRatio)), 3),
    v11TopAvgCaptureRatio: round(average(periods.map((period) => period.v11Top.captureRatio)), 3),
    v10TopMedianSemiCorr: round(median(periods.map((period) => period.v10Top.semiCorr)), 3),
    v11TopMedianSemiCorr: round(median(periods.map((period) => period.v11Top.semiCorr)), 3),
    v10TopAvgBetaSemiExcess: round(average(periods.map((period) => period.v10Top.avgBetaSemiExcess)), 3),
    v11TopAvgBetaSemiExcess: round(average(periods.map((period) => period.v11Top.avgBetaSemiExcess)), 3),
    narrowPeriodCount: narrow.length,
    narrowV10EntryAvgCount: round(average(narrow.map((period) => period.v10EntryCount)), 2),
    narrowV11EntryAvgCount: round(average(narrow.map((period) => period.v11EntryCount)), 2),
    narrowV10EntryAvgBetaSemiExcess: round(average(narrow.map((period) => period.v10EntryAvgBetaSemiExcess)), 3),
    narrowV11EntryAvgBetaSemiExcess: round(average(narrow.map((period) => period.v11EntryAvgBetaSemiExcess)), 3)
  };
}

function corr(a, b) {
  const rows = a.map((value, index) => [value, b[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (rows.length < 3) return null;
  const xs = rows.map(([x]) => x);
  const ys = rows.map(([, y]) => y);
  const mx = average(xs);
  const my = average(ys);
  const sx = Math.sqrt(xs.reduce((total, value) => total + (value - mx) ** 2, 0));
  const sy = Math.sqrt(ys.reduce((total, value) => total + (value - my) ** 2, 0));
  if (sx <= 0 || sy <= 0) return null;
  return rows.reduce((total, [x, y]) => total + (x - mx) * (y - my), 0) / (sx * sy);
}

main();
