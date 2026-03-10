import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AddCandidateDialog } from "@/app/jobs/[jobId]/add-candidate-dialog"

// Mock TanStack Query
const useQueryMock = vi.fn()
const useCreateApplicationMutationMock = vi.fn()

vi.mock("@tanstack/react-query", () => ({
  useQuery: (params: unknown) => useQueryMock(params),
}))

vi.mock("@/hooks/queries", () => ({
  useCreateApplicationMutation: () => useCreateApplicationMutationMock(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}))

const mockCandidates = [
  { id: "c1", firstName: "Alice", lastName: "Johnson", email: "alice@example.com", currentCompany: "Acme Inc" },
  { id: "c2", firstName: "Bob", lastName: "Smith", email: "bob@example.com", currentCompany: "Tech Corp" },
  { id: "c3", firstName: "Charlie", lastName: "Brown", email: "charlie@example.com", currentCompany: null },
]

describe("AddCandidateDialog", () => {
  beforeEach(() => {
    useQueryMock.mockReset()
    useCreateApplicationMutationMock.mockReset()

    useQueryMock.mockReturnValue({
      data: { candidates: mockCandidates },
      isLoading: false,
      error: null,
    })

    useCreateApplicationMutationMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: "app1" }),
      isPending: false,
    })
  })

  describe("Preview + Confirm Pattern", () => {
    it("does not attach candidate immediately when clicking on result", async () => {
      const user = userEvent.setup()

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={[]} />)

      // Open dialog
      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      // Search for candidates
      const searchInput = screen.getByLabelText(/search candidates/i)
      await user.type(searchInput, "alice")

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      })

      // Click on candidate - should select, not attach
      const mutation = useCreateApplicationMutationMock()
      await user.click(screen.getByText("Alice Johnson"))

      // Mutation should NOT be called yet
      expect(mutation.mutateAsync).not.toHaveBeenCalled()

      // Preview should be visible
      expect(screen.getByText(/will be added to the pipeline/i)).toBeInTheDocument()
    })

    it("shows candidate preview after selection", async () => {
      const user = userEvent.setup()

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={[]} />)

      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      const searchInput = screen.getByLabelText(/search candidates/i)
      await user.type(searchInput, "alice")

      await waitFor(() => {
        expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      })

      await user.click(screen.getByText("Alice Johnson"))

      // Preview should show candidate details
      expect(screen.getByText("alice@example.com")).toBeInTheDocument()
      expect(screen.getByText("Acme Inc")).toBeInTheDocument()
      // Preview mentions the pipeline stage
      expect(screen.getByText(/will be added to the pipeline/i)).toBeInTheDocument()
    })

    it("calls mutation only when Add to Job button is clicked", async () => {
      const user = userEvent.setup()
      const mutateAsync = vi.fn().mockResolvedValue({ id: "app1" })
      useCreateApplicationMutationMock.mockReturnValue({
        mutateAsync,
        isPending: false,
      })

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={[]} />)

      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      const searchInput = screen.getByLabelText(/search candidates/i)
      await user.type(searchInput, "alice")

      await waitFor(() => {
        expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      })

      await user.click(screen.getByText("Alice Johnson"))

      // Click the confirm button
      await user.click(screen.getByRole("button", { name: /add to job/i }))

      expect(mutateAsync).toHaveBeenCalledWith({
        jobId: "job1",
        candidateId: "c1",
      })
    })

    it("allows clearing selection to choose a different candidate", async () => {
      const user = userEvent.setup()

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={[]} />)

      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      const searchInput = screen.getByLabelText(/search candidates/i)
      await user.type(searchInput, "al")

      await waitFor(() => {
        expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      })

      // Select first candidate
      await user.click(screen.getByText("Alice Johnson"))
      expect(screen.getByText("alice@example.com")).toBeInTheDocument()

      // Clear selection
      const clearButton = screen.getByRole("button", { name: /clear selection/i })
      await user.click(clearButton)

      // Preview should be gone
      expect(screen.queryByText(/will be added to the pipeline/i)).not.toBeInTheDocument()
    })
  })

  describe("Keyboard Accessibility", () => {
    it("supports keyboard navigation in candidate list", async () => {
      const user = userEvent.setup()

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={[]} />)

      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      const searchInput = screen.getByLabelText(/search candidates/i)
      await user.type(searchInput, "al")

      await waitFor(() => {
        expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      })

      // Tab to first result and press Enter
      await user.tab()
      await user.keyboard("{Enter}")

      // Should select the candidate
      expect(screen.getByText(/will be added to the pipeline/i)).toBeInTheDocument()
    })

    it("has proper aria-pressed state on selection buttons", async () => {
      const user = userEvent.setup()

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={[]} />)

      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      const searchInput = screen.getByLabelText(/search candidates/i)
      await user.type(searchInput, "al")

      await waitFor(() => {
        expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      })

      // Before selection - not pressed
      const aliceButton = screen.getByRole("button", { name: /select alice johnson/i })
      expect(aliceButton).toHaveAttribute("aria-pressed", "false")

      // Select
      await user.click(aliceButton)

      // After selection - pressed
      expect(aliceButton).toHaveAttribute("aria-pressed", "true")
    })
  })

  describe("Already Attached Candidates", () => {
    it("shows Already added badge for attached candidates", async () => {
      const user = userEvent.setup()

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={["c1"]} />)

      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      const searchInput = screen.getByLabelText(/search candidates/i)
      await user.type(searchInput, "al")

      await waitFor(() => {
        expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      })

      // Alice should show as already added
      expect(screen.getByText("Added")).toBeInTheDocument()
    })

    it("disables selection for already attached candidates", async () => {
      const user = userEvent.setup()

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={["c1"]} />)

      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      const searchInput = screen.getByLabelText(/search candidates/i)
      await user.type(searchInput, "al")

      await waitFor(() => {
        expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      })

      // Try to click on attached candidate
      const aliceButton = screen.getByRole("button", { name: /alice johnson.*already added/i })
      expect(aliceButton).toBeDisabled()
    })
  })

  describe("Create New Candidate Flow", () => {
    it("provides option to create new candidate", async () => {
      const user = userEvent.setup()

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={[]} />)

      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      expect(screen.getByRole("button", { name: /create new candidate/i })).toBeInTheDocument()
    })
  })

  describe("Error Handling", () => {
    it("displays error with dismiss button that has proper accessibility", async () => {
      const user = userEvent.setup()
      const mutateAsync = vi.fn().mockRejectedValue(new Error("Failed to add"))
      useCreateApplicationMutationMock.mockReturnValue({
        mutateAsync,
        isPending: false,
      })

      render(<AddCandidateDialog jobId="job1" existingCandidateIds={[]} />)

      await user.click(screen.getByRole("button", { name: /add candidate/i }))

      const searchInput = screen.getByLabelText(/search candidates/i)
      await user.type(searchInput, "alice")

      await waitFor(() => {
        expect(screen.getByText("Alice Johnson")).toBeInTheDocument()
      })

      await user.click(screen.getByText("Alice Johnson"))
      await user.click(screen.getByRole("button", { name: /add to job/i }))

      await waitFor(() => {
        expect(screen.getByText(/failed to add/i)).toBeInTheDocument()
      })

      // Dismiss button should have aria-label
      const dismissButton = screen.getByRole("button", { name: /dismiss error/i })
      expect(dismissButton).toBeInTheDocument()

      await user.click(dismissButton)
      expect(screen.queryByText(/failed to add/i)).not.toBeInTheDocument()
    })
  })
})
