import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const START_DATE = "2026-06-10 00:00:00 +0900";
const RUN_DATE = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul", hour12: false }).replace(" ", "T");
const dataPath = path.join(root, "data", "entry-change-monitor-v1-data.json");
const outputPath = path.join(root, "docs", "entry-change-monitor-v1.html");

const trackedFiles = [
  { version: "v6", file: "data/v6-broad-screener-data.json" },
  { version: "v7", file: "data/v7-execution-dashboard-data.json" },
  { version: "v10", file: "data/v10-execution-dashboard-data.json" }
];

function git(args, options = {}) {
  return execFileSync("git", ["-c", `safe.directory=${root.replaceAll("\\", "/")}`, ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
    ...options
  });
}

function main() {
  const commits = git([
    "log",
    `--since=${START_DATE}`,
    "--date=iso-strict",
    "--pretty=format:%H%x09%ad%x09%s",
    "--",
    ...trackedFiles.map((item) => item.file)
  ]).trim().split(/\r?\n/).filter(Boolean).map(parseCommitLine).reverse();

  const snapshots = [];
  for (const commit of commits) {
    const changed = new Set(git(["diff-tree", "--no-commit-id", "--name-only", "-r", commit.hash]).trim().split(/\r?\n/).filter(Boolean));
    for (const target of trackedFiles) {
      if (!changed.has(target.file)) continue;
      const raw = safeGitShow(commit.hash, target.file);
      if (!raw) continue;
      const payload = JSON.parse(raw);
      snapshots.push(toSnapshot(commit, target, payload));
    }
  }

  const entryTickers = new Set();
  for (const snapshot of snapshots) {
    for (const row of snapshot.rows) {
      if (row.decision === "ENTRY_OK") entryTickers.add(row.ticker);
    }
  }

  const records = [...entryTickers].map((ticker) => buildRecord(ticker, snapshots));
  records.sort((a, b) => statusRank(a.status) - statusRank(b.status) || (b.current?.v10cScore ?? b.current?.totalScore ?? 0) - (a.current?.v10cScore ?? a.current?.totalScore ?? 0));

  const payload = {
    meta: {
      title: "Entry Change Monitor v1",
      runDate: RUN_DATE,
      startDate: "2026-06-10",
      startLabel: "저번주 수요일 이후",
      source: "git history of v6, v7, v10 dashboard data",
      snapshotCount: snapshots.length,
      trackedVersions: trackedFiles.map((item) => item.version),
      entryTickerCount: records.length,
      latestV10Snapshot: latestSnapshot(snapshots, "v10")?.label ?? null
    },
    summary: summarize(records, snapshots),
    snapshots: snapshots.map(({ rows, rowMap, ...snapshot }) => ({
      ...snapshot,
      entryCount: rows.filter((row) => row.decision === "ENTRY_OK").length
    })),
    records
  };

  fs.writeFileSync(dataPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.writeFileSync(outputPath, renderHtml(payload), "utf8");
  console.log(`Generated ${path.relative(root, dataPath)}`);
  console.log(`Generated ${path.relative(root, outputPath)}`);
}

function parseCommitLine(line) {
  const [hash, date, ...subjectParts] = line.split("\t");
  return { hash, shortHash: hash.slice(0, 7), date, subject: subjectParts.join("\t") };
}

function safeGitShow(hash, file) {
  try {
    return git(["show", `${hash}:${file}`]);
  } catch {
    return null;
  }
}

function toSnapshot(commit, target, payload) {
  const rows = (payload.allRows ?? []).map(normalizeRow);
  const latestDates = [...new Set(rows.map((row) => row.latestDate).filter(Boolean))].sort();
  const labelDate = latestDates.at(-1) ?? payload.meta?.runDate ?? commit.date.slice(0, 10);
  return {
    id: `${target.version}-${commit.shortHash}`,
    version: target.version,
    file: target.file,
    commit: commit.hash,
    shortHash: commit.shortHash,
    commitDate: commit.date,
    subject: commit.subject,
    runDate: payload.meta?.runDate ?? null,
    latestDate: labelDate,
    label: `${target.version.toUpperCase()} · ${labelDate} · ${commit.shortHash}`,
    rows,
    rowMap: new Map(rows.map((row) => [row.ticker, row]))
  };
}

function normalizeRow(row) {
  return {
    ticker: row.ticker,
    company: row.company,
    sector: row.sector,
    rationale: row.rationale,
    latestDate: row.latestDate,
    close: row.close,
    decision: row.decision,
    baseDecision: row.baseDecision ?? row.decision,
    totalScore: row.totalScore,
    v10cScore: row.v10cScore ?? null,
    holderCostScore: row.holderCostScore ?? null,
    technicalMemo: row.technical?.memo ?? null,
    entryAction: row.entryPlan?.action ?? null,
    entryTrigger: row.entryPlan?.trigger ?? null,
    invalidation: row.entryPlan?.invalidation ?? null,
    target: row.entryPlan?.target ?? null,
    riskNotes: row.risk?.notes ?? [],
    valuationBlock: Boolean(row.risk?.valuationBlock),
    structural: row.structuralRegime ? {
      score: row.structuralRegime.score,
      gate: row.structuralRegime.gate,
      grade: row.structuralRegime.grade,
      label: row.structuralRegime.primary?.label ?? null,
      memo: row.structuralRegime.memo ?? null
    } : null,
    holderCost: row.holderCost ? {
      signal: row.holderCost.signal,
      tier: row.holderCost.tier,
      score: row.holderCost.score,
      estimatedCost: row.holderCost.estimatedCost,
      gapPct: row.holderCost.gapPct,
      memo: row.holderCost.memo,
      holderName: row.holderCost.holderName
    } : null,
    levels: row.executionPlan?.levels ?? [],
    returns: row.returns ?? {},
    technicals: row.technicals ?? {},
    sourceUrl: row.sourceUrl
  };
}

function buildRecord(ticker, snapshots) {
  const observations = [];
  for (const snapshot of snapshots) {
    const row = snapshot.rowMap.get(ticker);
    if (!row) continue;
    observations.push({
      snapshotId: snapshot.id,
      version: snapshot.version,
      label: snapshot.label,
      commit: snapshot.shortHash,
      commitDate: snapshot.commitDate,
      latestDate: row.latestDate ?? snapshot.latestDate,
      decision: row.decision,
      baseDecision: row.baseDecision,
      totalScore: row.totalScore,
      v10cScore: row.v10cScore,
      close: row.close,
      entryRank: snapshot.rows.filter((item) => item.decision === "ENTRY_OK").findIndex((item) => item.ticker === ticker) + 1,
      row
    });
  }
  const latestByVersion = {};
  for (const version of ["v6", "v7", "v10"]) {
    latestByVersion[version] = observations.filter((item) => item.version === version).at(-1) ?? null;
  }
  const current = latestByVersion.v10 ?? latestByVersion.v7 ?? latestByVersion.v6;
  const previousSameVersion = observations.filter((item) => item.version === current?.version).slice(-2)[0] ?? null;
  const entryObservations = observations.filter((item) => item.decision === "ENTRY_OK");
  const firstEntry = entryObservations[0] ?? null;
  const lastEntry = entryObservations.at(-1) ?? null;
  const status = classifyStatus(current, previousSameVersion, entryObservations);
  const row = current?.row ?? observations[0]?.row;
  const transitionHistory = buildTransitionHistory(observations);
  return {
    ticker,
    company: row?.company ?? ticker,
    sector: row?.sector ?? "-",
    status,
    statusLabel: statusLabel(status),
    action: actionForStatus(status),
    reason: reasonForStatus(status, current?.row, previousSameVersion?.row),
    current: publicObservation(current),
    previousSameVersion: publicObservation(previousSameVersion),
    firstEntry: publicObservation(firstEntry),
    lastEntry: publicObservation(lastEntry),
    latestByVersion: Object.fromEntries(Object.entries(latestByVersion).map(([version, item]) => [version, publicObservation(item)])),
    transitionHistory,
    entryCount: entryObservations.length,
    entryVersions: [...new Set(entryObservations.map((item) => item.version))],
    searchText: [
      ticker,
      row?.company,
      row?.sector,
      status,
      statusLabel(status),
      row?.technicalMemo,
      row?.entryTrigger,
      row?.invalidation,
      row?.structural?.gate,
      row?.holderCost?.signal,
      row?.riskNotes?.join(" ")
    ].filter(Boolean).join(" ").toLowerCase()
  };
}

function publicObservation(item) {
  if (!item) return null;
  const row = item.row;
  return {
    version: item.version,
    label: item.label,
    commit: item.commit,
    commitDate: item.commitDate,
    latestDate: item.latestDate,
    decision: item.decision,
    baseDecision: item.baseDecision,
    totalScore: item.totalScore,
    v10cScore: item.v10cScore,
    close: item.close,
    entryRank: item.entryRank || null,
    technicalMemo: row.technicalMemo,
    entryAction: row.entryAction,
    entryTrigger: row.entryTrigger,
    invalidation: row.invalidation,
    target: row.target,
    riskNotes: row.riskNotes,
    valuationBlock: row.valuationBlock,
    structural: row.structural,
    holderCost: row.holderCost,
    levels: row.levels
  };
}

function buildTransitionHistory(observations) {
  const byVersion = {};
  for (const item of observations) {
    byVersion[item.version] ??= [];
    byVersion[item.version].push(item);
  }
  const result = [];
  for (const [version, items] of Object.entries(byVersion)) {
    for (let index = 0; index < items.length; index += 1) {
      const prev = items[index - 1];
      const curr = items[index];
      result.push({
        version,
        label: curr.label,
        latestDate: curr.latestDate,
        commit: curr.commit,
        from: prev?.decision ?? "NONE",
        to: curr.decision,
        change: transitionLabel(prev?.decision, curr.decision),
        close: curr.close,
        totalScore: curr.totalScore,
        v10cScore: curr.v10cScore,
        entryRank: curr.entryRank || null
      });
    }
  }
  return result.sort((a, b) => a.latestDate.localeCompare(b.latestDate) || a.version.localeCompare(b.version));
}

function transitionLabel(from, to) {
  if (to === "ENTRY_OK" && from === "ENTRY_OK") return "STAY";
  if (to === "ENTRY_OK" && from && from !== "ENTRY_OK") return "REENTRY";
  if (to === "ENTRY_OK") return "NEW";
  if (from === "ENTRY_OK" && to === "WAIT_TRIGGER") return "LOST_SOFT";
  if (from === "ENTRY_OK" && to === "AVOID_NOW") return "LOST_HARD";
  return "WATCH";
}

function classifyStatus(current, previousSameVersion, entryObservations) {
  if (!current) return "NO_CURRENT";
  const row = current.row;
  const wasEntryBefore = entryObservations.some((item) => item.commitDate < current.commitDate || item.snapshotId !== current.snapshotId);
  const previousDecision = previousSameVersion?.decision ?? null;
  if (current.decision === "ENTRY_OK") {
    if (previousDecision === "ENTRY_OK") return "ACTIVE_ENTRY";
    if (wasEntryBefore) return "REENTRY";
    return "NEW_ENTRY";
  }
  if (!wasEntryBefore) return current.decision === "WAIT_TRIGGER" ? "WATCH_ONLY" : "EXCLUDE";
  if (isHardLost(row)) return "LOST_HARD";
  if (current.decision === "WAIT_TRIGGER") return "ENTRY_LOST_SOFT";
  return "REDUCE_ONLY";
}

function isHardLost(row) {
  if (!row) return true;
  if (row.decision === "AVOID_NOW") return true;
  if (row.valuationBlock) return true;
  if (row.structural?.gate === "BLOCK") return true;
  if (row.holderCost?.signal === "OVERHANG") return true;
  if ((row.riskNotes ?? []).some((note) => /손절|저점|밸류|고PBR|PER 60|추세 훼손/.test(note))) return true;
  return false;
}

function reasonForStatus(status, row, previousRow) {
  if (!row) return "현재 스냅샷 없음";
  const reasons = [];
  if (previousRow?.decision && previousRow.decision !== row.decision) reasons.push(`${previousRow.decision} -> ${row.decision}`);
  if (row.structural) reasons.push(`체질 ${row.structural.gate} ${row.structural.score}점`);
  if (row.holderCost) reasons.push(`평단 ${row.holderCost.signal} ${row.holderCost.score ?? 0}점`);
  if (row.technicalMemo) reasons.push(row.technicalMemo);
  if (row.riskNotes?.length) reasons.push(`리스크: ${row.riskNotes.join(" · ")}`);
  if (status === "ENTRY_LOST_SOFT") reasons.unshift("완전 배제가 아니라 재진입 대기");
  if (status === "LOST_HARD") reasons.unshift("신규 진입 금지/축소 우선");
  return reasons.join(" | ");
}

function actionForStatus(status) {
  return {
    NEW_ENTRY: "첫 진입은 예정 비중 20~30%만. 다음 업데이트까지 유지 확인",
    ACTIVE_ENTRY: "소액 보유/분할 가능. 장초반 급등은 추격보다 일부 회수",
    REENTRY: "재진입 후보. 1차만 작게, 종가 유지 확인 전 추가 금지",
    ENTRY_LOST_SOFT: "신규 매수 중단. MA20/5일선 회복 트리거까지 대기",
    REDUCE_ONLY: "보유분만 관리. 반등 시 축소, 신규 매수 금지",
    LOST_HARD: "완전 배제 후보. 손절/축소 후 재평가 쿨다운",
    WATCH_ONLY: "관찰만. ENTRY_OK 이력 부족",
    EXCLUDE: "검토 제외",
    NO_CURRENT: "현재 데이터 없음"
  }[status] ?? "관찰";
}

function statusLabel(status) {
  return {
    NEW_ENTRY: "신규 진입",
    ACTIVE_ENTRY: "진입 유지",
    REENTRY: "재진입",
    ENTRY_LOST_SOFT: "소프트 탈락",
    REDUCE_ONLY: "보유 축소",
    LOST_HARD: "하드 탈락",
    WATCH_ONLY: "관찰",
    EXCLUDE: "제외",
    NO_CURRENT: "현재 없음"
  }[status] ?? status;
}

function statusRank(status) {
  return {
    ACTIVE_ENTRY: 1,
    NEW_ENTRY: 2,
    REENTRY: 3,
    ENTRY_LOST_SOFT: 4,
    REDUCE_ONLY: 5,
    LOST_HARD: 6,
    WATCH_ONLY: 7,
    EXCLUDE: 8,
    NO_CURRENT: 9
  }[status] ?? 99;
}

function latestSnapshot(snapshots, version) {
  return snapshots.filter((item) => item.version === version).at(-1) ?? null;
}

function summarize(records, snapshots) {
  const byStatus = {};
  for (const record of records) byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
  const snapshotSummary = snapshots.map((snapshot) => ({
    version: snapshot.version,
    label: snapshot.label,
    latestDate: snapshot.latestDate,
    commit: snapshot.shortHash,
    entryOk: snapshot.rows.filter((row) => row.decision === "ENTRY_OK").length
  }));
  return {
    byStatus,
    activeLike: records.filter((record) => ["NEW_ENTRY", "ACTIVE_ENTRY", "REENTRY"].includes(record.status)).length,
    lostSoft: byStatus.ENTRY_LOST_SOFT ?? 0,
    hardOrReduce: (byStatus.LOST_HARD ?? 0) + (byStatus.REDUCE_ONLY ?? 0),
    snapshotSummary
  };
}

function renderHtml(payload) {
  const json = JSON.stringify(payload).replaceAll("<", "\\u003c").replaceAll("</script", "<\\/script");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(payload.meta.title)}</title>
  <style>
    :root{color-scheme:light;--bg:#f5f7fa;--surface:#fff;--ink:#17202a;--muted:#627083;--line:#d9e0e8;--green:#0b6b5d;--blue:#255fba;--amber:#a15c00;--red:#b33131;--nav:#17212e;--soft:#eef3f7}
    *{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Segoe UI","Malgun Gothic",Arial,sans-serif;line-height:1.48;letter-spacing:0}
    a{color:inherit}.layout{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:100vh}aside{position:sticky;top:0;height:100vh;overflow:auto;background:var(--nav);color:#f8fafc;padding:22px 18px}main{min-width:0;padding:clamp(14px,2.2vw,28px)}
    h1,h2,h3,p{margin-top:0}h1{font-size:21px;line-height:1.24}h2{font-size:clamp(23px,3.5vw,34px);line-height:1.18;margin-bottom:8px}h3{font-size:18px;margin-bottom:10px}.muted,.note{color:var(--muted)}.note{display:block;font-size:12px;margin-top:4px}.brand p{color:#cbd5df;font-size:13px}
    .side-box{display:grid;gap:6px;margin:14px 0;padding:12px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.06);font-size:12px}.nav-list{display:grid;gap:7px}.nav-link{display:flex;justify-content:space-between;gap:8px;min-height:38px;align-items:center;padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.05);text-decoration:none;font-weight:800;font-size:13px}.nav-link:hover{background:#fff;color:var(--ink)}
    .hero,.band,.record{border:1px solid var(--line);border-radius:8px;background:var(--surface)}.hero{padding:clamp(16px,2.4vw,26px);margin-bottom:14px}.hero p{max-width:980px;color:var(--muted)}.kicker{font-weight:900;color:var(--green);font-size:13px;margin-bottom:8px}
    .metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}.metric{padding:14px;border:1px solid var(--line);border-radius:8px;background:#fff}.metric strong{display:block;font-size:26px;line-height:1.1}.metric span{display:block;margin-top:6px;color:var(--muted);font-size:12px}
    .toolbar{position:sticky;top:0;z-index:5;display:grid;gap:10px;padding:12px;margin-bottom:14px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.96);backdrop-filter:blur(8px)}.search{width:100%;min-height:42px;padding:8px 11px;border:1px solid var(--line);border-radius:8px;font:inherit}.toolbar-meta{display:flex;justify-content:space-between;gap:10px;color:var(--muted);font-size:12px}.toolbar-meta b{color:var(--ink)}.segments{display:flex;gap:6px;overflow:auto;padding-bottom:2px}.segments button{flex:0 0 auto;min-height:34px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;font-weight:800;cursor:pointer}.segments button.active{border-color:var(--green);background:#e5f3ef;color:var(--green)}
    .band{padding:16px;margin-bottom:14px}.snapshot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.snapshot{padding:12px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd}.snapshot strong{display:block}.snapshot span{color:var(--muted);font-size:12px}
    .records{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.record{padding:15px}.record-head{display:flex;justify-content:space-between;gap:12px}.record h3{margin-bottom:4px}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;background:#eef2f7;color:#344054;font-size:12px;font-weight:800}.chip.good{background:#e5f3ef;color:var(--green)}.chip.warn{background:#fff2dc;color:var(--amber)}.chip.bad{background:#ffe8e8;color:var(--red)}.chip.info{background:#e8eef9;color:var(--blue)}
    .section-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.mini{padding:10px;border:1px solid var(--line);border-radius:8px;background:#fbfcfd}.mini b{display:block;font-size:13px}.mini span{display:block;color:var(--muted);font-size:12px;margin-top:3px}.action{margin-top:12px;padding:10px 12px;border-left:4px solid var(--blue);background:#f3f7fd;border-radius:6px;font-size:13px}.reason{margin-top:8px;color:var(--muted);font-size:12px}
    .timeline{display:flex;gap:8px;overflow:auto;margin-top:12px;padding-bottom:2px}.event{flex:0 0 170px;padding:9px;border:1px solid var(--line);border-radius:8px;background:#fff}.event strong{display:block;font-size:12px}.event span{display:block;color:var(--muted);font-size:11px;margin-top:3px}.empty{padding:22px;border:1px dashed var(--line);border-radius:8px;background:#fff;color:var(--muted);text-align:center}
    footer{margin-top:18px;color:var(--muted);font-size:12px}@media(max-width:1120px){.layout{grid-template-columns:1fr}aside{position:static;height:auto}.nav-list{display:flex;overflow:auto}.nav-link{min-width:150px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.records,.snapshot-grid{grid-template-columns:1fr}}@media(max-width:560px){main{padding:12px}.metrics{grid-template-columns:1fr}.record-head,.section-grid{display:block}.mini{margin-top:8px}.toolbar{top:0}.toolbar-meta{display:block}.event{flex-basis:150px}}
  </style>
</head>
<body>
  <div class="layout">
    <aside>
      <div class="brand"><h1>Entry Change Monitor v1</h1><p>v6·v7·v10 ENTRY_OK 이력 관리판</p></div>
      <div class="side-box"><span>기준: ${escapeHtml(payload.meta.startLabel)} (${payload.meta.startDate} 이후)</span><span>스냅샷: ${payload.meta.snapshotCount}개</span><span>ENTRY 이력 종목: ${payload.meta.entryTickerCount}개</span><span>최신 v10: ${escapeHtml(payload.meta.latestV10Snapshot ?? "-")}</span></div>
      <nav class="nav-list"><a class="nav-link" href="./v10.html"><span>V10 대시보드</span><span>↗</span></a><a class="nav-link" href="#records"><span>종목 상태</span><span>검색</span></a><a class="nav-link" href="#snapshots"><span>스냅샷</span><span>이력</span></a></nav>
    </aside>
    <main>
      <section class="hero"><p class="kicker">ENTRY 변화 추적</p><h2>ENTRY_OK였던 종목을 바로 버리지 않고, 재진입·축소·제외 상태로 나눠 관리합니다.</h2><p>하루 3회 업데이트할 때마다 신규 ENTRY, 유지, 소프트 탈락, 하드 탈락을 분리해서 봅니다. 특히 리노공업처럼 체질과 평단 신호는 유지되지만 기술 조건이 빠진 종목은 완전 제외가 아니라 재진입 대기로 관리합니다.</p></section>
      <section class="metrics" id="metrics"></section>
      <section class="toolbar"><input id="search" class="search" type="search" aria-label="검색" placeholder="회사명, 코드, 섹터, 상태, 리스크 검색"><div class="toolbar-meta"><span id="resultCount">전체 ${payload.records.length}개</span><span>소프트 탈락은 완전 배제가 아니라 재진입 트리거 대기</span></div><div class="segments" id="statusFilters"></div></section>
      <section class="band" id="snapshots"><h3>스냅샷 이력</h3><div class="snapshot-grid" id="snapshotGrid"></div></section>
      <section id="records"><div class="records" id="recordGrid"></div><div class="empty" id="empty" hidden>검색 조건에 맞는 종목이 없습니다.</div></section>
      <footer>생성 스크립트: <code>node scripts/build-entry-change-monitor-v1.mjs</code>. 데이터: <code>data/entry-change-monitor-v1-data.json</code>.</footer>
    </main>
  </div>
  <script>
    const DATA=${json};
    let query="";
    let status="ALL";
    const statusOrder=["ALL","ACTIVE_ENTRY","NEW_ENTRY","REENTRY","ENTRY_LOST_SOFT","REDUCE_ONLY","LOST_HARD","EXCLUDE"];
    const statusName={ALL:"전체",ACTIVE_ENTRY:"진입 유지",NEW_ENTRY:"신규 진입",REENTRY:"재진입",ENTRY_LOST_SOFT:"소프트 탈락",REDUCE_ONLY:"보유 축소",LOST_HARD:"하드 탈락",EXCLUDE:"제외"};
    const statusClass={ACTIVE_ENTRY:"good",NEW_ENTRY:"good",REENTRY:"info",ENTRY_LOST_SOFT:"warn",REDUCE_ONLY:"warn",LOST_HARD:"bad",EXCLUDE:"bad",WATCH_ONLY:"info"};
    const fmt=(v)=>v==null?"-":Number(v).toLocaleString("ko-KR");
    const price=(v)=>v==null?"-":fmt(v)+"원";
    const pct=(v)=>v==null?"-":Number(v).toLocaleString("ko-KR",{maximumFractionDigits:1})+"%";
    const esc=(v)=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
    function renderMetrics(){const s=DATA.summary.byStatus||{};const metrics=[["ENTRY 이력",DATA.meta.entryTickerCount+"개","v6·v7·v10 합산"],["관리 후보",DATA.summary.activeLike+"개","신규·유지·재진입"],["소프트 탈락",DATA.summary.lostSoft+"개","재진입 대기"],["축소/하드",DATA.summary.hardOrReduce+"개","신규 금지"],["스냅샷",DATA.meta.snapshotCount+"개",DATA.meta.startDate+" 이후"]];document.querySelector("#metrics").innerHTML=metrics.map(([a,b,c])=>\`<div class="metric"><strong>\${esc(b)}</strong><span>\${esc(a)} · \${esc(c)}</span></div>\`).join("");}
    function renderFilters(){document.querySelector("#statusFilters").innerHTML=statusOrder.map(x=>\`<button class="\${status===x?"active":""}" data-status="\${x}">\${esc(statusName[x]??x)} \${x==="ALL"?DATA.records.length:(DATA.summary.byStatus?.[x]??0)}</button>\`).join("");document.querySelectorAll("#statusFilters button").forEach(btn=>btn.addEventListener("click",()=>{status=btn.dataset.status;renderFilters();renderRecords();}));}
    function renderSnapshots(){document.querySelector("#snapshotGrid").innerHTML=DATA.summary.snapshotSummary.map(x=>\`<div class="snapshot"><strong>\${esc(x.version.toUpperCase())} · \${esc(x.latestDate)}</strong><span>ENTRY_OK \${x.entryOk}개 · \${esc(x.commit)}</span><span>\${esc(x.label)}</span></div>\`).join("");}
    function recordCard(r){const c=r.current||{};const structural=c.structural;const holder=c.holderCost;return \`<article class="record"><div class="record-head"><div><h3>\${esc(r.company)}</h3><span class="note">\${esc(r.ticker)} · \${esc(r.sector)}</span></div><div class="chips"><span class="chip \${statusClass[r.status]??"info"}">\${esc(r.statusLabel)}</span><span class="chip info">\${esc(c.version??"-")}</span></div></div><div class="section-grid"><div class="mini"><b>현재</b><span>\${esc(c.decision??"-")} · \${price(c.close)} · 총점 \${c.totalScore??"-"}\${c.v10cScore?" · v10c "+c.v10cScore:""}</span></div><div class="mini"><b>마지막 ENTRY</b><span>\${r.lastEntry?esc(r.lastEntry.label)+" · "+price(r.lastEntry.close):"-"}</span></div><div class="mini"><b>체질</b><span>\${structural?esc(structural.gate)+" · "+structural.score+"점 · "+esc(structural.label):"미확인"}</span></div><div class="mini"><b>평단</b><span>\${holder?esc(holder.signal)+" · "+(holder.score??0)+"점 · "+price(holder.estimatedCost)+" · 괴리 "+pct(holder.gapPct):"NO_DATA"}</span></div><div class="mini"><b>재진입 트리거</b><span>\${esc(c.entryTrigger??"-")}</span></div><div class="mini"><b>무효/손절</b><span>\${esc(c.invalidation??"-")}</span></div></div><div class="action"><b>관리 액션</b><br>\${esc(r.action)}</div><div class="reason">\${esc(r.reason)}</div><div class="timeline">\${r.transitionHistory.map(ev=>\`<div class="event"><strong>\${esc(ev.version.toUpperCase())} \${esc(ev.change)}</strong><span>\${esc(ev.latestDate)} · \${esc(ev.from)} → \${esc(ev.to)}</span><span>\${price(ev.close)} · \${ev.totalScore??"-"}점</span></div>\`).join("")}</div></article>\`;}
    function renderRecords(){const needle=query.trim().toLowerCase();const rows=DATA.records.filter(r=>(status==="ALL"||r.status===status)&&(!needle||r.searchText.includes(needle))).sort((a,b)=>0);document.querySelector("#recordGrid").innerHTML=rows.map(recordCard).join("");document.querySelector("#empty").hidden=rows.length>0;document.querySelector("#resultCount").textContent=\`표시 \${rows.length}개 / 전체 \${DATA.records.length}개\`;}
    document.querySelector("#search").addEventListener("input",e=>{query=e.target.value;renderRecords();});
    renderMetrics();renderFilters();renderSnapshots();renderRecords();
  </script>
</body>
</html>`;
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
