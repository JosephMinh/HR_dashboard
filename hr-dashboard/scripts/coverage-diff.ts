#!/usr/bin/env bun
/**
 * coverage-diff.ts
 *
 * Diff-aware coverage guard: checks that files changed against a base git ref
 * meet per-file coverage thresholds. Prevents new code from hiding behind
 * aggregate legacy coverage numbers.
 *
 * Usage:
 *   bun run scripts/coverage-diff.ts [options]
 *
 * Options:
 *   --base <ref>         Base git ref to diff against (default: origin/main)
 *   --summary <path>     Path to coverage-summary.json
 *                        (default: coverage/coverage-summary.json)
 *   --threshold <pct>    Lines/statements/functions threshold (default: 80)
 *   --branch-threshold <pct>  Branch threshold (default: 70)
 *   --staged             Check staged files instead of diff against base ref
 *   --warn-only          Print report but always exit 0 (CI ramp-up mode)
 */

import { execFileSync, execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CoverageMetrics {
  total: number
  covered: number
  skipped: number
  pct: number
}

export interface FileCoverage {
  lines: CoverageMetrics
  statements: CoverageMetrics
  branches: CoverageMetrics
  functions: CoverageMetrics
}

export interface CoverageSummary {
  total: FileCoverage
  [filePath: string]: FileCoverage
}

export interface Thresholds {
  lines: number
  statements: number
  branches: number
  functions: number
}

export interface FileResult {
  /** Relative path from git root (as returned by git diff) */
  changedFile: string
  /** Absolute key in coverage summary, or null if not found */
  summaryKey: string | null
  coverage: FileCoverage | null
  /** True if all thresholds pass */
  passes: boolean
  /** Human-readable list of failing metrics */
  failing: string[]
}

// ─── Core analysis functions (exported for testing) ─────────────────────────

/**
 * Finds the matching key in the coverage summary for a changed file.
 *
 * Git diff returns paths relative to the git root (e.g. "hr-dashboard/src/lib/auth.ts").
 * Coverage summary uses absolute paths (e.g. "/abs/path/hr-dashboard/src/lib/auth.ts").
 * We resolve the relative path against the git root to get the absolute path.
 */
export function findSummaryKey(
  changedFile: string,
  summaryKeys: string[],
  gitRoot: string,
): string | null {
  const absPath = path.resolve(gitRoot, changedFile)
  for (const key of summaryKeys) {
    if (key === "total") continue
    if (key === absPath) return key
  }
  return null
}

/**
 * Checks which metrics fail the given thresholds.
 * Returns an array of human-readable failure descriptions.
 */
export function checkThresholds(coverage: FileCoverage, thresholds: Thresholds): string[] {
  const failing: string[] = []
  const metrics: Array<keyof Thresholds> = ["lines", "statements", "branches", "functions"]
  for (const metric of metrics) {
    const threshold = thresholds[metric]
    const pct = coverage[metric].pct
    if (pct < threshold) {
      failing.push(`${metric}: ${pct.toFixed(1)}% < ${threshold}%`)
    }
  }
  return failing
}

/**
 * Analyzes coverage for a list of changed files against the coverage summary.
 *
 * Files in src/ that are absent from the coverage report are treated as
 * uncovered (a warning is appended, but they don't cause a hard fail by
 * default — set treatMissingAsFail=true to enforce).
 */
export function analyzeChangedFiles(
  changedFiles: string[],
  summary: CoverageSummary,
  gitRoot: string,
  thresholds: Thresholds,
  treatMissingAsFail = false,
): FileResult[] {
  const summaryKeys = Object.keys(summary)

  return changedFiles.map((changedFile): FileResult => {
    const summaryKey = findSummaryKey(changedFile, summaryKeys, gitRoot)

    if (!summaryKey) {
      return {
        changedFile,
        summaryKey: null,
        coverage: null,
        passes: !treatMissingAsFail,
        failing: treatMissingAsFail
          ? ["not in coverage report — file may be entirely untested"]
          : [],
      }
    }

    const coverage = summary[summaryKey] as FileCoverage
    const failing = checkThresholds(coverage, thresholds)
    return {
      changedFile,
      summaryKey,
      coverage,
      passes: failing.length === 0,
      failing,
    }
  })
}

/**
 * Formats a human-readable coverage report for changed files.
 */
export function formatReport(results: FileResult[], thresholds: Thresholds): string {
  const lines: string[] = []

  lines.push("Coverage diff report")
  lines.push(
    `Thresholds: lines=${thresholds.lines}% statements=${thresholds.statements}% branches=${thresholds.branches}% functions=${thresholds.functions}%`,
  )
  lines.push("")

  if (results.length === 0) {
    lines.push("No changed source files found.")
    return lines.join("\n")
  }

  const passCount = results.filter((r) => r.passes).length
  const failCount = results.length - passCount
  const notInReport = results.filter((r) => r.summaryKey === null).length

  lines.push(`Changed files: ${results.length}  Passing: ${passCount}  Failing: ${failCount}`)
  if (notInReport > 0) {
    lines.push(`  (${notInReport} file(s) not found in coverage report)`)
  }
  lines.push("")

  // Failures first for quick scanning
  const failures = results.filter((r) => !r.passes)
  if (failures.length > 0) {
    lines.push("FAILING files:")
    for (const result of failures) {
      lines.push(`  ✗ ${result.changedFile}`)
      for (const f of result.failing) {
        lines.push(`      ${f}`)
      }
    }
    lines.push("")
  }

  const passes = results.filter((r) => r.passes && r.coverage !== null)
  if (passes.length > 0) {
    lines.push("Passing files:")
    for (const result of passes) {
      const c = result.coverage!
      lines.push(
        `  ✓ ${result.changedFile}  ` +
          `lines=${c.lines.pct.toFixed(1)}% ` +
          `stmts=${c.statements.pct.toFixed(1)}% ` +
          `branches=${c.branches.pct.toFixed(1)}% ` +
          `fns=${c.functions.pct.toFixed(1)}%`,
      )
    }
    lines.push("")
  }

  const skipped = results.filter((r) => r.passes && r.coverage === null)
  if (skipped.length > 0) {
    lines.push("Not in report (skipped):")
    for (const result of skipped) {
      lines.push(`  ~ ${result.changedFile}`)
    }
  }

  return lines.join("\n")
}

// ─── Git helpers ─────────────────────────────────────────────────────────────

export function getChangedSourceFiles(baseRef: string, gitRoot: string, staged: boolean): string[] {
  let output: string
  try {
    if (staged) {
      output = execSync("git diff --cached --name-only --diff-filter=ACMR", {
        encoding: "utf8",
        cwd: gitRoot,
      })
    } else {
      output = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", baseRef], {
        encoding: "utf8",
        cwd: gitRoot,
      })
    }
  } catch {
    // No commits yet or ref not found — return empty
    return []
  }

  return output
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter(
      (f) =>
        (f.endsWith(".ts") || f.endsWith(".tsx")) &&
        !f.endsWith(".d.ts") &&
        !f.includes(".test.") &&
        !f.includes(".spec.") &&
        !f.includes("__tests__/") &&
        // Restrict to source files we actually care about
        (f.includes("src/") || f.includes("hr-dashboard/src/")),
    )
}

// ─── Main entry point ────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  base: string
  summaryPath: string
  threshold: number
  branchThreshold: number
  staged: boolean
  warnOnly: boolean
} {
  const args = {
    base: "origin/main",
    summaryPath: "coverage/coverage-summary.json",
    threshold: 80,
    branchThreshold: 70,
    staged: false,
    warnOnly: false,
  }

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--base":
        args.base = argv[++i] ?? args.base
        break
      case "--summary":
        args.summaryPath = argv[++i] ?? args.summaryPath
        break
      case "--threshold":
        args.threshold = Number(argv[++i]) || args.threshold
        break
      case "--branch-threshold":
        args.branchThreshold = Number(argv[++i]) || args.branchThreshold
        break
      case "--staged":
        args.staged = true
        break
      case "--warn-only":
        args.warnOnly = true
        break
    }
  }

  return args
}

// Only run as main when executed directly (not imported as a module).
// import.meta.main is a Bun-specific property; cast to avoid TypeScript error.
if ((import.meta as { main?: boolean }).main) {
  const args = parseArgs(process.argv.slice(2))

  const gitRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim()

  if (!existsSync(args.summaryPath)) {
    console.error(
      `Coverage summary not found: ${args.summaryPath}\n` +
        `Run 'npm run test:coverage' or 'npm run test:integration:coverage' first.`,
    )
    process.exit(1)
  }

  const summary = JSON.parse(readFileSync(args.summaryPath, "utf8")) as CoverageSummary
  const changedFiles = getChangedSourceFiles(args.base, gitRoot, args.staged)

  const thresholds: Thresholds = {
    lines: args.threshold,
    statements: args.threshold,
    branches: args.branchThreshold,
    functions: args.threshold,
  }

  const results = analyzeChangedFiles(changedFiles, summary, gitRoot, thresholds)
  const report = formatReport(results, thresholds)

  console.log(report)

  const anyFail = results.some((r) => !r.passes)

  if (anyFail && !args.warnOnly) {
    console.error(
      `\nDiff coverage check FAILED: ${results.filter((r) => !r.passes).length} file(s) below threshold.`,
    )
    process.exit(1)
  }

  if (anyFail && args.warnOnly) {
    console.warn("\nDiff coverage check: failures found (warn-only mode, not failing build).")
  }
}
