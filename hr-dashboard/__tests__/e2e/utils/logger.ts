/**
 * E2E Test Logger
 *
 * Provides structured logging for Playwright E2E tests with
 * step tracking, screenshot capture, and detailed reporting.
 */

import { test as playwright, type Locator, type Page, type TestInfo } from "@playwright/test"

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

const PAGE_STEP_METHODS = new Set([
  "goto",
  "reload",
  "goBack",
  "goForward",
  "waitForURL",
  "waitForLoadState",
  "waitForSelector",
])

const PAGE_LOCATOR_FACTORIES = new Set([
  "locator",
  "getByRole",
  "getByText",
  "getByLabel",
  "getByPlaceholder",
  "getByTestId",
])

const LOCATOR_STEP_METHODS = new Set([
  "click",
  "dblclick",
  "fill",
  "press",
  "pressSequentially",
  "selectOption",
  "setInputFiles",
  "check",
  "uncheck",
  "hover",
  "focus",
  "clear",
])

function preview(value: unknown): string {
  if (value instanceof RegExp) {
    return value.toString()
  }

  if (typeof value === "string") {
    const compact = value.replace(/\s+/g, " ").trim()
    return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  if (value == null) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return "[unserializable]"
  }
}

function isSensitiveTarget(target: string): boolean {
  return /password|token|secret/i.test(target)
}

function summarizeValue(target: string, value: unknown): Record<string, unknown> {
  const stringValue = typeof value === "string" ? value : preview(value)

  if (isSensitiveTarget(target)) {
    return {
      redacted: true,
      valueLength: stringValue.length,
    }
  }

  return {
    value: stringValue.length > 120 ? `${stringValue.slice(0, 117)}...` : stringValue,
    valueLength: stringValue.length,
  }
}

function summarizeInputFiles(value: unknown): Record<string, unknown> {
  const files = Array.isArray(value) ? value : [value]

  return {
    files: files.map((file) => {
      if (typeof file === "string") {
        return file
      }

      if (file && typeof file === "object") {
        const maybeFile = file as {
          name?: string
          mimeType?: string
          buffer?: Buffer
        }

        return {
          name: maybeFile.name ?? "inline-file",
          mimeType: maybeFile.mimeType,
          sizeBytes: maybeFile.buffer?.length,
        }
      }

      return preview(file)
    }),
  }
}

function describeLocatorFactory(method: string, args: unknown[]): string {
  switch (method) {
    case "locator":
      return `locator(${preview(args[0])})`
    case "getByRole": {
      const role = preview(args[0])
      const options = args[1] as { name?: unknown } | undefined
      const name = options?.name ? ` name=${preview(options.name)}` : ""
      return `role=${role}${name}`
    }
    case "getByText":
      return `text=${preview(args[0])}`
    case "getByLabel":
      return `label=${preview(args[0])}`
    case "getByPlaceholder":
      return `placeholder=${preview(args[0])}`
    case "getByTestId":
      return `testId=${preview(args[0])}`
    default:
      return method
  }
}

function extendLocatorLabel(label: string, method: string, args: unknown[]): string {
  switch (method) {
    case "locator":
    case "getByRole":
    case "getByText":
    case "getByLabel":
    case "getByPlaceholder":
    case "getByTestId":
      return `${label} -> ${describeLocatorFactory(method, args)}`
    case "filter": {
      const options = args[0] as { hasText?: unknown; hasNotText?: unknown } | undefined
      const hasText = options?.hasText ? ` hasText=${preview(options.hasText)}` : ""
      const hasNotText = options?.hasNotText ? ` hasNotText=${preview(options.hasNotText)}` : ""
      return `${label}.filter(${`${hasText}${hasNotText}`.trim() || "..."})`
    }
    case "first":
    case "last":
      return `${label}.${method}()`
    case "nth":
      return `${label}.nth(${preview(args[0])})`
    case "or":
    case "and":
      return `${label}.${method}(locator)`
    default:
      return label
  }
}

function describePageStep(method: string, args: unknown[]): string {
  switch (method) {
    case "goto":
      return `navigate to ${preview(args[0])}`
    case "reload":
      return "reload page"
    case "goBack":
      return "navigate back"
    case "goForward":
      return "navigate forward"
    case "waitForURL":
      return `wait for URL ${preview(args[0])}`
    case "waitForLoadState":
      return `wait for load state ${preview(args[0] ?? "load")}`
    case "waitForSelector":
      return `wait for selector ${preview(args[0])}`
    default:
      return method
  }
}

function describeLocatorStep(label: string, method: string): string {
  switch (method) {
    case "click":
      return `click ${label}`
    case "dblclick":
      return `double click ${label}`
    case "fill":
      return `fill ${label}`
    case "press":
      return `press key in ${label}`
    case "pressSequentially":
      return `type into ${label}`
    case "selectOption":
      return `select option in ${label}`
    case "setInputFiles":
      return `attach file to ${label}`
    case "check":
      return `check ${label}`
    case "uncheck":
      return `uncheck ${label}`
    case "hover":
      return `hover ${label}`
    case "focus":
      return `focus ${label}`
    case "clear":
      return `clear ${label}`
    default:
      return `${method} ${label}`
  }
}

function extractPageStepData(method: string, args: unknown[]): Record<string, unknown> | undefined {
  switch (method) {
    case "goto":
    case "waitForURL":
      return { target: preview(args[0]) }
    case "waitForLoadState":
      return { state: preview(args[0] ?? "load") }
    case "waitForSelector":
      return { selector: preview(args[0]) }
    default:
      return undefined
  }
}

function extractLocatorStepData(
  label: string,
  method: string,
  args: unknown[],
): Record<string, unknown> | undefined {
  switch (method) {
    case "fill":
    case "pressSequentially":
      return summarizeValue(label, args[0])
    case "press":
      return { key: preview(args[0]) }
    case "selectOption":
      return { option: preview(args[0]) }
    case "setInputFiles":
      return summarizeInputFiles(args[0])
    default:
      return undefined
  }
}

function isLocatorLike(value: unknown): value is Locator {
  return Boolean(
    value &&
      typeof value === "object" &&
      "click" in value &&
      "locator" in value &&
      "filter" in value,
  )
}

async function runLoggedStep<T>(
  logger: E2ETestLogger,
  name: string,
  page: Page,
  action: () => Promise<T>,
  data?: Record<string, unknown>,
): Promise<T> {
  if (data && Object.keys(data).length > 0) {
    logger.info(name, data)
  }

  try {
    return await playwright.step(name, async () => logger.step(name, action, page))
  } catch (error) {
    if (error instanceof Error && error.message.includes("test.step() can only be called from a test")) {
      return logger.step(name, action, page)
    }

    throw error
  }
}

function createLoggedLocator(locator: Locator, logger: E2ETestLogger, page: Page, label: string): Locator {
  const target = locator as Locator & Record<string, unknown>

  for (const method of LOCATOR_STEP_METHODS) {
    const original = target[method]
    if (typeof original !== "function") {
      continue
    }

    Object.defineProperty(target, method, {
      configurable: true,
      value: (...args: unknown[]) =>
        runLoggedStep(
          logger,
          describeLocatorStep(label, method),
          page,
          () => (original as (...innerArgs: unknown[]) => Promise<unknown>).apply(locator, args),
          extractLocatorStepData(label, method, args),
        ),
    })
  }

  const chainMethods = [
    "locator",
    "getByRole",
    "getByText",
    "getByLabel",
    "getByPlaceholder",
    "getByTestId",
    "filter",
    "first",
    "last",
    "nth",
    "or",
    "and",
  ]

  for (const method of chainMethods) {
    const original = target[method]
    if (typeof original !== "function") {
      continue
    }

    Object.defineProperty(target, method, {
      configurable: true,
      value: (...args: unknown[]) => {
        const result = (original as (...innerArgs: unknown[]) => unknown).apply(locator, args)
        if (isLocatorLike(result)) {
          return createLoggedLocator(result, logger, page, extendLocatorLabel(label, method, args))
        }
        return result
      },
    })
  }

  return locator
}

export function createLoggedPage(page: Page, logger: E2ETestLogger): Page {
  return new Proxy(page, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)

      if (typeof prop !== "string" || typeof value !== "function") {
        return value
      }

      if (PAGE_STEP_METHODS.has(prop)) {
        return (...args: unknown[]) =>
          runLoggedStep(
            logger,
            describePageStep(prop, args),
            page,
            () => value.apply(target, args) as Promise<unknown>,
            extractPageStepData(prop, args),
          )
      }

      if (PAGE_LOCATOR_FACTORIES.has(prop)) {
        return (...args: unknown[]) => {
          const result = value.apply(target, args)
          if (isLocatorLike(result)) {
            return createLoggedLocator(result, logger, page, describeLocatorFactory(prop, args))
          }
          return result
        }
      }

      return (...args: unknown[]) => value.apply(target, args)
    },
  }) as Page
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
  const shouldLogRequest = (method: string, url: string) =>
    url.includes("/api/") && method !== "GET"

  const shouldLogResponse = (method: string, url: string, status: number) =>
    status >= 400 || (url.includes("/api/") && method !== "GET")

  page.on("request", (request) => {
    if (!shouldLogRequest(request.method(), request.url())) {
      return
    }

    logger.info(`Request: ${request.method()} ${request.url()}`)
  })

  page.on("response", (response) => {
    const method = response.request().method()
    const url = response.url()
    const status = response.status()

    if (!shouldLogResponse(method, url, status)) {
      return
    }

    const durationMs = response.request().timing().responseEnd
    logger.network(
      method,
      url,
      status,
      Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : undefined,
    )
  })

  page.on("requestfailed", (request) => {
    logger.error(`Request failed: ${request.method()} ${request.url()}`, {
      failure: request.failure()?.errorText,
    } as unknown as Error)
  })
}
