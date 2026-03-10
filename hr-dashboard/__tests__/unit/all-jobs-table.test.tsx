import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CandidatesTable } from "@/app/candidates/candidates-table"
import { AllJobsTable } from "@/components/dashboard/all-jobs-table"

const useJobsQueryMock = vi.fn()
const useCandidatesQueryMock = vi.fn()
const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(""),
}))

vi.mock("@/hooks/queries", () => ({
  useJobsQuery: (params: unknown) => useJobsQueryMock(params),
  useCandidatesQuery: (params: unknown) => useCandidatesQueryMock(params),
}))

describe("Retry callback regression coverage", () => {
  beforeEach(() => {
    useJobsQueryMock.mockReset()
    useCandidatesQueryMock.mockReset()
    pushMock.mockReset()
    replaceMock.mockReset()
  })

  it("invokes dashboard jobs refetch with no click-event argument", () => {
    const refetch = vi.fn()
    useJobsQueryMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("Failed to fetch jobs"),
      refetch,
    })

    render(<AllJobsTable userCanMutate={false} />)

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))

    expect(refetch).toHaveBeenCalledTimes(1)
    expect(refetch).toHaveBeenCalledWith()
  })

  it("invokes candidates refetch with no click-event argument", () => {
    const refetch = vi.fn()
    useCandidatesQueryMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error("Failed to fetch candidates"),
      refetch,
    })

    render(<CandidatesTable />)

    fireEvent.click(screen.getByRole("button", { name: "Try again" }))

    expect(refetch).toHaveBeenCalledTimes(1)
    expect(refetch).toHaveBeenCalledWith()
  })
})
