import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CandidatesTable } from "@/app/candidates/candidates-table"

const pushMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(""),
}))

describe("CandidatesTable", () => {
  beforeEach(() => {
    pushMock.mockReset()
    vi.stubGlobal("fetch", vi.fn())
  })

  it("renders fetched candidates in a table", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            id: "cand-1",
            firstName: "Ava",
            lastName: "Chen",
            email: "ava.chen@example.com",
            currentCompany: "Northstar Labs",
            location: "Seattle, WA",
            resumeKey: "resumes/ava.pdf",
            resumeName: "ava.pdf",
            updatedAt: "2026-03-09T08:00:00.000Z",
            jobCount: 2,
          },
        ],
        total: 1,
      }),
    } as Response)

    render(<CandidatesTable />)

    expect(await screen.findByRole("link", { name: "Ava Chen" })).toBeInTheDocument()
    expect(screen.getByText("ava.chen@example.com")).toBeInTheDocument()
    expect(screen.getByText("Northstar Labs")).toBeInTheDocument()
    expect(screen.getByLabelText("Resume uploaded")).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/candidates?sort=name&order=asc&includeJobCount=true",
      )
    })
  })

  it("shows empty state when the API returns no candidates", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [],
        total: 0,
      }),
    } as Response)

    render(<CandidatesTable />)

    expect(await screen.findByText("No candidates found")).toBeInTheDocument()
  })
})
