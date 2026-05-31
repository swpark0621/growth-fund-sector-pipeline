import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "sectors.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const validations = new Map([
  ["ai-datacenter/케이아이엔엑스", ["Strong", "docs/company-validation/01-ai-semiconductor.md"]],
  ["ai-datacenter/가비아", ["Strong", "docs/company-validation/01-ai-semiconductor.md"]],
  ["ai-datacenter/케이엔솔", ["Watch", "docs/company-validation/01-ai-semiconductor.md"]],
  ["ai-datacenter/GST", ["Watch", "docs/company-validation/01-ai-semiconductor.md"]],
  ["ai-datacenter/오픈엣지테크놀로지", ["Strong", "docs/company-validation/01-ai-semiconductor.md"]],
  ["ai-datacenter/가온칩스", ["Strong", "docs/company-validation/01-ai-semiconductor.md"]],
  ["ai-datacenter/에이디테크놀로지", ["Strong", "docs/company-validation/01-ai-semiconductor.md"]],
  ["ai-datacenter/지엔씨에너지", ["Watch", "docs/company-validation/01-ai-semiconductor.md"]],

  ["semiconductor/네패스", ["Strong", "docs/company-validation/01-ai-semiconductor.md"]],
  ["semiconductor/네패스아크", ["Watch", "docs/company-validation/01-ai-semiconductor.md"]],
  ["semiconductor/하나마이크론", ["Strong", "docs/company-validation/01-ai-semiconductor.md"]],
  ["semiconductor/티에스이", ["Watch", "docs/company-validation/01-ai-semiconductor.md"]],
  ["semiconductor/에이디테크놀로지", ["Strong", "docs/company-validation/01-ai-semiconductor.md"]],
  ["semiconductor/오픈엣지테크놀로지", ["Strong", "docs/company-validation/01-ai-semiconductor.md"]],

  ["battery-materials/엔켐", ["Strong", "docs/company-validation/02-battery-bio.md"]],
  ["battery-materials/대주전자재료", ["Watch", "docs/company-validation/02-battery-bio.md"]],
  ["battery-materials/나노신소재", ["Watch", "docs/company-validation/02-battery-bio.md"]],
  ["battery-materials/천보", ["Watch", "docs/company-validation/02-battery-bio.md"]],
  ["battery-materials/성일하이텍", ["Strong", "docs/company-validation/02-battery-bio.md"]],
  ["battery-materials/새빗켐", ["Reconsider", "docs/company-validation/02-battery-bio.md"]],
  ["battery-materials/하나기술", ["Watch", "docs/company-validation/02-battery-bio.md"]],

  ["bio-vaccine/프레스티지바이오로직스", ["Watch", "docs/company-validation/02-battery-bio.md"]],
  ["bio-vaccine/바이넥스", ["Strong", "docs/company-validation/02-battery-bio.md"]],
  ["bio-vaccine/유바이오로직스", ["Strong", "docs/company-validation/02-battery-bio.md"]],
  ["bio-vaccine/셀리드", ["Reconsider", "docs/company-validation/02-battery-bio.md"]],
  ["bio-vaccine/올릭스", ["Watch", "docs/company-validation/02-battery-bio.md"]],
  ["bio-vaccine/지아이이노베이션", ["Watch", "docs/company-validation/02-battery-bio.md"]],
  ["bio-vaccine/큐리언트", ["Reconsider", "docs/company-validation/02-battery-bio.md"]],
  ["bio-vaccine/에스티팜", ["Watch", "docs/company-validation/02-battery-bio.md"]],

  ["defense-space/컨텍", ["Watch", "docs/company-validation/03-defense-robotics.md"]],
  ["defense-space/제노코", ["Strong", "docs/company-validation/03-defense-robotics.md"]],
  ["defense-space/코츠테크놀로지", ["Strong", "docs/company-validation/03-defense-robotics.md"]],
  ["defense-space/아이쓰리시스템", ["Strong", "docs/company-validation/03-defense-robotics.md"]],
  ["defense-space/파이버프로", ["Watch", "docs/company-validation/03-defense-robotics.md"]],
  ["defense-space/AP위성", ["Watch", "docs/company-validation/03-defense-robotics.md"]],
  ["defense-space/켄코아에어로스페이스", ["Reconsider", "docs/company-validation/03-defense-robotics.md"]],

  ["robotics/에스비비테크", ["Watch", "docs/company-validation/03-defense-robotics.md"]],
  ["robotics/뉴로메카", ["Watch", "docs/company-validation/03-defense-robotics.md"]],
  ["robotics/유일로보틱스", ["Watch", "docs/company-validation/03-defense-robotics.md"]],
  ["robotics/라온로보틱스", ["Strong", "docs/company-validation/03-defense-robotics.md"]],
  ["robotics/티로보틱스", ["Watch", "docs/company-validation/03-defense-robotics.md"]],
  ["robotics/아진엑스텍", ["Reconsider", "docs/company-validation/03-defense-robotics.md"]],
  ["robotics/로보티즈", ["Watch", "docs/company-validation/03-defense-robotics.md"]],

  ["hydrogen-energy/범한퓨얼셀", ["Strong", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["hydrogen-energy/비나텍", ["Strong", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["hydrogen-energy/제이엔케이글로벌", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["hydrogen-energy/에스프리즘", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["hydrogen-energy/일진하이솔루스", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["hydrogen-energy/상아프론테크", ["Reconsider", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["hydrogen-energy/한선엔지니어링", ["Reconsider", "docs/company-validation/04-hydrogen-mobility-display.md"]],

  ["future-mobility/스마트레이더시스템", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["future-mobility/라닉스", ["Reconsider", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["future-mobility/텔레칩스", ["Strong", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["future-mobility/퓨런티어", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["future-mobility/모바일어플라이언스", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["future-mobility/와이엠텍", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["future-mobility/알멕", ["Strong", "docs/company-validation/04-hydrogen-mobility-display.md"]],

  ["display/선익시스템", ["Strong", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["display/필옵틱스", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["display/피엔에이치테크", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["display/야스", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["display/브이원텍", ["Reconsider", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["display/AP시스템", ["Watch", "docs/company-validation/04-hydrogen-mobility-display.md"]],
  ["display/디아이티", ["Reconsider", "docs/company-validation/04-hydrogen-mobility-display.md"]],

  ["content-ip/SAMG엔터", ["Strong", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["content-ip/스튜디오미르", ["Watch", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["content-ip/자이언트스텝", ["Reconsider", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["content-ip/덱스터", ["Reconsider", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["content-ip/애니플러스", ["Strong", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["content-ip/대원미디어", ["Watch", "docs/company-validation/05-content-power-coreminerals.md"]],

  ["power-grid/보성파워텍", ["Strong", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["power-grid/서전기전", ["Watch", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["power-grid/제일일렉트릭", ["Watch", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["power-grid/피앤씨테크", ["Reconsider", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["power-grid/제룡산업", ["Strong", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["power-grid/세명전기", ["Watch", "docs/company-validation/05-content-power-coreminerals.md"]],

  ["core-minerals/성일하이텍", ["Strong", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["core-minerals/새빗켐", ["Reconsider", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["core-minerals/코스모화학", ["Watch", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["core-minerals/강원에너지", ["Watch", "docs/company-validation/05-content-power-coreminerals.md"]],
  ["core-minerals/STX", ["Reconsider", "docs/company-validation/05-content-power-coreminerals.md"]]
]);

function summaryFor(label, sectorName) {
  if (label === "Strong") {
    return `${sectorName} 정책 적합성, 사업 직접성, 성장 촉매가 함께 확인된 우선 검토 후보입니다. 최종 투자 판단 전 밸류에이션과 재무·희석 리스크를 재검증합니다.`;
  }
  if (label === "Reconsider") {
    return `${sectorName} 노출은 있으나 직접성, 가격 부담, 재무 리스크 또는 신규자금 명분 중 약점이 커 후순위/재분류 후보입니다.`;
  }
  return `${sectorName} 관련성은 유효하지만 수주·매출 비중·CAPEX·재무 체력 중 일부가 미확인입니다. 확인 전까지 관찰 후보로 둡니다.`;
}

let applied = 0;
const missing = [];

for (const sector of data.sectors) {
  for (const candidate of sector.candidates ?? []) {
    const key = `${sector.id}/${candidate.company}`;
    const entry = validations.get(key);
    if (!entry) {
      missing.push(key);
      continue;
    }
    const [label, reviewFile] = entry;
    candidate.investmentValidation.finalValidation = label;
    candidate.investmentValidation.validationSummary = summaryFor(label, sector.name);
    candidate.investmentValidation.agentReviewFile = reviewFile;
    applied += 1;
  }
}

if (missing.length > 0) {
  console.warn("No agent validation mapping for:");
  for (const item of missing) console.warn(`- ${item}`);
}

fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Applied ${applied} agent validation labels`);
