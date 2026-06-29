import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  average,
  captureStats,
  median,
  pairsToHistory,
  round,
  toReturnMap
} from "./v11-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "data", "v11-source-data.json");
const dashboardPath = path.join(root, "data", "v11-execution-dashboard-data.json");
const outputPath = path.join(root, "data", "v11-capture-verification.json");
const HORIZON = 20;
const TOP_N = 10;

function main() {
  const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const dashboard = JSON.parse(fs.readFileSync(dashboardPath, "utf8"));
  const histories = {
    kospi: pairsToHistory(source.series.indices.kospi),
    semi: pairsToHistory(source.series.indices.semi),
    stocks: Object.fromEntries(Object.entries(source.series.stocks).map(([ticker, pairs]) => [ticker, pairsToHistory(pairs)]))
  };
  const marketDates = histories.kospi.map((row) => row.date);
  const rebalanceDates = marketDates
    .slice(220, Math.max(220, marketDates.length - HORIZON))
    .filter((_, index) => index % HORIZON === 0)
    .slice(-12);

  const rows = dashboard.allRows.filter((row) => !row.error && row.marketDependencyScore != null);
  const periods = rebalanceDates.map((asOfDate) => evaluatePeriod({ rows, histories, asOfDate }));
  const output = {
    meta: {
      title: "v11 standalone capture verification",
      mode: "rolling_forward_price_test_with_static_standalone_scores",
      caveat:
        "The primary check compares standalone base ENTRY_OK rows with final v11 ENTRY rows. Score-top baskets remain reference only because v11 uses dependency as a gate, not as a pure independence-only ranking. Scores are latest static scores, not historical point-in-time fundamentals.",
      horizonTradingDays: HORIZON,
      topN: TOP_N,
      periodCount: periods.length
    },
    summary: summarize(periods),
    periods
  };
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`Generated ${path.relative(root, outputPath)}`);
  console.log(`base ENTRY capture avg: ${output.summary.baseEntryAvgCaptureRatio}`);
  console.log(`v11 ENTRY capture avg: ${output.summary.v11EntryAvgCaptureRatio}`);
  console.log(`score-top reference capture avg: ${output.summary.baseScoreTopAvgCaptureRatio} -> ${output.summary.v11ScoreTopAvgCaptureRatio}`);
}

function evaluatePeriod({ rows, histories, asOfDate }) {
  const topN = Math.min(TOP_N, rows.length);
  const baseScoreTop = [...rows]
    .sort((a, b) => (b.v11BaseScore ?? -Infinity) - (a.v11BaseScore ?? -Infinity))
    .slice(0, topN);
  const v11ScoreTop = [...rows]
    .sort((a, b) => (b.v11StandaloneScore ?? -Infinity) - (a.v11StandaloneScore ?? -Infinity))
    .slice(0, topN);
  const baseEntry = [...rows]
    .filter((row) => row.v11BaseDecision === "ENTRY_OK")
    .sort((a, b) => (b.v11BaseScore ?? -Infinity) - (a.v11BaseScore ?? -Infinity))
    .slice(0, topN);
  const v11Entry = [...rows]
    .filter((row) => row.v11Decision === "ENTRY")
    .sort((a, b) => (b.v11StandaloneScore ?? -Infinity) - (a.v11StandaloneScore ?? -Infinity))
    .slice(0, topN);
  const v11Actionable = [...rows]
    .filter((row) => ["ENTRY", "ACCUMULATE_ON_WEAKNESS"].includes(row.v11Decision))
    .sort((a, b) => (b.v11StandaloneScore ?? -Infinity) - (a.v11StandaloneScore ?? -Infinity))
    .slice(0, topN);
  return {
    asOfDate,
    baseEntry: basketMetrics({ basket: baseEntry, histories, asOfDate }),
    v11Entry: basketMetrics({ basket: v11Entry, histories, asOfDate }),
    v11Actionable: basketMetrics({ basket: v11Actionable, histories, asOfDate }),
    baseScoreTop: basketMetrics({ basket: baseScoreTop, histories, asOfDate }),
    v11ScoreTop: basketMetrics({ basket: v11ScoreTop, histories, asOfDate }),
    baseEntryTickers: baseEntry.map((row) => row.ticker),
    v11EntryTickers: v11Entry.map((row) => row.ticker),
    v11ActionableTickers: v11Actionable.map((row) => row.ticker),
    baseScoreTopTickers: baseScoreTop.map((row) => row.ticker),
    v11ScoreTopTickers: v11ScoreTop.map((row) => row.ticker)
  };
}

function basketMetrics({ basket, histories, asOfDate }) {
  if (!basket.length) {
    return {
      count: 0,
      realizedDays: 0,
      periodReturnPct: null,
      marketReturnPct: null,
      semiCorr: null,
      upCapture: null,
      lossCapture: null,
      captureRatio: null,
      avgBetaSemiExcess: null,
      adverseDependencyCount: 0
    };
  }
  const marketReturns = toReturnMap(histories.kospi);
  const semiReturns = toReturnMap(histories.semi);
  const stockReturnMaps = basket.map((row) => ({
    ticker: row.ticker,
    returns: toReturnMap(histories.stocks[row.ticker] ?? [])
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
    avgBetaSemiExcess: round(average(basket.map((row) => row.betaProfile?.betaSemiExcess)), 3),
    adverseDependencyCount: basket.filter((row) => row.betaProfile?.adverseDependency).length
  };
}

function summarize(periods) {
  const baseEntryCount = periods[0]?.baseEntry.count ?? 0;
  const v11EntryCount = periods[0]?.v11Entry.count ?? 0;
  const v11ActionableCount = periods[0]?.v11Actionable.count ?? 0;
  return {
    baseEntryCount,
    v11EntryCount,
    v11ActionableCount,
    entryReductionPct: baseEntryCount ? round((1 - v11EntryCount / baseEntryCount) * 100, 1) : null,
    actionableExpansionPct: baseEntryCount ? round((v11ActionableCount / baseEntryCount - 1) * 100, 1) : null,
    baseEntryAvgCaptureRatio: round(average(periods.map((period) => period.baseEntry.captureRatio)), 3),
    v11EntryAvgCaptureRatio: round(average(periods.map((period) => period.v11Entry.captureRatio)), 3),
    v11ActionableAvgCaptureRatio: round(average(periods.map((period) => period.v11Actionable.captureRatio)), 3),
    baseEntryMedianSemiCorr: round(median(periods.map((period) => period.baseEntry.semiCorr)), 3),
    v11EntryMedianSemiCorr: round(median(periods.map((period) => period.v11Entry.semiCorr)), 3),
    v11ActionableMedianSemiCorr: round(median(periods.map((period) => period.v11Actionable.semiCorr)), 3),
    baseEntryAvgBetaSemiExcess: round(average(periods.map((period) => period.baseEntry.avgBetaSemiExcess)), 3),
    v11EntryAvgBetaSemiExcess: round(average(periods.map((period) => period.v11Entry.avgBetaSemiExcess)), 3),
    v11ActionableAvgBetaSemiExcess: round(average(periods.map((period) => period.v11Actionable.avgBetaSemiExcess)), 3),
    baseEntryAvgAdverseDependency: round(average(periods.map((period) => period.baseEntry.adverseDependencyCount)), 2),
    v11EntryAvgAdverseDependency: round(average(periods.map((period) => period.v11Entry.adverseDependencyCount)), 2),
    v11ActionableAvgAdverseDependency: round(average(periods.map((period) => period.v11Actionable.adverseDependencyCount)), 2),
    baseScoreTopAvgCaptureRatio: round(average(periods.map((period) => period.baseScoreTop.captureRatio)), 3),
    v11ScoreTopAvgCaptureRatio: round(average(periods.map((period) => period.v11ScoreTop.captureRatio)), 3),
    baseScoreTopMedianSemiCorr: round(median(periods.map((period) => period.baseScoreTop.semiCorr)), 3),
    v11ScoreTopMedianSemiCorr: round(median(periods.map((period) => period.v11ScoreTop.semiCorr)), 3),
    baseScoreTopAvgBetaSemiExcess: round(average(periods.map((period) => period.baseScoreTop.avgBetaSemiExcess)), 3),
    v11ScoreTopAvgBetaSemiExcess: round(average(periods.map((period) => period.v11ScoreTop.avgBetaSemiExcess)), 3),
    baseScoreTopAvgAdverseDependency: round(average(periods.map((period) => period.baseScoreTop.adverseDependencyCount)), 2),
    v11ScoreTopAvgAdverseDependency: round(average(periods.map((period) => period.v11ScoreTop.adverseDependencyCount)), 2)
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
