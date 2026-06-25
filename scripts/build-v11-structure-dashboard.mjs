import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  average,
  decideV11,
  formatSeoulDate,
  formatSeoulDateTime,
  median,
  round,
  scoreMarketDependency,
  sizeFactor
} from "./v11-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const v10Path = path.join(root, "data", "v10-execution-dashboard-data.json");
const betaPath = path.join(root, "data", "v11-beta-regime.json");
const dataPath = path.join(root, "data", "v11-execution-dashboard-data.json");
const outputPath = path.join(root, "docs", "v11.html");
const runNow = new Date();

function main() {
  const v10 = JSON.parse(fs.readFileSync(v10Path, "utf8"));
  const beta = JSON.parse(fs.readFileSync(betaPath, "utf8"));
  const regime = beta.regime ?? { state: "NEUTRAL" };
  const rows = (v10.allRows ?? []).map((row) => enrichRow(row, beta.profiles?.[row.ticker], regime));
  const ranked = rows.sort(compareRows);
  const entryList = ranked.filter((row) => row.v11Decision === "ENTRY");
  const accumulateList = ranked.filter((row) => row.v11Decision === "ACCUMULATE_ON_WEAKNESS");
  const watchList = ranked.filter((row) => row.v10EntryOK && row.v11Decision === "WATCH");

  const output = {
    meta: {
      title: "국민성장펀드 v11 시장 의존도·레짐 적합성 대시보드",
      version: "v11",
      runDate: formatSeoulDate(runNow),
      updatedAt: formatSeoulDateTime(runNow),
      sourceV10UpdatedAt: v10.meta?.updatedAt ?? null,
      purpose:
        "v11은 반도체와 독립적인 종목만 고르기 위한 레이어가 아니다. 좋은 종목 후보 중 시장/반도체 의존도가 불리하게 작동하는 후보를 줄이고, 레짐에 따라 진입 강도와 비중을 조절하는 실행 리스크 레이어다.",
      methodology:
        "v7 totalScore, v8/v10 holderCostScore, v10cScore, v10 decision은 읽기 전용으로 보존한다. v11은 marketDependencyScore, v11Score, v11Decision만 새로 더한다.",
      warning:
        "투자 권유가 아니라 후보 탐색과 실행 조건 점검 프레임워크입니다. 베타, 잔차, 캡처비는 과거 추정치이므로 Tier와 함께 해석해야 합니다."
    },
    market: v10.market,
    regime,
    summary: summarize(rows, entryList, accumulateList, watchList),
    rules: buildRules(),
    entryList,
    accumulateList,
    watchList,
    allRows: ranked,
    sources: [
      ...(v10.sources ?? []),
      ...(beta.sources ?? []),
      { title: "v11 beta/regime metrics", url: "data/v11-beta-regime.json" }
    ]
  };

  fs.writeFileSync(dataPath, JSON.stringify(output, null, 2) + "\n", "utf8");
  fs.writeFileSync(outputPath, buildHtml(output), "utf8");
  console.log(`Generated ${path.relative(root, dataPath)}`);
  console.log(`Generated ${path.relative(root, outputPath)}`);
}

function enrichRow(row, profile, regime) {
  const score = scoreMarketDependency(profile);
  const decision = decideV11({ row, profile, score, regime });
  const baseScore = Number.isFinite(row.v10cScore) ? row.v10cScore : row.totalScore;
  const v11Score = score.marketDependencyScore == null || !Number.isFinite(baseScore)
    ? null
    : baseScore + score.marketDependencyScore;
  return {
    ...row,
    v10EntryOK: row.decision === "ENTRY_OK",
    betaProfile: profile ?? null,
    dependencyProfile: {
      ...score,
      sizeFactor: sizeFactor({ score: score.marketDependencyScore, regime }),
      thresholdRegime: regime?.state ?? "NEUTRAL"
    },
    marketDependencyScore: score.marketDependencyScore,
    v11Score,
    v11Decision: decision.v11Decision,
    v11Reason: decision.reason
  };
}

function compareRows(a, b) {
  const scoreA = Number.isFinite(a.v11Score) ? a.v11Score : -Infinity;
  const scoreB = Number.isFinite(b.v11Score) ? b.v11Score : -Infinity;
  return scoreB - scoreA ||
    Number(b.v10EntryOK) - Number(a.v10EntryOK) ||
    (b.v10cScore ?? b.totalScore ?? 0) - (a.v10cScore ?? a.totalScore ?? 0);
}

function summarize(rows, entryList, accumulateList, watchList) {
  const scored = rows.filter((row) => row.marketDependencyScore != null);
  const v10Entries = rows.filter((row) => row.v10EntryOK);
  const entryProfiles = entryList.map((row) => row.betaProfile).filter(Boolean);
  const v10EntryProfiles = v10Entries.map((row) => row.betaProfile).filter(Boolean);
  return {
    universeCount: rows.length,
    scoredCount: scored.length,
    noDataCount: rows.filter((row) => row.v11Decision === "NO_DATA").length,
    v10EntryOk: v10Entries.length,
    v11Entry: entryList.length,
    v11Accumulate: accumulateList.length,
    v11WatchFromV10: watchList.length,
    adverseDependency: rows.filter((row) => row.betaProfile?.adverseDependency).length,
    favorableBeta: rows.filter((row) => row.betaProfile?.favorableBeta).length,
    semiProxy: rows.filter((row) => row.betaProfile?.semiProxyFlag).length,
    medianSemiCorrAll: round(median(scored.map((row) => row.betaProfile?.semiCorr)), 3),
    medianSemiCorrV10Entry: round(median(v10EntryProfiles.map((p) => p.semiCorr)), 3),
    medianSemiCorrV11Entry: round(median(entryProfiles.map((p) => p.semiCorr)), 3),
    avgBetaSemiExcessV10Entry: round(average(v10EntryProfiles.map((p) => p.betaSemiExcess)), 3),
    avgBetaSemiExcessV11Entry: round(average(entryProfiles.map((p) => p.betaSemiExcess)), 3),
    avgCaptureRatioV10Entry: round(average(v10EntryProfiles.map((p) => p.captureRatio)), 3),
    avgCaptureRatioV11Entry: round(average(entryProfiles.map((p) => p.captureRatio)), 3),
    byDecision: countBy(rows, "v11Decision"),
    byDependencyLabel: countBy(rows, (row) => row.dependencyProfile?.dependencyLabel ?? "NO_DATA")
  };
}

function countBy(rows, keyOrFn) {
  const get = typeof keyOrFn === "function" ? keyOrFn : (row) => row[keyOrFn];
  return rows.reduce((acc, row) => {
    const key = get(row) ?? "UNKNOWN";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function buildRules() {
  return [
    "반도체 상관이 높다는 이유만으로 탈락시키지 않는다. 상승 캡처가 좋고 하락 캡처가 낮으면 전술 후보로 살린다.",
    "강한 감점은 semiProxyFlag와 나쁜 비대칭이 함께 나타날 때만 적용한다.",
    "잔차 강도는 베타 추정 구간과 평가 구간을 분리한 residual momentum/IR 기반 백분위로 본다.",
    "NO_DATA는 0점이 아니라 v11Decision=NO_DATA로 분리한다.",
    "v11Decision은 v10 ENTRY_OK를 절대 완화하지 않는다. v10 비진입 종목은 NOT_V10_ENTRY로 둔다.",
    "NARROW_SEMI_LED와 RISK_OFF에서는 불리한 의존성, capture failure, 높은 하락 캡처를 하드 게이트로 본다."
  ];
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
    :root{color-scheme:light;--bg:#f5f7f8;--ink:#17202a;--muted:#647281;--line:#d8e0e6;--surface:#fff;--nav:#17212b;--teal:#0f766e;--blue:#2f5ea8;--green:#126c43;--gold:#9a6515;--red:#973f35;--orange:#b45309;--soft:#edf3f4}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI","Malgun Gothic",Arial,sans-serif;line-height:1.5}a{color:inherit}button,input{font:inherit}
    .layout{min-height:100vh;display:grid;grid-template-columns:300px minmax(0,1fr)}aside{position:sticky;top:0;height:100vh;overflow:auto;padding:24px 20px;background:var(--nav);color:#f8fafc}main{min-width:0;padding:clamp(16px,2.4vw,30px)}
    h1,h2,h3,p{margin-top:0;overflow-wrap:break-word}h1{font-size:22px;line-height:1.25;letter-spacing:0}h2{font-size:29px;line-height:1.2;letter-spacing:0;margin-bottom:8px}h3{font-size:18px;letter-spacing:0;margin-bottom:10px}.muted{color:var(--muted)}
    .brand p{color:#d7e0e8;font-size:13px}.side-box{display:grid;gap:7px;margin:16px 0;padding:13px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(255,255,255,.06);font-size:12px;color:#d7e0e8}.nav-list{display:grid;gap:7px}.nav-link{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;min-height:39px;padding:8px 10px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:rgba(255,255,255,.05);text-decoration:none;color:#f8fafc;font-size:13px;font-weight:800}.nav-link:hover{background:#fff;color:var(--ink)}
    .tag,.badge,.pill{display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}.tag{background:rgba(255,255,255,.12)}.badge.entry{background:#e5f3f0;color:var(--teal)}.badge.acc{background:#fff3df;color:var(--orange)}.badge.watch{background:#f8e8e6;color:var(--red)}.badge.no{background:#eceff3;color:#596579}.badge.neutral{background:#e9eef8;color:var(--blue)}
    .hero,.band,.metric,.regime{border:1px solid var(--line);border-radius:8px;background:var(--surface)}.hero{padding:clamp(18px,2.4vw,28px);margin-bottom:16px;display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr);gap:18px;align-items:end}.kicker{margin-bottom:8px;color:var(--teal);font-size:13px;font-weight:900}.hero p{color:var(--muted)}
    .regime{margin-bottom:16px;padding:16px 18px;border-left:5px solid var(--teal)}.regime.narrow{border-left-color:var(--orange)}.regime.risk{border-left-color:var(--red)}.regime.broad{border-left-color:var(--green)}.regime strong{display:block;font-size:20px}.regime-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:10px}.regime-grid span{display:block;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;font-size:12px}.regime-grid b{display:block;font-size:18px}
    .metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}.metric{min-height:104px;padding:15px}.metric strong{display:block;font-size:27px;line-height:1.1}.metric span{display:block;margin-top:6px;color:var(--muted);font-size:12px}.band{padding:18px;margin-bottom:16px}.head{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.head p{max-width:920px;margin-bottom:0;color:var(--muted);font-size:13px}.grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.rule{padding:13px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;color:#334155;font-size:13px}
    .toolbar{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin-bottom:12px}.segmented{display:flex;flex-wrap:wrap;gap:6px}.segmented button{min-height:34px;padding:5px 10px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;cursor:pointer;font-size:13px;font-weight:800}.segmented button.active{border-color:var(--teal);background:#e5f3f0;color:var(--teal)}.search{width:min(360px,100%);min-height:36px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:#fff}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fff}table{width:100%;min-width:1580px;border-collapse:collapse}th,td{padding:10px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;font-size:13px}th{position:sticky;top:0;z-index:1;background:#edf3f4;color:#334155}tr:last-child td{border-bottom:0}.num{font-variant-numeric:tabular-nums;white-space:nowrap}.company{font-weight:900}.note{display:block;margin-top:5px;color:var(--muted);font-size:12px;line-height:1.42}.teal{color:var(--teal);font-weight:900}
    .sources{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sources a{min-height:58px;padding:11px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd;text-decoration:none;font-size:13px}.sources span{display:block;margin-top:4px;color:var(--muted);font-size:12px}
    footer{color:var(--muted);font-size:12px}@media(max-width:1120px){.layout{grid-template-columns:1fr}aside{position:static;height:auto}.nav-list{grid-template-columns:repeat(3,minmax(150px,1fr))}.hero,.metrics,.regime-grid,.grid-3{grid-template-columns:1fr 1fr}}@media(max-width:720px){main{padding:14px}.nav-list{display:flex;overflow:auto;padding-bottom:4px}.nav-link{min-width:150px}.hero,.metrics,.regime-grid,.grid-3,.sources{grid-template-columns:1fr}h2{font-size:23px}table{min-width:1160px}}
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><h1>${escapeHtml(data.meta.title)}</h1><p>Market Dependency & Regime Suitability Layer</p></div>
      <div class="side-box">
        <span>기준일: ${escapeHtml(data.meta.runDate)}</span>
        <span>업데이트: ${escapeHtml(data.meta.updatedAt)}</span>
        <span>레짐: ${escapeHtml(data.regime.state)}</span>
        <span>v10 ENTRY: ${data.summary.v10EntryOk} / v11 ENTRY: ${data.summary.v11Entry}</span>
      </div>
      <nav class="nav-list">
        <a class="nav-link" href="#overview"><span>요약</span><span class="tag">v11</span></a>
        <a class="nav-link" href="#rules"><span>판단 기준</span><span class="tag">Rules</span></a>
        <a class="nav-link" href="#entry"><span>v11 진입</span><span class="tag">Entry</span></a>
        <a class="nav-link" href="#accumulate"><span>약세 분할</span><span class="tag">Accum</span></a>
        <a class="nav-link" href="#all"><span>전체 표</span><span class="tag">All</span></a>
        <a class="nav-link" href="#sources"><span>출처</span><span class="tag">Src</span></a>
      </nav>
    </aside>
    <main>
      <section class="hero" id="overview">
        <div><p class="kicker">v11 Market Dependency Layer</p><h2>좋은 후보를 버리는 필터가 아니라, 불리한 시장 의존성을 줄이는 실행 레이어입니다.</h2><p>${escapeHtml(data.meta.purpose)}</p></div>
        <div><p>${escapeHtml(data.meta.warning)}</p></div>
      </section>
      <section class="regime ${regimeClass(data.regime.state)}"><strong>${escapeHtml(data.regime.state)}</strong><span>${escapeHtml(data.regime.guidance)}</span><div class="regime-grid" id="regimeGrid"></div></section>
      <section class="metrics" id="metrics"></section>
      <section class="band" id="rules"><div class="head"><div><h3>v11 판단 기준</h3><p>${escapeHtml(data.meta.methodology)}</p></div></div><div class="grid-3" id="rulesGrid"></div></section>
      <section class="band" id="entry"><div class="head"><div><h3>v11 ENTRY</h3><p>v10 ENTRY_OK 중 시장 의존도 점수와 레짐 게이트를 통과한 후보입니다.</p></div></div><div class="table-wrap"><table>${tableHead()}<tbody id="entryRows"></tbody></table></div></section>
      <section class="band" id="accumulate"><div class="head"><div><h3>ACCUMULATE_ON_WEAKNESS</h3><p>좋은 후보지만 현재 레짐과 의존도 구조상 추격보다 약세 분할이 맞는 후보입니다.</p></div></div><div class="table-wrap"><table>${tableHead()}<tbody id="accRows"></tbody></table></div></section>
      <section class="band" id="all"><div class="toolbar"><div><h3 style="margin-bottom:4px;">전체 v11 테이블</h3><p class="muted" style="margin-bottom:0;font-size:13px;">v11Score = v10cScore + marketDependencyScore. NO_DATA는 0점 처리하지 않습니다.</p></div><input class="search" id="search" type="search" placeholder="회사, 코드, 섹터 검색"></div><div class="segmented" id="filters"></div><div class="table-wrap"><table>${tableHead()}<tbody id="allRows"></tbody></table></div></section>
      <section class="band" id="sources"><div class="head"><div><h3>출처</h3><p>Naver 일별 시세, KOSPI/KOSDAQ 지수, KODEX 반도체 ETF 프록시를 사용했습니다.</p></div></div><div class="sources" id="sourceList"></div></section>
      <footer>생성 스크립트: <code>node scripts/build-v11-structure-dashboard.mjs</code>. 데이터: <code>data/v11-execution-dashboard-data.json</code>.</footer>
    </main>
  </div>
  <script>
    const DATA=${json}; let filter="all"; let search="";
    const fmt=(v,d=2)=>v==null?"-":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:d});
    const pct=(v)=>v==null?"-":fmt(v,2)+"%";
    const score=(v)=>v==null?"NO_DATA":(v>0?"+":"")+fmt(v,0);
    const metrics=[
      ["v10 ENTRY_OK",DATA.summary.v10EntryOk,"기존 진입 후보"],
      ["v11 ENTRY",DATA.summary.v11Entry,"실행 가능 후보"],
      ["약세 분할",DATA.summary.v11Accumulate,"추격 금지 후보"],
      ["불리한 의존성",DATA.summary.adverseDependency,"전 유니버스"],
      ["유리한 베타",DATA.summary.favorableBeta,"반도체 연동 허용"]
    ];
    document.querySelector("#metrics").innerHTML=metrics.map(([a,b,c])=>\`<div class="metric"><strong>\${fmt(b,0)}</strong><span>\${escapeHtml(a)} · \${escapeHtml(c)}</span></div>\`).join("");
    const regimeItems=[["KOSPI 20D",pct(DATA.regime.kospiRet20)],["KOSDAQ RS",pct(DATA.regime.kosdaqRS)],["SEMI RS",pct(DATA.regime.semiRS)],["Breadth",fmt(DATA.regime.breadth,3)],["v11/v10 Entry",DATA.summary.v11Entry+"/"+DATA.summary.v10EntryOk]];
    document.querySelector("#regimeGrid").innerHTML=regimeItems.map(([a,b])=>\`<span><b>\${escapeHtml(b)}</b>\${escapeHtml(a)}</span>\`).join("");
    document.querySelector("#rulesGrid").innerHTML=DATA.rules.map((rule,i)=>\`<div class="rule"><strong>\${i+1}. </strong>\${escapeHtml(rule)}</div>\`).join("");
    document.querySelector("#entryRows").innerHTML=DATA.entryList.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("v11 ENTRY 후보가 없습니다.");
    document.querySelector("#accRows").innerHTML=DATA.accumulateList.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("약세 분할 후보가 없습니다.");
    function renderFilters(){const vals=["all","ENTRY","ACCUMULATE_ON_WEAKNESS","WATCH","NO_DATA","NOT_V10_ENTRY"];document.querySelector("#filters").innerHTML=vals.map(v=>\`<button class="\${filter===v?"active":""}" data-filter="\${v}">\${v==="all"?"전체":label(v)}</button>\`).join("");document.querySelectorAll("#filters button").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;renderFilters();renderAll()}));}
    function renderAll(){const needle=search.trim().toLowerCase();const rows=DATA.allRows.filter(r=>(filter==="all"||r.v11Decision===filter)&&(!needle||[r.company,r.ticker,r.sector,r.rationale,r.dependencyProfile?.dependencyLabel].join(" ").toLowerCase().includes(needle))).slice(0,124);document.querySelector("#allRows").innerHTML=rows.map((r,i)=>rowHtml(r,i)).join("") || emptyRow("검색 결과가 없습니다.");}
    function rowHtml(r,i){const p=r.betaProfile||{};const d=r.dependencyProfile||{};return \`<tr><td class="num">\${i+1}</td><td><span class="company">\${escapeHtml(r.company)}</span><span class="note">\${r.ticker} · \${escapeHtml(r.sector)}</span></td><td><span class="badge \${decisionClass(r.v11Decision)}">\${label(r.v11Decision)}</span><span class="note">\${escapeHtml(r.v11Reason)}</span></td><td><strong>\${r.v11Score??"-"}</strong><span class="note">v10c \${r.v10cScore??"-"} · dep <span class="teal">\${score(r.marketDependencyScore)}</span></span></td><td><strong class="teal">\${score(r.marketDependencyScore)}</strong><span class="note">\${escapeHtml(d.dependencyLabel??"NO_DATA")} · size \${d.sizeFactor??"-"}</span><span class="note">RS \${d.components?.residualScore??"-"} / CAP \${d.components?.captureScore??"-"} / DEP \${d.components?.dependencyAdjustment??"-"}</span></td><td>βM \${fmt(p.betaMarket,2)}<span class="note">βSemiExcess \${fmt(p.betaSemiExcess,2)} · raw \${fmt(p.betaSemiRaw,2)}</span></td><td>\${fmt(p.captureRatio,2)}<span class="note">up \${fmt(p.upCapture,2)} · loss \${fmt(p.lossCapture,2)} · balance \${fmt(p.captureBalance,2)}</span></td><td>\${fmt(p.semiCorr,2)}<span class="note">\${p.semiProxyFlag?"semi proxy":"non-proxy"} · \${p.adverseDependency?"adverse":p.favorableBeta?"favorable beta":"neutral"}</span></td><td>\${fmt((p.residualStrengthPct??null)*100,1)}<span class="note">IR \${fmt(p.residualIR,2)} · \${escapeHtml(p.modelMode??"-")}</span></td><td>Tier \${escapeHtml(p.tier??"NO_DATA")}<span class="note">\${p.alignedReturnDays??0} days · \${escapeHtml((p.notes||[]).join(" · "))}</span></td><td><span class="badge \${v10Class(r.decision)}">\${escapeHtml(r.decision)}</span><span class="note">total \${r.totalScore??"-"} · holder \${r.holderCostScore??"-"}</span></td></tr>\`;}
    function emptyRow(text){return \`<tr><td colspan="11" class="muted">\${escapeHtml(text)}</td></tr>\`;}
    function decisionClass(d){return d==="ENTRY"?"entry":d==="ACCUMULATE_ON_WEAKNESS"?"acc":d==="WATCH"?"watch":d==="NO_DATA"?"no":"neutral";}
    function v10Class(d){return d==="ENTRY_OK"?"entry":d==="WAIT_TRIGGER"?"acc":"neutral";}
    function label(d){return {ENTRY:"ENTRY",ACCUMULATE_ON_WEAKNESS:"약세 분할",WATCH:"WATCH",NO_DATA:"NO_DATA",NOT_V10_ENTRY:"v10 비진입"}[d]??d;}
    function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
    document.querySelector("#search").addEventListener("input",e=>{search=e.target.value;renderAll()});
    document.querySelector("#sourceList").innerHTML=DATA.sources.map(s=>\`<a href="\${escapeHtml(s.url)}" target="_blank" rel="noreferrer"><strong>\${escapeHtml(s.title)}</strong><span>\${escapeHtml(s.url)}</span></a>\`).join("");
    renderFilters();renderAll();
  </script>
</body>
</html>`;
}

function tableHead() {
  return `<thead><tr><th>#</th><th>회사</th><th>v11 결정</th><th>v11Score</th><th>의존도 점수</th><th>베타</th><th>캡처</th><th>반도체 동조</th><th>잔차 강도</th><th>Tier</th><th>v10</th></tr></thead>`;
}

function regimeClass(state) {
  if (state === "NARROW_SEMI_LED") return "narrow";
  if (state === "RISK_OFF") return "risk";
  if (state === "BROAD_RISK_ON") return "broad";
  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

main();
