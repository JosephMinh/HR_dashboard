/**
 * WFP Import — Shared types for parsed sheet data.
 */

import type {
  JobPriority,
  JobStatus,
  PipelineHealth,
} from "@/generated/prisma/enums";

// ---------------------------------------------------------------------------
// Import diagnostics
// ---------------------------------------------------------------------------

export interface ImportWarning {
  sheet: string;
  row: number;
  field: string;
  rawValue: string;
  message: string;
}

export interface ImportDiagnostics {
  warnings: ImportWarning[];
  jobsBySheet: Record<string, number>;
  candidateCount: number;
  applicationCount: number;
  projectionCount: number;
  tradeoffCount: number;
  skippedRows: { sheet: string; row: number; reason: string }[];
}

// ---------------------------------------------------------------------------
// Parsed job from WFP Details sheets
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
  // WFP raw fields
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
// Candidate extraction from hired rows
// ---------------------------------------------------------------------------

export interface ParsedCandidate {
  id: string;
  firstName: string;
  lastName: string;
  jobImportKey: string;
}

export interface ParsedApplication {
  id: string;
  jobId: string;
  candidateId: string;
  recruiterOwner: string | null;
  stageUpdatedAt: Date;
}

// ---------------------------------------------------------------------------
// HeadcountProjection from Budget sheet
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tradeoff from Tradeoffs sheet
// ---------------------------------------------------------------------------

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
