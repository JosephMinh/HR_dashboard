import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactElement } from "react"

import { CandidatesTable } from "@/app/candidates/candidates-table"

const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(""),
}))

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  )
}

function mockJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
    },
    json: async () => payload,
  } as unknown as Response
}

describe("CandidatesTable", () => {
  beforeEach(() => {
    pushMock.mockReset()
    replaceMock.mockReset()
    globalThis.fetch = vi.fn()
  })

  it("renders fetched candidates in a table", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      mockJsonResponse({
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
        page: 1,
        pageSize: 20,
        totalPages: 1,
      }),
    )

    renderWithQueryClient(<CandidatesTable />)

    expect(await screen.findByRole("link", { name: "Ava Chen" })).toBeInTheDocument()
    expect(screen.getByText("ava.chen@example.com")).toBeInTheDocument()
    expect(screen.getByText("Northstar Labs")).toBeInTheDocument()
    expect(screen.getByLabelText("Resume uploaded")).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
      const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? []
      expect(requestUrl).toBe("/api/candidates?sort=name&order=asc&page=1&pageSize=20&includeJobCount=true")
      expect(requestInit).toMatchObject({
        method: "GET",
      })
    })
  })

  it("shows empty state when the API returns no candidates", async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      mockJsonResponse({
        candidates: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      }),
    )

    renderWithQueryClient(<CandidatesTable />)

    expect(await screen.findByText("No candidates found")).toBeInTheDocument()
  })
})
