import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "sectors.json");
const outputPath = path.join(root, "docs", "catalyst-signals.md");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const rows = [];
for (const sector of data.sectors ?? []) {
  for (const candidate of sector.candidates ?? []) {
    const validation = candidate.investmentValidation;
    rows.push({
      sector: sector.name,
      company: candidate.company,
      ticker: candidate.ticker,
      validation: validation.finalValidation,
      flow: validation.growthCatalyst.currentFlow.label,
      probability: validation.growthCatalyst.probabilityPct,
      grade: validation.growthCatalyst.probabilityGrade,
      multiple: validation.trendSensitivity.multiple,
      up5: validation.trendSensitivity.expectedMoveIfBenchmarkUp5Pct,
      benchmark: validation.trendSensitivity.benchmark,
      keywords: validation.growthCatalyst.keywords.slice(0, 5).join(", ")
    });
  }
}

const avgProbability = average(rows.map((row) => row.probability));
const avgMultiple = average(rows.map((row) => row.multiple));
const counts = countBy(rows, (row) => row.validation);
const flowCounts = countBy(rows, (row) => row.flow);

const sectorRows = [...groupBy(rows, (row) => row.sector).entries()].map(([sector, items]) => ({
  sector,
  count: items.length,
  avgProbability: average(items.map((item) => item.probability)),
  avgMultiple: average(items.map((item) => item.multiple)),
  strong: items.filter((item) => item.validation === "Strong").length,
  watch: items.filter((item) => item.validation === "Watch").length,
  reconsider: items.filter((item) => item.validation === "Reconsider").length
}));

const topProbability = [...rows].sort((a, b) => b.probability - a.probability || b.multiple - a.multiple).slice(0, 20);
const highBeta = [...rows].sort((a, b) => b.multiple - a.multiple || b.probability - a.probability).slice(0, 20);
const lowPriority = [...rows].sort((a, b) => a.probability - b.probability || b.multiple - a.multiple).slice(0, 15);

const markdown = `# 성장 촉매·추세 배수 리포트

검토일: ${data.meta.lastUpdated}  
대상: ${data.sectors.length}개 섹터, ${rows.length}개 후보  
시가총액 기준: ${data.meta.marketCapAsOf}

## 산식

- 촉매 실현확률: ${data.catalystModel.probabilityFormula}
- 추세 변동성 배수: ${data.catalystModel.trendMultipleFormula}
- 예시: ${data.catalystModel.exampleRule}

이 배수는 가격 시계열로 계산한 통계 베타가 아니라 공시·정책 촉매 기반 예비 지표입니다. 실제 투자 전에는 종목별 일간 수익률과 KOSPI/KOSDAQ 수익률로 60일·120일 회귀 베타를 별도 계산해야 합니다.

## 전체 요약

| 항목 | 값 |
|---|---:|
| 평균 촉매 실현확률 | ${avgProbability.toFixed(1)}% |
| 평균 추세 변동성 배수 | ${avgMultiple.toFixed(2)}x |
| Strong | ${counts.Strong ?? 0} |
| Watch | ${counts.Watch ?? 0} |
| Reconsider | ${counts.Reconsider ?? 0} |
| 강한 긍정 | ${flowCounts["강한 긍정"] ?? 0} |
| 긍정 | ${flowCounts["긍정"] ?? 0} |
| 중립/확인대기 | ${flowCounts["중립/확인대기"] ?? 0} |
| 약세/후순위 | ${flowCounts["약세/후순위"] ?? 0} |

## 섹터별 평균

| 섹터 | 후보 | 확률 평균 | 배수 평균 | Strong | Watch | Reconsider |
|---|---:|---:|---:|---:|---:|---:|
${sectorRows
  .map(
    (row) =>
      `| ${row.sector} | ${row.count} | ${row.avgProbability.toFixed(1)}% | ${row.avgMultiple.toFixed(2)}x | ${row.strong} | ${row.watch} | ${row.reconsider} |`
  )
  .join("\n")}

## 촉매 확률 상위

| 섹터 | 기업 | validation | 흐름 | 확률 | 배수 | 지수 +5% 시 | 촉매 키워드 |
|---|---|---|---|---:|---:|---:|---|
${topProbability.map(tableRow).join("\n")}

## 추세 변동성 배수 상위

| 섹터 | 기업 | validation | 흐름 | 확률 | 배수 | 지수 +5% 시 | 촉매 키워드 |
|---|---|---|---|---:|---:|---:|---|
${highBeta.map(tableRow).join("\n")}

## 후순위 검토

| 섹터 | 기업 | validation | 흐름 | 확률 | 배수 | 지수 +5% 시 | 촉매 키워드 |
|---|---|---|---|---:|---:|---:|---|
${lowPriority.map(tableRow).join("\n")}
`;

fs.writeFileSync(outputPath, markdown, "utf8");
console.log(`Generated ${path.relative(root, outputPath)}`);

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function groupBy(items, selector) {
  const groups = new Map();
  for (const item of items) {
    const key = selector(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function tableRow(row) {
  return `| ${row.sector} | ${row.company} (${row.ticker}) | ${row.validation} | ${row.flow} | ${row.probability}% | ${row.multiple.toFixed(2)}x | ${row.up5} | ${row.keywords} |`;
}
