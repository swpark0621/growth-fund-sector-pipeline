import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "v10-execution-dashboard-data.json");
const outputPath = path.join(root, "docs", "v10.html");
const RUN_NOW = new Date();
const RUN_DATE = formatSeoulDate(RUN_NOW);
const LONG_HISTORY_START = "20190101";
const FOREIGN_FLOW_PAGES = 14;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const BLACKROCK_EWY_URL = "https://www.ishares.com/us/products/239681/EWY";
const BLACKROCK_EWY_DOWNLOAD_URL = "https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api/v1/get-fund-document?appType=PRODUCT_PAGE&appSubType=ISHARES&targetSite=us-ishares&locale=en_US&portfolioId=239681&component=fundDownload&userType=individual";
const VANGUARD_TRUST_URL = "https://workplace.vanguard.com/content/dam/inst/iig-transformation/trust-financial-documents/Vanguard_Institutional_Total_International_Stock_Market_Index_Trust.pdf";
const SSGA_SPDW_URL = "https://www.ssga.com/us/en/intermediary/etfs/state-street-spdr-portfolio-developed-world-ex-us-etf-spdw";
const SSGA_SPDW_DOWNLOAD_URL = "https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spdw.xlsx";
const FSC_PUBLIC_FUND_URL = "https://www.fsc.go.kr/no010101/86834?curPage=2&srchBeginDt=&srchCtgry=&srchEndDt=&srchKey=&srchText=";
const FSC_APPROVAL_URL = "https://www.fsc.go.kr/no010101/87003";
const DART_LARGE_HOLDER_GUIDE_URL = "https://dart.fss.or.kr/info/main.do?menu=310";
const NAVER_BLACKROCK_DISCLOSURE_URL = "https://kind.krx.co.kr/external/2025/11/14/001550/20251114003439/11013.htm";
const FNGUIDE_COMPANY_URL = "https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx";
const VANGUARD_CONFIRMED_TICKERS = new Set([
  "319660", "012510", "030520", "204320", "012330", "005290", "011070", "336260", "108320", "265520",
  "307950", "036930", "403870", "035420", "373220", "006400", "298040", "454910", "240810", "058470",
  "064350", "272210", "214450", "078600", "012450", "068270", "095340", "103590", "035900", "010120",
  "041510", "047810", "000100", "237690", "039200", "277810", "267260", "302440", "206650", "352820",
  "207940", "042700", "348370", "278280", "298380", "247540", "196170", "005070", "003670", "066970",
  "141080"
]);
const DART_DISCLOSURES = new Map([
  ["035420", {
    manager: "BlackRock",
    holder: "BlackRock Fund Advisors",
    evidence: "DART_5PCT_DISCLOSURE",
    shares: 9592734,
    ownershipPct: 6.05,
    asOf: "2025-09-30",
    basis: "NAVER 2025년 3분기보고서의 5% 이상 주주 표기. BlackRock 수치는 2025-01-10 대량보유상황보고 기준.",
    sourceUrl: NAVER_BLACKROCK_DISCLOSURE_URL
  }]
]);
const STRUCTURAL_REGIME_OVERRIDES = new Map([
  ["265520", {
    confidence: 3,
    primaryEvent: "visionox-order",
    thesis: "OLED 장비 사이클 회복과 8.6G IT OLED 수주 확인. 장비주는 CAPEX 민감도가 높아 장기 복리형보다 사이클형 성격을 우선한다.",
    events: [
      {
        id: "oled-cycle",
        label: "IT OLED 투자 사이클 회복 시작",
        date: "2024-01-02",
        basis: "2024년 OLED 노트북·태블릿 확대와 8.6G 투자 기대를 반영한 업황 기준선.",
        sourceName: "한국IR협의회 AP시스템 리포트",
        sourceUrl: "https://w4.kirs.or.kr/download/research/250528_AP%EC%8B%9C%EC%8A%A4%ED%85%9C.pdf"
      },
      {
        id: "visionox-order",
        label: "비전옥스 8.6G ELA 단독 공급 확인",
        date: "2025-09-25",
        basis: "비전옥스 8.6세대 OLED 신규 라인 장비 공급과 생산능력 확대 확인 구간.",
        sourceName: "전자신문·디일렉",
        sourceUrl: "https://www.etnews.com/20250925000333"
      }
    ]
  }],
  ["030520", {
    confidence: 3,
    primaryEvent: "hancomdocs-ai",
    thesis: "패키지 오피스에서 AI·SaaS·Agentic OS로 정체성을 바꾸는 시도. 아직 장기 복리형으로 주가 검증이 충분하지 않다.",
    events: [
      {
        id: "hancomdocs-ai",
        label: "한컴독스 AI 정식 출시",
        date: "2024-09-30",
        basis: "구독형 문서 서비스에 생성형 AI를 결합한 상용 제품 출시일.",
        sourceName: "연합뉴스",
        sourceUrl: "https://www.yna.co.kr/view/AKR20240930066900017"
      },
      {
        id: "agentic-os",
        label: "AI Agent OS 전환 선언",
        date: "2026-05-19",
        basis: "사명 변경과 소버린 에이전틱 OS 전략 발표. 발표 후 기간이 짧아 보조 신호로만 둔다.",
        sourceName: "연합뉴스",
        sourceUrl: "https://www.yna.co.kr/view/AKR20260519092151017"
      }
    ]
  }],
  ["005290", {
    confidence: 4.5,
    primaryEvent: "euv-pr-qual",
    thesis: "포토레지스트 국산화에서 EUV PR까지 확장한 반도체 소재 기업. 고객사 공정 진입과 공급망 내재화가 장기 기준선이다.",
    events: [
      {
        id: "euv-pr-qual",
        label: "EUV PR 삼성 퀄 통과 보도",
        date: "2021-12-20",
        basis: "EUV 포토레지스트 개발 성공 및 삼성전자 신뢰성 시험 통과 보도 이후를 고부가 소재 기준선으로 본다.",
        sourceName: "전자신문",
        sourceUrl: "https://www.etnews.com/20211217000147"
      },
      {
        id: "negative-pr",
        label: "EUV 네거티브 PR 양산 착수",
        date: "2023-07-07",
        basis: "포지티브 PR에 이어 네거티브 PR 공급까지 확대된 확인 구간.",
        sourceName: "디일렉",
        sourceUrl: "https://www.thelec.kr/news/articleView.html?idxno=21931"
      }
    ]
  }],
  ["204320", {
    confidence: 3,
    primaryEvent: "electronics-mix",
    thesis: "기계식 샤시 부품사에서 전장·ADAS·IDB 중심으로 믹스가 바뀌는 구간. 변화는 점진적이라 기준일 신뢰도는 중간이다.",
    events: [
      {
        id: "electronics-mix",
        label: "전장 매출 비중 우위 기준연도",
        date: "2024-01-02",
        basis: "2024년 전장 부품 매출 비중이 기계 부품을 넘어선 것으로 보는 기준연도 시작선.",
        sourceName: "iM증권·뉴시스",
        sourceUrl: "https://file.alphasquare.co.kr/media/pdfs/company-report/_25072330-204320.pdf"
      },
      {
        id: "adas-order-mix",
        label: "ADAS·전장 신규수주 비중 확인",
        date: "2025-02-25",
        basis: "수주잔고와 신규 수주에서 ADAS 포함 전장 비중이 높아진 구간.",
        sourceName: "IB토마토·삼성증권",
        sourceUrl: "https://www.ibtomato.com/ExternalView.aspx?no=14272&type=1"
      }
    ]
  }],
  ["064350", {
    confidence: 5,
    primaryEvent: "poland-k2",
    thesis: "철도 중심 기업에서 K2 수출을 통한 방산 수주잔고 재평가가 붙은 케이스. 체질 전환 기준일이 가장 명확하다.",
    events: [
      {
        id: "poland-k2",
        label: "폴란드 K2 1차 실행계약",
        date: "2022-08-29",
        basis: "폴란드 군비청과 K2 전차 180대, 4조원대 계약을 체결한 첫 대형 수출 확인일.",
        sourceName: "현대로템 공식 블로그",
        sourceUrl: "https://blog.hyundai-rotem.co.kr/736"
      },
      {
        id: "order-backlog",
        label: "K-방산 수주잔고 재평가",
        date: "2025-05-07",
        basis: "폴란드 2차 계약 기대와 방산 수주잔고 재평가가 본격화된 구간.",
        sourceName: "연합뉴스",
        sourceUrl: "https://www.yna.co.kr/view/AKR20250504013800003"
      }
    ]
  }]
]);
const HOLDER_DIRECT_COSTS = new Map();

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
      const daily = await fetchLongDailyHistory(item.ticker);
      const flow = await fetchForeignHistory(item.ticker, FOREIGN_FLOW_PAGES);
      const [quote, ownership] = await Promise.all([
        fetchQuote(item.ticker),
        fetchOwnership(item.ticker)
      ]);
      quote.ownership = ownership;
      const merged = mergeHistory(applyCurrentQuote(daily, quote.currentQuote), flow);
      const row = evaluate(item, merged, quote);
      rows.push(row);
      console.log(`[${String(index + 1).padStart(3, "0")}/${universe.length}] ${item.company} ${item.ticker}: ${row.decision} ${row.totalScore} structural ${row.structuralRegime.score}`);
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

  const ranked = valid.sort((a, b) => b.v10cScore - a.v10cScore || b.totalScore - a.totalScore);
  const megaManagers = await buildMegaManagerSignals(ranked);
  const growthFundReview = buildGrowthFundReview(ranked);
  const entryList = ranked.filter((row) => row.decision === "ENTRY_OK").slice(0, 15);
  const triggerList = ranked.filter((row) => row.decision === "WAIT_TRIGGER").slice(0, 30);
  const avoidList = ranked.filter((row) => row.decision === "AVOID_NOW").slice(0, 30);
  const updatedAt = formatSeoulDateTime(new Date());

  const output = {
    meta: {
      title: "국민성장펀드 v10 체질·평단 제약 실행 대시보드",
      runDate: RUN_DATE,
      updatedAt,
      universeCount: universe.length,
      validCount: valid.length,
      methodology: "v7의 정책·가치·기술·수급 점수는 유지하되, v10은 ENTRY_OK에 체질 전환 기준선을 신규 제약으로 적용한다. holderCostScore는 총점과 기존 판단을 바꾸지 않는 별도 보조 점수이며, v10cScore=totalScore+holderCostScore로 별도 랭킹을 제공한다.",
      warning: "투자 권유가 아니라 후보 탐색과 실행 조건 점검표입니다. v10 ENTRY_OK는 기술 조건뿐 아니라 장기 체질 검증을 통과해야 하며, 대주주·기관 평단 추정은 Tier별 신뢰도를 반드시 함께 봐야 합니다."
    },
    market: await fetchMarketSnapshot(),
    rules: buildRules(),
    summary: summarize(ranked),
    growthFundReview,
    megaManagers,
    entryList,
    triggerList,
    avoidList,
    allRows: ranked,
    sources: [
      { title: "Naver Finance 시세·외국인/기관·거래원", url: "https://finance.naver.com/" },
      { title: "금융위원회 국민성장펀드 누적 승인자료", url: FSC_APPROVAL_URL },
      { title: "금융위원회 국민참여형·2026년 운용계획", url: FSC_PUBLIC_FUND_URL },
      { title: "DART 대량보유 5% 공시 기준", url: DART_LARGE_HOLDER_GUIDE_URL },
      { title: "KRX/DART NAVER 2025년 3분기보고서 BlackRock 6.05%", url: NAVER_BLACKROCK_DISCLOSURE_URL },
      { title: "FnGuide/Naver Company 주요주주", url: FNGUIDE_COMPANY_URL },
      { title: "BlackRock iShares MSCI South Korea ETF (EWY)", url: BLACKROCK_EWY_URL },
      { title: "Vanguard Institutional Total International Stock Market Index Trust holdings PDF", url: VANGUARD_TRUST_URL },
      { title: "State Street SPDW holdings", url: SSGA_SPDW_URL },
      { title: "체질 기준선 수동 이벤트: structural-regime 대시보드", url: "https://swpark0621.github.io/growth-fund-sector-pipeline/structural-regime.html" },
      { title: "Holder Cost 추정: DART 공시 직접·구간 VWAP·NO_DATA 계층", url: DART_LARGE_HOLDER_GUIDE_URL }
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
  const recentHighs = highs.slice(-60).filter(isPositiveNumber);
  const recentLows = lows.slice(-60).filter(isPositiveNumber);
  const high60 = recentHighs.length ? Math.max(...recentHighs, latest.close) : latest.close;
  const low60 = recentLows.length ? Math.min(...recentLows, latest.close) : latest.close;
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
  const baseDecision = decide(totalScore, technical, flowScore, risk, { latest, ma5, ma20, ma60, rsi14, ret20, drawdown60Pct });
  const structuralRegime = buildStructuralRegime(item, history, latest, ma200FromHistory(history), ma600FromHistory(history));
  const holderCost = buildHolderCostSignal(item, history, quote, latest.close);
  const decision = applyStructuralEntryGate(baseDecision, structuralRegime);
  const plan = entryPlan(decision, latest.close, ma5, ma20, ma60, low60, high60, rsi14, structuralRegime);
  const holderCostScore = holderCost.score;
  const v10cScore = Math.round(totalScore + holderCostScore);
  return {
    ...item,
    latestDate: latest.date,
    close: latest.close,
    marketCapEok: quote.marketCapEok,
    listedShares: quote.listedShares,
    per: quote.per,
    pbr: quote.pbr,
    roe: quote.roe,
    ownership: quote.ownership,
    priceSource: quote.currentQuote ? {
      source: quote.currentQuote.source,
      asOfDate: quote.currentQuote.asOfDate,
      asOfText: quote.currentQuote.asOfText,
      officialClose: quote.currentQuote.officialClose,
      alternateClose: quote.currentQuote.alternateClose
    } : null,
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
    baseDecision,
    decision,
    structuralRegime,
    holderCost,
    holderCostScore,
    v10cScore,
    entryPlan: plan,
    executionPlan: executionPlan(decision, latest.close, ma5, ma20, ma60, low60, high60, rsi14, ret5, ret20, flowScore, risk, holderCost, structuralRegime),
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

function applyStructuralEntryGate(baseDecision, structuralRegime) {
  if (baseDecision !== "ENTRY_OK") return baseDecision;
  return structuralRegime?.entryEligible ? "ENTRY_OK" : "WAIT_TRIGGER";
}

function buildStructuralRegime(item, history, latest, ma200, ma600) {
  const override = STRUCTURAL_REGIME_OVERRIDES.get(item.ticker);
  if (override) {
    const events = override.events.map((event) => analyzeStructuralEvent(event, history, latest, ma200, ma600, override.confidence));
    const primary = events.find((event) => event.id === override.primaryEvent) ?? events[0];
    const entryEligible = isStructuralEntryEligible(primary, "MANUAL_EVENT");
    return {
      mode: "MANUAL_EVENT",
      confidence: override.confidence,
      thesis: override.thesis,
      score: primary?.score ?? 0,
      grade: structuralGrade(primary?.score ?? 0),
      gate: structuralGate(primary, entryEligible),
      entryEligible,
      primary,
      events,
      memo: entryEligible
        ? `체질 기준선 통과: ${primary.label} 이후 ${formatPct(primary.returnPct)}`
        : `체질 기준선 미통과: ${primary?.label ?? "기준선"} 점수 ${primary?.score ?? 0}`
    };
  }

  const event = buildPriceOnlyStructuralEvent(item, history, latest, ma200, ma600);
  const entryEligible = isStructuralEntryEligible(event, "PRICE_ONLY");
  return {
    mode: "PRICE_ONLY",
    confidence: 2,
    thesis: "직접 사업 전환 이벤트가 아직 등록되지 않아 장기 가격 추세만 낮은 신뢰도로 평가한다.",
    score: event.score,
    grade: structuralGrade(event.score),
    gate: structuralGate(event, entryEligible),
    entryEligible,
    primary: event,
    events: [event],
    memo: entryEligible
      ? `가격 기반 장기 추세 통과: ${formatPct(event.returnPct)}`
      : `가격 기반 장기 추세 검증 대기: 점수 ${event.score}`
  };
}

function analyzeStructuralEvent(event, history, latest, ma200, ma600, confidence) {
  const basisRow = history.find((row) => row.date >= event.date) ?? history[0];
  const regimeRows = history.filter((row) => row.date >= basisRow.date);
  return structuralMetrics(event, regimeRows, basisRow, latest, ma200, ma600, confidence, "검증 기준선");
}

function buildPriceOnlyStructuralEvent(item, history, latest, ma200, ma600) {
  const basisRow = history.length >= 600 ? history.at(-600) : history[0];
  const regimeRows = history.filter((row) => row.date >= basisRow.date);
  return structuralMetrics({
    id: "price-regime",
    label: "가격 기반 장기 추세 기준선",
    date: basisRow.date,
    basis: "직접 사업 전환 이벤트 미등록 종목은 최근 약 600거래일 가격 추세를 낮은 신뢰도로만 평가한다.",
    sourceName: "Naver Finance daily price",
    sourceUrl: `https://finance.naver.com/item/main.naver?code=${item.ticker}`
  }, regimeRows, basisRow, latest, ma200, ma600, 2, "가격 추세");
}

function structuralMetrics(event, regimeRows, basisRow, latest, ma200, ma600, confidence, durationDefault) {
  const high = regimeRows.reduce((memo, row) => row.close > memo.close ? row : memo, regimeRows[0]);
  const low = regimeRows.reduce((memo, row) => row.close < memo.close ? row : memo, regimeRows[0]);
  const days = daysBetween(basisRow.date, latest.date);
  const returnPct = pctChange(basisRow.close, latest.close);
  const cagrPct = cagr(basisRow.close, latest.close, days);
  const drawdownFromHighPct = pctChange(high.close, latest.close);
  const maxDrawdownPct = maxDrawdown(regimeRows);
  const aboveMA200 = ma200 != null ? latest.close >= ma200 : null;
  const aboveMA600 = ma600 != null ? latest.close >= ma600 : null;
  const score = structuralScore({ returnPct, cagrPct, drawdownFromHighPct, maxDrawdownPct, aboveMA200, aboveMA600, days, confidence });
  return {
    ...event,
    firstTradingDate: basisRow.date,
    basisClose: basisRow.close,
    latestClose: latest.close,
    latestDate: latest.date,
    days: Math.round(days),
    returnPct: round(returnPct, 1),
    cagrPct: round(cagrPct, 1),
    highClose: high.close,
    highDate: high.date,
    lowClose: low.close,
    lowDate: low.date,
    drawdownFromHighPct: round(drawdownFromHighPct, 1),
    maxDrawdownPct: round(maxDrawdownPct, 1),
    aboveMA200,
    aboveMA600,
    score,
    grade: structuralGrade(score),
    durationFlag: days < 180 ? "검증 기간 매우 짧음" : days < 365 ? "1년 미만 검증" : durationDefault
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

  const durationCap = metric.days < 180 ? 50 : metric.days < 365 ? 65 : 100;
  return Math.max(0, Math.min(durationCap, Math.round(score)));
}

function isStructuralEntryEligible(primary, mode) {
  if (!primary) return false;
  if (mode === "MANUAL_EVENT") {
    return primary.score >= 65 && primary.days >= 180 && (primary.aboveMA200 || primary.aboveMA600) && primary.drawdownFromHighPct >= -45;
  }
  return primary.score >= 70 && primary.aboveMA200 && primary.aboveMA600 && primary.returnPct > 0 && primary.drawdownFromHighPct >= -45;
}

function structuralGate(primary, entryEligible) {
  if (!primary) return "NO_DATA";
  if (entryEligible) return "PASS";
  if (primary.score >= 50) return "REVIEW";
  return "BLOCK";
}

function structuralGrade(score) {
  if (score >= 80) return "구조적 우상향 검증 강함";
  if (score >= 65) return "체질 개선 인정, 진입가 관리 필요";
  if (score >= 50) return "전환 스토리/가격 검증 부족";
  return "장기 보유보다 이벤트·트레이딩 우선";
}

function buildHolderCostSignal(item, history, quote, close) {
  const direct = HOLDER_DIRECT_COSTS.get(item.ticker);
  if (direct) return scoreHolderCost({
    tier: "A",
    coefficient: 1,
    source: direct.source,
    estimatedCost: direct.cost,
    holderName: direct.holderName,
    recentAccumulation: true,
    disposalPressure: false,
    method: "공시 직접 취득/처분 단가 가중평균"
  }, close);

  const topHolders = quote.ownership?.topHolders ?? [];
  const actionableHolders = topHolders.filter((holder) => isActionableHolder(holder.name));
  const institutionCost = positiveFlowCost(history, "institutionNetShares", 240);
  const foreignCost = positiveFlowCost(history, "foreignNetShares", 240);
  const candidates = [];
  if (actionableHolders.length && institutionCost) {
    candidates.push({
      tier: "B",
      coefficient: 0.7,
      source: "주요주주 기관명 + 최근 기관 순매수 VWAP",
      estimatedCost: institutionCost.cost,
      holderName: actionableHolders.map((holder) => holder.name).join(", "),
      recentAccumulation: institutionCost.netShares > 0,
      disposalPressure: institutionCost.last20NetShares < 0,
      flow: institutionCost,
      method: "구간 추정: 최근 순매수 발생일의 거래량가중 매입가"
    });
  }
  if (foreignCost && hasForeignAccumulation(history)) {
    candidates.push({
      tier: "B",
      coefficient: 0.7,
      source: "외국인 보유율 증가 + 최근 외국인 순매수 VWAP",
      estimatedCost: foreignCost.cost,
      holderName: "외국인 투자자군",
      recentAccumulation: foreignCost.netShares > 0,
      disposalPressure: foreignCost.last20NetShares < 0,
      flow: foreignCost,
      method: "구간 추정: 외국인 순매수 VWAP"
    });
  }

  if (candidates.length) {
    const scored = candidates.map((candidate) => scoreHolderCost(candidate, close));
    return scored.toSorted((a, b) => b.score - a.score)[0];
  }

  const ownerOnly = topHolders.length > 0 && actionableHolders.length === 0;
  return {
    tier: ownerOnly ? "C" : "NO_DATA",
    coefficient: ownerOnly ? 0.3 : 0,
    score: 0,
    signal: "NO_DATA",
    estimatedCost: null,
    gapPct: null,
    holderName: ownerOnly ? quote.ownership.majorHolderName : null,
    source: ownerOnly ? "오너·지주회사·상장 전 지분 가능성" : "평단 추정 근거 부족",
    method: ownerOnly ? "프록시: 오너 지분은 평단 자체가 실전 지지선으로 부적합" : "NO_DATA",
    memo: ownerOnly ? "오너 지분은 평단가보다 지배구조·유통물량으로 해석" : "국민연금·운용사·외국계 5% 주주의 추정 평단 근거가 부족"
  };
}

function scoreHolderCost(candidate, close) {
  const gapPct = pctChange(candidate.estimatedCost, close);
  let raw = 0;
  if (gapPct >= -10 && gapPct <= 30) raw += 18;
  else if (gapPct >= -20 && gapPct <= 50) raw += 10;
  else if (gapPct < -20) raw += 3;
  if (candidate.recentAccumulation && gapPct >= -15 && gapPct <= 35) raw += 8;
  if (candidate.holderName && candidate.holderName !== "외국인 투자자군") raw += 4;
  const overhang = gapPct >= 50 && candidate.disposalPressure;
  if (overhang) raw -= 12;
  const score = Math.round(clamp(raw * candidate.coefficient, 0, 30));
  const signal = overhang ? "OVERHANG" : score >= 14 ? "ACCUMULATION" : score > 0 ? "NEUTRAL" : "NO_DATA";
  return {
    ...candidate,
    score,
    signal,
    gapPct: round(gapPct, 1),
    estimatedCost: round(candidate.estimatedCost, 0),
    overhang,
    memo: holderCostMemo(signal, candidate, gapPct, score)
  };
}

function positiveFlowCost(history, shareKey, lookback) {
  const rows = history
    .slice(-lookback)
    .filter((row) => Number.isFinite(row[shareKey]) && Number.isFinite(row.close));
  const positiveRows = rows.filter((row) => row[shareKey] > 0);
  const shares = sum(positiveRows.map((row) => row[shareKey]));
  if (shares <= 0) return null;
  const cost = sum(positiveRows.map((row) => row.close * row[shareKey])) / shares;
  const netShares = sum(rows.map((row) => row[shareKey]));
  const last20NetShares = sum(rows.slice(-20).map((row) => row[shareKey]));
  const firstDate = rows[0]?.date ?? null;
  const lastDate = rows.at(-1)?.date ?? null;
  return {
    cost,
    shares,
    netShares,
    last20NetShares,
    firstDate,
    lastDate,
    days: rows.length
  };
}

function hasForeignAccumulation(history) {
  const rows = history.slice(-240).filter((row) => row.foreignHoldingRatePct != null);
  if (rows.length < 20) return false;
  const delta = rows.at(-1).foreignHoldingRatePct - rows[0].foreignHoldingRatePct;
  return delta >= 0.15 || sum(rows.slice(-60).map((row) => row.foreignNetShares)) > 0;
}

function isActionableHolder(name) {
  const text = String(name ?? "");
  if (!text || /자사주|우리사주|외\s*\d+인/.test(text)) return false;
  return /국민연금|자산운용|투자신탁|신탁운용|투자자문|BlackRock|Vanguard|State Street|SSGA|FMR|미래에셋|삼성액티브|삼성자산|KB자산|한국투자|트러스톤|베어링|템플턴|연기금|보험|은행/i.test(text);
}

function holderCostMemo(signal, candidate, gapPct, score) {
  const gapText = formatPct(gapPct);
  const roundedCost = round(candidate.estimatedCost, 0);
  if (signal === "ACCUMULATION") return `${candidate.tier} 추정 평단 ${formatPrice(roundedCost)} 대비 ${gapText}. 현재가가 스마트머니 비용권 근처라 지지 기대 점수 ${score}점`;
  if (signal === "OVERHANG") return `${candidate.tier} 추정 평단 ${formatPrice(roundedCost)} 대비 ${gapText} 수익권이며 최근 처분 압력 감지. 오버행 주의`;
  return `${candidate.tier} 추정 평단 ${formatPrice(roundedCost)} 대비 ${gapText}. 방향성은 중립`;
}

function entryPlan(decision, close, ma5, ma20, ma60, low60, high60, rsi14, structuralRegime = null) {
  const stop = Math.max(low60 * 0.97, close * 0.9);
  if (decision === "ENTRY_OK") {
    return {
      action: "분할 진입 가능",
      trigger: `현 가격대 ${formatPrice(close)}에서 40%, MA20 ${formatPrice(ma20)} 재확인 후 30%, 직전 고점 돌파 시 30%`,
      invalidation: `종가가 MA20 ${formatPrice(ma20)} 아래로 재이탈하거나 손절 기준 ${formatPrice(stop)} 하회`,
      target: `1차 ${formatPrice(ma60)}, 2차 60일 고점 ${formatPrice(high60)} 부근`
    };
  }
  if (decision === "WAIT_TRIGGER") {
    if (structuralRegime && !structuralRegime.entryEligible) {
      return {
        action: "체질 검증 대기",
        trigger: `체질 점수 ${structuralRegime.score}점 ${structuralRegime.gate}. ${structuralRegime.primary?.label ?? "기준선"} 이후 우상향 검증 필요`,
        invalidation: `장기 기준선 미통과 상태에서 MA20 ${formatPrice(ma20)} 재이탈 또는 60일 저점 ${formatPrice(low60)} 이탈`,
        target: `기술 반등은 가능하나 장기 보유 전환은 체질 점수 65점 이상 필요`
      };
    }
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

function executionPlan(decision, close, ma5, ma20, ma60, low60, high60, rsi14, ret5, ret20, flowScore, risk, holderCost = null, structuralRegime = null) {
  const hardStop = round(Math.max(low60 * 0.97, close * 0.9), 0);
  const softStop = round(Math.max(ma20 * 0.995, close * 0.94), 0);
  const overheat = ret5 >= 20 || ret20 >= 35 || rsi14 >= 63;
  const addPrice = round(overheat ? Math.max(ma20, close * 0.96) : ma20, 0);
  const trimPrice = round(high60 > close ? Math.min(high60 * 0.98, close * 1.08) : close * 1.055, 0);
  const targetPrice = round(high60 > close ? Math.min(high60, close * 1.15) : close * 1.12, 0);
  const weakFlow = (flowScore?.score ?? 0) <= 4;
  const entryWeight = overheat ? "20~25%" : "35~40%";
  const secondWeight = overheat ? "25%" : "30%";
  const addWeight = overheat ? "잔여 50%는 종가 확인 후" : "돌파 시 30%";
  const stance = decision === "ENTRY_OK"
    ? overheat ? "조건부 소액 진입" : "분할 진입 가능"
    : decision === "WAIT_TRIGGER" ? "트리거 대기" : "관망";
  const marketRule = "KOSPI -2% 또는 KOSDAQ -1.5% 이하 전환 시 신규 진입 중단, 수익권 물량 30% 이상 회수";

  const plan = {
    stance,
    isOverheated: overheat,
    isWeakFlow: weakFlow,
    levels: [
      { label: "손절", kind: "stop", price: hardStop },
      { label: "축소", kind: "softStop", price: softStop },
      { label: "추가", kind: "add", price: addPrice },
      ...(holderCost?.estimatedCost ? [{ label: "평단", kind: "holderCost", price: holderCost.estimatedCost }] : []),
      { label: "현재", kind: "now", price: close },
      { label: "1차 회수", kind: "trim", price: trimPrice },
      { label: "2차 목표", kind: "target", price: targetPrice }
    ].sort((a, b) => a.price - b.price),
    buySteps: [
      {
        label: "1차 진입",
        weight: entryWeight,
        price: close,
        rule: overheat
          ? "장초반 급등 추격 금지. 시초가·VWAP 위 30분 유지 시에만 소액"
          : "현재가 부근에서 1차만 집행하고 지수 방향 확인"
      },
      {
        label: "2차 진입",
        weight: secondWeight,
        price: addPrice,
        rule: overheat
          ? `${formatPrice(addPrice)} 부근 눌림 후 시초가·VWAP 회복`
          : `MA20 ${formatPrice(ma20)} 재확인 또는 눌림 후 양봉 전환`
      },
      {
        label: "추가 진입",
        weight: addWeight,
        price: high60,
        rule: "직전 고점 재돌파가 거래량과 함께 나올 때만"
      }
    ],
    sellSteps: [
      {
        label: "장초반 급등 대응",
        action: "신규 매수 금지 / 보유분 30~50% 회수",
        trigger: "전일 종가 대비 +10% 이상 급등 후 고점 갱신 실패"
      },
      {
        label: "1차 익절",
        action: "30% 회수",
        trigger: `${formatPrice(trimPrice)} 부근 또는 장중 긴 윗꼬리 발생`
      },
      {
        label: "방어 매도",
        action: "잔여 30~50% 축소",
        trigger: `${formatPrice(softStop)} 이탈 또는 시초가·VWAP 동시 이탈`
      },
      {
        label: "손절",
        action: "잔여 전량 정리",
        trigger: `${formatPrice(hardStop)} 하회 또는 종가 MA20 재이탈`
      }
    ],
    sessionRules: [
      { window: "장초반", rule: "갭 상승·급등은 보유분 회수 기회로 먼저 본다" },
      { window: "장중", rule: "시초가와 VWAP 위에서 버티면 유지, 둘 다 깨면 축소" },
      { window: "종가", rule: "MA20 위 안착이면 보유, MA20 아래면 다음 날 재평가" }
    ],
    riskSwitches: [
      overheat ? "단기 과열: 기본 진입 비중 절반 이하" : "과열 낮음: 분할 기준 유지",
      weakFlow ? "수급 약함: 추가 진입은 종가 확인 후" : "수급 보조 신호 양호",
      structuralRegime ? `체질 기준: ${structuralRegime.gate} · ${structuralRegime.score}점 · ${structuralRegime.primary?.label ?? "-"}` : "체질 기준 미확인",
      holderCost ? `평단 신호: ${holderCost.signal} · ${holderCost.score}점 · ${holderCost.memo}` : "평단 신호 미확인",
      risk?.notes?.length ? `리스크: ${risk.notes.join(" · ")}` : "특이 리스크 없음",
      marketRule
    ]
  };

  if (decision !== "ENTRY_OK") {
    return {
      ...plan,
      buySteps: [
        { label: "대기", weight: "0%", price: close, rule: "종가 기준 트리거 충족 전 신규 진입 보류" },
        { label: "확인", weight: "관찰", price: ma20, rule: `MA20 ${formatPrice(ma20)} 회복 또는 5일선 ${formatPrice(ma5)} 위 양봉` }
      ],
      sellSteps: [
        { label: "보유자 대응", action: "반등 시 비중 축소", trigger: "고점 재돌파 실패 또는 시초가 이탈" },
        { label: "무효", action: "신규 검토 중단", trigger: `60일 저점 ${formatPrice(low60)} 이탈` }
      ]
    };
  }

  return plan;
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

async function fetchLongDailyHistory(ticker) {
  const end = RUN_DATE.replaceAll("-", "");
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=${ticker}&requestType=1&startTime=${LONG_HISTORY_START}&endTime=${end}&timeframe=day`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": `https://finance.naver.com/item/main.naver?code=${ticker}`
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = await response.text();
  const raw = Function(`return (${text})`)();
  return raw.slice(1)
    .filter(Array.isArray)
    .map((row) => ({
      date: formatNaverDate(String(row[0])),
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
      volume: row[5]
    }))
    .filter((row) => Number.isFinite(row.close))
    .sort((a, b) => a.date.localeCompare(b.date));
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
  const mainUrl = `https://finance.naver.com/item/main.naver?code=${ticker}`;
  const [mainHtml, siseHtml, mainUtf8Html] = await Promise.all([
    fetchText(mainUrl),
    fetchText(`https://finance.naver.com/item/sise.naver?code=${ticker}`),
    fetchUtf8Text(mainUrl)
  ]);
  const marketCapEok = parseMarketCapEok(siseHtml) ?? parseMarketCapEok(mainHtml);
  const listedShares = parseListedShares(siseHtml);
  const tableText = strip(mainHtml);
  const per = parseAfterLabel(tableText, "PER");
  const pbr = parseAfterLabel(tableText, "PBR");
  const roe = parseAfterLabel(tableText, "ROE");
  return { marketCapEok, listedShares, per, pbr, roe, currentQuote: parseCurrentQuote(mainUtf8Html) };
}

function parseCurrentQuote(html) {
  const text = strip(html);
  const asOf = text.match(/종목 시세 정보\s+(\d{4})년\s+(\d{2})월\s+(\d{2})일\s+(\d{2})시\s+(\d{2})분 기준\s+([^\s]+)/);
  const asOfDate = asOf ? `${asOf[1]}-${asOf[2]}-${asOf[3]}` : null;
  const asOfText = asOf ? `${asOf[1]}-${asOf[2]}-${asOf[3]} ${asOf[4]}:${asOf[5]} ${asOf[6]}` : null;
  const chartIndex = text.indexOf("종목 시세 차트");
  const quoteSection = chartIndex >= 0 ? text.slice(0, chartIndex) : text.slice(0, 3000);
  const blocks = [];
  const quotePattern = /오늘의시세\s+([\d,]+)\s+포인트[\s\S]{0,360}?주요 시세\s+전일\s+([\d,]+)[\s\S]*?고가\s+([\d,]+)[\s\S]*?거래량\s+([\d,]+)[\s\S]*?시가\s+([\d,]+)[\s\S]*?저가\s+([\d,]+)/g;
  for (const match of quoteSection.matchAll(quotePattern)) {
    blocks.push({
      close: parseNumber(match[1]),
      previousClose: parseNumber(match[2]),
      high: parseNumber(match[3]),
      volume: parseNumber(match[4]),
      open: parseNumber(match[5]),
      low: parseNumber(match[6])
    });
  }

  if (!blocks.length) {
    const headline = quoteSection.match(/현재가\s+([\d,]+)[\s\S]*?시가\s+([\d,]+)[\s\S]*?고가\s+([\d,]+)[\s\S]*?저가\s+([\d,]+)[\s\S]*?거래량\s+([\d,]+)/);
    if (headline) {
      blocks.push({
        close: parseNumber(headline[1]),
        open: parseNumber(headline[2]),
        high: parseNumber(headline[3]),
        low: parseNumber(headline[4]),
        volume: parseNumber(headline[5])
      });
    }
  }

  const selected = blocks[1] ?? blocks[0] ?? null;
  if (!selected?.close) return null;
  return {
    ...selected,
    source: blocks[1] ? "NXT" : "KRX",
    asOfDate,
    asOfText,
    officialClose: blocks[0]?.close ?? null,
    alternateClose: blocks[1]?.close ?? null
  };
}

function applyCurrentQuote(history, currentQuote) {
  if (!currentQuote?.close || !history.length) return history;
  const rows = history.map((row) => ({ ...row }));
  const latest = rows.at(-1);
  const date = currentQuote.asOfDate ?? latest.date ?? RUN_DATE;
  if (date < latest.date && !rows.some((row) => row.date === date)) return rows;
  const open = isPositiveNumber(currentQuote.open) ? currentQuote.open : currentQuote.close;
  const high = isPositiveNumber(currentQuote.high) ? currentQuote.high : currentQuote.close;
  const low = isPositiveNumber(currentQuote.low) ? currentQuote.low : currentQuote.close;
  const volume = isPositiveNumber(currentQuote.volume) ? currentQuote.volume : latest.volume;
  const currentHigh = Math.max(
    currentQuote.close,
    open,
    high
  );
  const currentLow = Math.min(
    currentQuote.close,
    open,
    low
  );
  const patch = {
    date,
    open,
    high: currentHigh,
    low: currentLow,
    close: currentQuote.close,
    volume,
    priceSource: currentQuote.source
  };
  const index = rows.findIndex((row) => row.date === date);
  if (index >= 0) {
    const original = rows[index];
    rows[index] = {
      ...original,
      ...patch,
      open,
      high: Math.max(isPositiveNumber(original.high) ? original.high : currentHigh, currentHigh),
      low: Math.min(isPositiveNumber(original.low) ? original.low : currentLow, currentLow),
      volume,
      officialClose: currentQuote.officialClose ?? original.close
    };
  } else {
    rows.push(patch);
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchOwnership(ticker) {
  const sourceUrl = `${FNGUIDE_COMPANY_URL}?cmp_cd=${ticker}&target=finsum_more`;
  try {
    const html = await fetchUtf8Text(sourceUrl);
    const table = extractTableByCaptionContains(html, "주요주주명");
    if (!table) return { sourceUrl, topHolders: [], majorHolderName: null, majorHolderPct: null, memo: "주요주주 표 미확인" };
    const topHolders = parseOwnershipRows(table);
    const major = topHolders[0] ?? null;
    return {
      sourceUrl,
      topHolders,
      majorHolderName: major?.name ?? null,
      majorHolderShares: major?.shares ?? null,
      majorHolderPct: major?.pct ?? null,
      topHolderPct: round(sum(topHolders.map((holder) => holder.pct)), 2),
      memo: ownershipMemo(major?.pct)
    };
  } catch (error) {
    return { sourceUrl, topHolders: [], majorHolderName: null, majorHolderPct: null, error: error.message, memo: "주요주주 조회 실패" };
  }
}

function parseOwnershipRows(table) {
  const rows = [];
  for (const tr of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => strip(match[1]));
    if (cells.length < 3) continue;
    const shares = parseNumber(cells[1]);
    const pct = parseNumber(cells[2]);
    if (pct == null) continue;
    const title = tr.match(/<td[^>]*\btitle="([^"]*)"/)?.[1];
    const rawName = decodeXml(title || cells[0]).replace(/\s+/g, " ").trim();
    const name = dedupeRepeatedHolderName(rawName);
    rows.push({ name, shares, pct });
  }
  return rows;
}

function dedupeRepeatedHolderName(name) {
  const text = String(name ?? "").trim();
  if (!text) return "";
  const half = Math.floor(text.length / 2);
  if (text.length % 2 === 0 && text.slice(0, half) === text.slice(half)) return text.slice(0, half).trim();
  const parts = text.split(" ");
  if (parts.length % 2 === 0) {
    const left = parts.slice(0, parts.length / 2).join(" ");
    const right = parts.slice(parts.length / 2).join(" ");
    if (left === right) return left;
  }
  return text;
}

function ownershipMemo(pct) {
  if (pct == null) return "대주주 지분 미확인";
  if (pct >= 50) return "대주주 지분 매우 높음";
  if (pct >= 35) return "대주주 지분 높음";
  if (pct >= 20) return "대주주 지분 보통 이상";
  if (pct >= 10) return "대주주 지분 낮은 편";
  return "대주주 지분 매우 낮음";
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
  row.v10cScore = Math.round(row.totalScore + (row.holderCostScore ?? 0));
  row.baseDecision = decide(row.totalScore, row.technical, row.flowScore, row.risk, {
    latest: { close: row.close },
    ma20: row.technicals.ma20,
    ma60: row.technicals.ma60,
    rsi14: row.technicals.rsi14,
    ret20: row.returns.d20,
    drawdown60Pct: row.technicals.drawdown60Pct
  });
  row.decision = applyStructuralEntryGate(row.baseDecision, row.structuralRegime);
  row.entryPlan = entryPlan(
    row.decision,
    row.close,
    row.technicals.ma5,
    row.technicals.ma20,
    row.technicals.ma60,
    row.technicals.low60,
    row.technicals.high60,
    row.technicals.rsi14,
    row.structuralRegime
  );
  row.executionPlan = executionPlan(
    row.decision,
    row.close,
    row.technicals.ma5,
    row.technicals.ma20,
    row.technicals.ma60,
    row.technicals.low60,
    row.technicals.high60,
    row.technicals.rsi14,
    row.returns.d5,
    row.returns.d20,
    row.flowScore,
    row.risk,
    row.holderCost,
    row.structuralRegime
  );
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
    "v10은 v7 totalScore를 유지하되 ENTRY_OK에 체질 전환 기준선 PASS를 신규 제약으로 추가한다.",
    "체질 전환 기준선은 공시·리포트·뉴스 근거가 있는 종목은 수동 이벤트일을 쓰고, 그 외 종목은 가격 기반 장기 추세를 낮은 신뢰도로 표시한다.",
    "Holder Cost Score는 0~30점 별도 보조 점수다. totalScore와 baseDecision은 바꾸지 않고 v10cScore=totalScore+holderCostScore로 별도 랭킹만 만든다.",
    "평단 추정은 Tier A 공시 직접, Tier B 구간 VWAP 추정, Tier C 오너·상장 전 지분 프록시/NO_DATA로 나누며 신뢰도 계수 A=1.0, B=0.7, C=0.3을 적용한다.",
    "정책 적합성은 최대 25점으로 제한한다. 정책 테마만으로 매수하지 않는다.",
    "가치·안정성은 시총 구간, PER/PBR 확인 가능성, 초소형 리스크를 반영한다.",
    "적자+고PBR, PBR 10배 초과, PER 60배 초과는 점수가 높아도 즉시 진입에서 제외한다.",
    "기술적 조건은 MA20 회복, RSI 35~58, 60일 고점 대비 적정 조정, 20일 낙폭 과다 여부를 본다.",
    "외국인·기관 5일/20일 수급은 보조 점수다. 거래원은 최종 투자자 확인이 아니므로 3점 이내로만 반영한다.",
    "대주주 비율은 유통물량·지배구조 참고 항목으로 표시하되, 단독 진입 신호로 쓰지 않는다.",
    "진입 가능 종목은 진입가보다 먼저 매도·축소 조건을 정한다. 장초반 +10% 급등, 긴 윗꼬리, 시초가·VWAP 이탈은 비중 축소 신호다.",
    "ENTRY_OK도 급락장에서는 40/30/30 분할 진입이며, MA20 이탈 또는 60일 저점 이탈 시 무효다."
  ];
}

function summarize(rows) {
  const count = (decision) => rows.filter((row) => row.decision === decision).length;
  const baseCount = (decision) => rows.filter((row) => row.baseDecision === decision).length;
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
    baseEntryOk: baseCount("ENTRY_OK"),
    structuralDowngraded: rows.filter((row) => row.baseDecision === "ENTRY_OK" && row.decision !== "ENTRY_OK").length,
    structuralPass: rows.filter((row) => row.structuralRegime?.gate === "PASS").length,
    holderAccumulation: rows.filter((row) => row.holderCost?.signal === "ACCUMULATION").length,
    holderOverhang: rows.filter((row) => row.holderCost?.signal === "OVERHANG").length,
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

async function buildMegaManagerSignals(rows) {
  const [blackRockResult, ssgaResult] = await Promise.allSettled([
    fetchBlackRockEwyHoldings(),
    fetchStateStreetSpdwHoldings()
  ]);
  const blackRock = blackRockResult.status === "fulfilled" ? blackRockResult.value : { asOf: null, holdings: new Map(), error: blackRockResult.reason?.message };
  const ssga = ssgaResult.status === "fulfilled" ? ssgaResult.value : { asOf: null, holdings: new Map(), error: ssgaResult.reason?.message };

  for (const row of rows) {
    const managers = [];
    const blackRockHolding = blackRock.holdings.get(row.ticker);
    if (blackRockHolding) {
      managers.push({
        manager: "BlackRock",
        managerGroup: "BlackRock",
        vehicle: "iShares MSCI South Korea ETF (EWY)",
        evidence: "ETF_HOLDING",
        asOf: blackRock.asOf,
        weightPct: blackRockHolding.weightPct,
        shares: blackRockHolding.shares,
        holdingName: blackRockHolding.name,
        sourceUrl: BLACKROCK_EWY_URL
      });
    }
    if (VANGUARD_CONFIRMED_TICKERS.has(row.ticker)) {
      managers.push({
        manager: "Vanguard",
        managerGroup: "Vanguard",
        vehicle: "Institutional Total International Stock Market Index Trust",
        evidence: "INDEX_TRUST_HOLDING",
        asOf: "2025-10-31",
        weightPct: null,
        shares: null,
        holdingName: row.company,
        sourceUrl: VANGUARD_TRUST_URL
      });
    }
    const ssgaHolding = ssga.holdings.get(row.ticker);
    if (ssgaHolding) {
      managers.push({
        manager: "SSGA/State Street",
        managerGroup: "SSGA",
        vehicle: "SPDR Portfolio Developed World ex-US ETF (SPDW)",
        evidence: "ETF_HOLDING",
        asOf: ssga.asOf,
        weightPct: ssgaHolding.weightPct,
        shares: ssgaHolding.shares,
        holdingName: ssgaHolding.name,
        sourceUrl: SSGA_SPDW_URL
      });
    }

    const largeHolderDisclosure = DART_DISCLOSURES.get(row.ticker) ?? null;
    const managerGroups = new Set(managers.map((item) => item.managerGroup));
    if (largeHolderDisclosure) managerGroups.add("BlackRock");
    const hasAllThree = ["BlackRock", "Vanguard", "SSGA"].every((name) => managerGroups.has(name));
    const score = managers.length + (largeHolderDisclosure ? 4 : 0);
    row.megaManagers = {
      score,
      managerCount: managerGroups.size,
      status: megaManagerStatus(managerGroups.size, hasAllThree, largeHolderDisclosure),
      managers,
      largeHolderDisclosure,
      interpretation: megaManagerInterpretation(managerGroups.size, hasAllThree, largeHolderDisclosure)
    };
  }

  const withSignal = rows.filter((row) => row.megaManagers.managerCount > 0);
  const hasGroup = (row, group) => {
    if (group === "BlackRock" && row.megaManagers.largeHolderDisclosure) return true;
    return row.megaManagers.managers.some((item) => item.managerGroup === group);
  };
  return {
    asOf: RUN_DATE,
    caveat: "ETF·인덱스 보유는 지수 편입·상품 운용 신호이며, 특정 종목을 능동적으로 매집했다는 증거가 아닙니다. DART 5% 이상 공시는 더 강한 보유 증거지만 신규 매수 시점과는 구분해야 합니다.",
    sourceStatus: {
      blackRockEwy: blackRock.error ? `failed: ${blackRock.error}` : `ok · ${blackRock.asOf}`,
      vanguardTrust: "ok · 2025-10-31 official holdings PDF",
      ssgaSpdw: ssga.error ? `failed: ${ssga.error}` : `ok · ${ssga.asOf}`
    },
    summary: {
      withAny: withSignal.length,
      allThree: withSignal.filter((row) => row.megaManagers.managerCount >= 3).length,
      blackRock: rows.filter((row) => hasGroup(row, "BlackRock")).length,
      vanguard: rows.filter((row) => hasGroup(row, "Vanguard")).length,
      ssga: rows.filter((row) => hasGroup(row, "SSGA")).length,
      dartLargeHolder: rows.filter((row) => row.megaManagers.largeHolderDisclosure).length,
      topRows: withSignal
        .toSorted((a, b) => b.megaManagers.score - a.megaManagers.score || b.totalScore - a.totalScore)
        .slice(0, 35)
        .map((row) => ({
          ticker: row.ticker,
          company: row.company,
          sector: row.sector,
          decision: row.decision,
          totalScore: row.totalScore,
          status: row.megaManagers.status,
          managerCount: row.megaManagers.managerCount,
          managers: row.megaManagers.managers.map((item) => ({
            manager: item.manager,
            vehicle: item.vehicle,
            evidence: item.evidence,
            asOf: item.asOf,
            weightPct: item.weightPct,
            shares: item.shares
          })),
          largeHolderDisclosure: row.megaManagers.largeHolderDisclosure,
          interpretation: row.megaManagers.interpretation
        }))
    }
  };
}

function megaManagerStatus(managerCount, hasAllThree, largeHolderDisclosure) {
  if (largeHolderDisclosure) return "DART 5% 이상 공시 확인";
  if (hasAllThree) return "3대 운용사 상품 보유 확인";
  if (managerCount >= 2) return "복수 운용사 상품 보유 확인";
  if (managerCount === 1) return "단일 운용사 상품 보유 확인";
  return "공개 소스상 미확인";
}

function megaManagerInterpretation(managerCount, hasAllThree, largeHolderDisclosure) {
  if (largeHolderDisclosure) return "공시급 보유 증거입니다. 다만 기존 보유·비율 변동 공시와 신규 매수 시점은 분리해서 봅니다.";
  if (hasAllThree) return "3대 운용사 모두에서 확인되지만, 대부분 패시브 ETF·인덱스 편입 신호입니다.";
  if (managerCount >= 2) return "복수 글로벌 운용사 상품 보유가 확인됩니다. 유동성·지수 편입 신호로만 보조 해석합니다.";
  if (managerCount === 1) return "단일 운용사 상품 보유 확인입니다. 능동적 매집 근거로 단정하지 않습니다.";
  return "공개 다운로드와 확인 PDF 기준으로는 BlackRock·Vanguard·SSGA 보유 신호를 확인하지 못했습니다.";
}

async function fetchBlackRockEwyHoldings() {
  const text = await fetchUtf8Text(BLACKROCK_EWY_DOWNLOAD_URL);
  const rows = parseSpreadsheetXmlRows(text);
  const asOf = rows.find((row) => row[0] === "Fund Holdings as of")?.[1] ?? null;
  const headerIndex = rows.findIndex((row) => row.includes("Ticker") && row.includes("Name") && row.includes("Weight (%)"));
  if (headerIndex < 0) throw new Error("BlackRock EWY header not found");
  const headers = rows[headerIndex];
  const idx = indexMap(headers);
  const holdings = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const ticker = normalizeTicker(row[idx.Ticker]);
    if (!ticker) continue;
    holdings.set(ticker, {
      ticker,
      name: row[idx.Name],
      weightPct: round(parseNumber(row[idx["Weight (%)"]]), 4),
      shares: parseNumber(row[idx.Quantity])
    });
  }
  return { asOf, holdings };
}

async function fetchStateStreetSpdwHoldings() {
  const buffer = await fetchBuffer(SSGA_SPDW_DOWNLOAD_URL);
  const entries = readZipEntries(buffer);
  const sharedStrings = parseSharedStrings(entries.get("xl/sharedStrings.xml") ?? "");
  const rows = parseOpenXmlRows(entries.get("xl/worksheets/sheet1.xml") ?? "", sharedStrings);
  const asOf = rows.find((row) => row[0] === "Holdings:")?.[1] ?? null;
  const headerIndex = rows.findIndex((row) => row.includes("Name") && row.includes("Ticker") && row.includes("Weight"));
  if (headerIndex < 0) throw new Error("SSGA SPDW header not found");
  const headers = rows[headerIndex];
  const idx = indexMap(headers);
  const holdings = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const ticker = normalizeTicker(row[idx.Ticker]);
    if (!ticker) continue;
    holdings.set(ticker, {
      ticker,
      name: row[idx.Name],
      weightPct: round(parseNumber(row[idx.Weight]), 6),
      shares: parseNumber(row[idx["Shares Held"]])
    });
  }
  return { asOf, holdings };
}

function buildGrowthFundReview(rows) {
  const byTicker = new Map(rows.map((row) => [row.ticker, row]));
  const directProjects = [
    policyProject(byTicker, "035420", "NAVER", "AI·데이터센터", "네이버 AI 저리대출 승인 프로젝트", "직접 확인", "이미 정책 기대가 반영된 축이라 신규 선정 기대보다 차트·밸류 조건을 우선합니다."),
    policyProject(byTicker, "302440", "SK바이오사이언스", "바이오·백신", "차세대 바이오·백신 설비구축 및 R&D 지원자금, 3,000억원 대출", "직접 확인", "정책 수혜는 명확하지만 v6에서는 이미 선정 감점과 기술 조건 미통과를 함께 반영합니다."),
    policyProject(byTicker, "066970", "엘앤에프", "이차전지 소재", "엘앤에프플러스 이차전지 프로젝트, 2,200억원 대출", "프록시 확인", "상장 모회사 프록시는 기대가 선반영될 수 있어 직접 수혜주보다 보수적으로 봅니다.")
  ];
  const reviewedRows = rows
    .filter((row) => row.policy.score >= 22 || ["035420", "302440", "066970"].includes(row.ticker))
    .toSorted((a, b) => b.policy.score - a.policy.score || b.totalScore - a.totalScore)
    .slice(0, 24)
    .map((row) => ({
      ticker: row.ticker,
      company: row.company,
      sector: row.sector,
      decision: row.decision,
      totalScore: row.totalScore,
      policyScore: row.policy.score,
      policyMemo: row.policy.memo,
      technicalMemo: row.technical.memo,
      riskNotes: row.risk.notes,
      assessment: policyAssessment(row)
    }));

  return {
    asOf: "2026-05-29",
    scale: [
      { label: "5년 총 공급", value: "150조원", memo: "첨단산업생태계 전반" },
      { label: "2026년 공급계획", value: "30조원", memo: "직접 3조, 간접 7조, 인프라 10조, 초저리대출 10조" },
      { label: "국민참여형", value: "7,200억원", memo: "국민 모집 6,000억원 + 손실 우선부담 재정 1,200억원" },
      { label: "누적 승인", value: "16건·12.5조원", memo: "2026년 1~5월 승인 기준" },
      { label: "기금 누적 승인", value: "5.17조원", memo: "직접투자·인프라·저리대출 기금 승인액" },
      { label: "간접투자", value: "별도 운용", memo: "국민참여형과 기관투자자용 자펀드 운용 절차" }
    ],
    judgement: [
      "총량은 크지만 상장주 매수세와 직접 연결되는 구조는 아닙니다. 직접투자는 비상장·프로젝트성 자금, 인프라투융자와 대출은 주가보다 자금조달 비용·CAPEX에 먼저 영향을 줍니다.",
      "v6에서는 정책점수 상한을 25점으로 제한하고, 이미 선정된 기업·프록시는 신규 기대값을 낮췄습니다. 정책 테마만으로 진입하지 않는다는 전제를 유지합니다.",
      "정책 수혜 후보는 AI반도체/NPU, AI데이터센터 인프라, 바이오·백신, 이차전지/LFP, 전력망/OLED/방산·미래차로 넓게 보되, 최종 진입은 MA20·RSI·밸류에이션·수급으로 확인합니다."
    ],
    directProjects,
    reviewedRows
  };
}

function policyProject(byTicker, ticker, fallbackCompany, bucket, project, evidence, review) {
  const row = byTicker.get(ticker);
  return {
    ticker,
    company: row?.company ?? fallbackCompany,
    sector: row?.sector ?? bucket,
    project,
    evidence,
    decision: row?.decision ?? "-",
    totalScore: row?.totalScore ?? null,
    policyScore: row?.policy?.score ?? null,
    technicalMemo: row?.technical?.memo ?? "-",
    review
  };
}

function policyAssessment(row) {
  if (row.decision === "ENTRY_OK") return "정책 적합성과 기술 조건이 동시에 통과한 예외적 후보입니다. 그래도 분할 진입 기준을 유지합니다.";
  if (row.status === "already-selected") return "정책 수혜 확인도가 높지만, 이미 선정·프록시라 신규 기대값은 낮게 봅니다.";
  if (row.decision === "WAIT_TRIGGER") return "정책/가치 매력은 있으나 아직 진입 트리거 확인이 필요합니다.";
  return "정책 테마는 있으나 현재 가격·추세·밸류 리스크가 우선입니다.";
}

async function fetchUtf8Text(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return new TextDecoder("utf-8").decode(await response.arrayBuffer());
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function parseSpreadsheetXmlRows(xml) {
  return [...String(xml).matchAll(/<(?:\w+:)?Row\b[\s\S]*?<\/(?:\w+:)?Row>/g)].map((match) => {
    const row = [];
    for (const cell of match[0].matchAll(/<(?:\w+:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Cell>/g)) {
      const index = parseNumber(cell[1].match(/(?:\w+:)?Index="(\d+)"/)?.[1]);
      const position = index ? index - 1 : row.length;
      const data = cell[2].match(/<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/)?.[1] ?? "";
      row[position] = decodeXml(data.replace(/<[^>]+>/g, ""));
    }
    return row;
  });
}

function parseSharedStrings(xml) {
  return [...String(xml).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => {
    const text = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join("");
    return decodeXml(text);
  });
}

function parseOpenXmlRows(sheetXml, sharedStrings) {
  return [...String(sheetXml).matchAll(/<row\b[\s\S]*?<\/row>/g)].map((match) => {
    const row = [];
    for (const cell of match[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cell[1];
      const body = cell[2];
      const column = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
      const position = column ? columnToIndex(column) : row.length;
      let value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? "";
      if (attrs.includes('t="s"')) value = sharedStrings[Number(value)] ?? "";
      row[position] = decodeXml(value);
    }
    return row;
  });
}

function readZipEntries(buffer) {
  let eocd = -1;
  for (let pos = buffer.length - 22; pos >= 0; pos -= 1) {
    if (buffer.readUInt32LE(pos) === 0x06054b50) {
      eocd = pos;
      break;
    }
  }
  if (eocd < 0) throw new Error("ZIP end of central directory not found");
  const count = buffer.readUInt16LE(eocd + 10);
  let position = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(position) !== 0x02014b50) throw new Error("ZIP central directory signature mismatch");
    const method = buffer.readUInt16LE(position + 10);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const localOffset = buffer.readUInt32LE(position + 42);
    const name = buffer.subarray(position + 46, position + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    entries.set(name, data.toString("utf8"));
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function indexMap(headers) {
  return Object.fromEntries(headers.map((header, index) => [header, index]));
}

function normalizeTicker(value) {
  const text = String(value ?? "").trim().toUpperCase();
  const prefixed = text.match(/^A(\d{6})$/)?.[1];
  if (prefixed) return prefixed;
  return /^\d{6}$/.test(text) ? text : null;
}

function columnToIndex(column) {
  return [...column].reduce((acc, char) => acc * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
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
    :root{color-scheme:light;--bg:#f4f6f8;--ink:#141a22;--muted:#637083;--line:#d8dee7;--surface:#fff;--nav:#18212e;--green:#0b6b5d;--blue:#2e5ea8;--gold:#9a6515;--red:#8d3a35;--soft:#eef2f6;--cyan:#287a8a}
    *{box-sizing:border-box} html,body{max-width:100%;overflow-x:hidden} body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI","Malgun Gothic",Arial,sans-serif;line-height:1.5} a{color:inherit} button,input{font:inherit}
    .layout{min-width:0;min-height:100vh;display:grid;grid-template-columns:310px minmax(0,1fr)} aside{min-width:0;position:sticky;top:0;height:100vh;overflow:auto;padding:24px 20px;background:var(--nav);color:#f8fafc} main{min-width:0;padding:clamp(16px,2.2vw,28px)}
    h1,h2,h3,h4,p{margin-top:0;overflow-wrap:break-word} h1{font-size:22px;line-height:1.25;letter-spacing:0} h2{font-size:30px;line-height:1.2;letter-spacing:0;margin-bottom:8px;word-break:keep-all} h3{font-size:17px;letter-spacing:0;margin-bottom:10px} h4{font-size:14px;letter-spacing:0;margin-bottom:8px}
    .brand p{color:#cbd5df;font-size:13px}.muted{color:var(--muted)}.side-box{display:grid;gap:7px;margin:16px 0;padding:13px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);color:#d8e1eb;font-size:12px}.nav-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}.nav-link{display:grid;grid-template-columns:1fr auto;align-items:center;min-height:38px;padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.05);color:#f8fafc;text-decoration:none;font-size:13px;font-weight:800}.nav-link:hover{background:#fff;color:var(--ink)}
    .tag,.badge{display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}.tag{background:rgba(255,255,255,.12);color:#e5edf7}.badge.entry{background:#e5f3f0;color:var(--green)}.badge.wait{background:#fff2db;color:var(--gold)}.badge.avoid{background:#f7e8e6;color:var(--red)}.badge.info{background:#e8eef9;color:var(--blue)}
    .hero,.band{border:1px solid var(--line);border-radius:8px;background:var(--surface)}.hero{padding:clamp(18px,2.4vw,28px);margin-bottom:16px;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.9fr);gap:20px;align-items:end}.kicker{margin-bottom:9px;color:var(--green);font-size:13px;font-weight:900}.hero p{color:var(--muted)}
    .metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}.metric{min-height:108px;padding:16px;border:1px solid var(--line);border-radius:8px;background:#fff}.metric strong{display:block;font-size:27px;line-height:1.1}.metric span{display:block;margin-top:6px;color:var(--muted);font-size:12px}
    .band{padding:18px;margin-bottom:16px}.head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.head p{max-width:900px;margin-bottom:0;color:var(--muted);font-size:13px}.grid-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.grid-6{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.card{padding:14px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd}.card p{margin-bottom:0;color:var(--muted);font-size:12px}.compact strong{display:block;font-size:20px}.compact span{display:block;color:var(--muted);font-size:12px}.callout{margin:10px 0 12px;padding:12px 14px;border:1px solid #c9d9e8;border-radius:8px;background:#f3f8fd;color:#334052;font-size:13px}.list-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}.list-grid .card{min-height:92px}.manager-list{display:flex;flex-wrap:wrap;gap:6px}.manager-chip{display:inline-flex;align-items:center;min-height:23px;padding:2px 7px;border-radius:999px;background:#eef2f6;color:#334052;font-size:12px;font-weight:800}
    .execution-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.strategy-card{position:relative;padding:16px;border:1px solid var(--line);border-left:4px solid var(--green);border-radius:8px;background:#fff}.strategy-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.strategy-head h4{margin-bottom:4px;font-size:17px}.strategy-meta{display:flex;flex-wrap:wrap;gap:6px}.pill{display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;background:#eef2f6;color:#334052;font-size:12px;font-weight:800}.pill.warn{background:#fff2db;color:var(--gold)}.pill.good{background:#e5f3f0;color:var(--green)}.pill.bad{background:#f7e8e6;color:var(--red)}.price-rail{margin:12px 0 14px;padding:12px 10px 8px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.rail-track{position:relative;height:68px}.rail-line{position:absolute;left:4%;right:4%;top:34px;height:4px;border-radius:999px;background:linear-gradient(90deg,#c8574d 0%,#d6a443 34%,#2e5ea8 58%,#0b6b5d 100%)}.rail-marker{position:absolute;top:0;width:78px;transform:translateX(-50%);text-align:center}.rail-dot{display:block;width:10px;height:10px;margin:30px auto 5px;border:2px solid #fff;border-radius:50%;background:#334052;box-shadow:0 0 0 1px var(--line)}.rail-marker.stop .rail-dot,.rail-marker.softStop .rail-dot{background:var(--red)}.rail-marker.now .rail-dot{background:var(--blue)}.rail-marker.trim .rail-dot,.rail-marker.target .rail-dot{background:var(--green)}.rail-marker.add .rail-dot{background:var(--gold)}.rail-marker.holderCost .rail-dot{background:var(--cyan)}.rail-marker strong{display:block;font-size:11px;line-height:1.15}.rail-marker span{display:block;color:var(--muted);font-size:11px;line-height:1.15}.plan-columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.plan-group h5,.session-group h5{margin:0 0 7px;font-size:13px;color:#334052}.plan-step{padding:8px 0;border-top:1px solid var(--line)}.plan-step:first-of-type{border-top:0}.plan-step strong{display:block;font-size:13px}.plan-step span{display:block;color:var(--muted);font-size:12px}.risk-strip{display:grid;gap:6px;margin-top:12px}.risk-strip span{padding:7px 9px;border-left:3px solid var(--cyan);background:#f6f9fb;font-size:12px;color:#334052}.session-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.session-item{padding:9px 0;border-top:1px solid var(--line)}.session-item strong{display:block;font-size:12px}.session-item span{display:block;color:var(--muted);font-size:12px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-bottom:12px}.segmented{display:flex;flex-wrap:wrap;gap:6px}.segmented button{min-height:34px;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;cursor:pointer;font-size:13px;font-weight:800}.segmented button.active{border-color:var(--green);background:#e5f3f0;color:var(--green)}.search{width:min(360px,100%);min-height:36px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:#fff}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fff} table{width:100%;min-width:1880px;border-collapse:collapse} th,td{padding:10px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px} th{position:sticky;top:0;z-index:1;background:#eef2f6;color:#334052} tr:last-child td{border-bottom:0}.num{font-variant-numeric:tabular-nums;white-space:nowrap}.company{font-weight:900}.note{display:block;margin-top:5px;color:var(--muted);font-size:12px;line-height:1.42}
    .source-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.source-list a{min-height:60px;padding:11px 12px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;text-decoration:none;font-size:13px}.source-list span{display:block;margin-top:4px;color:var(--muted);font-size:12px} footer{color:var(--muted);font-size:12px}
    @media(max-width:1180px){.layout{grid-template-columns:minmax(0,1fr)}aside{position:static;height:auto}.nav-list{grid-template-columns:repeat(4,minmax(150px,1fr))}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.hero,.grid-2,.grid-3,.grid-6,.list-grid,.execution-grid{grid-template-columns:1fr}}@media(max-width:820px){aside{padding:16px}.nav-list{display:flex;max-width:100%;overflow:auto;padding-bottom:4px}.nav-link{min-width:150px}.plan-columns,.session-grid{grid-template-columns:1fr}.strategy-head{display:block}.strategy-meta{margin-top:8px}.source-list{grid-template-columns:1fr}table{min-width:1040px}}@media(max-width:560px){main{padding:14px}.metrics{grid-template-columns:1fr}h1{font-size:19px}h2{font-size:23px}.head{display:block}.metric{min-height:auto}.rail-marker{width:62px}.rail-marker strong,.rail-marker span{font-size:10px}.price-rail{padding-left:2px;padding-right:2px}}
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><h1>${escapeHtml(data.meta.title)}</h1><p>체질 기준, Holder Cost, 진입·축소 규칙</p></div>
      <div class="side-box"><span>기준일: ${data.meta.runDate} · 문서 업데이트: ${data.meta.updatedAt}</span><span>유니버스: ${data.meta.universeCount}개</span><span>분석 성공: ${data.meta.validCount}개</span><span>ENTRY_OK: ${data.summary.entryOk}개</span></div>
      <nav class="nav-list">
        <a class="nav-link" href="#overview"><span>요약</span><span class="tag">KPI</span></a>
        <a class="nav-link" href="#execution"><span>실행 전략</span><span class="tag">v10</span></a>
        <a class="nav-link" href="#rules"><span>새 기준</span><span class="tag">Rules</span></a>
        <a class="nav-link" href="#growthFund"><span>국민성장펀드</span><span class="tag">Policy</span></a>
        <a class="nav-link" href="#megaManagers"><span>3대 운용사</span><span class="tag">Big 3</span></a>
        <a class="nav-link" href="#entry"><span>진입 표</span><span class="tag">Entry</span></a>
        <a class="nav-link" href="#wait"><span>트리거 대기</span><span class="tag">Wait</span></a>
        <a class="nav-link" href="#all"><span>전체 테이블</span><span class="tag">All</span></a>
        <a class="nav-link" href="#sources"><span>출처</span><span class="tag">Sources</span></a>
      </nav>
    </aside>
    <main>
      <section class="hero" id="overview"><div><p class="kicker">v10 Structural Execution Dashboard</p><h2>진입 후보를 기술적 타점과 장기 체질, 스마트머니 비용권으로 다시 거릅니다.</h2><p>${escapeHtml(data.meta.warning)}</p></div><div class="grid-2"><div class="card"><h4>KOSPI</h4><p><strong>${escapeHtml(data.market.kospi.now)}</strong></p><p>${escapeHtml(data.market.kospi.change)}</p></div><div class="card"><h4>KOSDAQ</h4><p><strong>${escapeHtml(data.market.kosdaq.now)}</strong></p><p>${escapeHtml(data.market.kosdaq.change)}</p></div></div></section>
      <section class="metrics" id="metrics"></section>
      <section class="band" id="execution"><div class="head"><div><h3>진입·매도 실행 전략</h3><p>v10 ENTRY_OK는 v7 기술 조건에 더해 체질 기준선을 통과한 후보만 보여줍니다. 가격 레일의 평단 마커는 Tier별 추정치입니다.</p></div></div><div class="execution-grid" id="executionCards"></div></section>
      <section class="band" id="rules"><div class="head"><div><h3>새 선별 기준</h3><p>${escapeHtml(data.meta.methodology)}</p></div></div><div class="grid-3" id="rulesGrid"></div></section>
      <section class="band" id="growthFund"><div class="head"><div><h3>국민성장펀드 정책 검토</h3><p>총량·집행구조·실제 승인 프로젝트를 분리해 봅니다. 정책자금 수혜는 후보 발굴 신호이지, 상장주 진입 신호 자체는 아닙니다.</p></div></div><div class="grid-6" id="growthFundGrid"></div><div class="list-grid" id="growthJudgement"></div><div class="table-wrap"><table><thead><tr><th>회사</th><th>연결 프로젝트</th><th>정책 평가</th><th>v10 판단</th></tr></thead><tbody id="policyProjectRows"></tbody></table></div><div class="table-wrap" style="margin-top:12px;"><table><thead><tr><th>회사</th><th>정책점수</th><th>기술 조건</th><th>평가</th></tr></thead><tbody id="policyRows"></tbody></table></div></section>
      <section class="band" id="megaManagers"><div class="head"><div><h3>BlackRock·Vanguard·SSGA 보유 신호</h3><p>공개 ETF/인덱스 보유자료와 DART 5% 공시를 매칭했습니다. ETF 보유는 패시브 편입 신호이며 능동적 매집으로 단정하지 않습니다.</p></div></div><div class="callout" id="megaCaveat"></div><div class="grid-6" id="megaMetricGrid"></div><div class="table-wrap"><table><thead><tr><th>회사</th><th>확인 신호</th><th>증거</th><th>해석</th></tr></thead><tbody id="megaRows"></tbody></table></div></section>
      <section class="band" id="entry"><div class="head"><div><h3>진입 가능 상세 표</h3><p>기술 조건과 체질 기준선을 모두 통과한 후보입니다. Holder Cost는 별도 보조 점수로만 봅니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>순위</th><th>회사</th><th>v10c/총점</th><th>체질 기준</th><th>평단 신호</th><th>가격/가치</th><th>대주주</th><th>기술적 위치</th><th>수급</th><th>3대 운용사</th><th>거래원</th><th>진입 계획</th><th>매도 전략</th><th>리스크</th></tr></thead><tbody id="entryRows"></tbody></table></div></section>
      <section class="band" id="wait"><div class="head"><div><h3>트리거 대기 후보</h3><p>정책/가치 매력은 있지만 아직 차트가 회복되지 않은 후보입니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>회사</th><th>점수</th><th>기술 조건</th><th>기다릴 트리거</th><th>무효 조건</th></tr></thead><tbody id="waitRows"></tbody></table></div></section>
      <section class="band" id="all"><div class="toolbar"><div><h3 style="margin-bottom:4px;">전체 재탐색 테이블</h3><p class="muted" style="margin-bottom:0;font-size:13px;">검색과 결정 필터로 확인하세요. v10cScore는 totalScore+holderCostScore입니다.</p></div><input class="search" id="search" type="search" placeholder="회사, 섹터, 코드 검색"></div><div class="segmented" id="filters"></div><div class="table-wrap"><table><thead><tr><th>순위</th><th>회사</th><th>v10 결정</th><th>v7 기준</th><th>v10c</th><th>총점</th><th>체질</th><th>평단</th><th>정책</th><th>가치</th><th>대주주</th><th>기술</th><th>수급</th><th>3대 운용사</th><th>메모</th></tr></thead><tbody id="allRows"></tbody></table></div></section>
      <section class="band" id="sources"><div class="head"><div><h3>출처</h3><p>Naver Finance 일별 시세, 외국인·기관 순매매, 거래원정보와 금융위원회 공개자료를 사용했습니다.</p></div></div><div class="source-list" id="sourceList"></div></section>
      <footer>생성 스크립트: <code>node scripts/build-v10-execution-dashboard.mjs</code>. 데이터: <code>data/v10-execution-dashboard-data.json</code>.</footer>
    </main>
  </div>
  <script>
    const DATA=${json}; let filter="all"; let search="";
    const megaStats=DATA.megaManagers?.summary??{};
    const metrics=[
      ["분석 유니버스",DATA.meta.validCount+"개","장기 일봉 기반 재계산"],
      ["v10 ENTRY_OK",DATA.entryList.length+"개","체질 기준 통과"],
      ["v7 기준 ENTRY_OK",DATA.summary.baseEntryOk+"개","체질 제약 전"],
      ["체질 강등",DATA.summary.structuralDowngraded+"개","ENTRY_OK 제외"],
      ["평단 매집 신호",DATA.summary.holderAccumulation+"개","Tier별 추정"]
    ];
    document.querySelector("#metrics").innerHTML=metrics.map(([a,b,c])=>\`<div class="metric"><strong>\${escapeHtml(b)}</strong><span>\${escapeHtml(a)} · \${escapeHtml(c)}</span></div>\`).join("");
    document.querySelector("#rulesGrid").innerHTML=DATA.rules.map((r,i)=>\`<div class="card"><h4>\${i+1}. 기준</h4><p>\${escapeHtml(r)}</p></div>\`).join("");
    function decisionClass(d){return d==="ENTRY_OK"?"entry":d==="WAIT_TRIGGER"?"wait":"avoid"}
    function decisionText(d){return d==="ENTRY_OK"?"진입 가능":d==="WAIT_TRIGGER"?"트리거 대기":d==="AVOID_NOW"?"관망/제외":d}
    function broker(row){const b=row.brokers?.d5;if(!b)return"미확인";const buy=(b.buyTop||[]).slice(0,2).map(x=>x.name).join(", ");const sell=(b.sellTop||[]).slice(0,2).map(x=>x.name).join(", ");const net=b.foreignEstimate?.net;return \`\${net==null?"외국계 추정 없음":"외국계 "+net.toLocaleString("ko-KR")+"주"} · 매수 \${buy} / 매도 \${sell}\`}
    document.querySelector("#growthFundGrid").innerHTML=(DATA.growthFundReview?.scale||[]).map(x=>\`<div class="card compact"><strong>\${escapeHtml(x.value)}</strong><span>\${escapeHtml(x.label)}</span><p>\${escapeHtml(x.memo)}</p></div>\`).join("");
    document.querySelector("#growthJudgement").innerHTML=(DATA.growthFundReview?.judgement||[]).map((x,i)=>\`<div class="card"><h4>평가 \${i+1}</h4><p>\${escapeHtml(x)}</p></div>\`).join("");
    document.querySelector("#policyProjectRows").innerHTML=(DATA.growthFundReview?.directProjects||[]).map(r=>\`<tr><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td>\${escapeHtml(r.project)}<span class="note">\${escapeHtml(r.evidence)}</span></td><td>정책 \${r.policyScore??"-"}점<span class="note">\${escapeHtml(r.review)}</span></td><td><span class="badge \${decisionClass(r.decision)}">\${decisionText(r.decision)}</span><span class="note">총점 \${r.totalScore??"-"} · \${escapeHtml(r.technicalMemo)}</span></td></tr>\`).join("");
    document.querySelector("#policyRows").innerHTML=(DATA.growthFundReview?.reviewedRows||[]).map(r=>\`<tr><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><strong>\${r.policyScore}</strong><span class="note">\${escapeHtml(r.policyMemo)}</span></td><td><span class="badge \${decisionClass(r.decision)}">\${decisionText(r.decision)}</span><span class="note">총점 \${r.totalScore} · \${escapeHtml(r.technicalMemo)}</span></td><td>\${escapeHtml(r.assessment)}<span class="note">\${escapeHtml((r.riskNotes||[]).join(" · ")||"특이 리스크 없음")}</span></td></tr>\`).join("");
    document.querySelector("#megaCaveat").textContent=DATA.megaManagers?.caveat??"";
    const megaMetrics=[["확인 종목",megaStats.withAny??0,"ETF/인덱스 또는 DART"],["3대 모두",megaStats.allThree??0,"BlackRock·Vanguard·SSGA"],["BlackRock",megaStats.blackRock??0,"EWY 또는 DART"],["Vanguard",megaStats.vanguard??0,"공식 보유 PDF"],["SSGA",megaStats.ssga??0,"SPDW 보유"],["DART 5%+",megaStats.dartLargeHolder??0,"공시급 보유"]];
    document.querySelector("#megaMetricGrid").innerHTML=megaMetrics.map(([a,b,c])=>\`<div class="card compact"><strong>\${Number(b).toLocaleString("ko-KR")}</strong><span>\${escapeHtml(a)}</span><p>\${escapeHtml(c)}</p></div>\`).join("");
    document.querySelector("#megaRows").innerHTML=(megaStats.topRows||[]).map(r=>\`<tr><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)} · \${decisionText(r.decision)} \${r.totalScore}점</span></td><td>\${managerChips(r.managers,r.largeHolderDisclosure)}<span class="note">\${escapeHtml(r.status)}</span></td><td>\${managerEvidence(r.managers,r.largeHolderDisclosure)}</td><td>\${escapeHtml(r.interpretation)}</td></tr>\`).join("");
    document.querySelector("#executionCards").innerHTML=DATA.entryList.length?DATA.entryList.map((r,i)=>strategyCard(r,i)).join(""):\`<p class="muted">현재 기준 진입 가능 후보가 없습니다.</p>\`;
    document.querySelector("#entryRows").innerHTML=DATA.entryList.map((r,i)=>\`<tr><td class="num">\${i+1}</td><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><strong>\${r.v10cScore}</strong><span class="note">총점 \${r.totalScore} + 평단 \${r.holderCostScore}</span></td><td>\${structuralCell(r)}</td><td>\${holderCostCell(r)}</td><td>\${price(r.close)}\${priceSourceLabel(r)}<span class="note">시총 \${eok(r.marketCapEok)} · PER \${r.per??"-"} · PBR \${r.pbr??"-"}</span></td><td>\${ownershipCell(r)}</td><td>\${escapeHtml(r.technical.memo)}<span class="note">20일 \${pct(r.returns.d20)}, 60일 \${pct(r.returns.d60)}</span></td><td>\${escapeHtml(r.flowScore.memo)}</td><td>\${managerCell(r)}</td><td>\${escapeHtml(broker(r))}</td><td>\${escapeHtml(r.entryPlan.trigger)}<span class="note">\${escapeHtml(r.entryPlan.invalidation)}</span></td><td>\${sellSummary(r)}</td><td>\${escapeHtml((r.risk.notes||[]).join(" · ")||"특이 리스크 없음")}</td></tr>\`).join("");
    document.querySelector("#waitRows").innerHTML=DATA.triggerList.slice(0,25).map(r=>\`<tr><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><span class="badge wait">\${r.totalScore}</span></td><td>\${escapeHtml(r.technical.memo)}</td><td>\${escapeHtml(r.entryPlan.trigger)}</td><td>\${escapeHtml(r.entryPlan.invalidation)}</td></tr>\`).join("");
    function renderFilters(){const vals=["all","ENTRY_OK","WAIT_TRIGGER","AVOID_NOW"];document.querySelector("#filters").innerHTML=vals.map(v=>\`<button class="\${filter===v?"active":""}" data-filter="\${v}">\${v==="all"?"전체":decisionText(v)}</button>\`).join("");document.querySelectorAll("#filters button").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;renderFilters();renderAll()}));}
    function renderAll(){const needle=search.trim().toLowerCase();const rows=DATA.allRows.filter(r=>(filter==="all"||r.decision===filter)&&(!needle||[r.company,r.ticker,r.sector,r.rationale,r.structuralRegime?.primary?.label,r.holderCost?.signal].join(" ").toLowerCase().includes(needle))).slice(0,90);document.querySelector("#allRows").innerHTML=rows.map((r,i)=>\`<tr><td class="num">\${i+1}</td><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><span class="badge \${decisionClass(r.decision)}">\${decisionText(r.decision)}</span></td><td><span class="badge \${decisionClass(r.baseDecision)}">\${decisionText(r.baseDecision)}</span></td><td><strong>\${r.v10cScore}</strong><span class="note">+\${r.holderCostScore}</span></td><td><strong>\${r.totalScore}</strong></td><td>\${structuralCell(r)}</td><td>\${holderCostCell(r)}</td><td>\${r.policy.score}<span class="note">\${escapeHtml(r.policy.memo)}</span></td><td>\${r.value.score}<span class="note">\${escapeHtml(r.value.memo)}</span></td><td>\${ownershipCell(r)}</td><td>\${r.technical.score}<span class="note">\${escapeHtml(r.technical.memo)}</span></td><td>\${r.flowScore.score}<span class="note">\${escapeHtml(r.flowScore.memo)}</span></td><td>\${managerCell(r)}</td><td>\${escapeHtml(r.entryPlan.action)}<span class="note">\${escapeHtml((r.risk.notes||[]).join(" · "))}</span></td></tr>\`).join("");}
    document.querySelector("#search").addEventListener("input",e=>{search=e.target.value;renderAll()});document.querySelector("#sourceList").innerHTML=DATA.sources.map(s=>\`<a href="\${escapeHtml(s.url)}" target="_blank" rel="noreferrer"><strong>\${escapeHtml(s.title)}</strong><span>\${escapeHtml(s.url)}</span></a>\`).join("");
    function strategyCard(row,index){const p=row.executionPlan??{};return \`<article class="strategy-card"><div class="strategy-head"><div><h4>\${index+1}. \${escapeHtml(row.company)}</h4><span class="note">\${row.ticker} · \${escapeHtml(row.sector)} · 현재 \${price(row.close)}\${priceSourceLabel(row)} · v10c \${row.v10cScore}</span></div><div class="strategy-meta"><span class="pill good">\${escapeHtml(p.stance??row.entryPlan.action)}</span><span class="pill \${row.structuralRegime?.gate==="PASS"?"good":"warn"}">체질 \${escapeHtml(row.structuralRegime?.gate??"-")} \${row.structuralRegime?.score??0}점</span><span class="pill \${holderSignalClass(row.holderCost?.signal)}">평단 \${escapeHtml(row.holderCost?.signal??"NO_DATA")} \${row.holderCostScore??0}점</span><span class="pill \${p.isOverheated?"warn":"good"}">\${p.isOverheated?"과열 축소":"분할 기준"}</span><span class="pill \${p.isWeakFlow?"bad":"good"}">\${p.isWeakFlow?"수급 약함":"수급 양호"}</span></div></div>\${priceRail(p)}<div class="plan-columns"><div><h5>진입</h5>\${stepList(p.buySteps,"buy")}</div><div><h5>매도·축소</h5>\${stepList(p.sellSteps,"sell")}</div></div><div class="session-grid">\${(p.sessionRules||[]).map(x=>\`<div class="session-item"><strong>\${escapeHtml(x.window)}</strong><span>\${escapeHtml(x.rule)}</span></div>\`).join("")}</div><div class="risk-strip">\${(p.riskSwitches||[]).map(x=>\`<span>\${escapeHtml(x)}</span>\`).join("")}</div></article>\`}
    function stepList(steps,type){return (steps||[]).map(x=>\`<div class="plan-step"><strong>\${escapeHtml(x.label)}\${x.weight?" · "+escapeHtml(x.weight):""}</strong><span>\${x.price?price(x.price)+" · ":""}\${escapeHtml(x.rule??x.trigger??"")}</span>\${x.action?\`<span>\${escapeHtml(x.action)}</span>\`:""}</div>\`).join("")}
    function priceRail(plan){const levels=(plan.levels||[]).filter(x=>x.price!=null);if(!levels.length)return"";const min=Math.min(...levels.map(x=>x.price));const max=Math.max(...levels.map(x=>x.price));return \`<div class="price-rail"><div class="rail-track"><div class="rail-line"></div>\${levels.map(x=>\`<div class="rail-marker \${escapeHtml(x.kind)}" style="left:\${levelPosition(x.price,min,max)}%"><span class="rail-dot"></span><strong>\${escapeHtml(x.label)}</strong><span>\${price(x.price)}</span></div>\`).join("")}</div></div>\`}
    function levelPosition(price,min,max){if(max<=min)return 50;return Math.max(8,Math.min(92,8+(price-min)/(max-min)*84)).toFixed(2)}
    function sellSummary(row){const steps=row.executionPlan?.sellSteps||[];return steps.slice(0,3).map(x=>\`<span class="note"><strong>\${escapeHtml(x.label)}</strong> \${escapeHtml(x.action)} · \${escapeHtml(x.trigger)}</span>\`).join("")}
    function ownershipCell(row){const o=row.ownership;if(!o||o.majorHolderPct==null)return'<span class="muted">미확인</span>';return \`<strong>\${pct(o.majorHolderPct)}</strong><span class="note">\${escapeHtml(o.majorHolderName??"대주주")} · 상위합 \${pct(o.topHolderPct)}</span><span class="note">\${escapeHtml(o.memo??"")}</span>\`}
    function structuralCell(row){const s=row.structuralRegime;if(!s)return'<span class="muted">미확인</span>';return \`<strong>\${s.score}점</strong><span class="note">\${escapeHtml(s.gate)} · \${escapeHtml(s.grade)}</span><span class="note">\${escapeHtml(s.primary?.label??"-")} · \${pct(s.primary?.returnPct)}</span>\`}
    function holderCostCell(row){const h=row.holderCost;if(!h||h.signal==="NO_DATA")return \`<span class="muted">NO_DATA</span><span class="note">\${escapeHtml(h?.memo??"평단 추정 근거 부족")}</span>\`;return \`<strong>\${h.score}점</strong><span class="note">\${escapeHtml(h.signal)} · Tier \${escapeHtml(h.tier)} · 평단 \${price(h.estimatedCost)}</span><span class="note">괴리 \${pct(h.gapPct)} · \${escapeHtml(h.holderName??"")}</span>\`}
    function holderSignalClass(signal){return signal==="ACCUMULATION"?"good":signal==="OVERHANG"?"bad":signal==="NEUTRAL"?"warn":"bad"}
    function managerCell(row){const mm=row.megaManagers;if(!mm||!mm.managerCount)return'<span class="muted">미확인</span>';return managerChips(mm.managers,mm.largeHolderDisclosure)+\`<span class="note">\${escapeHtml(mm.status)}</span>\`}
    function managerChips(managers,disclosure){const labels=[...(managers||[]).map(x=>x.manager),...(disclosure?[disclosure.holder+" 5%+"] : [])];return \`<div class="manager-list">\${labels.map(x=>\`<span class="manager-chip">\${escapeHtml(x)}</span>\`).join("")}</div>\`}
    function priceSourceLabel(row){return row.priceSource?.source?" · "+escapeHtml(row.priceSource.source):""}
    function managerEvidence(managers,disclosure){const lines=[];(managers||[]).forEach(x=>lines.push(\`\${x.manager}: \${x.vehicle}\${x.weightPct==null?"":" · "+pct(x.weightPct)}\${x.shares==null?"":" · "+shares(x.shares)+"주"}\${x.asOf?" · "+x.asOf:""}\`));if(disclosure)lines.push(\`\${disclosure.holder}: DART 5%+ · \${shares(disclosure.shares)}주 · \${disclosure.ownershipPct}% · \${disclosure.asOf}\`);return lines.map(x=>\`<span class="note">\${escapeHtml(x)}</span>\`).join("")}
    function price(v){return v==null?"-":Number(v).toLocaleString("ko-KR")+"원"} function eok(v){return v==null?"-":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:0})+"억원"} function pct(v){return v==null?"-":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:2})+"%"} function shares(v){return v==null?"-":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:0})} function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
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

function extractTableByCaptionContains(html, captionText) {
  const captionIndex = html.indexOf(captionText);
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

function formatNaverDate(value) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function formatSeoulDate(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function formatSeoulDateTime(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} KST`;
}

function parseNumber(value) {
  const text = String(value ?? "").replace(/[,+%\s]/g, "");
  if (!text || text === "-") return null;
  return Number(text);
}

function isPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
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

function ma200FromHistory(history) {
  return movingAverageFromHistory(history, 200);
}

function ma600FromHistory(history) {
  return movingAverageFromHistory(history, 600);
}

function movingAverageFromHistory(history, n) {
  if (history.length < n) return null;
  return average(history.slice(-n).map((row) => row.close));
}

function maxDrawdown(rows) {
  let peak = rows[0]?.close ?? 0;
  let drawdown = 0;
  for (const row of rows) {
    if (row.close > peak) peak = row.close;
    drawdown = Math.min(drawdown, pctChange(peak, row.close));
  }
  return drawdown;
}

function cagr(from, to, days) {
  if (!from || days <= 0) return null;
  return (Math.pow(to / from, 365.25 / days) - 1) * 100;
}

function daysBetween(from, to) {
  return (new Date(`${to}T00:00:00+09:00`) - new Date(`${from}T00:00:00+09:00`)) / 86_400_000;
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
