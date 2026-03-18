-- Step 1: Add new enum values to JobStatus
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'OFFER';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'AGENCY';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'HIRED';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'HIRED_CW';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'NOT_STARTED';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN';

-- Step 2: Migrate existing data from old enum values to new ones
UPDATE "Job" SET "status" = 'NOT_STARTED' WHERE "status" = 'ON_HOLD' AND "horizon" = 'Beyond 2026';
UPDATE "Job" SET "status" = 'UNKNOWN'     WHERE "status" = 'ON_HOLD';
UPDATE "Job" SET "status" = 'HIRED'       WHERE "status" = 'CLOSED';

-- Step 3: Replace enum type to remove old values (CLOSED, ON_HOLD)
ALTER TABLE "Job" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'OFFER', 'AGENCY', 'HIRED', 'HIRED_CW', 'NOT_STARTED', 'UNKNOWN');
ALTER TABLE "Job" ALTER COLUMN "status" TYPE "JobStatus" USING "status"::text::"JobStatus";
ALTER TABLE "Job" ALTER COLUMN "status" SET DEFAULT 'OPEN'::"JobStatus";
DROP TYPE "JobStatus_old";
