import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

export type LogCategory = "TEST" | "STEP" | "HTTP" | "DB" | "ASSERT" | "INFO" | "ERROR"
export type LogStatus = "START" | "PASS" | "FAIL" | "END"

export interface LogEntry {
  timestamp: string
  category: LogCategory
  message: string
  status?: LogStatus
  durationMs?: number
  data?: Record<string, unknown>
}

export interface StepLog {
  name: string
  status: "pass" | "fail"
  startedAt: string
  durationMs: number
  error?: unknown
}

interface TestLoggerOptions {
  outputDir?: string
  maxDataLength?: number
}

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "test-results", "logs")
const DEFAULT_MAX_DATA_LENGTH = 5_000

function sanitizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80)
}

function safeStringify(value: unknown, maxLength: number): string {
  try {
    const json = JSON.stringify(value, null, 2)
    if (json.length <= maxLength) return json
    return `${json.slice(0, maxLength)}…`
  } catch {
    return "[unserializable]"
  }
}

export class TestLogger {
  private readonly testName: string
  private readonly startedAt: string
  private readonly outputDir: string
  private readonly maxDataLength: number
  private readonly entries: LogEntry[] = []
  private readonly steps: StepLog[] = []
  private finished = false
  private readonly reportId: string

  constructor(testName: string, options: TestLoggerOptions = {}) {
    this.testName = testName
    this.startedAt = new Date().toISOString()
    this.outputDir = options.outputDir ?? process.env.TEST_LOG_DIR ?? DEFAULT_OUTPUT_DIR
    this.maxDataLength = options.maxDataLength ?? DEFAULT_MAX_DATA_LENGTH
    this.reportId = `${sanitizeName(testName) || "test"}-${randomUUID()}`

    this.log("TEST", "TEST START", { testName })
  }

  async step<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now()
    this.log("STEP", name, { status: "START" })

    try {
      const result = await fn()
      const durationMs = Date.now() - start
      this.steps.push({
        name,
        status: "pass",
        startedAt: new Date(start).toISOString(),
        durationMs,
      })
      this.log("STEP", name, { status: "PASS", durationMs })
      return result
    } catch (error) {
      const durationMs = Date.now() - start
      this.steps.push({
        name,
        status: "fail",
        startedAt: new Date(start).toISOString(),
        durationMs,
        error,
      })
      this.log("STEP", name, { status: "FAIL", durationMs, error })
      throw error
    }
  }

  logRequest(method: string, url: string, body?: unknown, headers?: Record<string, string>) {
    this.log("HTTP", `${method.toUpperCase()} ${url}`, {
      body,
      headers,
    })
  }

  logResponse(status: number, body: unknown, headers?: Record<string, string>) {
    this.log("HTTP", `${status}`, {
      body,
      headers,
    })
  }

  logDatabaseState(table: string, rows: unknown[]) {
    this.log("DB", `Snapshot ${table}`, {
      rowCount: rows.length,
      rows: rows.slice(0, 10),
    })
  }

  logAssertion(expected: unknown, actual: unknown, pass?: boolean, message?: string) {
    const ok = pass ?? Object.is(expected, actual)
    this.log("ASSERT", message ?? "assertion", {
      expected,
      actual,
      pass: ok,
    })
  }

  logInfo(message: string, data?: Record<string, unknown>) {
    this.log("INFO", message, data)
  }

  logError(message: string, error?: unknown) {
    this.log("ERROR", message, { error })
  }

  finish() {
    if (this.finished) return
    this.finished = true

    const passedSteps = this.steps.filter((step) => step.status === "pass").length
    this.log("TEST", "TEST END", {
      totalSteps: this.steps.length,
      passedSteps,
    })

    void this.writeReport()
  }

  private log(category: LogCategory, message: string, extras?: { status?: LogStatus; durationMs?: number; error?: unknown; [key: string]: unknown }) {
    const timestamp = new Date().toISOString()
    const { status, durationMs, error, ...data } = extras ?? {}

    const entry: LogEntry = {
      timestamp,
      category,
      message,
      status,
      durationMs,
      data: Object.keys(data).length ? data : undefined,
    }

    if (error) {
      entry.data = {
        ...entry.data,
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      }
    }

    this.entries.push(entry)
  }

  private async writeReport() {
    const outputDir = this.outputDir
    await mkdir(outputDir, { recursive: true })

    const report = {
      id: this.reportId,
      testName: this.testName,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      steps: this.steps,
      entries: this.entries,
    }

    const jsonPath = path.join(outputDir, `${this.reportId}.json`)
    const logPath = path.join(outputDir, `${this.reportId}.log`)

    await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8")
    await writeFile(logPath, this.formatLogLines(), "utf8")

    if (typeof globalThis !== "undefined") {
      const bucket = (globalThis as { __TEST_LOG_FILES__?: Array<{ testName: string; jsonPath: string; logPath: string }> })
      if (!bucket.__TEST_LOG_FILES__) {
        bucket.__TEST_LOG_FILES__ = []
      }
      bucket.__TEST_LOG_FILES__.push({ testName: this.testName, jsonPath, logPath })
    }
  }

  private formatLogLines(): string {
    const lines = this.entries.map((entry) => {
      const prefix = `[${entry.timestamp}] [${entry.category}]`

      if (entry.category === "STEP" && entry.status) {
        const duration = entry.durationMs ? ` (${entry.durationMs}ms)` : ""
        return `${prefix} ${entry.message} - ${entry.status}${duration}`
      }

      if (entry.category === "HTTP") {
        const payload = entry.data
          ? safeStringify(entry.data, this.maxDataLength)
          : ""
        return payload ? `${prefix} ${entry.message} ${payload}` : `${prefix} ${entry.message}`
      }

      if (entry.category === "DB") {
        const payload = entry.data
          ? safeStringify(entry.data, this.maxDataLength)
          : ""
        return `${prefix} ${entry.message} ${payload}`
      }

      if (entry.category === "ASSERT") {
        const payload = entry.data
          ? safeStringify(entry.data, this.maxDataLength)
          : ""
        return `${prefix} ${entry.message} ${payload}`
      }

      if (entry.status) {
        return `${prefix} ${entry.message} - ${entry.status}`
      }

      return `${prefix} ${entry.message}`
    })

    return lines.join("\n") + "\n"
  }
}
