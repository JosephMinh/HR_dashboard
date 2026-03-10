import { render, screen, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import {
  LoadingTransition,
  DelayedLoading,
  LoadingOverlay,
} from "@/components/ui/loading-transition"

describe("LoadingTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("Basic rendering", () => {
    it("shows skeleton when isLoading is true", () => {
      render(
        <LoadingTransition
          isLoading={true}
          skeleton={<div data-testid="skeleton">Loading...</div>}
        >
          <div data-testid="content">Content</div>
        </LoadingTransition>
      )

      // aria-hidden is on the parent wrapper, not the test element itself
      const skeletonWrapper = screen.getByTestId("skeleton").parentElement
      const contentWrapper = screen.getByTestId("content").parentElement

      expect(skeletonWrapper).toHaveAttribute("aria-hidden", "false")
      expect(contentWrapper).toHaveAttribute("aria-hidden", "true")
    })

    it("shows content when isLoading is false", () => {
      render(
        <LoadingTransition
          isLoading={false}
          skeleton={<div data-testid="skeleton">Loading...</div>}
        >
          <div data-testid="content">Content</div>
        </LoadingTransition>
      )

      const skeletonWrapper = screen.getByTestId("skeleton").parentElement
      const contentWrapper = screen.getByTestId("content").parentElement

      expect(contentWrapper).toHaveAttribute("aria-hidden", "false")
      expect(skeletonWrapper).toHaveAttribute("aria-hidden", "true")
    })
  })

  describe("Minimum loading time", () => {
    it("respects minLoadingMs before hiding skeleton", async () => {
      const { rerender } = render(
        <LoadingTransition
          isLoading={true}
          minLoadingMs={500}
          skeleton={<div data-testid="skeleton">Loading...</div>}
        >
          <div data-testid="content">Content</div>
        </LoadingTransition>
      )

      // Loading finishes immediately
      rerender(
        <LoadingTransition
          isLoading={false}
          minLoadingMs={500}
          skeleton={<div data-testid="skeleton">Loading...</div>}
        >
          <div data-testid="content">Content</div>
        </LoadingTransition>
      )

      // Skeleton should still be visible (minimum time not elapsed)
      const skeletonWrapper = screen.getByTestId("skeleton").parentElement
      expect(skeletonWrapper).toHaveAttribute("aria-hidden", "false")

      // Advance past minimum time
      act(() => {
        vi.advanceTimersByTime(500)
      })

      // Now skeleton should be hidden
      expect(skeletonWrapper).toHaveAttribute("aria-hidden", "true")
    })

    it("hides skeleton immediately if minLoadingMs is 0", () => {
      const { rerender } = render(
        <LoadingTransition
          isLoading={true}
          minLoadingMs={0}
          skeleton={<div data-testid="skeleton">Loading...</div>}
        >
          <div data-testid="content">Content</div>
        </LoadingTransition>
      )

      rerender(
        <LoadingTransition
          isLoading={false}
          minLoadingMs={0}
          skeleton={<div data-testid="skeleton">Loading...</div>}
        >
          <div data-testid="content">Content</div>
        </LoadingTransition>
      )

      // Should hide immediately
      const skeletonWrapper = screen.getByTestId("skeleton").parentElement
      expect(skeletonWrapper).toHaveAttribute("aria-hidden", "true")
    })
  })

  describe("Accessibility", () => {
    it("sets correct aria-hidden on skeleton and content wrappers", () => {
      const { rerender } = render(
        <LoadingTransition
          isLoading={true}
          skeleton={<div data-testid="skeleton">Loading...</div>}
        >
          <div data-testid="content">Content</div>
        </LoadingTransition>
      )

      const skeletonWrapper = screen.getByTestId("skeleton").parentElement
      const contentWrapper = screen.getByTestId("content").parentElement

      // When loading: skeleton visible, content hidden
      expect(skeletonWrapper).toHaveAttribute("aria-hidden", "false")
      expect(contentWrapper).toHaveAttribute("aria-hidden", "true")

      rerender(
        <LoadingTransition
          isLoading={false}
          skeleton={<div data-testid="skeleton">Loading...</div>}
        >
          <div data-testid="content">Content</div>
        </LoadingTransition>
      )

      // When loaded: skeleton hidden, content visible
      expect(skeletonWrapper).toHaveAttribute("aria-hidden", "true")
      expect(contentWrapper).toHaveAttribute("aria-hidden", "false")
    })
  })
})

describe("DelayedLoading", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not show loading indicator immediately", () => {
    render(
      <DelayedLoading isLoading={true}>
        <div data-testid="loading">Loading...</div>
      </DelayedLoading>
    )

    expect(screen.queryByTestId("loading")).not.toBeInTheDocument()
  })

  it("shows loading indicator after delay", () => {
    render(
      <DelayedLoading isLoading={true} delayMs={200}>
        <div data-testid="loading">Loading...</div>
      </DelayedLoading>
    )

    expect(screen.queryByTestId("loading")).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.getByTestId("loading")).toBeInTheDocument()
  })

  it("does not show loading if isLoading becomes false before delay", () => {
    const { rerender } = render(
      <DelayedLoading isLoading={true} delayMs={200}>
        <div data-testid="loading">Loading...</div>
      </DelayedLoading>
    )

    // Advance part of the delay
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Loading finishes before delay completes
    rerender(
      <DelayedLoading isLoading={false} delayMs={200}>
        <div data-testid="loading">Loading...</div>
      </DelayedLoading>
    )

    // Advance past original delay
    act(() => {
      vi.advanceTimersByTime(200)
    })

    // Should never have shown
    expect(screen.queryByTestId("loading")).not.toBeInTheDocument()
  })

  it("hides loading immediately when isLoading becomes false", () => {
    const { rerender } = render(
      <DelayedLoading isLoading={true} delayMs={200}>
        <div data-testid="loading">Loading...</div>
      </DelayedLoading>
    )

    // Let it appear
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(screen.getByTestId("loading")).toBeInTheDocument()

    // Loading finishes
    rerender(
      <DelayedLoading isLoading={false} delayMs={200}>
        <div data-testid="loading">Loading...</div>
      </DelayedLoading>
    )

    // Should hide immediately
    expect(screen.queryByTestId("loading")).not.toBeInTheDocument()
  })
})

describe("LoadingOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not show overlay immediately", () => {
    render(<LoadingOverlay isLoading={true} />)

    expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument()
  })

  it("shows overlay after delay", () => {
    render(<LoadingOverlay isLoading={true} delayMs={150} />)

    expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(screen.getByLabelText("Loading")).toBeInTheDocument()
  })

  it("hides overlay when isLoading becomes false", () => {
    const { rerender } = render(<LoadingOverlay isLoading={true} delayMs={150} />)

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.getByLabelText("Loading")).toBeInTheDocument()

    rerender(<LoadingOverlay isLoading={false} delayMs={150} />)

    expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument()
  })

  it("has proper accessibility label", () => {
    render(<LoadingOverlay isLoading={true} delayMs={0} />)

    act(() => {
      vi.advanceTimersByTime(0)
    })

    const overlay = screen.getByLabelText("Loading")
    expect(overlay).toBeInTheDocument()
  })
})
