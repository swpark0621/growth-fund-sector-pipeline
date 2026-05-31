import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "sectors.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const THRESHOLD_EOK = 3000;
const NEAR_THRESHOLD_EOK = 3500;
const RUN_DATE = "2026-05-31";

data.meta.version = "v2";
data.meta.lastUpdated = RUN_DATE;
data.meta.threshold = "시가총액 또는 기업가치 3000억원 이하";
data.meta.v2Rule =
  "국민성장펀드 공식 산업 적합성과 3000억원 이하 필터를 분리합니다. 3000억원 초과 기업은 삭제하지 않고 추적/제외로 구분해 유망 기업 누락을 줄입니다.";
data.meta.screeningPrompt =
  "섹터별로 선별해 작업 범위를 줄이고, 확인 가능한 시총·기업가치 출처가 없는 수치는 만들지 않습니다. 불확실한 항목은 확인 필요로 둡니다.";
data.meta.marketCapAsOf = `${data.meta.marketCapAsOf} / v2 산출일 ${RUN_DATE}`;

data.v2ScreeningModel = {
  purpose:
    "공식 정책 적합성, 3000억원 이하 여부, 기술·밸류체인 직접성, 성장 촉매, 신규자금 유입 가능성을 분리해 후보를 좁힙니다.",
  thresholdEok: THRESHOLD_EOK,
  nearThresholdEok: NEAR_THRESHOLD_EOK,
  classifications: {
    A: "공식 적합성이 높고 3000억원 이하가 확인된 후보",
    B: "공식 적합성은 높으나 시총·기업가치 확인이 필요한 후보",
    C: "3000억원 이하이나 정책 적합성 또는 투자 명분이 약한 후보",
    제외: "3000억원 초과 또는 근거 부족 후보"
  },
  scoreWeights: {
    policyFit: 35,
    valuationThreshold: 20,
    valueChainDirectness: 20,
    growthCatalyst: 15,
    investability: 10
  },
  sourceRule:
    "상장사는 marketCapAsOf 기준 시총을 사용하고, 비상장사는 최근 투자유치 기준 기업가치를 별도 확인합니다. 확인 불가 시 B 또는 확인 필요로 분리합니다."
};

let total = 0;
let under = 0;
let over = 0;
let unknown = 0;

for (const sector of data.sectors ?? []) {
  let sectorUnder = 0;
  let sectorOver = 0;
  let sectorUnknown = 0;

  for (const candidate of sector.candidates ?? []) {
    total += 1;
    const marketCapEok = parseMarketCapEok(candidate.marketCap);
    const valuationStatus = classifyValuation(marketCapEok);
    const validation = candidate.investmentValidation?.finalValidation ?? "Watch";
    const scoreBreakdown = buildScore(candidate, marketCapEok, validation);
    const score = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
    const classification = classifyCandidate(candidate, marketCapEok, validation);
    const retention = retentionLabel(candidate, marketCapEok, validation);

    if (marketCapEok == null) {
      unknown += 1;
      sectorUnknown += 1;
    } else if (marketCapEok <= THRESHOLD_EOK) {
      under += 1;
      sectorUnder += 1;
    } else {
      over += 1;
      sectorOver += 1;
    }

    candidate.v2Screening = {
      classification,
      score,
      scoreBreakdown,
      valuationStatus,
      marketCapEok,
      thresholdEok: THRESHOLD_EOK,
      nearThreshold:
        marketCapEok != null &&
        Math.abs(marketCapEok - THRESHOLD_EOK) <= 500,
      retention,
      verification: verificationText(classification, valuationStatus, retention),
      source: {
        type: candidate.market === "비상장" ? "valuation" : "marketCap",
        basis: data.meta.marketCapAsOf,
        confidence: marketCapEok == null ? "확인 필요" : "기존 데이터 확인"
      },
      promptVerdict: promptVerdict(candidate, classification, valuationStatus, validation)
    };
  }

  sector.v2Summary = {
    underThreshold: sectorUnder,
    overThreshold: sectorOver,
    unknownValuation: sectorUnknown,
    priorityCandidates: (sector.candidates ?? [])
      .filter((candidate) => candidate.v2Screening?.classification === "A")
      .map((candidate) => candidate.company),
    trackingCandidates: (sector.candidates ?? [])
      .filter((candidate) => candidate.v2Screening?.retention !== "최종 후보")
      .map((candidate) => candidate.company)
  };
}

data.meta.v2Summary = {
  totalCandidates: total,
  underThreshold: under,
  overThreshold: over,
  unknownValuation: unknown,
  note: "3000억원 초과 기업은 최종 후보에서 제외하되, 섹터 대표성이나 정책 적합성이 높은 경우 추적 후보로 유지합니다."
};

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(
  `v2 screening enriched: ${total} candidates, ${under} under/equal ${THRESHOLD_EOK}억원, ${over} over, ${unknown} unknown`
);

function parseMarketCapEok(value) {
  const text = String(value ?? "").replaceAll(",", "").trim();
  if (!text || text.includes("확인")) return null;

  let totalEok = 0;
  const joMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*조/);
  if (joMatch) totalEok += Number(joMatch[1]) * 10000;

  const eokMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*억/);
  if (eokMatch) totalEok += Number(eokMatch[1]);

  if (!joMatch && !eokMatch) {
    const numeric = Number(text.replace(/[^0-9.]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  return totalEok > 0 ? Math.round(totalEok) : null;
}

function classifyValuation(marketCapEok) {
  if (marketCapEok == null) return "확인 필요";
  if (marketCapEok <= THRESHOLD_EOK) return "3000억원 이하 확인";
  if (marketCapEok <= NEAR_THRESHOLD_EOK) return "3000억원 초과 경계 재확인";
  return "3000억원 초과";
}

function classifyCandidate(candidate, marketCapEok, validation) {
  if (marketCapEok == null) return "B";
  if (marketCapEok > THRESHOLD_EOK) return "제외";
  if (validation === "Reconsider") return "C";
  return "A";
}

function retentionLabel(candidate, marketCapEok, validation) {
  if (marketCapEok == null) return "확인 필요";
  if (marketCapEok <= THRESHOLD_EOK && validation !== "Reconsider") return "최종 후보";
  if (marketCapEok <= THRESHOLD_EOK) return "정책성 재검토";
  if (marketCapEok <= NEAR_THRESHOLD_EOK) return "경계 추적";
  if (validation === "Strong") return "정책 적합 추적";
  return "제외/후순위";
}

function buildScore(candidate, marketCapEok, validation) {
  const catalyst = candidate.investmentValidation?.growthCatalyst?.probabilityPct;
  return {
    policyFit: policyScore(candidate, validation),
    valuationThreshold:
      marketCapEok == null ? 10 : marketCapEok <= THRESHOLD_EOK ? 20 : marketCapEok <= NEAR_THRESHOLD_EOK ? 8 : 0,
    valueChainDirectness: directnessScore(candidate, validation),
    growthCatalyst: typeof catalyst === "number" ? Math.round((Math.max(0, Math.min(100, catalyst)) / 100) * 15) : 8,
    investability: investabilityScore(candidate)
  };
}

function policyScore(candidate, validation) {
  const fit = `${candidate.fundFit ?? ""} ${candidate.investmentValidation?.policyFit ?? ""}`;
  let score = validation === "Strong" ? 30 : validation === "Watch" ? 24 : 13;
  if (fit.includes("상") || fit.includes("높")) score += 3;
  if (fit.includes("중")) score += 1;
  return Math.min(score, 35);
}

function directnessScore(candidate, validation) {
  const text = `${candidate.investmentValidation?.businessDirectness ?? ""} ${candidate.valueChain ?? ""}`;
  let score = validation === "Strong" ? 17 : validation === "Watch" ? 13 : 8;
  if (text.includes("직접") || text.includes("이상") || text.includes("높")) score += 2;
  if (text.includes("낮")) score -= 3;
  return Math.max(0, Math.min(score, 20));
}

function investabilityScore(candidate) {
  const urgency = candidate.urgency;
  const path = `${candidate.possiblePath ?? ""} ${candidate.capitalUse ?? ""}`;
  let score = urgency === "상" ? 7 : urgency === "중" ? 5 : 3;
  if (path.includes("신규") || path.includes("증자") || path.includes("메자닌") || path.includes("설비")) score += 2;
  if (path.includes("R&D") || path.includes("운전")) score += 1;
  return Math.min(score, 10);
}

function verificationText(classification, valuationStatus, retention) {
  if (classification === "A") return `${valuationStatus}. 검증 프롬프트 기준 유지 판정.`;
  if (classification === "B") return "시총 또는 기업가치 출처를 추가 확인해야 하므로 보류 판정.";
  if (classification === "C") return `${valuationStatus}. 정책 적합성 또는 신규자금 명분이 약해 보류 판정.`;
  return `${valuationStatus}. ${retention}으로 분리.`;
}

function promptVerdict(candidate, classification, valuationStatus, validation) {
  if (classification === "A") {
    return "유지: 3000억원 이하가 확인되고 공식 산업 적합성이 충분합니다.";
  }
  if (classification === "B") {
    return "보류: 공식 산업 적합성은 있으나 기업가치 또는 시총 확인이 필요합니다.";
  }
  if (classification === "C") {
    return "보류: 3000억원 이하이나 단순 테마성, 사업 직접성, 자금 명분을 추가 확인해야 합니다.";
  }
  if (valuationStatus === "3000억원 초과 경계 재확인") {
    return "제외: 기준은 초과하지만 경계값이므로 최신 시총 재확인 후 재분류할 수 있습니다.";
  }
  if (validation === "Strong") {
    return "제외: 정책 적합성은 높지만 3000억원 기준을 초과해 추적 후보로만 유지합니다.";
  }
  return "제외: 3000억원 초과 또는 근거 부족으로 최종 후보에서 제외합니다.";
}
