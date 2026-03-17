import { describe, expect, it } from "vitest"

import type { CoverageSummary, FileCoverage, FileResult, Thresholds } from "@/../scripts/coverage-diff"
import {
  analyzeChangedFiles,
  checkThresholds,
  findSummaryKey,
  formatReport,
} from "@/../scripts/coverage-diff"

// ─── Fixtures ──────────────────────────────────────────────────────────────

const HIGH_COVERAGE: FileCoverage = {
  lines: { total: 100, covered: 90, skipped: 0, pct: 90 },
  statements: { total: 100, covered: 90, skipped: 0, pct: 90 },
  branches: { total: 60, covered: 48, skipped: 0, pct: 80 },
  functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
}

const LOW_COVERAGE: FileCoverage = {
  lines: { total: 100, covered: 50, skipped: 0, pct: 50 },
  statements: { total: 100, covered: 50, skipped: 0, pct: 50 },
  branches: { total: 60, covered: 24, skipped: 0, pct: 40 },
  functions: { total: 20, covered: 8, skipped: 0, pct: 40 },
}

const PARTIAL_COVERAGE: FileCoverage = {
  lines: { total: 100, covered: 85, skipped: 0, pct: 85 },
  statements: { total: 100, covered: 82, skipped: 0, pct: 82 },
  // branches is below threshold
  branches: { total: 60, covered: 36, skipped: 0, pct: 60 },
  functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
}

const THRESHOLDS: Thresholds = {
  lines: 80,
  statements: 80,
  branches: 70,
  functions: 80,
}

const MOCK_SUMMARY: CoverageSummary = {
  total: HIGH_COVERAGE,
  "/repo/hr-dashboard/src/lib/auth.ts": HIGH_COVERAGE,
  "/repo/hr-dashboard/src/app/api/jobs/route.ts": LOW_COVERAGE,
  "/repo/hr-dashboard/src/lib/validations/schemas.ts": PARTIAL_COVERAGE,
}

// ─── findSummaryKey ─────────────────────────────────────────────────────────

describe("findSummaryKey", () => {
  const summaryKeys = Object.keys(MOCK_SUMMARY)
  const gitRoot = "/repo"

  it("finds matching key by resolving relative path to absolute", () => {
    const key = findSummaryKey("hr-dashboard/src/lib/auth.ts", summaryKeys, gitRoot)
    expect(key).toBe("/repo/hr-dashboard/src/lib/auth.ts")
  })

  it("returns null for files not in the summary", () => {
    const key = findSummaryKey("hr-dashboard/src/lib/unknown.ts", summaryKeys, gitRoot)
    expect(key).toBeNull()
  })

  it("skips the 'total' key", () => {
    const key = findSummaryKey("total", summaryKeys, gitRoot)
    expect(key).toBeNull()
  })

  it("works with deeply nested paths", () => {
    const key = findSummaryKey(
      "hr-dashboard/src/app/api/jobs/route.ts",
      summaryKeys,
      gitRoot,
    )
    expect(key).toBe("/repo/hr-dashboard/src/app/api/jobs/route.ts")
  })
})

// ─── checkThresholds ───────────────────────────────────────────────────────

describe("checkThresholds", () => {
  it("returns empty array when all metrics pass", () => {
    const failing = checkThresholds(HIGH_COVERAGE, THRESHOLDS)
    expect(failing).toEqual([])
  })

  it("returns failures for all metrics that fall short", () => {
    const failing = checkThresholds(LOW_COVERAGE, THRESHOLDS)
    expect(failing).toHaveLength(4)
    expect(failing).toContain("lines: 50.0% < 80%")
    expect(failing).toContain("statements: 50.0% < 80%")
    expect(failing).toContain("branches: 40.0% < 70%")
    expect(failing).toContain("functions: 40.0% < 80%")
  })

  it("reports only the failing metrics when partially covered", () => {
    const failing = checkThresholds(PARTIAL_COVERAGE, THRESHOLDS)
    expect(failing).toHaveLength(1)
    expect(failing[0]).toBe("branches: 60.0% < 70%")
  })

  it("formats pct with one decimal place", () => {
    const coverage: FileCoverage = {
      lines: { total: 3, covered: 1, skipped: 0, pct: 33.333333 },
      statements: { total: 3, covered: 1, skipped: 0, pct: 33.333333 },
      branches: { total: 3, covered: 1, skipped: 0, pct: 33.333333 },
      functions: { total: 3, covered: 1, skipped: 0, pct: 33.333333 },
    }
    const failing = checkThresholds(coverage, THRESHOLDS)
    expect(failing[0]).toMatch(/33\.3%/)
  })
})

// ─── analyzeChangedFiles ──────────────────────────────────────────────────

describe("analyzeChangedFiles", () => {
  const gitRoot = "/repo"

  it("returns passing result for files meeting thresholds", () => {
    const results = analyzeChangedFiles(
      ["hr-dashboard/src/lib/auth.ts"],
      MOCK_SUMMARY,
      gitRoot,
      THRESHOLDS,
    )
    expect(results).toHaveLength(1)
    expect(results[0]?.passes).toBe(true)
    expect(results[0]?.failing).toEqual([])
    expect(results[0]?.summaryKey).toBe("/repo/hr-dashboard/src/lib/auth.ts")
  })

  it("returns failing result for files below thresholds", () => {
    const results = analyzeChangedFiles(
      ["hr-dashboard/src/app/api/jobs/route.ts"],
      MOCK_SUMMARY,
      gitRoot,
      THRESHOLDS,
    )
    expect(results[0]?.passes).toBe(false)
    expect(results[0]?.failing.length).toBeGreaterThan(0)
  })

  it("marks files not in report as passing by default (warn, not fail)", () => {
    const results = analyzeChangedFiles(
      ["hr-dashboard/src/lib/new-feature.ts"],
      MOCK_SUMMARY,
      gitRoot,
      THRESHOLDS,
    )
    expect(results[0]?.summaryKey).toBeNull()
    expect(results[0]?.passes).toBe(true)
    expect(results[0]?.failing).toEqual([])
  })

  it("marks files not in report as failing when treatMissingAsFail=true", () => {
    const results = analyzeChangedFiles(
      ["hr-dashboard/src/lib/new-feature.ts"],
      MOCK_SUMMARY,
      gitRoot,
      THRESHOLDS,
      /* treatMissingAsFail */ true,
    )
    expect(results[0]?.passes).toBe(false)
    expect(results[0]?.failing[0]).toMatch(/not in coverage report/)
  })

  it("handles multiple files with mixed results", () => {
    const results = analyzeChangedFiles(
      ["hr-dashboard/src/lib/auth.ts", "hr-dashboard/src/app/api/jobs/route.ts"],
      MOCK_SUMMARY,
      gitRoot,
      THRESHOLDS,
    )
    expect(results).toHaveLength(2)
    expect(results[0]?.passes).toBe(true)
    expect(results[1]?.passes).toBe(false)
  })

  it("returns empty array for empty changed files list", () => {
    const results = analyzeChangedFiles([], MOCK_SUMMARY, gitRoot, THRESHOLDS)
    expect(results).toEqual([])
  })
})

// ─── formatReport ─────────────────────────────────────────────────────────

describe("formatReport", () => {
  it("shows 'No changed source files' when results is empty", () => {
    const output = formatReport([], THRESHOLDS)
    expect(output).toContain("No changed source files")
  })

  it("includes threshold summary in header", () => {
    const output = formatReport([], THRESHOLDS)
    expect(output).toContain("lines=80%")
    expect(output).toContain("branches=70%")
  })

  it("shows failing files before passing files", () => {
    const results: FileResult[] = [
      {
        changedFile: "hr-dashboard/src/lib/auth.ts",
        summaryKey: "/repo/hr-dashboard/src/lib/auth.ts",
        coverage: HIGH_COVERAGE,
        passes: true,
        failing: [],
      },
      {
        changedFile: "hr-dashboard/src/app/api/jobs/route.ts",
        summaryKey: "/repo/hr-dashboard/src/app/api/jobs/route.ts",
        coverage: LOW_COVERAGE,
        passes: false,
        failing: ["lines: 50.0% < 80%", "branches: 40.0% < 70%"],
      },
    ]

    const output = formatReport(results, THRESHOLDS)

    const failIdx = output.indexOf("FAILING files:")
    const passIdx = output.indexOf("Passing files:")
    expect(failIdx).toBeGreaterThanOrEqual(0)
    expect(passIdx).toBeGreaterThan(failIdx)
  })

  it("marks passing files with ✓ and failing with ✗", () => {
    const results: FileResult[] = [
      {
        changedFile: "hr-dashboard/src/lib/auth.ts",
        summaryKey: "/repo/hr-dashboard/src/lib/auth.ts",
        coverage: HIGH_COVERAGE,
        passes: true,
        failing: [],
      },
      {
        changedFile: "hr-dashboard/src/app/api/jobs/route.ts",
        summaryKey: "/repo/hr-dashboard/src/app/api/jobs/route.ts",
        coverage: LOW_COVERAGE,
        passes: false,
        failing: ["lines: 50.0% < 80%"],
      },
    ]

    const output = formatReport(results, THRESHOLDS)
    expect(output).toContain("✓")
    expect(output).toContain("✗")
  })

  it("shows totals in summary line", () => {
    const results: FileResult[] = [
      {
        changedFile: "hr-dashboard/src/lib/auth.ts",
        summaryKey: "/repo/hr-dashboard/src/lib/auth.ts",
        coverage: HIGH_COVERAGE,
        passes: true,
        failing: [],
      },
    ]
    const output = formatReport(results, THRESHOLDS)
    expect(output).toContain("Changed files: 1")
    expect(output).toContain("Passing: 1")
    expect(output).toContain("Failing: 0")
  })

  it("shows per-file metric values for passing files", () => {
    const results: FileResult[] = [
      {
        changedFile: "hr-dashboard/src/lib/auth.ts",
        summaryKey: "/repo/hr-dashboard/src/lib/auth.ts",
        coverage: HIGH_COVERAGE,
        passes: true,
        failing: [],
      },
    ]
    const output = formatReport(results, THRESHOLDS)
    expect(output).toContain("lines=90.0%")
    expect(output).toContain("branches=80.0%")
  })
})
