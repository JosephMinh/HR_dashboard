/**
 * WFP Import — Parser for "Tradeoffs" sheet.
 *
 * The sheet has a side-by-side layout with duplicate column names:
 * Source (Temp Job ID, Department, Level, Title) | Dif | Target (Temp Job ID, Department, Level, Title) | Trade-off Status
 *
 * We read as arrays-of-arrays to handle the duplicate column names.
 */

import type { WorkSheet } from "xlsx";
import * as XLSX from "xlsx";

import { wfpTradeoffId } from "@/lib/wfp-ids";
import { sanitize } from "./normalize";
import type { ParsedTradeoff, ImportWarning } from "./types";

// ---------------------------------------------------------------------------
// Column indices (0-based)
// ---------------------------------------------------------------------------

const COL = {
  SOURCE_TEMP_JOB_ID: 0,
  SOURCE_DEPARTMENT: 1,
  SOURCE_LEVEL: 2,
  SOURCE_TITLE: 3,
  DIF: 4,
  TARGET_TEMP_JOB_ID: 5,
  TARGET_DEPARTMENT: 6,
  TARGET_LEVEL: 7,
  TARGET_TITLE: 8,
  STATUS: 9,
} as const;

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

function cellStr(row: unknown[], col: number): string | null {
  const val = row[col];
  if (val == null) return null;
  return sanitize(String(val));
}

function cellInt(row: unknown[], col: number): number | null {
  const val = row[col];
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? Math.round(val) : null;
  const s = sanitize(String(val));
  if (s == null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TradeoffResult {
  tradeoffs: ParsedTradeoff[];
  warnings: ImportWarning[];
}

export function parseTradeoffsSheet(sheet: WorkSheet): TradeoffResult {
  const sheetName = "Tradeoffs";

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  });

  const tradeoffs: ParsedTradeoff[] = [];
  const warnings: ImportWarning[] = [];

  function warn(row: number, field: string, rawValue: string, message: string) {
    warnings.push({ sheet: sheetName, row, field, rawValue, message });
  }

  // Skip header row (index 0), data from index 1
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const excelRow = i + 1;

    const sourceTempJobId = cellInt(row, COL.SOURCE_TEMP_JOB_ID);
    const targetTempJobId = cellInt(row, COL.TARGET_TEMP_JOB_ID);
    const dif = cellInt(row, COL.DIF);

    const sourceDepartment = cellStr(row, COL.SOURCE_DEPARTMENT);
    const sourceLevel = cellStr(row, COL.SOURCE_LEVEL);
    const sourceTitle = cellStr(row, COL.SOURCE_TITLE);
    const targetDepartment = cellStr(row, COL.TARGET_DEPARTMENT);
    const targetLevel = cellStr(row, COL.TARGET_LEVEL);
    const targetTitle = cellStr(row, COL.TARGET_TITLE);
    const status = cellStr(row, COL.STATUS);

    // Skip summary row: no IDs and Dif = -7 (aggregate row)
    if (sourceTempJobId == null && targetTempJobId == null && dif === -7) {
      warn(excelRow, "row", "", "Skipping summary row (Dif = -7, no IDs)");
      continue;
    }

    // Skip completely empty rows
    if (
      sourceTempJobId == null &&
      targetTempJobId == null &&
      sourceDepartment == null &&
      targetDepartment == null &&
      sourceTitle == null &&
      targetTitle == null &&
      status == null
    ) {
      continue;
    }

    const importKey = `${sheetName}:${excelRow}`;
    const id = wfpTradeoffId(importKey);

    // Classify row type
    let rowType: "PAIR" | "SOURCE_ONLY" | "NOTE";
    if (sourceTempJobId != null && targetTempJobId != null) {
      rowType = "PAIR";
    } else if (sourceTempJobId != null) {
      rowType = "SOURCE_ONLY";
    } else {
      // No source ID — could be an orphaned target-only or status note
      rowType = "NOTE";
      warn(excelRow, "rowType", "", "Row has no source temp job ID — stored as NOTE");
    }

    tradeoffs.push({
      id,
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
      levelDifference: dif,
      status,
      notes: null, // Tradeoffs sheet doesn't have a separate notes column
    });
  }

  return { tradeoffs, warnings };
}
