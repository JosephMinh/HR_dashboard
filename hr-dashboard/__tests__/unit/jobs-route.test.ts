import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const findManyMock = vi.fn()
const countMock = vi.fn()
const createMock = vi.fn()
const getClientIpMock = vi.fn()
const logAuditCreateMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

vi.mock("@/lib/audit", () => ({
  getClientIp: getClientIpMock,
  logAuditCreate: logAuditCreateMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    job: {
      findMany: findManyMock,
      count: countMock,
      create: createMock,
    },
  },
}))

describe("GET /api/jobs", () => {
  beforeEach(() => {
    authMock.mockReset()
    findManyMock.mockReset()
    countMock.mockReset()
    createMock.mockReset()
    getClientIpMock.mockReset()
    logAuditCreateMock.mockReset()
  })

  it("returns 401 for unauthenticated requests", async () => {
    authMock.mockResolvedValue(null)

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(new Request("http://localhost/api/jobs") as never)

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    expect(findManyMock).not.toHaveBeenCalled()
    expect(countMock).not.toHaveBeenCalled()
  })

  it("returns 400 when an invalid order query param is provided", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request("http://localhost/api/jobs?order=sideways") as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid order parameter: must be "asc" or "desc"',
    })
    expect(findManyMock).not.toHaveBeenCalled()
    expect(countMock).not.toHaveBeenCalled()
  })

  it("returns 400 for invalid page parameter", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request("http://localhost/api/jobs?page=abc") as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid page parameter: must be a positive integer",
    })
  })

  it("returns 400 for invalid pageSize parameter", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request("http://localhost/api/jobs?pageSize=200") as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid pageSize parameter: must be between 1 and 100",
    })
  })

  it("returns 400 for invalid sort parameter", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request("http://localhost/api/jobs?sort=invalid") as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Invalid sort parameter"),
    })
  })

  it("returns paginated results with metadata", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })

    const now = new Date("2026-03-10T01:00:00.000Z")
    findManyMock.mockResolvedValue([
      {
        id: "job-1",
        title: "Backend Engineer",
        department: "Engineering",
        description: "Own API development",
        location: null,
        hiringManager: null,
        recruiterOwner: null,
        status: "OPEN",
        priority: "MEDIUM",
        pipelineHealth: null,
        isCritical: false,
        openedAt: now,
        targetFillDate: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ])
    countMock.mockResolvedValue(25)

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request("http://localhost/api/jobs?page=2&pageSize=10") as never,
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.page).toBe(2)
    expect(data.pageSize).toBe(10)
    expect(data.total).toBe(25)
    expect(data.totalPages).toBe(3)
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      }),
    )
  })

  it("applies the new nullable string filters as exact matches", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })
    findManyMock.mockResolvedValue([])
    countMock.mockResolvedValue(0)

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request(
        "http://localhost/api/jobs?location=Remote&recruiterOwner=Alex%20Recruiter&functionalPriority=Horizon%202&corporatePriority=Program",
      ) as never,
    )

    expect(response.status).toBe(200)
    expect(countMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { location: "Remote" },
            { recruiterOwner: "Alex Recruiter" },
            { functionalPriority: "Horizon 2" },
            { corporatePriority: "Program" },
          ],
        }),
      }),
    )
  })

  it("parses repeated categorical params without splitting comma-bearing values", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })
    findManyMock.mockResolvedValue([])
    countMock.mockResolvedValue(0)

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request(
        "http://localhost/api/jobs?status=OPEN&status=OFFER&department=Engineering&department=Product%20Ops&location=Chicago%2C%20IL&location=Remote",
      ) as never,
    )

    expect(response.status).toBe(200)
    expect(countMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["OPEN", "OFFER"] },
          department: { in: ["Engineering", "Product Ops"] },
          AND: [
            { location: { in: ["Chicago, IL", "Remote"] } },
          ],
        }),
      }),
    )
  })

  it("handles mixed __MISSING__ plus concrete values for nullable fields (OR within category)", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })
    findManyMock.mockResolvedValue([])
    countMock.mockResolvedValue(0)

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request(
        "http://localhost/api/jobs?location=Remote&location=__MISSING__&recruiterOwner=Jane+Recruiter&recruiterOwner=__MISSING__",
      ) as never,
    )

    expect(response.status).toBe(200)
    // buildNullableStringFieldFilter with 1 concrete + __MISSING__ produces:
    // { OR: [fieldEquals(field, value), { OR: [{ field: null }, { field: "" }] }] }
    expect(countMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { location: "Remote" },
                { OR: [{ location: null }, { location: "" }] },
              ],
            },
            {
              OR: [
                { recruiterOwner: "Jane Recruiter" },
                { OR: [{ recruiterOwner: null }, { recruiterOwner: "" }] },
              ],
            },
          ],
        }),
      }),
    )
  })

  it("handles multiple concrete values plus __MISSING__ for nullable fields", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })
    findManyMock.mockResolvedValue([])
    countMock.mockResolvedValue(0)

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request(
        "http://localhost/api/jobs?location=Remote&location=Chicago%2C%20IL&location=__MISSING__",
      ) as never,
    )

    expect(response.status).toBe(200)
    // 2 concrete values + missing → { OR: [fieldIn(...), fieldMissing(...)] }
    expect(countMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { location: { in: ["Remote", "Chicago, IL"] } },
                { OR: [{ location: null }, { location: "" }] },
              ],
            },
          ],
        }),
      }),
    )
  })

  it("maps the missing-value token to null-or-empty predicates", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })
    findManyMock.mockResolvedValue([])
    countMock.mockResolvedValue(0)

    const { GET } = await import("@/app/api/jobs/route")
    const response = await GET(
      new Request(
        "http://localhost/api/jobs?location=__MISSING__&recruiterOwner=__MISSING__",
      ) as never,
    )

    expect(response.status).toBe(200)
    expect(countMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { OR: [{ location: null }, { location: "" }] },
            { OR: [{ recruiterOwner: null }, { recruiterOwner: "" }] },
          ],
        }),
      }),
    )
  })
})

describe("POST /api/jobs", () => {
  beforeEach(() => {
    authMock.mockReset()
    createMock.mockReset()
    getClientIpMock.mockReset()
    logAuditCreateMock.mockReset()
    getClientIpMock.mockReturnValue("127.0.0.1")
    logAuditCreateMock.mockResolvedValue(undefined)
  })

  it("rejects targetFillDate before openedAt", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })

    const { POST } = await import("@/app/api/jobs/route")
    const response = await POST(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: "Platform Engineer",
          department: "Engineering",
          description: "Own platform reliability and uptime metrics.",
          openedAt: "2026-04-10T00:00:00.000Z",
          targetFillDate: "2026-04-01T00:00:00.000Z",
          pipelineHealth: "ON_TRACK",
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Target fill date must be on or after opened date",
    })
    expect(createMock).not.toHaveBeenCalled()
  })

  it("requires pipelineHealth when creating an OPEN job", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-2", role: "RECRUITER" },
    })

    const { POST } = await import("@/app/api/jobs/route")
    const response = await POST(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: "UX Designer",
          department: "Design",
          description: "Drive product and interaction design quality.",
          status: "OPEN",
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Pipeline health is required for open jobs",
    })
    expect(createMock).not.toHaveBeenCalled()
  })

  it("sets closedAt when creating a HIRED job", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-3", role: "ADMIN" },
    })

    const now = new Date("2026-03-10T02:30:00.000Z")
    createMock.mockResolvedValue({
      id: "job-42",
      title: "Security Engineer",
      department: "Engineering",
      description: "Harden auth and infrastructure controls.",
      location: null,
      hiringManager: null,
      recruiterOwner: null,
      status: "HIRED",
      priority: "HIGH",
      pipelineHealth: null,
      isCritical: false,
      openedAt: now,
      targetFillDate: null,
      closedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    const { POST } = await import("@/app/api/jobs/route")
    const response = await POST(
      new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: "Security Engineer",
          department: "Engineering",
          description: "Harden auth and infrastructure controls.",
          status: "HIRED",
          priority: "HIGH",
        }),
      }) as never,
    )

    expect(response.status).toBe(201)
    expect(createMock).toHaveBeenCalled()
    const createPayload = createMock.mock.calls[0]?.[0]
    expect(createPayload.data.closedAt).toBeInstanceOf(Date)
    await expect(response.json()).resolves.toMatchObject({
      id: "job-42",
      status: "HIRED",
    })
  })
})
