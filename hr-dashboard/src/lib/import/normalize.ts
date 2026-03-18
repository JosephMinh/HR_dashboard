/**
 * WFP Import — Field mapping and normalization module.
 *
 * Implements all domain-specific business rules from PLAN.md §4.
 * Every normalizer is a pure function that takes raw cell values and
 * returns normalized values plus warnings for auditability.
 */

import type { JobStatus, JobPriority, PipelineHealth } from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizeResult<T> {
  value: T;
  warnings: string[];
}

export interface ImportWarning {
  sheet: string;
  row: number;
  field: string;
  rawValue: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Pinned date for pipeline health computation.
 * This is deliberate and documented — to refresh pipeline health,
 * update this constant and re-run the import.
 * Do NOT use new Date() which makes the import non-deterministic.
 */
export const PIPELINE_HEALTH_AS_OF = new Date("2026-03-17");
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function toUtcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Minimum description length matching the existing Zod contract. */
const MIN_DESCRIPTION_LENGTH = 10;

// ---------------------------------------------------------------------------
// General sanitization (§5a)
// ---------------------------------------------------------------------------

/** Trim whitespace and replace NBSP (\xa0) with regular spaces. */
export function sanitize(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.replace(/\u00a0/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}

/** Sanitize and collapse repeated internal whitespace. */
export function sanitizeCollapse(value: string | null | undefined): string | null {
  const s = sanitize(value);
  if (s == null) return null;
  return s.replace(/\s{2,}/g, " ");
}

// ---------------------------------------------------------------------------
// Job Status (§4a)
// ---------------------------------------------------------------------------

const STATUS_MAP: Record<string, JobStatus> = {
  open: "OPEN",
  offer: "OFFER",
  agency: "AGENCY",
  hired: "HIRED",
  "hired - cw": "HIRED_CW",
};

/**
 * Map raw Excel recruiting status to JobStatus enum.
 *
 * Rules:
 * - Open/Offer/Agency → OPEN
 * - Hired/HIred/Hired - CW → CLOSED
 * - blank on 2026 sheet → ON_HOLD
 * - any value on Beyond 2026 sheet → ON_HOLD
 */
export function normalizeJobStatus(
  recruitingStatus: string | null | undefined,
  sheet: string,
): NormalizeResult<JobStatus> {
  const warnings: string[] = [];
  const raw = sanitize(recruitingStatus);

  // Beyond 2026 sheet: force NOT_STARTED regardless of status
  if (sheet.includes("Beyond 2026")) {
    return { value: "NOT_STARTED", warnings };
  }

  // Blank on 2026 sheet → UNKNOWN
  if (raw == null) {
    return { value: "UNKNOWN", warnings };
  }

  const key = raw.toLowerCase();
  const mapped = STATUS_MAP[key];

  if (mapped) {
    return { value: mapped, warnings };
  }

  // Unknown value — default to UNKNOWN and warn
  warnings.push(`Unknown recruiting status "${raw}" on sheet "${sheet}" — defaulting to UNKNOWN`);
  return { value: "UNKNOWN", warnings };
}

// ---------------------------------------------------------------------------
// Priority (§4b)
// ---------------------------------------------------------------------------

/**
 * Map raw Functional Priority to JobPriority enum.
 *
 * Numeric: 1→CRITICAL, 2→HIGH, 3/4→MEDIUM, everything else→LOW.
 * Non-numeric values like 'Business Critical', 'Capacity building' etc. → LOW + warning.
 */
export function normalizePriority(
  rawPriority: string | null | undefined,
): NormalizeResult<JobPriority> {
  const warnings: string[] = [];
  const raw = sanitize(rawPriority);

  if (raw == null) {
    return { value: "LOW", warnings };
  }

  const trimmed = raw.trim();
  const num = Number(trimmed);

  if (!Number.isNaN(num) && Number.isInteger(num)) {
    switch (num) {
      case 1:
        return { value: "CRITICAL", warnings };
      case 2:
        return { value: "HIGH", warnings };
      case 3:
      case 4:
        return { value: "MEDIUM", warnings };
      default:
        warnings.push(`Unexpected numeric priority "${trimmed}" — defaulting to LOW`);
        return { value: "LOW", warnings };
    }
  }

  // Non-numeric value
  warnings.push(`Non-numeric priority "${trimmed}" — defaulting to LOW`);
  return { value: "LOW", warnings };
}

// ---------------------------------------------------------------------------
// isCritical (§4c)
// ---------------------------------------------------------------------------

/** True when corporatePriority is non-empty after trim. */
export function computeIsCritical(corporatePriority: string | null | undefined): boolean {
  return sanitize(corporatePriority) != null;
}

// ---------------------------------------------------------------------------
// isTradeoff (§4d)
// ---------------------------------------------------------------------------

/**
 * True when the Tradeoff? column is non-empty after trim and NBSP normalization.
 * Don't expect only 'Yes'/'x' — freeform notes exist in this column.
 */
export function computeIsTradeoff(tradeoffCell: string | null | undefined): boolean {
  return sanitize(tradeoffCell) != null;
}

// ---------------------------------------------------------------------------
// Pipeline Health (§4e)
// ---------------------------------------------------------------------------

/**
 * Compute pipeline health using a pinned date constant.
 *
 * Rules:
 * - past due open roles → BEHIND
 * - same-day or within 60 days → ON_TRACK
 * - 61+ days out → AHEAD
 * - null target date on an open job → ON_TRACK
 * - non-OPEN jobs → null
 */
const ACTIVE_STATUSES = new Set<string>(["OPEN", "OFFER", "AGENCY"]);

export function computePipelineHealth(
  targetFillDate: Date | null,
  status: JobStatus,
  asOfDate: Date = PIPELINE_HEALTH_AS_OF,
): PipelineHealth | null {
  if (!ACTIVE_STATUSES.has(status)) {
    return null;
  }

  if (targetFillDate == null) {
    return "ON_TRACK";
  }

  const targetDayStart = toUtcDayStart(targetFillDate);
  const asOfDayStart = toUtcDayStart(asOfDate);
  const diffDays = (targetDayStart - asOfDayStart) / MS_PER_DAY;

  if (diffDays < 0) return "BEHIND";
  if (diffDays <= 60) return "ON_TRACK";
  return "AHEAD";
}

// ---------------------------------------------------------------------------
// Department (§4f)
// ---------------------------------------------------------------------------

/**
 * Strip numeric prefix from department name.
 * e.g. '930 Communications' → 'Communications'
 */
export function parseDepartment(rawDepartment: string | null | undefined): string | null {
  const s = sanitize(rawDepartment);
  if (s == null) return null;
  return s.replace(/^\d+\s+/, "");
}

// ---------------------------------------------------------------------------
// Location (§4g)
// ---------------------------------------------------------------------------

const LOCATION_MAP: Record<string, string> = {
  ssf: "South San Francisco, CA",
  pnj: "Princeton, NJ",
  chicago: "Chicago, IL",
  "us remote": "Remote (US)",
  remote: "Remote",
  "ssf or pnj": "South San Francisco / Princeton",
  eu: "Remote (EU)",
  tbd: "TBD",
};

/**
 * Normalize known location variants. Log unknown values.
 */
export function normalizeLocation(
  rawLocation: string | null | undefined,
): NormalizeResult<string | null> {
  const warnings: string[] = [];
  const raw = sanitizeCollapse(rawLocation);

  if (raw == null) {
    return { value: null, warnings };
  }

  const key = raw.toLowerCase();
  const mapped = LOCATION_MAP[key];

  if (mapped) {
    return { value: mapped, warnings };
  }

  // Unknown location — preserve raw and warn
  warnings.push(`Unknown location "${raw}" — preserving as-is`);
  return { value: raw, warnings };
}

// ---------------------------------------------------------------------------
// Dates (§4h)
// ---------------------------------------------------------------------------

export interface ParsedDates {
  openedAt: Date | null;
  targetFillDate: Date | null;
}

const QUARTER_REGEX = /^(\d{4})\s+Q([1-4])$/;

/**
 * Parse quarter strings into openedAt and targetFillDate.
 *
 * '2026 Q1' → openedAt: 2026-01-01, targetFillDate: 2026-03-31
 * 'TBD' or blank → null
 */
export function parseQuarterDates(
  rawTiming: string | null | undefined,
): NormalizeResult<ParsedDates> {
  const warnings: string[] = [];
  const raw = sanitize(rawTiming);

  if (raw == null || raw.toLowerCase() === "tbd") {
    return { value: { openedAt: null, targetFillDate: null }, warnings };
  }

  const match = raw.match(QUARTER_REGEX);
  if (!match) {
    warnings.push(`Unparseable quarter string "${raw}" — setting dates to null`);
    return { value: { openedAt: null, targetFillDate: null }, warnings };
  }

  const year = Number(match[1]);
  const quarter = Number(match[2]);

  const quarterStartMonth = (quarter - 1) * 3; // 0-indexed: Q1=0, Q2=3, Q3=6, Q4=9
  const quarterEndMonth = quarterStartMonth + 2;

  // UTC dates to avoid timezone issues
  const openedAt = new Date(Date.UTC(year, quarterStartMonth, 1));

  // Last day of quarter: day 0 of month after the last quarter month
  const targetFillDate = new Date(Date.UTC(year, quarterEndMonth + 1, 0));

  return { value: { openedAt, targetFillDate }, warnings };
}

// ---------------------------------------------------------------------------
// Description (§4i)
// ---------------------------------------------------------------------------

/**
 * Assemble a description from WFP fields.
 *
 * 1. Start with keyCapability if it has meaningful content.
 * 2. Append businessRationale on a new line if present.
 * 3. If both are too short, use "{title} -- {function}, {department}".
 * 4. Ensure the final value meets the minimum length contract.
 */
export function assembleDescription(
  keyCapability: string | null | undefined,
  businessRationale: string | null | undefined,
  title: string,
  func: string | null | undefined,
  department: string | null | undefined,
): string {
  const cap = sanitize(keyCapability);
  const rat = sanitize(businessRationale);

  const parts: string[] = [];
  if (cap) parts.push(cap);
  if (rat) parts.push(rat);

  const assembled = parts.join("\n\n");

  if (assembled.length >= MIN_DESCRIPTION_LENGTH) {
    return assembled;
  }

  // Fallback: build from title, function, department
  const funcStr = sanitize(func);
  const deptStr = sanitize(department);
  const segments = [title, funcStr, deptStr].filter(Boolean);
  const fallback = segments.join(" -- ");

  if (fallback.length >= MIN_DESCRIPTION_LENGTH) {
    return fallback;
  }

  // Pad to meet minimum length if absolutely necessary
  return fallback.padEnd(MIN_DESCRIPTION_LENGTH, " ");
}

// ---------------------------------------------------------------------------
// Excel serial date conversion
// ---------------------------------------------------------------------------

/**
 * Convert an Excel serial date number to a JavaScript Date (UTC).
 * Excel epoch is 1899-12-30 with the 1900 leap year bug.
 */
export function excelSerialToDate(serial: number): Date | null {
  if (serial == null || Number.isNaN(serial) || serial <= 0) {
    return null;
  }
  const msPerDay = 86400000;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(excelEpoch.getTime() + serial * msPerDay);
}

// ---------------------------------------------------------------------------
// tempJobId parsing (for budget rows)
// ---------------------------------------------------------------------------

/**
 * Parse a tempJobId from budget row values.
 * Handles cases like "6000 (5357 Previously)" by extracting the leading integer.
 * Returns both the parsed integer and the raw string.
 */
export function parseTempJobId(
  raw: string | number | null | undefined,
): { tempJobId: number | null; rawTempJobId: string | null } {
  if (raw == null) return { tempJobId: null, rawTempJobId: null };

  if (typeof raw === "number") {
    return {
      tempJobId: Number.isNaN(raw) ? null : Math.floor(raw),
      rawTempJobId: String(raw),
    };
  }

  const s = sanitize(String(raw));
  if (s == null) return { tempJobId: null, rawTempJobId: null };

  // Extract the leading integer (e.g. "6000 (5357 Previously)" → 6000)
  const match = s.match(/^(\d+)/);
  const tempJobId = match ? Number(match[1]) : null;

  return { tempJobId, rawTempJobId: s };
}

// ---------------------------------------------------------------------------
// Row skip helpers
// ---------------------------------------------------------------------------

/** Returns true if a row should be skipped (buffer rows where Function contains BUFFER). */
export function isBufferRow(functionValue: string | null | undefined): boolean {
  const s = sanitize(functionValue);
  if (s == null) return false;
  return s.toUpperCase().includes("BUFFER");
}

// ---------------------------------------------------------------------------
// Candidate name extraction (§5f)
// ---------------------------------------------------------------------------

export interface ExtractedCandidate {
  firstName: string;
  lastName: string;
}

/**
 * Extract candidate name from hired row notes/name cell.
 * Handles patterns: "HIRED: First Last", "CW: First Last",
 * "Approved at 2025 re-forecast - First Last"
 */
export function extractCandidateName(hiredName: string | null | undefined): ExtractedCandidate | null {
  const s = sanitize(hiredName);
  if (s == null) return null;

  let name: string | null = null;

  // Pattern: "HIRED: Name"
  const hiredMatch = s.match(/^HIRED:\s*(.+)/i);
  if (hiredMatch?.[1]) {
    name = hiredMatch[1]!.trim();
  }

  // Pattern: "CW: Name"
  if (!name) {
    const cwMatch = s.match(/^CW:\s*(.+)/i);
    if (cwMatch?.[1]) {
      name = cwMatch[1]!.trim();
    }
  }

  // Pattern: "Approved at ... - Name"
  if (!name) {
    const approvedMatch = s.match(/^Approved\s+at\s+.*-\s*(.+)/i);
    if (approvedMatch?.[1]) {
      name = approvedMatch[1]!.trim();
    }
  }

  if (!name || name.length === 0) return null;

  // Split into first/last
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const firstName: string = parts[0]!;
  if (parts.length === 1) {
    return { firstName, lastName: "(none)" };
  }

  const lastName: string = parts.slice(1).join(" ");
  return { firstName, lastName };
}

// ---------------------------------------------------------------------------
// Compatibility aliases for wfp-sanitize.ts API consumers
// ---------------------------------------------------------------------------

/** Alias for sanitize() — accepts unknown for convenience. */
export function sanitizeString(raw: unknown): string | null {
  if (raw == null) return null;
  return sanitize(String(raw));
}

/** Global warning accumulator for structured import diagnostics. */
const _warnings: ImportWarning[] = [];

export function addWarning(sheet: string, row: number, field: string, rawValue: string, message: string): void {
  _warnings.push({ sheet, row, field, rawValue, message });
}

export function getWarnings(): ImportWarning[] {
  return [..._warnings];
}

export function clearWarnings(): void {
  _warnings.length = 0;
}

/** Alias: mapJobStatus wraps normalizeJobStatus, returning just the value. */
export function mapJobStatus(recruitingStatus: string | null, sheet: string, row: number): import("@/generated/prisma/enums").JobStatus {
  const result = normalizeJobStatus(recruitingStatus, sheet);
  for (const w of result.warnings) addWarning(sheet, row, "recruitingStatus", recruitingStatus ?? "", w);
  return result.value;
}

/** Alias: mapJobPriority wraps normalizePriority, returning just the value. */
export function mapJobPriority(rawPriority: string | null, sheet: string, row: number): import("@/generated/prisma/enums").JobPriority {
  const result = normalizePriority(rawPriority);
  for (const w of result.warnings) addWarning(sheet, row, "functionalPriority", rawPriority ?? "", w);
  return result.value;
}

/** Alias for computeIsCritical. */
export const mapIsCritical = computeIsCritical;

/** Alias for computeIsTradeoff. */
export const mapIsTradeoff = computeIsTradeoff;

/** Alias: normalizeDepartment wraps parseDepartment with a fallback. */
export function normalizeDepartment(raw: string | null | undefined): string {
  return parseDepartment(raw) ?? "Unknown";
}

/** Alias: parseQuarter wraps parseQuarterDates, returning simpler type. */
export function parseQuarter(raw: string | null | undefined): { openedAt: Date; targetFillDate: Date } | null {
  const result = parseQuarterDates(raw);
  const { openedAt, targetFillDate } = result.value;
  if (openedAt == null || targetFillDate == null) return null;
  return { openedAt, targetFillDate };
}

/** Alias for assembleDescription. */
export const buildDescription = assembleDescription;

/** Alias: parseExcelDate wraps excelSerialToDate, accepting unknown. */
export function parseExcelDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") return excelSerialToDate(raw);
  if (typeof raw === "string") {
    const s = sanitize(raw);
    if (s == null || s.toUpperCase() === "TBD") return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Alias for parseTempJobId — same signature as wfp-sanitize.ts parseTempJobIdCell. */
export const parseTempJobIdCell = parseTempJobId;
