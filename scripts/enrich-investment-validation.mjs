import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "sectors.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const validationModel = {
  purpose:
    "정책자금 후보 여부와 투자 매력도를 분리해 검증합니다. 정책 적합성이 높아도 가격 부담, 재무 리스크, 촉매 불확실성이 크면 Watch 또는 Reconsider로 둡니다.",
  dimensions: [
    "정책 적합성",
    "사업 직접성",
    "성장 촉매",
    "밸류에이션 부담",
    "재무·희석 리스크",
    "실행 리스크"
  ],
  labels: ["Strong", "Watch", "Reconsider"],
  sourcePolicy:
    "DART/KIND/KRX/회사 IR 등 1차 자료를 우선 확인하고, 보도자료는 보조 근거로만 사용합니다."
};

const reconsiderCompanies = new Set([
  "큐리언트",
  "알멕",
  "디아이티",
  "제일일렉트릭",
  "로보티즈",
  "케이엔솔",
  "일진하이솔루스",
  "상아프론테크",
  "한선엔지니어링",
  "라닉스",
  "자이언트스텝",
  "대원미디어",
  "피앤씨테크",
  "새빗켐"
]);

const strongCompanies = new Set([
  "가비아",
  "오픈엣지테크놀로지",
  "가온칩스",
  "네패스",
  "엔켐",
  "성일하이텍",
  "하나기술",
  "바이넥스",
  "유바이오로직스",
  "컨텍",
  "제노코",
  "코츠테크놀로지",
  "아이쓰리시스템",
  "라온로보틱스",
  "범한퓨얼셀",
  "비나텍",
  "텔레칩스",
  "선익시스템",
  "야스",
  "SAMG엔터",
  "보성파워텍",
  "제룡산업",
  "세명전기"
]);

const sectorBusinessNeed = {
  "AI·데이터센터": "데이터센터향 매출 비중, AI/HPC 고객, 고전력 IDC·냉각·전력 수주가 실제로 확인되어야 합니다.",
  반도체: "AI/HPC, HBM, 첨단 패키징, 테스트, IP·디자인 프로젝트의 수주·매출 전환을 확인해야 합니다.",
  "이차전지·소재": "가동률, 고객 장기계약, 가격 회복, 해외 증설 CAPEX와 운전자금 부담을 같이 봐야 합니다.",
  "바이오·백신": "CDMO/백신 제조형과 임상 플랫폼형을 분리하고, 현금 runway와 임상·기술이전 확률을 확인해야 합니다.",
  "방산·우주": "방산·우주 매출 비중, 양산 전환, 수주잔고, 정부 프로젝트 지속성을 확인해야 합니다.",
  "로봇·스마트팩토리": "로봇 매출 비중, 양산 출하량, 고객사 실명, 감속기·AMR·공정로봇 수익성 회복을 확인해야 합니다.",
  "수소·에너지": "수소 관련 매출 비중, 충전소·연료전지 수주, 가동률, 보조금 의존도와 수익성을 확인해야 합니다.",
  "미래차·모빌리티": "완성차/OEM 고객 인증, 양산 수주, 차량용 반도체·센서·전력부품 매출 비중을 확인해야 합니다.",
  디스플레이: "패널사 CAPEX, 수주잔고, 8.6세대 OLED·유리기판·마이크로LED 직접성을 확인해야 합니다.",
  "콘텐츠·IP": "자체 IP, 라이선스, MD, 플랫폼 매출과 외주 제작 매출을 분리해야 합니다.",
  "전력망·산업 인프라": "한전·민간 송전망 수주, HVDC 직접성, 변압기·전선 등 핵심 장비 대표성을 확인해야 합니다.",
  "핵심광물·순환공급망": "핵심광물 회수·정제·전구체·리튬 가공 매출 비중과 원재료 조달 안정성을 확인해야 합니다."
};

const capitalMarketRisk = [
  "최근 2년 유상증자/CB/BW 발행 내역",
  "전환가액 리픽싱과 잠재 희석률",
  "순차입금, 이자비용, 영업현금흐름",
  "신규시설투자 대비 내부 현금 조달 가능성"
];

function dartUrl(company) {
  return `https://dart.fss.or.kr/dsab007/main.do?option=corp&textCrpNm=${encodeURIComponent(company)}`;
}

function krxUrl() {
  return "https://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201";
}

function kindUrl() {
  return "https://kind.krx.co.kr/disclosure/details.do?method=searchDetailsMain";
}

function marketCapRisk(marketCap) {
  if (/조/.test(marketCap)) return "높음";
  const match = marketCap.match(/([\d,]+)\s*억원/);
  if (!match) return "중간";
  const cap = Number(match[1].replaceAll(",", ""));
  if (cap >= 8000) return "중상";
  if (cap <= 1000) return "낮음";
  return "중간";
}

function evidenceLevel(candidate) {
  if (candidate.caseStatus === "즉시 명분" && candidate.urgency === "상") return "높음";
  if (candidate.caseStatus === "명분 약함") return "낮음";
  return "중간";
}

function finalValidation(candidate) {
  if (reconsiderCompanies.has(candidate.company)) return "Reconsider";
  if (strongCompanies.has(candidate.company)) return "Strong";
  if (candidate.caseStatus === "즉시 명분" && candidate.fundFit === "상") return "Strong";
  return "Watch";
}

function valuationCheck(candidate) {
  const burden = marketCapRisk(candidate.marketCap);
  if (burden === "높음") {
    return "시가총액이 이미 조 단위입니다. 정책 적합성과 별개로 EV/Sales, PBR, PER 또는 적자기업 매출 배수의 동종 대비 프리미엄을 반드시 확인해야 합니다.";
  }
  if (burden === "낮음") {
    return "시가총액은 작지만 유동성·계속기업·증자 가능성 리스크가 가격 매력보다 클 수 있습니다. 거래대금과 재무 생존성을 먼저 확인해야 합니다.";
  }
  return "동종기업 대비 PBR/PER/EV-Sales, 최근 6개월 주가 상승률, 수주잔고 대비 시총을 확인해야 합니다.";
}

function investmentMerit(candidate) {
  const checks = candidate.nextChecks.join(", ");
  if (candidate.caseStatus === "즉시 명분") {
    return `${candidate.valueChain} 노출과 ${checks} 확인 항목이 투자 촉매입니다. 다만 촉매가 이미 가격에 반영됐는지 별도 검증해야 합니다.`;
  }
  if (candidate.caseStatus === "명분 약함") {
    return `${candidate.valueChain} 노출은 있으나 ${checks}가 충분히 확인되기 전까지 투자 우선순위는 낮습니다.`;
  }
  return `${candidate.valueChain} 사업 직접성은 있으나 ${checks} 중 실제 수주·매출·CAPEX 근거가 확인될 때 투자 매력도가 올라갑니다.`;
}

function validationSummary(candidate, sectorName, label) {
  if (label === "Strong") {
    return `${sectorName} 정책 적합성과 사업 직접성이 비교적 높습니다. 다음 단계에서는 밸류에이션과 재무·희석 리스크를 통과해야 실제 투자 후보로 유지할 수 있습니다.`;
  }
  if (label === "Reconsider") {
    return `${sectorName} 노출은 있으나 섹터 직접성, 가격 부담, 재무 리스크 또는 신규자금 명분 중 하나가 약합니다. 후순위 또는 재분류 후보입니다.`;
  }
  return `${sectorName} 관련성은 있으나 핵심 근거가 일부 미확인입니다. 수주·매출 비중·CAPEX·재무 체력 확인 전까지 관찰 후보로 둡니다.`;
}

function addValidation(candidate, sectorName) {
  const label = finalValidation(candidate);
  const valuationBurden = marketCapRisk(candidate.marketCap);
  candidate.investmentValidation = {
    finalValidation: label,
    validationSummary: validationSummary(candidate, sectorName, label),
    policyFit: candidate.fundFit === "상" ? "높음" : "중간",
    businessDirectness: candidate.caseStatus === "명분 약함" ? "낮음" : "중간 이상",
    sourceConfidence: evidenceLevel(candidate),
    investmentMerit: investmentMerit(candidate),
    valuationBurden,
    valuationCheck: valuationCheck(candidate),
    financialDilutionRisk:
      candidate.urgency === "상"
        ? "자금수요가 큰 후보입니다. 신규자금 명분은 강하지만 증자·메자닌·차입 증가가 기존 주주 수익률을 희석할 수 있습니다."
        : "자금수요의 시급성은 중간 이하입니다. 신규자금 필요성이 실제 투자 기회인지, 단순 재무 보강인지 구분해야 합니다.",
    sectorSpecificChecks: [
      sectorBusinessNeed[sectorName] ?? "섹터 매출 비중과 수주·CAPEX 근거를 확인해야 합니다.",
      ...candidate.nextChecks
    ],
    capitalMarketChecks: capitalMarketRisk,
    downsideChecks: [
      "최근 실적에서 매출 성장과 영업이익률이 동시에 개선되는지",
      "고객 집중, 원재료 가격, 프로젝트 지연, 인허가·품질 리스크가 있는지",
      "정책 테마만으로 주가가 선반영된 구간인지"
    ],
    sourceNotes: [
      { type: "DART", label: `${candidate.company} 공시 검색`, url: dartUrl(candidate.company) },
      { type: "KIND", label: "공급계약·신규시설투자 공시 검색", url: kindUrl() },
      { type: "KRX", label: "시가총액·시장 구분 확인", url: krxUrl() }
    ]
  };
}

function addCoreMineralsSector() {
  if (data.sectors.some((sector) => sector.id === "core-minerals")) return;

  data.sectors.push({
    id: "core-minerals",
    name: "핵심광물·순환공급망",
    status: "candidate_list_ready",
    summary:
      "리튬·니켈·코발트·흑연 등 핵심광물의 정제, 회수, 재활용, 전구체·소재 공급망을 중심으로 봅니다.",
    keywords: ["핵심광물", "리튬", "니켈", "코발트", "전구체", "블랙파우더", "폐배터리", "리사이클링"],
    dartKeywords: ["핵심광물", "리튬", "니켈", "코발트", "폐배터리", "전구체", "신규시설투자", "전환사채"],
    projectSignals: [
      "핵심광물 공급망 안정화",
      "폐배터리 순환경제",
      "국내 정제·회수 설비",
      "IRA/공급망 지역화",
      "전구체·리튬 가공 내재화"
    ],
    candidates: [
      {
        priority: "A-",
        fundFit: "상",
        company: "성일하이텍",
        ticker: "365340",
        market: "코스닥",
        marketCap: "8,223 억원",
        valueChain: "폐배터리 리사이클링·핵심광물 회수",
        possiblePath: "자펀드 신규자금, 인프라투융자",
        capitalUse: "전처리·후처리 설비, 해외 거점, 원재료 확보",
        reason: "폐배터리에서 니켈·코발트·리튬 등 핵심광물 회수 밸류체인에 직접 노출됩니다.",
        nextChecks: ["해외 공장 투자", "원재료 확보", "금속 가격 민감도"],
        caseStatus: "즉시 명분",
        urgency: "상",
        urgencyReason: "기존 이차전지 후보 중 핵심광물 회수 직접성이 가장 높고 해외·새만금 투자 부담이 확인됩니다."
      },
      {
        priority: "B+",
        fundFit: "중상",
        company: "새빗켐",
        ticker: "107600",
        market: "코스닥",
        marketCap: "1,416 억원",
        valueChain: "폐배터리 리사이클링·블랙파우더",
        possiblePath: "자펀드 신규자금",
        capitalUse: "리사이클링 설비 고도화, 원재료 확보, 판매처 다변화",
        reason: "소형 리사이클링 후보로 핵심광물 순환공급망에 들어가지만 매출 안정성 검증이 필요합니다.",
        nextChecks: ["블랙파우더 판매처", "원재료 조달", "현금흐름"],
        caseStatus: "명분 약함",
        urgency: "중",
        urgencyReason: "현금흐름 악화와 판매처·원재료 조달 불확실성이 있어 정책 적합성과 투자 매력도를 분리해야 합니다."
      },
      {
        priority: "B+",
        fundFit: "중상",
        company: "코스모화학",
        ticker: "005420",
        market: "코스피",
        marketCap: "6,034 억원",
        valueChain: "이차전지 원료·폐배터리·황산코발트",
        possiblePath: "초저리대출, 설비자금",
        capitalUse: "핵심광물 회수·정제 설비와 운전자금",
        reason: "황산코발트·폐배터리 축으로 핵심광물 공급망 후보성이 있으나 코스피 비중 한도와 사업부별 수익성 확인이 필요합니다.",
        nextChecks: ["황산코발트 매출", "폐배터리 설비 가동률", "코스피 투자 한도 적합성"],
        caseStatus: "조건부 명분",
        urgency: "중",
        urgencyReason: "핵심광물 노출은 있으나 투자 방식은 코스피 10% 한도와 수익성 검증에 좌우됩니다."
      },
      {
        priority: "B",
        fundFit: "중상",
        company: "강원에너지",
        ticker: "114190",
        market: "코스닥",
        marketCap: "4,046 억원",
        valueChain: "리튬 소재 설비·이차전지 소재",
        possiblePath: "자펀드 신규자금, 프로젝트 수혜",
        capitalUse: "리튬 소재 설비·공정 장비, 수주 대응 운전자금",
        reason: "리튬 소재 및 공정 설비 후보이나 기존 플랜트·에너지 설비 매출과 분리해야 합니다.",
        nextChecks: ["리튬 소재 매출 비중", "공급계약", "영업이익률 회복"],
        caseStatus: "조건부 명분",
        urgency: "중",
        urgencyReason: "리튬 가격 및 수주 모멘텀은 있으나 사업 직접성과 수익성 검증이 필요합니다."
      },
      {
        priority: "B",
        fundFit: "중상",
        company: "STX",
        ticker: "011810",
        market: "코스피",
        marketCap: "1,095 억원",
        valueChain: "원자재 트레이딩·공급망",
        possiblePath: "프로젝트/SPC 수혜, 운전자금",
        capitalUse: "핵심광물 트레이딩·조달 네트워크 운전자금",
        reason: "광물 조달 네트워크 후보이나 제조·정제보다 트레이딩 성격이 강해 정책자금 직접성은 제한적입니다.",
        nextChecks: ["핵심광물 매출 비중", "장기 오프테이크 계약", "운전자금 회전"],
        caseStatus: "명분 약함",
        urgency: "하",
        urgencyReason: "핵심광물 공급망 노출은 있으나 제조·정제·회수 설비 후보가 아니라 후순위입니다."
      }
    ]
  });
}

data.meta.lastUpdated = "2026-05-17";
data.meta.outputRule =
  "섹터별 후보 정리에는 정책 적합성, 투자 validation, 시장, 시가총액, 예상 자금 용도, 다음 확인사항을 항상 포함합니다.";
data.validationModel = validationModel;

data.screeningModel.scoreItems = [
  "정책 적합성",
  "사업 직접성",
  "성장 촉매",
  "밸류에이션 부담",
  "재무·희석 리스크",
  "실행 리스크"
];
data.screeningModel.mustCheck = [
  "주목적 투자대상 12개 산업 또는 관련 장비·설비·인프라 해당 여부",
  "비상장·코스닥 기술특례·신규자금 공급 방식 적합성",
  "유상증자/CB/BW/메자닌",
  "신규시설투자",
  "R&D/임상/인허가 비용",
  "대형 수주 대응 운전자금",
  "DART/KIND/KRX/IR 근거와 확인일"
];

addCoreMineralsSector();

for (const sector of data.sectors) {
  for (const candidate of sector.candidates ?? []) {
    addValidation(candidate, sector.name);
  }
}

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(
  `Enriched ${data.sectors.reduce((sum, sector) => sum + (sector.candidates?.length ?? 0), 0)} candidates across ${data.sectors.length} sectors`
);
