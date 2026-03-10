/**
 * E2E Test Logger
 *
 * Provides structured logging for Playwright E2E tests with
 * step tracking, screenshot capture, and detailed reporting.
 */

import type { Page, TestInfo } from "@playwright/test"

export interface E2ELogEntry {
  timestamp: string
  level: "INFO" | "STEP" | "ASSERT" | "ERROR" | "SCREENSHOT" | "NETWORK"
  message: string
  data?: Record<string, unknown>
}

export interface E2EStepResult {
  name: string
  status: "pass" | "fail"
  durationMs: number
  error?: string
  screenshotPath?: string
}

export class E2ETestLogger {
  private readonly testName: string
  private readonly testInfo: TestInfo | null
  private readonly startTime: number
  private readonly entries: E2ELogEntry[] = []
  private readonly steps: E2EStepResult[] = []

  constructor(testName: string, testInfo?: TestInfo) {
    this.testName = testName
    this.testInfo = testInfo ?? null
    this.startTime = Date.now()
    this.log("INFO", `Test started: ${testName}`)
  }

  private log(level: E2ELogEntry["level"], message: string, data?: Record<string, unknown>): void {
    const entry: E2ELogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    }
    this.entries.push(entry)

    // Console output with color coding
    const prefix = `[${entry.timestamp}] [${level}]`
    const dataStr = data ? ` ${JSON.stringify(data)}` : ""
    console.log(`${prefix} ${message}${dataStr}`)
  }

  /**
   * Execute a test step with timing and error handling
   */
  async step<T>(name: string, fn: () => Promise<T>, page?: Page): Promise<T> {
    const start = Date.now()
    this.log("STEP", `${name} - START`)

    try {
      const result = await fn()
      const durationMs = Date.now() - start
      this.log("STEP", `${name} - PASS`, { durationMs })
      this.steps.push({ name, status: "pass", durationMs })
      return result
    } catch (error) {
      const durationMs = Date.now() - start
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log("STEP", `${name} - FAIL`, { durationMs, error: errorMessage })

      // Capture screenshot on failure if page is available
      let screenshotPath: string | undefined
      if (page && this.testInfo) {
        try {
          screenshotPath = await this.captureScreenshot(page, `${name}-failure`)
        } catch {
          // Ignore screenshot errors
        }
      }

      this.steps.push({
        name,
        status: "fail",
        durationMs,
        error: errorMessage,
        screenshotPath,
      })
      throw error
    }
  }

  /**
   * Log an assertion
   */
  assert(description: string, passed: boolean, expected?: unknown, actual?: unknown): void {
    this.log("ASSERT", `${description} - ${passed ? "PASS" : "FAIL"}`, {
      passed,
      expected,
      actual,
    })
  }

  /**
   * Log a network request/response
   */
  network(method: string, url: string, status?: number, durationMs?: number): void {
    this.log("NETWORK", `${method} ${url}`, { status, durationMs })
  }

  /**
   * Log general info
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log("INFO", message, data)
  }

  /**
   * Log an error
   */
  error(message: string, error?: Error | unknown): void {
    const errorData: Record<string, unknown> = {}
    if (error instanceof Error) {
      errorData.message = error.message
      errorData.stack = error.stack
    } else if (error) {
      errorData.error = error
    }
    this.log("ERROR", message, errorData)
  }

  /**
   * Capture and log a screenshot
   */
  async captureScreenshot(page: Page, name: string): Promise<string> {
    const timestamp = Date.now()
    const filename = `${name.replace(/[^a-z0-9]/gi, "-")}-${timestamp}.png`

    if (this.testInfo) {
      const path = this.testInfo.outputPath(filename)
      await page.screenshot({ path, fullPage: true })
      this.log("SCREENSHOT", `Captured: ${filename}`, { path })
      return path
    }

    // Fallback if no testInfo
    const buffer = await page.screenshot({ fullPage: true })
    this.log("SCREENSHOT", `Captured in memory: ${filename}`, { size: buffer.length })
    return filename
  }

  /**
   * Get test summary
   */
  getSummary(): {
    testName: string
    durationMs: number
    passed: boolean
    steps: E2EStepResult[]
    entries: E2ELogEntry[]
  } {
    const failedSteps = this.steps.filter((s) => s.status === "fail")
    return {
      testName: this.testName,
      durationMs: Date.now() - this.startTime,
      passed: failedSteps.length === 0,
      steps: this.steps,
      entries: this.entries,
    }
  }

  /**
   * Finish logging and return summary
   */
  finish(): void {
    const summary = this.getSummary()
    const status = summary.passed ? "PASS" : "FAIL"
    this.log("INFO", `Test finished: ${this.testName} - ${status}`, {
      durationMs: summary.durationMs,
      stepsPassed: this.steps.filter((s) => s.status === "pass").length,
      stepsFailed: this.steps.filter((s) => s.status === "fail").length,
    })
  }
}

/**
 * Create an E2E test logger
 */
export function createE2ELogger(testName: string, testInfo?: TestInfo): E2ETestLogger {
  return new E2ETestLogger(testName, testInfo)
}

/**
 * Setup network logging for a page
 */
export function setupNetworkLogging(page: Page, logger: E2ETestLogger): void {
  page.on("request", (request) => {
    logger.info(`Request: ${request.method()} ${request.url()}`)
  })

  page.on("response", (response) => {
    logger.network(
      response.request().method(),
      response.url(),
      response.status(),
      response.request().timing().responseEnd,
    )
  })

  page.on("requestfailed", (request) => {
    logger.error(`Request failed: ${request.method()} ${request.url()}`, {
      failure: request.failure()?.errorText,
    } as unknown as Error)
  })
}
