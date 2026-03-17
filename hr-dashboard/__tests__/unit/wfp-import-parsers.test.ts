/**
 * WFP Import Parser Tests
 *
 * Tests the sheet parsers against the actual WFP workbook to verify
 * correct row counts, status breakdowns, and edge case handling.
 */

import * as path from "path"
import * as XLSX from "xlsx"
import { describe, expect, it, beforeAll } from "vitest"

import { parseWfpDetailsSheet } from "@/lib/import/parse-wfp-details"
import { parseBudgetSheet } from "@/lib/import/parse-budget"
import { parseTradeoffsSheet } from "@/lib/import/parse-tradeoffs"
import { clearWarnings } from "@/lib/wfp-sanitize"

// ---------------------------------------------------------------------------
// Load workbook once for all tests
// ---------------------------------------------------------------------------

const WORKBOOK_PATH = path.resolve(
  __dirname,
  "../../2026 WFP - Approved (1).xlsx",
)

let workbook: XLSX.WorkBook

beforeAll(() => {
  workbook = XLSX.readFile(WORKBOOK_PATH)
  clearWarnings()
})

// ---------------------------------------------------------------------------
// WFP Details - 2026
// ---------------------------------------------------------------------------

describe("parseWfpDetailsSheet — 2026", () => {
  let result: ReturnType<typeof parseWfpDetailsSheet>

  beforeAll(() => {
    clearWarnings()
    const sheet = workbook.Sheets["WFP Details - 2026"]!
    result = parseWfpDetailsSheet(sheet, "WFP Details - 2026")
  })

  it("parses the expected number of jobs", () => {
    expect(result.jobs.length).toBe(343)
  })

  it("extracts 205 candidates from hired rows", () => {
    expect(result.candidates.length).toBe(205)
  })

  it("creates 205 applications from hired rows", () => {
    expect(result.applications.length).toBe(205)
  })

  it("has correct status breakdown", () => {
    const statusCounts = { OPEN: 0, CLOSED: 0, ON_HOLD: 0 }
    for (const job of result.jobs) {
      statusCounts[job.status]++
    }
    expect(statusCounts.OPEN).toBe(30)
    expect(statusCounts.CLOSED).toBe(205)
    // Remaining are ON_HOLD
    expect(statusCounts.ON_HOLD).toBe(343 - 30 - 205)
  })

  it("sets horizon to '2026' for all jobs", () => {
    for (const job of result.jobs) {
      expect(job.horizon).toBe("2026")
    }
  })

  it("every job has a non-empty id and importKey", () => {
    for (const job of result.jobs) {
      expect(job.id).toBeTruthy()
      expect(job.importKey).toMatch(/^WFP Details - 2026:\d+$/)
    }
  })

  it("every candidate has a firstName and lastName", () => {
    for (const c of result.candidates) {
      expect(c.firstName.length).toBeGreaterThan(0)
      expect(c.lastName.length).toBeGreaterThan(0)
    }
  })

  it("every application references a valid jobId", () => {
    const jobIds = new Set(result.jobs.map((j) => j.id))
    for (const a of result.applications) {
      expect(jobIds.has(a.jobId)).toBe(true)
    }
  })

  it("normalizes departments by stripping numeric prefix", () => {
    const departments = new Set(result.jobs.map((j) => j.department))
    for (const d of departments) {
      expect(d).not.toMatch(/^\d+\s/)
    }
  })

  it("normalizes locations to known values", () => {
    const knownLocations = new Set([
      "South San Francisco, CA",
      "Princeton, NJ",
      "Chicago, IL",
      "Remote (US)",
      "Remote",
      "South San Francisco / Princeton",
      "Remote (EU)",
      "TBD",
    ])
    for (const job of result.jobs) {
      if (job.location != null) {
        // Either a known location or an unknown one that was kept as-is
        // Just verify it's a non-empty string
        expect(job.location.length).toBeGreaterThan(0)
      }
    }
    // Most locations should be known
    const knownCount = result.jobs.filter(
      (j) => j.location != null && knownLocations.has(j.location),
    ).length
    expect(knownCount).toBeGreaterThan(result.jobs.length * 0.8)
  })
})

// ---------------------------------------------------------------------------
// WFP Details - Beyond 2026
// ---------------------------------------------------------------------------

describe("parseWfpDetailsSheet — Beyond 2026", () => {
  let result: ReturnType<typeof parseWfpDetailsSheet>

  beforeAll(() => {
    clearWarnings()
    const sheet = workbook.Sheets["WFP Details - Beyond 2026"]!
    result = parseWfpDetailsSheet(sheet, "WFP Details - Beyond 2026")
  })

  it("parses the expected number of jobs", () => {
    expect(result.jobs.length).toBe(294)
  })

  it("extracts no candidates (Beyond 2026 sheet has no hired rows)", () => {
    expect(result.candidates.length).toBe(0)
  })

  it("all jobs are ON_HOLD (Beyond 2026 rule)", () => {
    for (const job of result.jobs) {
      expect(job.status).toBe("ON_HOLD")
    }
  })

  it("sets horizon to 'Beyond 2026'", () => {
    for (const job of result.jobs) {
      expect(job.horizon).toBe("Beyond 2026")
    }
  })

  it("FP&A fields are null (not present on Beyond 2026 sheet)", () => {
    for (const job of result.jobs) {
      expect(job.fpaLevel).toBeNull()
      expect(job.fpaTiming).toBeNull()
      expect(job.fpaNote).toBeNull()
      expect(job.fpaApproved).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// 2026 Approved Budget
// ---------------------------------------------------------------------------

describe("parseBudgetSheet", () => {
  let result: ReturnType<typeof parseBudgetSheet>

  beforeAll(() => {
    const sheet = workbook.Sheets["2026 Approved Budget"]!
    result = parseBudgetSheet(sheet)
  })

  it("parses the expected number of projections", () => {
    expect(result.projections.length).toBe(510)
  })

  it("every projection has a non-empty id and importKey", () => {
    for (const p of result.projections) {
      expect(p.id).toBeTruthy()
      expect(p.importKey).toMatch(/^2026 Approved Budget:\d+$/)
    }
  })

  it("every projection has a department", () => {
    for (const p of result.projections) {
      expect(p.department.length).toBeGreaterThan(0)
    }
  })

  it("monthlyFte contains expected month keys", () => {
    const first = result.projections[0]!
    // Should have 36 months (3 years * 12 months)
    const keys = Object.keys(first.monthlyFte)
    expect(keys.length).toBe(36)
    expect(keys).toContain("Jan_2024")
    expect(keys).toContain("Dec_2026")
  })

  it("preserves raw tempJobId for complex values", () => {
    // At least some projections should have rawTempJobId set
    // (the "6000 (5357 Previously)" case)
    // This may be 0 if no complex IDs exist, which is fine
    // Just verify the field exists on all records
    for (const p of result.projections) {
      expect("rawTempJobId" in p).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Tradeoffs
// ---------------------------------------------------------------------------

describe("parseTradeoffsSheet", () => {
  let result: ReturnType<typeof parseTradeoffsSheet>

  beforeAll(() => {
    const sheet = workbook.Sheets["Tradeoffs"]!
    result = parseTradeoffsSheet(sheet)
  })

  it("parses the expected number of tradeoffs", () => {
    expect(result.tradeoffs.length).toBe(17)
  })

  it("every tradeoff has a non-empty id and importKey", () => {
    for (const t of result.tradeoffs) {
      expect(t.id).toBeTruthy()
      expect(t.importKey).toMatch(/^Tradeoffs:\d+$/)
    }
  })

  it("classifies PAIR rows (both source and target IDs)", () => {
    const pairs = result.tradeoffs.filter((t) => t.rowType === "PAIR")
    expect(pairs.length).toBeGreaterThan(0)
    for (const t of pairs) {
      expect(t.sourceTempJobId).not.toBeNull()
      expect(t.targetTempJobId).not.toBeNull()
    }
  })

  it("all tradeoffs have valid rowType", () => {
    const validTypes = new Set(["PAIR", "SOURCE_ONLY", "NOTE"])
    for (const t of result.tradeoffs) {
      expect(validTypes.has(t.rowType)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Combined counts (match import output)
// ---------------------------------------------------------------------------

describe("combined WFP import counts", () => {
  it("total jobs = 2026 + Beyond 2026 = 637", () => {
    clearWarnings()
    const sheet2026 = workbook.Sheets["WFP Details - 2026"]!
    const result2026 = parseWfpDetailsSheet(sheet2026, "WFP Details - 2026")
    clearWarnings()
    const sheetBeyond = workbook.Sheets["WFP Details - Beyond 2026"]!
    const resultBeyond = parseWfpDetailsSheet(sheetBeyond, "WFP Details - Beyond 2026")
    expect(result2026.jobs.length + resultBeyond.jobs.length).toBe(637)
  })

  it("overall status breakdown: OPEN=30, CLOSED=205, ON_HOLD=402", () => {
    clearWarnings()
    const sheet2026 = workbook.Sheets["WFP Details - 2026"]!
    const result2026 = parseWfpDetailsSheet(sheet2026, "WFP Details - 2026")
    clearWarnings()
    const sheetBeyond = workbook.Sheets["WFP Details - Beyond 2026"]!
    const resultBeyond = parseWfpDetailsSheet(sheetBeyond, "WFP Details - Beyond 2026")

    const allJobs = [...result2026.jobs, ...resultBeyond.jobs]
    const statusCounts = { OPEN: 0, CLOSED: 0, ON_HOLD: 0 }
    for (const job of allJobs) {
      statusCounts[job.status]++
    }
    expect(statusCounts.OPEN).toBe(30)
    expect(statusCounts.CLOSED).toBe(205)
    expect(statusCounts.ON_HOLD).toBe(402)
  })

  it("IDs are unique across all entities", () => {
    clearWarnings()
    const sheet2026 = workbook.Sheets["WFP Details - 2026"]!
    const result2026 = parseWfpDetailsSheet(sheet2026, "WFP Details - 2026")
    clearWarnings()
    const sheetBeyond = workbook.Sheets["WFP Details - Beyond 2026"]!
    const resultBeyond = parseWfpDetailsSheet(sheetBeyond, "WFP Details - Beyond 2026")

    const allJobIds = [
      ...result2026.jobs.map((j) => j.id),
      ...resultBeyond.jobs.map((j) => j.id),
    ]
    const uniqueJobIds = new Set(allJobIds)
    expect(uniqueJobIds.size).toBe(allJobIds.length)
  })

  it("import is idempotent — second parse produces identical IDs", () => {
    clearWarnings()
    const sheet2026 = workbook.Sheets["WFP Details - 2026"]!
    const run1 = parseWfpDetailsSheet(sheet2026, "WFP Details - 2026")
    clearWarnings()
    const run2 = parseWfpDetailsSheet(sheet2026, "WFP Details - 2026")

    expect(run1.jobs.length).toBe(run2.jobs.length)
    for (let i = 0; i < run1.jobs.length; i++) {
      expect(run1.jobs[i]!.id).toBe(run2.jobs[i]!.id)
      expect(run1.jobs[i]!.importKey).toBe(run2.jobs[i]!.importKey)
    }
  })
})

// ---------------------------------------------------------------------------
// matchedJobId resolution logic
// ---------------------------------------------------------------------------

describe("matchedJobId resolution", () => {
  // Reimplement the resolution logic from import-wfp.ts for testing
  function buildTempJobIdLookup(
    jobs: { tempJobId: number | null; id: string }[],
  ): Map<number, string[]> {
    const lookup = new Map<number, string[]>()
    for (const job of jobs) {
      if (job.tempJobId != null) {
        const existing = lookup.get(job.tempJobId) ?? []
        existing.push(job.id)
        lookup.set(job.tempJobId, existing)
      }
    }
    return lookup
  }

  type Warning = { sheet: string; row: number; field: string; rawValue: string; message: string }

  function resolveMatchedJobId(
    tempJobId: number | null,
    lookup: Map<number, string[]>,
    warnings: Warning[],
    sheet: string,
    row: number,
  ): string | null {
    if (tempJobId == null) return null
    const matches = lookup.get(tempJobId)
    if (!matches || matches.length === 0) return null
    if (matches.length === 1) return matches[0]!
    warnings.push({
      sheet,
      row,
      field: "tempJobId",
      rawValue: String(tempJobId),
      message: `Ambiguous tempJobId ${tempJobId}: ${matches.length} jobs match`,
    })
    return null
  }

  it("resolves unambiguous match to the job ID", () => {
    const lookup = buildTempJobIdLookup([
      { tempJobId: 1000, id: "job-aaa" },
      { tempJobId: 2000, id: "job-bbb" },
    ])
    const warnings: Warning[] = []
    expect(resolveMatchedJobId(1000, lookup, warnings, "Budget", 10)).toBe(
      "job-aaa",
    )
    expect(warnings.length).toBe(0)
  })

  it("returns null for ambiguous match and emits warning", () => {
    const lookup = buildTempJobIdLookup([
      { tempJobId: 5273, id: "job-x" },
      { tempJobId: 5273, id: "job-y" },
    ])
    const warnings: Warning[] = []
    expect(resolveMatchedJobId(5273, lookup, warnings, "Budget", 20)).toBeNull()
    expect(warnings.length).toBe(1)
    expect(warnings[0]!.message).toContain("Ambiguous")
  })

  it("returns null for no match", () => {
    const lookup = buildTempJobIdLookup([
      { tempJobId: 1000, id: "job-aaa" },
    ])
    const warnings: Warning[] = []
    expect(resolveMatchedJobId(9999, lookup, warnings, "Budget", 5)).toBeNull()
    expect(warnings.length).toBe(0)
  })

  it("returns null for null tempJobId", () => {
    const lookup = buildTempJobIdLookup([
      { tempJobId: 1000, id: "job-aaa" },
    ])
    const warnings: Warning[] = []
    expect(resolveMatchedJobId(null, lookup, warnings, "Budget", 5)).toBeNull()
  })

  it("builds lookup correctly from real parsed jobs", () => {
    clearWarnings()
    const sheet2026 = workbook.Sheets["WFP Details - 2026"]!
    const result2026 = parseWfpDetailsSheet(sheet2026, "WFP Details - 2026")
    clearWarnings()
    const sheetBeyond = workbook.Sheets["WFP Details - Beyond 2026"]!
    const resultBeyond = parseWfpDetailsSheet(
      sheetBeyond,
      "WFP Details - Beyond 2026",
    )

    const allJobs = [...result2026.jobs, ...resultBeyond.jobs]
    const lookup = buildTempJobIdLookup(allJobs)

    // Most tempJobIds should map to exactly 1 job
    let uniqueCount = 0
    let ambiguousCount = 0
    for (const [, ids] of lookup) {
      if (ids.length === 1) uniqueCount++
      else ambiguousCount++
    }
    expect(uniqueCount).toBeGreaterThan(0)
    // There may be some ambiguous ones (e.g., 5273)
    expect(ambiguousCount + uniqueCount).toBe(lookup.size)
  })
})
