import "dotenv/config";

import { hash } from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  ApplicationStage,
  CandidateSource,
  JobPriority,
  JobStatus,
  PipelineHealth,
  UserRole,
} from "../src/generated/prisma/enums";
import { PasswordSchema } from "../src/lib/validations/password";
import { createPrismaClient, runWfpImport } from "./import-wfp";

type SeedJob = {
  id: string;
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
  closedAt?: Date | null;
};

type SeedCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  currentCompany: string | null;
  location: string | null;
  source: CandidateSource | null;
  resumeKey: string | null;
  resumeName: string | null;
  notes: string | null;
};

type SeedApplication = {
  id: string;
  jobId: string;
  candidateId: string;
  stage: ApplicationStage;
  recruiterOwner: string | null;
  interviewNotes: string | null;
  stageUpdatedAt: Date;
};

// ---------------------------------------------------------------------------
// Seed mode + admin bootstrap configuration
// ---------------------------------------------------------------------------

type SeedMode = "demo" | "wfp";

type AdminSeedConfig = {
  name: string;
  email: string;
  password: string;
};

function resolveSeedMode(): SeedMode {
  const rawMode = process.env.HR_DASHBOARD_SEED_MODE?.trim().toLowerCase();
  if (!rawMode || rawMode === "demo") {
    return "demo";
  }

  if (rawMode === "wfp") {
    return "wfp";
  }

  throw new Error(
    `Unsupported HR_DASHBOARD_SEED_MODE "${rawMode}". ` +
      'Expected "demo" or "wfp".',
  );
}

function resolveAdminEnv(): AdminSeedConfig | null {
  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!name && !email && !password) {
    return null;
  }

  const missing: string[] = [];
  if (!name) missing.push("ADMIN_NAME");
  if (!email) missing.push("ADMIN_EMAIL");
  if (!password) missing.push("ADMIN_PASSWORD");

  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars for seeding: ${missing.join(", ")}. ` +
        "Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD before running prisma db seed, or unset all three to keep the existing admin account.",
    );
  }

  if (name!.length < 1 || name!.length > 100) {
    throw new Error("ADMIN_NAME must be 1-100 characters.");
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email!)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }

  // Validate password against shared policy
  const result = PasswordSchema.safeParse(password);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join("; ");
    throw new Error(`ADMIN_PASSWORD does not meet policy: ${issues}`);
  }

  return { name: name!, email: email!, password: password! };
}

const jobs: SeedJob[] = [
  {
    id: "seed-job-001",
    title: "Platform Engineer",
    department: "Engineering",
    description:
      "Own core platform services, developer workflows, and operational reliability for the hiring stack.",
    location: "Remote",
    hiringManager: "Maya Lopez",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.OPEN,
    priority: JobPriority.CRITICAL,
    pipelineHealth: PipelineHealth.AHEAD,
    isCritical: true,
    openedAt: new Date("2026-02-10T00:00:00Z"),
    targetFillDate: new Date("2026-03-20T00:00:00Z"),
  },
  {
    id: "seed-job-002",
    title: "Senior Product Designer",
    department: "Design",
    description:
      "Lead end-to-end UX for recruiting workflows, dashboards, and candidate-facing experiences.",
    location: "New York, NY",
    hiringManager: "Alex Rivera",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.OPEN,
    priority: JobPriority.HIGH,
    pipelineHealth: PipelineHealth.ON_TRACK,
    isCritical: true,
    openedAt: new Date("2026-02-12T00:00:00Z"),
    targetFillDate: new Date("2026-03-25T00:00:00Z"),
  },
  {
    id: "seed-job-003",
    title: "Revenue Operations Manager",
    department: "Operations",
    description:
      "Build reporting, territory planning, and process rigor across the revenue organization.",
    location: "San Francisco, CA",
    hiringManager: "Jordan Blake",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.OPEN,
    priority: JobPriority.CRITICAL,
    pipelineHealth: PipelineHealth.ON_TRACK,
    isCritical: true,
    openedAt: new Date("2026-02-08T00:00:00Z"),
    targetFillDate: new Date("2026-03-18T00:00:00Z"),
  },
  {
    id: "seed-job-004",
    title: "Director of People",
    department: "HR",
    description:
      "Scale people operations, talent programs, and leadership coaching across the company.",
    location: "Boston, MA",
    hiringManager: "Tara Singh",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.OPEN,
    priority: JobPriority.CRITICAL,
    pipelineHealth: PipelineHealth.BEHIND,
    isCritical: true,
    openedAt: new Date("2026-01-28T00:00:00Z"),
    targetFillDate: new Date("2026-03-15T00:00:00Z"),
  },
  {
    id: "seed-job-005",
    title: "Demand Generation Manager",
    department: "Marketing",
    description:
      "Own paid, lifecycle, and event programs that increase qualified pipeline generation.",
    location: "Remote",
    hiringManager: "Nina Patel",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.OPEN,
    priority: JobPriority.HIGH,
    pipelineHealth: PipelineHealth.AHEAD,
    isCritical: false,
    openedAt: new Date("2026-02-14T00:00:00Z"),
    targetFillDate: new Date("2026-04-01T00:00:00Z"),
  },
  {
    id: "seed-job-006",
    title: "Account Executive",
    department: "Sales",
    description:
      "Drive full-cycle enterprise sales with a focus on mid-market and strategic accounts.",
    location: "New York, NY",
    hiringManager: "Chris Park",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.OPEN,
    priority: JobPriority.MEDIUM,
    pipelineHealth: PipelineHealth.ON_TRACK,
    isCritical: false,
    openedAt: new Date("2026-02-20T00:00:00Z"),
    targetFillDate: new Date("2026-04-05T00:00:00Z"),
  },
  {
    id: "seed-job-007",
    title: "Customer Support Lead",
    department: "Operations",
    description:
      "Coach the support team, improve QA standards, and reduce time-to-resolution across channels.",
    location: "Remote",
    hiringManager: "Olivia Chen",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.OPEN,
    priority: JobPriority.MEDIUM,
    pipelineHealth: PipelineHealth.AHEAD,
    isCritical: false,
    openedAt: new Date("2026-02-18T00:00:00Z"),
    targetFillDate: null,
  },
  {
    id: "seed-job-008",
    title: "HR Business Partner",
    department: "HR",
    description:
      "Partner with leadership on org design, performance management, and employee experience.",
    location: "Boston, MA",
    hiringManager: "Tara Singh",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.OPEN,
    priority: JobPriority.HIGH,
    pipelineHealth: PipelineHealth.ON_TRACK,
    isCritical: false,
    openedAt: new Date("2026-02-22T00:00:00Z"),
    targetFillDate: new Date("2026-04-10T00:00:00Z"),
  },
  {
    id: "seed-job-009",
    title: "Data Analyst",
    department: "Engineering",
    description:
      "Partner with product and operations teams to deliver metrics, models, and reporting insights.",
    location: "Remote",
    hiringManager: "Maya Lopez",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.CLOSED,
    priority: JobPriority.MEDIUM,
    pipelineHealth: null,
    isCritical: false,
    openedAt: new Date("2025-12-15T00:00:00Z"),
    targetFillDate: new Date("2026-02-01T00:00:00Z"),
    closedAt: new Date("2026-02-04T00:00:00Z"),
  },
  {
    id: "seed-job-010",
    title: "Office Manager",
    department: "Operations",
    description:
      "Manage onsite operations, vendor coordination, and workplace experience for the main office.",
    location: "San Francisco, CA",
    hiringManager: "Jordan Blake",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.CLOSED,
    priority: JobPriority.LOW,
    pipelineHealth: null,
    isCritical: false,
    openedAt: new Date("2025-11-20T00:00:00Z"),
    targetFillDate: new Date("2026-01-12T00:00:00Z"),
    closedAt: new Date("2026-01-09T00:00:00Z"),
  },
  {
    id: "seed-job-011",
    title: "Content Strategist",
    department: "Marketing",
    description:
      "Shape messaging, editorial planning, and campaign content for product and brand launches.",
    location: "Remote",
    hiringManager: "Nina Patel",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.ON_HOLD,
    priority: JobPriority.MEDIUM,
    pipelineHealth: null,
    isCritical: false,
    openedAt: new Date("2026-02-01T00:00:00Z"),
    targetFillDate: new Date("2026-04-15T00:00:00Z"),
  },
  {
    id: "seed-job-012",
    title: "Solutions Engineer",
    department: "Sales",
    description:
      "Support the sales process with demos, proof-of-concepts, and technical discovery.",
    location: "Boston, MA",
    hiringManager: "Chris Park",
    recruiterOwner: "Jane Recruiter",
    status: JobStatus.ON_HOLD,
    priority: JobPriority.HIGH,
    pipelineHealth: null,
    isCritical: false,
    openedAt: new Date("2026-01-18T00:00:00Z"),
    targetFillDate: new Date("2026-04-20T00:00:00Z"),
  },
];

const candidates: SeedCandidate[] = [
  {
    id: "seed-candidate-001",
    firstName: "Ava",
    lastName: "Chen",
    email: "ava.chen@example.com",
    phone: "555-0101",
    linkedinUrl: "https://www.linkedin.com/in/ava-chen",
    currentCompany: "Northstar Labs",
    location: "Seattle, WA",
    source: CandidateSource.REFERRAL,
    resumeKey: "resumes/seed-ava-chen.pdf",
    resumeName: "ava-chen-resume.pdf",
    notes: "Strong systems mindset and excellent cross-functional communication.",
  },
  {
    id: "seed-candidate-002",
    firstName: "Marcus",
    lastName: "Reed",
    email: "marcus.reed@example.com",
    phone: "555-0102",
    linkedinUrl: null,
    currentCompany: "Pioneer Cloud",
    location: "Denver, CO",
    source: CandidateSource.LINKEDIN,
    resumeKey: null,
    resumeName: null,
    notes: "Experienced revenue-ops operator with Salesforce and planning depth.",
  },
  {
    id: "seed-candidate-003",
    firstName: "Priya",
    lastName: "Nair",
    email: "priya.nair@example.com",
    phone: "555-0103",
    linkedinUrl: "https://www.linkedin.com/in/priya-nair",
    currentCompany: "Orbit Works",
    location: "Austin, TX",
    source: CandidateSource.CAREERS_PAGE,
    resumeKey: "resumes/seed-priya-nair.docx",
    resumeName: "priya-nair-resume.docx",
    notes: "Strong portfolio and crisp product storytelling.",
  },
  {
    id: "seed-candidate-004",
    firstName: "Elena",
    lastName: "Gomez",
    email: null,
    phone: "555-0104",
    linkedinUrl: "https://www.linkedin.com/in/elena-gomez",
    currentCompany: "Agency Placement Partners",
    location: "Miami, FL",
    source: CandidateSource.AGENCY,
    resumeKey: "resumes/seed-elena-gomez.pdf",
    resumeName: "elena-gomez-resume.pdf",
    notes: "Agency-submitted candidate with support leadership experience.",
  },
  {
    id: "seed-candidate-005",
    firstName: "Jordan",
    lastName: "Kim",
    email: "jordan.kim@example.com",
    phone: "555-0105",
    linkedinUrl: null,
    currentCompany: "Brightline",
    location: "Chicago, IL",
    source: CandidateSource.OTHER,
    resumeKey: null,
    resumeName: null,
    notes: "Came through industry meetup referral network.",
  },
  {
    id: "seed-candidate-006",
    firstName: "Sam",
    lastName: "Patel",
    email: "sam.patel@example.com",
    phone: "555-0106",
    linkedinUrl: "https://www.linkedin.com/in/sam-patel",
    currentCompany: "Helix Commerce",
    location: "New York, NY",
    source: CandidateSource.REFERRAL,
    resumeKey: null,
    resumeName: null,
    notes: "Sales candidate with strong closing track record and team mentorship experience.",
  },
  {
    id: "seed-candidate-007",
    firstName: "Lily",
    lastName: "Thompson",
    email: null,
    phone: "555-0107",
    linkedinUrl: "https://www.linkedin.com/in/lily-thompson",
    currentCompany: "Bluebird Support",
    location: "Portland, OR",
    source: CandidateSource.LINKEDIN,
    resumeKey: null,
    resumeName: null,
    notes: "Reached out directly after seeing the support leadership opening.",
  },
  {
    id: "seed-candidate-008",
    firstName: "Noah",
    lastName: "Martinez",
    email: "noah.martinez@example.com",
    phone: "555-0108",
    linkedinUrl: "https://www.linkedin.com/in/noah-martinez",
    currentCompany: "Summit AI",
    location: "San Francisco, CA",
    source: CandidateSource.CAREERS_PAGE,
    resumeKey: "resumes/seed-noah-martinez.pdf",
    resumeName: "noah-martinez-resume.pdf",
    notes: "Applied directly and already interviewed with the hiring manager.",
  },
  {
    id: "seed-candidate-009",
    firstName: "Zoe",
    lastName: "Brooks",
    email: "zoe.brooks@example.com",
    phone: "555-0109",
    linkedinUrl: null,
    currentCompany: "Harbor Talent",
    location: "Atlanta, GA",
    source: CandidateSource.AGENCY,
    resumeKey: null,
    resumeName: null,
    notes: "Strong leadership references for HRBP and people-ops work.",
  },
  {
    id: "seed-candidate-010",
    firstName: "Daniel",
    lastName: "Wu",
    email: "daniel.wu@example.com",
    phone: "555-0110",
    linkedinUrl: "https://www.linkedin.com/in/daniel-wu",
    currentCompany: "Vector Systems",
    location: "Los Angeles, CA",
    source: CandidateSource.OTHER,
    resumeKey: null,
    resumeName: null,
    notes: "Referred by former coworker and open to hybrid travel.",
  },
];

const applications: SeedApplication[] = [
  {
    id: "seed-application-001",
    jobId: "seed-job-001",
    candidateId: "seed-candidate-001",
    stage: ApplicationStage.SCREENING,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Initial recruiter screen complete.",
    stageUpdatedAt: new Date("2026-03-03T00:00:00Z"),
  },
  {
    id: "seed-application-002",
    jobId: "seed-job-001",
    candidateId: "seed-candidate-002",
    stage: ApplicationStage.INTERVIEWING,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Panel interview scheduled.",
    stageUpdatedAt: new Date("2026-03-04T00:00:00Z"),
  },
  {
    id: "seed-application-003",
    jobId: "seed-job-001",
    candidateId: "seed-candidate-003",
    stage: ApplicationStage.OFFER,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Offer review pending finance approval.",
    stageUpdatedAt: new Date("2026-03-05T00:00:00Z"),
  },
  {
    id: "seed-application-004",
    jobId: "seed-job-001",
    candidateId: "seed-candidate-004",
    stage: ApplicationStage.REJECTED,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Skill overlap was weaker than needed.",
    stageUpdatedAt: new Date("2026-03-01T00:00:00Z"),
  },
  {
    id: "seed-application-005",
    jobId: "seed-job-002",
    candidateId: "seed-candidate-001",
    stage: ApplicationStage.FINAL_ROUND,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Portfolio presentation impressed design leadership.",
    stageUpdatedAt: new Date("2026-03-02T00:00:00Z"),
  },
  {
    id: "seed-application-006",
    jobId: "seed-job-002",
    candidateId: "seed-candidate-005",
    stage: ApplicationStage.NEW,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Recently sourced, awaiting first outreach.",
    stageUpdatedAt: new Date("2026-03-06T00:00:00Z"),
  },
  {
    id: "seed-application-007",
    jobId: "seed-job-002",
    candidateId: "seed-candidate-006",
    stage: ApplicationStage.HIRED,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Accepted signed offer for design leadership role.",
    stageUpdatedAt: new Date("2026-03-07T00:00:00Z"),
  },
  {
    id: "seed-application-008",
    jobId: "seed-job-003",
    candidateId: "seed-candidate-002",
    stage: ApplicationStage.SCREENING,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Strong RevOps systems fit and modeling depth.",
    stageUpdatedAt: new Date("2026-03-03T00:00:00Z"),
  },
  {
    id: "seed-application-009",
    jobId: "seed-job-003",
    candidateId: "seed-candidate-007",
    stage: ApplicationStage.WITHDRAWN,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Candidate accepted another offer.",
    stageUpdatedAt: new Date("2026-03-02T00:00:00Z"),
  },
  {
    id: "seed-application-010",
    jobId: "seed-job-003",
    candidateId: "seed-candidate-008",
    stage: ApplicationStage.INTERVIEWING,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Cross-functional interviews in progress.",
    stageUpdatedAt: new Date("2026-03-06T00:00:00Z"),
  },
  {
    id: "seed-application-011",
    jobId: "seed-job-004",
    candidateId: "seed-candidate-001",
    stage: ApplicationStage.INTERVIEWING,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Candidate interested despite slower process.",
    stageUpdatedAt: new Date("2026-03-05T00:00:00Z"),
  },
  {
    id: "seed-application-012",
    jobId: "seed-job-004",
    candidateId: "seed-candidate-009",
    stage: ApplicationStage.NEW,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Agency intro queued for recruiter outreach.",
    stageUpdatedAt: new Date("2026-03-06T00:00:00Z"),
  },
  {
    id: "seed-application-013",
    jobId: "seed-job-004",
    candidateId: "seed-candidate-010",
    stage: ApplicationStage.SCREENING,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Relevant people-partner background.",
    stageUpdatedAt: new Date("2026-03-07T00:00:00Z"),
  },
  {
    id: "seed-application-014",
    jobId: "seed-job-005",
    candidateId: "seed-candidate-003",
    stage: ApplicationStage.NEW,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Fresh inbound application from careers page.",
    stageUpdatedAt: new Date("2026-03-06T00:00:00Z"),
  },
  {
    id: "seed-application-015",
    jobId: "seed-job-005",
    candidateId: "seed-candidate-007",
    stage: ApplicationStage.OFFER,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Offer drafted pending compensation review.",
    stageUpdatedAt: new Date("2026-03-08T00:00:00Z"),
  },
  {
    id: "seed-application-016",
    jobId: "seed-job-006",
    candidateId: "seed-candidate-004",
    stage: ApplicationStage.SCREENING,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Strong commercial background, moving to manager screen.",
    stageUpdatedAt: new Date("2026-03-04T00:00:00Z"),
  },
  {
    id: "seed-application-017",
    jobId: "seed-job-006",
    candidateId: "seed-candidate-008",
    stage: ApplicationStage.HIRED,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Offer accepted for AE role.",
    stageUpdatedAt: new Date("2026-03-09T00:00:00Z"),
  },
  {
    id: "seed-application-018",
    jobId: "seed-job-007",
    candidateId: "seed-candidate-005",
    stage: ApplicationStage.INTERVIEWING,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Leadership panel scheduled for next week.",
    stageUpdatedAt: new Date("2026-03-05T00:00:00Z"),
  },
  {
    id: "seed-application-019",
    jobId: "seed-job-007",
    candidateId: "seed-candidate-009",
    stage: ApplicationStage.REJECTED,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Process stopped after work-sample review.",
    stageUpdatedAt: new Date("2026-03-06T00:00:00Z"),
  },
  {
    id: "seed-application-020",
    jobId: "seed-job-008",
    candidateId: "seed-candidate-006",
    stage: ApplicationStage.FINAL_ROUND,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Final leadership round pending.",
    stageUpdatedAt: new Date("2026-03-08T00:00:00Z"),
  },
  {
    id: "seed-application-021",
    jobId: "seed-job-008",
    candidateId: "seed-candidate-010",
    stage: ApplicationStage.WITHDRAWN,
    recruiterOwner: "Jane Recruiter",
    interviewNotes: "Candidate withdrew after timing mismatch.",
    stageUpdatedAt: new Date("2026-03-04T00:00:00Z"),
  },
];

async function seedAdmin(prisma: PrismaClient): Promise<string> {
  const adminEnv = resolveAdminEnv();
  if (!adminEnv) {
    const existingAdmin = await prisma.user.findFirst({
      where: {
        role: UserRole.ADMIN,
        active: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        email: true,
      },
    });

    if (existingAdmin) {
      console.log(`Admin bootstrap skipped; using existing admin ${existingAdmin.email}`);
      return existingAdmin.email;
    }

    throw new Error(
      "No active admin exists and ADMIN_* env vars are not set. " +
        "Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD before the first prisma db seed run.",
    );
  }

  const passwordHash = await hash(adminEnv.password, 10);

  await prisma.user.upsert({
    where: { email: adminEnv.email },
    update: {
      name: adminEnv.name,
      role: UserRole.ADMIN,
      active: true,
      mustChangePassword: false,
      passwordHash,
    },
    create: {
      name: adminEnv.name,
      email: adminEnv.email,
      role: UserRole.ADMIN,
      active: true,
      mustChangePassword: false,
      passwordHash,
    },
  });

  return adminEnv.email;
}

async function seedJobs(prisma: PrismaClient) {
  for (const job of jobs) {
    await prisma.job.upsert({
      where: { id: job.id },
      update: job,
      create: job,
    });
  }
}

async function seedCandidates(prisma: PrismaClient) {
  for (const candidate of candidates) {
    await prisma.candidate.upsert({
      where: { id: candidate.id },
      update: candidate,
      create: candidate,
    });
  }
}

async function seedApplications(prisma: PrismaClient) {
  for (const application of applications) {
    await prisma.application.upsert({
      where: { id: application.id },
      update: application,
      create: application,
    });
  }
}

async function clearRecruitingData(prisma: PrismaClient) {
  await prisma.tradeoff.deleteMany();
  await prisma.headcountProjection.deleteMany();
  await prisma.application.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.job.deleteMany();
}

async function seedDemoData(prisma: PrismaClient) {
  await clearRecruitingData(prisma);
  await seedJobs(prisma);
  await seedCandidates(prisma);
  await seedApplications(prisma);
}

async function main() {
  const seedMode = resolveSeedMode();
  const prisma = createPrismaClient();

  try {
    console.log(`Seed mode: ${seedMode}`);
    const adminEmail = await seedAdmin(prisma);

    if (seedMode === "wfp") {
      await runWfpImport({ prisma });

      console.log("Seed complete");
      console.log(`Mode: ${seedMode}`);
      console.log(`Admin: ${adminEmail}`);
      return;
    }

    await seedDemoData(prisma);

    console.log("Seed complete");
    console.log(`Mode: ${seedMode}`);
    console.log(`Admin: ${adminEmail}`);
    console.log(`Jobs: ${jobs.length}`);
    console.log(`Candidates: ${candidates.length}`);
    console.log(`Applications: ${applications.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed");
  console.error(error);
  process.exit(1);
});
