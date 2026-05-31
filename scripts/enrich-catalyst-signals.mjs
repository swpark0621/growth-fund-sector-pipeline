import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "sectors.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const catalystModel = {
  purpose:
    "기업별 성장 촉매의 현재 흐름, 실현확률, 지수 대비 예비 변동성 배수를 같은 산식으로 비교합니다.",
  probabilityFormula:
    "caseStatus, urgency, agent validation, sourceConfidence, valuationBurden를 가중합해 0~100으로 산출합니다. Strong은 최소 60점, Reconsider는 최대 45점으로 제한합니다.",
  trendMultipleFormula:
    "섹터 민감도, 시가총액 구간, 시급도, agent validation, 밸류에이션 부담을 반영한 예비 배수입니다. 실제 통계 베타가 아니며 가격 시계열이 들어오면 회귀 베타로 대체해야 합니다.",
  benchmarkRule:
    "코스닥 종목은 코스닥, 코스피 종목은 코스피를 비교지수로 보는 것을 기본값으로 둡니다.",
  exampleRule: "지수 5% 상승 시 예상 상대 움직임 = trendVolatilityMultiple * 5%"
};

const sectorThemes = {
  "ai-datacenter": ["AI 인프라", "데이터센터", "고전력", "냉각", "클라우드", "AI 반도체"],
  semiconductor: ["AI 반도체", "첨단 패키징", "테스트", "HBM", "파운드리", "IP"],
  "battery-materials": ["이차전지", "소재", "증설", "장기계약", "가동률", "원재료"],
  "bio-vaccine": ["바이오", "CDMO", "임상", "기술이전", "GMP", "현금 runway"],
  "defense-space": ["방산", "우주", "수주잔고", "양산", "국산화", "정부 프로젝트"],
  robotics: ["로봇", "스마트팩토리", "양산", "고객사", "수율", "자동화"],
  "hydrogen-energy": ["수소", "연료전지", "충전소", "수주", "가동률", "정책 인프라"],
  "future-mobility": ["미래차", "전장", "자율주행", "OEM 인증", "양산 수주", "SDV"],
  display: ["OLED", "디스플레이", "패널사 CAPEX", "수주잔고", "유리기판", "검사장비"],
  "content-ip": ["K-콘텐츠", "IP", "라이선스", "MD", "플랫폼", "해외 확장"],
  "power-grid": ["전력망", "HVDC", "한전 발주", "송배전", "수주", "원재료"],
  "core-minerals": ["핵심광물", "리튬", "니켈", "폐배터리", "재자원화", "오프테이크"]
};

const sectorSensitivity = {
  "ai-datacenter": 0.2,
  semiconductor: 0.18,
  "battery-materials": 0.2,
  "bio-vaccine": 0.28,
  "defense-space": 0.08,
  robotics: 0.3,
  "hydrogen-energy": 0.18,
  "future-mobility": 0.18,
  display: 0.16,
  "content-ip": 0.14,
  "power-grid": 0.1,
  "core-minerals": 0.24
};

const keywordMap = [
  [/IDC|데이터센터|클라우드|GPU|HPC/i, "데이터센터 증설"],
  [/액침|냉각|Chiller/i, "AI 냉각 병목"],
  [/비상발전|전력|송전|HVDC|수배전|배전|한전/i, "전력 인프라 발주"],
  [/반도체 IP|AI 반도체|ASIC|SoC|NPU|파운드리|디자인/i, "AI 반도체 설계"],
  [/패키징|테스트|프로브|HBM|후공정/i, "첨단 후공정 수요"],
  [/전해액|음극재|CNT|전해질|첨가제|배터리/i, "배터리 소재 증설"],
  [/리사이클링|폐배터리|블랙파우더|리튬|니켈|코발트/i, "핵심광물 순환공급망"],
  [/CDMO|GMP|백신|올리고/i, "바이오 제조 인프라"],
  [/임상|기술이전|파이프라인|RNA|신약/i, "임상·기술이전 이벤트"],
  [/방산|위성|우주|항공|센서|자이로/i, "방산·우주 양산"],
  [/로봇|감속기|AMR|모션|자동화/i, "로봇 양산·고객 확대"],
  [/수소|연료전지|충전소|MEA|탱크/i, "수소 인프라 수주"],
  [/자율주행|ADAS|전장|EV|릴레이|레이더|차량/i, "미래차 양산 수주"],
  [/OLED|디스플레이|증착|유리기판|패널/i, "디스플레이 CAPEX"],
  [/K-콘텐츠|애니메이션|VFX|콘텐츠|MD|OTT|버추얼 프로덕션/i, "콘텐츠 IP 수익화"]
];

function scoreFromMap(value, map, fallback = 0) {
  return Object.hasOwn(map, value) ? map[value] : fallback;
}

function marketCapBand(marketCap) {
  if (/조/.test(marketCap)) return "large";
  const match = marketCap.match(/([\d,]+)\s*억원/);
  if (!match) return "mid";
  const cap = Number(match[1].replaceAll(",", ""));
  if (cap < 1000) return "micro";
  if (cap < 3000) return "small";
  if (cap < 8000) return "mid";
  return "large-ish";
}

function valuationPenalty(burden) {
  return scoreFromMap(
    burden,
    {
      높음: -10,
      중상: -6,
      중간: -2,
      낮음: -4
    },
    -2
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function catalystKeywords(sector, candidate) {
  const text = [
    sector.name,
    candidate.valueChain,
    candidate.possiblePath,
    candidate.capitalUse,
    candidate.reason,
    candidate.urgencyReason,
    ...(candidate.nextChecks ?? [])
  ].join(" ");
  const mapped = keywordMap.filter(([pattern]) => pattern.test(text)).map(([, keyword]) => keyword);
  const direct = [
    candidate.valueChain,
    ...(candidate.nextChecks ?? []).slice(0, 3),
    ...(sectorThemes[sector.id] ?? []).slice(0, 3)
  ];
  return unique([...mapped, ...direct]).slice(0, 8);
}

function catalystScore(candidate) {
  const iv = candidate.investmentValidation;
  let score = 0;
  score += scoreFromMap(candidate.caseStatus, { "즉시 명분": 44, "조건부 명분": 32, "명분 약함": 20 });
  score += scoreFromMap(candidate.urgency, { 상: 10, 중: 5, 하: 0 });
  score += scoreFromMap(iv.finalValidation, { Strong: 24, Watch: 12, Reconsider: -2 });
  score += scoreFromMap(iv.sourceConfidence, { 높음: 10, 중간: 5, 낮음: 0 });
  score += valuationPenalty(iv.valuationBurden);

  if (iv.finalValidation === "Strong") score = Math.max(score, 60);
  if (iv.finalValidation === "Reconsider") score = Math.min(score, 45);
  return Math.round(clamp(score, 15, 90));
}

function probabilityGrade(score) {
  if (score >= 75) return "높음";
  if (score >= 60) return "중상";
  if (score >= 45) return "중간";
  return "낮음";
}

function currentFlow(score, candidate) {
  if (candidate.investmentValidation.finalValidation === "Reconsider" && score < 45) {
    return {
      label: "약세/후순위",
      score,
      rationale: "성장 촉매보다 직접성·재무·가격 부담 검증이 우선입니다."
    };
  }
  if (score >= 75) {
    return {
      label: "강한 긍정",
      score,
      rationale: "정책 적합성, 시급도, 사업 직접성이 함께 높아 현재 촉매 흐름이 강합니다."
    };
  }
  if (score >= 60) {
    return {
      label: "긍정",
      score,
      rationale: "확인된 촉매가 있으나 밸류에이션 또는 재무 리스크를 함께 봐야 합니다."
    };
  }
  if (score >= 45) {
    return {
      label: "중립/확인대기",
      score,
      rationale: "섹터 노출은 있으나 수주·매출 비중·CAPEX 확인이 더 필요합니다."
    };
  }
  return {
    label: "약세/후순위",
    score,
    rationale: "투자 촉매의 현재성이 낮거나 실적·자금조달 리스크가 더 큽니다."
  };
}

function trendMultiple(sector, candidate, score) {
  const iv = candidate.investmentValidation;
  let multiple = 0.82;
  multiple += sectorSensitivity[sector.id] ?? 0.12;
  multiple += scoreFromMap(candidate.urgency, { 상: 0.22, 중: 0.1, 하: -0.05 });
  multiple += scoreFromMap(iv.finalValidation, { Strong: 0.18, Watch: 0.04, Reconsider: -0.12 });
  multiple += scoreFromMap(marketCapBand(candidate.marketCap), {
    micro: 0.34,
    small: 0.24,
    mid: 0.14,
    "large-ish": 0.08,
    large: 0.22
  });
  multiple += scoreFromMap(iv.valuationBurden, { 높음: 0.22, 중상: 0.14, 중간: 0.04, 낮음: 0.12 });
  if (score < 45) multiple -= 0.1;
  if (score >= 75) multiple += 0.12;

  return Number(clamp(multiple, 0.55, 2.3).toFixed(2));
}

function sensitivityLabel(multiple) {
  if (multiple >= 1.7) return "고베타";
  if (multiple >= 1.25) return "시장대비 민감";
  if (multiple >= 0.85) return "시장 유사";
  return "방어적/저민감";
}

for (const sector of data.sectors ?? []) {
  for (const candidate of sector.candidates ?? []) {
    const score = catalystScore(candidate);
    const multiple = trendMultiple(sector, candidate, score);
    const benchmark = candidate.market === "코스피" ? "코스피" : "코스닥";
    const keywords = catalystKeywords(sector, candidate);
    candidate.investmentValidation.growthCatalyst = {
      keywords,
      currentFlow: currentFlow(score, candidate),
      probabilityPct: score,
      probabilityGrade: probabilityGrade(score),
      probabilityDrivers: [
        `명분: ${candidate.caseStatus}`,
        `시급도: ${candidate.urgency}`,
        `투자 validation: ${candidate.investmentValidation.finalValidation}`,
        `근거 신뢰도: ${candidate.investmentValidation.sourceConfidence}`,
        `밸류 부담: ${candidate.investmentValidation.valuationBurden}`
      ]
    };
    candidate.investmentValidation.trendSensitivity = {
      benchmark,
      multiple,
      label: sensitivityLabel(multiple),
      expectedMoveIfBenchmarkUp5Pct: `${Number((multiple * 5).toFixed(1))}%`,
      expectedMoveIfBenchmarkDown5Pct: `${Number((-multiple * 5).toFixed(1))}%`,
      method: "공시·정책 촉매 기반 예비 추세 변동성 배수. 실제 주가/지수 수익률 회귀 베타가 아닙니다.",
      caveat: "가격 시계열을 추가하면 KOSPI/KOSDAQ 대비 60일·120일 회귀 베타로 대체해야 합니다."
    };
  }
}

data.catalystModel = catalystModel;

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(
  `Enriched catalyst signals for ${data.sectors.reduce((sum, sector) => sum + (sector.candidates?.length ?? 0), 0)} candidates`
);
