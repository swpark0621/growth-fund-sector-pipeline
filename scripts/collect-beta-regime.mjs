import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SEMI_PROXY,
  appendResidualPercentiles,
  classifyRegime,
  compactDate,
  computeBetaProfile,
  fetchIndexHistory,
  fetchStockHistory,
  formatSeoulDate,
  formatSeoulDateTime,
  historyToPairs,
  sleep,
  yearsAgoCompact
} from "./v11-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const inputPath = path.join(root, "data", "v10-execution-dashboard-data.json");
const outputPath = path.join(root, "data", "v11-beta-regime.json");
const runNow = new Date();
const runDate = formatSeoulDate(runNow);
const start = yearsAgoCompact(3, runNow);
const end = compactDate(runDate);

async function main() {
  const v10 = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const rows = v10.allRows ?? [];
  if (!rows.length) throw new Error("data/v10-execution-dashboard-data.json has no allRows");

  console.log(`Collecting index history from ${start} to ${end}`);
  const [kospiHistory, kosdaqHistory, semiHistory] = await Promise.all([
    fetchIndexHistory("KOSPI", 130),
    fetchIndexHistory("KOSDAQ", 130),
    fetchStockHistory(SEMI_PROXY.ticker, { start, end })
  ]);

  console.log(`Collecting ${rows.length} stock histories`);
  const stockHistories = new Map();
  const tasks = rows.map((row, index) => async () => {
    try {
      const history = await fetchStockHistory(row.ticker, { start, end });
      stockHistories.set(row.ticker, history);
      console.log(`[${String(index + 1).padStart(3, "0")}/${rows.length}] ${row.company} ${row.ticker}: ${history.length} rows`);
    } catch (error) {
      stockHistories.set(row.ticker, { error: error.message });
      console.log(`[${String(index + 1).padStart(3, "0")}/${rows.length}] ${row.company} ${row.ticker}: ERROR ${error.message}`);
    }
    await sleep(30);
  });
  await mapLimit(tasks, 5);

  const profiles = rows.map((row) => {
    const history = stockHistories.get(row.ticker);
    if (!Array.isArray(history)) {
      return {
        ticker: row.ticker,
        company: row.company,
        sector: row.sector,
        tier: "C",
        rho: null,
        alignedReturnDays: 0,
        semiProxyFlag: false,
        adverseDependency: false,
        favorableBeta: false,
        asymmetricFailure: false,
        residualStrengthPct: null,
        notes: [history?.error ?? "stock history fetch failed"]
      };
    }
    return computeBetaProfile({
      row,
      stockHistory: history,
      kospiHistory,
      semiHistory
    });
  });
  appendResidualPercentiles(profiles);

  const regime = classifyRegime({ kospiHistory, kosdaqHistory, semiHistory, rows });
  const output = {
    meta: {
      title: "National Growth Fund v11 beta/regime data",
      version: "v11-beta-regime",
      runDate,
      updatedAt: formatSeoulDateTime(runNow),
      purpose:
        "Measure market and semiconductor dependency so v11 can reduce adverse dependency, not blindly prefer semiconductor independence.",
      methodology:
        "Two-factor model: stock return = alpha + betaMarket*KOSPI + betaSemiExcess*(SEMI proxy - KOSPI) + residual. Residual strength is evaluated on the latest window and percentile-ranked across the universe.",
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
    series: {
      indices: {
        kospi: historyToPairs(kospiHistory),
        kosdaq: historyToPairs(kosdaqHistory),
        semi: historyToPairs(semiHistory)
      },
      stocks: Object.fromEntries([...stockHistories.entries()]
        .filter(([, history]) => Array.isArray(history))
        .map(([ticker, history]) => [ticker, historyToPairs(history)]))
    },
    sources: [
      { title: "Naver Finance index daily data", url: "https://finance.naver.com/sise/" },
      { title: "Naver Finance stock daily API", url: "https://api.finance.naver.com/siseJson.naver" },
      { title: SEMI_PROXY.name, url: SEMI_PROXY.sourceUrl }
    ]
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`Generated ${path.relative(root, outputPath)}`);
  console.log(`Regime: ${regime.state} / breadth ${regime.breadth}`);
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
