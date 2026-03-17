import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import PlaywrightDetailedReporter from "@/test/playwright-reporter"
import { createE2ELogger, createLoggedPage, setupConsoleCapture, setupNetworkLogging } from "../e2e/utils/logger"

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

describe("createLoggedPage", () => {
  it("logs page actions and preserves locator identity for assertions", async () => {
    const logger = createE2ELogger("playwright logging test")
    const infoSpy = vi.spyOn(logger, "info")
    const stepSpy = vi.spyOn(logger, "step")
    const fillSpy = vi.fn().mockResolvedValue(undefined)
    const clickSpy = vi.fn().mockResolvedValue(undefined)

    const locator = {
      fill: fillSpy,
      click: clickSpy,
      locator: vi.fn(),
      filter: vi.fn(),
    }
    locator.locator.mockReturnValue(locator)
    locator.filter.mockReturnValue(locator)

    const rawPage = {
      goto: vi.fn().mockResolvedValue(undefined),
      getByText: vi.fn().mockReturnValue(locator),
    }

    const page = createLoggedPage(rawPage as never, logger)
    const found = page.getByText("Missing Token")

    expect(found).toBe(locator)

    await page.goto("/set-password", { waitUntil: "domcontentloaded" })
    await found.fill("visible text")

    expect(rawPage.goto).toHaveBeenCalledWith("/set-password", { waitUntil: "domcontentloaded" })
    expect(fillSpy.mock.calls).toEqual([["visible text"]])
    expect(stepSpy).toHaveBeenCalledTimes(2)
    expect(infoSpy).toHaveBeenCalledWith("navigate to /set-password", { target: "/set-password" })
    expect(infoSpy).toHaveBeenCalledWith("fill text=Missing Token", {
      redacted: true,
      valueLength: 12,
    })
  })

  it("redacts sensitive locator input values", async () => {
    const logger = createE2ELogger("redaction test")
    const infoSpy = vi.spyOn(logger, "info")

    const passwordLocator = {
      fill: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn(),
      filter: vi.fn(),
    }
    passwordLocator.locator.mockReturnValue(passwordLocator)
    passwordLocator.filter.mockReturnValue(passwordLocator)

    const rawPage = {
      getByLabel: vi.fn().mockReturnValue(passwordLocator),
    }

    const page = createLoggedPage(rawPage as never, logger)
    await page.getByLabel("Password").fill("SuperSecret123!")

    expect(infoSpy).toHaveBeenCalledWith("fill label=Password", {
      redacted: true,
      valueLength: 15,
    })
  })
})

describe("setupNetworkLogging", () => {
  it("logs only API mutations, failures, and error responses", async () => {
    const logger = createE2ELogger("network logging test")
    const infoSpy = vi.spyOn(logger, "info")
    const networkSpy = vi.spyOn(logger, "network")
    const errorSpy = vi.spyOn(logger, "error")
    const handlers = new Map<string, (value: unknown) => void>()

    const page = {
      on: vi.fn((event: string, handler: (value: unknown) => void) => {
        handlers.set(event, handler)
      }),
    }

    setupNetworkLogging(page as never, logger)

    handlers.get("request")?.({
      method: () => "GET",
      url: () => "http://127.0.0.1:3000/api/jobs",
    })
    handlers.get("request")?.({
      method: () => "POST",
      url: () => "http://127.0.0.1:3000/api/jobs",
    })

    handlers.get("response")?.({
      request: () => ({
        method: () => "GET",
        timing: () => ({ responseEnd: 12 }),
      }),
      url: () => "http://127.0.0.1:3000/api/jobs",
      status: () => 200,
    })
    handlers.get("response")?.({
      request: () => ({
        method: () => "POST",
        timing: () => ({ responseEnd: 42 }),
      }),
      url: () => "http://127.0.0.1:3000/api/jobs",
      status: () => 201,
    })
    handlers.get("response")?.({
      request: () => ({
        method: () => "GET",
        timing: () => ({ responseEnd: 7 }),
      }),
      url: () => "http://127.0.0.1:3000/api/jobs",
      status: () => 500,
    })
    handlers.get("requestfailed")?.({
      method: () => "POST",
      url: () => "http://127.0.0.1:3000/api/jobs",
      failure: () => ({ errorText: "socket hang up" }),
    })

    expect(infoSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).toHaveBeenCalledWith("Request: POST http://127.0.0.1:3000/api/jobs")
    expect(networkSpy).toHaveBeenCalledTimes(2)
    expect(networkSpy).toHaveBeenCalledWith("POST", "http://127.0.0.1:3000/api/jobs", 201, 42)
    expect(networkSpy).toHaveBeenCalledWith("GET", "http://127.0.0.1:3000/api/jobs", 500, 7)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })
})

describe("setupConsoleCapture", () => {
  it("collects browser console messages and stores them for artifact retrieval", () => {
    const logger = createE2ELogger("console capture test")
    const handlers = new Map<string, (value: unknown) => void>()

    const page = {
      on: vi.fn((event: string, handler: (value: unknown) => void) => {
        handlers.set(event, handler)
      }),
    }

    setupConsoleCapture(page as never, logger)

    // Simulate a mix of console levels
    handlers.get("console")?.({
      type: () => "log",
      text: () => "debug info",
      location: () => ({ url: "http://localhost:3000/page.js", lineNumber: 10, columnNumber: 5 }),
    })
    handlers.get("console")?.({
      type: () => "error",
      text: () => "Something went wrong",
      location: () => ({ url: "http://localhost:3000/page.js", lineNumber: 42, columnNumber: 1 }),
    })
    handlers.get("pageerror")?.({ message: "Uncaught ReferenceError: foo is not defined" })

    const entries = logger.getConsoleEntries()
    expect(entries).toHaveLength(3)
    expect(entries[0]).toMatchObject({ type: "log", text: "debug info" })
    expect(entries[1]).toMatchObject({ type: "error", text: "Something went wrong" })
    expect(entries[2]).toMatchObject({ type: "pageerror", text: "Uncaught ReferenceError: foo is not defined" })
  })

  it("includes location in console text output when available", () => {
    const logger = createE2ELogger("console location test")
    const handlers = new Map<string, (value: unknown) => void>()

    const page = {
      on: vi.fn((event: string, handler: (value: unknown) => void) => {
        handlers.set(event, handler)
      }),
    }

    setupConsoleCapture(page as never, logger)

    handlers.get("console")?.({
      type: () => "warning",
      text: () => "Deprecated API",
      location: () => ({ url: "http://localhost:3000/app.js", lineNumber: 7, columnNumber: 3 }),
    })

    const consoleText = logger.getConsoleText()
    expect(consoleText).toContain("[WARNING]")
    expect(consoleText).toContain("Deprecated API")
    expect(consoleText).toContain("http://localhost:3000/app.js:7:3")
  })

  it("getFullLogText includes console section when messages exist", () => {
    const logger = createE2ELogger("full log test")
    const handlers = new Map<string, (value: unknown) => void>()

    const page = {
      on: vi.fn((event: string, handler: (value: unknown) => void) => {
        handlers.set(event, handler)
      }),
    }

    setupConsoleCapture(page as never, logger)

    handlers.get("console")?.({
      type: () => "error",
      text: () => "Critical failure",
      location: () => ({ url: "", lineNumber: 0, columnNumber: 0 }),
    })

    const fullLog = logger.getFullLogText()
    expect(fullLog).toContain("=== Execution Log: full log test ===")
    expect(fullLog).toContain("--- Event Log ---")
    expect(fullLog).toContain("--- Browser Console ---")
    expect(fullLog).toContain("Critical failure")
  })

  it("getFullLogText omits console section when no messages exist", () => {
    const logger = createE2ELogger("no console test")

    const fullLog = logger.getFullLogText()
    expect(fullLog).not.toContain("--- Browser Console ---")
  })
})

describe("PlaywrightDetailedReporter", () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it("writes nested step details into text and json reports", async () => {
    const outputDir = await makeTempDir("playwright-reporter-")
    tempDirs.push(outputDir)

    const reporter = new PlaywrightDetailedReporter({ outputDir })
    reporter.onBegin({} as never, { allTests: () => [1] } as never)
    reporter.onTestEnd(
      {
        titlePath: () => ["chromium", "invite", "shows missing token"],
        location: { file: "__tests__/e2e/invite-onboarding.spec.ts" },
      } as never,
      {
        status: "passed",
        duration: 321,
        attachments: [],
        errors: [],
        stderr: [],
        stdout: [],
        steps: [
          {
            title: "navigate to /set-password",
            category: "test.step",
            duration: 120,
            steps: [
              {
                title: "fill label=Password",
                category: "test.step",
                duration: 40,
                steps: [],
              },
            ],
          },
        ],
      } as never,
    )
    reporter.onEnd({ status: "passed" } as never)

    const textReport = await readFile(path.join(outputDir, "report.txt"), "utf8")
    const jsonReport = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8")) as {
      tests: Array<{ steps: Array<{ title: string; steps: Array<{ title: string }> }> }>
    }

    expect(
      textReport.includes("[passed] chromium invite shows missing token (321ms)") ||
        textReport.includes("[PASSED] chromium invite shows missing token (321ms)"),
    ).toBe(true)
    expect(textReport).toContain("- navigate to /set-password [test.step] (120ms)")
    expect(textReport).toContain("- fill label=Password [test.step] (40ms)")
    expect(jsonReport.tests[0]?.steps[0]?.title).toBe("navigate to /set-password")
    expect(jsonReport.tests[0]?.steps[0]?.steps[0]?.title).toBe("fill label=Password")
  })

  it("prominently surfaces artifact paths and server stderr for failing tests", async () => {
    const outputDir = await makeTempDir("playwright-reporter-fail-")
    tempDirs.push(outputDir)

    const reporter = new PlaywrightDetailedReporter({ outputDir })
    reporter.onBegin({} as never, { allTests: () => [1] } as never)
    reporter.onTestEnd(
      {
        titlePath: () => ["chromium", "auth", "rejects invalid token"],
        location: { file: "__tests__/e2e/auth.spec.ts" },
      } as never,
      {
        status: "failed",
        duration: 4200,
        attachments: [
          { name: "screenshot", contentType: "image/png", path: "/tmp/pw/test-results/auth-rejects-invalid-token/screenshot.png" },
          { name: "execution-log", contentType: "text/plain" },
        ],
        errors: [{ message: "expect(received).toBe(expected)\nExpected: 200\nReceived: 401", stack: "  at Object.<anonymous> (__tests__/e2e/auth.spec.ts:42:5)" }],
        stderr: ["[server] POST /api/auth 401 Unauthorized\n", "[server] invalid token format\n"],
        stdout: [],
        steps: [],
      } as never,
    )
    reporter.onEnd({ status: "failed" } as never)

    const textReport = await readFile(path.join(outputDir, "report.txt"), "utf8")

    // Failures section is present
    expect(textReport).toContain("=== FAILURES ===")
    // Artifact path surfaced for screenshot
    expect(textReport).toContain("screenshot.png")
    // Inline attachment name surfaced
    expect(textReport).toContain("execution-log")
    // Error message shown
    expect(textReport).toContain("expect(received).toBe(expected)")
    // Server stderr shown under failing test
    expect(textReport).toContain("server-stderr")
    expect(textReport).toContain("invalid token format")
  })
})
