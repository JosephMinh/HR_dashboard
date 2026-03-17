import { beforeEach, describe, expect, it } from "vitest"

import { setupIntegrationTests } from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

const testAuth = setupTestAuth()

describe("Integration: Jobs API Validation Edge Cases", () => {
  setupIntegrationTests({ logger: true })

  beforeEach(async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })
  })

  describe("POST /api/jobs - Title validation", () => {
    it("rejects title shorter than 3 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "AB",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Title must be at least 3 characters",
      })
    })

    it("rejects title longer than 200 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "A".repeat(201),
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Title must be at most 200 characters",
      })
    })

    it("accepts title exactly 3 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Dev",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.title).toBe("Dev")
    })

    it("accepts title exactly 200 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const longTitle = "A".repeat(200)
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: longTitle,
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.title).toBe(longTitle)
    })

    it("rejects missing title", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Title is required",
      })
    })

    it("trims whitespace from title before validation", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "   Software Engineer   ",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.title).toBe("Software Engineer")
    })

    it("rejects title that is only whitespace", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "   ",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Title is required",
      })
    })
  })

  describe("POST /api/jobs - Department validation", () => {
    it("rejects missing department", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Department is required",
      })
    })

    it("rejects department longer than 100 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "D".repeat(101),
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Department must be at most 100 characters",
      })
    })

    it("accepts department exactly 100 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const longDept = "D".repeat(100)
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: longDept,
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.department).toBe(longDept)
    })
  })

  describe("POST /api/jobs - Description validation", () => {
    it("rejects description shorter than 10 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "Too short",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Description must be at least 10 characters",
      })
    })

    it("rejects description longer than 10000 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "D".repeat(10001),
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Description must be at most 10000 characters",
      })
    })

    it("accepts description exactly 10 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "Exactly 10",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.description).toBe("Exactly 10")
    })

    it("accepts description exactly 10000 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const longDesc = "D".repeat(10000)
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: longDesc,
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.description).toBe(longDesc)
    })

    it("rejects missing description", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            pipelineHealth: "ON_TRACK",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Description is required",
      })
    })
  })

  describe("POST /api/jobs - Optional field length validation", () => {
    it("rejects location longer than 200 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            location: "L".repeat(201),
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Location must be at most 200 characters",
      })
    })

    it("accepts location exactly 200 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const longLocation = "L".repeat(200)
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            location: longLocation,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.location).toBe(longLocation)
    })

    it("rejects hiringManager longer than 100 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            hiringManager: "H".repeat(101),
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Hiring manager must be at most 100 characters",
      })
    })

    it("accepts hiringManager exactly 100 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const longHM = "H".repeat(100)
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            hiringManager: longHM,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.hiringManager).toBe(longHM)
    })

    it("rejects recruiterOwner longer than 100 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            recruiterOwner: "R".repeat(101),
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Recruiter owner must be at most 100 characters",
      })
    })

    it("accepts recruiterOwner exactly 100 characters", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const longRO = "R".repeat(100)
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            recruiterOwner: longRO,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.recruiterOwner).toBe(longRO)
    })

    it("converts empty optional strings to null", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            location: "",
            hiringManager: "",
            recruiterOwner: "",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.location).toBeNull()
      expect(payload.hiringManager).toBeNull()
      expect(payload.recruiterOwner).toBeNull()
    })

    it("trims whitespace from optional fields", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            location: "  New York  ",
            hiringManager: "  Jane Doe  ",
            recruiterOwner: "  John Smith  ",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.location).toBe("New York")
      expect(payload.hiringManager).toBe("Jane Doe")
      expect(payload.recruiterOwner).toBe("John Smith")
    })
  })

  describe("POST /api/jobs - Enum validation", () => {
    it("rejects invalid status value", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            status: "INVALID_STATUS",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Invalid status",
      })
    })

    it("rejects invalid priority value", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            priority: "URGENT",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Invalid priority",
      })
    })

    it("rejects invalid pipelineHealth value", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "EXCELLENT",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Invalid pipeline health",
      })
    })

    it("rejects non-boolean isCritical value", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            isCritical: "yes",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "isCritical must be a boolean",
      })
    })

    it("accepts valid enum values", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            status: "OPEN",
            priority: "HIGH",
            pipelineHealth: "BEHIND",
            isCritical: true,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.status).toBe("OPEN")
      expect(payload.priority).toBe("HIGH")
      expect(payload.pipelineHealth).toBe("BEHIND")
      expect(payload.isCritical).toBe(true)
    })
  })

  describe("POST /api/jobs - Date validation", () => {
    it("rejects invalid openedAt date format", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            openedAt: "not-a-date",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Invalid openedAt date",
      })
    })

    it("rejects invalid targetFillDate format", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            targetFillDate: "invalid",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Invalid targetFillDate date",
      })
    })

    it("accepts valid ISO date strings", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const openedAt = "2026-03-01T00:00:00.000Z"
      const targetFillDate = "2026-04-01T00:00:00.000Z"
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            title: "Software Engineer",
            department: "Engineering",
            description: "A valid description that is long enough.",
            pipelineHealth: "ON_TRACK",
            openedAt,
            targetFillDate,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.openedAt).toBe(openedAt)
      expect(payload.targetFillDate).toBe(targetFillDate)
    })
  })

  describe("POST /api/jobs - Invalid JSON", () => {
    it("rejects malformed JSON", async () => {
      const { POST } = await import("@/app/api/jobs/route")
      const response = await POST(
        new Request("http://localhost/api/jobs", {
          method: "POST",
          body: "not valid json {",
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Invalid JSON",
      })
    })
  })
})
