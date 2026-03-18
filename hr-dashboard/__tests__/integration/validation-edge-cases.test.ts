/**
 * Integration Tests: Validation Edge Cases
 *
 * Comprehensive tests for validation boundary conditions across all API endpoints.
 * Tests string lengths, email formats, enum values, date validation, and cross-field rules.
 *
 * Related bead: hr-3bqs.12
 */
import { beforeEach, describe, expect, it } from "vitest"

import {
  createTestFactories,
  getTestPrisma,
  setupIntegrationTests,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

const testAuth = setupTestAuth()

describe("Integration: Validation Edge Cases", () => {
  // Use resetBeforeEach: false since validation tests don't need clean db state
  // They test request validation before database operations
  setupIntegrationTests({ logger: true, resetBeforeEach: false })
  const factories = createTestFactories()

  beforeEach(async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })
  })

  // =========================================================================
  // JOBS API - STRING LENGTH VALIDATION
  // =========================================================================
  describe("Jobs API - String Length Validation", () => {
    it("rejects title shorter than 3 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "AB",
            department: "Engineering",
            description: "Valid description text here.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Title must be at least 3 characters")
    })

    it("accepts title at exactly 3 characters (boundary)", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "ABC",
            department: "Engineering",
            description: "Valid description text here.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("accepts title at exactly 200 characters (boundary)", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "A".repeat(200),
            department: "Engineering",
            description: "Valid description text here.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("rejects title longer than 200 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "A".repeat(201),
            department: "Engineering",
            description: "Valid description text here.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Title must be at most 200 characters")
    })

    it("rejects empty department", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "",
            description: "Valid description text here.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Department is required")
    })

    it("rejects description shorter than 10 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Too short",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Description must be at least 10 characters")
    })

    it("accepts description at exactly 10 characters (boundary)", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Exactly10!", // 10 chars
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })
  })

  // =========================================================================
  // JOBS API - ENUM VALIDATION
  // =========================================================================
  describe("Jobs API - Enum Validation", () => {
    it("rejects invalid status value", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            status: "INVALID_STATUS",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects lowercase status value (case sensitivity)", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            status: "open", // lowercase
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects invalid priority value", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            priority: "URGENT", // not a valid value
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects invalid pipelineHealth value", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            pipelineHealth: "DELAYED", // not a valid value
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })
  })

  // =========================================================================
  // JOBS API - DATE VALIDATION
  // =========================================================================
  describe("Jobs API - Date Validation", () => {
    it("accepts targetFillDate equal to openedAt (same day)", async () => {
      const sameDate = "2026-04-15T00:00:00.000Z"
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            openedAt: sameDate,
            targetFillDate: sameDate,
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("accepts targetFillDate one day after openedAt", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            openedAt: "2026-04-15T00:00:00.000Z",
            targetFillDate: "2026-04-16T00:00:00.000Z",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("rejects targetFillDate one millisecond before openedAt", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            openedAt: "2026-04-15T00:00:00.001Z",
            targetFillDate: "2026-04-15T00:00:00.000Z",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Target fill date must be on or after opened date")
    })

    it("accepts job without dates (optional fields)", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("accepts targetFillDate without openedAt", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            targetFillDate: "2026-04-15T00:00:00.000Z",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })
  })

  // =========================================================================
  // JOBS API - CROSS-FIELD VALIDATION
  // =========================================================================
  describe("Jobs API - Cross-Field Validation", () => {
    it("allows HIRED job without pipelineHealth", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            status: "HIRED",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("allows NOT_STARTED job without pipelineHealth", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            status: "NOT_STARTED",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("rejects OPEN job with null pipelineHealth", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            status: "OPEN",
            pipelineHealth: null,
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Pipeline health is required for open jobs")
    })
  })

  // =========================================================================
  // CANDIDATES API - EMAIL VALIDATION
  // =========================================================================
  describe("Candidates API - Email Validation", () => {
    it("accepts valid basic email", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            email: "john.doe@example.com",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("accepts email with plus addressing", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            email: "john.doe+tag@example.com",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("accepts email with subdomain", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            email: "john@mail.example.co.uk",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("rejects email without @ symbol", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            email: "notanemail",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects email with double @", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            email: "double@@example.com",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects email without TLD", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            email: "john@localhost",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects email with single-char TLD", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            email: "john@example.c",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("accepts candidate without email (optional field)", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("accepts candidate with null email", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            email: null,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })
  })

  // =========================================================================
  // CANDIDATES API - NAME VALIDATION
  // =========================================================================
  describe("Candidates API - Name Validation", () => {
    it("rejects empty firstName", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "",
            lastName: "Doe",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("First name is required")
    })

    it("rejects empty lastName", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Last name is required")
    })

    it("accepts single character names (boundary)", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "J",
            lastName: "D",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("rejects missing firstName field", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            lastName: "Doe",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects missing lastName field", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })
  })

  // =========================================================================
  // CANDIDATES API - SOURCE ENUM VALIDATION
  // =========================================================================
  describe("Candidates API - Source Enum Validation", () => {
    it("accepts all valid source values", async () => {
      const validSources = ["REFERRAL", "LINKEDIN", "CAREERS_PAGE", "AGENCY", "OTHER"]

      for (const source of validSources) {
        const { POST } = await import("@/app/api/candidates/route")
        const response = await POST(
          new Request("http://localhost/api/candidates", {
            method: "POST",
            body: JSON.stringify({
              firstName: "John",
              lastName: "Doe",
              source,
            }),
          }) as never,
        )

        expect(response.status).toBe(201)
      }
    })

    it("rejects invalid source value", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            source: "FACEBOOK", // not a valid source
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects lowercase source value", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            source: "linkedin", // lowercase
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })
  })

  // =========================================================================
  // APPLICATIONS API - UUID VALIDATION
  // =========================================================================
  describe("Applications API - UUID Validation", () => {
    it("rejects invalid jobId format", async () => {
      const candidate = await factories.createCandidate()

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: "not-a-valid-uuid",
            candidateId: candidate.id,
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Invalid job ID")
    })

    it("rejects invalid candidateId format", async () => {
      const job = await factories.createJob()
      const prisma = getTestPrisma()
      await prisma.job.update({
        where: { id: job.id },
        data: { pipelineHealth: "ON_TRACK" },
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: "not-a-valid-uuid",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Invalid candidate ID")
    })

    it("rejects jobId with extra characters", async () => {
      const candidate = await factories.createCandidate()

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: "123e4567-e89b-12d3-a456-426614174000-extra",
            candidateId: candidate.id,
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("accepts valid UUIDs in both v1 and v4 patterns", async () => {
      const job = await factories.createJob()
      const candidate = await factories.createCandidate()
      const prisma = getTestPrisma()
      await prisma.job.update({
        where: { id: job.id },
        data: { pipelineHealth: "ON_TRACK" },
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })
  })

  // =========================================================================
  // APPLICATIONS API - FIELD LENGTH VALIDATION
  // =========================================================================
  describe("Applications API - Field Length Validation", () => {
    it("accepts recruiterOwner at exactly 100 characters (boundary)", async () => {
      const job = await factories.createJob()
      const candidate = await factories.createCandidate()
      const prisma = getTestPrisma()
      await prisma.job.update({
        where: { id: job.id },
        data: { pipelineHealth: "ON_TRACK" },
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            recruiterOwner: "A".repeat(100),
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("rejects recruiterOwner longer than 100 characters", async () => {
      const job = await factories.createJob()
      const candidate = await factories.createCandidate()
      const prisma = getTestPrisma()
      await prisma.job.update({
        where: { id: job.id },
        data: { pipelineHealth: "ON_TRACK" },
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            recruiterOwner: "A".repeat(101),
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Recruiter owner must be at most 100 characters")
    })

    it("accepts interviewNotes at exactly 50000 characters (boundary)", async () => {
      const job = await factories.createJob()
      const candidate = await factories.createCandidate()
      const prisma = getTestPrisma()
      await prisma.job.update({
        where: { id: job.id },
        data: { pipelineHealth: "ON_TRACK" },
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            interviewNotes: "A".repeat(50000),
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("rejects interviewNotes longer than 50000 characters", async () => {
      const job = await factories.createJob()
      const candidate = await factories.createCandidate()
      const prisma = getTestPrisma()
      await prisma.job.update({
        where: { id: job.id },
        data: { pipelineHealth: "ON_TRACK" },
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            interviewNotes: "A".repeat(50001),
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Interview notes must be at most 50000 characters")
    })
  })

  // =========================================================================
  // APPLICATIONS API - STAGE ENUM VALIDATION
  // =========================================================================
  describe("Applications API - Stage Enum Validation", () => {
    it("accepts all valid stage values", async () => {
      const validStages = [
        "NEW",
        "SCREENING",
        "INTERVIEWING",
        "FINAL_ROUND",
        "OFFER",
        "HIRED",
        "REJECTED",
        "WITHDRAWN",
      ]

      for (const stage of validStages) {
        const job = await factories.createJob()
        const candidate = await factories.createCandidate()
        const prisma = getTestPrisma()
        await prisma.job.update({
          where: { id: job.id },
          data: { pipelineHealth: "ON_TRACK" },
        })

        const { POST } = await import("@/app/api/applications/route")
        const response = await POST(
          new Request("http://localhost/api/applications", {
            method: "POST",
            body: JSON.stringify({
              jobId: job.id,
              candidateId: candidate.id,
              stage,
            }),
          }) as never,
        )

        expect(response.status).toBe(201)
      }
    })

    it("rejects invalid stage value", async () => {
      const job = await factories.createJob()
      const candidate = await factories.createCandidate()
      const prisma = getTestPrisma()
      await prisma.job.update({
        where: { id: job.id },
        data: { pipelineHealth: "ON_TRACK" },
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            stage: "PHONE_SCREEN", // not a valid stage
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects lowercase stage value", async () => {
      const job = await factories.createJob()
      const candidate = await factories.createCandidate()
      const prisma = getTestPrisma()
      await prisma.job.update({
        where: { id: job.id },
        data: { pipelineHealth: "ON_TRACK" },
      })

      const { POST } = await import("@/app/api/applications/route")
      const response = await POST(
        new Request("http://localhost/api/applications", {
          method: "POST",
          body: JSON.stringify({
            jobId: job.id,
            candidateId: candidate.id,
            stage: "new", // lowercase
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })
  })

  // =========================================================================
  // JSON PARSING EDGE CASES
  // =========================================================================
  describe("JSON Parsing Edge Cases", () => {
    it("rejects malformed JSON in request body", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: "{ invalid json",
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("rejects empty request body", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: "",
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("handles null value for required field", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: null,
            department: "Engineering",
            description: "Valid description text here.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })

    it("ignores extra unknown fields (tolerance)", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Valid Title",
            department: "Engineering",
            description: "Valid description text here.",
            pipelineHealth: "ON_TRACK",
            unknownField: "should be ignored",
            anotherUnknown: 12345,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })
  })

  // =========================================================================
  // RESUME KEY FORMAT VALIDATION
  // =========================================================================
  describe("Resume Key Format Validation", () => {
    it("accepts valid resume key format", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            resumeKey: "resumes/123e4567-e89b-12d3-a456-426614174000.pdf",
            resumeName: "resume.pdf",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
    })

    it("rejects resume key without resumes/ prefix", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            resumeKey: "123e4567-e89b-12d3-a456-426614174000.pdf",
            resumeName: "resume.pdf",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Invalid resume key format")
    })

    it("rejects resume key with path traversal attempt", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            resumeKey: "resumes/../../../etc/passwd",
            resumeName: "resume.pdf",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Invalid resume key format")
    })

    it("rejects resume key with invalid UUID", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            resumeKey: "resumes/not-a-valid-uuid.pdf",
            resumeName: "resume.pdf",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      const json = await response.json()
      expect(json.error).toContain("Invalid resume key format")
    })

    it("rejects resume key with invalid file extension", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "Doe",
            resumeKey: "resumes/123e4567-e89b-12d3-a456-426614174000.exe",
            resumeName: "resume.exe",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
    })
  })
})
