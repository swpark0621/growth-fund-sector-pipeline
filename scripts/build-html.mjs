import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "sectors.json");
const outputPath = path.join(root, "docs", "index.html");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const json = JSON.stringify(data).replaceAll("<", "\\u003c");

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.meta.title)} v2</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f6f8;
      --ink: #18202b;
      --muted: #626b78;
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
      grid-template-columns: 310px minmax(0, 1fr);
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
    h2 { margin-bottom: 10px; font-size: 30px; line-height: 1.2; letter-spacing: 0; }
    h3 { margin-bottom: 10px; font-size: 17px; letter-spacing: 0; }
    .subtle { color: var(--muted); }
    .brand p { margin-bottom: 18px; color: #cbd5df; font-size: 13px; }
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
    .nav-list {
      display: grid;
      gap: 7px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    button {
      font: inherit;
      cursor: pointer;
    }
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
    }
    .nav-button.active,
    .nav-button:hover { background: #ffffff; color: var(--ink); }
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
    .hero,
    .panel,
    .sector-card,
    .detail {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
    }
    .hero { padding: 28px; margin-bottom: 16px; }
    .hero p { max-width: 1000px; margin-bottom: 0; }
    .kicker {
      margin-bottom: 9px;
      color: var(--accent);
      font-size: 13px;
      font-weight: 800;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .metric {
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
    }
    .metric strong { display: block; font-size: 28px; line-height: 1.1; }
    .metric span { color: var(--muted); font-size: 12px; }
    .panel { padding: 18px; margin-bottom: 16px; }
    .sector-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .sector-card {
      width: 100%;
      min-height: 132px;
      padding: 14px;
      color: inherit;
      text-align: left;
    }
    .sector-card.active,
    .sector-card:hover {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(15,107,104,.12);
    }
    .sector-card p { margin-bottom: 0; color: var(--muted); font-size: 12px; }
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
      font-weight: 700;
    }
    .badge.a { background: #e8f4f3; color: var(--accent); }
    .badge.b { background: #eaf1fb; color: var(--blue); }
    .badge.c { background: #fff4df; color: var(--warn); }
    .badge.out { background: #f5e8e8; color: var(--bad); }
    .detail { overflow: hidden; }
    .detail-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 18px;
      padding: 20px;
      border-bottom: 1px solid var(--line);
      background: #fbfcfd;
    }
    .detail-body { padding: 20px; display: grid; gap: 18px; }
    .table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
    table { width: 100%; min-width: 1480px; border-collapse: collapse; background: #fff; }
    th, td {
      padding: 10px 11px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th { position: sticky; top: 0; z-index: 1; background: #eef2f5; color: #344052; }
    tr:last-child td { border-bottom: 0; }
    .company { font-weight: 800; }
    .note { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .score { font-size: 22px; font-weight: 900; line-height: 1; }
    .link-list { display: grid; gap: 4px; margin-top: 7px; }
    .link-list a { color: var(--blue); font-size: 12px; text-decoration: none; }
    .link-list a:hover { text-decoration: underline; }
    ul.clean { margin: 0; padding-left: 17px; color: var(--muted); }
    footer { margin-top: 18px; color: var(--muted); font-size: 12px; }
    @media (max-width: 1180px) {
      .layout { grid-template-columns: 1fr; }
      aside { position: static; height: auto; }
      .metrics, .sector-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      main { padding: 16px; }
      aside { padding: 18px; }
      .metrics, .sector-grid, .detail-head { grid-template-columns: 1fr; }
      .hero { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand">
        <h1>${escapeHtml(data.meta.title)} v2</h1>
        <p>${escapeHtml(data.meta.subtitle)}</p>
      </div>
      <div class="side-box">
        <span>업데이트: ${escapeHtml(data.meta.lastUpdated)}</span>
        <span>시총 기준: ${escapeHtml(data.meta.marketCapAsOf)}</span>
        <span>필터: ${escapeHtml(data.meta.threshold ?? "3000억원 이하")}</span>
      </div>
      <ul class="nav-list" id="sideNav"></ul>
    </aside>
    <main>
      <section class="hero">
        <p class="kicker">국민성장펀드 후보 스크리닝 v2</p>
        <h2>공식 정책 적합성과 3000억원 이하 필터를 분리해 후보를 줄입니다.</h2>
        <p class="subtle">${escapeHtml(data.meta.v2Rule ?? data.meta.scope)} 섹터별로 선별해 작업량을 줄이고, 시총 초과 기업은 삭제하지 않고 추적 후보로 분리합니다.</p>
      </section>
      <section class="metrics" id="metrics"></section>
      <section class="panel">
        <h3>검증 프롬프트 적용 기준</h3>
        <p class="subtle">유지/보류/제외 판정은 시총·기업가치 3000억원 이하 여부, 공식 12개 첨단전략산업 적합성, 단순 테마성 여부, 신규자금 유입 가능성, 출처 신뢰도를 분리해 계산합니다. 출처 없는 수치와 불확실한 기업가치는 만들지 않습니다.</p>
        <div class="badges">
          <span class="badge a">A: 적합 + 3000억원 이하</span>
          <span class="badge b">B: 가치 확인 필요</span>
          <span class="badge c">C: 저시총이나 명분 약함</span>
          <span class="badge out">제외: 3000억원 초과/근거 부족</span>
        </div>
        <p class="subtle" style="margin:12px 0 0;">
          <a href="v2-agent-validation.md">v2 에이전트 검증 요약</a> ·
          <a href="company-validation/README.md">종목별 validation 문서</a> ·
          <a href="v3.html">v3 외국인 수급 후보</a> ·
          <a href="v4.html">v4 저평가 스터디</a>
        </p>
      </section>
      <section class="panel">
        <h3>섹터별 진행</h3>
        <div class="sector-grid" id="sectorGrid"></div>
      </section>
      <section class="detail" id="sectorDetail"></section>
      <footer>이 문서는 <code>data/sectors.json</code>에서 생성됩니다. 데이터 변경 후 <code>npm run v2</code>, <code>npm run check</code>, <code>npm run build</code> 순서로 갱신합니다.</footer>
    </main>
  </div>
  <script>
    const DATA = ${json};
    const sideNav = document.querySelector("#sideNav");
    const sectorGrid = document.querySelector("#sectorGrid");
    const detail = document.querySelector("#sectorDetail");
    const metrics = document.querySelector("#metrics");

    function renderMetrics() {
      const flat = DATA.sectors.flatMap((sector) => sector.candidates.map((candidate) => ({ sector, candidate })));
      const a = flat.filter(({ candidate }) => candidate.v2Screening?.classification === "A").length;
      const c = flat.filter(({ candidate }) => candidate.v2Screening?.classification === "C").length;
      const out = flat.filter(({ candidate }) => candidate.v2Screening?.classification === "제외").length;
      const near = flat.filter(({ candidate }) => candidate.v2Screening?.nearThreshold).length;
      metrics.innerHTML = [
        ["총 후보", flat.length, "기존 후보는 보존"],
        ["A 후보", a, "최종 검토 우선"],
        ["C/보류", c, "저시총이나 명분 재검토"],
        ["제외/추적", out, near + "개 경계 재확인"]
      ].map(([label, value, note]) => \`
        <div class="metric">
          <strong>\${escapeHtml(value)}</strong>
          <span>\${escapeHtml(label)} · \${escapeHtml(note)}</span>
        </div>
      \`).join("");
    }

    function renderNav() {
      sideNav.innerHTML = DATA.sectors.map((sector) => \`
        <li>
          <button class="nav-button" data-id="\${sector.id}" type="button">
            <span>\${escapeHtml(sector.name)}</span>
            <span class="count">\${sector.v2Summary?.underThreshold ?? 0}/\${sector.candidates.length}</span>
          </button>
        </li>
      \`).join("");

      sectorGrid.innerHTML = DATA.sectors.map((sector) => \`
        <button class="sector-card" data-id="\${sector.id}" type="button">
          <h3>\${escapeHtml(sector.name)}</h3>
          <p>\${escapeHtml(sector.summary)}</p>
          <div class="badges">
            <span class="badge a">3000억 이하 \${sector.v2Summary?.underThreshold ?? 0}</span>
            <span class="badge out">초과 \${sector.v2Summary?.overThreshold ?? 0}</span>
          </div>
        </button>
      \`).join("");

      document.querySelectorAll("[data-id]").forEach((button) => {
        button.addEventListener("click", () => renderSector(button.dataset.id));
      });
    }

    function renderSector(id) {
      const sector = DATA.sectors.find((item) => item.id === id) ?? DATA.sectors[0];
      document.querySelectorAll("[data-id]").forEach((button) => {
        button.classList.toggle("active", button.dataset.id === sector.id);
      });

      const sorted = [...sector.candidates].sort((a, b) => {
        const rank = { A: 0, B: 1, C: 2, "제외": 3 };
        return (rank[a.v2Screening?.classification] ?? 9) - (rank[b.v2Screening?.classification] ?? 9)
          || (b.v2Screening?.score ?? 0) - (a.v2Screening?.score ?? 0);
      });

      detail.innerHTML = \`
        <div class="detail-head">
          <div>
            <h2>\${escapeHtml(sector.name)}</h2>
            <p class="subtle">\${escapeHtml(sector.summary)}</p>
            <div class="badges">
              \${sector.keywords.slice(0, 8).map((keyword) => \`<span class="badge">\${escapeHtml(keyword)}</span>\`).join("")}
            </div>
          </div>
          <div class="side-box" style="background:#17202b; min-width:230px; margin:0;">
            <span>후보 \${sector.candidates.length}개</span>
            <span>3000억 이하 \${sector.v2Summary?.underThreshold ?? 0}개</span>
            <span>초과/추적 \${sector.v2Summary?.overThreshold ?? 0}개</span>
          </div>
        </div>
        <div class="detail-body">
          <div class="panel">
            <h3>섹터별 확인 키워드</h3>
            <div class="badges">\${sector.dartKeywords.map((item) => \`<span class="badge">\${escapeHtml(item)}</span>\`).join("")}</div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>회사명</th>
                  <th>상장/비상장</th>
                  <th>산업분류</th>
                  <th>국민성장펀드 적합 근거</th>
                  <th>시총/기업가치</th>
                  <th>기준일/출처</th>
                  <th>투자포인트</th>
                  <th>리스크</th>
                  <th>점수</th>
                  <th>분류</th>
                  <th>검증 판정</th>
                  <th>다음 확인사항</th>
                </tr>
              </thead>
              <tbody>
                \${sorted.map((candidate) => renderCandidate(candidate)).join("")}
              </tbody>
            </table>
          </div>
        </div>
      \`;
      detail.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderCandidate(candidate) {
      const v2 = candidate.v2Screening ?? {};
      const sourceLinks = (candidate.investmentValidation?.sourceNotes ?? []).slice(0, 3).map((source) =>
        \`<a href="\${escapeHtml(source.url)}" target="_blank" rel="noreferrer">\${escapeHtml(source.type)}: \${escapeHtml(source.label)}</a>\`
      ).join("");
      return \`
        <tr>
          <td>
            <span class="company">\${escapeHtml(candidate.company)}</span>
            <span class="note">\${escapeHtml(candidate.ticker)}</span>
          </td>
          <td>\${escapeHtml(candidate.market)}</td>
          <td>\${escapeHtml(candidate.valueChain)}</td>
          <td>
            \${escapeHtml(candidate.reason)}
            <span class="note">\${escapeHtml(candidate.investmentValidation?.validationSummary ?? "")}</span>
          </td>
          <td>
            \${escapeHtml(candidate.marketCap)}
            <span class="note">\${escapeHtml(v2.valuationStatus ?? "")}</span>
          </td>
          <td>
            \${escapeHtml(v2.source?.basis ?? DATA.meta.marketCapAsOf)}
            <div class="link-list">\${sourceLinks}</div>
          </td>
          <td>
            \${escapeHtml(candidate.capitalUse)}
            <span class="note">경로: \${escapeHtml(candidate.possiblePath)}</span>
            <span class="note">성장 촉매: \${escapeHtml(candidate.investmentValidation?.growthCatalyst?.probabilityPct ?? "")}%</span>
          </td>
          <td>
            \${escapeHtml(candidate.investmentValidation?.valuationCheck ?? "")}
            <span class="note">\${escapeHtml(candidate.investmentValidation?.financialDilutionRisk ?? "")}</span>
          </td>
          <td>
            <span class="score">\${escapeHtml(v2.score ?? "-")}</span>
            <span class="note">\${scoreBreakdown(v2.scoreBreakdown)}</span>
          </td>
          <td><span class="badge \${className(v2.classification)}">\${escapeHtml(v2.classification ?? "미분류")}</span></td>
          <td>
            \${escapeHtml(v2.promptVerdict ?? "")}
            <span class="note">기존 validation: \${escapeHtml(candidate.investmentValidation?.finalValidation ?? "")}</span>
            <span class="note">유지 구분: \${escapeHtml(v2.retention ?? "")}</span>
          </td>
          <td><ul class="clean">\${candidate.nextChecks.map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}</ul></td>
        </tr>
      \`;
    }

    function scoreBreakdown(value) {
      if (!value) return "";
      return \`정책 \${value.policyFit} / 가치 \${value.valuationThreshold} / 직접성 \${value.valueChainDirectness} / 촉매 \${value.growthCatalyst} / 투자성 \${value.investability}\`;
    }

    function className(value) {
      if (value === "A") return "a";
      if (value === "B") return "b";
      if (value === "C") return "c";
      return "out";
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
    renderSector(DATA.sectors[0].id);
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
