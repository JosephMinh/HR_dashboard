/**
 * WFP Import — Sheet parsers.
 *
 * One parser per workbook sheet. Each reads raw XLSX rows and returns
 * normalized records using utilities from ../wfp-sanitize.ts.
 *
 * Sheets parsed:
 *   1. WFP Details - 2026         (§5b)
 *   2. WFP Details - Beyond 2026  (§5c)
 *   3. 2026 Approved Budget       (§5d)
 *   4. Tradeoffs                  (§5e)
 */

import * as XLSX from "xlsx";

import type { ApplicationStage, CandidateSource } from "../../generated/prisma/enums";
import {
  wfpApplicationId,
  wfpCandidateId,
  wfpJobId,
  wfpProjectionId,
  wfpTradeoffId,
} from "../wfp-ids";
import {
  addWarning,
  buildDescription,
  computePipelineHealth,
  extractCandidateName,
  isBufferRow,
  mapIsCritical,
  mapIsTradeoff,
  mapJobPriority,
  mapJobStatus,
  normalizeDepartment,
  normalizeLocation,
  parseExcelDate,
  parseQuarter,
  parseTempJobIdCell,
  safeParseInt,
  sanitizeString,
} from "../wfp-sanitize";

// ---------------------------------------------------------------------------
// Shared types
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
  status: "OPEN" | "CLOSED" | "ON_HOLD";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  pipelineHealth: "AHEAD" | "ON_TRACK" | "BEHIND" | null;
  isCritical: boolean;
  openedAt: Date | null;
  targetFillDate: Date | null;
  closedAt: Date | null;
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

export interface ParsedCandidate {
  id: string;
  firstName: string;
  lastName: string;
  source: CandidateSource;
  jobImportKey: string;
}

export interface ParsedApplication {
  id: string;
  jobId: string;
  candidateId: string;
  stage: ApplicationStage;
  recruiterOwner: string | null;
  stageUpdatedAt: Date | null;
}

export interface ParsedProjection {
  id: string;
  importKey: string;
  sourceRow: number;
  tempJobId: number | null;
  rawTempJobId: string | null;
  department: string;
  employeeName: string | null;
  level: string | null;
  jobTitle: string | null;
  startDate: Date | null;
  monthlyFte: Record<string, number | null>;
}

export interface ParsedTradeoff {
  id: string;
  importKey: string;
  sourceRow: number;
  rowType: "PAIR" | "SOURCE_ONLY" | "NOTE";
  sourceTempJobId: number | null;
  sourceDepartment: string | null;
  sourceLevel: string | null;
  sourceTitle: string | null;
  targetTempJobId: number | null;
  targetDepartment: string | null;
  targetLevel: string | null;
  targetTitle: string | null;
  levelDifference: number | null;
  status: string | null;
  notes: string | null;
}

export interface WfpParseResult {
  jobs: ParsedJob[];
  candidates: ParsedCandidate[];
  applications: ParsedApplication[];
  projections: ParsedProjection[];
  tradeoffs: ParsedTradeoff[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RawRow = (string | number | boolean | null | undefined)[];

function getSheetRows(wb: XLSX.WorkBook, sheetName: string, headerRow = 0): RawRow[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook`);
  const all: RawRow[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  // Return data rows (everything after the header row)
  return all.slice(headerRow + 1);
}

function cellStr(row: RawRow, col: number): string | null {
  const val = row[col];
  return sanitizeString(val);
}

function cellNum(row: RawRow, col: number): number | null {
  return safeParseInt(row[col]);
}

// ---------------------------------------------------------------------------
// WFP Details sheets — column indices (shared between 2026 and Beyond 2026)
// ---------------------------------------------------------------------------

const COL = {
  TEMP_JOB_ID: 0,
  FUNCTION: 1,
  DEPARTMENT: 2,
  HIRING_MANAGER: 3,
  EMPLOYEE_TYPE: 4,
  LEVEL: 5,
  TITLE: 6,
  LOCATION: 7,
  FUNCTIONAL_PRIORITY: 8,
  CORP_PRIORITY: 9,
  TARGET_START_DT: 10,
  RECRUITING_STATUS: 11,
  RECRUITER: 12,
  HIRED_NAME: 13,
  HIBOB_ID: 14,
  ASSET: 15,
  KEY_CAPABILITY: 16,
  BUSINESS_RATIONALE: 17,
  MILESTONE: 18,
  TALENT_ASSESSMENT: 19,
  HORIZON: 20,
  TRADEOFF: 21,
  // FP&A columns (2026 sheet only, starting at 22)
  FPA_LEVEL: 22,
  FPA_TIMING: 23,
  FPA_NOTE: 24,
  FPA_APPROVED: 25,
  // Notes is the last column
  NOTES_2026: 32,
} as const;

// ---------------------------------------------------------------------------
// §5b — WFP Details - 2026
// ---------------------------------------------------------------------------

function parseWfpDetailRow(
  row: RawRow,
  sheetName: string,
  rowNumber: number,
  horizon: string,
): ParsedJob | null {
  // Skip buffer rows
  if (isBufferRow(cellStr(row, COL.FUNCTION))) return null;

  const rawTitle = cellStr(row, COL.TITLE);
  if (!rawTitle) {
    // No title = likely an empty/garbage row
    addWarning(sheetName, rowNumber, "title", "", "Row has no title — skipping");
    return null;
  }

  const importKey = `${sheetName}:${rowNumber}`;
  const id = wfpJobId(importKey);

  const rawRecruitingStatus = cellStr(row, COL.RECRUITING_STATUS);
  const status = mapJobStatus(rawRecruitingStatus, sheetName, rowNumber);
  const rawFunctionalPriority = cellStr(row, COL.FUNCTIONAL_PRIORITY);
  const priority = mapJobPriority(rawFunctionalPriority, sheetName, rowNumber);
  const rawDepartment = cellStr(row, COL.DEPARTMENT);
  const department = normalizeDepartment(rawDepartment);
  const location = normalizeLocation(cellStr(row, COL.LOCATION), sheetName, rowNumber);
  const rawCorpPriority = cellStr(row, COL.CORP_PRIORITY);
  const isCritical = mapIsCritical(rawCorpPriority);
  const isTradeoff = mapIsTradeoff(cellStr(row, COL.TRADEOFF));

  // Parse timing/dates
  const quarterDates = parseQuarter(cellStr(row, COL.TARGET_START_DT));
  const openedAt = quarterDates?.openedAt ?? null;
  const targetFillDate = quarterDates?.targetFillDate ?? null;

  // For closed roles, closedAt approximates to targetFillDate
  const closedAt = status === "CLOSED" ? (targetFillDate ?? openedAt) : null;

  // Pipeline health
  const pipelineHealth = computePipelineHealth(status, targetFillDate);

  // Description
  const rawKeyCap = cellStr(row, COL.KEY_CAPABILITY);
  const rawBizRationale = cellStr(row, COL.BUSINESS_RATIONALE);
  const funcName = cellStr(row, COL.FUNCTION);
  const description = buildDescription(rawKeyCap, rawBizRationale, rawTitle, funcName, department);

  // FP&A fields (only on 2026 sheet — Beyond 2026 only has 22 columns)
  const is2026 = sheetName.includes("2026") && !sheetName.includes("Beyond");
  const fpaLevel = is2026 ? cellStr(row, COL.FPA_LEVEL) : null;
  const fpaTiming = is2026 ? cellStr(row, COL.FPA_TIMING) : null;
  const fpaNote = is2026 ? cellStr(row, COL.FPA_NOTE) : null;
  const fpaApproved = is2026 ? cellStr(row, COL.FPA_APPROVED) : null;
  const notes = is2026 ? cellStr(row, COL.NOTES_2026) : null;

  return {
    id,
    importKey,
    sourceSheet: sheetName,
    sourceRow: rowNumber,
    tempJobId: cellNum(row, COL.TEMP_JOB_ID),
    title: rawTitle,
    department,
    description,
    location,
    hiringManager: cellStr(row, COL.HIRING_MANAGER),
    recruiterOwner: cellStr(row, COL.RECRUITER),
    status,
    priority,
    pipelineHealth,
    isCritical,
    openedAt,
    targetFillDate,
    closedAt,
    function: funcName,
    employeeType: cellStr(row, COL.EMPLOYEE_TYPE),
    level: cellStr(row, COL.LEVEL),
    functionalPriority: rawFunctionalPriority,
    corporatePriority: rawCorpPriority,
    asset: cellStr(row, COL.ASSET),
    keyCapability: rawKeyCap,
    businessRationale: rawBizRationale,
    milestone: cellStr(row, COL.MILESTONE),
    talentAssessment: cellStr(row, COL.TALENT_ASSESSMENT),
    horizon,
    isTradeoff,
    recruitingStatus: rawRecruitingStatus,
    fpaLevel,
    fpaTiming,
    fpaNote,
    fpaApproved,
    hiredName: cellStr(row, COL.HIRED_NAME),
    hibobId: cellNum(row, COL.HIBOB_ID),
    notes,
  };
}

export function parseWfpDetails2026(wb: XLSX.WorkBook): ParsedJob[] {
  const sheetName = "WFP Details - 2026";
  const rows = getSheetRows(wb, sheetName);
  const jobs: ParsedJob[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 2; // 1-indexed, skip header
    const job = parseWfpDetailRow(row, sheetName, rowNumber, "2026");
    if (job) jobs.push(job);
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// §5c — WFP Details - Beyond 2026
// ---------------------------------------------------------------------------

export function parseWfpDetailsBeyond2026(wb: XLSX.WorkBook): ParsedJob[] {
  const sheetName = "WFP Details - Beyond 2026";
  const rows = getSheetRows(wb, sheetName);
  const jobs: ParsedJob[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 2;
    const job = parseWfpDetailRow(row, sheetName, rowNumber, "Beyond 2026");
    if (job) jobs.push(job);
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// §5f — Candidate and application extraction
// ---------------------------------------------------------------------------

const HIRED_STATUSES = new Set(["hired", "hired - cw", "hiredcw"]);

export function extractCandidatesAndApplications(
  jobs: ParsedJob[],
): { candidates: ParsedCandidate[]; applications: ParsedApplication[] } {
  const candidates: ParsedCandidate[] = [];
  const applications: ParsedApplication[] = [];

  for (const job of jobs) {
    // Only extract from closed/hired rows
    if (job.status !== "CLOSED") continue;

    const rawStatus = job.recruitingStatus?.toLowerCase().trim();
    if (!rawStatus) continue;

    // Check if this is a hired row
    const isHired = HIRED_STATUSES.has(rawStatus) || rawStatus === "hired";
    // Also handle the special "Approved at..." pattern
    const hasHiredName = job.hiredName != null;

    if (!isHired && !hasHiredName) continue;

    const extracted = extractCandidateName(job.hiredName);
    if (!extracted) continue;

    const candidateId = wfpCandidateId(job.importKey);
    const applicationId = wfpApplicationId(job.importKey);

    candidates.push({
      id: candidateId,
      firstName: extracted.firstName,
      lastName: extracted.lastName,
      source: "OTHER" as CandidateSource,
      jobImportKey: job.importKey,
    });

    applications.push({
      id: applicationId,
      jobId: job.id,
      candidateId,
      stage: "HIRED" as ApplicationStage,
      recruiterOwner: job.recruiterOwner,
      stageUpdatedAt: job.closedAt,
    });
  }

  return { candidates, applications };
}

// ---------------------------------------------------------------------------
// §5d — 2026 Approved Budget
// ---------------------------------------------------------------------------

// Budget column indices (headers on row 7, 0-indexed)
const BUDGET_COL = {
  TEMP_JOB_ID: 0,
  DEPARTMENT: 1,
  EMPLOYEE_NAME: 2,
  LEVEL: 3,
  JOB_TITLE: 4,
  // 5 = "check" (skip)
  START_DATE: 6,
  // 7 = Start Date (Month), 8 = Start Date (Year) — derived, skip
  // 9-20 = Monthly FTE year 1 (Jan-Dec)
  // 21-32 = Monthly FTE year 2
  // 33-44 = Monthly FTE year 3
  FTE_START: 9,
} as const;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseMonthlyFte(row: RawRow): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  // Parse 3 years of monthly FTE data (36 columns starting at index 9)
  const years = ["Y1", "Y2", "Y3"];
  for (let y = 0; y < 3; y++) {
    for (let m = 0; m < 12; m++) {
      const colIdx = BUDGET_COL.FTE_START + y * 12 + m;
      const val = row[colIdx];
      const key = `${years[y]}_${MONTH_NAMES[m]}`;
      if (val == null || val === "") {
        result[key] = null;
      } else if (typeof val === "number") {
        result[key] = val;
      } else {
        const parsed = parseFloat(String(val));
        result[key] = Number.isNaN(parsed) ? null : parsed;
      }
    }
  }
  return result;
}

export function parseBudget(wb: XLSX.WorkBook): ParsedProjection[] {
  const sheetName = "2026 Approved Budget";
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook`);

  // Headers on row 7 (0-indexed: 6), data starts at row 8 (0-indexed: 7)
  const all: RawRow[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const dataRows = all.slice(7); // Skip header rows (0-6)
  const projections: ParsedProjection[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowNumber = i + 8; // 1-indexed row number in the spreadsheet

    // Skip empty rows
    const rawDept = cellStr(row, BUDGET_COL.DEPARTMENT);
    if (!rawDept) continue;

    const importKey = `${sheetName}:${rowNumber}`;
    const id = wfpProjectionId(importKey);

    const { tempJobId, rawTempJobId } = parseTempJobIdCell(row[BUDGET_COL.TEMP_JOB_ID]);
    const startDate = parseExcelDate(row[BUDGET_COL.START_DATE]);

    projections.push({
      id,
      importKey,
      sourceRow: rowNumber,
      tempJobId,
      rawTempJobId,
      department: normalizeDepartment(rawDept),
      employeeName: cellStr(row, BUDGET_COL.EMPLOYEE_NAME),
      level: cellStr(row, BUDGET_COL.LEVEL),
      jobTitle: cellStr(row, BUDGET_COL.JOB_TITLE),
      startDate,
      monthlyFte: parseMonthlyFte(row),
    });
  }

  return projections;
}

// ---------------------------------------------------------------------------
// §5e — Tradeoffs
// ---------------------------------------------------------------------------

const TRADEOFF_COL = {
  SOURCE_TEMP_JOB_ID: 0,
  SOURCE_DEPARTMENT: 1,
  SOURCE_LEVEL: 2,
  SOURCE_TITLE: 3,
  LEVEL_DIFF: 4,
  TARGET_TEMP_JOB_ID: 5,
  TARGET_DEPARTMENT: 6,
  TARGET_LEVEL: 7,
  TARGET_TITLE: 8,
  STATUS: 9,
} as const;

export function parseTradeoffs(wb: XLSX.WorkBook): ParsedTradeoff[] {
  const sheetName = "Tradeoffs";
  const rows = getSheetRows(wb, sheetName);
  const tradeoffs: ParsedTradeoff[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 2; // 1-indexed, skip header

    const sourceTempJobId = cellNum(row, TRADEOFF_COL.SOURCE_TEMP_JOB_ID);
    const targetTempJobId = cellNum(row, TRADEOFF_COL.TARGET_TEMP_JOB_ID);
    const levelDiff = cellNum(row, TRADEOFF_COL.LEVEL_DIFF);
    const sourceDept = cellStr(row, TRADEOFF_COL.SOURCE_DEPARTMENT);
    const targetDept = cellStr(row, TRADEOFF_COL.TARGET_DEPARTMENT);
    const sourceTitle = cellStr(row, TRADEOFF_COL.SOURCE_TITLE);
    const targetTitle = cellStr(row, TRADEOFF_COL.TARGET_TITLE);
    const status = cellStr(row, TRADEOFF_COL.STATUS);

    // Skip summary row: no IDs and only has a level difference (the -7 row)
    if (
      sourceTempJobId == null &&
      targetTempJobId == null &&
      levelDiff != null &&
      !sourceDept &&
      !targetDept
    ) {
      addWarning(sheetName, rowNumber, "row", "", "Summary row skipped (no IDs, only level diff)");
      continue;
    }

    // Skip completely empty rows
    if (
      sourceTempJobId == null &&
      targetTempJobId == null &&
      !sourceDept &&
      !targetDept &&
      !sourceTitle &&
      !targetTitle &&
      !status
    ) {
      continue;
    }

    // Determine row type
    let rowType: "PAIR" | "SOURCE_ONLY" | "NOTE";
    if (sourceTempJobId != null && targetTempJobId != null) {
      rowType = "PAIR";
    } else if (sourceTempJobId != null) {
      rowType = "SOURCE_ONLY";
    } else {
      rowType = "NOTE";
    }

    const importKey = `${sheetName}:${rowNumber}`;
    const id = wfpTradeoffId(importKey);

    tradeoffs.push({
      id,
      importKey,
      sourceRow: rowNumber,
      rowType,
      sourceTempJobId,
      sourceDepartment: sourceDept,
      sourceLevel: cellStr(row, TRADEOFF_COL.SOURCE_LEVEL),
      sourceTitle,
      targetTempJobId,
      targetDepartment: targetDept,
      targetLevel: cellStr(row, TRADEOFF_COL.TARGET_LEVEL),
      targetTitle,
      levelDifference: levelDiff,
      status,
      notes: null,
    });
  }

  return tradeoffs;
}

// ---------------------------------------------------------------------------
// Main parse function — parses entire workbook
// ---------------------------------------------------------------------------

export function parseWfpWorkbook(filePath: string): WfpParseResult {
  const wb = XLSX.readFile(filePath);

  // Parse job sheets
  const jobs2026 = parseWfpDetails2026(wb);
  const jobsBeyond = parseWfpDetailsBeyond2026(wb);
  const allJobs = [...jobs2026, ...jobsBeyond];

  // Extract candidates and applications from hired rows
  const { candidates, applications } = extractCandidatesAndApplications(allJobs);

  // Parse budget
  const projections = parseBudget(wb);

  // Parse tradeoffs
  const tradeoffs = parseTradeoffs(wb);

  return {
    jobs: allJobs,
    candidates,
    applications,
    projections,
    tradeoffs,
  };
}
