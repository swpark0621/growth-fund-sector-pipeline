import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "v4-study-data.json");
const outputPath = path.join(root, "docs", "v4.html");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const json = JSON.stringify(data).replaceAll("<", "\\u003c");

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.meta.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f6f8;
      --ink: #17202b;
      --muted: #657181;
      --line: #d9e0e8;
      --surface: #ffffff;
      --surface-2: #eef2f5;
      --nav: #17202b;
      --accent: #0f6b68;
      --blue: #2f5ea8;
      --warn: #9a5b13;
      --bad: #8c3333;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: "Segoe UI", "Malgun Gothic", Arial, sans-serif;
      line-height: 1.5;
    }
    a { color: inherit; }
    .layout {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 330px minmax(0, 1fr);
    }
    aside {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow: auto;
      padding: 24px 20px;
      background: var(--nav);
      color: #f8fafc;
    }
    main { min-width: 0; padding: 28px; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 8px; font-size: 22px; line-height: 1.25; letter-spacing: 0; }
    h2 { margin-bottom: 10px; font-size: 32px; line-height: 1.18; letter-spacing: 0; }
    h3 { margin-bottom: 10px; font-size: 17px; letter-spacing: 0; }
    .brand p { color: #cbd5df; font-size: 13px; }
    .side-box {
      display: grid;
      gap: 7px;
      margin: 16px 0;
      padding: 13px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: rgba(255,255,255,.06);
      font-size: 12px;
      color: #d8e1eb;
    }
    .side-links { display: grid; gap: 8px; margin-bottom: 14px; }
    .side-link {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 6px 10px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 8px;
      color: #f8fafc;
      text-decoration: none;
      font-size: 13px;
      font-weight: 800;
    }
    .side-link:hover { background: #ffffff; color: var(--ink); }
    .nav-list { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
    .nav-button {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      min-height: 42px;
      padding: 9px 11px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: rgba(255,255,255,.06);
      color: #f8fafc;
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .nav-button.active, .nav-button:hover { background: #ffffff; color: var(--ink); }
    .count {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-width: 30px;
      min-height: 22px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(15,107,104,.14);
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
    }
    .hero, .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
    }
    .hero { padding: 28px; margin-bottom: 16px; }
    .hero p { max-width: 1080px; margin-bottom: 0; color: var(--muted); }
    .kicker { margin-bottom: 9px; color: var(--accent); font-size: 13px; font-weight: 900; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .metric {
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
    }
    .metric strong { display: block; font-size: 27px; line-height: 1.1; }
    .metric span { color: var(--muted); font-size: 12px; }
    .panel { padding: 18px; margin-bottom: 16px; }
    .badges { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 25px;
      padding: 3px 8px;
      border-radius: 999px;
      background: var(--surface-2);
      color: #334155;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .badge.a { background: #e8f4f3; color: var(--accent); }
    .badge.b { background: #eaf1fb; color: var(--blue); }
    .badge.c { background: #fff4df; color: var(--warn); }
    .badge.track { background: #f1f3f5; color: #556070; }
    .badge.out { background: #f5e8e8; color: var(--bad); }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .segmented { display: flex; flex-wrap: wrap; gap: 6px; }
    .segmented button {
      min-height: 34px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
      color: var(--ink);
      font: inherit;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }
    .segmented button.active { border-color: var(--accent); background: #e8f4f3; color: var(--accent); }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
    table { width: 100%; min-width: 1880px; border-collapse: collapse; background: #fff; }
    th, td {
      padding: 10px 11px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th { position: sticky; top: 0; z-index: 1; background: #eef2f5; color: #344052; }
    tr:last-child td { border-bottom: 0; }
    .company { font-weight: 900; }
    .note { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .score { font-size: 21px; font-weight: 900; line-height: 1; }
    .positive { color: var(--accent); font-weight: 900; }
    .negative { color: var(--bad); font-weight: 900; }
    .link-list { display: grid; gap: 4px; margin-top: 7px; }
    .link-list a { color: var(--blue); font-size: 12px; text-decoration: none; }
    .link-list a:hover { text-decoration: underline; }
    ul.clean { margin: 0; padding-left: 17px; color: var(--muted); }
    .wide-note { max-width: 1080px; color: var(--muted); }
    footer { margin-top: 18px; color: var(--muted); font-size: 12px; }
    @media (max-width: 1180px) {
      .layout { grid-template-columns: 1fr; }
      aside { position: static; height: auto; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      main { padding: 16px; }
      aside { padding: 18px; }
      .metrics { grid-template-columns: 1fr; }
      .hero { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand">
        <h1>${escapeHtml(data.meta.title)}</h1>
        <p>정책 수혜 + 저평가 + 중장기 수급 스터디</p>
      </div>
      <div class="side-box">
        <span>산출일: ${escapeHtml(data.meta.runDate)}</span>
        <span>최근 거래일: ${escapeHtml(data.meta.latestTradingDate)}</span>
        <span>기준: ${escapeHtml(data.meta.threshold)}</span>
        <span>출처: ${escapeHtml(data.meta.source)}</span>
      </div>
      <div class="side-links">
        <a class="side-link" href="index.html">v2 정책 후보</a>
        <a class="side-link" href="v3.html">v3 외국인 수급</a>
      </div>
      <ul class="nav-list" id="sideNav"></ul>
    </aside>
    <main>
      <section class="hero">
        <p class="kicker">v4 Study Dashboard</p>
        <h2>국민성장펀드 수혜 가능성이 있는데 아직 시장이 덜 본 후보를 찾습니다.</h2>
        <p>${escapeHtml(data.meta.method)} 6000억원은 상한선이고, 실제 저평가 점수는 1500억~3000억원 구간을 가장 선호하도록 설계했습니다.</p>
      </section>
      <section class="metrics" id="metrics"></section>
      <section class="panel">
        <h3>스터디 검증 기준</h3>
        <p class="wide-note">처음 만든 검증 프롬프트를 유지하되, v4에서는 “시장이 다시 볼 이유”를 반드시 같이 봅니다. 각 종목은 정책 적합성, 실제 밸류체인 직접성, 1/4/12주 외국인 수급, 6개월 보유율 변화, 기관 동행 여부, 주가 위치, 재무·희석 리스크, 촉매를 한 줄에서 검토할 수 있게 구성했습니다.</p>
        <p class="wide-note">Big3 모니터링은 BlackRock/iShares, Vanguard, State Street/SSGA/SPDR 명칭이 공개 institutional ownership 페이지에 잡히는지 확인하는 보조 항목입니다. 현재 데이터는 Fintel SEC 신고 기반 페이지를 출처로 하며, 국내 전체 주주명부나 실시간 지분율을 의미하지 않습니다.</p>
        <div class="badges">
          <span class="badge a">A: 우선 스터디</span>
          <span class="badge b">B: 후보 스터디</span>
          <span class="badge c">C: 보류 스터디</span>
          <span class="badge track">추적: 6000억 초과 대표주</span>
          <span class="badge out">제외</span>
        </div>
      </section>
      <section class="panel">
        <div class="toolbar">
          <h3 style="margin:0;">v4 종합 스터디 테이블</h3>
          <div class="segmented">
            <button class="active" type="button" data-filter="study">스터디 후보</button>
            <button type="button" data-filter="A">A</button>
            <button type="button" data-filter="B">B</button>
            <button type="button" data-filter="C">C</button>
            <button type="button" data-filter="추적">추적</button>
            <button type="button" data-filter="all">전체</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>순위</th>
                <th>회사</th>
                <th>섹터/정책 근거</th>
                <th>시총·저평가</th>
                <th>외국인 수급</th>
                <th>기관/주주 비중</th>
                <th>Big3 모니터링</th>
                <th>가격 위치</th>
                <th>점수</th>
                <th>판정</th>
                <th>촉매</th>
                <th>리스크</th>
                <th>다음 스터디 질문</th>
                <th>출처</th>
              </tr>
            </thead>
            <tbody id="tableBody"></tbody>
          </table>
        </div>
      </section>
      <footer>갱신 순서: <code>npm run v4</code>. 네이버 금융 표 구조가 바뀌면 수집 스크립트 확인이 필요합니다.</footer>
    </main>
  </div>
  <script>
    const DATA = ${json};
    let currentFilter = "study";
    const tableBody = document.querySelector("#tableBody");
    const metrics = document.querySelector("#metrics");
    const sideNav = document.querySelector("#sideNav");

    function renderMetrics() {
      const counts = DATA.meta.classCounts;
      metrics.innerHTML = [
        ["전체", DATA.meta.totalUniqueTickers, "중복 제거 종목"],
        ["A", counts.A ?? 0, "우선 스터디"],
        ["B", counts.B ?? 0, "후보 스터디"],
        ["C", counts.C ?? 0, "보류 스터디"],
        ["추적", counts["추적"] ?? 0, "6000억 초과 대표주"],
      ].map(([label, value, note]) => \`
        <div class="metric">
          <strong>\${escapeHtml(value)}</strong>
          <span>\${escapeHtml(label)} · \${escapeHtml(note)}</span>
        </div>
      \`).join("");
    }

    function renderNav() {
      const sectorCounts = new Map();
      for (const row of DATA.studyRows) {
        for (const sector of row.sectors) sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1);
      }
      sideNav.innerHTML = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([sector, count]) => \`
        <li>
          <button class="nav-button" type="button" data-sector="\${escapeHtml(sector)}">
            <span>\${escapeHtml(sector)}</span>
            <span class="count">\${count}</span>
          </button>
        </li>
      \`).join("");
      document.querySelectorAll("[data-sector]").forEach((button) => {
        button.addEventListener("click", () => {
          currentFilter = button.dataset.sector;
          document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("active"));
          renderTable();
        });
      });
    }

    function rowsForFilter() {
      let rows = DATA.rows;
      if (currentFilter === "study") rows = DATA.studyRows;
      else if (currentFilter !== "all") rows = rows.filter((row) => row.v4.classification === currentFilter || row.sectors.includes(currentFilter));
      return rows;
    }

    function renderTable() {
      const rows = rowsForFilter();
      tableBody.innerHTML = rows.map((row, index) => renderRow(row, index)).join("");
      document.querySelectorAll("[data-sector]").forEach((button) => {
        button.classList.toggle("active", button.dataset.sector === currentFilter);
      });
    }

    function renderRow(row, index) {
      const w = row.flowTrend.windows;
      return \`
        <tr>
          <td class="num">\${index + 1}</td>
          <td>
            <span class="company">\${escapeHtml(row.company)}</span>
            <span class="note">\${escapeHtml(row.ticker)} · \${escapeHtml(row.market)}</span>
            <span class="note">기존 validation: \${escapeHtml(row.baseValidation)}</span>
          </td>
          <td>
            <div class="badges">\${row.sectors.map((sector) => \`<span class="badge">\${escapeHtml(sector)}</span>\`).join("")}</div>
            <span class="note">\${escapeHtml(row.valueChains.slice(0, 2).join(" / "))}</span>
            <span class="note">\${escapeHtml((row.study.policyFitEvidence ?? []).slice(0, 1).join(""))}</span>
          </td>
          <td>
            <span class="num">\${eok(row.marketCap.eok)}</span>
            <span class="note">\${escapeHtml(row.marketCap.sizeBucket)}</span>
            <span class="note">\${escapeHtml(row.valuation.interpretation)}</span>
          </td>
          <td>
            <span class="\${signClass(w.w4.foreignValueToMarketCapPct)}">4주 \${pct(w.w4.foreignValueToMarketCapPct)}</span>
            <span class="note \${signClass(w.w1.foreignValueToMarketCapPct)}">1주 \${pct(w.w1.foreignValueToMarketCapPct)}</span>
            <span class="note \${signClass(w.w12.foreignValueToMarketCapPct)}">12주 \${pct(w.w12.foreignValueToMarketCapPct)}</span>
            <span class="note \${signClass(w.m6.foreignValueToMarketCapPct)}">약 6개월 \${pct(w.m6.foreignValueToMarketCapPct)}</span>
          </td>
          <td>
            <span class="\${signClass(w.w4.institutionValueToMarketCapPct)}">기관 4주 \${pct(w.w4.institutionValueToMarketCapPct)}</span>
            <span class="note \${signClass(w.w12.institutionValueToMarketCapPct)}">기관 12주 \${pct(w.w12.institutionValueToMarketCapPct)}</span>
            <span class="note">외국인 보유율 \${pct(row.flowTrend.ownership.latestHoldingRatePct)}</span>
            <span class="note \${signClass(row.flowTrend.ownership.sixMonthHoldingRateChangePctp)}">보유율 변화 \${pctp(row.flowTrend.ownership.sixMonthHoldingRateChangePctp)}</span>
          </td>
          <td>
            <span class="badge \${big3Class(row.big3Ownership?.summary)}">\${escapeHtml(row.big3Ownership?.summary ?? "확인 필요")}</span>
            <span class="note">\${big3ManagerText(row.big3Ownership)}</span>
            <span class="note">Fintel 기관 보유율: \${pct(row.big3Ownership?.institutionalSharesPct)}</span>
            <span class="note">\${escapeHtml(row.big3Ownership?.note ?? "")}</span>
          </td>
          <td>
            <span class="\${signClass(row.priceTrend.returns.w12)}">12주 \${pct(row.priceTrend.returns.w12)}</span>
            <span class="note \${signClass(row.priceTrend.returns.w4)}">4주 \${pct(row.priceTrend.returns.w4)}</span>
            <span class="note \${signClass(row.priceTrend.drawdownFromHighPct)}">고점대비 \${pct(row.priceTrend.drawdownFromHighPct)}</span>
            <span class="note">저점대비 \${pct(row.priceTrend.reboundFromLowPct)}</span>
          </td>
          <td>
            <span class="score">\${escapeHtml(row.v4.totalScore)}</span>
            <span class="note">저평가 \${escapeHtml(row.v4.undervaluationScore)} / 수급 \${escapeHtml(row.v4.scores.flowTrend)}</span>
            <span class="note">정책 \${escapeHtml(row.v4.scores.policyFit)} / 직접성 \${escapeHtml(row.v4.scores.businessDirectness)}</span>
          </td>
          <td>
            <span class="badge \${className(row.v4.classification)}">\${escapeHtml(row.v4.classification)}</span>
            <span class="note">\${escapeHtml(row.v4.verdict)}</span>
          </td>
          <td><ul class="clean">\${(row.study.keyCatalysts ?? []).slice(0, 5).map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}</ul></td>
          <td><ul class="clean">\${(row.study.riskFlags ?? []).slice(0, 5).map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}</ul></td>
          <td><ul class="clean">\${(row.study.nextStudyQuestions ?? []).slice(0, 5).map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}</ul></td>
          <td>
            <div class="link-list">
              <a href="\${escapeHtml(row.flowTrend.sourceUrl ?? "")}" target="_blank" rel="noreferrer">수급</a>
              <a href="\${escapeHtml(row.marketCap.sourceUrl ?? "")}" target="_blank" rel="noreferrer">시총·투자정보</a>
            </div>
          </td>
        </tr>
      \`;
    }

    document.querySelectorAll("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        currentFilter = button.dataset.filter;
        document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
        renderTable();
      });
    });

    function className(value) {
      if (value === "A") return "a";
      if (value === "B") return "b";
      if (value === "C") return "c";
      if (value === "추적") return "track";
      return "out";
    }
    function big3Class(value) {
      if (String(value ?? "").includes("BlackRock") || String(value ?? "").includes("Vanguard") || String(value ?? "").includes("SSGA")) return "a";
      if (String(value ?? "").includes("수동")) return "c";
      return "track";
    }
    function big3ManagerText(value) {
      const managers = value?.managers ?? [];
      if (!managers.length) return "BlackRock / Vanguard / SSGA 확인 필요";
      return managers.map((item) => \`\${item.name}: \${item.status}\`).join(" · ");
    }
    function signClass(value) {
      if (Number(value) > 0) return "positive";
      if (Number(value) < 0) return "negative";
      return "";
    }
    function eok(value) {
      if (value === null || value === undefined) return "-";
      return Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "억원";
    }
    function pct(value) {
      if (value === null || value === undefined) return "-";
      return Number(value).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + "%";
    }
    function pctp(value) {
      if (value === null || value === undefined) return "-";
      return Number(value).toLocaleString("ko-KR", { minimumFractionDigits: 3, maximumFractionDigits: 4 }) + "%p";
    }
    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    renderMetrics();
    renderNav();
    renderTable();
  </script>
</body>
</html>`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
console.log(`Generated ${path.relative(root, outputPath)}`);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
