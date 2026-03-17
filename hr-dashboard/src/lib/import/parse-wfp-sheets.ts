/**
 * WFP Details sheet parsers — "WFP Details - 2026" and "WFP Details - Beyond 2026".
 *
 * Produces arrays of parsed job records ready for ID generation and DB write.
 * Implements PLAN.md §5b and §5c.
 */

import type { WorkBook } from "xlsx";
import { utils as XLSXUtils } from "xlsx";
import type { JobPriority, JobStatus, PipelineHealth } from "@/generated/prisma/enums";
import {
  sanitizeString,
  safeParseInt,
  mapJobStatus,
  mapJobPriority,
  mapIsCritical,
  mapIsTradeoff,
  computePipelineHealth,
  normalizeDepartment,
  normalizeLocation,
  parseQuarter,
  buildDescription,
  isBufferRow,
} from "../wfp-sanitize";
import { wfpJobId } from "../wfp-ids";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedJob {
  id: string;
  importKey: string;
  sourceSheet: string;
  sourceRow: number;
  tempJobId: number | null;
  title: string;
  department: string;
  description: string;
  location: string | null;
  hiringManager: string | null;
  recruiterOwner: string | null;
  status: JobStatus;
  priority: JobPriority;
  pipelineHealth: PipelineHealth | null;
  isCritical: boolean;
  openedAt: Date | null;
  targetFillDate: Date | null;
  closedAt: Date | null;
  // WFP-specific fields
  function: string | null;
  employeeType: string | null;
  level: string | null;
  functionalPriority: string | null;
  corporatePriority: string | null;
  asset: string | null;
  keyCapability: string | null;
  businessRationale: string | null;
  milestone: string | null;
  talentAssessment: string | null;
  horizon: string;
  isTradeoff: boolean;
  recruitingStatus: string | null;
  fpaLevel: string | null;
  fpaTiming: string | null;
  fpaNote: string | null;
  fpaApproved: string | null;
  hiredName: string | null;
  hibobId: number | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Column header → index mapping
// ---------------------------------------------------------------------------



/**
 * Build a column-name → column-index map from the header row.
 * Uses startsWith matching to handle multi-line headers like "FP&A\r\n(CM - Level)".
 */
function buildColumnMap(headerRow: unknown[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < headerRow.length; i++) {
    const raw = headerRow[i];
    if (raw == null) continue;
    const h = String(raw).trim();
    map.set(h, i);
  }
  return map;
}

function cellStr(row: unknown[], col: number | undefined): string | null {
  if (col == null) return null;
  const v = row[col];
  if (v == null) return null;
  return String(v);
}

function cellNum(row: unknown[], col: number | undefined): number | null {
  if (col == null) return null;
  return safeParseInt(row[col]);
}

// ---------------------------------------------------------------------------
// FP&A column matching (2026 sheet only)
// ---------------------------------------------------------------------------

function findFpaColumns(colMap: Map<string, number>): {
  fpaLevel: number | undefined;
  fpaTiming: number | undefined;
  fpaNote: number | undefined;
  fpaApproved: number | undefined;
} {
  let fpaLevel: number | undefined;
  let fpaTiming: number | undefined;
  let fpaNote: number | undefined;
  let fpaApproved: number | undefined;

  for (const [header, idx] of colMap.entries()) {
    const h = header.replace(/\r?\n/g, " ").toLowerCase();
    if (h.includes("fp&a") && h.includes("cm - level")) fpaLevel = idx;
    else if (h.includes("fp&a") && h.includes("cm - timing")) fpaTiming = idx;
    else if (h.includes("fp&a") && h.includes("note")) fpaNote = idx;
    else if (h.includes("fp&a") && h.includes("255 approved")) fpaApproved = idx;
  }

  return { fpaLevel, fpaTiming, fpaNote, fpaApproved };
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

function parseWfpSheet(
  wb: WorkBook,
  sheetName: string,
  horizon: "2026" | "Beyond 2026",
): ParsedJob[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`);
  }

  const rows: unknown[][] = XLSXUtils.sheet_to_json(ws, { header: 1, defval: null });
  if (rows.length < 2) {
    throw new Error(`Sheet "${sheetName}" has no data rows`);
  }

  const headerRow = rows[0] as unknown[];
  const colMap = buildColumnMap(headerRow);

  // Resolve column indices
  const col = {
    tempJobId: colMap.get("Temp Job ID"),
    function: colMap.get("Function"),
    rawDepartment: colMap.get("Department"),
    hiringManager: colMap.get("Requestor / Manager"),
    employeeType: colMap.get("Employee Type"),
    level: colMap.get("Level"),
    title: colMap.get("Title"),
    rawLocation: colMap.get("Location"),
    functionalPriority: colMap.get("Functional Priority"),
    corporatePriority: colMap.get("Corp. Priority"),
    targetStartDt: colMap.get("Target Start Dt"),
    recruitingStatus: colMap.get("Recruiting Status"),
    recruiter: colMap.get("Recruiter"),
    hiredName: colMap.get("Hired Name"),
    hibobId: colMap.get("HiBob ID"),
    asset: colMap.get("Asset"),
    keyCapability: colMap.get("Key Capability"),
    businessRationale: colMap.get("Catalyst for Growth (business rationale, key deliverables, etc.)"),
    milestone: colMap.get("Milestone / Trigger for Hire"),
    talentAssessment: colMap.get("Talent Assessment"),
    tradeoff: colMap.get("Tradeoff?"),
    notes: colMap.get("Notes"),
  };

  // FP&A columns (2026 sheet only)
  const fpa = findFpaColumns(colMap);

  const jobs: ParsedJob[] = [];

  // Data starts at row index 1 (row 0 is header)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const excelRow = i + 1; // 1-based Excel row number

    // Skip buffer rows
    const functionVal = cellStr(row, col.function);
    if (isBufferRow(functionVal)) continue;

    // Skip completely empty rows (no temp ID and no title)
    const rawTempJobId = cellNum(row, col.tempJobId);
    const rawTitle = cellStr(row, col.title);
    if (rawTempJobId == null && (rawTitle == null || sanitizeString(rawTitle) == null)) continue;

    const importKey = `${sheetName}:${excelRow}`;
    const title = sanitizeString(rawTitle) ?? `Untitled Position (Row ${excelRow})`;

    // Department: normalize from the Department column (not Function)
    const rawDept = cellStr(row, col.rawDepartment);
    const department = normalizeDepartment(rawDept);

    // Status
    const rawRecruitingStatus = sanitizeString(cellStr(row, col.recruitingStatus));
    const status = mapJobStatus(rawRecruitingStatus, sheetName, excelRow);

    // Priority
    const rawFunctionalPriority = sanitizeString(cellStr(row, col.functionalPriority));
    const priority = mapJobPriority(rawFunctionalPriority, sheetName, excelRow);

    // Critical
    const rawCorporatePriority = sanitizeString(cellStr(row, col.corporatePriority));
    const isCritical = mapIsCritical(rawCorporatePriority);

    // Location
    const rawLocation = cellStr(row, col.rawLocation);
    const location = normalizeLocation(rawLocation, sheetName, excelRow);

    // Dates
    const rawTiming = cellStr(row, col.targetStartDt);
    const quarterDates = parseQuarter(rawTiming);
    const openedAt = quarterDates?.openedAt ?? null;
    const targetFillDate = quarterDates?.targetFillDate ?? null;

    // closedAt: for closed roles, approximate from targetFillDate
    const closedAt = status === "CLOSED" ? targetFillDate : null;

    // Pipeline health
    const pipelineHealth = computePipelineHealth(status, targetFillDate);

    // Description
    const rawKeyCapability = cellStr(row, col.keyCapability);
    const rawBusinessRationale = cellStr(row, col.businessRationale);
    const rawFunction = sanitizeString(functionVal);
    const description = buildDescription(
      rawKeyCapability,
      rawBusinessRationale,
      title,
      rawFunction,
      department,
    );

    // Tradeoff
    const rawTradeoff = cellStr(row, col.tradeoff);
    const isTradeoffVal = mapIsTradeoff(rawTradeoff);

    const job: ParsedJob = {
      id: wfpJobId(importKey),
      importKey,
      sourceSheet: sheetName,
      sourceRow: excelRow,
      tempJobId: rawTempJobId,
      title,
      department,
      description,
      location,
      hiringManager: sanitizeString(cellStr(row, col.hiringManager)),
      recruiterOwner: sanitizeString(cellStr(row, col.recruiter)),
      status,
      priority,
      pipelineHealth,
      isCritical,
      openedAt,
      targetFillDate,
      closedAt,
      function: rawFunction,
      employeeType: sanitizeString(cellStr(row, col.employeeType)),
      level: sanitizeString(cellStr(row, col.level)),
      functionalPriority: rawFunctionalPriority,
      corporatePriority: rawCorporatePriority,
      asset: sanitizeString(cellStr(row, col.asset)),
      keyCapability: sanitizeString(rawKeyCapability),
      businessRationale: sanitizeString(rawBusinessRationale),
      milestone: sanitizeString(cellStr(row, col.milestone)),
      talentAssessment: sanitizeString(cellStr(row, col.talentAssessment)),
      horizon,
      isTradeoff: isTradeoffVal,
      recruitingStatus: rawRecruitingStatus,
      fpaLevel: sanitizeString(cellStr(row, fpa.fpaLevel)),
      fpaTiming: sanitizeString(cellStr(row, fpa.fpaTiming)),
      fpaNote: sanitizeString(cellStr(row, fpa.fpaNote)),
      fpaApproved: sanitizeString(cellStr(row, fpa.fpaApproved)),
      hiredName: sanitizeString(cellStr(row, col.hiredName)),
      hibobId: cellNum(row, col.hibobId),
      notes: sanitizeString(cellStr(row, col.notes)),
    };

    jobs.push(job);
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse the "WFP Details - 2026" sheet.
 * Expected: 344 usable job rows.
 */
export function parseWfp2026(wb: WorkBook): ParsedJob[] {
  return parseWfpSheet(wb, "WFP Details - 2026", "2026");
}

/**
 * Parse the "WFP Details - Beyond 2026" sheet.
 * Expected: 294 usable job rows.
 */
export function parseWfpBeyond2026(wb: WorkBook): ParsedJob[] {
  return parseWfpSheet(wb, "WFP Details - Beyond 2026", "Beyond 2026");
}
