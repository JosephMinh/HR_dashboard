-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'RECRUITER', 'VIEWER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'CLOSED', 'ON_HOLD');

-- CreateEnum
CREATE TYPE "JobPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PipelineHealth" AS ENUM ('AHEAD', 'ON_TRACK', 'BEHIND');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('REFERRAL', 'LINKEDIN', 'CAREERS_PAGE', 'AGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('NEW', 'SCREENING', 'INTERVIEWING', 'FINAL_ROUND', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "User" (
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
CREATE TABLE "Job" (
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
CREATE TABLE "Candidate" (
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
CREATE TABLE "Application" (
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
CREATE TABLE "AuditLog" (
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
CREATE TABLE "SetPasswordToken" (
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
CREATE TABLE "HeadcountProjection" (
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
CREATE TABLE "Tradeoff" (
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

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Job_importKey_key" ON "Job"("importKey");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_isCritical_idx" ON "Job"("isCritical");

-- CreateIndex
CREATE INDEX "Job_pipelineHealth_idx" ON "Job"("pipelineHealth");

-- CreateIndex
CREATE INDEX "Job_updatedAt_idx" ON "Job"("updatedAt");

-- CreateIndex
CREATE INDEX "Job_targetFillDate_idx" ON "Job"("targetFillDate");

-- CreateIndex
CREATE INDEX "Job_status_isCritical_idx" ON "Job"("status", "isCritical");

-- CreateIndex
CREATE INDEX "Job_status_pipelineHealth_idx" ON "Job"("status", "pipelineHealth");

-- CreateIndex
CREATE INDEX "Job_employeeType_idx" ON "Job"("employeeType");

-- CreateIndex
CREATE INDEX "Job_function_idx" ON "Job"("function");

-- CreateIndex
CREATE INDEX "Job_horizon_idx" ON "Job"("horizon");

-- CreateIndex
CREATE INDEX "Job_level_idx" ON "Job"("level");

-- CreateIndex
CREATE INDEX "Job_status_horizon_idx" ON "Job"("status", "horizon");

-- CreateIndex
CREATE INDEX "Job_tempJobId_idx" ON "Job"("tempJobId");

-- CreateIndex
CREATE INDEX "Candidate_firstName_idx" ON "Candidate"("firstName");

-- CreateIndex
CREATE INDEX "Candidate_lastName_idx" ON "Candidate"("lastName");

-- CreateIndex
CREATE INDEX "Candidate_email_idx" ON "Candidate"("email");

-- CreateIndex
CREATE INDEX "Application_jobId_idx" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_candidateId_idx" ON "Application"("candidateId");

-- CreateIndex
CREATE INDEX "Application_stage_idx" ON "Application"("stage");

-- CreateIndex
CREATE INDEX "Application_jobId_stage_idx" ON "Application"("jobId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_candidateId_key" ON "Application"("jobId", "candidateId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SetPasswordToken_tokenHash_key" ON "SetPasswordToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SetPasswordToken_userId_idx" ON "SetPasswordToken"("userId");

-- CreateIndex
CREATE INDEX "SetPasswordToken_expiresAt_idx" ON "SetPasswordToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "HeadcountProjection_importKey_key" ON "HeadcountProjection"("importKey");

-- CreateIndex
CREATE INDEX "HeadcountProjection_matchedJobId_idx" ON "HeadcountProjection"("matchedJobId");

-- CreateIndex
CREATE INDEX "HeadcountProjection_tempJobId_idx" ON "HeadcountProjection"("tempJobId");

-- CreateIndex
CREATE UNIQUE INDEX "Tradeoff_importKey_key" ON "Tradeoff"("importKey");

-- CreateIndex
CREATE INDEX "Tradeoff_sourceJobId_idx" ON "Tradeoff"("sourceJobId");

-- CreateIndex
CREATE INDEX "Tradeoff_sourceTempJobId_idx" ON "Tradeoff"("sourceTempJobId");

-- CreateIndex
CREATE INDEX "Tradeoff_targetJobId_idx" ON "Tradeoff"("targetJobId");

-- CreateIndex
CREATE INDEX "Tradeoff_targetTempJobId_idx" ON "Tradeoff"("targetTempJobId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetPasswordToken" ADD CONSTRAINT "SetPasswordToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeadcountProjection" ADD CONSTRAINT "HeadcountProjection_matchedJobId_fkey" FOREIGN KEY ("matchedJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tradeoff" ADD CONSTRAINT "Tradeoff_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tradeoff" ADD CONSTRAINT "Tradeoff_targetJobId_fkey" FOREIGN KEY ("targetJobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
