export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export const SEMI_PROXY = {
  ticker: "091160",
  name: "KODEX Semiconductor ETF",
  sourceUrl: "https://finance.naver.com/item/main.naver?code=091160"
};

export const WINDOWS = {
  beta: 120,
  evaluation: 60,
  preferredAligned: 180,
  minAligned: 120,
  minEvaluation: 40
};

export function formatSeoulDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatSeoulDateTime(date = new Date()) {
  const d = formatSeoulDate(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
  return `${d} ${time} KST`;
}

export function compactDate(dateText) {
  return String(dateText).replaceAll("-", "");
}

export function yearsAgoCompact(years, now = new Date()) {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return compactDate(formatSeoulDate(d));
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchText(url, encoding = "utf-8") {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const buffer = await response.arrayBuffer();
  return encoding === "euc-kr" ? new TextDecoder("euc-kr").decode(buffer) : new TextDecoder().decode(buffer);
}

export async function fetchStockHistory(ticker, { start, end }) {
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${ticker}&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": `https://finance.naver.com/item/main.naver?code=${ticker}`
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = await response.text();
  const raw = Function(`return (${text})`)();
  return dedupByDate(raw.slice(1)
    .filter(Array.isArray)
    .map((row) => ({
      date: formatNaverDate(String(row[0])),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5])
    }))
    .filter((row) => row.date && isPositiveNumber(row.close)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchIndexHistory(code, pages = 30) {
  const rows = [];
  for (let page = 1; page <= pages; page += 1) {
    const url = `https://finance.naver.com/sise/sise_index_day.naver?code=${code}&page=${page}`;
    const html = await fetchText(url, "euc-kr");
    const trs = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
    for (const tr of trs) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
      if (!cells.length || !/^\d{4}\.\d{2}\.\d{2}$/.test(cells[0])) continue;
      const close = parseNumber(cells[1]);
      if (!isPositiveNumber(close)) continue;
      rows.push({ date: cells[0].replaceAll(".", "-"), close });
    }
    await sleep(15);
  }
  return dedupByDate(rows).sort((a, b) => a.date.localeCompare(b.date));
}

export function dedupByDate(rows) {
  return [...new Map(rows.map((row) => [row.date, row])).values()];
}

export function strip(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNumber(value) {
  const text = String(value ?? "").replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!text || text === "-" || text === ".") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function historyToPairs(history) {
  return history.map((row) => [row.date, row.close]);
}

export function pairsToHistory(pairs) {
  return pairs.map(([date, close]) => ({ date, close }));
}

export function computeBetaProfile({ row, stockHistory, kospiHistory, semiHistory, asOfDate = null }) {
  const stock = cutoffHistory(stockHistory, asOfDate);
  const kospi = cutoffHistory(kospiHistory, asOfDate);
  const semi = cutoffHistory(semiHistory, asOfDate);
  const stockReturns = toReturnMap(stock);
  const marketReturns = toReturnMap(kospi);
  const semiReturns = toReturnMap(semi);
  const aligned = alignReturns(stockReturns, marketReturns, semiReturns);
  const avgTradingValueEok = averageTradingValueEok(row);

  if (aligned.length < WINDOWS.minAligned) {
    return tierC(row, aligned.length, avgTradingValueEok, "insufficient aligned return history");
  }

  const evaluationCount = Math.min(WINDOWS.evaluation, Math.max(WINDOWS.minEvaluation, Math.floor(aligned.length / 3)));
  const evalObs = aligned.slice(-evaluationCount);
  const hasOutOfSampleFit = aligned.length >= WINDOWS.preferredAligned;
  const fitObs = hasOutOfSampleFit
    ? aligned.slice(-(WINDOWS.beta + evaluationCount), -evaluationCount)
    : aligned.slice(-WINDOWS.beta);

  if (fitObs.length < WINDOWS.minAligned * 0.65 || evalObs.length < WINDOWS.minEvaluation) {
    return tierC(row, aligned.length, avgTradingValueEok, "insufficient fit/evaluation window");
  }

  const fit = olsTwoFactor(fitObs);
  const rawSemi = olsOneFactor(fitObs.map((obs) => ({ x: obs.semi, y: obs.stock })));
  if (!fit || !rawSemi) {
    return tierC(row, aligned.length, avgTradingValueEok, "regression failed");
  }

  const residuals = evalObs.map((obs) => obs.stock - predictTwoFactor(fit, obs));
  const residualMomentum = sum(residuals);
  const residualVol = stdev(residuals);
  const residualIR = residualVol > 0 ? mean(residuals) / residualVol * Math.sqrt(evalObs.length) : null;
  const semiCorr = corr(evalObs.map((obs) => obs.stock), evalObs.map((obs) => obs.semi));
  const marketCorr = corr(evalObs.map((obs) => obs.stock), evalObs.map((obs) => obs.market));
  const capture = captureStats(evalObs);
  const semiProxyFlag = (semiCorr != null && semiCorr >= 0.85) || (rawSemi.beta >= 1.2 && rawSemi.r2 >= 0.6);
  const asymmetricFailure = isAsymmetricFailure(capture);
  const adverseDependency = Boolean(semiProxyFlag && (
    asymmetricFailure ||
    (capture.lossCapture != null && capture.upCapture != null && capture.lossCapture > capture.upCapture + 0.15)
  ));
  const favorableBeta = Boolean(semiProxyFlag && !adverseDependency && capture.captureRatio != null && capture.captureRatio >= 1.1);
  const tier = reliabilityTier({ alignedCount: aligned.length, hasOutOfSampleFit, avgTradingValueEok });

  return {
    ticker: row.ticker,
    company: row.company,
    sector: row.sector,
    latestDate: stock.at(-1)?.date ?? null,
    alignedReturnDays: aligned.length,
    evaluationDays: evalObs.length,
    betaWindowDays: fitObs.length,
    modelMode: hasOutOfSampleFit ? "OUT_OF_SAMPLE_RESIDUAL" : "IN_SAMPLE_FALLBACK",
    tier: tier.tier,
    rho: tier.rho,
    avgTradingValueEok: round(avgTradingValueEok, 1),
    betaMarket: round(fit.betaMarket, 3),
    betaSemiExcess: round(fit.betaSemiExcess, 3),
    betaSemiRaw: round(rawSemi.beta, 3),
    alpha: round(fit.alpha, 5),
    r2TwoFactor: round(fit.r2, 3),
    r2SemiRaw: round(rawSemi.r2, 3),
    residualMomentum: round(residualMomentum, 4),
    residualIR: round(residualIR, 3),
    semiCorr: round(semiCorr, 3),
    marketCorr: round(marketCorr, 3),
    upCapture: round(capture.upCapture, 3),
    lossCapture: round(capture.lossCapture, 3),
    captureRatio: round(capture.captureRatio, 3),
    captureBalance: round(capture.captureBalance, 3),
    semiProxyFlag,
    adverseDependency,
    favorableBeta,
    asymmetricFailure,
    notes: tier.notes
  };
}

export function appendResidualPercentiles(profiles) {
  const values = profiles
    .filter((profile) => profile.rho != null && Number.isFinite(profile.residualIR))
    .map((profile) => profile.residualIR)
    .sort((a, b) => a - b);
  for (const profile of profiles) {
    profile.residualStrengthPct = values.length && Number.isFinite(profile.residualIR)
      ? round(percentileRank(values, profile.residualIR), 3)
      : null;
  }
  return profiles;
}

export function classifyRegime({ kospiHistory, kosdaqHistory, semiHistory, rows }) {
  const kospiRet20 = trailingReturn(kospiHistory, 20);
  const kosdaqRet20 = trailingReturn(kosdaqHistory, 20);
  const semiRet20 = trailingReturn(semiHistory, 20);
  const kosdaqRS = nullableSub(kosdaqRet20, kospiRet20);
  const semiRS = nullableSub(semiRet20, kospiRet20);
  const breadthRows = rows.filter((row) => row?.technicals && typeof row.technicals.aboveMa20 === "boolean");
  const breadth = breadthRows.length
    ? breadthRows.filter((row) => row.technicals.aboveMa20).length / breadthRows.length
    : null;

  let state = "NEUTRAL";
  if (kospiRet20 != null && breadth != null && kospiRet20 < -0.05 && breadth < 0.35) {
    state = "RISK_OFF";
  } else if (semiRS != null && kosdaqRS != null && breadth != null && semiRS > 0.02 && kosdaqRS < 0 && breadth < 0.45) {
    state = "NARROW_SEMI_LED";
  } else if (kosdaqRS != null && breadth != null && kosdaqRS >= 0 && breadth >= 0.55) {
    state = "BROAD_RISK_ON";
  }

  const guidance = {
    NARROW_SEMI_LED: "Semi-led narrow tape. Do not reject good semi-beta names automatically; reject adverse dependency and size down.",
    BROAD_RISK_ON: "Broad risk-on tape. Quality growth and smaller policy names can use normal entry gates.",
    RISK_OFF: "Risk-off tape. Require strong downside capture and positive residual strength.",
    NEUTRAL: "Mixed tape. Use default dependency gate and staged entry."
  }[state];

  return {
    state,
    guidance,
    kospiRet20: round(kospiRet20 * 100, 2),
    kosdaqRet20: round(kosdaqRet20 * 100, 2),
    semiRet20: round(semiRet20 * 100, 2),
    kosdaqRS: round(kosdaqRS * 100, 2),
    semiRS: round(semiRS * 100, 2),
    breadth: round(breadth, 3)
  };
}

export function scoreMarketDependency(profile) {
  if (!profile || profile.rho == null || profile.tier === "C") {
    return {
      marketDependencyScore: null,
      dependencyScoreRaw: null,
      components: null,
      dependencyLabel: "NO_DATA"
    };
  }
  const residualScore = Math.round(10 * clamp(profile.residualStrengthPct ?? 0.5, 0, 1));
  const captureScore = captureBucket(profile);
  const dependencyAdjustment = dependencyBucket(profile);
  const raw = residualScore + captureScore + dependencyAdjustment;
  const marketDependencyScore = Math.round(raw * profile.rho);
  return {
    marketDependencyScore,
    dependencyScoreRaw: raw,
    components: {
      residualScore,
      captureScore,
      dependencyAdjustment
    },
    dependencyLabel: dependencyLabel(profile)
  };
}

export function decideV11({ row, profile, score, regime }) {
  const v10Entry = row.decision === "ENTRY_OK";
  if (!v10Entry) return { v11Decision: "NOT_V10_ENTRY", reason: "v10 decision is not ENTRY_OK" };
  if (!profile || score.marketDependencyScore == null) {
    return { v11Decision: "NO_DATA", reason: "market dependency data is insufficient" };
  }

  const state = regime?.state ?? "NEUTRAL";
  const threshold = thresholdByRegime(state);
  const hardBlock = hardGateBlock(profile, state);

  if (hardBlock) {
    return { v11Decision: "WATCH", reason: hardBlock };
  }
  if (score.marketDependencyScore >= threshold) {
    return { v11Decision: "ENTRY", reason: `score ${score.marketDependencyScore} >= threshold ${threshold}` };
  }
  if (score.marketDependencyScore >= threshold - 6) {
    return {
      v11Decision: "ACCUMULATE_ON_WEAKNESS",
      reason: `score ${score.marketDependencyScore} is close to threshold ${threshold}`
    };
  }
  return { v11Decision: "WATCH", reason: `score ${score.marketDependencyScore} < threshold ${threshold - 6}` };
}

export function sizeFactor({ score, regime }) {
  if (score == null) return null;
  const regimeMult = {
    NARROW_SEMI_LED: 0.45,
    NEUTRAL: 0.7,
    BROAD_RISK_ON: 1.0,
    RISK_OFF: 0.25
  }[regime?.state ?? "NEUTRAL"] ?? 0.7;
  const indepMult = clamp(0.55 + score / 30, 0.45, 1.2);
  return round(regimeMult * indepMult, 2);
}

export function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function average(values) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

export function trailingReturn(history, days, asOfDate = null) {
  const rows = cutoffHistory(history, asOfDate);
  if (rows.length <= days || !isPositiveNumber(rows.at(-days - 1)?.close) || !isPositiveNumber(rows.at(-1)?.close)) return null;
  return rows.at(-1).close / rows.at(-days - 1).close - 1;
}

export function toReturnMap(history) {
  const rows = dedupByDate(history)
    .filter((row) => row.date && isPositiveNumber(row.close))
    .sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1].close;
    const now = rows[i].close;
    if (!isPositiveNumber(prev) || !isPositiveNumber(now)) continue;
    map.set(rows[i].date, Math.log(now / prev));
  }
  return map;
}

export function alignReturns(stockReturns, marketReturns, semiReturns) {
  const dates = [...stockReturns.keys()]
    .filter((date) => marketReturns.has(date) && semiReturns.has(date))
    .sort();
  return dates.map((date) => {
    const market = marketReturns.get(date);
    const semi = semiReturns.get(date);
    return {
      date,
      stock: stockReturns.get(date),
      market,
      semi,
      semiExcess: semi - market
    };
  });
}

export function captureStats(obs) {
  const up = obs.filter((row) => row.market > 0);
  const down = obs.filter((row) => row.market < 0);
  const upMkt = mean(up.map((row) => row.market));
  const upStock = mean(up.map((row) => row.stock));
  const downMkt = mean(down.map((row) => row.market));
  const downStock = mean(down.map((row) => row.stock));
  const upCapture = up.length >= 8 && upMkt > 0 ? upStock / upMkt : null;
  const lossCapture = down.length >= 8 && downMkt < 0 ? Math.max(0, -downStock) / Math.abs(downMkt) : null;
  const captureRatio = upCapture != null && lossCapture != null ? upCapture / Math.max(lossCapture, 0.2) : null;
  const captureBalance = upCapture != null && lossCapture != null ? upCapture - lossCapture : null;
  return { upCapture, lossCapture, captureRatio, captureBalance, upDays: up.length, downDays: down.length };
}

export function isAsymmetricFailure(profileOrCapture) {
  const ratio = profileOrCapture.captureRatio;
  const up = profileOrCapture.upCapture;
  const loss = profileOrCapture.lossCapture;
  return Boolean((ratio != null && ratio < 0.7) || (loss != null && up != null && loss >= 1.2 && up < 1));
}

export function cutoffHistory(history, asOfDate) {
  const rows = (history ?? [])
    .filter((row) => row.date && isPositiveNumber(row.close))
    .sort((a, b) => a.date.localeCompare(b.date));
  return asOfDate ? rows.filter((row) => row.date <= asOfDate) : rows;
}

function formatNaverDate(value) {
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(value)) return value.replaceAll(".", "-");
  return null;
}

function tierC(row, alignedCount, avgTradingValueEok, reason) {
  return {
    ticker: row.ticker,
    company: row.company,
    sector: row.sector,
    alignedReturnDays: alignedCount,
    evaluationDays: 0,
    betaWindowDays: 0,
    tier: "C",
    rho: null,
    avgTradingValueEok: round(avgTradingValueEok, 1),
    semiProxyFlag: false,
    adverseDependency: false,
    favorableBeta: false,
    asymmetricFailure: false,
    notes: [reason]
  };
}

function reliabilityTier({ alignedCount, hasOutOfSampleFit, avgTradingValueEok }) {
  const notes = [];
  if (avgTradingValueEok != null && avgTradingValueEok < 3) {
    return { tier: "C", rho: null, notes: ["very low average trading value"] };
  }
  if (hasOutOfSampleFit && alignedCount >= WINDOWS.preferredAligned && (avgTradingValueEok == null || avgTradingValueEok >= 20)) {
    return { tier: "A", rho: 1, notes };
  }
  if (!hasOutOfSampleFit) notes.push("beta and residual windows overlap");
  if (avgTradingValueEok != null && avgTradingValueEok < 20) notes.push("moderate liquidity haircut");
  return { tier: "B", rho: 0.7, notes };
}

function averageTradingValueEok(row) {
  const avgVolume = Number(row?.liquidity?.avgVolume20);
  const close = Number(row?.close);
  if (!Number.isFinite(avgVolume) || !Number.isFinite(close)) return null;
  return avgVolume * close / 100_000_000;
}

function olsTwoFactor(obs) {
  const rows = obs.filter((row) => [row.stock, row.market, row.semiExcess].every(Number.isFinite));
  if (rows.length < 30) return null;
  const xtx = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const xty = [0, 0, 0];
  for (const row of rows) {
    const x = [1, row.market, row.semiExcess];
    for (let i = 0; i < 3; i += 1) {
      xty[i] += x[i] * row.stock;
      for (let j = 0; j < 3; j += 1) xtx[i][j] += x[i] * x[j];
    }
  }
  for (let i = 0; i < 3; i += 1) xtx[i][i] += 1e-12;
  const coef = solveLinearSystem(xtx, xty);
  if (!coef) return null;
  const model = { alpha: coef[0], betaMarket: coef[1], betaSemiExcess: coef[2] };
  const y = rows.map((row) => row.stock);
  const rss = sum(rows.map((row) => (row.stock - predictTwoFactor(model, row)) ** 2));
  const tss = sum(y.map((v) => (v - mean(y)) ** 2));
  model.r2 = tss > 0 ? clamp(1 - rss / tss, 0, 1) : null;
  return model;
}

function olsOneFactor(obs) {
  const rows = obs.filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y));
  if (rows.length < 30) return null;
  const xs = rows.map((row) => row.x);
  const ys = rows.map((row) => row.y);
  const mx = mean(xs);
  const my = mean(ys);
  const varX = sum(xs.map((x) => (x - mx) ** 2));
  if (varX <= 0) return null;
  const cov = sum(rows.map((row) => (row.x - mx) * (row.y - my)));
  const beta = cov / varX;
  const alpha = my - beta * mx;
  const rss = sum(rows.map((row) => (row.y - (alpha + beta * row.x)) ** 2));
  const tss = sum(ys.map((y) => (y - my) ** 2));
  return { alpha, beta, r2: tss > 0 ? clamp(1 - rss / tss, 0, 1) : null };
}

function predictTwoFactor(model, obs) {
  return model.alpha + model.betaMarket * obs.market + model.betaSemiExcess * obs.semiExcess;
}

function solveLinearSystem(a, b) {
  const m = a.map((row, i) => [...row, b[i]]);
  const n = b.length;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-14) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const divisor = m[col][col];
    for (let j = col; j <= n; j += 1) m[col][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let j = col; j <= n; j += 1) m[row][j] -= factor * m[col][j];
    }
  }
  return m.map((row) => row[n]);
}

function captureBucket(profile) {
  if (profile.captureRatio == null || profile.captureBalance == null) return 0;
  if (profile.asymmetricFailure) return -12;
  if (profile.captureRatio >= 1.3 && profile.captureBalance >= 0.2) return 10;
  if (profile.captureRatio >= 1.1) return 6;
  if (profile.captureRatio >= 0.9) return 0;
  if (profile.captureRatio >= 0.7) return -5;
  return -10;
}

function dependencyBucket(profile) {
  const residualPct = profile.residualStrengthPct ?? 0.5;
  if (profile.adverseDependency) return -7;
  if (profile.favorableBeta && residualPct >= 0.45) return 2;
  if (!profile.semiProxyFlag && profile.semiCorr != null && profile.semiCorr <= 0.5 && residualPct >= 0.6) return 5;
  if (!profile.semiProxyFlag && profile.semiCorr != null && profile.semiCorr <= 0.5) return 3;
  return 0;
}

function dependencyLabel(profile) {
  if (profile.adverseDependency) return "ADVERSE_DEPENDENCY";
  if (profile.favorableBeta) return "FAVORABLE_BETA";
  if (!profile.semiProxyFlag && profile.semiCorr != null && profile.semiCorr <= 0.5 && (profile.residualStrengthPct ?? 0) >= 0.6) {
    return "INDEPENDENT_STRENGTH";
  }
  return "NEUTRAL_DEPENDENCY";
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
  if ((state === "NARROW_SEMI_LED" || state === "RISK_OFF") && profile.adverseDependency) {
    return "adverse semi dependency in fragile regime";
  }
  if (state === "RISK_OFF" && profile.lossCapture != null && profile.lossCapture > 1 && profile.captureRatio != null && profile.captureRatio < 1.1) {
    return "downside capture too high for risk-off";
  }
  return null;
}

function percentileRank(sortedValues, value) {
  if (!sortedValues.length) return null;
  let belowOrEqual = 0;
  for (const current of sortedValues) {
    if (current <= value) belowOrEqual += 1;
    else break;
  }
  return clamp((belowOrEqual - 0.5) / sortedValues.length, 0, 1);
}

function nullableSub(a, b) {
  return a == null || b == null ? null : a - b;
}

function mean(values) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? sum(nums) / nums.length : null;
}

function stdev(values) {
  const nums = values.filter(Number.isFinite);
  if (nums.length < 2) return 0;
  const m = mean(nums);
  return Math.sqrt(sum(nums.map((v) => (v - m) ** 2)) / (nums.length - 1));
}

function corr(a, b) {
  const rows = a.map((value, index) => [value, b[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (rows.length < 3) return null;
  const xs = rows.map(([x]) => x);
  const ys = rows.map(([, y]) => y);
  const mx = mean(xs);
  const my = mean(ys);
  const sx = Math.sqrt(sum(xs.map((x) => (x - mx) ** 2)));
  const sy = Math.sqrt(sum(ys.map((y) => (y - my) ** 2)));
  if (sx <= 0 || sy <= 0) return null;
  return sum(rows.map(([x, y]) => (x - mx) * (y - my))) / (sx * sy);
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}
