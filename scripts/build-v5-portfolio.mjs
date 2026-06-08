import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const v4Path = path.join(root, "data", "v4-study-data.json");
const fundPath = path.join(root, "data", "national-growth-fund-dashboard.json");
const dataPath = path.join(root, "data", "v5-portfolio-data.json");
const outputPath = path.join(root, "docs", "v5.html");

const RUN_DATE = "2026-06-08";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const V4_CUTOFF_DATE = "2026-05-29";
const EXCLUDED_RECIPIENT_TICKERS = new Set(["005930", "035420", "093370", "302440", "066970", "457190", "252990"]);

const listedRecipients = [
  { ticker: "005930", company: "삼성전자", eventDate: "2026-02-26", event: "평택 5라인 AI반도체 클러스터 2.5조원 저리대출 승인", proxy: false },
  { ticker: "457190", company: "이수스페셜티케미컬", eventDate: "2026-02-26", event: "울산 차세대 이차전지 소재공장 1,000억원 저리대출 승인", proxy: false },
  { ticker: "035420", company: "네이버", eventDate: "2026-04-15", event: "AI 데이터센터·GPU 서버 4,000억원 저리대출 승인", proxy: false },
  { ticker: "252990", company: "샘씨엔에스", eventDate: "2026-04-15", event: "반도체 테스트 공정 부품 증설 200억원 저리대출 보도", proxy: false },
  { ticker: "093370", company: "후성", eventDate: "2026-04-30", event: "반도체 공정용 고순도 불화수소가스 165억원 저리대출 승인", proxy: false },
  { ticker: "302440", company: "SK바이오사이언스", eventDate: "2026-05-28", event: "폐렴구균 3상 신약개발 3,000억원 대출 승인", proxy: false },
  { ticker: "066970", company: "엘앤에프", eventDate: "2026-05-28", event: "엘앤에프플러스 LFP 양극재 2,200억원 대출 승인의 상장 모회사 프록시", proxy: true }
];

async function main() {
  const v4 = readJson(v4Path);
  const fund = readJson(fundPath);
  const market = await fetchMarketSnapshot();

  const candidateBase = v4.studyRows
    .filter((row) => row.v4?.classification !== "제외")
    .filter((row) => !EXCLUDED_RECIPIENT_TICKERS.has(row.ticker));

  const enriched = [];
  for (const [index, row] of candidateBase.entries()) {
    const marketRow = await enrichCandidate(row);
    enriched.push(marketRow);
    console.log(`[${String(index + 1).padStart(2, "0")}/${candidateBase.length}] ${row.company} ${row.ticker} score=${marketRow.v5.score}`);
    await sleep(80);
  }

  const preliminary = enriched
    .filter((row) => row.v5.eligibility !== "exclude")
    .sort((a, b) => b.v5.score - a.v5.score)
    .slice(0, 28);

  for (const row of preliminary) {
    row.brokers = {
      day: await fetchBrokers(row.ticker, 1),
      d5: await fetchBrokers(row.ticker, 5),
      d20: await fetchBrokers(row.ticker, 20)
    };
    applyBrokerScore(row);
    await sleep(80);
  }

  const ranked = enriched
    .filter((row) => row.v5.eligibility !== "exclude")
    .sort((a, b) => b.v5.score - a.v5.score);
  const portfolio = buildPortfolio(ranked.slice(0, 14));
  const recipientPerformance = [];
  for (const recipient of listedRecipients) {
    recipientPerformance.push(await buildRecipientPerformance(recipient));
    await sleep(80);
  }

  const residual = buildResidualCapacity(fund);
  const output = {
    meta: {
      title: "국민성장펀드 v5 잔여집행력·후보 포트폴리오",
      runDate: RUN_DATE,
      basis: "v4 후보 재평가 + Naver Finance 2026-06-08 가격·수급·거래원 + 국민성장펀드 공식 승인현황",
      currentTradingDate: firstExisting(ranked, ["marketData", "latestDate"]),
      v4CutoffDate: V4_CUTOFF_DATE,
      totalCandidates: enriched.length,
      rankedCandidates: ranked.length,
      disclosure: "투자 권유가 아니라 공개자료 기반의 후보 우선순위와 리스크 점검표입니다. 국민성장펀드 실제 선정 여부와 주가 수익률은 보장되지 않습니다."
    },
    market,
    residual,
    strategy: buildStrategy(market, residual),
    recipientPerformance,
    portfolio,
    rankedCandidates: ranked,
    watchlist: ranked.slice(10, 24),
    sources: buildSources()
  };

  fs.writeFileSync(dataPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  fs.writeFileSync(outputPath, buildHtml(output), "utf8");
  console.log(`Generated ${path.relative(root, dataPath)}`);
  console.log(`Generated ${path.relative(root, outputPath)}`);
}

async function enrichCandidate(row) {
  const history = await fetchForeignHistory(row.ticker, 8);
  const latest = history.at(-1);
  const listedShares = row.marketCap?.listedShares ?? null;
  const latestMarketCapEok = listedShares && latest?.close ? round(latest.close * listedShares / 100_000_000, 1) : row.marketCap?.eok ?? null;
  const windows = {
    d5: calcWindow(history, 5, latestMarketCapEok),
    d20: calcWindow(history, 20, latestMarketCapEok),
    d60: calcWindow(history, 60, latestMarketCapEok)
  };
  const v4Close = closeOnOrBefore(history, V4_CUTOFF_DATE)?.close ?? row.flowTrend?.latestClose ?? null;
  const postV4ShockPct = latest?.close && v4Close ? pctChange(v4Close, latest.close) : null;
  const policy = policyFit(row);
  const scoreParts = scoreCandidate(row, latestMarketCapEok, windows, postV4ShockPct, policy);
  return {
    ticker: row.ticker,
    company: row.company,
    market: row.market,
    sectors: row.sectors,
    valueChains: row.valueChains,
    baseValidation: row.baseValidation,
    v4: row.v4,
    study: row.study,
    marketData: {
      latestDate: latest?.date ?? null,
      latestClose: latest?.close ?? null,
      marketCapEok: latestMarketCapEok,
      listedShares,
      v4Close,
      postV4ShockPct,
      sourceUrl: `https://finance.naver.com/item/frgn.naver?code=${row.ticker}`
    },
    flow: windows,
    policyFit: policy,
    brokers: null,
    v5: scoreParts
  };
}

function scoreCandidate(row, marketCapEok, windows, postV4ShockPct, policy) {
  const v4Score = clamp((row.v4?.totalScore ?? 50) / 100 * 24, 0, 24);
  const residualFit = policy.score;
  const sizeScore = marketCapEok == null ? 4 : marketCapEok < 700 ? 5 : marketCapEok <= 3000 ? 10 : marketCapEok <= 6000 ? 9 : marketCapEok <= 9000 ? 5 : 1;
  const flowScore = clamp(
    (windows.d20.foreignValueToMarketCapPct > 0 ? 5 : 0) +
    (windows.d20.institutionValueToMarketCapPct > 0 ? 5 : 0) +
    (windows.d60.foreignValueToMarketCapPct > 0 ? 4 : 0) +
    (windows.d60.institutionValueToMarketCapPct > 0 ? 4 : 0) +
    (windows.d5.foreignValueToMarketCapPct + windows.d5.institutionValueToMarketCapPct > -1 ? 2 : 0),
    0,
    20
  );
  const crashScore = postCrashScore(postV4ShockPct, windows.d20.priceReturnPct);
  const catalystScore = clamp((row.study?.keyCatalysts?.length ?? 0) >= 4 ? 8 : 5, 0, 8);
  const classPenalty = row.v4?.classification === "C" ? 8 : row.v4?.classification === "B" ? 2 : 0;
  const capPenalty = marketCapEok != null && marketCapEok > 6000 ? 7 : 0;
  const overheatingPenalty = windows.d60.priceReturnPct > 90 ? 8 : windows.d60.priceReturnPct > 60 ? 4 : 0;
  const crashPenalty = postV4ShockPct != null && postV4ShockPct < -45 ? 7 : 0;
  const riskPenalty = classPenalty + capPenalty + overheatingPenalty + crashPenalty;
  const raw = v4Score + residualFit + sizeScore + flowScore + crashScore + catalystScore - riskPenalty;
  const score = Math.round(clamp(raw, 0, 100));
  return {
    score,
    scoreParts: {
      v4Score: round(v4Score, 1),
      residualFit,
      sizeScore,
      flowScore,
      crashScore,
      catalystScore,
      riskPenalty
    },
    eligibility: marketCapEok != null && marketCapEok > 12000 ? "exclude" : "rank",
    band: score >= 82 ? "High" : score >= 74 ? "Medium" : "Watch",
    thesis: makeThesis(row, policy, postV4ShockPct, windows),
    riskMemo: makeRiskMemo(row, postV4ShockPct, windows, marketCapEok)
  };
}

function applyBrokerScore(row) {
  const d5 = row.brokers?.d5;
  const d20 = row.brokers?.d20;
  const foreignNet5 = d5?.foreignEstimate?.net ?? 0;
  const foreignNet20 = d20?.foreignEstimate?.net ?? 0;
  let add = 0;
  if (foreignNet5 > 0) add += 3;
  if (foreignNet20 > 0) add += 3;
  if (d5?.buyTop?.some((item) => isForeignBroker(item.name))) add += 2;
  if (d5?.sellTop?.some((item) => isForeignBroker(item.name))) add -= 2;
  row.v5.score = Math.round(clamp(row.v5.score + add, 0, 100));
  row.v5.scoreParts.brokerScore = add;
  row.v5.band = row.v5.score >= 82 ? "High" : row.v5.score >= 74 ? "Medium" : "Watch";
}

function policyFit(row) {
  const text = [row.company, ...(row.sectors ?? []), ...(row.valueChains ?? []), ...(row.study?.keyCatalysts ?? [])].join(" ");
  const buckets = [];
  let score = 10;
  if (/AI|반도체|NPU|SoC|HBM|데이터센터|컴퓨팅|클라우드|IDC|팹리스/.test(text)) {
    buckets.push("AI·반도체 직접/간접투자");
    score = Math.max(score, 20);
  }
  if (/전력|전기|변압|배전|송전|전선|전력망|데이터센터/.test(text)) {
    buckets.push("전력망·AI인프라 저리대출");
    score = Math.max(score, 19);
  }
  if (/로봇|스마트팩토리|자동화|감속기/.test(text)) {
    buckets.push("로봇·스마트팩토리 직접/간접투자");
    score = Math.max(score, 18);
  }
  if (/우주|위성|방산|센서|항공/.test(text)) {
    buckets.push("우주·방산 프로젝트/간접투자");
    score = Math.max(score, 17);
  }
  if (/이차전지|배터리|양극재|음극재|전해|LFP|CNT/.test(text)) {
    buckets.push("이차전지 소재 저리대출/간접투자");
    score = Math.max(score, 17);
  }
  if (/바이오|백신|CDMO|치료|신약/.test(text)) {
    buckets.push("바이오·백신 저리대출/직접투자");
    score = Math.max(score, 16);
  }
  if (/OLED|디스플레이/.test(text)) {
    buckets.push("OLED 초격차 저리대출");
    score = Math.max(score, 15);
  }
  if (/콘텐츠|IP|애니|VFX/.test(text)) {
    buckets.push("K-콘텐츠·AI콘텐츠 간접투자");
    score = Math.max(score, 14);
  }
  return { buckets: unique(buckets), score };
}

function postCrashScore(postV4ShockPct, d20ReturnPct) {
  if (postV4ShockPct == null) return 6;
  if (postV4ShockPct >= -25 && postV4ShockPct <= -5) return 15;
  if (postV4ShockPct > -5 && d20ReturnPct > 0) return 10;
  if (postV4ShockPct < -25 && postV4ShockPct >= -42) return 10;
  if (postV4ShockPct < -42) return 4;
  return 8;
}

function makeThesis(row, policy, postV4ShockPct, windows) {
  const buckets = policy.buckets.slice(0, 2).join(" / ") || "정책 후보";
  const shock = postV4ShockPct == null ? "급락 후 가격 확인 필요" : `v4 이후 ${formatPct(postV4ShockPct)}`;
  const flow = `20일 외국인 ${formatPct(windows.d20.foreignValueToMarketCapPct)}, 기관 ${formatPct(windows.d20.institutionValueToMarketCapPct)}`;
  return `${buckets}. ${shock}, ${flow}.`;
}

function makeRiskMemo(row, postV4ShockPct, windows, marketCapEok) {
  const risks = [];
  if (row.v4?.classification === "C") risks.push("v4 보류 등급");
  if (marketCapEok != null && marketCapEok > 6000) risks.push("6000억원 초과로 정책자금 직접성 약화");
  if (windows.d60.priceReturnPct > 60) risks.push("12주 상승률 과열");
  if (postV4ShockPct != null && postV4ShockPct < -40) risks.push("급락 후 추세 훼손 가능성");
  if (!risks.length) risks.push("선정 뉴스 선반영과 신규자금 희석 여부 확인");
  return risks.join(" · ");
}

function buildPortfolio(rows) {
  const sectorCounts = new Map();
  const selected = [];
  for (const row of rows) {
    const primary = row.policyFit.buckets[0] ?? row.sectors?.[0] ?? "기타";
    const count = sectorCounts.get(primary) ?? 0;
    if (count >= 2 && selected.length < 8) continue;
    selected.push({ ...row, primaryBucket: primary });
    sectorCounts.set(primary, count + 1);
    if (selected.length === 10) break;
  }
  while (selected.length < 10 && rows[selected.length]) selected.push(rows[selected.length]);
  const raw = selected.map((row) => Math.max(1, row.v5.score - 55));
  const total = raw.reduce((sum, value) => sum + value, 0);
  let weights = raw.map((value) => round(value / total * 100, 1));
  const diff = round(100 - weights.reduce((sum, value) => sum + value, 0), 1);
  weights[0] = round(weights[0] + diff, 1);
  return selected.map((row, index) => ({
    rank: index + 1,
    ticker: row.ticker,
    company: row.company,
    weightPct: weights[index],
    score: row.v5.score,
    band: row.v5.band,
    marketCapEok: row.marketData.marketCapEok,
    latestClose: row.marketData.latestClose,
    postV4ShockPct: row.marketData.postV4ShockPct,
    flow20d: row.flow.d20,
    policyBuckets: row.policyFit.buckets,
    brokerTrend: summarizeBrokers(row),
    thesis: row.v5.thesis,
    riskMemo: row.v5.riskMemo,
    sourceUrl: row.marketData.sourceUrl
  }));
}

async function buildRecipientPerformance(recipient) {
  const history = await fetchForeignHistory(recipient.ticker, 14);
  const eventRow = closeOnOrAfter(history, recipient.eventDate);
  const latest = history.at(-1);
  return {
    ...recipient,
    latestDate: latest?.date ?? null,
    eventClose: eventRow?.close ?? null,
    latestClose: latest?.close ?? null,
    sinceEventReturnPct: eventRow?.close && latest?.close ? pctChange(eventRow.close, latest.close) : null,
    postV4ShockPct: pctChange(closeOnOrBefore(history, V4_CUTOFF_DATE)?.close, latest?.close),
    d5: calcWindow(history, 5, null),
    d20: calcWindow(history, 20, null),
    sourceUrl: `https://finance.naver.com/item/frgn.naver?code=${recipient.ticker}`
  };
}

function buildResidualCapacity(fund) {
  const totalTarget = fund.fundingPlan.annual2026.totalTn;
  const officialApproved = fund.cumulative.officialApprovedTn;
  const methods = fund.fundingPlan.annual2026.methods.map((method) => {
    const approved = method.approvedTn ?? 0;
    return {
      id: method.id,
      name: method.name,
      targetTn: method.targetTn,
      approvedTn: method.approvedTn,
      residualTn: round(method.targetTn - approved, 2),
      fundApprovedTn: method.fundApprovedTn,
      status: method.status,
      lead: method.lead
    };
  });
  return {
    asOf: fund.cumulative.asOf,
    totalTargetTn: totalTarget,
    officialApprovedTn: officialApproved,
    residualTn: round(totalTarget - officialApproved, 2),
    officialFundApprovedTn: fund.cumulative.officialFundApprovedTn,
    methods,
    note: "간접투자 7조원은 공식 누적 승인액 표에 아직 별도 승인액으로 잡히지 않았다. 국민참여형 0.72조원과 정책성펀드 1차 GP 3.9조원은 조성·펀드레이징 단계로 분리해 봐야 한다."
  };
}

function buildStrategy(market, residual) {
  return [
    `잔여 공식 집행여력은 ${formatMoney(residual.residualTn)}이며 직접투자 ${formatMoney(1)}, 인프라투융자 ${formatMoney(3.4)}, 저리대출 ${formatMoney(6.09)}, 간접투자 ${formatMoney(7)}이 다음 모멘텀 풀이다.`,
    `코스닥은 4월 고점 이후 조정과 6월 8일 급락을 거쳤으므로, 정책 선정 가능성만 보지 말고 급락 후 외국인·기관이 재매수하는 종목을 우선한다.`,
    "진입은 40% 즉시, 30% 5거래일 안정화, 30% 정책 이벤트 또는 수급 재확인 후로 나누고, 단일 종목 14%를 넘기지 않는다.",
    "선정기업 주가 반응은 대형주와 소형주의 차이가 크다. 대형 수혜주는 테마 확산 신호로 보고, 포트폴리오는 미선정 중소형 공급망 후보에 둔다.",
    "국민성장펀드 선정 공시가 나오면 기대수익의 일부가 소멸하므로, 발표 갭상승 구간에서는 비중을 줄이고 다음 미선정 후보로 회전한다."
  ];
}

async function fetchMarketSnapshot() {
  const [kospi, kosdaq] = await Promise.all([fetchIndex("KOSPI"), fetchIndex("KOSDAQ")]);
  return {
    date: RUN_DATE,
    kospi,
    kosdaq,
    context: "2026년 6월 8일 후보군 다수가 급락했다. v5는 v4 산출일 2026년 5월 29일 이후 낙폭을 별도 점수로 반영한다.",
    articleRefs: [
      {
        title: "연합뉴스, 코스피 8,000 돌파 후 6.12% 급락 보도",
        url: "https://www.yna.co.kr/amp/view/AKR20260509049752008"
      },
      {
        title: "Daum/머니투데이, 코스닥 4월 고점 이후 18% 하락 및 국민참여성장펀드 수급 전망",
        url: "https://v.daum.net/v/20260607050301978"
      }
    ]
  };
}

async function fetchIndex(code) {
  const url = `https://finance.naver.com/sise/sise_index.naver?code=${code}`;
  const html = await fetchText(url);
  const now = strip(html.match(/id=["']now_value["'][^>]*>([\s\S]*?)<\/em>/)?.[1]);
  const quotientClass = html.match(/<div class="quotient\s+([^"]*)"/)?.[1] ?? "";
  const changeStart = html.indexOf("change_value_and_rate");
  const changeEnd = changeStart >= 0 ? html.indexOf("</div>", changeStart) : -1;
  const changeText = changeStart >= 0 && changeEnd > changeStart ? strip(html.slice(changeStart, changeEnd)) : "";
  const values = changeText.match(/[-+]?\d[\d,.]*/g) ?? [];
  const sign = quotientClass.includes("dn") ? "-" : quotientClass.includes("up") ? "+" : "";
  const change = values.length >= 2 ? `${sign}${values[0]} (${values[1].startsWith("-") || values[1].startsWith("+") ? values[1] : sign + values[1]}%)` : changeText;
  return { code, now, change, sourceUrl: url };
}

async function fetchForeignHistory(ticker, pages) {
  const rows = [];
  for (let page = 1; page <= pages; page += 1) {
    const html = await fetchText(`https://finance.naver.com/item/frgn.naver?code=${ticker}&page=${page}`);
    const table = extractTableByCaption(html, "외국인 기관 순매매 거래량");
    if (!table) continue;
    const trMatches = table.match(/<tr onMouseOver[\s\S]*?<\/tr>/g) ?? [];
    for (const tr of trMatches) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => strip(match[1]));
      if (cells.length !== 9 || !/^\d{4}\.\d{2}\.\d{2}$/.test(cells[0])) continue;
      const close = parseNumber(cells[1]);
      const inst = parseNumber(cells[5]);
      const foreign = parseNumber(cells[6]);
      rows.push({
        date: cells[0].replaceAll(".", "-"),
        close,
        changePct: parseFloat(cells[3].replace("%", "")),
        volume: parseNumber(cells[4]),
        institutionNetShares: inst,
        foreignNetShares: foreign,
        foreignHoldingShares: parseNumber(cells[7]),
        foreignHoldingRatePct: parseFloat(cells[8].replace("%", "")),
        institutionNetValueEok: close && inst != null ? round(close * inst / 100_000_000, 2) : null,
        foreignNetValueEok: close && foreign != null ? round(close * foreign / 100_000_000, 2) : null
      });
    }
    await sleep(35);
  }
  const dedup = new Map(rows.map((row) => [row.date, row]));
  return [...dedup.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchBrokers(ticker, day) {
  const html = await fetchText(`https://finance.naver.com/item/frgn.naver?code=${ticker}&page=1&trader_day=${day}`);
  const table = extractTableByCaption(html, "거래원정보");
  if (!table) return null;
  const chunks = table.split(/<tr/).slice(1).map((chunk) => "<tr" + chunk);
  const buyTop = [];
  const sellTop = [];
  let foreignEstimate = null;
  for (const tr of chunks) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => strip(match[1]));
    if (cells.length === 4 && cells[0] === "외국계추정합") {
      foreignEstimate = { sell: parseNumber(cells[1]), net: parseNumber(cells[2]), buy: parseNumber(cells[3]) };
      continue;
    }
    if (cells.length === 4 && cells[0] && cells[2]) {
      sellTop.push({ name: cells[0], volume: parseNumber(cells[1]), foreign: isForeignBroker(cells[0]) });
      buyTop.push({ name: cells[2], volume: parseNumber(cells[3]), foreign: isForeignBroker(cells[2]) });
    }
  }
  return { day, buyTop: buyTop.slice(0, 5), sellTop: sellTop.slice(0, 5), foreignEstimate };
}

function calcWindow(history, n, marketCapEok) {
  const rows = history.slice(-n);
  if (!rows.length) {
    return emptyWindow();
  }
  const first = rows[0];
  const last = rows.at(-1);
  const foreignNetValueEok = sum(rows.map((row) => row.foreignNetValueEok));
  const institutionNetValueEok = sum(rows.map((row) => row.institutionNetValueEok));
  return {
    days: rows.length,
    startDate: first.date,
    endDate: last.date,
    priceReturnPct: pctChange(first.close, last.close),
    foreignNetValueEok,
    institutionNetValueEok,
    foreignValueToMarketCapPct: marketCapEok ? round(foreignNetValueEok / marketCapEok * 100, 4) : null,
    institutionValueToMarketCapPct: marketCapEok ? round(institutionNetValueEok / marketCapEok * 100, 4) : null,
    latestForeignHoldingRatePct: last.foreignHoldingRatePct
  };
}

function emptyWindow() {
  return {
    days: 0,
    startDate: null,
    endDate: null,
    priceReturnPct: null,
    foreignNetValueEok: 0,
    institutionNetValueEok: 0,
    foreignValueToMarketCapPct: null,
    institutionValueToMarketCapPct: null,
    latestForeignHoldingRatePct: null
  };
}

function summarizeBrokers(row) {
  const d5 = row.brokers?.d5;
  if (!d5) return "거래원 미확인";
  const foreign = d5.foreignEstimate?.net;
  const buy = d5.buyTop?.slice(0, 2).map((item) => item.name).join(", ");
  const sell = d5.sellTop?.slice(0, 2).map((item) => item.name).join(", ");
  const side = foreign == null ? "외국계 추정 없음" : foreign > 0 ? `외국계 +${foreign.toLocaleString("ko-KR")}주` : `외국계 ${foreign.toLocaleString("ko-KR")}주`;
  return `${side}. 매수 ${buy || "-"} / 매도 ${sell || "-"}`;
}

function buildSources() {
  return [
    { title: "금융위원회, 5월 28일 누적 16건 12.5조원 승인", url: "https://www.fsc.go.kr/no010101/87003" },
    { title: "금융위원회, 국민참여형 국민성장펀드 및 2026년 30조 운용계획", url: "https://www.fsc.go.kr/po010101/86834" },
    { title: "Naver Finance 외국인·기관 순매매 및 거래원정보", url: "https://finance.naver.com/" },
    { title: "Daum/머니투데이, 코스닥 고점 이후 18% 하락과 국민참여성장펀드 전망", url: "https://v.daum.net/v/20260607050301978" },
    { title: "연합뉴스, 코스피 8,000 돌파 후 급락 보도", url: "https://www.yna.co.kr/amp/view/AKR20260509049752008" }
  ];
}

function buildHtml(data) {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll("</script", "<\\/script");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.meta.title)}</title>
  <style>
    :root { color-scheme: light; --bg:#f4f6f8; --ink:#151b24; --muted:#647181; --line:#d8dee7; --surface:#fff; --nav:#17202b; --green:#0b6b5d; --blue:#2d5ea8; --gold:#986515; --red:#8d3a35; --violet:#654aa0; --soft:#eef2f6; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:"Segoe UI","Malgun Gothic",Arial,sans-serif; line-height:1.5; }
    a { color: inherit; }
    button,input { font:inherit; }
    .layout { min-height:100vh; display:grid; grid-template-columns:320px minmax(0,1fr); }
    aside { position:sticky; top:0; height:100vh; overflow:auto; padding:24px 20px; background:var(--nav); color:#f8fafc; }
    main { min-width:0; padding:28px; }
    h1,h2,h3,h4,p { margin-top:0; }
    h1 { font-size:22px; line-height:1.25; letter-spacing:0; }
    h2 { font-size:30px; line-height:1.2; letter-spacing:0; margin-bottom:8px; }
    h3 { font-size:17px; letter-spacing:0; margin-bottom:10px; }
    h4 { font-size:14px; letter-spacing:0; margin-bottom:8px; }
    .brand p,.muted { color:var(--muted); }
    aside .brand p { color:#cbd5df; font-size:13px; }
    .side-box { display:grid; gap:7px; margin:16px 0; padding:13px; border:1px solid rgba(255,255,255,.12); border-radius:8px; background:rgba(255,255,255,.06); color:#d8e1eb; font-size:12px; }
    .nav-list { display:grid; gap:7px; margin:0; padding:0; list-style:none; }
    .nav-link { display:grid; grid-template-columns:1fr auto; align-items:center; min-height:38px; padding:8px 10px; border:1px solid rgba(255,255,255,.12); border-radius:8px; background:rgba(255,255,255,.05); color:#f8fafc; text-decoration:none; font-size:13px; font-weight:800; }
    .nav-link:hover { background:#fff; color:var(--ink); }
    .tag,.badge { display:inline-flex; align-items:center; min-height:24px; padding:3px 8px; border-radius:999px; font-size:12px; font-weight:800; white-space:nowrap; }
    .tag { background:rgba(255,255,255,.12); color:#e5edf7; }
    .badge.high { background:#e5f3f0; color:var(--green); }
    .badge.medium { background:#e8eef9; color:var(--blue); }
    .badge.watch { background:#fff2db; color:var(--gold); }
    .badge.risk { background:#f7e8e6; color:var(--red); }
    .hero,.band { border:1px solid var(--line); border-radius:8px; background:var(--surface); }
    .hero { padding:28px; margin-bottom:16px; display:grid; grid-template-columns:minmax(0,1.35fr) minmax(300px,.9fr); gap:20px; }
    .kicker { margin-bottom:9px; color:var(--green); font-size:13px; font-weight:900; }
    .hero p { color:var(--muted); }
    .metrics { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:12px; margin-bottom:16px; }
    .metric { min-height:108px; padding:16px; border:1px solid var(--line); border-radius:8px; background:#fff; }
    .metric strong { display:block; font-size:27px; line-height:1.1; }
    .metric span { display:block; margin-top:6px; color:var(--muted); font-size:12px; }
    .band { padding:18px; margin-bottom:16px; }
    .head { display:flex; gap:12px; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }
    .head p { max-width:900px; margin-bottom:0; color:var(--muted); font-size:13px; }
    .grid-2 { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; }
    .grid-3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .card { padding:14px; border:1px solid var(--line); border-radius:8px; background:#fbfcfd; }
    .card p { margin-bottom:0; color:var(--muted); font-size:12px; }
    .toolbar { display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .segmented { display:flex; flex-wrap:wrap; gap:6px; }
    .segmented button { min-height:34px; padding:5px 10px; border:1px solid var(--line); border-radius:8px; background:#fbfcfd; cursor:pointer; font-size:13px; font-weight:800; }
    .segmented button.active { border-color:var(--green); background:#e5f3f0; color:var(--green); }
    .search { width:min(360px,100%); min-height:36px; padding:7px 10px; border:1px solid var(--line); border-radius:8px; background:#fff; }
    .table-wrap { overflow:auto; border:1px solid var(--line); border-radius:8px; background:#fff; }
    table { width:100%; min-width:1320px; border-collapse:collapse; }
    th,td { padding:10px 11px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; font-size:13px; }
    th { position:sticky; top:0; z-index:1; background:#eef2f6; color:#334052; }
    tr:last-child td { border-bottom:0; }
    .num { font-variant-numeric:tabular-nums; white-space:nowrap; }
    .company { font-weight:900; }
    .note { display:block; margin-top:5px; color:var(--muted); font-size:12px; line-height:1.42; }
    .bar { height:12px; overflow:hidden; border-radius:999px; background:var(--soft); }
    .bar-fill { height:100%; border-radius:inherit; background:var(--green); }
    .source-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
    .source-list a { min-height:60px; padding:11px 12px; border:1px solid var(--line); border-radius:8px; background:#fbfcfd; text-decoration:none; font-size:13px; }
    .source-list span { display:block; margin-top:4px; color:var(--muted); font-size:12px; }
    footer { color:var(--muted); font-size:12px; }
    @media (max-width:1180px){ .layout{grid-template-columns:1fr;} aside{position:static;height:auto;} .metrics{grid-template-columns:repeat(2,minmax(0,1fr));} .hero,.grid-2,.grid-3{grid-template-columns:1fr;} }
    @media (max-width:720px){ main{padding:16px;} aside{padding:18px;} .metrics{grid-template-columns:1fr;} h2{font-size:24px;} .head{display:block;} }
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand">
        <h1>${escapeHtml(data.meta.title)}</h1>
        <p>잔여 집행력, 선정기업 주가 반응, 미선정 후보 재평가, 거래원 트렌드</p>
      </div>
      <div class="side-box">
        <span>기준일: ${escapeHtml(data.meta.runDate)}</span>
        <span>거래일: ${escapeHtml(data.meta.currentTradingDate)}</span>
        <span>후보: ${data.meta.totalCandidates}개</span>
        <span>포트폴리오: 10개</span>
      </div>
      <nav class="nav-list">
        <a class="nav-link" href="#overview"><span>요약</span><span class="tag">KPI</span></a>
        <a class="nav-link" href="#residual"><span>잔여 집행력</span><span class="tag">17.5조</span></a>
        <a class="nav-link" href="#recipients"><span>선정기업 주가</span><span class="tag">Event</span></a>
        <a class="nav-link" href="#portfolio"><span>포트폴리오</span><span class="tag">Top 10</span></a>
        <a class="nav-link" href="#ranked"><span>재평가 후보</span><span class="tag">v5</span></a>
        <a class="nav-link" href="#sources"><span>출처</span><span class="tag">Sources</span></a>
      </nav>
    </aside>
    <main>
      <section class="hero" id="overview">
        <div>
          <p class="kicker">v5 Portfolio Dashboard</p>
          <h2>급락 이후에도 잔여 정책자금이 향할 가능성이 높은 미선정 공급망 후보를 다시 점수화했습니다.</h2>
          <p>${escapeHtml(data.meta.disclosure)}</p>
        </div>
        <div class="grid-2">
          <div class="card"><h4>KOSPI</h4><p><strong>${escapeHtml(data.market.kospi.now ?? "-")}</strong></p><p>${escapeHtml(data.market.kospi.change ?? "")}</p></div>
          <div class="card"><h4>KOSDAQ</h4><p><strong>${escapeHtml(data.market.kosdaq.now ?? "-")}</strong></p><p>${escapeHtml(data.market.kosdaq.change ?? "")}</p></div>
        </div>
      </section>
      <section class="metrics" id="metrics"></section>
      <section class="band" id="residual">
        <div class="head"><div><h3>잔여 집행력과 다음 모멘텀 풀</h3><p>${escapeHtml(data.residual.note)}</p></div></div>
        <div class="grid-2">
          <div class="card" id="residualBars"></div>
          <div class="card"><h4>전략</h4><ul id="strategyList"></ul></div>
        </div>
      </section>
      <section class="band" id="recipients">
        <div class="head"><div><h3>이미 선정된 상장기업 주가 반응</h3><p>투자·대출 승인일 이후의 주가 변화와 v4 이후 급락 구간을 분리했습니다. 비상장 직접투자는 테마 확산 신호로만 사용했습니다.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>기업</th><th>승인 이벤트</th><th>승인일 종가</th><th>현재</th><th>승인 후</th><th>v4 이후</th><th>5일 수급</th></tr></thead><tbody id="recipientRows"></tbody></table></div>
      </section>
      <section class="band" id="portfolio">
        <div class="head"><div><h3>기대값 상위 10개 포트폴리오</h3><p>비중은 v5 점수, 정책자금 잔여 버킷, 급락 후 가격 매력, 외국인·기관 수급, 거래원 트렌드를 함께 반영했습니다.</p></div></div>
        <div class="table-wrap"><table><thead><tr><th>순위</th><th>기업</th><th>비중</th><th>v5</th><th>가격/시총</th><th>수급</th><th>거래원</th><th>투자 논리</th><th>리스크</th></tr></thead><tbody id="portfolioRows"></tbody></table></div>
      </section>
      <section class="band" id="ranked">
        <div class="toolbar">
          <div><h3 style="margin-bottom:4px;">v4 후보 재평가 테이블</h3><p class="muted" style="margin-bottom:0;font-size:13px;">검색과 등급 필터로 후보를 좁힐 수 있습니다.</p></div>
          <input class="search" id="search" type="search" placeholder="회사, 티커, 섹터 검색">
        </div>
        <div class="segmented" id="filters"></div>
        <div class="table-wrap"><table><thead><tr><th>순위</th><th>회사</th><th>등급</th><th>v5 점수</th><th>정책 버킷</th><th>v4 이후</th><th>20일 수급</th><th>거래원</th><th>메모</th></tr></thead><tbody id="rankRows"></tbody></table></div>
      </section>
      <section class="band" id="sources">
        <div class="head"><div><h3>출처</h3><p>Naver Finance는 종목별 시세, 외국인·기관 순매매, 거래원정보 확인용입니다.</p></div></div>
        <div class="source-list" id="sourceList"></div>
      </section>
      <footer>생성 스크립트: <code>node scripts/build-v5-portfolio.mjs</code>. 데이터: <code>data/v5-portfolio-data.json</code>.</footer>
    </main>
  </div>
  <script>
    const DATA = ${json};
    let filter = "all";
    let search = "";
    const filters = document.querySelector("#filters");
    const rankRows = document.querySelector("#rankRows");
    document.querySelector("#metrics").innerHTML = [
      ["잔여 승인여력", money(DATA.residual.residualTn), "2026년 목표 30조 대비"],
      ["직접투자 잔여", money(DATA.residual.methods.find(m => m.id === "direct").residualTn), "미선정 AI·로봇·반도체 후보"],
      ["간접투자 풀", money(DATA.residual.methods.find(m => m.id === "indirect").targetTn), "국민참여형·정책성펀드"],
      ["저리대출 잔여", money(DATA.residual.methods.find(m => m.id === "loan").residualTn), "전력망·설비투자"],
      ["최상위 후보", DATA.portfolio[0]?.company ?? "-", "v5 " + (DATA.portfolio[0]?.score ?? "-")]
    ].map(([a,b,c]) => \`<div class="metric"><strong>\${escapeHtml(b)}</strong><span>\${escapeHtml(a)} · \${escapeHtml(c)}</span></div>\`).join("");
    document.querySelector("#residualBars").innerHTML = \`<h4>방식별 잔여</h4>\${DATA.residual.methods.map(m => \`<p><strong>\${escapeHtml(m.name)}</strong> \${money(m.residualTn)} <span class="note">목표 \${money(m.targetTn)} / 승인 \${m.approvedTn == null ? "별도 집계 전" : money(m.approvedTn)}</span></p><div class="bar"><div class="bar-fill" style="width:\${Math.max(0, Math.min(100, (m.approvedTn || 0) / m.targetTn * 100))}%"></div></div>\`).join("")}\`;
    document.querySelector("#strategyList").innerHTML = DATA.strategy.map(item => \`<li>\${escapeHtml(item)}</li>\`).join("");
    document.querySelector("#recipientRows").innerHTML = DATA.recipientPerformance.map(row => \`<tr><td><span class="company">\${escapeHtml(row.company)}</span><span class="note">\${escapeHtml(row.ticker)}\${row.proxy ? " · 프록시" : ""}</span></td><td>\${escapeHtml(row.event)}<span class="note">\${escapeHtml(row.eventDate)}</span></td><td class="num">\${price(row.eventClose)}</td><td class="num">\${price(row.latestClose)}<span class="note">\${escapeHtml(row.latestDate)}</span></td><td class="num">\${pct(row.sinceEventReturnPct)}</td><td class="num">\${pct(row.postV4ShockPct)}</td><td>외국인 \${money(row.d5.foreignNetValueEok, "억")}<span class="note">기관 \${money(row.d5.institutionNetValueEok, "억")}</span></td></tr>\`).join("");
    document.querySelector("#portfolioRows").innerHTML = DATA.portfolio.map(row => \`<tr><td class="num">\${row.rank}</td><td><span class="company">\${escapeHtml(row.company)}</span><span class="note">\${escapeHtml(row.ticker)}</span></td><td><strong>\${row.weightPct}%</strong><div class="bar"><div class="bar-fill" style="width:\${row.weightPct * 5}%"></div></div></td><td><span class="badge \${row.band.toLowerCase()}">\${row.score}</span></td><td class="num">\${price(row.latestClose)}<span class="note">시총 \${money(row.marketCapEok, "억")}, v4 이후 \${pct(row.postV4ShockPct)}</span></td><td>외국인 \${pct(row.flow20d.foreignValueToMarketCapPct)}<span class="note">기관 \${pct(row.flow20d.institutionValueToMarketCapPct)}</span></td><td>\${escapeHtml(row.brokerTrend)}</td><td>\${escapeHtml(row.thesis)}</td><td>\${escapeHtml(row.riskMemo)}</td></tr>\`).join("");
    function renderFilters(){ const values=["all","High","Medium","Watch"]; filters.innerHTML=values.map(v=>\`<button class="\${filter===v?"active":""}" data-filter="\${v}">\${v==="all"?"전체":v}</button>\`).join(""); filters.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;renderFilters();renderRanks();})); }
    function renderRanks(){ const needle=search.trim().toLowerCase(); const rows=DATA.rankedCandidates.filter(row => (filter==="all"||row.v5.band===filter) && (!needle || [row.company,row.ticker,...row.sectors,...row.policyFit.buckets].join(" ").toLowerCase().includes(needle))).slice(0,60); rankRows.innerHTML=rows.map((row,i)=>\`<tr><td class="num">\${i+1}</td><td><span class="company">\${escapeHtml(row.company)}</span><span class="note">\${escapeHtml(row.ticker)} · \${escapeHtml(row.sectors.slice(0,2).join(", "))}</span></td><td><span class="badge \${row.v5.band.toLowerCase()}">\${row.v5.band}</span></td><td><strong>\${row.v5.score}</strong><span class="note">v4 \${row.v4.totalScore}</span></td><td>\${escapeHtml(row.policyFit.buckets.join(" / "))}</td><td class="num">\${pct(row.marketData.postV4ShockPct)}<span class="note">\${price(row.marketData.latestClose)}</span></td><td>외국인 \${pct(row.flow.d20.foreignValueToMarketCapPct)}<span class="note">기관 \${pct(row.flow.d20.institutionValueToMarketCapPct)}</span></td><td>\${escapeHtml(summarize(row))}</td><td>\${escapeHtml(row.v5.thesis)}<span class="note">\${escapeHtml(row.v5.riskMemo)}</span></td></tr>\`).join(""); }
    document.querySelector("#search").addEventListener("input", e => { search = e.target.value; renderRanks(); });
    document.querySelector("#sourceList").innerHTML = DATA.sources.map(s => \`<a href="\${escapeHtml(s.url)}" target="_blank" rel="noreferrer"><strong>\${escapeHtml(s.title)}</strong><span>\${escapeHtml(s.url)}</span></a>\`).join("");
    function summarize(row){ const d5=row.brokers?.d5; if(!d5) return "거래원 미확인"; const buy=(d5.buyTop||[]).slice(0,2).map(x=>x.name).join(", "); const sell=(d5.sellTop||[]).slice(0,2).map(x=>x.name).join(", "); const net=d5.foreignEstimate?.net; return \`\${net==null?"외국계 -": "외국계 " + net.toLocaleString("ko-KR") + "주"} · 매수 \${buy} / 매도 \${sell}\`; }
    function money(v, unit="조"){ if(v==null||Number.isNaN(Number(v))) return "-"; if(unit==="억") return Number(v).toLocaleString("ko-KR",{maximumFractionDigits:1})+"억원"; return Math.abs(Number(v))>=1 ? Number(v).toLocaleString("ko-KR",{maximumFractionDigits:2})+"조원" : (Number(v)*10000).toLocaleString("ko-KR",{maximumFractionDigits:0})+"억원"; }
    function price(v){ return v==null ? "-" : Number(v).toLocaleString("ko-KR")+"원"; }
    function pct(v){ return v==null||Number.isNaN(Number(v)) ? "-" : Number(v).toLocaleString("ko-KR",{maximumFractionDigits:1})+"%"; }
    function escapeHtml(v){ return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
    renderFilters(); renderRanks();
  </script>
</body>
</html>`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return new TextDecoder("euc-kr").decode(await response.arrayBuffer());
}

function extractTableByCaption(html, captionText) {
  const captionIndex = html.indexOf(`<caption>${captionText}</caption>`);
  if (captionIndex < 0) return null;
  const start = html.lastIndexOf("<table", captionIndex);
  const end = html.indexOf("</table>", captionIndex);
  if (start < 0 || end < 0) return null;
  return html.slice(start, end + 8);
}

function strip(value) {
  return String(value ?? "")
    .replace(/<span class="blind">([\s\S]*?)<\/span>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  const text = String(value ?? "").replace(/[,+%\s]/g, "");
  if (!text || text === "-") return null;
  return Number(text);
}

function closeOnOrBefore(history, date) {
  return [...history].reverse().find((row) => row.date <= date) ?? null;
}

function closeOnOrAfter(history, date) {
  return history.find((row) => row.date >= date) ?? null;
}

function pctChange(from, to) {
  if (from == null || to == null || !from) return null;
  return round((to - from) / from * 100, 4);
}

function sum(values) {
  return round(values.reduce((acc, value) => acc + (Number(value) || 0), 0), 2);
}

function round(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const unit = 10 ** digits;
  return Math.round(Number(value) * unit) / unit;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function firstExisting(rows, pathParts) {
  for (const row of rows) {
    let current = row;
    for (const part of pathParts) current = current?.[part];
    if (current !== undefined && current !== null) return current;
  }
  return null;
}

function isForeignBroker(name) {
  return /제이피모간|모간|메릴|UBS|씨티|노무라|CS|골드만|홍콩|맥쿼리|다이와|SG/.test(name ?? "");
}

function formatMoney(value) {
  if (value == null) return "-";
  return Math.abs(value) >= 1 ? `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}조원` : `${(value * 10000).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}억원`;
}

function formatPct(value) {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
