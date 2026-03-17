/**
 * WFP Import — Sheet parsers for the four data sheets in the WFP workbook.
 *
 * Each parser reads a specific sheet and produces typed records ready for
 * database insertion. Field normalization uses wfp-sanitize.ts.
 * ID generation uses wfp-ids.ts.
 *
 * Parsers produce intermediate typed records — they do NOT write to the
 * database or resolve cross-sheet references (matchedJobId). That happens
 * in the database write orchestration step.
 */

import type { WorkBook } from "xlsx";
import * as XLSX from "xlsx";

import type { ApplicationStage, CandidateSource } from "../generated/prisma/enums";
import {
  wfpJobId,
  wfpCandidateId,
  wfpApplicationId,
  wfpProjectionId,
  wfpTradeoffId,
} from "./wfp-ids";
import {
  sanitizeString,
  safeParseInt,
  addWarning,
  isBufferRow,
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
  extractCandidateName,
  parseTempJobIdCell,
} from "./wfp-sanitize";

// ---------------------------------------------------------------------------
// Parsed record types
// ---------------------------------------------------------------------------

export type ParsedJob = {
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
};

export type ParsedCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  source: CandidateSource;
  jobImportKey: string;
};

export type ParsedApplication = {
  id: string;
  jobId: string;
  candidateId: string;
  stage: ApplicationStage;
  recruiterOwner: string | null;
  stageUpdatedAt: Date | null;
  jobImportKey: string;
};

export type ParsedHeadcountProjection = {
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
};

export type ParsedTradeoff = {
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
};

// ---------------------------------------------------------------------------
// Helper: read a sheet as array-of-arrays
// ---------------------------------------------------------------------------

function readSheet(wb: WorkBook, sheetName: string, headerRow = 0): unknown[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook`);
  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    range: headerRow,
  });
  return data;
}

function cellStr(row: unknown[], col: number): string | null {
  return sanitizeString(row[col]);
}

function cellInt(row: unknown[], col: number): number | null {
  return safeParseInt(row[col]);
}

function cellRaw(row: unknown[], col: number): unknown {
  return row[col] ?? null;
}

// ---------------------------------------------------------------------------
// WFP Details - 2026 parser (PLAN.md §5b)
// ---------------------------------------------------------------------------

const SHEET_2026 = "WFP Details - 2026";

export function parseWfpDetails2026(wb: WorkBook): {
  jobs: ParsedJob[];
  candidates: ParsedCandidate[];
  applications: ParsedApplication[];
} {
  const rows = readSheet(wb, SHEET_2026);
  const jobs: ParsedJob[] = [];
  const candidates: ParsedCandidate[] = [];
  const applications: ParsedApplication[] = [];

  // Skip header (row 0), start from row 1
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = i + 1; // 1-based Excel row number

    const functionVal = cellStr(row, 1);
    if (isBufferRow(functionVal)) continue;

    const tempJobId = cellInt(row, 0);
    const rawDepartment = cellStr(row, 2);
    const department = normalizeDepartment(rawDepartment);
    const title = cellStr(row, 6) ?? `Untitled Position ${excelRow}`;
    const recruitingStatus = cellStr(row, 11);
    const status = mapJobStatus(recruitingStatus, SHEET_2026, excelRow);

    const importKey = `${SHEET_2026}:${excelRow}`;
    const id = wfpJobId(importKey);

    const rawPriority = cellStr(row, 8);
    const priority = mapJobPriority(rawPriority, SHEET_2026, excelRow);

    const corporatePriority = cellStr(row, 9);
    const isCritical = mapIsCritical(corporatePriority);

    const quarterStr = cellStr(row, 10);
    const quarterDates = parseQuarter(quarterStr);

    const openedAt = quarterDates?.openedAt ?? null;
    const targetFillDate = quarterDates?.targetFillDate ?? null;
    const closedAt = status === "CLOSED" ? targetFillDate : null;

    const pipelineHealth = computePipelineHealth(status, targetFillDate);

    const keyCapability = cellStr(row, 16);
    const businessRationale = cellStr(row, 17);
    const description = buildDescription(keyCapability, businessRationale, title, functionVal, department);

    const hiredName = cellStr(row, 13);
    const location = normalizeLocation(cellStr(row, 7), SHEET_2026, excelRow);

    const job: ParsedJob = {
      id,
      importKey,
      sourceSheet: SHEET_2026,
      sourceRow: excelRow,
      tempJobId,
      title,
      department,
      description,
      location,
      hiringManager: cellStr(row, 3),
      recruiterOwner: cellStr(row, 12),
      status,
      priority,
      pipelineHealth,
      isCritical,
      openedAt,
      targetFillDate,
      closedAt,
      function: functionVal,
      employeeType: cellStr(row, 4),
      level: cellStr(row, 5),
      functionalPriority: rawPriority,
      corporatePriority,
      asset: cellStr(row, 15),
      keyCapability,
      businessRationale,
      milestone: cellStr(row, 18),
      talentAssessment: cellStr(row, 19),
      horizon: "2026",
      isTradeoff: mapIsTradeoff(cellStr(row, 21)),
      recruitingStatus,
      fpaLevel: cellStr(row, 22),
      fpaTiming: cellStr(row, 23),
      fpaNote: cellStr(row, 24),
      fpaApproved: cellStr(row, 25),
      hiredName,
      hibobId: cellInt(row, 14),
      notes: cellStr(row, 32),
    };

    jobs.push(job);

    // Extract candidate from hired rows (PLAN.md §5f)
    if (status === "CLOSED" && hiredName) {
      const extracted = extractCandidateName(hiredName);
      if (extracted) {
        const candidateId = wfpCandidateId(importKey);
        const applicationId = wfpApplicationId(importKey);

        candidates.push({
          id: candidateId,
          firstName: extracted.firstName,
          lastName: extracted.lastName,
          source: "OTHER" as CandidateSource,
          jobImportKey: importKey,
        });

        applications.push({
          id: applicationId,
          jobId: id,
          candidateId,
          stage: "HIRED" as ApplicationStage,
          recruiterOwner: job.recruiterOwner,
          stageUpdatedAt: closedAt,
          jobImportKey: importKey,
        });
      }
    }
  }

  console.log(`[${SHEET_2026}] Parsed ${jobs.length} jobs, ${candidates.length} candidates, ${applications.length} applications`);
  return { jobs, candidates, applications };
}

// ---------------------------------------------------------------------------
// WFP Details - Beyond 2026 parser (PLAN.md §5c)
// ---------------------------------------------------------------------------

const SHEET_BEYOND = "WFP Details - Beyond 2026";

export function parseWfpDetailsBeyond2026(wb: WorkBook): { jobs: ParsedJob[] } {
  const rows = readSheet(wb, SHEET_BEYOND);
  const jobs: ParsedJob[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = i + 1;

    const functionVal = cellStr(row, 1);
    if (isBufferRow(functionVal)) continue;

    const tempJobId = cellInt(row, 0);
    const rawDepartment = cellStr(row, 2);
    const department = normalizeDepartment(rawDepartment);
    const title = cellStr(row, 6) ?? `Untitled Position ${excelRow}`;

    const importKey = `${SHEET_BEYOND}:${excelRow}`;
    const id = wfpJobId(importKey);

    const recruitingStatus = cellStr(row, 11);
    // All Beyond 2026 jobs are ON_HOLD regardless of recruiting status
    const status = mapJobStatus(recruitingStatus, SHEET_BEYOND, excelRow);

    const rawPriority = cellStr(row, 8);
    const priority = mapJobPriority(rawPriority, SHEET_BEYOND, excelRow);

    const corporatePriority = cellStr(row, 9);
    const isCritical = mapIsCritical(corporatePriority);

    const quarterStr = cellStr(row, 10);
    const quarterDates = parseQuarter(quarterStr);

    const keyCapability = cellStr(row, 16);
    const businessRationale = cellStr(row, 17);
    const description = buildDescription(keyCapability, businessRationale, title, functionVal, department);

    const location = normalizeLocation(cellStr(row, 7), SHEET_BEYOND, excelRow);

    jobs.push({
      id,
      importKey,
      sourceSheet: SHEET_BEYOND,
      sourceRow: excelRow,
      tempJobId,
      title,
      department,
      description,
      location,
      hiringManager: cellStr(row, 3),
      recruiterOwner: cellStr(row, 12),
      status,
      priority,
      pipelineHealth: null, // Beyond 2026 jobs have no pipeline health
      isCritical,
      openedAt: quarterDates?.openedAt ?? null,
      targetFillDate: quarterDates?.targetFillDate ?? null,
      closedAt: null,
      function: functionVal,
      employeeType: cellStr(row, 4),
      level: cellStr(row, 5),
      functionalPriority: rawPriority,
      corporatePriority,
      asset: cellStr(row, 15),
      keyCapability,
      businessRationale,
      milestone: cellStr(row, 18),
      talentAssessment: cellStr(row, 19),
      horizon: "Beyond 2026",
      isTradeoff: mapIsTradeoff(cellStr(row, 21)),
      recruitingStatus,
      fpaLevel: null,
      fpaTiming: null,
      fpaNote: null,
      fpaApproved: null,
      hiredName: cellStr(row, 13),
      hibobId: cellInt(row, 14),
      notes: null, // Beyond 2026 sheet has no Notes column
    });
  }

  console.log(`[${SHEET_BEYOND}] Parsed ${jobs.length} jobs`);
  return { jobs };
}

// ---------------------------------------------------------------------------
// 2026 Approved Budget parser (PLAN.md §5d)
// ---------------------------------------------------------------------------

const SHEET_BUDGET = "2026 Approved Budget";
const BUDGET_HEADER_ROW = 6; // 0-indexed
const BUDGET_MONTHS_START = 9; // Column index where monthly data begins
const MONTHS_PER_YEAR = 12;
const BUDGET_YEARS = [2024, 2025, 2026];

export function parseBudgetSheet(wb: WorkBook): { projections: ParsedHeadcountProjection[] } {
  const rows = readSheet(wb, SHEET_BUDGET, BUDGET_HEADER_ROW);
  const projections: ParsedHeadcountProjection[] = [];

  // Skip header (row 0 after offset), start from row 1
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = BUDGET_HEADER_ROW + i + 1; // 1-based Excel row

    const importKey = `${SHEET_BUDGET}:${excelRow}`;
    const { tempJobId, rawTempJobId } = parseTempJobIdCell(row[0]);
    const department = normalizeDepartment(cellStr(row, 1));

    // Skip rows with no department and no temp ID (empty rows)
    if (department === "Unknown" && tempJobId == null && !cellStr(row, 2)) continue;

    const startDateRaw = cellRaw(row, 6);
    const startDate = parseExcelDate(startDateRaw);

    // Build monthly FTE JSON
    const monthlyFte: Record<string, number | null> = {};
    for (let yearIdx = 0; yearIdx < BUDGET_YEARS.length; yearIdx++) {
      const year = BUDGET_YEARS[yearIdx]!;
      for (let monthIdx = 0; monthIdx < MONTHS_PER_YEAR; monthIdx++) {
        const colIdx = BUDGET_MONTHS_START + yearIdx * MONTHS_PER_YEAR + monthIdx;
        const rawVal = row[colIdx];
        const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
        if (rawVal == null) {
          monthlyFte[key] = null;
        } else if (typeof rawVal === "number") {
          monthlyFte[key] = rawVal;
        } else {
          const parsed = parseFloat(String(rawVal));
          monthlyFte[key] = isNaN(parsed) ? null : parsed;
        }
      }
    }

    projections.push({
      id: wfpProjectionId(importKey),
      importKey,
      sourceRow: excelRow,
      tempJobId,
      rawTempJobId,
      department,
      employeeName: cellStr(row, 2),
      level: cellStr(row, 3),
      jobTitle: cellStr(row, 4),
      startDate,
      monthlyFte,
    });
  }

  console.log(`[${SHEET_BUDGET}] Parsed ${projections.length} headcount projections`);
  return { projections };
}

// ---------------------------------------------------------------------------
// Tradeoffs parser (PLAN.md §5e)
// ---------------------------------------------------------------------------

const SHEET_TRADEOFFS = "Tradeoffs";

export function parseTradeoffsSheet(wb: WorkBook): { tradeoffs: ParsedTradeoff[] } {
  const rows = readSheet(wb, SHEET_TRADEOFFS);
  const tradeoffs: ParsedTradeoff[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = i + 1;

    const importKey = `${SHEET_TRADEOFFS}:${excelRow}`;

    const sourceTempJobId = cellInt(row, 0);
    const sourceDepartment = cellStr(row, 1);
    const sourceLevel = cellStr(row, 2);
    const sourceTitle = cellStr(row, 3);
    const levelDiff = cellInt(row, 4);
    const targetTempJobId = cellInt(row, 5);
    const targetDepartment = cellStr(row, 6);
    const targetLevel = cellStr(row, 7);
    const targetTitle = cellStr(row, 8);
    const status = cellStr(row, 9);

    // Skip summary row: no IDs and Dif = -7
    if (sourceTempJobId == null && targetTempJobId == null && levelDiff === -7) {
      addWarning(SHEET_TRADEOFFS, excelRow, "row", "summary", "Skipping summary aggregate row (Dif=-7)");
      continue;
    }

    // Skip completely empty rows
    const hasAnyContent = sourceTempJobId != null || targetTempJobId != null ||
      sourceDepartment != null || targetDepartment != null ||
      sourceTitle != null || targetTitle != null || status != null;
    if (!hasAnyContent) continue;

    // Classify row type
    let rowType: "PAIR" | "SOURCE_ONLY" | "NOTE";
    if (sourceTempJobId != null && targetTempJobId != null) {
      rowType = "PAIR";
    } else if (sourceTempJobId != null) {
      rowType = "SOURCE_ONLY";
    } else {
      rowType = "NOTE";
    }

    tradeoffs.push({
      id: wfpTradeoffId(importKey),
      importKey,
      sourceRow: excelRow,
      rowType,
      sourceTempJobId,
      sourceDepartment,
      sourceLevel,
      sourceTitle,
      targetTempJobId,
      targetDepartment,
      targetLevel,
      targetTitle,
      levelDifference: levelDiff,
      status,
      notes: null,
    });
  }

  console.log(`[${SHEET_TRADEOFFS}] Parsed ${tradeoffs.length} tradeoff records`);
  return { tradeoffs };
}

// ---------------------------------------------------------------------------
// Master parse function
// ---------------------------------------------------------------------------

export type WfpParseResult = {
  jobs: ParsedJob[];
  candidates: ParsedCandidate[];
  applications: ParsedApplication[];
  projections: ParsedHeadcountProjection[];
  tradeoffs: ParsedTradeoff[];
};

export function parseWfpWorkbook(filePath: string): WfpParseResult {
  const wb = XLSX.readFile(filePath);

  const details2026 = parseWfpDetails2026(wb);
  const detailsBeyond = parseWfpDetailsBeyond2026(wb);
  const budget = parseBudgetSheet(wb);
  const tradeoffs = parseTradeoffsSheet(wb);

  const allJobs = [...details2026.jobs, ...detailsBeyond.jobs];

  return {
    jobs: allJobs,
    candidates: details2026.candidates,
    applications: details2026.applications,
    projections: budget.projections,
    tradeoffs: tradeoffs.tradeoffs,
  };
}
