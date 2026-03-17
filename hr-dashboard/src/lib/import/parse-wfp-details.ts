/**
 * WFP Import — Parser for "WFP Details - 2026" and "WFP Details - Beyond 2026" sheets.
 *
 * Reads rows as arrays-of-arrays to avoid header formatting issues
 * (FP&A headers contain embedded CRLF characters).
 */

import type { WorkSheet } from "xlsx";
import * as XLSX from "xlsx";

import { wfpJobId, wfpCandidateId, wfpApplicationId } from "@/lib/wfp-ids";
import {
  sanitizeString,
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
  getWarnings,
} from "../wfp-sanitize";
import type {
  ParsedJob,
  ParsedCandidate,
  ParsedApplication,
  ImportWarning,
} from "./types";

// ---------------------------------------------------------------------------
// Column indices for WFP Details sheets (0-based)
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
  // FP&A columns (2026 sheet only)
  FPA_LEVEL: 22,
  FPA_TIMING: 23,
  FPA_NOTE: 24,
  FPA_APPROVED: 25,
  // Columns 26-31: FP&A reference columns (not mapped individually)
  NOTES_2026: 32,
} as const;

// ---------------------------------------------------------------------------
// Cell reader helpers
// ---------------------------------------------------------------------------

function cellStr(row: unknown[], col: number): string | null {
  const val = row[col];
  if (val == null) return null;
  return sanitizeString(String(val));
}

function cellInt(row: unknown[], col: number): number | null {
  const val = row[col];
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? Math.round(val) : null;
  const s = sanitizeString(String(val));
  if (s == null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Candidate name extraction (PLAN.md §5f)
// ---------------------------------------------------------------------------

interface ExtractedName {
  firstName: string;
  lastName: string;
}

function extractCandidateName(hiredName: string | null): ExtractedName | null {
  if (hiredName == null) return null;

  let name: string | null = null;

  // "HIRED: First Last"
  const hiredMatch = hiredName.match(/^HIRED:\s*(.+)/i);
  if (hiredMatch?.[1]) name = hiredMatch[1].trim();

  // "CW: First Last"
  if (!name) {
    const cwMatch = hiredName.match(/^CW:\s*(.+)/i);
    if (cwMatch?.[1]) name = cwMatch[1].trim();
  }

  // "Approved at ... - First Last"
  if (!name) {
    const approvedMatch = hiredName.match(/^Approved\s+at\s+.*-\s*(.+)/i);
    if (approvedMatch?.[1]) name = approvedMatch[1].trim();
  }

  if (!name || name.length === 0) return null;

  const parts = name.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: "(none)" };
  }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

// ---------------------------------------------------------------------------
// Status check for candidate extraction eligibility
// ---------------------------------------------------------------------------

const HIRED_STATUSES = new Set(["hired", "hired - cw"]);

function isHiredRow(recruitingStatus: string | null): boolean {
  if (recruitingStatus == null) return false;
  return HIRED_STATUSES.has(recruitingStatus.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WfpDetailsResult {
  jobs: ParsedJob[];
  candidates: ParsedCandidate[];
  applications: ParsedApplication[];
  warnings: ImportWarning[];
}

export function parseWfpDetailsSheet(
  sheet: WorkSheet,
  sheetName: string,
): WfpDetailsResult {
  const isBeyond = sheetName.includes("Beyond 2026");
  const horizon = isBeyond ? "Beyond 2026" : "2026";

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  const jobs: ParsedJob[] = [];
  const candidates: ParsedCandidate[] = [];
  const applications: ParsedApplication[] = [];

  // Skip header row (index 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = i + 1; // 1-based Excel row number

    // Skip buffer rows
    const functionVal = cellStr(row, COL.FUNCTION);
    if (isBufferRow(functionVal)) {
      continue;
    }

    // Skip rows with no temp job ID and no title (completely empty data rows)
    const tempJobId = cellInt(row, COL.TEMP_JOB_ID);
    const title = cellStr(row, COL.TITLE);
    if (tempJobId == null && title == null) {
      continue;
    }

    const importKey = `${sheetName}:${excelRow}`;
    const id = wfpJobId(importKey);

    // Raw field extraction
    const rawRecruitingStatus = cellStr(row, COL.RECRUITING_STATUS);
    const rawFunctionalPriority = cellStr(row, COL.FUNCTIONAL_PRIORITY);
    const rawCorporatePriority = cellStr(row, COL.CORP_PRIORITY);
    const rawLocation = cellStr(row, COL.LOCATION);
    const rawTiming = cellStr(row, COL.TARGET_START_DT);
    const rawDepartment = cellStr(row, COL.DEPARTMENT);
    const rawKeyCapability = cellStr(row, COL.KEY_CAPABILITY);
    const rawBusinessRationale = cellStr(row, COL.BUSINESS_RATIONALE);
    const rawFunction = cellStr(row, COL.FUNCTION);
    const rawTradeoff = cellStr(row, COL.TRADEOFF);
    const rawHiredName = cellStr(row, COL.HIRED_NAME);

    // Normalizations — functions push warnings via addWarning
    const status = mapJobStatus(rawRecruitingStatus, sheetName, excelRow);
    const priority = mapJobPriority(rawFunctionalPriority, sheetName, excelRow);
    const location = normalizeLocation(rawLocation, sheetName, excelRow);
    const quarterDates = parseQuarter(rawTiming);
    const openedAt = quarterDates?.openedAt ?? null;
    const targetFillDate = quarterDates?.targetFillDate ?? null;

    const department = normalizeDepartment(rawDepartment);
    const isCritical = mapIsCritical(rawCorporatePriority);
    const isTradeoff = mapIsTradeoff(rawTradeoff);

    const description = buildDescription(
      rawKeyCapability,
      rawBusinessRationale,
      title ?? "Untitled Position",
      rawFunction,
      department,
    );

    const pipelineHealth = computePipelineHealth(status, targetFillDate);

    // For closed roles, closedAt defaults to targetFillDate
    const closedAt = status === "CLOSED" ? targetFillDate : null;

    const job: ParsedJob = {
      id,
      importKey,
      sourceSheet: sheetName,
      sourceRow: excelRow,
      tempJobId,
      title: title ?? "Untitled Position",
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
      function: rawFunction,
      employeeType: cellStr(row, COL.EMPLOYEE_TYPE),
      level: cellStr(row, COL.LEVEL),
      functionalPriority: rawFunctionalPriority,
      corporatePriority: rawCorporatePriority,
      asset: cellStr(row, COL.ASSET),
      keyCapability: rawKeyCapability,
      businessRationale: rawBusinessRationale,
      milestone: cellStr(row, COL.MILESTONE),
      talentAssessment: cellStr(row, COL.TALENT_ASSESSMENT),
      horizon,
      isTradeoff,
      recruitingStatus: rawRecruitingStatus,
      fpaLevel: isBeyond ? null : cellStr(row, COL.FPA_LEVEL),
      fpaTiming: isBeyond ? null : cellStr(row, COL.FPA_TIMING),
      fpaNote: isBeyond ? null : cellStr(row, COL.FPA_NOTE),
      fpaApproved: isBeyond ? null : cellStr(row, COL.FPA_APPROVED),
      hiredName: rawHiredName,
      hibobId: cellInt(row, COL.HIBOB_ID),
      notes: isBeyond ? null : cellStr(row, COL.NOTES_2026),
    };

    jobs.push(job);

    // Candidate extraction (only from 2026 sheet, only from hired rows)
    if (!isBeyond && isHiredRow(rawRecruitingStatus)) {
      const extracted = extractCandidateName(rawHiredName);
      if (extracted) {
        const candidateId = wfpCandidateId(importKey);
        const applicationId = wfpApplicationId(importKey);

        candidates.push({
          id: candidateId,
          firstName: extracted.firstName,
          lastName: extracted.lastName,
          jobImportKey: importKey,
        });

        applications.push({
          id: applicationId,
          jobId: id,
          candidateId,
          recruiterOwner: job.recruiterOwner,
          stageUpdatedAt: closedAt ?? new Date("2026-03-17"),
        });
      }
    }
  }

  // Capture warnings accumulated during this parse, mapping field name
  const warnings: ImportWarning[] = getWarnings()
    .filter((w) => w.sheet === sheetName)
    .map((w) => ({ sheet: w.sheet, row: w.row, field: w.field, rawValue: w.rawValue, message: w.message }));

  return { jobs, candidates, applications, warnings };
}
