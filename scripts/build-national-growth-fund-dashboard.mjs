import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "national-growth-fund-dashboard.json");
const outputPath = path.join(root, "docs", "national-growth-fund-dashboard.html");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const json = JSON.stringify(data).replaceAll("<", "\\u003c").replaceAll("</script", "<\\/script");

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.meta.title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6f8;
      --ink: #141a22;
      --muted: #5f6b7a;
      --line: #d8dee7;
      --surface: #ffffff;
      --surface-2: #eef2f6;
      --nav: #18212e;
      --green: #0b6b5d;
      --blue: #2e5ea8;
      --gold: #9a6515;
      --red: #8d3a35;
      --violet: #6b4aa3;
      --teal-soft: #e5f3f0;
      --blue-soft: #e8eef9;
      --gold-soft: #fff2db;
      --red-soft: #f7e8e6;
      --violet-soft: #eee9f7;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: "Segoe UI", "Malgun Gothic", Arial, sans-serif;
      line-height: 1.5;
    }
    a { color: inherit; }
    button, input { font: inherit; }
    .layout {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
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
    h2 { margin-bottom: 8px; font-size: 30px; line-height: 1.2; letter-spacing: 0; }
    h3 { margin-bottom: 10px; font-size: 17px; letter-spacing: 0; }
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
    .nav-list { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
    .nav-link {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      min-height: 38px;
      padding: 8px 10px;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 8px;
      background: rgba(255,255,255,.05);
      color: #f8fafc;
      text-decoration: none;
      font-size: 13px;
      font-weight: 800;
    }
    .nav-link:hover { background: #ffffff; color: var(--ink); }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(255,255,255,.12);
      color: #e5edf7;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(300px, .9fr);
      gap: 20px;
      align-items: stretch;
      padding: 28px;
      margin-bottom: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
    }
    .kicker { margin-bottom: 9px; color: var(--green); font-size: 13px; font-weight: 900; }
    .hero p, .muted { color: var(--muted); }
    .hero-panel {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .hero-stat {
      min-height: 92px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
    }
    .hero-stat strong { display: block; font-size: 28px; line-height: 1.1; }
    .hero-stat span { color: var(--muted); font-size: 12px; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .metric {
      min-height: 112px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
    }
    .metric strong { display: block; font-size: 27px; line-height: 1.1; }
    .metric span { display: block; margin-top: 6px; color: var(--muted); font-size: 12px; }
    .section-band {
      padding: 18px;
      margin-bottom: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
    }
    .section-head {
      display: flex;
      gap: 12px;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .section-head p { max-width: 860px; margin-bottom: 0; color: var(--muted); font-size: 13px; }
    .grid-2 {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr);
      gap: 14px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .mini-card {
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
    }
    .mini-card h4 {
      margin: 0 0 8px;
      font-size: 14px;
      letter-spacing: 0;
    }
    .mini-card p { margin-bottom: 0; color: var(--muted); font-size: 12px; }
    .progress-list { display: grid; gap: 10px; }
    .progress-row {
      display: grid;
      grid-template-columns: 130px minmax(0, 1fr) 96px;
      gap: 10px;
      align-items: center;
      min-height: 42px;
    }
    .progress-label strong { display: block; font-size: 13px; }
    .progress-label span { display: block; color: var(--muted); font-size: 11px; }
    .bar {
      height: 12px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--surface-2);
    }
    .bar-fill {
      height: 100%;
      border-radius: inherit;
      background: var(--green);
    }
    .bar-fill.direct { background: var(--green); }
    .bar-fill.indirect { background: var(--violet); }
    .bar-fill.infra { background: var(--blue); }
    .bar-fill.loan { background: var(--gold); }
    .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .segmented {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .segmented button {
      min-height: 34px;
      padding: 5px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
      color: var(--ink);
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
    }
    .segmented button.active {
      border-color: var(--green);
      background: var(--teal-soft);
      color: var(--green);
    }
    .search {
      width: min(360px, 100%);
      min-height: 36px;
      padding: 7px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      color: var(--ink);
    }
    .table-wrap {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    table { width: 100%; min-width: 1280px; border-collapse: collapse; }
    th, td {
      padding: 10px 11px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th { position: sticky; top: 0; z-index: 1; background: #eef2f6; color: #334052; }
    tr:last-child td { border-bottom: 0; }
    .entity { font-weight: 900; }
    .note { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.42; }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .badge.direct { background: var(--teal-soft); color: var(--green); }
    .badge.indirect { background: var(--violet-soft); color: var(--violet); }
    .badge.infra { background: var(--blue-soft); color: var(--blue); }
    .badge.loan { background: var(--gold-soft); color: var(--gold); }
    .badge.plan { background: var(--surface-2); color: #475569; }
    .badge.warn { background: var(--red-soft); color: var(--red); }
    .timeline {
      position: relative;
      display: grid;
      gap: 10px;
      padding-left: 18px;
    }
    .timeline::before {
      content: "";
      position: absolute;
      left: 5px;
      top: 9px;
      bottom: 9px;
      width: 2px;
      background: var(--line);
    }
    .timeline-item {
      position: relative;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
    }
    .timeline-item::before {
      content: "";
      position: absolute;
      left: -20px;
      top: 18px;
      width: 10px;
      height: 10px;
      border: 2px solid var(--surface);
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 0 1px var(--line);
    }
    .timeline-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      align-items: center;
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .timeline-item h4 { margin: 0 0 5px; font-size: 14px; letter-spacing: 0; }
    .timeline-item p { margin: 0; color: var(--muted); font-size: 12px; }
    .manager-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .manager-list {
      display: grid;
      gap: 7px;
      margin-top: 10px;
    }
    .manager-row {
      padding: 9px 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .manager-row strong { display: block; font-size: 12px; }
    .manager-row span { display: block; color: var(--muted); font-size: 11px; }
    .source-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
    }
    .source-link {
      min-height: 74px;
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
      text-decoration: none;
    }
    .source-link:hover { border-color: var(--blue); }
    .source-link strong { display: block; margin-bottom: 4px; font-size: 13px; }
    .source-link span { display: block; color: var(--muted); font-size: 12px; }
    .compact-list {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .compact-list li {
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfd;
      font-size: 13px;
    }
    .footer { margin-top: 18px; color: var(--muted); font-size: 12px; }
    @media (max-width: 1280px) {
      .layout { grid-template-columns: 1fr; }
      aside { position: static; height: auto; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .manager-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 900px) {
      main { padding: 16px; }
      aside { padding: 18px; }
      .hero, .grid-2 { grid-template-columns: 1fr; }
      .grid-3, .metrics, .manager-grid, .source-list { grid-template-columns: 1fr; }
      .section-head { display: block; }
      .progress-row { grid-template-columns: 1fr; }
      .hero-panel { grid-template-columns: 1fr; }
      h2 { font-size: 24px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand">
        <h1>${escapeHtml(data.meta.title)}</h1>
        <p>승인금액, 투자계획, 운용주체, 판매·펀드레이징 단계 추적</p>
      </div>
      <div class="side-box">
        <span>기준일: ${escapeHtml(data.meta.asOf)}</span>
        <span>공식 누적: ${escapeHtml(formatMoneyServer(data.meta.officialCumulativeApprovedTn))}</span>
        <span>승인 건수: ${escapeHtml(data.meta.officialApprovedCount)}건</span>
        <span>기금 승인: ${escapeHtml(formatMoneyServer(data.meta.officialCumulativeFundApprovedTn))}</span>
      </div>
      <nav class="nav-list" aria-label="대시보드 섹션">
        <a class="nav-link" href="#overview"><span>요약</span><span class="tag">KPI</span></a>
        <a class="nav-link" href="#plan"><span>사용 계획</span><span class="tag">30조</span></a>
        <a class="nav-link" href="#timeline"><span>타임라인</span><span class="tag">2025-2026</span></a>
        <a class="nav-link" href="#approvals"><span>승인 내역</span><span class="tag">16건</span></a>
        <a class="nav-link" href="#operators"><span>집행 주체</span><span class="tag">GP/LP</span></a>
        <a class="nav-link" href="#sources"><span>출처</span><span class="tag">공식/시장</span></a>
      </nav>
    </aside>
    <main>
      <section class="hero" id="overview">
        <div>
          <p class="kicker">National Growth Fund Monitor</p>
          <h2>국민성장펀드의 계획, 승인, 운용사 선정, 국민참여형 판매 흐름을 한 화면에서 추적합니다.</h2>
          <p>${escapeHtml(data.meta.disclosureNote)}</p>
        </div>
        <div class="hero-panel" id="heroStats"></div>
      </section>

      <section class="metrics" id="metrics"></section>

      <section class="section-band" id="plan">
        <div class="section-head">
          <div>
            <h3>총 규모와 2026년 사용 계획</h3>
            <p>5년 총 150조원 중 2026년 공급 목표는 30조원입니다. 5월 28일 공식 누적 기준으로 직접투자, 인프라투융자, 저리대출에서 12.5조원이 승인됐고, 간접투자는 별도 운용사 선정과 펀드 결성 절차가 진행 중입니다.</p>
          </div>
        </div>
        <div class="grid-2">
          <div class="mini-card">
            <h4>방식별 목표 대비 승인</h4>
            <div class="progress-list" id="methodProgress"></div>
          </div>
          <div class="mini-card">
            <h4>국민참여형 구조</h4>
            <div id="publicFund"></div>
          </div>
        </div>
      </section>

      <section class="section-band" id="timeline">
        <div class="section-head">
          <div>
            <h3>타임라인</h3>
            <p>정책 발표부터 프로젝트 승인, 국민참여형 판매, 간접투자 GP 선정까지의 진행 상태입니다.</p>
          </div>
          <div class="segmented" id="timelineFilters"></div>
        </div>
        <div class="timeline" id="timelineList"></div>
      </section>

      <section class="section-band" id="approvals">
        <div class="toolbar">
          <div>
            <h3 style="margin-bottom:4px;">프로젝트별 승인·자금공급 결정 내역</h3>
            <p class="muted" style="margin-bottom:0;font-size:13px;">개별 합산 ${escapeHtml(formatMoneyServer(data.cumulative.computedProjectSumTn))}은 공식 반올림 누적 ${escapeHtml(formatMoneyServer(data.cumulative.officialApprovedTn))}과 맞춰 읽어야 합니다.</p>
          </div>
          <input class="search" id="approvalSearch" type="search" placeholder="기업, 산업, 지역 검색" aria-label="승인 내역 검색">
        </div>
        <div class="segmented" id="approvalFilters" style="margin-bottom:12px;"></div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>일자</th>
                <th>기업·사업</th>
                <th>방식</th>
                <th>승인액</th>
                <th>기금 부담</th>
                <th>지역·산업</th>
                <th>수단·주체</th>
                <th>목적과 비고</th>
              </tr>
            </thead>
            <tbody id="approvalRows"></tbody>
          </table>
        </div>
      </section>

      <section class="section-band">
        <div class="section-head">
          <div>
            <h3>승인 전·준비 중 파이프라인</h3>
            <p>2차 메가프로젝트 중 공개자료상 아직 개별 승인액으로 잡히지 않은 항목입니다.</p>
          </div>
        </div>
        <div class="grid-3" id="pipelineGrid"></div>
      </section>

      <section class="section-band" id="operators">
        <div class="section-head">
          <div>
            <h3>집행 주체와 운용사</h3>
            <p>정책 총괄, 기금 심의, 모펀드, 공모펀드, 자펀드, 판매사를 분리했습니다. 간접투자는 운용사 선정 이후에도 실제 기업 투자까지는 펀드 결성과 LP 모집 단계가 필요합니다.</p>
          </div>
        </div>
        <div class="grid-3" id="operatorGrid"></div>
      </section>

      <section class="section-band">
        <div class="section-head">
          <div>
            <h3>운용사·판매채널 매트릭스</h3>
            <p>국민참여형과 정책성펀드 운용사 선정 현황을 증권사 투자현황식으로 구분했습니다.</p>
          </div>
        </div>
        <div class="manager-grid" id="managerGrid"></div>
      </section>

      <section class="section-band">
        <div class="section-head">
          <div>
            <h3>국민참여형 판매사</h3>
            <p>공모펀드 운용사별 은행·증권 판매채널입니다.</p>
          </div>
        </div>
        <div class="grid-3" id="salesGrid"></div>
      </section>

      <section class="section-band" id="sources">
        <div class="section-head">
          <div>
            <h3>출처</h3>
            <p>공식 금융위원회 자료를 우선 사용했고, 공식 HTML에 누락된 세부 금액이나 최신 GP 명단은 시장 보도 출처로 보완했습니다.</p>
          </div>
        </div>
        <div class="source-list" id="sourceList"></div>
      </section>

      <p class="footer">생성 스크립트: <code>node scripts/build-national-growth-fund-dashboard.mjs</code>. 데이터: <code>data/national-growth-fund-dashboard.json</code>.</p>
    </main>
  </div>
  <script>
    const DATA = ${json};
    const METHOD_LABELS = {
      direct: "직접투자",
      indirect: "간접투자",
      infra: "인프라투융자",
      loan: "저리대출"
    };
    const CATEGORY_ORDER = ["전체", "계획", "프로젝트", "운용사", "승인", "판매"];
    const METHOD_ORDER = ["전체", "direct", "infra", "loan", "indirect"];
    let timelineFilter = "전체";
    let approvalFilter = "전체";
    let approvalSearch = "";

    const heroStats = document.querySelector("#heroStats");
    const metrics = document.querySelector("#metrics");
    const methodProgress = document.querySelector("#methodProgress");
    const publicFund = document.querySelector("#publicFund");
    const timelineFilters = document.querySelector("#timelineFilters");
    const timelineList = document.querySelector("#timelineList");
    const approvalFilters = document.querySelector("#approvalFilters");
    const approvalRows = document.querySelector("#approvalRows");
    const approvalSearchInput = document.querySelector("#approvalSearch");
    const pipelineGrid = document.querySelector("#pipelineGrid");
    const operatorGrid = document.querySelector("#operatorGrid");
    const managerGrid = document.querySelector("#managerGrid");
    const salesGrid = document.querySelector("#salesGrid");
    const sourceList = document.querySelector("#sourceList");

    function renderHero() {
      const fiveYear = DATA.fundingPlan.fiveYear;
      const publicParticipation = DATA.fundingPlan.publicParticipation;
      heroStats.innerHTML = [
        ["총 규모", money(fiveYear.totalTn), "5년 계획"],
        ["2026 목표", money(DATA.fundingPlan.annual2026.totalTn), "민관합동 자금"],
        ["누적 승인", money(DATA.cumulative.officialApprovedTn), DATA.cumulative.asOf + " 기준"],
        ["국민참여형", money(publicParticipation.targetTotalTn), "국민 0.6조 + 재정 0.12조"]
      ].map(([label, value, note]) => \`
        <div class="hero-stat">
          <strong>\${escapeHtml(value)}</strong>
          <span>\${escapeHtml(label)} · \${escapeHtml(note)}</span>
        </div>
      \`).join("");
    }

    function renderMetrics() {
      const c = DATA.cumulative;
      metrics.innerHTML = [
        ["승인 건수", c.officialApprovedCount + "건", "직접·인프라·저리대출 공식 누적"],
        ["목표 대비", pct(c.officialApprovedTn / DATA.fundingPlan.annual2026.totalTn * 100), "2026년 30조원 대비"],
        ["기금 부담", money(c.officialFundApprovedTn), "첨단전략산업기금 승인액"],
        ["민간·은행 등", money(c.privateAndOtherApprovedTn), "공식 누적 승인액 - 기금 승인액"],
        ["지방 비중", pct(c.localSharePct), "공식 누적 승인 기준"]
      ].map(([label, value, note]) => \`
        <div class="metric">
          <strong>\${escapeHtml(value)}</strong>
          <span>\${escapeHtml(label)} · \${escapeHtml(note)}</span>
        </div>
      \`).join("");
    }

    function renderPlan() {
      methodProgress.innerHTML = DATA.fundingPlan.annual2026.methods.map((method) => {
        const progress = method.approvedTn == null ? 0 : Math.min(100, method.approvedTn / method.targetTn * 100);
        const value = method.approvedTn == null ? method.status : money(method.approvedTn) + " / " + money(method.targetTn);
        return \`
          <div class="progress-row">
            <div class="progress-label">
              <strong>\${escapeHtml(method.name)}</strong>
              <span>\${escapeHtml(method.status)}</span>
            </div>
            <div class="bar" aria-label="\${escapeHtml(method.name)} 진행률">
              <div class="bar-fill \${escapeHtml(method.id)}" style="width:\${progress}%"></div>
            </div>
            <div class="num">\${escapeHtml(value)}</div>
          </div>
          <p class="muted" style="margin:0 0 4px 0;font-size:12px;">\${escapeHtml(method.description)} \${method.fundApprovedTn == null ? "" : "기금 승인 " + money(method.fundApprovedTn) + "."}</p>
        \`;
      }).join("");

      const p = DATA.fundingPlan.publicParticipation;
      publicFund.innerHTML = \`
        <div class="grid-2">
          <div>
            <p><strong>\${money(p.targetTotalTn)}</strong> 조성 목표</p>
            <p class="muted">국민 모집 \${money(p.publicRaiseTn)}, 재정 후순위 \${money(p.fiscalJuniorTn)}. 손실 우선부담 범위 \${pct(p.riskAbsorptionPct)}.</p>
          </div>
          <div>
            <p><strong>\${escapeHtml(p.salePeriod)}</strong></p>
            <p class="muted">\${escapeHtml(p.status)}. \${p.termYears}년 환매금지형.</p>
          </div>
        </div>
        <ul class="compact-list" style="margin-top:10px;">
          <li>\${escapeHtml(p.mainInvestmentRule)}</li>
          \${p.taxBenefits.map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}
        </ul>
      \`;
    }

    function renderTimelineFilters() {
      timelineFilters.innerHTML = CATEGORY_ORDER.map((category) => \`
        <button type="button" class="\${category === timelineFilter ? "active" : ""}" data-timeline="\${escapeHtml(category)}">\${escapeHtml(category)}</button>
      \`).join("");
      timelineFilters.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          timelineFilter = button.dataset.timeline;
          renderTimelineFilters();
          renderTimeline();
        });
      });
    }

    function renderTimeline() {
      const rows = DATA.timeline.filter((item) => timelineFilter === "전체" || item.category === timelineFilter);
      timelineList.innerHTML = rows.map((item) => \`
        <article class="timeline-item">
          <div class="timeline-meta">
            <span>\${escapeHtml(item.date)}</span>
            <span class="badge plan">\${escapeHtml(item.category)}</span>
            \${item.amountTn == null ? "" : \`<span class="num">\${money(item.amountTn)}</span>\`}
          </div>
          <h4>\${escapeHtml(item.title)}</h4>
          <p>\${escapeHtml(item.description)}</p>
        </article>
      \`).join("");
    }

    function renderApprovalFilters() {
      approvalFilters.innerHTML = METHOD_ORDER.map((method) => {
        const label = method === "전체" ? "전체" : METHOD_LABELS[method];
        return \`<button type="button" class="\${method === approvalFilter ? "active" : ""}" data-approval="\${escapeHtml(method)}">\${escapeHtml(label)}</button>\`;
      }).join("");
      approvalFilters.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", () => {
          approvalFilter = button.dataset.approval;
          renderApprovalFilters();
          renderApprovals();
        });
      });
    }

    function renderApprovals() {
      const needle = approvalSearch.trim().toLowerCase();
      const rows = DATA.approvals.filter((item) => {
        const byMethod = approvalFilter === "전체" || item.method === approvalFilter;
        const haystack = [item.project, item.entity, item.sector, item.region, item.owner, item.purpose, item.note].join(" ").toLowerCase();
        return byMethod && (!needle || haystack.includes(needle));
      });
      approvalRows.innerHTML = rows.map((item) => \`
        <tr>
          <td class="num">\${escapeHtml(item.date)}</td>
          <td>
            <span class="entity">\${escapeHtml(item.entity)}</span>
            <span class="note">\${escapeHtml(item.project)}</span>
          </td>
          <td><span class="badge \${escapeHtml(item.method)}">\${escapeHtml(METHOD_LABELS[item.method] ?? item.method)}</span></td>
          <td>
            <span class="num">\${money(item.approvedAmountTn)}</span>
            <span class="note">사업비 \${money(item.projectCostTn)}</span>
          </td>
          <td>
            <span class="num">\${money(item.fundCommitmentTn)}</span>
            <span class="note">기타·민간 \${money(item.privateOrOtherTn)}</span>
          </td>
          <td>
            <span>\${escapeHtml(item.sector)}</span>
            <span class="note">\${escapeHtml(item.region)}</span>
          </td>
          <td>
            <span>\${escapeHtml(item.instrument)}</span>
            <span class="note">\${escapeHtml(item.owner)}</span>
          </td>
          <td>
            <span>\${escapeHtml(item.purpose)}</span>
            <span class="note">\${escapeHtml(item.note)}</span>
          </td>
        </tr>
      \`).join("");
    }

    function renderPipeline() {
      pipelineGrid.innerHTML = DATA.projectPipeline.map((item) => \`
        <article class="mini-card">
          <h4>\${escapeHtml(item.name)}</h4>
          <p><span class="badge \${escapeHtml(item.method)}">\${escapeHtml(METHOD_LABELS[item.method] ?? item.method)}</span></p>
          <p style="margin-top:8px;">예상 규모 \${money(item.plannedScaleTn)} · \${escapeHtml(item.region)}</p>
          <p>\${escapeHtml(item.status)}</p>
        </article>
      \`).join("");
    }

    function renderOperators() {
      operatorGrid.innerHTML = DATA.operators.map((item) => \`
        <article class="mini-card">
          <h4>\${escapeHtml(item.name)}</h4>
          <p>\${escapeHtml(item.role)}</p>
          <p style="margin-top:8px;">\${escapeHtml(item.scope)}</p>
        </article>
      \`).join("");
    }

    function renderManagers() {
      managerGrid.innerHTML = DATA.managerGroups.map((group) => \`
        <article class="mini-card">
          <h4>\${escapeHtml(group.name)}</h4>
          <p>\${escapeHtml(group.status)}\${group.amountTn == null ? "" : " · " + money(group.amountTn)}</p>
          <div class="manager-list">
            \${group.items.map((item) => \`
              <div class="manager-row">
                <strong>\${escapeHtml(item.manager)}</strong>
                <span>\${escapeHtml(item.mandate)}\${item.amountTn == null ? "" : " · " + money(item.amountTn)}</span>
              </div>
            \`).join("")}
          </div>
        </article>
      \`).join("");
    }

    function renderSales() {
      salesGrid.innerHTML = DATA.salesChannels.map((group) => \`
        <article class="mini-card">
          <h4>\${escapeHtml(group.publicFundManager)}</h4>
          <p><strong>은행</strong> \${escapeHtml(group.banks.join(", "))}</p>
          <p style="margin-top:8px;"><strong>증권</strong> \${escapeHtml(group.securities.join(", "))}</p>
        </article>
      \`).join("");
    }

    function renderSources() {
      sourceList.innerHTML = DATA.sources.map((source) => \`
        <a class="source-link" href="\${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
          <strong>\${escapeHtml(source.title)}</strong>
          <span>\${escapeHtml(source.type)} · \${escapeHtml(source.date)}</span>
          <span>\${escapeHtml(source.usedFor)}</span>
        </a>
      \`).join("");
    }

    approvalSearchInput.addEventListener("input", (event) => {
      approvalSearch = event.target.value;
      renderApprovals();
    });

    function money(value) {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return "비공개";
      const number = Number(value);
      if (Math.abs(number) >= 1) return number.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + "조원";
      const eok = number * 10000;
      return eok.toLocaleString("ko-KR", { maximumFractionDigits: eok < 100 ? 1 : 0 }) + "억원";
    }

    function pct(value) {
      if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
      return Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + "%";
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    renderHero();
    renderMetrics();
    renderPlan();
    renderTimelineFilters();
    renderTimeline();
    renderApprovalFilters();
    renderApprovals();
    renderPipeline();
    renderOperators();
    renderManagers();
    renderSales();
    renderSources();
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

function formatMoneyServer(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "비공개";
  const number = Number(value);
  if (Math.abs(number) >= 1) return `${number.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}조원`;
  const eok = number * 10000;
  return `${eok.toLocaleString("ko-KR", { maximumFractionDigits: eok < 100 ? 1 : 0 })}억원`;
}
