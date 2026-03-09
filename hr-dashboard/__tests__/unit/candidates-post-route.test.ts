import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const candidateFindManyMock = vi.fn()
const candidateCountMock = vi.fn()
const candidateCreateMock = vi.fn()
const jobFindUniqueMock = vi.fn()
const applicationCreateMock = vi.fn()
const getClientIpMock = vi.fn()
const logAuditCreateMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    candidate: {
      findMany: candidateFindManyMock,
      count: candidateCountMock,
      create: candidateCreateMock,
    },
    job: {
      findUnique: jobFindUniqueMock,
    },
    application: {
      create: applicationCreateMock,
    },
  },
}))

vi.mock("@/lib/audit", () => ({
  getClientIp: getClientIpMock,
  logAuditCreate: logAuditCreateMock,
}))

describe("POST /api/candidates", () => {
  beforeEach(() => {
    authMock.mockReset()
    candidateFindManyMock.mockReset()
    candidateCountMock.mockReset()
    candidateCreateMock.mockReset()
    jobFindUniqueMock.mockReset()
    applicationCreateMock.mockReset()
    getClientIpMock.mockReset()
    logAuditCreateMock.mockReset()
    getClientIpMock.mockReturnValue("127.0.0.1")
    logAuditCreateMock.mockResolvedValue(undefined)
  })

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null)

    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({ firstName: "Ava", lastName: "Chen" }),
      }) as never,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    expect(candidateCreateMock).not.toHaveBeenCalled()
  })

  it("returns 403 for viewer role", async () => {
    authMock.mockResolvedValue({
      user: { id: "viewer-1", role: "VIEWER", name: "Viewer User" },
    })

    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({ firstName: "Ava", lastName: "Chen" }),
      }) as never,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Only admins and recruiters can create, update, or delete recruiting data.",
    })
    expect(candidateCreateMock).not.toHaveBeenCalled()
  })

  it("returns 400 for invalid request body", async () => {
    authMock.mockResolvedValue({
      user: { id: "recruiter-1", role: "RECRUITER", name: "Jane Recruiter" },
    })

    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({ firstName: "", lastName: "Chen" }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "First name is required",
    })
    expect(candidateCreateMock).not.toHaveBeenCalled()
  })

  it("creates a candidate and links to a job when jobId is provided", async () => {
    authMock.mockResolvedValue({
      user: { id: "recruiter-1", role: "RECRUITER", name: "Jane Recruiter" },
    })
    jobFindUniqueMock.mockResolvedValue({ id: "job-1" })

    const now = new Date("2026-03-09T08:40:00.000Z")
    candidateCreateMock.mockResolvedValue({
      id: "cand-100",
      firstName: "Ava",
      lastName: "Chen",
      email: "ava.chen@example.com",
      phone: null,
      linkedinUrl: null,
      currentCompany: null,
      location: null,
      source: "REFERRAL",
      resumeKey: null,
      resumeName: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    applicationCreateMock.mockResolvedValue({ id: "app-100" })

    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Ava",
          lastName: "Chen",
          email: "ava.chen@example.com",
          source: "REFERRAL",
          jobId: "job-1",
        }),
      }) as never,
    )

    expect(jobFindUniqueMock).toHaveBeenCalledWith({
      where: { id: "job-1" },
      select: { id: true },
    })
    expect(candidateCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firstName: "Ava",
        lastName: "Chen",
        email: "ava.chen@example.com",
        source: "REFERRAL",
        resumeKey: null,
        resumeName: null,
      }),
    })
    expect(applicationCreateMock).toHaveBeenCalledWith({
      data: {
        jobId: "job-1",
        candidateId: "cand-100",
        stage: "NEW",
        recruiterOwner: "Jane Recruiter",
      },
    })
    expect(logAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "recruiter-1",
        action: "CANDIDATE_CREATED",
        entityType: "Candidate",
        entityId: "cand-100",
        ipAddress: "127.0.0.1",
      }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      candidate: {
        id: "cand-100",
        firstName: "Ava",
        lastName: "Chen",
        email: "ava.chen@example.com",
        phone: null,
        linkedinUrl: null,
        currentCompany: null,
        location: null,
        source: "REFERRAL",
        resumeKey: null,
        resumeName: null,
        notes: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      linkedJobId: "job-1",
    })
  })

  it("returns 400 when linking to an unknown job", async () => {
    authMock.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN", name: "Admin User" },
    })
    jobFindUniqueMock.mockResolvedValue(null)

    const { POST } = await import("@/app/api/candidates/route")
    const response = await POST(
      new Request("http://localhost/api/candidates", {
        method: "POST",
        body: JSON.stringify({
          firstName: "Priya",
          lastName: "Nair",
          jobId: "missing-job",
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Job not found" })
    expect(candidateCreateMock).not.toHaveBeenCalled()
    expect(applicationCreateMock).not.toHaveBeenCalled()
  })
})
