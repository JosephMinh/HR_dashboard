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
      corporatePriority: "Horizon 2",
      function: "Talent",
      level: "L6",
      horizon: "2027",
      asset: "Growth",
    })

    await factories.createJob({
      title: "Operations Analyst",
      department: "Operations",
      employeeType: "Full-Time",
      location: null,
      recruiterOwner: "",
      functionalPriority: null,
      corporatePriority: "",
      function: "Operations",
      level: "L3",
      horizon: "2028",
      asset: null,
    })

    const {
      GET,
      JOB_FILTER_MISSING_VALUE,
    } = await import("@/app/api/jobs/filter-options/route")
    const response = await GET()

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.missingValue).toBe(JOB_FILTER_MISSING_VALUE)
    expect(data.options.department).toEqual([
      { value: "Design", label: "Design", isMissing: false },
      { value: "Engineering", label: "Engineering", isMissing: false },
      { value: "Operations", label: "Operations", isMissing: false },
    ])
    expect(data.options.employeeType).toEqual([
      { value: "Contractor", label: "Contractor", isMissing: false },
      { value: "Full-Time", label: "Full-Time", isMissing: false },
    ])
    expect(data.options.location).toEqual([
      { value: "Remote", label: "Remote", isMissing: false },
      { value: JOB_FILTER_MISSING_VALUE, label: "Missing", isMissing: true },
    ])
    expect(data.options.recruiterOwner).toEqual([
      { value: "Alice", label: "Alice", isMissing: false },
      { value: "Bob", label: "Bob", isMissing: false },
      { value: JOB_FILTER_MISSING_VALUE, label: "Missing", isMissing: true },
    ])
    expect(data.options.functionalPriority).toEqual([
      { value: "1", label: "1", isMissing: false },
      { value: "3", label: "3", isMissing: false },
      { value: JOB_FILTER_MISSING_VALUE, label: "Missing", isMissing: true },
    ])
    expect(data.options.corporatePriority).toEqual([
      { value: "Horizon 2", label: "Horizon 2", isMissing: false },
      { value: "IPO", label: "IPO", isMissing: false },
      { value: "Program", label: "Program", isMissing: false },
      { value: JOB_FILTER_MISSING_VALUE, label: "Missing", isMissing: true },
    ])
    expect(data.options.function).toEqual([
      { value: "Design", label: "Design", isMissing: false },
      { value: "Engineering", label: "Engineering", isMissing: false },
      { value: "Operations", label: "Operations", isMissing: false },
      { value: "Talent", label: "Talent", isMissing: false },
    ])
    expect(data.options.level).toEqual([
      { value: "L3", label: "L3", isMissing: false },
      { value: "L4", label: "L4", isMissing: false },
      { value: "L5", label: "L5", isMissing: false },
      { value: "L6", label: "L6", isMissing: false },
    ])
    expect(data.options.horizon).toEqual([
      { value: "2026", label: "2026", isMissing: false },
      { value: "2027", label: "2027", isMissing: false },
      { value: "2028", label: "2028", isMissing: false },
      { value: "Beyond 2026", label: "Beyond 2026", isMissing: false },
    ])
    expect(data.options.asset).toEqual([
      { value: "Core", label: "Core", isMissing: false },
      { value: "Growth", label: "Growth", isMissing: false },
    ])
  })
})
