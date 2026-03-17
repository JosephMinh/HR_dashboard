import { describe, expect, it, beforeEach } from "vitest"
import {
  sanitizeString,
  sanitizeAndCollapse,
  safeParseInt,
  mapJobStatus,
  mapJobPriority,
  mapIsCritical,
  mapIsTradeoff,
  computePipelineHealth,
  normalizeDepartment,
  normalizeLocation,
  parseQuarter,
  parseExcelDate,
  buildDescription,
  isBufferRow,
  extractCandidateName,
  parseTempJobIdCell,
  clearWarnings,
  getWarnings,
  PIPELINE_HEALTH_AS_OF,
} from "@/lib/wfp-sanitize"

// ---------------------------------------------------------------------------
// sanitizeString
// ---------------------------------------------------------------------------

describe("sanitizeString", () => {
  it("returns null for null/undefined", () => {
    expect(sanitizeString(null)).toBeNull()
    expect(sanitizeString(undefined)).toBeNull()
  })

  it("trims whitespace", () => {
    expect(sanitizeString("  hello  ")).toBe("hello")
  })

  it("replaces NBSP with regular spaces", () => {
    expect(sanitizeString("hello\u00a0world")).toBe("hello world")
  })

  it("returns null for empty/whitespace-only strings", () => {
    expect(sanitizeString("")).toBeNull()
    expect(sanitizeString("   ")).toBeNull()
  })

  it("converts numbers to strings", () => {
    expect(sanitizeString(42)).toBe("42")
  })
})

// ---------------------------------------------------------------------------
// sanitizeAndCollapse
// ---------------------------------------------------------------------------

describe("sanitizeAndCollapse", () => {
  it("collapses repeated whitespace", () => {
    expect(sanitizeAndCollapse("hello   world")).toBe("hello world")
  })

  it("handles NBSP + multiple spaces", () => {
    expect(sanitizeAndCollapse("hello\u00a0  world")).toBe("hello world")
  })

  it("returns null for null", () => {
    expect(sanitizeAndCollapse(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// safeParseInt
// ---------------------------------------------------------------------------

describe("safeParseInt", () => {
  it("parses integers", () => {
    expect(safeParseInt(42)).toBe(42)
    expect(safeParseInt("42")).toBe(42)
  })

  it("rounds floats", () => {
    expect(safeParseInt(42.7)).toBe(43)
  })

  it("extracts leading integer from complex strings", () => {
    expect(safeParseInt("6000 (5357 Previously)")).toBe(6000)
  })

  it("returns null for non-numeric", () => {
    expect(safeParseInt(null)).toBeNull()
    expect(safeParseInt("abc")).toBeNull()
    expect(safeParseInt(NaN)).toBeNull()
    expect(safeParseInt(Infinity)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// mapJobStatus (§4a)
// ---------------------------------------------------------------------------

describe("mapJobStatus", () => {
  const sheet2026 = "WFP Details - 2026"
  const sheetBeyond = "WFP Details - Beyond 2026"

  beforeEach(() => clearWarnings())

  it("maps Open -> OPEN", () => {
    expect(mapJobStatus("Open", sheet2026, 2)).toBe("OPEN")
  })

  it("maps Offer -> OPEN", () => {
    expect(mapJobStatus("Offer", sheet2026, 2)).toBe("OPEN")
  })

  it("maps Agency -> OPEN", () => {
    expect(mapJobStatus("Agency", sheet2026, 2)).toBe("OPEN")
  })

  it("maps Hired -> CLOSED", () => {
    expect(mapJobStatus("Hired", sheet2026, 2)).toBe("CLOSED")
  })

  it("maps 'Hired - CW' -> CLOSED", () => {
    expect(mapJobStatus("Hired - CW", sheet2026, 2)).toBe("CLOSED")
  })

  it("handles case insensitivity", () => {
    expect(mapJobStatus("HIRED", sheet2026, 2)).toBe("CLOSED")
    expect(mapJobStatus("open", sheet2026, 2)).toBe("OPEN")
  })

  it("maps blank to ON_HOLD", () => {
    expect(mapJobStatus(null, sheet2026, 2)).toBe("ON_HOLD")
    expect(mapJobStatus("", sheet2026, 2)).toBe("ON_HOLD")
  })

  it("forces ON_HOLD for Beyond 2026 sheet regardless of value", () => {
    expect(mapJobStatus("Open", sheetBeyond, 2)).toBe("ON_HOLD")
    expect(mapJobStatus("Hired", sheetBeyond, 2)).toBe("ON_HOLD")
  })

  it("maps unknown values to ON_HOLD with warning", () => {
    mapJobStatus("Something Weird", sheet2026, 5)
    const warns = getWarnings()
    expect(warns.length).toBe(1)
    expect(warns[0]!.field).toBe("recruitingStatus")
  })
})

// ---------------------------------------------------------------------------
// mapJobPriority (§4b)
// ---------------------------------------------------------------------------

describe("mapJobPriority", () => {
  const sheet = "WFP Details - 2026"

  beforeEach(() => clearWarnings())

  it("maps 1 -> CRITICAL", () => {
    expect(mapJobPriority("1", sheet, 2)).toBe("CRITICAL")
  })

  it("maps 2 -> HIGH", () => {
    expect(mapJobPriority("2", sheet, 2)).toBe("HIGH")
  })

  it("maps 3 -> MEDIUM", () => {
    expect(mapJobPriority("3", sheet, 2)).toBe("MEDIUM")
  })

  it("maps 4 -> MEDIUM", () => {
    expect(mapJobPriority("4", sheet, 2)).toBe("MEDIUM")
  })

  it("maps null -> LOW", () => {
    expect(mapJobPriority(null, sheet, 2)).toBe("LOW")
  })

  it("maps non-numeric values to LOW with warning", () => {
    expect(mapJobPriority("Business Critical", sheet, 2)).toBe("LOW")
    expect(getWarnings().length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// mapIsCritical (§4c)
// ---------------------------------------------------------------------------

describe("mapIsCritical", () => {
  it("returns true for non-empty corporatePriority", () => {
    expect(mapIsCritical("Yes")).toBe(true)
    expect(mapIsCritical("x")).toBe(true)
  })

  it("returns false for null or empty", () => {
    expect(mapIsCritical(null)).toBe(false)
    expect(mapIsCritical("")).toBe(false)
    expect(mapIsCritical("   ")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// mapIsTradeoff (§4d)
// ---------------------------------------------------------------------------

describe("mapIsTradeoff", () => {
  it("returns true for non-empty tradeoff cell", () => {
    expect(mapIsTradeoff("Yes")).toBe(true)
    expect(mapIsTradeoff("x")).toBe(true)
  })

  it("returns false for null or empty", () => {
    expect(mapIsTradeoff(null)).toBe(false)
    expect(mapIsTradeoff("")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// computePipelineHealth (§4e)
// ---------------------------------------------------------------------------

describe("computePipelineHealth", () => {
  it("returns null for non-OPEN jobs", () => {
    expect(computePipelineHealth("CLOSED", new Date("2026-04-01"))).toBeNull()
    expect(computePipelineHealth("ON_HOLD", new Date("2026-04-01"))).toBeNull()
  })

  it("returns ON_TRACK for OPEN with null date", () => {
    expect(computePipelineHealth("OPEN", null)).toBe("ON_TRACK")
  })

  it("returns BEHIND when within 14 days", () => {
    // PIPELINE_HEALTH_AS_OF = 2026-03-17, +14 days = 2026-03-31
    expect(computePipelineHealth("OPEN", new Date("2026-03-25"))).toBe("BEHIND")
    expect(computePipelineHealth("OPEN", new Date("2026-03-17"))).toBe("BEHIND")
  })

  it("returns ON_TRACK when 15-60 days out", () => {
    // 2026-03-17 + 30 days = 2026-04-16
    expect(computePipelineHealth("OPEN", new Date("2026-04-16"))).toBe("ON_TRACK")
  })

  it("returns AHEAD when 61+ days out", () => {
    // 2026-03-17 + 90 days = 2026-06-15
    expect(computePipelineHealth("OPEN", new Date("2026-06-15"))).toBe("AHEAD")
  })

  it("uses the pinned PIPELINE_HEALTH_AS_OF date", () => {
    expect(PIPELINE_HEALTH_AS_OF.toISOString()).toContain("2026-03-17")
  })
})

// ---------------------------------------------------------------------------
// normalizeDepartment (§4f)
// ---------------------------------------------------------------------------

describe("normalizeDepartment", () => {
  it("strips numeric prefix", () => {
    expect(normalizeDepartment("930 Communications")).toBe("Communications")
    expect(normalizeDepartment("100 Engineering")).toBe("Engineering")
  })

  it("returns as-is if no numeric prefix", () => {
    expect(normalizeDepartment("Communications")).toBe("Communications")
  })

  it("returns 'Unknown' for null", () => {
    expect(normalizeDepartment(null)).toBe("Unknown")
  })
})

// ---------------------------------------------------------------------------
// normalizeLocation (§4g)
// ---------------------------------------------------------------------------

describe("normalizeLocation", () => {
  const sheet = "WFP Details - 2026"

  beforeEach(() => clearWarnings())

  it("maps SSF", () => {
    expect(normalizeLocation("SSF", sheet, 2)).toBe("South San Francisco, CA")
  })

  it("maps PNJ", () => {
    expect(normalizeLocation("PNJ", sheet, 2)).toBe("Princeton, NJ")
  })

  it("maps Chicago", () => {
    expect(normalizeLocation("Chicago", sheet, 2)).toBe("Chicago, IL")
  })

  it("maps US Remote", () => {
    expect(normalizeLocation("US Remote", sheet, 2)).toBe("Remote (US)")
  })

  it("maps Remote", () => {
    expect(normalizeLocation("Remote", sheet, 2)).toBe("Remote")
  })

  it("maps SSF or PNJ", () => {
    expect(normalizeLocation("SSF or PNJ", sheet, 2)).toBe("South San Francisco / Princeton")
  })

  it("maps EU", () => {
    expect(normalizeLocation("EU", sheet, 2)).toBe("Remote (EU)")
  })

  it("returns null for null", () => {
    expect(normalizeLocation(null, sheet, 2)).toBeNull()
  })

  it("preserves unknown locations with warning", () => {
    expect(normalizeLocation("Tokyo", sheet, 5)).toBe("Tokyo")
    expect(getWarnings().length).toBe(1)
  })

  it("is case-insensitive", () => {
    expect(normalizeLocation("ssf", sheet, 2)).toBe("South San Francisco, CA")
  })
})

// ---------------------------------------------------------------------------
// parseQuarter (§4h)
// ---------------------------------------------------------------------------

describe("parseQuarter", () => {
  it("parses '2026 Q1'", () => {
    const result = parseQuarter("2026 Q1")
    expect(result).not.toBeNull()
    expect(result!.openedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(result!.targetFillDate.toISOString()).toBe("2026-03-31T00:00:00.000Z")
  })

  it("parses '2026 Q2'", () => {
    const result = parseQuarter("2026 Q2")
    expect(result).not.toBeNull()
    expect(result!.openedAt.toISOString()).toBe("2026-04-01T00:00:00.000Z")
    expect(result!.targetFillDate.toISOString()).toBe("2026-06-30T00:00:00.000Z")
  })

  it("parses '2026 Q3'", () => {
    const result = parseQuarter("2026 Q3")
    expect(result).not.toBeNull()
    expect(result!.openedAt.toISOString()).toBe("2026-07-01T00:00:00.000Z")
    expect(result!.targetFillDate.toISOString()).toBe("2026-09-30T00:00:00.000Z")
  })

  it("parses '2026 Q4'", () => {
    const result = parseQuarter("2026 Q4")
    expect(result).not.toBeNull()
    expect(result!.openedAt.toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(result!.targetFillDate.toISOString()).toBe("2026-12-31T00:00:00.000Z")
  })

  it("returns null for TBD", () => {
    expect(parseQuarter("TBD")).toBeNull()
  })

  it("returns null for null", () => {
    expect(parseQuarter(null)).toBeNull()
  })

  it("returns null for unparseable strings", () => {
    expect(parseQuarter("sometime next year")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseExcelDate
// ---------------------------------------------------------------------------

describe("parseExcelDate", () => {
  it("converts Excel serial date", () => {
    // Excel serial 44927 = 2023-01-01 (approximately)
    const d = parseExcelDate(44927)
    expect(d).not.toBeNull()
    expect(d!.getUTCFullYear()).toBe(2023)
  })

  it("passes through Date objects", () => {
    const d = new Date("2026-01-01")
    expect(parseExcelDate(d)).toBe(d)
  })

  it("parses ISO date strings", () => {
    const d = parseExcelDate("2026-03-17")
    expect(d).not.toBeNull()
    expect(d!.getUTCFullYear()).toBe(2026)
  })

  it("returns null for TBD", () => {
    expect(parseExcelDate("TBD")).toBeNull()
  })

  it("returns null for null", () => {
    expect(parseExcelDate(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// buildDescription (§4i)
// ---------------------------------------------------------------------------

describe("buildDescription", () => {
  it("uses keyCapability when long enough", () => {
    const desc = buildDescription(
      "Lead the development of next-gen cardiac devices",
      null,
      "Engineer",
      "R&D",
      "Engineering",
    )
    expect(desc).toContain("Lead the development")
  })

  it("combines keyCapability and businessRationale", () => {
    const desc = buildDescription(
      "Lead the development of next-gen cardiac devices",
      "Critical for Q3 revenue targets",
      "Engineer",
      "R&D",
      "Engineering",
    )
    expect(desc).toContain("Lead the development")
    expect(desc).toContain("Critical for Q3")
  })

  it("falls back to title/department when both are short", () => {
    const desc = buildDescription(null, null, "Engineer", "R&D", "Engineering")
    expect(desc).toContain("Engineer")
    expect(desc).toContain("Engineering")
  })

  it("returns fallback string from title and department", () => {
    const desc = buildDescription(null, null, "Eng", null, "X")
    expect(desc).toBe("Eng -- X")
  })
})

// ---------------------------------------------------------------------------
// isBufferRow
// ---------------------------------------------------------------------------

describe("isBufferRow", () => {
  it("detects buffer rows", () => {
    expect(isBufferRow("BUFFER")).toBe(true)
    expect(isBufferRow("Buffer Row")).toBe(true)
  })

  it("returns false for normal values", () => {
    expect(isBufferRow("Engineering")).toBe(false)
    expect(isBufferRow(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// extractCandidateName (§5f)
// ---------------------------------------------------------------------------

describe("extractCandidateName", () => {
  it("extracts 'HIRED: First Last'", () => {
    const result = extractCandidateName("HIRED: John Smith")
    expect(result).toEqual({ firstName: "John", lastName: "Smith" })
  })

  it("extracts 'CW: First Last'", () => {
    const result = extractCandidateName("CW: Jane Doe")
    expect(result).toEqual({ firstName: "Jane", lastName: "Doe" })
  })

  it("extracts 'Approved at ... - Name' (simple separator)", () => {
    const result = extractCandidateName("Approved at L7 - John Smith")
    expect(result).toEqual({ firstName: "John", lastName: "Smith" })
  })

  it("handles 'Approved at' with hyphenated words before separator", () => {
    // Greedy .* matches up to the last dash, correctly extracting the name
    const result = extractCandidateName("Approved at 2025 re-forecast - Vijetha Thokala")
    expect(result).toEqual({ firstName: "Vijetha", lastName: "Thokala" })
  })

  it("handles single-word names", () => {
    const result = extractCandidateName("HIRED: Madonna")
    expect(result).toEqual({ firstName: "Madonna", lastName: "(none)" })
  })

  it("handles multi-word last names", () => {
    const result = extractCandidateName("HIRED: Mary Jane Watson")
    expect(result).toEqual({ firstName: "Mary", lastName: "Jane Watson" })
  })

  it("returns null for null", () => {
    expect(extractCandidateName(null)).toBeNull()
  })

  it("returns null for unrecognized patterns", () => {
    expect(extractCandidateName("Just some text")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseTempJobIdCell
// ---------------------------------------------------------------------------

describe("parseTempJobIdCell", () => {
  it("parses plain numbers", () => {
    expect(parseTempJobIdCell(5273)).toEqual({ tempJobId: 5273, rawTempJobId: null })
  })

  it("parses string numbers", () => {
    expect(parseTempJobIdCell("5273")).toEqual({ tempJobId: 5273, rawTempJobId: null })
  })

  it("parses complex strings and preserves raw", () => {
    const result = parseTempJobIdCell("6000 (5357 Previously)")
    expect(result.tempJobId).toBe(6000)
    expect(result.rawTempJobId).toBe("6000 (5357 Previously)")
  })

  it("returns null for null", () => {
    expect(parseTempJobIdCell(null)).toEqual({ tempJobId: null, rawTempJobId: null })
  })
})
