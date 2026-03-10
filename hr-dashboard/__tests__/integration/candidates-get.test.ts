import { beforeEach, describe, expect, it, vi } from "vitest"

import { createMockSession } from "@/test/auth"
import {
  createTestFactories,
  getTestPrisma,
  setupIntegrationTests,
} from "@/test/setup-integration"

const authMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

describe("Integration: GET /api/candidates", () => {
  setupIntegrationTests({ logger: true })
  const factories = createTestFactories()

  beforeEach(() => {
    authMock.mockResolvedValue(createMockSession({ role: "RECRUITER" }))
  })

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null)

    const { GET } = await import("@/app/api/candidates/route")
    const response = await GET(new Request("http://localhost/api/candidates") as never)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("supports name search across first + last name", async () => {
    await factories.createCandidate({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    })
    await factories.createCandidate({
      firstName: "Alan",
      lastName: "Turing",
      email: "alan@example.com",
    })

    const { GET } = await import("@/app/api/candidates/route")
    const response = await GET(
      new Request("http://localhost/api/candidates?search=Ada%20Lovelace") as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.total).toBe(1)
    expect(payload.candidates[0].email).toBe("ada@example.com")
  })

  it("includes jobCount when requested", async () => {
    const prisma = getTestPrisma()
    const candidate = await factories.createCandidate({
      firstName: "Grace",
      lastName: "Hopper",
      email: "grace@example.com",
    })
    const jobOne = await factories.createJob({ title: "Role One" })
    const jobTwo = await factories.createJob({ title: "Role Two" })

    await prisma.application.create({
      data: {
        jobId: jobOne.id,
        candidateId: candidate.id,
        stage: "SCREENING",
      },
    })
    await prisma.application.create({
      data: {
        jobId: jobTwo.id,
        candidateId: candidate.id,
        stage: "INTERVIEWING",
      },
    })

    const { GET } = await import("@/app/api/candidates/route")
    const response = await GET(
      new Request("http://localhost/api/candidates?includeJobCount=true") as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    const match = payload.candidates.find(
      (entry: { email: string }) => entry.email === "grace@example.com",
    )
    expect(match.jobCount).toBe(2)
  })

  it("sorts by updatedAt when requested", async () => {
    const prisma = getTestPrisma()
    const older = await factories.createCandidate({
      firstName: "Older",
      lastName: "Candidate",
      email: "older@example.com",
    })
    const newer = await factories.createCandidate({
      firstName: "Newer",
      lastName: "Candidate",
      email: "newer@example.com",
    })

    await prisma.candidate.update({
      where: { id: older.id },
      data: { updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    })
    await prisma.candidate.update({
      where: { id: newer.id },
      data: { updatedAt: new Date("2026-02-01T00:00:00.000Z") },
    })

    const { GET } = await import("@/app/api/candidates/route")
    const response = await GET(
      new Request("http://localhost/api/candidates?sort=updatedAt&order=desc") as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.candidates[0].email).toBe("newer@example.com")
    expect(payload.candidates[1].email).toBe("older@example.com")
  })

  describe("pagination", () => {
    it("returns pagination metadata with default values", async () => {
      await factories.createCandidate({ firstName: "Alice", lastName: "Smith" })
      await factories.createCandidate({ firstName: "Bob", lastName: "Jones" })

      const { GET } = await import("@/app/api/candidates/route")
      const response = await GET(new Request("http://localhost/api/candidates") as never)

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.page).toBe(1)
      expect(data.pageSize).toBe(20)
      expect(data.total).toBe(2)
      expect(data.totalPages).toBe(1)
    })

    it("paginates results correctly", async () => {
      // Create 5 candidates
      for (let i = 1; i <= 5; i++) {
        await factories.createCandidate({
          firstName: `Candidate`,
          lastName: `${i}`,
          email: `candidate${i}@example.com`,
        })
      }

      const { GET } = await import("@/app/api/candidates/route")
      const response = await GET(
        new Request("http://localhost/api/candidates?page=2&pageSize=2") as never,
      )

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.page).toBe(2)
      expect(data.pageSize).toBe(2)
      expect(data.total).toBe(5)
      expect(data.totalPages).toBe(3)
      expect(data.candidates).toHaveLength(2)
    })

    it("returns empty page when beyond total pages", async () => {
      await factories.createCandidate({ firstName: "Only", lastName: "Candidate" })

      const { GET } = await import("@/app/api/candidates/route")
      const response = await GET(
        new Request("http://localhost/api/candidates?page=10&pageSize=10") as never,
      )

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.page).toBe(10)
      expect(data.total).toBe(1)
      expect(data.totalPages).toBe(1)
      expect(data.candidates).toHaveLength(0)
    })

    it("returns 400 for invalid page parameter", async () => {
      const { GET } = await import("@/app/api/candidates/route")
      const response = await GET(
        new Request("http://localhost/api/candidates?page=-1") as never,
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("page")
    })

    it("returns 400 for invalid pageSize parameter", async () => {
      const { GET } = await import("@/app/api/candidates/route")
      const response = await GET(
        new Request("http://localhost/api/candidates?pageSize=500") as never,
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("pageSize")
    })

    it("returns 400 for invalid sort parameter", async () => {
      const { GET } = await import("@/app/api/candidates/route")
      const response = await GET(
        new Request("http://localhost/api/candidates?sort=invalid") as never,
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("sort")
    })

    it("returns 400 for invalid order parameter", async () => {
      const { GET } = await import("@/app/api/candidates/route")
      const response = await GET(
        new Request("http://localhost/api/candidates?order=random") as never,
      )

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain("order")
    })

    it("combines pagination with search correctly", async () => {
      // Create candidates with searchable names
      for (let i = 1; i <= 4; i++) {
        await factories.createCandidate({
          firstName: "Alice",
          lastName: `Smith${i}`,
          email: `alice${i}@example.com`,
        })
      }
      await factories.createCandidate({
        firstName: "Bob",
        lastName: "Jones",
        email: "bob@example.com",
      })

      const { GET } = await import("@/app/api/candidates/route")
      const response = await GET(
        new Request("http://localhost/api/candidates?search=Alice&page=1&pageSize=2") as never,
      )

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.total).toBe(4) // Only Alice candidates counted
      expect(data.totalPages).toBe(2)
      expect(data.candidates).toHaveLength(2)
      expect(data.candidates.every((c: { firstName: string }) => c.firstName === "Alice")).toBe(true)
    })
  })
})
