import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "v6-broad-screener-data.json");
const outputPath = path.join(root, "docs", "v6.html");
const RUN_DATE = "2026-06-08";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

const universe = [
  // AI infrastructure, software, datacenter
  c("035420", "NAVER", "AI·데이터센터", "already-selected", "AI 데이터센터 저리대출 승인 이후 테마 확산 신호"),
  c("093320", "케이아이엔엑스", "AI·데이터센터", "candidate", "IDC·클라우드 인프라, AI 컴퓨팅 수요의 상장 대안"),
  c("079940", "가비아", "AI·데이터센터", "candidate", "클라우드·보안·IDC 중견 플랫폼"),
  c("012510", "더존비즈온", "AI·소프트웨어", "candidate", "기업용 AI·ERP 플랫폼, 정책자금보다 실적 안정성 우선"),
  c("030520", "한글과컴퓨터", "AI·소프트웨어", "candidate", "AI 문서·공공 SW 수요"),
  c("058970", "엠로", "AI·소프트웨어", "candidate", "공급망 AI SaaS"),
  c("108860", "셀바스AI", "AI·소프트웨어", "watch", "AI 음성·의료 SW, 변동성 높음"),
  c("304100", "솔트룩스", "AI·소프트웨어", "watch", "생성AI 플랫폼, 적자·변동성 확인 필요"),
  c("402030", "코난테크놀로지", "AI·소프트웨어", "watch", "AI SW 순수 테마, 거래 변동성 큼"),
  c("300080", "플리토", "AI·데이터", "watch", "AI 데이터·번역, 소형주"),

  // Semiconductor / AI chip supply chain
  c("042700", "한미반도체", "반도체·AI", "candidate", "HBM 장비 대장주, 정책보다 글로벌 CAPEX 민감"),
  c("403870", "HPSP", "반도체·AI", "candidate", "고압수소어닐링 장비, 고마진 장비"),
  c("058470", "리노공업", "반도체·AI", "candidate", "테스트 소켓, 재무 안정성 우수"),
  c("095340", "ISC", "반도체·AI", "candidate", "테스트 소켓, AI 반도체 후공정"),
  c("036930", "주성엔지니어링", "반도체·디스플레이", "candidate", "증착 장비, CAPEX 회복 수혜"),
  c("240810", "원익IPS", "반도체", "candidate", "전공정 장비, 대형 고객 CAPEX 연동"),
  c("319660", "피에스케이", "반도체", "candidate", "Dry strip 장비"),
  c("005290", "동진쎄미켐", "반도체 소재", "candidate", "반도체 소재 국산화"),
  c("357780", "솔브레인", "반도체 소재", "candidate", "고순도 공정소재, 재무 안정성"),
  c("200710", "에이디테크놀로지", "AI·반도체", "candidate", "디자인하우스, AI 반도체 간접 후보"),
  c("394280", "오픈엣지테크놀로지", "AI·반도체", "watch", "NPU·반도체 IP, 적자·변동성 확인"),
  c("054450", "텔레칩스", "미래차·반도체", "candidate", "차량용 SoC·SDV"),
  c("094360", "칩스앤미디어", "AI·반도체", "candidate", "영상 IP, 온디바이스 AI"),
  c("330860", "네패스아크", "반도체 테스트", "watch", "테스트 공급망이나 변동성 큼"),

  // Power grid, datacenter power, industrial infra
  c("010120", "LS ELECTRIC", "전력망·AI인프라", "candidate", "전력기기·자동화, 데이터센터 전력 수요"),
  c("267260", "HD현대일렉트릭", "전력망·AI인프라", "candidate", "변압기 글로벌 호황 대형주"),
  c("298040", "효성중공업", "전력망·AI인프라", "candidate", "변압기·전력설비 대형주"),
  c("103590", "일진전기", "전력망·AI인프라", "candidate", "전선·변압기, 전력망 투자"),
  c("001440", "대한전선", "전력망·AI인프라", "candidate", "초고압 전선, 인프라 수혜"),
  c("000500", "가온전선", "전력망·AI인프라", "candidate", "전선 중견주"),
  c("033100", "제룡전기", "전력망·AI인프라", "candidate", "변압기 소형 고성장"),
  c("147830", "제룡산업", "전력망·AI인프라", "watch", "전력기자재 소형주, 급등락 큼"),
  c("199820", "제일일렉트릭", "전력망·AI인프라", "watch", "스마트 배전, 변동성 큼"),
  c("006910", "보성파워텍", "전력망·AI인프라", "watch", "원전·전력망 테마 변동성"),
  c("017510", "세명전기", "전력망·AI인프라", "watch", "송배전 금구류 소형주"),
  c("119850", "지엔씨에너지", "데이터센터·전력", "candidate", "비상발전·데이터센터 전력"),

  // Robotics / smart factory
  c("454910", "두산로보틱스", "로봇", "candidate", "협동로봇 대형주"),
  c("277810", "레인보우로보틱스", "로봇", "candidate", "휴머노이드·협동로봇 대형 테마"),
  c("108490", "로보티즈", "로봇", "candidate", "자율주행 로봇·액추에이터"),
  c("348340", "뉴로메카", "로봇", "watch", "협동로봇, 변동성 높음"),
  c("389500", "에스비비테크", "로봇", "candidate", "감속기 국산화"),
  c("117730", "티로보틱스", "로봇", "watch", "물류·진공로봇, 변동성"),
  c("098460", "고영", "스마트팩토리", "candidate", "검사장비·의료로봇, 재무 안정성"),
  c("251630", "브이원텍", "스마트팩토리", "watch", "검사장비, 수주 확인 필요"),

  // Defense / space
  c("012450", "한화에어로스페이스", "방산·우주", "candidate", "방산·우주 대장주"),
  c("047810", "한국항공우주", "방산·우주", "candidate", "항공·우주 체계"),
  c("079550", "LIG넥스원", "방산·우주", "candidate", "유도무기·방산 전자"),
  c("064350", "현대로템", "방산", "candidate", "방산·철도, 수출 모멘텀"),
  c("272210", "한화시스템", "방산·우주", "candidate", "방산전자·위성"),
  c("099320", "쎄트렉아이", "우주", "candidate", "위성 체계"),
  c("189300", "인텔리안테크", "우주", "candidate", "위성통신 안테나"),
  c("211270", "AP위성", "우주", "watch", "소형 위성 부품"),
  c("451760", "컨텍", "우주", "watch", "지상국·데이터, 소형주"),
  c("361390", "제노코", "방산·우주", "watch", "방산 통신부품"),
  c("214430", "아이쓰리시스템", "방산", "candidate", "적외선 영상센서"),
  c("448710", "코츠테크놀로지", "방산", "watch", "방산 임베디드 시스템"),
  c("368770", "파이버프로", "우주·방산", "watch", "광섬유 자이로·센서"),

  // Battery / materials / recycling
  c("373220", "LG에너지솔루션", "이차전지", "candidate", "대형 배터리 셀"),
  c("006400", "삼성SDI", "이차전지", "candidate", "대형 배터리 셀"),
  c("247540", "에코프로비엠", "이차전지 소재", "candidate", "양극재 대형주"),
  c("003670", "포스코퓨처엠", "이차전지 소재", "candidate", "양극재·음극재"),
  c("066970", "엘앤에프", "이차전지 소재", "already-selected", "자회사 LFP 대출 승인 프록시"),
  c("078600", "대주전자재료", "이차전지 소재", "candidate", "실리콘 음극재"),
  c("278280", "천보", "이차전지 소재", "candidate", "전해질 소재"),
  c("348370", "엔켐", "이차전지 소재", "candidate", "전해액"),
  c("121600", "나노신소재", "이차전지 소재", "candidate", "CNT 도전재"),
  c("393890", "더블유씨피", "이차전지 소재", "candidate", "분리막"),
  c("222080", "씨아이에스", "이차전지 장비", "candidate", "전극공정 장비"),
  c("137400", "피엔티", "이차전지 장비", "candidate", "전극공정 장비"),
  c("299030", "하나기술", "이차전지 장비", "watch", "장비 소형주"),
  c("365340", "성일하이텍", "순환공급망", "candidate", "배터리 리사이클링"),
  c("107600", "새빗켐", "순환공급망", "watch", "배터리 리사이클링 소형주"),
  c("005070", "코스모신소재", "이차전지 소재", "candidate", "양극재 소재"),
  c("005420", "코스모화학", "순환공급망", "watch", "폐배터리·소재"),
  c("010130", "고려아연", "핵심광물", "candidate", "비철·니켈·자원순환"),
  c("005490", "POSCO홀딩스", "핵심광물", "candidate", "리튬·소재 밸류체인"),

  // Bio / vaccine / CDMO
  c("207940", "삼성바이오로직스", "바이오·CDMO", "candidate", "대형 CDMO"),
  c("068270", "셀트리온", "바이오", "candidate", "바이오시밀러 대형주"),
  c("302440", "SK바이오사이언스", "바이오·백신", "already-selected", "폐렴구균 3상 대출 승인"),
  c("000100", "유한양행", "바이오", "candidate", "신약·대형 제약"),
  c("196170", "알테오젠", "바이오", "candidate", "플랫폼 기술수출"),
  c("141080", "리가켐바이오", "바이오", "candidate", "ADC 플랫폼"),
  c("237690", "에스티팜", "바이오·CDMO", "candidate", "올리고 CDMO"),
  c("053030", "바이넥스", "바이오·CDMO", "watch", "바이오의약품 CDMO 중소형"),
  c("334970", "프레스티지바이오로직스", "바이오·CDMO", "watch", "CDMO, 재무 리스크 확인"),
  c("206650", "유바이오로직스", "바이오·백신", "watch", "백신 후보"),
  c("214450", "파마리서치", "바이오", "candidate", "현금창출형 바이오·의료"),
  c("039200", "오스코텍", "바이오", "watch", "신약 이벤트형"),
  c("298380", "에이비엘바이오", "바이오", "candidate", "항체 플랫폼"),

  // OLED / display
  c("108320", "LX세미콘", "디스플레이·반도체", "candidate", "디스플레이 IC, 재무 안정성"),
  c("213420", "덕산네오룩스", "OLED", "candidate", "OLED 소재"),
  c("272290", "이녹스첨단소재", "OLED·소재", "candidate", "OLED 필름·첨단소재"),
  c("265520", "AP시스템", "OLED 장비", "candidate", "OLED 장비"),
  c("171090", "선익시스템", "OLED 장비", "watch", "OLED 증착장비, 변동성"),
  c("255440", "야스", "OLED 장비", "watch", "OLED 증착장비"),
  c("078150", "HB테크놀러지", "디스플레이 장비", "watch", "검사장비"),
  c("239890", "피엔에이치테크", "OLED 소재", "watch", "OLED 소재 소형주"),
  c("161580", "필옵틱스", "디스플레이·이차전지", "candidate", "레이저 장비"),

  // Energy / hydrogen
  c("336260", "두산퓨얼셀", "수소·연료전지", "candidate", "연료전지 대형주"),
  c("382900", "범한퓨얼셀", "수소·연료전지", "watch", "연료전지 중소형"),
  c("089980", "상아프론테크", "수소·소재", "candidate", "수소 멤브레인·소재"),
  c("271940", "일진하이솔루스", "수소", "watch", "수소 저장탱크"),
  c("288620", "에스프리즘", "수소·전력", "watch", "소형 에너지 후보"),
  c("126340", "비나텍", "수소·에너지", "candidate", "슈퍼커패시터·연료전지 소재"),
  c("126880", "제이엔케이글로벌", "수소", "watch", "수소충전 설비"),

  // Content / media
  c("352820", "하이브", "콘텐츠·IP", "candidate", "글로벌 IP 대형주"),
  c("035900", "JYP Ent.", "콘텐츠·IP", "candidate", "음악 IP"),
  c("041510", "에스엠", "콘텐츠·IP", "candidate", "음악 IP"),
  c("253450", "스튜디오드래곤", "콘텐츠·IP", "candidate", "드라마 IP"),
  c("419530", "SAMG엔터", "콘텐츠·IP", "watch", "애니메이션 IP 소형주"),
  c("408900", "스튜디오미르", "콘텐츠·IP", "watch", "애니메이션 제작"),
  c("310200", "애니플러스", "콘텐츠·IP", "watch", "애니메이션 유통"),
  c("048910", "대원미디어", "콘텐츠·IP", "watch", "캐릭터 IP"),
  c("206560", "덱스터", "콘텐츠·VFX", "watch", "VFX 변동성"),
  c("289220", "자이언트스텝", "콘텐츠·VFX", "watch", "버추얼 프로덕션"),
  c("299900", "위지윅스튜디오", "콘텐츠·VFX", "watch", "콘텐츠 제작·VFX"),

  // Future mobility
  c("012330", "현대모비스", "미래차", "candidate", "전장·모듈 대형주"),
  c("307950", "현대오토에버", "미래차·SW", "candidate", "SDV·차량 SW"),
  c("204320", "HL만도", "미래차", "candidate", "ADAS·섀시"),
  c("011070", "LG이노텍", "미래차·부품", "candidate", "전장·광학"),
  c("424960", "스마트레이더시스템", "미래차", "watch", "4D 레이더 소형주"),
  c("370090", "퓨런티어", "미래차", "watch", "자율주행 카메라 검사"),
  c("087260", "모바일어플라이언스", "미래차", "watch", "ADAS 소형주"),
  c("084730", "팅크웨어", "미래차", "watch", "블랙박스·지도")
];

function c(ticker, company, sector, status, rationale) {
  return { ticker, company, sector, status, rationale };
}

async function main() {
  const rows = [];
  for (const [index, item] of universe.entries()) {
    try {
      const daily = await fetchDailyHistory(item.ticker, 9);
      const flow = await fetchForeignHistory(item.ticker, 9);
      const merged = mergeHistory(daily, flow);
      const quote = await fetchQuote(item.ticker);
      const row = evaluate(item, merged, quote);
      rows.push(row);
      console.log(`[${String(index + 1).padStart(3, "0")}/${universe.length}] ${item.company} ${item.ticker}: ${row.decision} ${row.totalScore}`);
      await sleep(70);
    } catch (error) {
      rows.push({ ...item, error: error.message, decision: "DATA_FAIL", totalScore: 0 });
      console.log(`[${String(index + 1).padStart(3, "0")}/${universe.length}] ${item.company} ${item.ticker}: ERROR ${error.message}`);
    }
  }

  const valid = rows.filter((row) => !row.error);
  const preliminary = valid
    .filter((row) => row.totalScore >= 66)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 45);

  for (const row of preliminary) {
    row.brokers = {
      day: await fetchBrokers(row.ticker, 1),
      d5: await fetchBrokers(row.ticker, 5)
    };
    applyBrokerAdjustment(row);
    await sleep(50);
  }

  const ranked = valid.sort((a, b) => b.totalScore - a.totalScore);
  const entryList = ranked.filter((row) => row.decision === "ENTRY_OK").slice(0, 15);
  const triggerList = ranked.filter((row) => row.decision === "WAIT_TRIGGER").slice(0, 30);
  const avoidList = ranked.filter((row) => row.decision === "AVOID_NOW").slice(0, 30);

  const output = {
    meta: {
      title: "국민성장펀드 v6 광범위 가치·기술적 진입 스크리너",
      runDate: RUN_DATE,
      universeCount: universe.length,
      validCount: valid.length,
      methodology: "기존 v4 우선순위를 배제하고 정책자금 잔여 버킷, 유동성·시총 안정성, 급락 후 기술적 안정화, 외국인·기관 수급, 거래원 보조 신호를 종합 평가했다.",
      warning: "투자 권유가 아니라 후보 탐색과 진입 조건 점검표입니다. 특히 급락장에서는 ENTRY_OK도 분할·조건부 접근이 전제입니다."
    },
    market: await fetchMarketSnapshot(),
    rules: buildRules(),
    summary: summarize(ranked),
    entryList,
    triggerList,
    avoidList,
    allRows: ranked,
    sources: [
      { title: "Naver Finance 시세·외국인/기관·거래원", url: "https://finance.naver.com/" },
      { title: "금융위원회 국민성장펀드 누적 승인자료", url: "https://www.fsc.go.kr/no010101/87003" },
      { title: "금융위원회 국민참여형·2026년 운용계획", url: "https://www.fsc.go.kr/po010101/86834" }
    ]
  };

  fs.writeFileSync(dataPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  fs.writeFileSync(outputPath, buildHtml(output), "utf8");
  console.log(`Generated ${path.relative(root, dataPath)}`);
  console.log(`Generated ${path.relative(root, outputPath)}`);
}

function evaluate(item, history, quote) {
  if (history.length < 40) throw new Error("history too short");
  const latest = history.at(-1);
  const closes = history.map((row) => row.close);
  const highs = history.map((row) => row.high);
  const lows = history.map((row) => row.low);
  const volumes = history.map((row) => row.volume);
  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const ma120 = sma(closes, 120);
  const rsi14 = rsi(closes, 14);
  const high60 = Math.max(...highs.slice(-60));
  const low60 = Math.min(...lows.slice(-60));
  const drawdown60Pct = pctChange(high60, latest.close);
  const reboundFromLow60Pct = pctChange(low60, latest.close);
  const ret5 = pctChange(closes.at(-6), latest.close);
  const ret20 = pctChange(closes.at(-21), latest.close);
  const ret60 = pctChange(closes.at(-61), latest.close);
  const avgVol20 = average(volumes.slice(-20));
  const volumeRatio = avgVol20 ? latest.volume / avgVol20 : null;
  const flow5 = calcFlow(history, 5, quote.marketCapEok);
  const flow20 = calcFlow(history, 20, quote.marketCapEok);
  const flow60 = calcFlow(history, 60, quote.marketCapEok);
  const policy = policyScore(item);
  const value = valueScore(quote, item);
  const technical = technicalScore({ latest, ma5, ma20, ma60, ma120, rsi14, drawdown60Pct, reboundFromLow60Pct, ret5, ret20, ret60, volumeRatio });
  const flowScore = investorFlowScore(flow5, flow20, flow60);
  const risk = riskPenalty(item, quote, { drawdown60Pct, ret20, rsi14, latest, ma20, ma60 });
  const totalScore = Math.round(clamp(policy.score + value.score + technical.score + flowScore.score - risk.penalty, 0, 100));
  const decision = decide(totalScore, technical, flowScore, risk, { latest, ma5, ma20, ma60, rsi14, ret20, drawdown60Pct });
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
      volumeRatio: round(volumeRatio, 2)
    },
    returns: { d5: ret5, d20: ret20, d60: ret60 },
    technicals: {
      ma5,
      ma20,
      ma60,
      ma120,
      rsi14,
      high60,
      low60,
      drawdown60Pct,
      reboundFromLow60Pct,
      aboveMa20: latest.close >= ma20,
      aboveMa60: latest.close >= ma60,
      ma20SlopePct: pctChange(sma(closes.slice(0, -5), 20), ma20)
    },
    flows: { d5: flow5, d20: flow20, d60: flow60 },
    policy,
    value,
    technical,
    flowScore,
    risk,
    totalScore,
    decision,
    entryPlan: entryPlan(decision, latest.close, ma5, ma20, ma60, low60, high60, rsi14),
    sourceUrl: `https://finance.naver.com/item/main.naver?code=${item.ticker}`
  };
}

function policyScore(item) {
  const base = {
    "전력망": 24,
    "AI": 23,
    "반도체": 22,
    "방산": 21,
    "우주": 21,
    "로봇": 20,
    "바이오": 18,
    "이차전지": 17,
    "수소": 15,
    "OLED": 15,
    "디스플레이": 15,
    "콘텐츠": 13,
    "미래차": 15,
    "핵심광물": 16,
    "순환공급망": 16
  };
  let score = 12;
  for (const [key, value] of Object.entries(base)) {
    if (item.sector.includes(key) || item.rationale.includes(key)) score = Math.max(score, value);
  }
  if (item.status === "already-selected") score -= 8;
  if (item.status === "watch") score -= 2;
  return { score: clamp(score, 0, 25), memo: item.status === "already-selected" ? "이미 선정·프록시라 신규 선정 기대값은 낮춤" : item.rationale };
}

function valueScore(quote, item) {
  let score = 12;
  if (quote.marketCapEok == null) score -= 3;
  else if (quote.marketCapEok < 800) score += 0;
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
  return { score: clamp(score, 0, 25), memo: `시총 ${formatEok(quote.marketCapEok)}, PER ${quote.per ?? "-"}, PBR ${quote.pbr ?? "-"}` };
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
  return { score: clamp(score, 0, 35), memo: `MA20 ${t.latest.close >= t.ma20 ? "상회" : "하회"}, RSI ${round(t.rsi14, 1)}, 60일 고점 대비 ${formatPct(t.drawdown60Pct)}` };
}

function investorFlowScore(d5, d20, d60) {
  let score = 0;
  if ((d5.foreignPct ?? 0) > 0) score += 4;
  if ((d5.institutionPct ?? 0) > 0) score += 4;
  if ((d20.foreignPct ?? 0) > 0) score += 5;
  if ((d20.institutionPct ?? 0) > 0) score += 5;
  if ((d60.foreignPct ?? 0) > 0) score += 3;
  if ((d60.institutionPct ?? 0) > 0) score += 3;
  return { score: clamp(score, 0, 20), memo: `20일 외국인 ${formatPct(d20.foreignPct)}, 기관 ${formatPct(d20.institutionPct)}` };
}

function riskPenalty(item, quote, t) {
  let penalty = 0;
  const notes = [];
  let valuationBlock = false;
  if (item.status === "already-selected") {
    penalty += 8;
    notes.push("이미 선정 또는 프록시");
  }
  if (item.status === "watch") {
    penalty += 3;
    notes.push("변동성/재무 확인 필요");
  }
  if (quote.marketCapEok != null && quote.marketCapEok < 700) {
    penalty += 5;
    notes.push("초소형 유동성 리스크");
  }
  if (quote.per != null && quote.per < 0 && quote.pbr != null && quote.pbr > 3) {
    penalty += 8;
    valuationBlock = true;
    notes.push("적자+고PBR 밸류에이션");
  } else if (quote.per != null && quote.per < 0) {
    penalty += 4;
    notes.push("적자 구간");
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
    notes.push("과매도 지속 가능성");
  }
  return { penalty, notes, valuationBlock };
}

function decide(totalScore, technical, flowScore, risk, t) {
  if (totalScore >= 76 && t.latest.close >= t.ma20 && t.rsi14 >= 35 && t.ret20 > -25 && risk.penalty <= 10 && !risk.valuationBlock) return "ENTRY_OK";
  if (totalScore >= 64 && t.rsi14 >= 28 && t.ret20 > -45) return "WAIT_TRIGGER";
  return "AVOID_NOW";
}

function entryPlan(decision, close, ma5, ma20, ma60, low60, high60, rsi14) {
  const stop = Math.min(low60 * 0.97, close * 0.9);
  if (decision === "ENTRY_OK") {
    return {
      action: "분할 진입 가능",
      trigger: `현 가격대 ${formatPrice(close)}에서 40%, MA20 ${formatPrice(ma20)} 재확인 후 30%, 직전 고점 돌파 시 30%`,
      invalidation: `종가가 MA20 ${formatPrice(ma20)} 아래로 재이탈하거나 손절 기준 ${formatPrice(stop)} 하회`,
      target: `1차 ${formatPrice(ma60)}, 2차 60일 고점 ${formatPrice(high60)} 부근`
    };
  }
  if (decision === "WAIT_TRIGGER") {
    return {
      action: "트리거 대기",
      trigger: `종가가 MA20 ${formatPrice(ma20)} 회복, 또는 5일선 ${formatPrice(ma5)} 위에서 거래량 동반 양봉`,
      invalidation: `60일 저점 ${formatPrice(low60)} 이탈`,
      target: `MA60 ${formatPrice(ma60)} 또는 60일 고점 대비 절반 되돌림`
    };
  }
  return {
    action: "관망/제외",
    trigger: `최소 MA20 ${formatPrice(ma20)} 회복과 RSI 35 이상 필요`,
    invalidation: `추세 훼손 지속`,
    target: "반등 확인 전 목표가 산정 보류"
  };
}

async function fetchDailyHistory(ticker, pages) {
  const rows = [];
  for (let page = 1; page <= pages; page += 1) {
    const html = await fetchText(`https://finance.naver.com/item/sise_day.naver?code=${ticker}&page=${page}`);
    const table = extractFirstTable(html);
    const trs = table.match(/<tr onMouseOver[\s\S]*?<\/tr>/g) ?? [];
    for (const tr of trs) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
      if (cells.length !== 7 || !/^\d{4}\.\d{2}\.\d{2}$/.test(cells[0])) continue;
      rows.push({
        date: cells[0].replaceAll(".", "-"),
        close: parseNumber(cells[1]),
        open: parseNumber(cells[3]),
        high: parseNumber(cells[4]),
        low: parseNumber(cells[5]),
        volume: parseNumber(cells[6])
      });
    }
    await sleep(20);
  }
  return dedupByDate(rows).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchForeignHistory(ticker, pages) {
  const rows = [];
  for (let page = 1; page <= pages; page += 1) {
    const html = await fetchText(`https://finance.naver.com/item/frgn.naver?code=${ticker}&page=${page}`);
    const table = extractTableByCaption(html, "외국인 기관 순매매 거래량");
    if (!table) continue;
    const trs = table.match(/<tr onMouseOver[\s\S]*?<\/tr>/g) ?? [];
    for (const tr of trs) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => strip(m[1]));
      if (cells.length !== 9 || !/^\d{4}\.\d{2}\.\d{2}$/.test(cells[0])) continue;
      const close = parseNumber(cells[1]);
      const inst = parseNumber(cells[5]);
      const foreign = parseNumber(cells[6]);
      rows.push({
        date: cells[0].replaceAll(".", "-"),
        institutionNetShares: inst,
        foreignNetShares: foreign,
        foreignHoldingRatePct: parseNumber(cells[8]),
        institutionNetValueEok: close && inst != null ? round(close * inst / 100_000_000, 2) : null,
        foreignNetValueEok: close && foreign != null ? round(close * foreign / 100_000_000, 2) : null
      });
    }
    await sleep(20);
  }
  return dedupByDate(rows).sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchQuote(ticker) {
  const [mainHtml, siseHtml] = await Promise.all([
    fetchText(`https://finance.naver.com/item/main.naver?code=${ticker}`),
    fetchText(`https://finance.naver.com/item/sise.naver?code=${ticker}`)
  ]);
  const marketCapEok = parseMarketCapEok(siseHtml) ?? parseMarketCapEok(mainHtml);
  const listedShares = parseListedShares(siseHtml);
  const tableText = strip(mainHtml);
  const per = parseAfterLabel(tableText, "PER");
  const pbr = parseAfterLabel(tableText, "PBR");
  const roe = parseAfterLabel(tableText, "ROE");
  return { marketCapEok, listedShares, per, pbr, roe };
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

function applyBrokerAdjustment(row) {
  const d5 = row.brokers?.d5;
  if (!d5) return;
  let add = 0;
  if ((d5.foreignEstimate?.net ?? 0) > 0) add += 2;
  if (d5.buyTop?.some((x) => x.foreign)) add += 1;
  if (d5.sellTop?.some((x) => x.foreign)) add -= 1;
  row.brokerAdjustment = add;
  row.totalScore = Math.round(clamp(row.totalScore + add, 0, 100));
  row.decision = decide(row.totalScore, row.technical, row.flowScore, row.risk, {
    latest: { close: row.close },
    ma20: row.technicals.ma20,
    ma60: row.technicals.ma60,
    rsi14: row.technicals.rsi14,
    ret20: row.returns.d20,
    drawdown60Pct: row.technicals.drawdown60Pct
  });
}

function mergeHistory(daily, flows) {
  const flowByDate = new Map(flows.map((row) => [row.date, row]));
  return daily.map((row) => ({ ...row, ...(flowByDate.get(row.date) ?? {}) }));
}

function calcFlow(history, n, marketCapEok) {
  const rows = history.slice(-n);
  const foreign = sum(rows.map((row) => row.foreignNetValueEok));
  const institution = sum(rows.map((row) => row.institutionNetValueEok));
  return {
    days: rows.length,
    foreignNetValueEok: foreign,
    institutionNetValueEok: institution,
    foreignPct: marketCapEok ? round(foreign / marketCapEok * 100, 3) : null,
    institutionPct: marketCapEok ? round(institution / marketCapEok * 100, 3) : null
  };
}

function buildRules() {
  return [
    "정책 적합성은 최대 25점으로 제한한다. 정책 테마만으로 매수하지 않는다.",
    "가치·안정성은 시총 구간, PER/PBR 확인 가능성, 초소형 리스크를 반영한다.",
    "적자+고PBR, PBR 10배 초과, PER 60배 초과는 점수가 높아도 즉시 진입에서 제외한다.",
    "기술적 조건은 MA20 회복, RSI 35~58, 60일 고점 대비 적정 조정, 20일 낙폭 과다 여부를 본다.",
    "외국인·기관 5일/20일 수급은 보조 점수다. 거래원은 최종 투자자 확인이 아니므로 3점 이내로만 반영한다.",
    "ENTRY_OK도 급락장에서는 40/30/30 분할 진입이며, MA20 이탈 또는 60일 저점 이탈 시 무효다."
  ];
}

function summarize(rows) {
  const count = (decision) => rows.filter((row) => row.decision === decision).length;
  const bySector = {};
  for (const row of rows) {
    const key = row.sector;
    bySector[key] ??= { count: 0, avgScore: 0, entry: 0 };
    bySector[key].count += 1;
    bySector[key].avgScore += row.totalScore;
    if (row.decision === "ENTRY_OK") bySector[key].entry += 1;
  }
  for (const value of Object.values(bySector)) value.avgScore = round(value.avgScore / value.count, 1);
  return {
    entryOk: count("ENTRY_OK"),
    waitTrigger: count("WAIT_TRIGGER"),
    avoidNow: count("AVOID_NOW"),
    dataFail: rows.filter((row) => row.error).length,
    bySector
  };
}

async function fetchMarketSnapshot() {
  return { kospi: await fetchIndex("KOSPI"), kosdaq: await fetchIndex("KOSDAQ") };
}

async function fetchIndex(code) {
  const html = await fetchText(`https://finance.naver.com/sise/sise_index.naver?code=${code}`);
  const now = strip(html.match(/id=["']now_value["'][^>]*>([\s\S]*?)<\/em>/)?.[1]);
  const quotientClass = html.match(/<div class="quotient\s+([^"]*)"/)?.[1] ?? "";
  const start = html.indexOf("change_value_and_rate");
  const end = start >= 0 ? html.indexOf("</div>", start) : -1;
  const text = start >= 0 && end > start ? strip(html.slice(start, end)) : "";
  const values = text.match(/[-+]?\d[\d,.]*/g) ?? [];
  const sign = quotientClass.includes("dn") ? "-" : quotientClass.includes("up") ? "+" : "";
  const change = values.length >= 2 ? `${sign}${values[0]} (${values[1].startsWith("-") || values[1].startsWith("+") ? values[1] : sign + values[1]}%)` : text;
  return { code, now, change };
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
    :root{color-scheme:light;--bg:#f4f6f8;--ink:#141a22;--muted:#637083;--line:#d8dee7;--surface:#fff;--nav:#18212e;--green:#0b6b5d;--blue:#2e5ea8;--gold:#9a6515;--red:#8d3a35;--soft:#eef2f6}
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI","Malgun Gothic",Arial,sans-serif;line-height:1.5} a{color:inherit} button,input{font:inherit}
    .layout{min-height:100vh;display:grid;grid-template-columns:320px minmax(0,1fr)} aside{position:sticky;top:0;height:100vh;overflow:auto;padding:24px 20px;background:var(--nav);color:#f8fafc} main{min-width:0;padding:28px}
    h1,h2,h3,h4,p{margin-top:0} h1{font-size:22px;line-height:1.25;letter-spacing:0} h2{font-size:30px;line-height:1.2;letter-spacing:0;margin-bottom:8px} h3{font-size:17px;letter-spacing:0;margin-bottom:10px} h4{font-size:14px;letter-spacing:0;margin-bottom:8px}
    .brand p{color:#cbd5df;font-size:13px}.muted{color:var(--muted)}.side-box{display:grid;gap:7px;margin:16px 0;padding:13px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:#d8e1eb;font-size:12px}.nav-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}.nav-link{display:grid;grid-template-columns:1fr auto;align-items:center;min-height:38px;padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.05);color:#f8fafc;text-decoration:none;font-size:13px;font-weight:800}.nav-link:hover{background:#fff;color:var(--ink)}
    .tag,.badge{display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}.tag{background:rgba(255,255,255,.12);color:#e5edf7}.badge.entry{background:#e5f3f0;color:var(--green)}.badge.wait{background:#fff2db;color:var(--gold)}.badge.avoid{background:#f7e8e6;color:var(--red)}.badge.info{background:#e8eef9;color:var(--blue)}
    .hero,.band{border:1px solid var(--line);border-radius:8px;background:var(--surface)}.hero{padding:28px;margin-bottom:16px;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,.9fr);gap:20px}.kicker{margin-bottom:9px;color:var(--green);font-size:13px;font-weight:900}.hero p{color:var(--muted)}
    .metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}.metric{min-height:108px;padding:16px;border:1px solid var(--line);border-radius:8px;background:#fff}.metric strong{display:block;font-size:27px;line-height:1.1}.metric span{display:block;margin-top:6px;color:var(--muted);font-size:12px}
    .band{padding:18px;margin-bottom:16px}.head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.head p{max-width:900px;margin-bottom:0;color:var(--muted);font-size:13px}.grid-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{padding:14px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd}.card p{margin-bottom:0;color:var(--muted);font-size:12px}
    .toolbar{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-bottom:12px}.segmented{display:flex;flex-wrap:wrap;gap:6px}.segmented button{min-height:34px;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;cursor:pointer;font-size:13px;font-weight:800}.segmented button.active{border-color:var(--green);background:#e5f3f0;color:var(--green)}.search{width:min(360px,100%);min-height:36px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:#fff}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fff} table{width:100%;min-width:1380px;border-collapse:collapse} th,td{padding:10px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px} th{position:sticky;top:0;z-index:1;background:#eef2f6;color:#334052} tr:last-child td{border-bottom:0}.num{font-variant-numeric:tabular-nums;white-space:nowrap}.company{font-weight:900}.note{display:block;margin-top:5px;color:var(--muted);font-size:12px;line-height:1.42}
    .source-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.source-list a{min-height:60px;padding:11px 12px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;text-decoration:none;font-size:13px}.source-list span{display:block;margin-top:4px;color:var(--muted);font-size:12px} footer{color:var(--muted);font-size:12px}
    @media(max-width:1180px){.layout{grid-template-columns:1fr}aside{position:static;height:auto}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.hero,.grid-2,.grid-3{grid-template-columns:1fr}}@media(max-width:720px){main{padding:16px}aside{padding:18px}.metrics{grid-template-columns:1fr}h2{font-size:24px}.head{display:block}}
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><h1>${escapeHtml(data.meta.title)}</h1><p>기존 우선순위 배제, 광범위 후보, 기술적 진입 판단</p></div>
      <div class="side-box"><span>기준일: ${data.meta.runDate}</span><span>유니버스: ${data.meta.universeCount}개</span><span>분석 성공: ${data.meta.validCount}개</span><span>ENTRY_OK: ${data.summary.entryOk}개</span></div>
      <nav class="nav-list">
        <a class="nav-link" href="#overview"><span>요약</span><span class="tag">KPI</span></a>
        <a class="nav-link" href="#rules"><span>새 기준</span><span class="tag">Rules</span></a>
        <a class="nav-link" href="#entry"><span>진입 가능</span><span class="tag">Entry</span></a>
        <a class="nav-link" href="#wait"><span>트리거 대기</span><span class="tag">Wait</span></a>
        <a class="nav-link" href="#all"><span>전체 테이블</span><span class="tag">All</span></a>
        <a class="nav-link" href="#sources"><span>출처</span><span class="tag">Sources</span></a>
      </nav>
    </aside>
    <main>
      <section class="hero" id="overview"><div><p class="kicker">v6 Broad Screener</p><h2>정책 수혜 가능성보다 “지금 들어갈 수 있는 차트인지”를 더 엄격하게 본 새 스크리너입니다.</h2><p>${escapeHtml(data.meta.warning)}</p></div><div class="grid-2"><div class="card"><h4>KOSPI</h4><p><strong>${escapeHtml(data.market.kospi.now)}</strong></p><p>${escapeHtml(data.market.kospi.change)}</p></div><div class="card"><h4>KOSDAQ</h4><p><strong>${escapeHtml(data.market.kosdaq.now)}</strong></p><p>${escapeHtml(data.market.kosdaq.change)}</p></div></div></section>
      <section class="metrics" id="metrics"></section>
      <section class="band" id="rules"><div class="head"><div><h3>새 선별 기준</h3><p>${escapeHtml(data.meta.methodology)}</p></div></div><div class="grid-3" id="rulesGrid"></div></section>
      <section class="band" id="entry"><div class="head"><div><h3>진입 가능 후보</h3><p>MA20 회복, RSI, 낙폭, 수급, 리스크 페널티를 통과한 후보입니다. 그래도 급락장이라 분할 진입 전제입니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>순위</th><th>회사</th><th>점수</th><th>가격/가치</th><th>기술적 위치</th><th>수급</th><th>거래원</th><th>진입 계획</th><th>리스크</th></tr></thead><tbody id="entryRows"></tbody></table></div></section>
      <section class="band" id="wait"><div class="head"><div><h3>트리거 대기 후보</h3><p>정책/가치 매력은 있지만 아직 차트가 회복되지 않은 후보입니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>회사</th><th>점수</th><th>기술 조건</th><th>기다릴 트리거</th><th>무효 조건</th></tr></thead><tbody id="waitRows"></tbody></table></div></section>
      <section class="band" id="all"><div class="toolbar"><div><h3 style="margin-bottom:4px;">전체 재탐색 테이블</h3><p class="muted" style="margin-bottom:0;font-size:13px;">검색과 결정 필터로 확인하세요.</p></div><input class="search" id="search" type="search" placeholder="회사, 섹터, 코드 검색"></div><div class="segmented" id="filters"></div><div class="table-wrap"><table><thead><tr><th>순위</th><th>회사</th><th>결정</th><th>총점</th><th>정책</th><th>가치</th><th>기술</th><th>수급</th><th>메모</th></tr></thead><tbody id="allRows"></tbody></table></div></section>
      <section class="band" id="sources"><div class="head"><div><h3>출처</h3><p>Naver Finance 일별 시세, 외국인·기관 순매매, 거래원정보와 금융위원회 공개자료를 사용했습니다.</p></div></div><div class="source-list" id="sourceList"></div></section>
      <footer>생성 스크립트: <code>node scripts/build-v6-broad-screener.mjs</code>. 데이터: <code>data/v6-broad-screener-data.json</code>.</footer>
    </main>
  </div>
  <script>
    const DATA=${json}; let filter="all"; let search="";
    const metrics=[["분석 유니버스",DATA.meta.validCount+"개","기존 v4 순위 배제"],["진입 가능",DATA.summary.entryOk+"개","기술 조건 통과"],["트리거 대기",DATA.summary.waitTrigger+"개","회복 확인 필요"],["관망/제외",DATA.summary.avoidNow+"개","추세·리스크 미통과"],["최상위",DATA.allRows[0]?.company??"-","총점 "+(DATA.allRows[0]?.totalScore??"-")]];
    document.querySelector("#metrics").innerHTML=metrics.map(([a,b,c])=>\`<div class="metric"><strong>\${escapeHtml(b)}</strong><span>\${escapeHtml(a)} · \${escapeHtml(c)}</span></div>\`).join("");
    document.querySelector("#rulesGrid").innerHTML=DATA.rules.map((r,i)=>\`<div class="card"><h4>\${i+1}. 기준</h4><p>\${escapeHtml(r)}</p></div>\`).join("");
    function decisionClass(d){return d==="ENTRY_OK"?"entry":d==="WAIT_TRIGGER"?"wait":"avoid"}
    function decisionText(d){return d==="ENTRY_OK"?"진입 가능":d==="WAIT_TRIGGER"?"트리거 대기":d==="AVOID_NOW"?"관망/제외":d}
    function broker(row){const b=row.brokers?.d5;if(!b)return"미확인";const buy=(b.buyTop||[]).slice(0,2).map(x=>x.name).join(", ");const sell=(b.sellTop||[]).slice(0,2).map(x=>x.name).join(", ");const net=b.foreignEstimate?.net;return \`\${net==null?"외국계 추정 없음":"외국계 "+net.toLocaleString("ko-KR")+"주"} · 매수 \${buy} / 매도 \${sell}\`}
    document.querySelector("#entryRows").innerHTML=DATA.entryList.map((r,i)=>\`<tr><td class="num">\${i+1}</td><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><span class="badge entry">\${r.totalScore}</span></td><td>\${price(r.close)}<span class="note">시총 \${eok(r.marketCapEok)} · PER \${r.per??"-"} · PBR \${r.pbr??"-"}</span></td><td>\${escapeHtml(r.technical.memo)}<span class="note">20일 \${pct(r.returns.d20)}, 60일 \${pct(r.returns.d60)}</span></td><td>\${escapeHtml(r.flowScore.memo)}</td><td>\${escapeHtml(broker(r))}</td><td>\${escapeHtml(r.entryPlan.trigger)}<span class="note">\${escapeHtml(r.entryPlan.invalidation)}</span></td><td>\${escapeHtml((r.risk.notes||[]).join(" · ")||"특이 리스크 없음")}</td></tr>\`).join("");
    document.querySelector("#waitRows").innerHTML=DATA.triggerList.slice(0,25).map(r=>\`<tr><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><span class="badge wait">\${r.totalScore}</span></td><td>\${escapeHtml(r.technical.memo)}</td><td>\${escapeHtml(r.entryPlan.trigger)}</td><td>\${escapeHtml(r.entryPlan.invalidation)}</td></tr>\`).join("");
    function renderFilters(){const vals=["all","ENTRY_OK","WAIT_TRIGGER","AVOID_NOW"];document.querySelector("#filters").innerHTML=vals.map(v=>\`<button class="\${filter===v?"active":""}" data-filter="\${v}">\${v==="all"?"전체":decisionText(v)}</button>\`).join("");document.querySelectorAll("#filters button").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;renderFilters();renderAll()}));}
    function renderAll(){const needle=search.trim().toLowerCase();const rows=DATA.allRows.filter(r=>(filter==="all"||r.decision===filter)&&(!needle||[r.company,r.ticker,r.sector,r.rationale].join(" ").toLowerCase().includes(needle))).slice(0,90);document.querySelector("#allRows").innerHTML=rows.map((r,i)=>\`<tr><td class="num">\${i+1}</td><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><span class="badge \${decisionClass(r.decision)}">\${decisionText(r.decision)}</span></td><td><strong>\${r.totalScore}</strong></td><td>\${r.policy.score}<span class="note">\${escapeHtml(r.policy.memo)}</span></td><td>\${r.value.score}<span class="note">\${escapeHtml(r.value.memo)}</span></td><td>\${r.technical.score}<span class="note">\${escapeHtml(r.technical.memo)}</span></td><td>\${r.flowScore.score}<span class="note">\${escapeHtml(r.flowScore.memo)}</span></td><td>\${escapeHtml(r.entryPlan.action)}<span class="note">\${escapeHtml((r.risk.notes||[]).join(" · "))}</span></td></tr>\`).join("");}
    document.querySelector("#search").addEventListener("input",e=>{search=e.target.value;renderAll()});document.querySelector("#sourceList").innerHTML=DATA.sources.map(s=>\`<a href="\${escapeHtml(s.url)}" target="_blank" rel="noreferrer"><strong>\${escapeHtml(s.title)}</strong><span>\${escapeHtml(s.url)}</span></a>\`).join("");
    function price(v){return v==null?"-":Number(v).toLocaleString("ko-KR")+"원"} function eok(v){return v==null?"-":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:0})+"억원"} function pct(v){return v==null?"-":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:1})+"%"} function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
    renderFilters();renderAll();
  </script>
</body>
</html>`;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return new TextDecoder("euc-kr").decode(await response.arrayBuffer());
}

function extractFirstTable(html) {
  const start = html.indexOf("<table");
  const end = html.indexOf("</table>", start);
  return start >= 0 && end >= 0 ? html.slice(start, end + 8) : "";
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

function parseMarketCapEok(html) {
  const direct = html.match(/id=["']_sise_market_sum["'][^>]*>([\s\S]*?)<\/span>\s*억/);
  if (direct) return parseNumber(strip(direct[1]));
  const idx = html.indexOf("시가총액");
  if (idx < 0) return null;
  const slice = strip(html.slice(idx, idx + 700));
  const eok = slice.match(/시가총액\s*([\d,]+)\s*억/);
  if (eok) return parseNumber(eok[1]);
  return parseKoreanEok(slice);
}

function parseListedShares(html) {
  const idx = html.indexOf("상장주식수");
  if (idx < 0) return null;
  const slice = strip(html.slice(idx, idx + 500));
  const match = slice.match(/상장주식수\s*([\d,]+)/);
  return match ? parseNumber(match[1]) : null;
}

function parseKoreanEok(text) {
  const value = String(text ?? "").replace(/\s+/g, "");
  if (!value) return null;
  const jo = value.match(/([\d,.]+)조/)?.[1];
  const eok = value.match(/([\d,.]+)억/)?.[1];
  return (jo ? parseFloat(jo.replace(/,/g, "")) * 10000 : 0) + (eok ? parseFloat(eok.replace(/,/g, "")) : 0) || null;
}

function parseAfterLabel(text, label) {
  const idx = text.indexOf(label);
  if (idx < 0) return null;
  const slice = text.slice(idx, idx + 80);
  const nums = slice.match(/-?\d+(?:\.\d+)?/g) ?? [];
  return nums.length ? Number(nums[0]) : null;
}

function dedupByDate(rows) {
  return [...new Map(rows.map((row) => [row.date, row])).values()];
}

function sma(values, n) {
  const arr = values.slice(-n).filter((x) => x != null);
  return arr.length ? round(arr.reduce((a, b) => a + b, 0) / arr.length, 2) : null;
}

function rsi(values, period) {
  const arr = values.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < arr.length; i += 1) {
    const diff = arr[i] - arr[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (!losses) return 100;
  const rs = gains / losses;
  return round(100 - 100 / (1 + rs), 2);
}

function pctChange(from, to) {
  if (from == null || to == null || !from) return null;
  return round((to - from) / from * 100, 4);
}

function average(values) {
  const arr = values.filter((x) => x != null);
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
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

function isForeignBroker(name) {
  return /제이피모간|모간|메릴|UBS|씨티|노무라|CS|골드만|홍콩|맥쿼리|다이와|SG/.test(name ?? "");
}

function formatPrice(value) {
  return value == null ? "-" : `${Number(value).toLocaleString("ko-KR")}원`;
}

function formatPct(value) {
  return value == null ? "-" : `${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}

function formatEok(value) {
  return value == null ? "-" : `${Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}억원`;
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
