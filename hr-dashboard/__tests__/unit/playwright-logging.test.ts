import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import PlaywrightDetailedReporter from "@/test/playwright-reporter"
import { createE2ELogger, createLoggedPage, setupNetworkLogging } from "../e2e/utils/logger"

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

    expect(textReport).toContain("[passed] chromium invite shows missing token (321ms)")
    expect(textReport).toContain("- navigate to /set-password [test.step] (120ms)")
    expect(textReport).toContain("- fill label=Password [test.step] (40ms)")
    expect(jsonReport.tests[0]?.steps[0]?.title).toBe("navigate to /set-password")
    expect(jsonReport.tests[0]?.steps[0]?.steps[0]?.title).toBe("fill label=Password")
  })
})
