import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const findManyMock = vi.fn()
const countMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    candidate: {
      findMany: findManyMock,
      count: countMock,
    },
  },
}))

describe("GET /api/candidates", () => {
  beforeEach(() => {
    authMock.mockReset()
    findManyMock.mockReset()
    countMock.mockReset()
  })

  it("returns 401 for unauthenticated requests", async () => {
    authMock.mockResolvedValue(null)

    const { GET } = await import("@/app/api/candidates/route")
    const response = await GET(
      new Request("http://localhost/api/candidates") as never,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    expect(findManyMock).not.toHaveBeenCalled()
    expect(countMock).not.toHaveBeenCalled()
  })

  it("applies default sorting and returns candidates without counts", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })

    const now = new Date("2026-03-09T08:00:00.000Z")
    findManyMock.mockResolvedValue([
      {
        id: "cand-1",
        firstName: "Ava",
        lastName: "Chen",
        email: "ava@example.com",
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
      },
    ])
    countMock.mockResolvedValue(1)

    const { GET } = await import("@/app/api/candidates/route")
    const response = await GET(
      new Request("http://localhost/api/candidates") as never,
    )
    const payload = await response.json()

    expect(findManyMock).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      include: undefined,
    })
    expect(countMock).toHaveBeenCalledWith({ where: {} })
    expect(payload).toEqual({
      candidates: [
        {
          id: "cand-1",
          firstName: "Ava",
          lastName: "Chen",
          email: "ava@example.com",
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
      ],
      total: 1,
    })
  })

  it("supports search, custom sort, and includeJobCount", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-2", role: "ADMIN" },
    })

    const now = new Date("2026-03-09T08:00:00.000Z")
    findManyMock.mockResolvedValue([
      {
        id: "cand-2",
        firstName: "Marcus",
        lastName: "Reed",
        email: "marcus@example.com",
        phone: "555-0102",
        linkedinUrl: null,
        currentCompany: "Pioneer Cloud",
        location: "Denver, CO",
        source: "LINKEDIN",
        resumeKey: null,
        resumeName: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
        _count: { applications: 3 },
      },
    ])
    countMock.mockResolvedValue(1)

    const { GET } = await import("@/app/api/candidates/route")
    const response = await GET(
      new Request(
        "http://localhost/api/candidates?search=Marcus%20Reed&sort=email&order=desc&includeJobCount=true",
      ) as never,
    )
    const payload = await response.json()

    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            AND: [
              { firstName: { contains: "Marcus", mode: "insensitive" } },
              { lastName: { contains: "Reed", mode: "insensitive" } },
            ],
          },
          { email: { contains: "Marcus Reed", mode: "insensitive" } },
        ],
      },
      orderBy: [
        { email: "desc" },
        { lastName: "asc" },
        { firstName: "asc" },
      ],
      include: {
        _count: {
          select: {
            applications: true,
          },
        },
      },
    })
    expect(countMock).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            AND: [
              { firstName: { contains: "Marcus", mode: "insensitive" } },
              { lastName: { contains: "Reed", mode: "insensitive" } },
            ],
          },
          { email: { contains: "Marcus Reed", mode: "insensitive" } },
        ],
      },
    })
    expect(payload).toEqual({
      candidates: [
        {
          id: "cand-2",
          firstName: "Marcus",
          lastName: "Reed",
          email: "marcus@example.com",
          phone: "555-0102",
          linkedinUrl: null,
          currentCompany: "Pioneer Cloud",
          location: "Denver, CO",
          source: "LINKEDIN",
          resumeKey: null,
          resumeName: null,
          notes: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          jobCount: 3,
        },
      ],
      total: 1,
    })
  })
})
