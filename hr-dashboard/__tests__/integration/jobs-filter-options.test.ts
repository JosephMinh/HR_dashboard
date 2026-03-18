import { beforeEach, describe, expect, it } from "vitest"

import {
  createTestFactories,
  setupIntegrationTests,
} from "@/test/setup-integration"
import { setupTestAuth } from "@/test/test-auth"

const testAuth = setupTestAuth()

describe("Integration: GET /api/jobs/filter-options", () => {
  setupIntegrationTests({ logger: true })
  const factories = createTestFactories()

  beforeEach(async () => {
    await testAuth.loginAsNewUser({ role: "RECRUITER" })
  })

  it("returns persisted distinct values for all filterable fields with missing collapsed", async () => {
    await factories.createJob({
      title: "Platform Engineer",
      department: "Engineering",
      employeeType: "Full-Time",
      location: "Remote",
      recruiterOwner: "Alice",
      functionalPriority: "1",
      corporatePriority: "Program",
      function: "Engineering",
      level: "L5",
      horizon: "2026",
      asset: "Core",
    })

    await factories.createJob({
      title: "Product Designer",
      department: "Design",
      employeeType: "Contractor",
      location: null,
      recruiterOwner: "Bob",
      functionalPriority: null,
      corporatePriority: "IPO",
      function: "Design",
      level: "L4",
      horizon: "Beyond 2026",
      asset: null,
    })

    await factories.createJob({
      title: "Growth Recruiter",
      department: "Engineering",
      employeeType: "Full-Time",
      location: "   ",
      recruiterOwner: " ",
      functionalPriority: "3",
      corporatePriority: "",
      function: "Talent",
      level: "L6",
      horizon: "2027",
      asset: "Growth",
    })

    const {
      GET,
      JOB_FILTER_MISSING_LABEL,
    } = await import("@/app/api/jobs/filter-options/route")
    const response = await GET()

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.meta).toEqual({
      missing: {
        label: JOB_FILTER_MISSING_LABEL,
        placement: "last",
      },
    })
    expect(data.filters.department).toEqual([
      { value: "Design", label: "Design", isMissing: false },
      { value: "Engineering", label: "Engineering", isMissing: false },
    ])
    expect(data.filters.location).toEqual([
      { value: "Remote", label: "Remote", isMissing: false },
      { value: null, label: JOB_FILTER_MISSING_LABEL, isMissing: true },
    ])
    expect(data.filters.recruiterOwner).toEqual([
      { value: "Alice", label: "Alice", isMissing: false },
      { value: "Bob", label: "Bob", isMissing: false },
      { value: null, label: JOB_FILTER_MISSING_LABEL, isMissing: true },
    ])
    expect(data.filters.functionalPriority).toEqual([
      { value: "1", label: "1", isMissing: false },
      { value: "3", label: "3", isMissing: false },
      { value: null, label: JOB_FILTER_MISSING_LABEL, isMissing: true },
    ])
    expect(data.filters.corporatePriority).toEqual([
      { value: "IPO", label: "IPO", isMissing: false },
      { value: "Program", label: "Program", isMissing: false },
      { value: null, label: JOB_FILTER_MISSING_LABEL, isMissing: true },
    ])
    expect(data.filters.function).toEqual([
      { value: "Design", label: "Design", isMissing: false },
      { value: "Engineering", label: "Engineering", isMissing: false },
      { value: "Talent", label: "Talent", isMissing: false },
    ])
    expect(data.filters.level).toEqual([
      { value: "L4", label: "L4", isMissing: false },
      { value: "L5", label: "L5", isMissing: false },
      { value: "L6", label: "L6", isMissing: false },
    ])
    expect(data.filters.horizon).toEqual([
      { value: "2026", label: "2026", isMissing: false },
      { value: "2027", label: "2027", isMissing: false },
      { value: "Beyond 2026", label: "Beyond 2026", isMissing: false },
    ])
    expect(data.filters.asset).toEqual([
      { value: "Core", label: "Core", isMissing: false },
      { value: "Growth", label: "Growth", isMissing: false },
      { value: null, label: JOB_FILTER_MISSING_LABEL, isMissing: true },
    ])
  })
})
