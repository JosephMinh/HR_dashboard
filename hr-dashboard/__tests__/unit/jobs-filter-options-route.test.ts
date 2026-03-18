import { beforeEach, describe, expect, it, vi } from "vitest"

const authMock = vi.fn()
const findManyMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    job: {
      findMany: findManyMock,
    },
  },
}))

describe("GET /api/jobs/filter-options", () => {
  beforeEach(() => {
    vi.resetModules()
    authMock.mockReset()
    findManyMock.mockReset()
  })

  it("returns 401 for unauthenticated requests", async () => {
    authMock.mockResolvedValue(null)

    const { GET } = await import("@/app/api/jobs/filter-options/route")
    const response = await GET()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it("returns sorted consolidated options with a stable missing bucket", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", role: "RECRUITER" },
    })

    const distinctValues: Record<string, Array<string | null>> = {
      department: ["Operations", "Engineering"],
      employeeType: ["Full-Time", "Contractor"],
      location: ["Remote", null, "  ", "New York"],
      recruiterOwner: ["Zoe", "Amy"],
      functionalPriority: ["3", null, "1"],
      corporatePriority: ["Program", "", "IPO"],
      function: ["Product", "Engineering"],
      level: ["L6", "L4"],
      horizon: ["Beyond 2026", "2026"],
      asset: [null, "Core"],
    }

    findManyMock.mockImplementation(async ({ select }: { select: Record<string, true> }) => {
      const [field] = Object.keys(select)
      return distinctValues[field]!.map((value) => ({ [field]: value }))
    })

    const {
      GET,
      JOB_FILTER_MISSING_VALUE,
      JOB_SERVER_FILTER_FIELDS,
    } = await import("@/app/api/jobs/filter-options/route")
    const response = await GET()

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.missingValue).toBe(JOB_FILTER_MISSING_VALUE)
    expect(Object.keys(data.options)).toEqual([...JOB_SERVER_FILTER_FIELDS])
    expect(data.options.department).toEqual([
      { value: "Engineering", label: "Engineering", isMissing: false },
      { value: "Operations", label: "Operations", isMissing: false },
    ])
    expect(data.options.employeeType).toEqual([
      { value: "Contractor", label: "Contractor", isMissing: false },
      { value: "Full-Time", label: "Full-Time", isMissing: false },
    ])
    expect(data.options.location).toEqual([
      { value: "New York", label: "New York", isMissing: false },
      { value: "Remote", label: "Remote", isMissing: false },
      { value: JOB_FILTER_MISSING_VALUE, label: "Missing", isMissing: true },
    ])
    expect(data.options.recruiterOwner).toEqual([
      { value: "Amy", label: "Amy", isMissing: false },
      { value: "Zoe", label: "Zoe", isMissing: false },
    ])
    expect(data.options.functionalPriority).toEqual([
      { value: "1", label: "1", isMissing: false },
      { value: "3", label: "3", isMissing: false },
      { value: JOB_FILTER_MISSING_VALUE, label: "Missing", isMissing: true },
    ])
    expect(data.options.corporatePriority).toEqual([
      { value: "IPO", label: "IPO", isMissing: false },
      { value: "Program", label: "Program", isMissing: false },
      { value: JOB_FILTER_MISSING_VALUE, label: "Missing", isMissing: true },
    ])
    expect(data.options.function).toEqual([
      { value: "Engineering", label: "Engineering", isMissing: false },
      { value: "Product", label: "Product", isMissing: false },
    ])
    expect(data.options.asset).toEqual([
      { value: "Core", label: "Core", isMissing: false },
    ])
    expect(findManyMock).toHaveBeenCalledTimes(10)
  })
})
