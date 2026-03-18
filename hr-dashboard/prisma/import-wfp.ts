/**
 * WFP Data Import — Standalone entry point.
 *
 * Parses the WFP workbook and imports all recruiting data into the database.
 * This is a DESTRUCTIVE operation: it clears existing recruiting entities
 * (Tradeoff, HeadcountProjection, Application, Candidate, Job) before
 * importing. User/auth tables are NEVER touched.
 *
 * Usage: npm run import:wfp
 *
 * The import is wrapped in a transaction with extended timeout.
 * All IDs are deterministic (UUID v5) so re-runs are idempotent.
 */

import "dotenv/config";

import * as fs from "fs";
import * as path from "path";
import * as XLSX from "xlsx";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ApplicationStage } from "../src/generated/prisma/enums";

import { parseWfpDetailsSheet } from "../src/lib/import/parse-wfp-details";
import { parseBudgetSheet } from "../src/lib/import/parse-budget";
import { parseTradeoffsSheet } from "../src/lib/import/parse-tradeoffs";
import { clearWarnings as clearWfpSanitizeWarnings } from "../src/lib/wfp-sanitize";
import type {
  ParsedJob,
  ParsedCandidate,
  ParsedApplication,
  ImportWarning,
} from "../src/lib/import/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Pattern matching the canonical WFP workbook naming convention.
 * Matches: "2026 WFP - Approved.xlsx", "2026 WFP - Approved (1).xlsx",
 *          "2026 WFP - Approved (2).xlsx", etc.
 * The optional parenthesised number is treated as a revision index.
 */
const WFP_WORKBOOK_PATTERN = /^2026 WFP - Approved(?: \((\d+)\))?\.xlsx$/;

/**
 * Discover the current WFP workbook in the hr-dashboard root directory.
 *
 * Resolution order:
 * 1. WFP_WORKBOOK_PATH env var (absolute or relative to hr-dashboard root)
 * 2. Scan hr-dashboard root for files matching the canonical naming pattern;
 *    if multiple revisions exist, select the highest revision deterministically.
 */
export function discoverWorkbook(): string {
  const hrDashboardRoot = path.resolve(__dirname, "..");

  // 1. Explicit override via environment
  const envPath = process.env.WFP_WORKBOOK_PATH?.trim();
  if (envPath) {
    return path.isAbsolute(envPath)
      ? envPath
      : path.resolve(hrDashboardRoot, envPath);
  }

  // 2. Auto-discover from canonical naming pattern
  let entries: string[];
  try {
    entries = fs.readdirSync(hrDashboardRoot);
  } catch {
    throw new Error(
      `Cannot read hr-dashboard root at ${hrDashboardRoot} while searching for WFP workbook.`,
    );
  }

  const matches: { filename: string; revision: number }[] = [];
  for (const entry of entries) {
    const m = WFP_WORKBOOK_PATTERN.exec(entry);
    if (m) {
      // No parenthesised suffix → revision 0; "(N)" → revision N
      const revision = m[1] ? Number.parseInt(m[1], 10) : 0;
      matches.push({ filename: entry, revision });
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `No WFP workbook found in ${hrDashboardRoot}. ` +
        'Expected a file matching "2026 WFP - Approved*.xlsx". ' +
        "Place the workbook in the hr-dashboard root or set WFP_WORKBOOK_PATH.",
    );
  }

  // Highest revision wins; deterministic tie-break on filename
  matches.sort((a, b) => b.revision - a.revision || a.filename.localeCompare(b.filename));
  const chosen = matches[0]!;

  if (matches.length > 1) {
    console.log(
      `Found ${matches.length} WFP workbooks; selecting latest revision: ${chosen.filename}`,
    );
  }

  return path.join(hrDashboardRoot, chosen.filename);
}

// DEFAULT_WORKBOOK_PATH is now resolved lazily via discoverWorkbook() in
// runWfpImport(). Direct callers that need an explicit path should call
// discoverWorkbook() or pass WFP_WORKBOOK_PATH in the environment.

// ---------------------------------------------------------------------------
// matchedJobId resolution (PLAN.md §6e)
// ---------------------------------------------------------------------------

function buildTempJobIdLookup(jobs: ParsedJob[]): Map<number, string[]> {
  const lookup = new Map<number, string[]>();
  for (const job of jobs) {
    if (job.tempJobId != null) {
      const existing = lookup.get(job.tempJobId) ?? [];
      existing.push(job.id);
      lookup.set(job.tempJobId, existing);
    }
  }
  return lookup;
}

function resolveMatchedJobId(
  tempJobId: number | null,
  lookup: Map<number, string[]>,
  warnings: ImportWarning[],
  sheet: string,
  row: number,
): string | null {
  if (tempJobId == null) return null;
  const matches = lookup.get(tempJobId);
  if (!matches || matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  warnings.push({
    sheet,
    row,
    field: "tempJobId",
    rawValue: String(tempJobId),
    message: `Ambiguous tempJobId ${tempJobId}: ${matches.length} jobs match — leaving matchedJobId null`,
  });
  return null;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

export function resolveDatabaseUrl(): string {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (directUrl) {
    return directUrl;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return databaseUrl;
  }

  throw new Error("DATABASE_URL environment variable is not set");
}

export function createPrismaClient(): PrismaClient {
  const connectionString = resolveDatabaseUrl();
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// ---------------------------------------------------------------------------
// Import orchestration
// ---------------------------------------------------------------------------

export interface WfpImportOptions {
  prisma?: PrismaClient;
  workbookPath?: string;
}

export interface WfpImportSummary {
  jobs: number;
  candidates: number;
  applications: number;
  headcountProjections: number;
  tradeoffs: number;
  warnings: number;
}

function loadWorkbook(workbookPath: string): XLSX.WorkBook {
  if (!fs.existsSync(workbookPath)) {
    throw new Error(
      `WFP workbook not found at ${workbookPath}. ` +
        "Place a matching '2026 WFP - Approved*.xlsx' workbook in the hr-dashboard root " +
        "or set WFP_WORKBOOK_PATH before running WFP seed mode.",
    );
  }

  return XLSX.readFile(workbookPath);
}

export async function runWfpImport({
  prisma,
  workbookPath,
}: WfpImportOptions = {}): Promise<WfpImportSummary> {
  const resolvedPath = workbookPath ?? discoverWorkbook();
  console.log("=== WFP Data Import ===\n");

  // 1. Read workbook
  console.log(`Reading workbook: ${resolvedPath}`);
  const workbook = loadWorkbook(resolvedPath);
  console.log(`Sheets: ${workbook.SheetNames.join(", ")}\n`);

  // 2. Parse all sheets
  const allWarnings: ImportWarning[] = [];
  let allJobs: ParsedJob[] = [];
  let allCandidates: ParsedCandidate[] = [];
  let allApplications: ParsedApplication[] = [];

  // 2a. WFP Details - 2026
  const sheet2026Name = "WFP Details - 2026";
  const sheet2026 = workbook.Sheets[sheet2026Name];
  if (!sheet2026) throw new Error(`Sheet "${sheet2026Name}" not found in workbook`);
  clearWfpSanitizeWarnings();
  console.log(`Parsing "${sheet2026Name}"...`);
  const result2026 = parseWfpDetailsSheet(sheet2026, sheet2026Name);
  allJobs = allJobs.concat(result2026.jobs);
  allCandidates = allCandidates.concat(result2026.candidates);
  allApplications = allApplications.concat(result2026.applications);
  allWarnings.push(...result2026.warnings);
  console.log(`  Jobs: ${result2026.jobs.length}, Candidates: ${result2026.candidates.length}, Applications: ${result2026.applications.length}`);

  // 2b. WFP Details - Beyond 2026
  const sheetBeyondName = "WFP Details - Beyond 2026";
  const sheetBeyond = workbook.Sheets[sheetBeyondName];
  if (!sheetBeyond) throw new Error(`Sheet "${sheetBeyondName}" not found in workbook`);
  clearWfpSanitizeWarnings();
  console.log(`Parsing "${sheetBeyondName}"...`);
  const resultBeyond = parseWfpDetailsSheet(sheetBeyond, sheetBeyondName);
  allJobs = allJobs.concat(resultBeyond.jobs);
  allWarnings.push(...resultBeyond.warnings);
  console.log(`  Jobs: ${resultBeyond.jobs.length}`);

  // 2c. 2026 Approved Budget
  const budgetSheetName = "2026 Approved Budget";
  const budgetSheet = workbook.Sheets[budgetSheetName];
  if (!budgetSheet) throw new Error(`Sheet "${budgetSheetName}" not found in workbook`);
  console.log(`Parsing "${budgetSheetName}"...`);
  const budgetResult = parseBudgetSheet(budgetSheet);
  allWarnings.push(...budgetResult.warnings);
  console.log(`  Projections: ${budgetResult.projections.length}`);

  // 2d. Tradeoffs
  const tradeoffSheetName = "Tradeoffs";
  const tradeoffSheet = workbook.Sheets[tradeoffSheetName];
  if (!tradeoffSheet) throw new Error(`Sheet "${tradeoffSheetName}" not found in workbook`);
  console.log(`Parsing "${tradeoffSheetName}"...`);
  const tradeoffResult = parseTradeoffsSheet(tradeoffSheet);
  allWarnings.push(...tradeoffResult.warnings);
  console.log(`  Tradeoffs: ${tradeoffResult.tradeoffs.length}`);

  // 3. Build matchedJobId lookup and resolve
  console.log("\nResolving matchedJobId references...");
  const tempJobIdLookup = buildTempJobIdLookup(allJobs);

  const projectionsWithMatch = budgetResult.projections.map(p => ({
    ...p,
    matchedJobId: resolveMatchedJobId(
      p.tempJobId,
      tempJobIdLookup,
      allWarnings,
      "2026 Approved Budget",
      p.sourceRow,
    ),
  }));

  const tradeoffsWithMatch = tradeoffResult.tradeoffs.map(t => ({
    ...t,
    sourceJobId: resolveMatchedJobId(
      t.sourceTempJobId,
      tempJobIdLookup,
      allWarnings,
      "Tradeoffs",
      t.sourceRow,
    ),
    targetJobId: resolveMatchedJobId(
      t.targetTempJobId,
      tempJobIdLookup,
      allWarnings,
      "Tradeoffs",
      t.sourceRow,
    ),
  }));

  // 4. Print summary before write
  console.log("\n--- Import Summary ---");
  console.log(`Total jobs: ${allJobs.length}`);
  console.log(`  2026: ${result2026.jobs.length}`);
  console.log(`  Beyond 2026: ${resultBeyond.jobs.length}`);

  // Status breakdown
  const statusCounts = { OPEN: 0, CLOSED: 0, ON_HOLD: 0 };
  for (const j of allJobs) {
    statusCounts[j.status]++;
  }
  console.log(`  OPEN: ${statusCounts.OPEN}, CLOSED: ${statusCounts.CLOSED}, ON_HOLD: ${statusCounts.ON_HOLD}`);

  console.log(`Candidates: ${allCandidates.length}`);
  console.log(`Applications: ${allApplications.length}`);
  console.log(`Headcount projections: ${projectionsWithMatch.length}`);
  console.log(`Tradeoffs: ${tradeoffsWithMatch.length}`);
  console.log(`Warnings: ${allWarnings.length}`);

  // 5. Write to database
  console.log("\n--- Writing to database ---");
  const db = prisma ?? createPrismaClient();
  const shouldDisconnect = prisma == null;

  try {
    await db.$transaction(
      async (tx) => {
        // Clear existing recruiting data in FK-safe order
        console.log("Clearing existing recruiting data...");
        await tx.tradeoff.deleteMany();
        await tx.headcountProjection.deleteMany();
        await tx.application.deleteMany();
        await tx.candidate.deleteMany();
        await tx.job.deleteMany();
        console.log("  Cleared.");

        // Insert jobs
        console.log(`Inserting ${allJobs.length} jobs...`);
        for (const job of allJobs) {
          await tx.job.upsert({
            where: { id: job.id },
            update: {
              importKey: job.importKey,
              sourceSheet: job.sourceSheet,
              sourceRow: job.sourceRow,
              tempJobId: job.tempJobId,
              title: job.title,
              department: job.department,
              description: job.description,
              location: job.location,
              hiringManager: job.hiringManager,
              recruiterOwner: job.recruiterOwner,
              status: job.status,
              priority: job.priority,
              pipelineHealth: job.pipelineHealth,
              isCritical: job.isCritical,
              openedAt: job.openedAt,
              targetFillDate: job.targetFillDate,
              closedAt: job.closedAt,
              function: job.function,
              employeeType: job.employeeType,
              level: job.level,
              functionalPriority: job.functionalPriority,
              corporatePriority: job.corporatePriority,
              asset: job.asset,
              keyCapability: job.keyCapability,
              businessRationale: job.businessRationale,
              milestone: job.milestone,
              talentAssessment: job.talentAssessment,
              horizon: job.horizon,
              isTradeoff: job.isTradeoff,
              recruitingStatus: job.recruitingStatus,
              fpaLevel: job.fpaLevel,
              fpaTiming: job.fpaTiming,
              fpaNote: job.fpaNote,
              fpaApproved: job.fpaApproved,
              hiredName: job.hiredName,
              hibobId: job.hibobId,
              notes: job.notes,
            },
            create: {
              id: job.id,
              importKey: job.importKey,
              sourceSheet: job.sourceSheet,
              sourceRow: job.sourceRow,
              tempJobId: job.tempJobId,
              title: job.title,
              department: job.department,
              description: job.description,
              location: job.location,
              hiringManager: job.hiringManager,
              recruiterOwner: job.recruiterOwner,
              status: job.status,
              priority: job.priority,
              pipelineHealth: job.pipelineHealth,
              isCritical: job.isCritical,
              openedAt: job.openedAt,
              targetFillDate: job.targetFillDate,
              closedAt: job.closedAt,
              function: job.function,
              employeeType: job.employeeType,
              level: job.level,
              functionalPriority: job.functionalPriority,
              corporatePriority: job.corporatePriority,
              asset: job.asset,
              keyCapability: job.keyCapability,
              businessRationale: job.businessRationale,
              milestone: job.milestone,
              talentAssessment: job.talentAssessment,
              horizon: job.horizon,
              isTradeoff: job.isTradeoff,
              recruitingStatus: job.recruitingStatus,
              fpaLevel: job.fpaLevel,
              fpaTiming: job.fpaTiming,
              fpaNote: job.fpaNote,
              fpaApproved: job.fpaApproved,
              hiredName: job.hiredName,
              hibobId: job.hibobId,
              notes: job.notes,
            },
          });
        }
        console.log("  Jobs inserted.");

        // Insert candidates
        console.log(`Inserting ${allCandidates.length} candidates...`);
        for (const c of allCandidates) {
          await tx.candidate.upsert({
            where: { id: c.id },
            update: {
              firstName: c.firstName,
              lastName: c.lastName,
            },
            create: {
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
            },
          });
        }
        console.log("  Candidates inserted.");

        // Insert applications
        console.log(`Inserting ${allApplications.length} applications...`);
        for (const a of allApplications) {
          await tx.application.upsert({
            where: { id: a.id },
            update: {
              jobId: a.jobId,
              candidateId: a.candidateId,
              stage: ApplicationStage.HIRED,
              recruiterOwner: a.recruiterOwner,
              stageUpdatedAt: a.stageUpdatedAt,
            },
            create: {
              id: a.id,
              jobId: a.jobId,
              candidateId: a.candidateId,
              stage: ApplicationStage.HIRED,
              recruiterOwner: a.recruiterOwner,
              stageUpdatedAt: a.stageUpdatedAt,
            },
          });
        }
        console.log("  Applications inserted.");

        // Insert headcount projections
        console.log(`Inserting ${projectionsWithMatch.length} headcount projections...`);
        for (const p of projectionsWithMatch) {
          await tx.headcountProjection.upsert({
            where: { id: p.id },
            update: {
              importKey: p.importKey,
              sourceRow: p.sourceRow,
              tempJobId: p.tempJobId,
              rawTempJobId: p.rawTempJobId,
              matchedJobId: p.matchedJobId,
              department: p.department,
              employeeName: p.employeeName,
              level: p.level,
              jobTitle: p.jobTitle,
              startDate: p.startDate,
              monthlyFte: p.monthlyFte,
            },
            create: {
              id: p.id,
              importKey: p.importKey,
              sourceRow: p.sourceRow,
              tempJobId: p.tempJobId,
              rawTempJobId: p.rawTempJobId,
              matchedJobId: p.matchedJobId,
              department: p.department,
              employeeName: p.employeeName,
              level: p.level,
              jobTitle: p.jobTitle,
              startDate: p.startDate,
              monthlyFte: p.monthlyFte,
            },
          });
        }
        console.log("  Headcount projections inserted.");

        // Insert tradeoffs
        console.log(`Inserting ${tradeoffsWithMatch.length} tradeoffs...`);
        for (const t of tradeoffsWithMatch) {
          await tx.tradeoff.upsert({
            where: { id: t.id },
            update: {
              importKey: t.importKey,
              sourceRow: t.sourceRow,
              rowType: t.rowType,
              sourceTempJobId: t.sourceTempJobId,
              sourceJobId: t.sourceJobId,
              sourceDepartment: t.sourceDepartment,
              sourceLevel: t.sourceLevel,
              sourceTitle: t.sourceTitle,
              targetTempJobId: t.targetTempJobId,
              targetJobId: t.targetJobId,
              targetDepartment: t.targetDepartment,
              targetLevel: t.targetLevel,
              targetTitle: t.targetTitle,
              levelDifference: t.levelDifference,
              status: t.status,
              notes: t.notes,
            },
            create: {
              id: t.id,
              importKey: t.importKey,
              sourceRow: t.sourceRow,
              rowType: t.rowType,
              sourceTempJobId: t.sourceTempJobId,
              sourceJobId: t.sourceJobId,
              sourceDepartment: t.sourceDepartment,
              sourceLevel: t.sourceLevel,
              sourceTitle: t.sourceTitle,
              targetTempJobId: t.targetTempJobId,
              targetJobId: t.targetJobId,
              targetDepartment: t.targetDepartment,
              targetLevel: t.targetLevel,
              targetTitle: t.targetTitle,
              levelDifference: t.levelDifference,
              status: t.status,
              notes: t.notes,
            },
          });
        }
        console.log("  Tradeoffs inserted.");
      },
      { timeout: 120_000 }, // 2 minutes for ~1600 upserts
    );

    console.log("\n=== Import complete ===");

    // 6. Print verification counts from database
    console.log("\n--- Verification ---");
    const jobCount = await db.job.count();
    const candidateCount = await db.candidate.count();
    const applicationCount = await db.application.count();
    const projectionCount = await db.headcountProjection.count();
    const tradeoffCount = await db.tradeoff.count();

    const jobsByStatus = await db.job.groupBy({
      by: ["status"],
      _count: true,
    });
    const jobsByHorizon = await db.job.groupBy({
      by: ["horizon"],
      _count: true,
    });

    console.log(`Jobs: ${jobCount}`);
    for (const g of jobsByStatus) {
      console.log(`  ${g.status}: ${g._count}`);
    }
    for (const g of jobsByHorizon) {
      console.log(`  horizon="${g.horizon}": ${g._count}`);
    }
    console.log(`Candidates: ${candidateCount}`);
    console.log(`Applications: ${applicationCount}`);
    console.log(`Headcount projections: ${projectionCount}`);
    console.log(`Tradeoffs: ${tradeoffCount}`);

    // 7. Print warnings
    if (allWarnings.length > 0) {
      console.log(`\n--- Warnings (${allWarnings.length}) ---`);
      for (const w of allWarnings.slice(0, 50)) {
        console.log(`  [${w.sheet}:${w.row}] ${w.field}: ${w.message} (raw: "${w.rawValue}")`);
      }
      if (allWarnings.length > 50) {
        console.log(`  ... and ${allWarnings.length - 50} more`);
      }
    }

    return {
      jobs: jobCount,
      candidates: candidateCount,
      applications: applicationCount,
      headcountProjections: projectionCount,
      tradeoffs: tradeoffCount,
      warnings: allWarnings.length,
    };
  } finally {
    if (shouldDisconnect) {
      await db.$disconnect();
    }
  }
}

async function main() {
  await runWfpImport();
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("WFP import failed:");
    console.error(error);
    process.exit(1);
  });
}
