-- Migration: add WFP import fields to Job, and add HeadcountProjection + Tradeoff tables.
--
-- Context: The production DB was bootstrapped via `prisma db push` before these
-- schema additions were made. The init migration (20260316000000_init) is marked
-- as already-applied via `migrate resolve --applied`, so Prisma never ran it
-- against production. This migration adds only the delta. All operations use
-- IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so the migration is idempotent and
-- safe to re-run if the column was partially applied.

-- ---------------------------------------------------------------------------
-- Job: WFP import columns
-- ---------------------------------------------------------------------------

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "importKey"          TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "sourceRow"          INTEGER;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "sourceSheet"        TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "tempJobId"          INTEGER;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "hibobId"            INTEGER;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "level"              TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "employeeType"       TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "function"           TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "horizon"            TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "asset"              TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "keyCapability"      TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "milestone"          TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "businessRationale"  TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "corporatePriority"  TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "functionalPriority" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "fpaApproved"        TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "fpaLevel"           TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "fpaNote"            TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "fpaTiming"          TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "talentAssessment"   TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "recruitingStatus"   TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "hiredName"          TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "isTradeoff"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "notes"              TEXT;

-- Unique index for importKey
CREATE UNIQUE INDEX IF NOT EXISTS "Job_importKey_key" ON "Job"("importKey");

-- WFP import indexes
CREATE INDEX IF NOT EXISTS "Job_employeeType_idx"    ON "Job"("employeeType");
CREATE INDEX IF NOT EXISTS "Job_function_idx"        ON "Job"("function");
CREATE INDEX IF NOT EXISTS "Job_horizon_idx"         ON "Job"("horizon");
CREATE INDEX IF NOT EXISTS "Job_level_idx"           ON "Job"("level");
CREATE INDEX IF NOT EXISTS "Job_status_horizon_idx"  ON "Job"("status", "horizon");
CREATE INDEX IF NOT EXISTS "Job_tempJobId_idx"       ON "Job"("tempJobId");

-- ---------------------------------------------------------------------------
-- Candidate: firstName index (added alongside WFP work)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "Candidate_firstName_idx" ON "Candidate"("firstName");

-- ---------------------------------------------------------------------------
-- HeadcountProjection table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "HeadcountProjection" (
    "id"           TEXT NOT NULL,
    "importKey"    TEXT NOT NULL,
    "sourceRow"    INTEGER NOT NULL,
    "tempJobId"    INTEGER,
    "rawTempJobId" TEXT,
    "matchedJobId" TEXT,
    "department"   TEXT NOT NULL,
    "employeeName" TEXT,
    "level"        TEXT,
    "jobTitle"     TEXT,
    "startDate"    TIMESTAMP(3),
    "monthlyFte"   JSONB NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeadcountProjection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "HeadcountProjection_importKey_key"   ON "HeadcountProjection"("importKey");
CREATE INDEX        IF NOT EXISTS "HeadcountProjection_matchedJobId_idx" ON "HeadcountProjection"("matchedJobId");
CREATE INDEX        IF NOT EXISTS "HeadcountProjection_tempJobId_idx"    ON "HeadcountProjection"("tempJobId");

ALTER TABLE "HeadcountProjection"
    ADD CONSTRAINT "HeadcountProjection_matchedJobId_fkey"
    FOREIGN KEY ("matchedJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Tradeoff table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Tradeoff" (
    "id"               TEXT NOT NULL,
    "importKey"        TEXT NOT NULL,
    "sourceRow"        INTEGER NOT NULL,
    "rowType"          TEXT NOT NULL,
    "sourceTempJobId"  INTEGER,
    "sourceJobId"      TEXT,
    "sourceDepartment" TEXT,
    "sourceLevel"      TEXT,
    "sourceTitle"      TEXT,
    "targetTempJobId"  INTEGER,
    "targetJobId"      TEXT,
    "targetDepartment" TEXT,
    "targetLevel"      TEXT,
    "targetTitle"      TEXT,
    "levelDifference"  INTEGER,
    "status"           TEXT,
    "notes"            TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tradeoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tradeoff_importKey_key"        ON "Tradeoff"("importKey");
CREATE INDEX        IF NOT EXISTS "Tradeoff_sourceJobId_idx"      ON "Tradeoff"("sourceJobId");
CREATE INDEX        IF NOT EXISTS "Tradeoff_sourceTempJobId_idx"  ON "Tradeoff"("sourceTempJobId");
CREATE INDEX        IF NOT EXISTS "Tradeoff_targetJobId_idx"      ON "Tradeoff"("targetJobId");
CREATE INDEX        IF NOT EXISTS "Tradeoff_targetTempJobId_idx"  ON "Tradeoff"("targetTempJobId");

ALTER TABLE "Tradeoff"
    ADD CONSTRAINT "Tradeoff_sourceJobId_fkey"
    FOREIGN KEY ("sourceJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Tradeoff"
    ADD CONSTRAINT "Tradeoff_targetJobId_fkey"
    FOREIGN KEY ("targetJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
