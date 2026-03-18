/**
 * WFP Import — Sanitization utilities and field mapping/normalization.
 *
 * All mapping rules come from PLAN.md sections 4a–4i and 5a.
 * Every unknown value is logged, never silently dropped.
 */

import type { JobPriority, JobStatus, PipelineHealth } from "../generated/prisma/enums";

// ---------------------------------------------------------------------------
// General sanitization (PLAN.md §5a)
// ---------------------------------------------------------------------------

/** Replace NBSP (U+00A0) with regular spaces and trim. */
export function sanitizeString(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\u00a0/g, " ").trim();
  return s.length === 0 ? null : s;
}

/** sanitizeString but collapse repeated internal whitespace. */
export function sanitizeAndCollapse(raw: unknown): string | null {
  const s = sanitizeString(raw);
  if (s == null) return null;
  return s.replace(/\s{2,}/g, " ");
}

/** Parse an integer from a potentially messy cell value. Returns null on failure. */
export function safeParseInt(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : null;
  const s = sanitizeString(raw);
  if (s == null) return null;
  // Extract leading integer from strings like "6000 (5357 Previously)"
  const match = s.match(/^(\d+)/);
  if (!match?.[1]) return null;
  const n = parseInt(match[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Import warnings
// ---------------------------------------------------------------------------

export type ImportWarning = {
  sheet: string;
  row: number;
  field: string;
  rawValue: string;
  message: string;
};

const warnings: ImportWarning[] = [];

export function addWarning(sheet: string, row: number, field: string, rawValue: string, message: string): void {
  warnings.push({ sheet, row, field, rawValue, message });
}

export function getWarnings(): ImportWarning[] {
  return [...warnings];
}

export function clearWarnings(): void {
  warnings.length = 0;
}

// ---------------------------------------------------------------------------
// Job status mapping (PLAN.md §4a)
// ---------------------------------------------------------------------------

const RECRUITING_STATUS_MAP: Record<string, JobStatus> = {
  open: "OPEN",
  offer: "OPEN",
  agency: "OPEN",
  hired: "CLOSED",
  "hired - cw": "CLOSED",
};

export function mapJobStatus(
  recruitingStatus: string | null,
  sheet: string,
  row: number,
): JobStatus {
  if (sheet === "WFP Details - Beyond 2026") return "ON_HOLD";

  if (recruitingStatus == null || recruitingStatus === "") return "ON_HOLD";

  const normalized = recruitingStatus.toLowerCase().trim();
  const mapped = RECRUITING_STATUS_MAP[normalized];
  if (mapped) return mapped;

  addWarning(sheet, row, "recruitingStatus", recruitingStatus, `Unknown recruiting status, defaulting to ON_HOLD`);
  return "ON_HOLD";
}

// ---------------------------------------------------------------------------
// Priority mapping (PLAN.md §4b)
// ---------------------------------------------------------------------------

export function mapJobPriority(
  rawFunctionalPriority: string | null,
  sheet: string,
  row: number,
): JobPriority {
  if (rawFunctionalPriority == null) return "LOW";

  const trimmed = rawFunctionalPriority.trim();
  if (trimmed === "") return "LOW";

  // Try numeric parse first
  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) {
    if (num === 1) return "CRITICAL";
    if (num === 2) return "HIGH";
    if (num === 3 || num === 4) return "MEDIUM";
    return "LOW";
  }

  // Non-numeric values get logged
  addWarning(sheet, row, "functionalPriority", trimmed, `Non-numeric priority value, defaulting to LOW`);
  return "LOW";
}

// ---------------------------------------------------------------------------
// isCritical (PLAN.md §4c)
// ---------------------------------------------------------------------------

export function mapIsCritical(corporatePriority: string | null): boolean {
  if (corporatePriority == null) return false;
  return corporatePriority.trim().length > 0;
}

// ---------------------------------------------------------------------------
// isTradeoff (PLAN.md §4d)
// ---------------------------------------------------------------------------

export function mapIsTradeoff(tradeoffCell: string | null): boolean {
  const s = sanitizeString(tradeoffCell);
  return s != null && s.length > 0;
}

// ---------------------------------------------------------------------------
// Pipeline health (PLAN.md §4e)
// ---------------------------------------------------------------------------

/** Pinned "as of" date for pipeline health computation during import. */
export const PIPELINE_HEALTH_AS_OF = new Date("2026-03-17");
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function toUtcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function computePipelineHealth(
  status: JobStatus,
  targetFillDate: Date | null,
): PipelineHealth | null {
  if (status !== "OPEN") return null;

  if (targetFillDate == null) return "ON_TRACK";

  const targetDayStart = toUtcDayStart(targetFillDate);
  const asOfDayStart = toUtcDayStart(PIPELINE_HEALTH_AS_OF);
  const diffDays = (targetDayStart - asOfDayStart) / MS_PER_DAY;

  if (diffDays < 0) return "BEHIND";

  if (diffDays <= 60) return "ON_TRACK";
  return "AHEAD";
}

// ---------------------------------------------------------------------------
// Department normalization (PLAN.md §4f)
// ---------------------------------------------------------------------------

/** Strip numeric prefix: "930 Communications" -> "Communications" */
export function normalizeDepartment(raw: string | null): string {
  if (raw == null) return "Unknown";
  const s = sanitizeString(raw);
  if (s == null) return "Unknown";
  return s.replace(/^\d+\s+/, "");
}

// ---------------------------------------------------------------------------
// Location normalization (PLAN.md §4g)
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

export function normalizeLocation(
  raw: string | null,
  sheet: string,
  row: number,
): string | null {
  const s = sanitizeAndCollapse(raw);
  if (s == null) return null;

  const key = s.toLowerCase();
  const mapped = LOCATION_MAP[key];
  if (mapped) return mapped;

  addWarning(sheet, row, "location", s, `Unknown location value, keeping as-is`);
  return s;
}

// ---------------------------------------------------------------------------
// Date parsing (PLAN.md §4h)
// ---------------------------------------------------------------------------

const QUARTER_REGEX = /^(\d{4})\s*Q([1-4])$/i;

export type QuarterDates = {
  openedAt: Date;
  targetFillDate: Date;
};

export function parseQuarter(raw: string | null): QuarterDates | null {
  const s = sanitizeString(raw);
  if (s == null || s.toUpperCase() === "TBD") return null;

  const match = s.match(QUARTER_REGEX);
  if (!match?.[1] || !match[2]) return null;

  const year = parseInt(match[1]!, 10);
  const quarter = parseInt(match[2]!, 10);

  const quarterStartMonth = (quarter - 1) * 3; // 0-indexed: 0, 3, 6, 9
  const openedAt = new Date(Date.UTC(year, quarterStartMonth, 1));

  // End of quarter: last day of the quarter's last month
  const endMonth = quarterStartMonth + 3; // 3, 6, 9, 12
  const targetFillDate = new Date(Date.UTC(year, endMonth, 0)); // day 0 = last day of prev month

  return { openedAt, targetFillDate };
}

/** Parse an Excel serial date number to a JS Date. */
export function parseExcelDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    // Excel serial date: days since 1899-12-30 (with the 1900 leap year bug)
    const msPerDay = 24 * 60 * 60 * 1000;
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(excelEpoch.getTime() + raw * msPerDay);
  }
  // Try ISO string parse
  if (typeof raw === "string") {
    const s = sanitizeString(raw);
    if (s == null || s.toUpperCase() === "TBD") return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Description building (PLAN.md §4i)
// ---------------------------------------------------------------------------

export function buildDescription(
  keyCapability: string | null,
  businessRationale: string | null,
  title: string,
  functionName: string | null,
  department: string,
): string {
  const parts: string[] = [];

  const cap = sanitizeString(keyCapability);
  if (cap && cap.length > 10) parts.push(cap);

  const rat = sanitizeString(businessRationale);
  if (rat && rat.length > 10) parts.push(rat);

  if (parts.length > 0) {
    const desc = parts.join("\n\n");
    if (desc.length >= 10) return desc;
  }

  // Fallback: build from title, function, department
  const funcPart = functionName ? `, ${functionName}` : "";
  return `${title} -- ${department}${funcPart}`;
}

// ---------------------------------------------------------------------------
// Buffer row detection (PLAN.md §5a)
// ---------------------------------------------------------------------------

/** Returns true if the row should be skipped (buffer/header rows). */
export function isBufferRow(functionValue: string | null): boolean {
  if (functionValue == null) return false;
  return functionValue.toUpperCase().includes("BUFFER");
}

// ---------------------------------------------------------------------------
// Candidate name extraction (PLAN.md §5f)
// ---------------------------------------------------------------------------

export type ExtractedCandidate = {
  firstName: string;
  lastName: string;
};

/**
 * Extract candidate name from hired row notes/name cell.
 * Handles patterns: "HIRED: First Last", "CW: First Last",
 * "Approved at 2025 re-forecast - First Last"
 */
export function extractCandidateName(hiredName: string | null): ExtractedCandidate | null {
  const s = sanitizeString(hiredName);
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
// Raw temp job ID preservation (PLAN.md §5d special cases)
// ---------------------------------------------------------------------------

/**
 * Parse a potentially complex temp job ID cell.
 * Handles cases like "6000 (5357 Previously)" - returns leading integer.
 * Preserves the raw string for auditability.
 */
export function parseTempJobIdCell(raw: unknown): { tempJobId: number | null; rawTempJobId: string | null } {
  const s = sanitizeString(raw);
  if (s == null) return { tempJobId: null, rawTempJobId: null };

  const tempJobId = safeParseInt(s);
  // Only preserve rawTempJobId if the cell contains more than just the number
  const rawTempJobId = (tempJobId != null && s !== String(tempJobId)) ? s : null;

  return { tempJobId, rawTempJobId };
}
