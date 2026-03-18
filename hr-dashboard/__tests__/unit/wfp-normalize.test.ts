/**
 * WFP Import — normalize.ts module tests.
 *
 * Tests the NormalizeResult-pattern API used by budget and tradeoffs parsers.
 * Complements wfp-sanitize.test.ts which tests the direct-return aliases.
 */

import { describe, expect, it } from "vitest"
import {
  sanitize,
  sanitizeCollapse,
  normalizeJobStatus,
  normalizePriority,
  computeIsCritical,
  computeIsTradeoff,
  computePipelineHealth,
  parseDepartment,
  normalizeLocation,
  parseQuarterDates,
  assembleDescription,
  excelSerialToDate,
  parseTempJobId,
  isBufferRow,
  extractCandidateName,
  PIPELINE_HEALTH_AS_OF,
} from "@/lib/import/normalize"

// ---------------------------------------------------------------------------
// sanitize
// ---------------------------------------------------------------------------

describe("normalize.sanitize", () => {
  it("returns null for null/undefined", () => {
    expect(sanitize(null)).toBeNull()
    expect(sanitize(undefined)).toBeNull()
  })

  it("trims whitespace", () => {
    expect(sanitize("  hello  ")).toBe("hello")
  })

  it("replaces NBSP with regular spaces", () => {
    expect(sanitize("hello\u00a0world")).toBe("hello world")
  })

  it("returns null for empty/whitespace-only strings", () => {
    expect(sanitize("")).toBeNull()
    expect(sanitize("   ")).toBeNull()
    expect(sanitize("\u00a0")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// sanitizeCollapse
// ---------------------------------------------------------------------------

describe("normalize.sanitizeCollapse", () => {
  it("collapses repeated whitespace", () => {
    expect(sanitizeCollapse("hello   world")).toBe("hello world")
  })

  it("handles NBSP + multiple spaces", () => {
    expect(sanitizeCollapse("hello\u00a0  world")).toBe("hello world")
  })
})

// ---------------------------------------------------------------------------
// normalizeJobStatus (NormalizeResult)
// ---------------------------------------------------------------------------

describe("normalize.normalizeJobStatus", () => {
  it("maps Open -> OPEN with no warnings", () => {
    const result = normalizeJobStatus("Open", "WFP Details - 2026")
    expect(result.value).toBe("OPEN")
    expect(result.warnings).toHaveLength(0)
  })

  it("maps Hired -> CLOSED", () => {
    const result = normalizeJobStatus("Hired", "WFP Details - 2026")
    expect(result.value).toBe("CLOSED")
  })

  it("maps blank to ON_HOLD", () => {
    const result = normalizeJobStatus(null, "WFP Details - 2026")
    expect(result.value).toBe("ON_HOLD")
  })

  it("forces ON_HOLD for Beyond 2026 sheet", () => {
    const result = normalizeJobStatus("Open", "WFP Details - Beyond 2026")
    expect(result.value).toBe("ON_HOLD")
  })

  it("unknown status returns ON_HOLD with warning", () => {
    const result = normalizeJobStatus("Transferred", "WFP Details - 2026")
    expect(result.value).toBe("ON_HOLD")
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]).toContain("Unknown")
  })
})

// ---------------------------------------------------------------------------
// normalizePriority (NormalizeResult)
// ---------------------------------------------------------------------------

describe("normalize.normalizePriority", () => {
  it("maps 1 -> CRITICAL", () => {
    expect(normalizePriority("1").value).toBe("CRITICAL")
  })

  it("maps 2 -> HIGH", () => {
    expect(normalizePriority("2").value).toBe("HIGH")
  })

  it("maps 3 -> MEDIUM", () => {
    expect(normalizePriority("3").value).toBe("MEDIUM")
  })

  it("maps 4 -> MEDIUM", () => {
    expect(normalizePriority("4").value).toBe("MEDIUM")
  })

  it("maps null -> LOW", () => {
    expect(normalizePriority(null).value).toBe("LOW")
  })

  it("maps 5 -> LOW with warning", () => {
    const result = normalizePriority("5")
    expect(result.value).toBe("LOW")
    expect(result.warnings.length).toBe(1)
  })

  it("maps non-numeric -> LOW with warning", () => {
    const result = normalizePriority("Business Critical")
    expect(result.value).toBe("LOW")
    expect(result.warnings.length).toBe(1)
    expect(result.warnings[0]).toContain("Non-numeric")
  })
})

// ---------------------------------------------------------------------------
// computeIsCritical / computeIsTradeoff
// ---------------------------------------------------------------------------

describe("normalize.computeIsCritical", () => {
  it("true when corporatePriority is non-empty", () => {
    expect(computeIsCritical("Yes")).toBe(true)
  })

  it("false when null or empty", () => {
    expect(computeIsCritical(null)).toBe(false)
    expect(computeIsCritical("")).toBe(false)
    expect(computeIsCritical("  ")).toBe(false)
  })
})

describe("normalize.computeIsTradeoff", () => {
  it("true for non-empty", () => {
    expect(computeIsTradeoff("x")).toBe(true)
  })

  it("false for null/empty", () => {
    expect(computeIsTradeoff(null)).toBe(false)
    expect(computeIsTradeoff("")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// computePipelineHealth (signature: targetFillDate, status, asOfDate)
// ---------------------------------------------------------------------------

describe("normalize.computePipelineHealth", () => {
  const asOf = PIPELINE_HEALTH_AS_OF // 2026-03-17

  it("returns null for non-OPEN status", () => {
    expect(computePipelineHealth(new Date("2026-04-01"), "CLOSED", asOf)).toBeNull()
    expect(computePipelineHealth(new Date("2026-04-01"), "ON_HOLD", asOf)).toBeNull()
  })

  it("returns ON_TRACK for OPEN with null target date", () => {
    expect(computePipelineHealth(null, "OPEN", asOf)).toBe("ON_TRACK")
  })

  it("returns BEHIND only when the target fill date is already past due", () => {
    expect(computePipelineHealth(new Date("2026-03-16"), "OPEN", asOf)).toBe("BEHIND")
  })

  it("returns ON_TRACK on the as-of date and when <= 60 days out", () => {
    expect(computePipelineHealth(new Date("2026-03-31"), "OPEN", asOf)).toBe("ON_TRACK")
    expect(computePipelineHealth(new Date("2026-03-20"), "OPEN", asOf)).toBe("ON_TRACK")
  })

  it("returns ON_TRACK when 1-60 days out", () => {
    expect(computePipelineHealth(new Date("2026-04-15"), "OPEN", asOf)).toBe("ON_TRACK")
  })

  it("returns AHEAD when 61+ days out", () => {
    expect(computePipelineHealth(new Date("2026-06-15"), "OPEN", asOf)).toBe("AHEAD")
  })
})

// ---------------------------------------------------------------------------
// parseDepartment
// ---------------------------------------------------------------------------

describe("normalize.parseDepartment", () => {
  it("strips numeric prefix", () => {
    expect(parseDepartment("930 Communications")).toBe("Communications")
    expect(parseDepartment("100 Engineering")).toBe("Engineering")
  })

  it("returns as-is if no prefix", () => {
    expect(parseDepartment("Communications")).toBe("Communications")
  })

  it("returns null for null", () => {
    expect(parseDepartment(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// normalizeLocation (NormalizeResult)
// ---------------------------------------------------------------------------

describe("normalize.normalizeLocation", () => {
  it("maps known locations", () => {
    expect(normalizeLocation("SSF").value).toBe("South San Francisco, CA")
    expect(normalizeLocation("PNJ").value).toBe("Princeton, NJ")
    expect(normalizeLocation("Chicago").value).toBe("Chicago, IL")
    expect(normalizeLocation("US Remote").value).toBe("Remote (US)")
    expect(normalizeLocation("Remote").value).toBe("Remote")
    expect(normalizeLocation("EU").value).toBe("Remote (EU)")
    expect(normalizeLocation("SSF or PNJ").value).toBe("South San Francisco / Princeton")
    expect(normalizeLocation("TBD").value).toBe("TBD")
  })

  it("is case-insensitive", () => {
    expect(normalizeLocation("ssf").value).toBe("South San Francisco, CA")
  })

  it("preserves unknown locations with warning", () => {
    const result = normalizeLocation("Tokyo")
    expect(result.value).toBe("Tokyo")
    expect(result.warnings.length).toBe(1)
  })

  it("returns null for null", () => {
    expect(normalizeLocation(null).value).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseQuarterDates (NormalizeResult)
// ---------------------------------------------------------------------------

describe("normalize.parseQuarterDates", () => {
  it("parses Q1-Q4 correctly", () => {
    const q1 = parseQuarterDates("2026 Q1")
    expect(q1.value.openedAt!.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(q1.value.targetFillDate!.toISOString()).toBe("2026-03-31T00:00:00.000Z")

    const q4 = parseQuarterDates("2026 Q4")
    expect(q4.value.openedAt!.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(q4.value.targetFillDate!.toISOString()).toBe("2026-12-31T00:00:00.000Z")
  })

  it("returns null dates for TBD", () => {
    const result = parseQuarterDates("TBD")
    expect(result.value.openedAt).toBeNull()
    expect(result.value.targetFillDate).toBeNull()
  })

  it("returns null dates for null", () => {
    const result = parseQuarterDates(null)
    expect(result.value.openedAt).toBeNull()
    expect(result.value.targetFillDate).toBeNull()
  })

  it("warns on unparseable strings", () => {
    const result = parseQuarterDates("Next year maybe")
    expect(result.value.openedAt).toBeNull()
    expect(result.warnings.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// assembleDescription
// ---------------------------------------------------------------------------

describe("normalize.assembleDescription", () => {
  it("uses keyCapability when long enough", () => {
    const desc = assembleDescription(
      "Lead the development of next-gen devices",
      null,
      "Eng",
      "R&D",
      "Engineering",
    )
    expect(desc).toContain("Lead the development")
  })

  it("combines keyCapability and businessRationale", () => {
    const desc = assembleDescription(
      "Lead the development of next-gen devices",
      "Critical for Q3 revenue targets",
      "Eng",
      null,
      "Engineering",
    )
    expect(desc).toContain("Lead the development")
    expect(desc).toContain("Critical for Q3")
  })

  it("falls back to title/function/department", () => {
    const desc = assembleDescription(null, null, "Engineer", "R&D", "Engineering")
    expect(desc).toContain("Engineer")
    expect(desc).toContain("Engineering")
  })

  it("meets minimum description length", () => {
    const desc = assembleDescription(null, null, "E", null, "X")
    expect(desc.length).toBeGreaterThanOrEqual(10)
  })
})

// ---------------------------------------------------------------------------
// excelSerialToDate
// ---------------------------------------------------------------------------

describe("normalize.excelSerialToDate", () => {
  it("converts Excel serial date to JS Date", () => {
    const d = excelSerialToDate(44927)
    expect(d).not.toBeNull()
    expect(d!.getUTCFullYear()).toBe(2023)
  })

  it("returns null for invalid values", () => {
    expect(excelSerialToDate(NaN)).toBeNull()
    expect(excelSerialToDate(0)).toBeNull()
    expect(excelSerialToDate(-1)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseTempJobId
// ---------------------------------------------------------------------------

describe("normalize.parseTempJobId", () => {
  it("parses plain numbers", () => {
    expect(parseTempJobId(5273)).toEqual({ tempJobId: 5273, rawTempJobId: "5273" })
  })

  it("parses string numbers", () => {
    const result = parseTempJobId("5273")
    expect(result.tempJobId).toBe(5273)
  })

  it("extracts leading integer from complex strings", () => {
    const result = parseTempJobId("6000 (5357 Previously)")
    expect(result.tempJobId).toBe(6000)
    expect(result.rawTempJobId).toBe("6000 (5357 Previously)")
  })

  it("returns null for null", () => {
    expect(parseTempJobId(null)).toEqual({ tempJobId: null, rawTempJobId: null })
  })
})

// ---------------------------------------------------------------------------
// isBufferRow
// ---------------------------------------------------------------------------

describe("normalize.isBufferRow", () => {
  it("detects BUFFER rows", () => {
    expect(isBufferRow("BUFFER")).toBe(true)
    expect(isBufferRow("Buffer Row")).toBe(true)
  })

  it("returns false for normal values", () => {
    expect(isBufferRow("Engineering")).toBe(false)
    expect(isBufferRow(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// extractCandidateName
// ---------------------------------------------------------------------------

describe("normalize.extractCandidateName", () => {
  it("extracts HIRED: pattern", () => {
    expect(extractCandidateName("HIRED: John Smith")).toEqual({
      firstName: "John",
      lastName: "Smith",
    })
  })

  it("extracts CW: pattern", () => {
    expect(extractCandidateName("CW: Jane Doe")).toEqual({
      firstName: "Jane",
      lastName: "Doe",
    })
  })

  it("extracts Approved at ... - Name pattern", () => {
    expect(extractCandidateName("Approved at 2025 re-forecast - Vijetha Thokala")).toEqual({
      firstName: "Vijetha",
      lastName: "Thokala",
    })
  })

  it("handles single-word names", () => {
    expect(extractCandidateName("HIRED: Madonna")).toEqual({
      firstName: "Madonna",
      lastName: "(none)",
    })
  })

  it("returns null for null", () => {
    expect(extractCandidateName(null)).toBeNull()
  })

  it("returns null for unrecognized patterns", () => {
    expect(extractCandidateName("Some random text")).toBeNull()
  })
})
