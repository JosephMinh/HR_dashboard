-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum (idempotent: skip if type already exists)
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RECRUITER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'CLOSED', 'ON_HOLD');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "JobPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PipelineHealth" AS ENUM ('AHEAD', 'ON_TRACK', 'BEHIND');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CandidateSource" AS ENUM ('REFERRAL', 'LINKEDIN', 'CAREERS_PAGE', 'AGENCY', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApplicationStage" AS ENUM ('NEW', 'SCREENING', 'INTERVIEWING', 'FINAL_ROUND', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "hiringManager" TEXT,
    "recruiterOwner" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "JobPriority" NOT NULL DEFAULT 'MEDIUM',
    "pipelineHealth" "PipelineHealth",
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3),
    "targetFillDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "importKey" TEXT,
    "sourceRow" INTEGER,
    "sourceSheet" TEXT,
    "tempJobId" INTEGER,
    "hibobId" INTEGER,
    "level" TEXT,
    "employeeType" TEXT,
    "function" TEXT,
    "horizon" TEXT,
    "asset" TEXT,
    "keyCapability" TEXT,
    "milestone" TEXT,
    "businessRationale" TEXT,
    "corporatePriority" TEXT,
    "functionalPriority" TEXT,
    "fpaApproved" TEXT,
    "fpaLevel" TEXT,
    "fpaNote" TEXT,
    "fpaTiming" TEXT,
    "talentAssessment" TEXT,
    "recruitingStatus" TEXT,
    "hiredName" TEXT,
    "isTradeoff" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Candidate" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "linkedinUrl" TEXT,
    "currentCompany" TEXT,
    "location" TEXT,
    "source" "CandidateSource",
    "resumeKey" TEXT,
    "resumeName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Application" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'NEW',
    "recruiterOwner" TEXT,
    "interviewNotes" TEXT,
    "stageUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SetPasswordToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetPasswordToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HeadcountProjection" (
    "id" TEXT NOT NULL,
    "importKey" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "tempJobId" INTEGER,
    "rawTempJobId" TEXT,
    "matchedJobId" TEXT,
    "department" TEXT NOT NULL,
    "employeeName" TEXT,
    "level" TEXT,
    "jobTitle" TEXT,
    "startDate" TIMESTAMP(3),
    "monthlyFte" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeadcountProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Tradeoff" (
    "id" TEXT NOT NULL,
    "importKey" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "rowType" TEXT NOT NULL,
    "sourceTempJobId" INTEGER,
    "sourceJobId" TEXT,
    "sourceDepartment" TEXT,
    "sourceLevel" TEXT,
    "sourceTitle" TEXT,
    "targetTempJobId" INTEGER,
    "targetJobId" TEXT,
    "targetDepartment" TEXT,
    "targetLevel" TEXT,
    "targetTitle" TEXT,
    "levelDifference" INTEGER,
    "status" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tradeoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (IF NOT EXISTS is supported for indexes in PostgreSQL 9.5+)
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "Job_importKey_key" ON "Job"("importKey");

CREATE INDEX IF NOT EXISTS "Job_status_idx" ON "Job"("status");
CREATE INDEX IF NOT EXISTS "Job_isCritical_idx" ON "Job"("isCritical");
CREATE INDEX IF NOT EXISTS "Job_pipelineHealth_idx" ON "Job"("pipelineHealth");
CREATE INDEX IF NOT EXISTS "Job_updatedAt_idx" ON "Job"("updatedAt");
CREATE INDEX IF NOT EXISTS "Job_targetFillDate_idx" ON "Job"("targetFillDate");
CREATE INDEX IF NOT EXISTS "Job_status_isCritical_idx" ON "Job"("status", "isCritical");
CREATE INDEX IF NOT EXISTS "Job_status_pipelineHealth_idx" ON "Job"("status", "pipelineHealth");
CREATE INDEX IF NOT EXISTS "Job_employeeType_idx" ON "Job"("employeeType");
CREATE INDEX IF NOT EXISTS "Job_function_idx" ON "Job"("function");
CREATE INDEX IF NOT EXISTS "Job_horizon_idx" ON "Job"("horizon");
CREATE INDEX IF NOT EXISTS "Job_level_idx" ON "Job"("level");
CREATE INDEX IF NOT EXISTS "Job_status_horizon_idx" ON "Job"("status", "horizon");
CREATE INDEX IF NOT EXISTS "Job_tempJobId_idx" ON "Job"("tempJobId");

CREATE INDEX IF NOT EXISTS "Candidate_firstName_idx" ON "Candidate"("firstName");
CREATE INDEX IF NOT EXISTS "Candidate_lastName_idx" ON "Candidate"("lastName");
CREATE INDEX IF NOT EXISTS "Candidate_email_idx" ON "Candidate"("email");

CREATE INDEX IF NOT EXISTS "Application_jobId_idx" ON "Application"("jobId");
CREATE INDEX IF NOT EXISTS "Application_candidateId_idx" ON "Application"("candidateId");
CREATE INDEX IF NOT EXISTS "Application_stage_idx" ON "Application"("stage");
CREATE INDEX IF NOT EXISTS "Application_jobId_stage_idx" ON "Application"("jobId", "stage");
CREATE UNIQUE INDEX IF NOT EXISTS "Application_jobId_candidateId_key" ON "Application"("jobId", "candidateId");

CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "SetPasswordToken_tokenHash_key" ON "SetPasswordToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "SetPasswordToken_userId_idx" ON "SetPasswordToken"("userId");
CREATE INDEX IF NOT EXISTS "SetPasswordToken_expiresAt_idx" ON "SetPasswordToken"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "HeadcountProjection_importKey_key" ON "HeadcountProjection"("importKey");
CREATE INDEX IF NOT EXISTS "HeadcountProjection_matchedJobId_idx" ON "HeadcountProjection"("matchedJobId");
CREATE INDEX IF NOT EXISTS "HeadcountProjection_tempJobId_idx" ON "HeadcountProjection"("tempJobId");

CREATE UNIQUE INDEX IF NOT EXISTS "Tradeoff_importKey_key" ON "Tradeoff"("importKey");
CREATE INDEX IF NOT EXISTS "Tradeoff_sourceJobId_idx" ON "Tradeoff"("sourceJobId");
CREATE INDEX IF NOT EXISTS "Tradeoff_sourceTempJobId_idx" ON "Tradeoff"("sourceTempJobId");
CREATE INDEX IF NOT EXISTS "Tradeoff_targetJobId_idx" ON "Tradeoff"("targetJobId");
CREATE INDEX IF NOT EXISTS "Tradeoff_targetTempJobId_idx" ON "Tradeoff"("targetTempJobId");

-- AddForeignKey (idempotent: skip if constraint already exists)
DO $$ BEGIN
  ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SetPasswordToken" ADD CONSTRAINT "SetPasswordToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "HeadcountProjection" ADD CONSTRAINT "HeadcountProjection_matchedJobId_fkey"
    FOREIGN KEY ("matchedJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Tradeoff" ADD CONSTRAINT "Tradeoff_sourceJobId_fkey"
    FOREIGN KEY ("sourceJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Tradeoff" ADD CONSTRAINT "Tradeoff_targetJobId_fkey"
    FOREIGN KEY ("targetJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
