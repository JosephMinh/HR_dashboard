import type { Reporter } from "vitest/reporters"
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"

type TestCaseLike = Parameters<NonNullable<Reporter["onTestCaseReady"]>>[0]
type TestModuleLike = Parameters<NonNullable<Reporter["onTestRunEnd"]>>[0][number]
type TestRunEndReasonLike = Parameters<NonNullable<Reporter["onTestRunEnd"]>>[2]

interface TestResultSummary {
  name: string
  fullName: string
  file: string | null
  state: string
  durationMs: number | null
  errors?: Array<{ message: string; stack?: string }>
  logFiles?: Array<{ jsonPath: string; logPath: string }>
}

interface RunSummary {
  startedAt: string
  finishedAt: string
  durationMs: number
  reason: TestRunEndReasonLike
  totals: {
    passed: number
    failed: number
    skipped: number
  }
  tests: TestResultSummary[]
  unhandledErrors: Array<{ message: string; stack?: string }>
}

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "test-results", "vitest")

function sanitizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80)
}

function getLogFilesForTest(testName: string): Array<{ jsonPath: string; logPath: string }> {
  if (typeof globalThis === "undefined") return []
  const bucket = (globalThis as { __TEST_LOG_FILES__?: Array<{ testName: string; jsonPath: string; logPath: string }> })
  const files = bucket.__TEST_LOG_FILES__ ?? []
  const normalized = sanitizeName(testName)
  return files.filter((entry) => sanitizeName(entry.testName) === normalized)
}

export default class DetailedReporter implements Reporter {
  private readonly outputDir: string
  private readonly startedAt = new Date()
  private readonly results: TestResultSummary[] = []

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = options.outputDir ?? process.env.VITEST_REPORT_DIR ?? DEFAULT_OUTPUT_DIR
  }

  onTestCaseReady(testCase: TestCaseLike) {
    const fullName = testCase.fullName
    const file = testCase.module?.relativeModuleId ?? testCase.module?.moduleId ?? null
    console.log(`[${new Date().toISOString()}] [TEST] ${fullName} - START (${file ?? "unknown"})`)
  }

  onTestCaseResult(testCase: TestCaseLike) {
    const result = testCase.result()
    const diagnostic = testCase.diagnostic()
    const durationMs = diagnostic?.duration ?? null
    const errors = result.errors?.map((error) => ({
      message: error.message,
      stack: error.stack,
    }))

    const summary: TestResultSummary = {
      name: testCase.name,
      fullName: testCase.fullName,
      file: testCase.module?.relativeModuleId ?? testCase.module?.moduleId ?? null,
      state: result.state,
      durationMs,
      errors: errors && errors.length ? errors : undefined,
      logFiles: getLogFilesForTest(testCase.fullName),
    }

    this.results.push(summary)

    const status = result.state.toUpperCase()
    const durationText = durationMs !== null ? ` (${durationMs}ms)` : ""
    console.log(`[${new Date().toISOString()}] [TEST] ${testCase.fullName} - ${status}${durationText}`)

    if (summary.logFiles && summary.logFiles.length > 0) {
      summary.logFiles.forEach((file) => {
        console.log(`[${new Date().toISOString()}] [LOG] ${testCase.fullName} -> ${file.logPath}`)
      })
    }
  }

  onTestRunEnd(
    _testModules: ReadonlyArray<TestModuleLike>,
    unhandledErrors: ReadonlyArray<{ message?: string; stack?: string }>,
    reason: TestRunEndReasonLike,
  ) {
    const finishedAt = new Date()
    const totals = {
      passed: this.results.filter((test) => test.state === "passed").length,
      failed: this.results.filter((test) => test.state === "failed").length,
      skipped: this.results.filter((test) => test.state === "skipped").length,
    }

    const summary: RunSummary = {
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - this.startedAt.getTime(),
      reason,
      totals,
      tests: this.results,
      unhandledErrors: unhandledErrors.map((error) => ({
        message: error.message ?? "Unknown error",
        stack: error.stack,
      })),
    }

    mkdirSync(this.outputDir, { recursive: true })
    const jsonPath = path.join(this.outputDir, "report.json")
    const textPath = path.join(this.outputDir, "report.txt")

    writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8")
    writeFileSync(textPath, this.formatText(summary), "utf8")
  }

  private formatText(summary: RunSummary): string {
    const lines: string[] = []
    lines.push(`Run started: ${summary.startedAt}`)
    lines.push(`Run finished: ${summary.finishedAt}`)
    lines.push(`Duration: ${summary.durationMs}ms`)    
    lines.push(`Status: ${summary.reason}`)
    lines.push(`Totals: passed=${summary.totals.passed} failed=${summary.totals.failed} skipped=${summary.totals.skipped}`)
    lines.push("")

    summary.tests.forEach((test) => {
      const duration = test.durationMs !== null ? `${test.durationMs}ms` : "n/a"
      lines.push(`[${test.state}] ${test.fullName} (${duration})`)
      if (test.errors) {
        test.errors.forEach((error) => {
          lines.push(`  error: ${error.message}`)
        })
      }
      if (test.logFiles && test.logFiles.length > 0) {
        test.logFiles.forEach((file) => {
          lines.push(`  log: ${file.logPath}`)
        })
      }
    })

    if (summary.unhandledErrors.length > 0) {
      lines.push("")
      lines.push("Unhandled errors:")
      summary.unhandledErrors.forEach((error) => {
        lines.push(`- ${error.message}`)
      })
    }

    return `${lines.join("\n")}\n`
  }
}
