import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "sectors.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const errors = [];
const allowedMarkets = new Set(["코스피", "코스닥", "코넥스", "비상장"]);
const allowedValidations = new Set(["Strong", "Watch", "Reconsider"]);
const allowedV2Classifications = new Set(["A", "B", "C", "제외"]);
const requiredCandidateFields = [
  "priority",
  "fundFit",
  "company",
  "ticker",
  "market",
  "marketCap",
  "valueChain",
  "possiblePath",
  "capitalUse",
  "reason",
  "caseStatus",
  "urgency",
  "urgencyReason"
];
const requiredValidationFields = [
  "finalValidation",
  "validationSummary",
  "policyFit",
  "businessDirectness",
  "sourceConfidence",
  "investmentMerit",
  "valuationBurden",
  "valuationCheck",
  "financialDilutionRisk",
  "agentReviewFile"
];

for (const sector of data.sectors ?? []) {
  if (!sector.id) errors.push("섹터 id 누락");
  if (!sector.name) errors.push(`${sector.id}: 섹터명 누락`);
  if (!Array.isArray(sector.keywords) || sector.keywords.length === 0) {
    errors.push(`${sector.id}: keywords 누락`);
  }

  for (const candidate of sector.candidates ?? []) {
    const label = `${sector.id}/${candidate.company ?? "회사명 누락"}`;

    for (const field of requiredCandidateFields) {
      if (!candidate[field]) errors.push(`${label}: ${field} 누락`);
    }
    if (candidate.market && !allowedMarkets.has(candidate.market)) {
      errors.push(`${label}: market 값 확인 필요 (${candidate.market})`);
    }
    if (!Array.isArray(candidate.nextChecks) || candidate.nextChecks.length === 0) {
      errors.push(`${label}: nextChecks 누락`);
    }
    if (!candidate.investmentValidation) {
      errors.push(`${label}: investmentValidation 누락`);
      continue;
    }
    for (const field of requiredValidationFields) {
      if (!candidate.investmentValidation[field]) {
        errors.push(`${label}: investmentValidation.${field} 누락`);
      }
    }
    if (
      candidate.investmentValidation.finalValidation &&
      !allowedValidations.has(candidate.investmentValidation.finalValidation)
    ) {
      errors.push(`${label}: finalValidation 값 확인 필요 (${candidate.investmentValidation.finalValidation})`);
    }
    for (const listField of ["sectorSpecificChecks", "capitalMarketChecks", "downsideChecks", "sourceNotes"]) {
      if (!Array.isArray(candidate.investmentValidation[listField]) || candidate.investmentValidation[listField].length === 0) {
        errors.push(`${label}: investmentValidation.${listField} 누락`);
      }
    }

    const v2 = candidate.v2Screening;
    if (!v2) {
      errors.push(`${label}: v2Screening 누락. npm run v2 실행 필요`);
      continue;
    }
    if (!allowedV2Classifications.has(v2.classification)) {
      errors.push(`${label}: v2 classification 값 확인 필요 (${v2.classification})`);
    }
    if (typeof v2.score !== "number" || v2.score < 0 || v2.score > 100) {
      errors.push(`${label}: v2 score 값 확인 필요 (${v2.score})`);
    }
    if (!v2.valuationStatus || !v2.retention || !v2.promptVerdict) {
      errors.push(`${label}: v2 판정 필드 누락`);
    }
    if (v2.marketCapEok != null && (typeof v2.marketCapEok !== "number" || v2.marketCapEok <= 0)) {
      errors.push(`${label}: v2 marketCapEok 값 확인 필요`);
    }
  }
}

if (errors.length > 0) {
  console.error("데이터 확인 실패:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const count = data.sectors.reduce((sum, sector) => sum + (sector.candidates?.length ?? 0), 0);
console.log(`OK: ${data.sectors.length}개 섹터, ${count}개 후보`);
