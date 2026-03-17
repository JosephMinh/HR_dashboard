/**
 * WFP Import — Parser for "2026 Approved Budget" sheet.
 *
 * Headers are on row 7, data begins row 8.
 * Month columns are duplicated (3 years x 12 months) — we read as
 * arrays-of-arrays and map by column index.
 */

import type { WorkSheet } from "xlsx";
import * as XLSX from "xlsx";

import { wfpProjectionId } from "@/lib/wfp-ids";
import { sanitize, excelSerialToDate, parseTempJobId } from "./normalize";
import type { ParsedProjection, ImportWarning } from "./types";

// ---------------------------------------------------------------------------
// Column indices (0-based, starting from column B in the workbook)
// ---------------------------------------------------------------------------

// The sheet ref starts at B1, so when reading as array-of-arrays,
// column A is empty/missing. The xlsx library handles this by
// setting the range from B onward. With header:1 on the full sheet,
// the first cell in each row is column B.

const COL = {
  TEMP_JOB_ID: 0,  // Column B
  DEPARTMENT: 1,    // Column C
  EMPLOYEE_NAME: 2, // Column D
  LEVEL: 3,         // Column E
  JOB_TITLE: 4,     // Column F
  CHECK: 5,         // Column G (skip)
  START_DATE: 6,    // Column H
  START_MONTH: 7,   // Column I (skip — derived)
  START_YEAR: 8,    // Column J (skip — derived)
} as const;

// Month columns start at index 9 (column K) and repeat 36 times:
// Jan 2024 .. Dec 2024 (12), Jan 2025 .. Dec 2025 (12), Jan 2026 .. Dec 2026 (12)
const MONTH_START_COL = 9;
const MONTHS_PER_YEAR = 12;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEARS = [2024, 2025, 2026];

function monthColKey(yearIdx: number, monthIdx: number): string {
  return `${MONTH_NAMES[monthIdx]}_${YEARS[yearIdx]}`;
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function cellStr(row: unknown[], col: number): string | null {
  const val = row[col];
  if (val == null) return null;
  return sanitize(String(val));
}

function cellNum(row: unknown[], col: number): number | null {
  const val = row[col];
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  const s = sanitize(String(val));
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BudgetResult {
  projections: ParsedProjection[];
  warnings: ImportWarning[];
}

export function parseBudgetSheet(sheet: WorkSheet): BudgetResult {
  const sheetName = "2026 Approved Budget";

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  const projections: ParsedProjection[] = [];
  const warnings: ImportWarning[] = [];

  // Headers are on row 7 (index 6), data starts row 8 (index 7)
  const DATA_START_INDEX = 7;

  for (let i = DATA_START_INDEX; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = i + 1; // 1-based Excel row number

    // Skip completely empty rows
    const rawTempJobIdCell = row[COL.TEMP_JOB_ID];
    const department = cellStr(row, COL.DEPARTMENT);
    if (rawTempJobIdCell == null && department == null) {
      continue;
    }

    const importKey = `${sheetName}:${excelRow}`;
    const id = wfpProjectionId(importKey);

    // Parse tempJobId (handles "6000 (5357 Previously)" cases)
    const { tempJobId, rawTempJobId } = parseTempJobId(rawTempJobIdCell as string | number | null);

    // Parse start date (may be Excel serial number)
    const rawStartDate = row[COL.START_DATE];
    let startDate: Date | null = null;
    if (typeof rawStartDate === "number") {
      startDate = excelSerialToDate(rawStartDate);
    } else if (rawStartDate != null) {
      const s = sanitize(String(rawStartDate));
      if (s != null && s.toUpperCase() !== "TBD") {
        const d = new Date(s);
        if (!isNaN(d.getTime())) startDate = d;
      }
    }

    // Parse monthly FTE values
    const monthlyFte: Record<string, number | null> = {};
    for (let yearIdx = 0; yearIdx < YEARS.length; yearIdx++) {
      for (let monthIdx = 0; monthIdx < MONTHS_PER_YEAR; monthIdx++) {
        const colIdx = MONTH_START_COL + yearIdx * MONTHS_PER_YEAR + monthIdx;
        const key = monthColKey(yearIdx, monthIdx);
        monthlyFte[key] = cellNum(row, colIdx);
      }
    }

    projections.push({
      id,
      importKey,
      sourceRow: excelRow,
      tempJobId,
      rawTempJobId,
      department: department ?? "Unknown",
      employeeName: cellStr(row, COL.EMPLOYEE_NAME),
      level: cellStr(row, COL.LEVEL),
      jobTitle: cellStr(row, COL.JOB_TITLE),
      startDate,
      monthlyFte,
    });
  }

  return { projections, warnings };
}
