import fs from "node:fs"
import path from "node:path"

import { createCoverageMap } from "istanbul-lib-coverage"
import { createContext } from "istanbul-lib-report"
import reports from "istanbul-reports"

const cwd = process.cwd()
const coverageDir = path.resolve(cwd, "coverage")
const combinedDir = path.join(coverageDir, "combined")
const historyDir = path.join(combinedDir, "history")

const runners = [
  {
    name: "unit",
    coverageFile: path.join(coverageDir, "coverage-final.json"),
  },
  {
    name: "integration",
    coverageFile: path.join(coverageDir, "integration", "coverage-final.json"),
  },
]

function ensureDir(directory) {
  fs.mkdirSync(directory, { recursive: true })
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8")
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`Failed to parse JSON from ${filePath}: file may be corrupt or incomplete`)
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function toPercent(value) {
  return Number(value.toFixed(2))
}

function summarizeMetric(metric) {
  return {
    total: metric.total,
    covered: metric.covered,
    skipped: metric.skipped,
    pct: toPercent(metric.pct),
  }
}

function summarizeFile(summary) {
  return {
    lines: summarizeMetric(summary.lines),
    statements: summarizeMetric(summary.statements),
    functions: summarizeMetric(summary.functions),
    branches: summarizeMetric(summary.branches),
  }
}

function toRelative(filePath) {
  return path.relative(cwd, filePath) || filePath
}

function buildHotspots(fileEntries) {
  return [...fileEntries]
    .sort((left, right) => {
      if (left.summary.branches.pct !== right.summary.branches.pct) {
        return left.summary.branches.pct - right.summary.branches.pct
      }
      if (left.summary.lines.pct !== right.summary.lines.pct) {
        return left.summary.lines.pct - right.summary.lines.pct
      }
      return left.file.localeCompare(right.file)
    })
    .slice(0, 15)
    .map(({ file, summary }) => ({
      file,
      lines: summary.lines.pct,
      statements: summary.statements.pct,
      functions: summary.functions.pct,
      branches: summary.branches.pct,
    }))
}

function loadSnapshots() {
  const indexPath = path.join(historyDir, "index.json")
  if (!fs.existsSync(indexPath)) {
    return []
  }

  const parsed = readJson(indexPath)
  return Array.isArray(parsed.snapshots) ? parsed.snapshots : []
}

function buildTrendHtml(snapshots) {
  if (snapshots.length === 0) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Coverage Trend</title>
  </head>
  <body>
    <h1>Coverage Trend</h1>
    <p>No coverage snapshots available yet.</p>
  </body>
</html>
`
  }

  const width = 760
  const height = 220
  const padding = 32
  const xStep = snapshots.length === 1 ? 0 : (width - padding * 2) / (snapshots.length - 1)
  const yFor = (value) => height - padding - ((height - padding * 2) * value) / 100
  const buildPolyline = (metric) =>
    snapshots
      .map((snapshot, index) => `${padding + index * xStep},${yFor(snapshot.totals[metric].pct)}`)
      .join(" ")

  const rows = snapshots
    .map(
      (snapshot) => `<tr>
  <td>${snapshot.generatedAt}</td>
  <td>${snapshot.totals.lines.pct}%</td>
  <td>${snapshot.totals.statements.pct}%</td>
  <td>${snapshot.totals.functions.pct}%</td>
  <td>${snapshot.totals.branches.pct}%</td>
  <td>${snapshot.files}</td>
</tr>`,
    )
    .join("\n")

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Coverage Trend</title>
    <style>
      body { font-family: sans-serif; margin: 24px; color: #111827; }
      h1, h2 { margin-bottom: 8px; }
      svg { border: 1px solid #d1d5db; background: #fff; }
      .legend { display: flex; gap: 16px; margin: 12px 0 24px; font-size: 14px; }
      .legend span { display: inline-flex; align-items: center; gap: 6px; }
      .swatch { width: 12px; height: 12px; display: inline-block; }
      table { border-collapse: collapse; width: 100%; margin-top: 16px; }
      th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
      th { background: #f9fafb; }
      code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Coverage Trend</h1>
    <p>Generated from merged unit + integration Istanbul artifacts under <code>coverage/combined</code>.</p>
    <div class="legend">
      <span><i class="swatch" style="background:#2563eb"></i>Lines</span>
      <span><i class="swatch" style="background:#059669"></i>Statements</span>
      <span><i class="swatch" style="background:#d97706"></i>Functions</span>
      <span><i class="swatch" style="background:#dc2626"></i>Branches</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Coverage trend chart">
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#9ca3af" />
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#9ca3af" />
      <polyline fill="none" stroke="#2563eb" stroke-width="3" points="${buildPolyline("lines")}" />
      <polyline fill="none" stroke="#059669" stroke-width="3" points="${buildPolyline("statements")}" />
      <polyline fill="none" stroke="#d97706" stroke-width="3" points="${buildPolyline("functions")}" />
      <polyline fill="none" stroke="#dc2626" stroke-width="3" points="${buildPolyline("branches")}" />
      <text x="${padding - 20}" y="${padding + 4}" font-size="12" fill="#6b7280">100</text>
      <text x="${padding - 12}" y="${height - padding + 4}" font-size="12" fill="#6b7280">0</text>
    </svg>
    <h2>Snapshots</h2>
    <table>
      <thead>
        <tr>
          <th>Generated At</th>
          <th>Lines</th>
          <th>Statements</th>
          <th>Functions</th>
          <th>Branches</th>
          <th>Files</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </body>
</html>
`
}

ensureDir(combinedDir)
ensureDir(historyDir)

const mergedCoverage = createCoverageMap({})
const sources = []

for (const runner of runners) {
  if (!fs.existsSync(runner.coverageFile)) {
    continue
  }

  mergedCoverage.merge(readJson(runner.coverageFile))
  sources.push({
    name: runner.name,
    coverageFile: path.relative(cwd, runner.coverageFile),
  })
}

if (sources.length === 0) {
  console.error("No coverage-final.json artifacts found for unit or integration runs.")
  process.exit(1)
}

writeJson(path.join(combinedDir, "coverage-final.json"), mergedCoverage.toJSON())

const reportContext = createContext({
  dir: combinedDir,
  coverageMap: mergedCoverage,
  defaultSummarizer: "pkg",
})

reports.create("html").execute(reportContext)
reports.create("json-summary").execute(reportContext)
reports.create("lcovonly").execute(reportContext)

const summary = mergedCoverage.getCoverageSummary()
const fileEntries = mergedCoverage.files().map((filePath) => ({
  file: toRelative(filePath),
  summary: summarizeFile(mergedCoverage.fileCoverageFor(filePath).toSummary()),
}))

const combinedReport = {
  generatedAt: new Date().toISOString(),
  sources,
  files: fileEntries.length,
  totals: summarizeFile(summary),
  hotspots: buildHotspots(fileEntries),
}

writeJson(path.join(combinedDir, "report.json"), combinedReport)

const markdown = [
  "# Combined Coverage Report",
  "",
  `Generated: ${combinedReport.generatedAt}`,
  "",
  "## Totals",
  "",
  "| Metric | Covered | Total | Percent |",
  "| --- | ---: | ---: | ---: |",
  `| Lines | ${combinedReport.totals.lines.covered} | ${combinedReport.totals.lines.total} | ${combinedReport.totals.lines.pct}% |`,
  `| Statements | ${combinedReport.totals.statements.covered} | ${combinedReport.totals.statements.total} | ${combinedReport.totals.statements.pct}% |`,
  `| Functions | ${combinedReport.totals.functions.covered} | ${combinedReport.totals.functions.total} | ${combinedReport.totals.functions.pct}% |`,
  `| Branches | ${combinedReport.totals.branches.covered} | ${combinedReport.totals.branches.total} | ${combinedReport.totals.branches.pct}% |`,
  "",
  "## Lowest Branch Coverage Files",
  "",
  "| File | Lines | Statements | Functions | Branches |",
  "| --- | ---: | ---: | ---: | ---: |",
  ...combinedReport.hotspots.map(
    (hotspot) =>
      `| \`${hotspot.file}\` | ${hotspot.lines}% | ${hotspot.statements}% | ${hotspot.functions}% | ${hotspot.branches}% |`,
  ),
  "",
].join("\n")

fs.writeFileSync(path.join(combinedDir, "report.md"), `${markdown}\n`, "utf8")

const snapshotFile = `${combinedReport.generatedAt.replace(/[:.]/g, "-")}.json`
const snapshotPath = path.join(historyDir, snapshotFile)
const snapshot = {
  generatedAt: combinedReport.generatedAt,
  files: combinedReport.files,
  totals: combinedReport.totals,
  sources: combinedReport.sources.map((source) => source.name),
}

writeJson(snapshotPath, snapshot)
fs.appendFileSync(path.join(historyDir, "trend.jsonl"), `${JSON.stringify(snapshot)}\n`, "utf8")

const snapshots = [...loadSnapshots(), snapshot].slice(-50)
writeJson(path.join(historyDir, "index.json"), { snapshots })
fs.writeFileSync(path.join(historyDir, "index.html"), buildTrendHtml(snapshots), "utf8")

console.log(`Merged coverage from: ${sources.map((source) => source.name).join(", ")}`)
console.log(`Combined report: ${path.relative(cwd, path.join(combinedDir, "index.html"))}`)
console.log(`Trend report: ${path.relative(cwd, path.join(historyDir, "index.html"))}`)
