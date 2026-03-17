import { beforeEach, describe, expect, it } from "vitest"

import { setupIntegrationTests } from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

const testAuth = setupTestAuth()

describe("Integration: Candidates API Validation Edge Cases", () => {
  setupIntegrationTests({ logger: true })

  beforeEach(async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })
  })

  describe("POST /api/candidates - Name validation", () => {
    it("rejects missing firstName", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            lastName: "Smith",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "First name is required",
      })
    })

    it("rejects missing lastName", async () => {
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
      await expect(response.json()).resolves.toEqual({
        error: "Last name is required",
      })
    })

    it("rejects firstName longer than 100 characters", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "A".repeat(101),
            lastName: "Smith",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "First name must be at most 100 characters",
      })
    })

    it("rejects lastName longer than 100 characters", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "S".repeat(101),
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Last name must be at most 100 characters",
      })
    })

    it("accepts firstName exactly 100 characters", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const longFirstName = "A".repeat(100)
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: longFirstName,
            lastName: "Smith",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.firstName).toBe(longFirstName)
    })

    it("accepts lastName exactly 100 characters", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const longLastName = "S".repeat(100)
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: longLastName,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.lastName).toBe(longLastName)
    })

    it("trims whitespace from names", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "  John  ",
            lastName: "  Smith  ",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.firstName).toBe("John")
      expect(payload.candidate.lastName).toBe("Smith")
    })

    it("rejects firstName that is only whitespace", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "   ",
            lastName: "Smith",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "First name is required",
      })
    })

    it("rejects lastName that is only whitespace", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "John",
            lastName: "   ",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Last name is required",
      })
    })
  })

  describe("POST /api/candidates - Email validation", () => {
    it("accepts valid email formats", async () => {
      const validEmails = [
        "test@example.com",
        "test.name@example.com",
        "test+tag@example.com",
        "test@subdomain.example.com",
        "a@b.io",
        "user_name@example.co.uk",
      ]

      for (const email of validEmails) {
        const { POST } = await import("@/app/api/candidates/route")
        const response = await POST(
          new Request("http://localhost/api/candidates", {
            method: "POST",
            body: JSON.stringify({
              firstName: "Test",
              lastName: "User",
              email,
            }),
          }) as never,
        )

        expect(response.status).toBe(201)
        const payload = await response.json()
        expect(payload.candidate.email).toBe(email)
      }
    })

    it("rejects invalid email formats", async () => {
      const invalidEmails = [
        "notanemail",
        "@nolocal.com",
        "missing@",
        "double@@at.com",
        "spaces in@email.com",
        "missing.tld@example",
      ]

      for (const email of invalidEmails) {
        const { POST } = await import("@/app/api/candidates/route")
        const response = await POST(
          new Request("http://localhost/api/candidates", {
            method: "POST",
            body: JSON.stringify({
              firstName: "Test",
              lastName: "User",
              email,
            }),
          }) as never,
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
          error: "Invalid email format",
        })
      }
    })

    it("rejects email exceeding RFC 5321 max length (254 chars)", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      // Create an email that exceeds 254 characters
      const longLocalPart = "a".repeat(250)
      const longEmail = `${longLocalPart}@example.com`
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            email: longEmail,
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Invalid email format",
      })
    })

    it("accepts null email", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            email: null,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.email).toBeNull()
    })

    it("converts empty email to null", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            email: "",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.email).toBeNull()
    })
  })

  describe("POST /api/candidates - LinkedIn URL validation", () => {
    it("accepts valid LinkedIn URLs", async () => {
      const validUrls = [
        "https://linkedin.com/in/johndoe",
        "https://www.linkedin.com/in/johndoe",
        "https://in.linkedin.com/in/johndoe",
        "https://uk.linkedin.com/in/johndoe",
        "https://linkedin.com/company/acme",
      ]

      for (const linkedinUrl of validUrls) {
        const { POST } = await import("@/app/api/candidates/route")
        const response = await POST(
          new Request("http://localhost/api/candidates", {
            method: "POST",
            body: JSON.stringify({
              firstName: "Test",
              lastName: "User",
              linkedinUrl,
            }),
          }) as never,
        )

        expect(response.status).toBe(201)
        const payload = await response.json()
        expect(payload.candidate.linkedinUrl).toBe(linkedinUrl)
      }
    })

    it("rejects non-LinkedIn URLs", async () => {
      const invalidUrls = [
        "https://example.com/in/johndoe",
        "https://fakelinkedin.com/in/johndoe",
        "https://linkedin.example.com/in/johndoe",
        "https://notlinkedin.com",
      ]

      for (const linkedinUrl of invalidUrls) {
        const { POST } = await import("@/app/api/candidates/route")
        const response = await POST(
          new Request("http://localhost/api/candidates", {
            method: "POST",
            body: JSON.stringify({
              firstName: "Test",
              lastName: "User",
              linkedinUrl,
            }),
          }) as never,
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
          error: "URL must be a LinkedIn profile",
        })
      }
    })

    it("rejects LinkedIn subdomain spoofing attempts", async () => {
      const spoofingUrls = [
        "https://linkedin.com.evil.com/in/johndoe",
        "https://linkedin.com.attacker.net/in/johndoe",
      ]

      for (const linkedinUrl of spoofingUrls) {
        const { POST } = await import("@/app/api/candidates/route")
        const response = await POST(
          new Request("http://localhost/api/candidates", {
            method: "POST",
            body: JSON.stringify({
              firstName: "Test",
              lastName: "User",
              linkedinUrl,
            }),
          }) as never,
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
          error: "URL must be a LinkedIn profile",
        })
      }
    })

    it("rejects invalid URL format", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            linkedinUrl: "not-a-valid-url",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Invalid LinkedIn URL",
      })
    })

    it("accepts null linkedinUrl", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            linkedinUrl: null,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.linkedinUrl).toBeNull()
    })
  })

  describe("POST /api/candidates - Notes validation", () => {
    it("rejects notes longer than 10000 characters", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            notes: "N".repeat(10001),
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Notes must be at most 10000 characters",
      })
    })

    it("accepts notes exactly 10000 characters", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const longNotes = "N".repeat(10000)
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            notes: longNotes,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.notes).toBe(longNotes)
    })

    it("trims whitespace from notes", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            notes: "  Some notes here  ",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.notes).toBe("Some notes here")
    })

    it("converts empty notes to null", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            notes: "",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.notes).toBeNull()
    })
  })

  describe("POST /api/candidates - Source validation", () => {
    it("accepts valid source values", async () => {
      const validSources = ["REFERRAL", "LINKEDIN", "CAREERS_PAGE", "AGENCY", "OTHER"]

      for (const source of validSources) {
        const { POST } = await import("@/app/api/candidates/route")
        const response = await POST(
          new Request("http://localhost/api/candidates", {
            method: "POST",
            body: JSON.stringify({
              firstName: "Test",
              lastName: "User",
              source,
            }),
          }) as never,
        )

        expect(response.status).toBe(201)
        const payload = await response.json()
        expect(payload.candidate.source).toBe(source)
      }
    })

    it("rejects invalid source value", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            source: "INVALID_SOURCE",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "Invalid source",
      })
    })

    it("accepts null source", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            source: null,
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.source).toBeNull()
    })
  })

  describe("POST /api/candidates - Resume key validation", () => {
    it("accepts valid resume key format", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            resumeKey: "resumes/550e8400-e29b-41d4-a716-446655440000.pdf",
            resumeName: "resume.pdf",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.resumeKey).toBe("resumes/550e8400-e29b-41d4-a716-446655440000.pdf")
    })

    it("rejects invalid resume key formats", async () => {
      const invalidKeys = [
        "not-a-valid-key",
        "../../../etc/passwd",
        "resumes/invalid-uuid.pdf",
        "resumes/550e8400-e29b-41d4-a716-446655440000.exe",
        "resumes/550e8400-e29b-41d4-a716-446655440000",
        "550e8400-e29b-41d4-a716-446655440000.pdf",
      ]

      for (const resumeKey of invalidKeys) {
        const { POST } = await import("@/app/api/candidates/route")
        const response = await POST(
          new Request("http://localhost/api/candidates", {
            method: "POST",
            body: JSON.stringify({
              firstName: "Test",
              lastName: "User",
              resumeKey,
              resumeName: "resume.pdf",
            }),
          }) as never,
        )

        expect(response.status).toBe(400)
        await expect(response.json()).resolves.toEqual({
          error: "Invalid resume key format",
        })
      }
    })

    it("accepts valid resume extensions", async () => {
      const validExtensions = ["pdf", "doc", "docx", "txt", "rtf"]

      for (const ext of validExtensions) {
        const { POST } = await import("@/app/api/candidates/route")
        const response = await POST(
          new Request("http://localhost/api/candidates", {
            method: "POST",
            body: JSON.stringify({
              firstName: "Test",
              lastName: "User",
              resumeKey: `resumes/550e8400-e29b-41d4-a716-446655440000.${ext}`,
              resumeName: `resume.${ext}`,
            }),
          }) as never,
        )

        expect(response.status).toBe(201)
        const payload = await response.json()
        expect(payload.candidate.resumeKey).toBe(`resumes/550e8400-e29b-41d4-a716-446655440000.${ext}`)
      }
    })

    it("requires resumeKey and resumeName together - key without name", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            resumeKey: "resumes/550e8400-e29b-41d4-a716-446655440000.pdf",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "resumeKey and resumeName must be provided together",
      })
    })

    it("requires resumeKey and resumeName together - name without key", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            resumeName: "resume.pdf",
          }),
        }) as never,
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: "resumeKey and resumeName must be provided together",
      })
    })
  })

  describe("POST /api/candidates - Optional field trimming", () => {
    it("trims whitespace from all optional string fields", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            email: "  test@example.com  ",
            phone: "  555-1234  ",
            currentCompany: "  Acme Corp  ",
            location: "  New York  ",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.email).toBe("test@example.com")
      expect(payload.candidate.phone).toBe("555-1234")
      expect(payload.candidate.currentCompany).toBe("Acme Corp")
      expect(payload.candidate.location).toBe("New York")
    })

    it("converts empty optional strings to null", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
          method: "POST",
          body: JSON.stringify({
            firstName: "Test",
            lastName: "User",
            phone: "",
            currentCompany: "",
            location: "",
          }),
        }) as never,
      )

      expect(response.status).toBe(201)
      const payload = await response.json()
      expect(payload.candidate.phone).toBeNull()
      expect(payload.candidate.currentCompany).toBeNull()
      expect(payload.candidate.location).toBeNull()
    })
  })

  describe("POST /api/candidates - Invalid JSON", () => {
    it("rejects malformed JSON", async () => {
      const { POST } = await import("@/app/api/candidates/route")
      const response = await POST(
        new Request("http://localhost/api/candidates", {
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
