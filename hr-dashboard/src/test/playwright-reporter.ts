import type {
  Reporter,
  FullConfig,
  FullResult,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter"
import path from "node:path"
import { mkdirSync, writeFileSync } from "node:fs"

interface PlaywrightTestSummary {
  title: string
  file: string | null
  project: string
  status: string
  durationMs: number
  steps: PlaywrightStepSummary[]
  attachments: Array<{ name: string; contentType: string; path?: string; body?: string }>
  errors?: Array<{ message: string; stack?: string }>
  stderr?: string[]
  stdout?: string[]
}

interface PlaywrightStepSummary {
  title: string
  category?: string
  durationMs: number
  error?: string
  steps: PlaywrightStepSummary[]
}

interface PlaywrightRunSummary {
  startedAt: string
  finishedAt: string
  durationMs: number
  status: FullResult["status"]
  total: number
  passed: number
  failed: number
  skipped: number
  tests: PlaywrightTestSummary[]
}

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "test-results", "playwright")

type ReporterStepLike = {
  title?: string
  category?: string
  duration?: number
  error?: { message?: string } | string
  steps?: ReporterStepLike[]
}

function serializeOutput(chunks: Array<string | Buffer>): string[] {
  return chunks.map((chunk) => (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk))
}

function serializeSteps(steps: ReporterStepLike[] | undefined): PlaywrightStepSummary[] {
  return (steps ?? []).map((step) => ({
    title: step.title ?? "unnamed step",
    category: step.category,
    durationMs: step.duration ?? 0,
    error: typeof step.error === "string" ? step.error : step.error?.message,
    steps: serializeSteps(step.steps),
  }))
}

function getProjectName(test: TestCase): string {
  const maybeTest = test as unknown as {
    project?: { name?: string }
    parent?: { project?: () => { name?: string } }
  }

  if (maybeTest.project?.name) {
    return maybeTest.project.name
  }

  const fromParent = maybeTest.parent?.project?.()
  if (fromParent?.name) {
    return fromParent.name
  }

  return "default"
}

export default class PlaywrightDetailedReporter implements Reporter {
  private readonly outputDir: string
  private readonly startedAt = new Date()
  private totalTests = 0
  private readonly tests: PlaywrightTestSummary[] = []

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = options.outputDir ?? process.env.PLAYWRIGHT_REPORT_DIR ?? DEFAULT_OUTPUT_DIR
  }

  onBegin(_config: FullConfig, suite: Suite) {
    this.totalTests = suite.allTests().length
    console.log(`[${new Date().toISOString()}] [PLAYWRIGHT] Run start: ${this.totalTests} tests`)
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const attachments = result.attachments.map((attachment) => {
      const isText =
        attachment.contentType.startsWith("text/") ||
        attachment.contentType === "application/json"
      return {
        name: attachment.name,
        contentType: attachment.contentType,
        path: attachment.path,
        body:
          !attachment.path && attachment.body && isText
            ? (attachment.body as Buffer).toString("utf8")
            : undefined,
      }
    })

    const summary: PlaywrightTestSummary = {
      title: test.titlePath().join(" "),
      file: test.location?.file ?? null,
      project: getProjectName(test),
      status: result.status,
      durationMs: result.duration,
      steps: serializeSteps((result as unknown as { steps?: ReporterStepLike[] }).steps),
      attachments,
      errors: result.errors.map((error) => ({
        message: error.message ?? "Unknown error",
        stack: error.stack,
      })),
      stderr: serializeOutput(result.stderr),
      stdout: serializeOutput(result.stdout),
    }

    this.tests.push(summary)

    const durationText = `${result.duration}ms`
    console.log(
      `[${new Date().toISOString()}] [PLAYWRIGHT] ${summary.title} - ${result.status.toUpperCase()} (${durationText})`,
    )

    const media = attachments.filter((attachment) => attachment.path)
    media.forEach((attachment) => {
      console.log(
        `[${new Date().toISOString()}] [PLAYWRIGHT] attachment: ${attachment.name} (${attachment.contentType}) -> ${attachment.path}`,
      )
    })

    const isFailed = result.status === "failed" || result.status === "timedOut"
    if (isFailed) {
      const stderrLines = serializeOutput(result.stderr).flatMap((c) => c.split("\n")).filter(Boolean)
      const stdoutLines = serializeOutput(result.stdout).flatMap((c) => c.split("\n")).filter(Boolean)
      const serverLines = [...stderrLines, ...stdoutLines]
      serverLines.forEach((line) => {
        if (line.toLowerCase().includes("error") || line.toLowerCase().includes("warn")) {
          console.log(`[${new Date().toISOString()}] [PLAYWRIGHT] server: ${line.trim()}`)
        }
      })
    }
  }

  onEnd(result: FullResult) {
    const finishedAt = new Date()
    const passed = this.tests.filter((test) => test.status === "passed").length
    const failed = this.tests.filter((test) => test.status === "failed" || test.status === "timedOut").length
    const skipped = this.tests.filter((test) => test.status === "skipped").length

    const summary: PlaywrightRunSummary = {
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - this.startedAt.getTime(),
      status: result.status,
      total: this.totalTests,
      passed,
      failed,
      skipped,
      tests: this.tests,
    }

    mkdirSync(this.outputDir, { recursive: true })
    const jsonPath = path.join(this.outputDir, "report.json")
    const textPath = path.join(this.outputDir, "report.txt")

    writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8")
    writeFileSync(textPath, this.formatText(summary), "utf8")

    console.log(`[${new Date().toISOString()}] [PLAYWRIGHT] Run end: ${result.status}`)
  }

  private formatText(summary: PlaywrightRunSummary): string {
    const lines: string[] = []
    lines.push(`Run started: ${summary.startedAt}`)
    lines.push(`Run finished: ${summary.finishedAt}`)
    lines.push(`Duration: ${summary.durationMs}ms`)
    lines.push(`Status: ${summary.status}`)
    lines.push(`Totals: passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped}`)
    lines.push("")

    const failedTests = summary.tests.filter(
      (t) => t.status === "failed" || t.status === "timedOut",
    )
    if (failedTests.length > 0) {
      lines.push("=== FAILURES ===")
      failedTests.forEach((test) => {
        this.appendTestDetail(lines, test, /* failuresSection */ true)
      })
      lines.push("")
    }

    lines.push("=== ALL TESTS ===")
    summary.tests.forEach((test) => {
      this.appendTestDetail(lines, test, /* failuresSection */ false)
    })

    return `${lines.join("\n")}\n`
  }

  private appendTestDetail(
    lines: string[],
    test: PlaywrightTestSummary,
    failuresSection: boolean,
  ): void {
    const isFailed = test.status === "failed" || test.status === "timedOut"
    lines.push(`[${test.status}] ${test.title} (${test.durationMs}ms)`)

    if (test.steps.length > 0) {
      this.appendStepLines(lines, test.steps, 1)
    }

    // Errors
    if (test.errors && test.errors.length > 0) {
      test.errors.forEach((error) => {
        lines.push(`  error: ${error.message}`)
        if (error.stack) {
          // First stack line only to keep output compact
          const firstStackLine = error.stack.split("\n").find((l) => l.trim().startsWith("at "))
          if (firstStackLine) {
            lines.push(`    ${firstStackLine.trim()}`)
          }
        }
      })
    }

    // Artifacts — always show for failures, collapse for passes
    const mediaAttachments = test.attachments.filter((a) => a.path)
    const bodyAttachments = test.attachments.filter((a) => !a.path)
    if (mediaAttachments.length > 0) {
      lines.push("  artifacts:")
      mediaAttachments.forEach((attachment) => {
        lines.push(`    [${attachment.name}] (${attachment.contentType}) -> ${attachment.path}`)
      })
    }
    if (bodyAttachments.length > 0 && (isFailed || failuresSection)) {
      bodyAttachments.forEach((attachment) => {
        if (attachment.body) {
          const bodyLines = attachment.body.split("\n").filter(Boolean)
          lines.push(`  [${attachment.name}] (${bodyLines.length} lines):`)
          const limit = 100
          bodyLines.slice(0, limit).forEach((l) => lines.push(`    ${l}`))
          if (bodyLines.length > limit) {
            lines.push(`    ... (${bodyLines.length - limit} more lines)`)
          }
        } else {
          lines.push(`  [${attachment.name}] (${attachment.contentType}) <inline binary body>`)
        }
      })
    }

    // App-server stderr + stdout for failing tests (first 30 lines combined)
    if (isFailed) {
      const stderrLines = (test.stderr ?? []).flatMap((chunk) => chunk.split("\n")).filter(Boolean)
      const stdoutLines = (test.stdout ?? []).flatMap((chunk) => chunk.split("\n")).filter(Boolean)
      if (stderrLines.length > 0) {
        lines.push("  server-stderr:")
        stderrLines.slice(0, 30).forEach((l) => lines.push(`    ${l}`))
        if (stderrLines.length > 30) {
          lines.push(`    ... (${stderrLines.length - 30} more lines)`)
        }
      }
      if (stdoutLines.length > 0) {
        lines.push("  server-stdout:")
        stdoutLines.slice(0, 30).forEach((l) => lines.push(`    ${l}`))
        if (stdoutLines.length > 30) {
          lines.push(`    ... (${stdoutLines.length - 30} more lines)`)
        }
      }
    }
  }

  private appendStepLines(lines: string[], steps: PlaywrightStepSummary[], depth: number) {
    const indent = "  ".repeat(depth)

    steps.forEach((step) => {
      const category = step.category ? ` [${step.category}]` : ""
      const error = step.error ? ` ERROR: ${step.error}` : ""
      lines.push(`${indent}- ${step.title}${category} (${step.durationMs}ms)${error}`)

      if (step.steps.length > 0) {
        this.appendStepLines(lines, step.steps, depth + 1)
      }
    })
  }
}
