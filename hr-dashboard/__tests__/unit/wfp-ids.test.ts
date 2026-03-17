import { describe, expect, it } from "vitest"
import {
  wfpJobId,
  wfpCandidateId,
  wfpApplicationId,
  wfpProjectionId,
  wfpTradeoffId,
  WFP_NAMESPACE,
} from "@/lib/wfp-ids"

describe("WFP deterministic IDs", () => {
  it("produces valid UUID v5 format", () => {
    const id = wfpJobId("WFP Details - 2026:2")
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it("is deterministic — same input produces same output", () => {
    const id1 = wfpJobId("WFP Details - 2026:2")
    const id2 = wfpJobId("WFP Details - 2026:2")
    expect(id1).toBe(id2)
  })

  it("produces different IDs for different inputs", () => {
    const id1 = wfpJobId("WFP Details - 2026:2")
    const id2 = wfpJobId("WFP Details - 2026:3")
    expect(id1).not.toBe(id2)
  })

  it("produces different IDs for different entity types with same importKey", () => {
    const key = "WFP Details - 2026:50"
    const jobId = wfpJobId(key)
    const candidateId = wfpCandidateId(key)
    const applicationId = wfpApplicationId(key)
    expect(jobId).not.toBe(candidateId)
    expect(jobId).not.toBe(applicationId)
    expect(candidateId).not.toBe(applicationId)
  })

  it("produces different IDs for projection and tradeoff types", () => {
    const key = "2026 Approved Budget:10"
    const projId = wfpProjectionId(key)
    const tradeoffId = wfpTradeoffId(key)
    expect(projId).not.toBe(tradeoffId)
  })

  it("uses the correct namespace", () => {
    expect(WFP_NAMESPACE).toBe("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")
  })

  it("handles the 5273 collision scenario — different rows produce different IDs", () => {
    // tempJobId 5273 appears twice in Beyond 2026, but importKeys differ
    const id1 = wfpJobId("WFP Details - Beyond 2026:10")
    const id2 = wfpJobId("WFP Details - Beyond 2026:20")
    expect(id1).not.toBe(id2)
  })
})
