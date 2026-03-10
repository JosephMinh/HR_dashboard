/**
 * Premium UX Interaction Tests
 *
 * Tests for the upgraded UX patterns introduced in the premium productization:
 * - StateSurface variations and actions
 * - InlineFeedback accessibility and interactions
 * - ConfirmDialog variants and loading states
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { StateSurface, EmptyStateSurface, ErrorStateSurface } from '@/components/ui/state-surface'
import { InlineFeedback, InlineMessage, OperationStatus } from '@/components/ui/inline-feedback'
import { ConfirmDialog, DeleteConfirmDialog } from '@/components/ui/confirm-dialog'

// Mock next/navigation
const pushMock = vi.fn()
const backMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    back: backMock,
  }),
}))

describe('StateSurface', () => {
  describe('empty states', () => {
    it('renders basic empty state with create action', async () => {
      const onCreate = vi.fn()
      render(
        <StateSurface
          type="empty"
          resource="jobs"
          onCreate={onCreate}
          createLabel="Create Job"
        />
      )

      expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create job/i })).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: /create job/i }))
      expect(onCreate).toHaveBeenCalledTimes(1)
    })

    it('renders empty-search state with search query', () => {
      render(
        <StateSurface
          type="empty-search"
          resource="candidates"
          searchQuery="software engineer"
        />
      )

      expect(screen.getByText(/no results for/i)).toBeInTheDocument()
    })

    it('renders empty-filtered state with clear action', async () => {
      const onClearFilters = vi.fn()
      render(
        <StateSurface
          type="empty-filtered"
          resource="jobs"
          onClearFilters={onClearFilters}
        />
      )

      const clearButton = screen.getByRole('button', { name: /clear/i })
      await userEvent.click(clearButton)
      expect(onClearFilters).toHaveBeenCalledTimes(1)
    })
  })

  describe('error states', () => {
    it('renders error-network state with retry action', async () => {
      const onRetry = vi.fn()
      render(
        <StateSurface
          type="error-network"
          onRetry={onRetry}
        />
      )

      expect(screen.getByText(/connection problem/i)).toBeInTheDocument()

      const retryButton = screen.getByRole('button', { name: /try again/i })
      await userEvent.click(retryButton)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders error-server with technical details', () => {
      render(
        <StateSurface
          type="error-server"
          errorDetails={{
            digest: 'abc123',
            message: 'Internal server error',
          }}
        />
      )

      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
      expect(screen.getByText(/abc123/i)).toBeInTheDocument()
    })

    it('renders not-found with navigate-home action', () => {
      render(
        <StateSurface
          type="not-found"
          resource="job"
        />
      )

      expect(screen.getByText(/page not found/i)).toBeInTheDocument()

      const homeLink = screen.getByRole('link', { name: /dashboard/i })
      expect(homeLink).toHaveAttribute('href', '/')
    })
  })

  describe('auth states', () => {
    it('renders unauthenticated with login action', () => {
      render(<StateSurface type="unauthenticated" />)

      // Title: "Sign in required"
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/sign in required/i)
      const loginLink = screen.getByRole('link', { name: /sign in/i })
      expect(loginLink).toHaveAttribute('href', '/login')
    })

    it('renders unauthorized state', () => {
      render(<StateSurface type="unauthorized" />)

      expect(screen.getByText(/access denied/i)).toBeInTheDocument()
    })
  })

  describe('compact mode', () => {
    it('renders compact variant with smaller spacing', () => {
      render(
        <StateSurface
          type="empty"
          resource="items"
          compact
        />
      )

      // Compact mode should have py-6 instead of py-12
      const container = screen.getByText(/nothing here yet/i).closest('div')
      expect(container?.className).toContain('py-6')
    })
  })
})

describe('EmptyStateSurface convenience component', () => {
  it('selects correct type based on hasSearch and searchQuery', () => {
    render(
      <EmptyStateSurface
        resource="jobs"
        hasSearch
        searchQuery="test query"
      />
    )

    // Title for empty-search: "No results for 'test query'"
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/no results for/i)
  })

  it('selects empty-filtered when hasFilters is true', () => {
    render(
      <EmptyStateSurface
        resource="candidates"
        hasFilters
      />
    )

    // Title for empty-filtered: "No matches found"
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/no matches found/i)
  })
})

describe('ErrorStateSurface convenience component', () => {
  it('maps HTTP 401 to unauthenticated state', () => {
    const error = Object.assign(new Error('Unauthorized'), { status: 401 })
    render(<ErrorStateSurface error={error} />)

    // Title: "Sign in required"
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/sign in required/i)
    // Primary action is login link
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  it('maps HTTP 404 to not-found state', () => {
    const error = Object.assign(new Error('Not found'), { status: 404 })
    render(<ErrorStateSurface error={error} />)

    // Title: "Page not found"
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/page not found/i)
  })

  it('maps HTTP 500 to server error state', () => {
    const error = Object.assign(new Error('Server error'), { status: 500 })
    render(<ErrorStateSurface error={error} />)

    // Title: "Something went wrong"
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/something went wrong/i)
  })

  it('maps network errors to network error state', () => {
    const error = new Error('Failed to fetch')
    render(<ErrorStateSurface error={error} />)

    // Title: "Connection problem"
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/connection problem/i)
    // Secondary action for error-network is navigate-home
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/')
  })
})

describe('InlineFeedback', () => {
  describe('accessibility', () => {
    it('renders error variant with role="alert" and aria-live="assertive"', () => {
      render(
        <InlineFeedback
          variant="error"
          title="Error"
          message="Something went wrong"
        />
      )

      const feedback = screen.getByRole('alert')
      expect(feedback).toHaveAttribute('aria-live', 'assertive')
    })

    it('renders success variant with role="status" and aria-live="polite"', () => {
      render(
        <InlineFeedback
          variant="success"
          title="Success"
          message="Operation completed"
        />
      )

      const feedback = screen.getByRole('status')
      expect(feedback).toHaveAttribute('aria-live', 'polite')
    })

    it('has accessible dismiss button in corner when no retry', () => {
      render(
        <InlineFeedback
          variant="info"
          message="Info message"
          onDismiss={vi.fn()}
        />
      )

      // Corner dismiss button has aria-label
      const dismissButton = screen.getByRole('button', { name: /dismiss/i })
      expect(dismissButton).toBeInTheDocument()
      expect(dismissButton).toHaveAttribute('aria-label', 'Dismiss')
    })

    it('has inline dismiss button when retry also exists', () => {
      render(
        <InlineFeedback
          variant="error"
          message="Error message"
          onRetry={vi.fn()}
          onDismiss={vi.fn()}
        />
      )

      // Both retry and inline dismiss should exist
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
      // Inline dismiss button has text, not aria-label
      expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    })
  })

  describe('interactions', () => {
    it('calls onDismiss when corner dismiss button clicked', async () => {
      const onDismiss = vi.fn()
      render(
        <InlineFeedback
          variant="warning"
          message="Warning message"
          onDismiss={onDismiss}
        />
      )

      // Corner button appears when onDismiss is provided without onRetry
      await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('calls onDismiss when inline dismiss button clicked (with retry)', async () => {
      const onDismiss = vi.fn()
      render(
        <InlineFeedback
          variant="error"
          message="Error message"
          onRetry={vi.fn()}
          onDismiss={onDismiss}
        />
      )

      // Inline dismiss appears alongside retry button
      await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('calls onRetry when retry button clicked', async () => {
      const onRetry = vi.fn()
      render(
        <InlineFeedback
          variant="error"
          message="Error message"
          onRetry={onRetry}
        />
      )

      await userEvent.click(screen.getByRole('button', { name: /try again/i }))
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('shows custom retry label', () => {
      render(
        <InlineFeedback
          variant="error"
          message="Error"
          onRetry={vi.fn()}
          retryLabel="Reload data"
        />
      )

      expect(screen.getByRole('button', { name: /reload data/i })).toBeInTheDocument()
    })
  })

  describe('variants', () => {
    it.each([
      ['success', 'CheckCircle'],
      ['error', 'XCircle'],
      ['warning', 'AlertTriangle'],
      ['info', 'Info'],
    ])('renders %s variant with correct styling', (variant) => {
      render(
        <InlineFeedback
          variant={variant as 'success' | 'error' | 'warning' | 'info'}
          message={`${variant} message`}
        />
      )

      expect(screen.getByText(`${variant} message`)).toBeInTheDocument()
    })

    it('renders loading variant with spinner', () => {
      render(
        <InlineFeedback
          variant="loading"
          message="Loading..."
        />
      )

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })
})

describe('InlineMessage', () => {
  it('renders with correct role for error variant', () => {
    render(<InlineMessage variant="error">Error text</InlineMessage>)

    expect(screen.getByRole('alert')).toHaveTextContent('Error text')
  })

  it('renders with correct role for non-error variants', () => {
    render(<InlineMessage variant="success">Success text</InlineMessage>)

    expect(screen.getByRole('status')).toHaveTextContent('Success text')
  })
})

describe('OperationStatus', () => {
  it('returns null for idle status', () => {
    const { container } = render(
      <OperationStatus
        status="idle"
        messages={{ loading: 'Loading', success: 'Done', error: 'Failed' }}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('shows loading message with spinner', () => {
    render(
      <OperationStatus
        status="loading"
        messages={{ loading: 'Saving changes...' }}
      />
    )

    expect(screen.getByText('Saving changes...')).toBeInTheDocument()
  })

  it('shows success message', () => {
    render(
      <OperationStatus
        status="success"
        messages={{ success: 'Changes saved!' }}
      />
    )

    expect(screen.getByText('Changes saved!')).toBeInTheDocument()
  })

  it('shows error message with alert role', () => {
    render(
      <OperationStatus
        status="error"
        messages={{ error: 'Failed to save' }}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Failed to save')
  })
})

describe('ConfirmDialog', () => {
  it('renders with title and message', () => {
    render(
      <ConfirmDialog
        open={true}
        title="Confirm Action"
        message="Are you sure you want to proceed?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Confirm Action')).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button clicked', async () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Message"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm when confirm button clicked', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Message"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows loading state while confirming async action', async () => {
    const onConfirm: () => Promise<void> = vi.fn(
      () => new Promise<void>(() => {})
    ) // Never resolves
    render(
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Message"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled()
    })
  })

  it('disables cancel button during loading', async () => {
    const onConfirm: () => Promise<void> = vi.fn(
      () => new Promise<void>(() => {})
    )
    render(
      <ConfirmDialog
        open={true}
        title="Confirm"
        message="Message"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
    })
  })

  describe('variants', () => {
    it('renders destructive variant with appropriate styling', () => {
      render(
        <ConfirmDialog
          open={true}
          title="Delete"
          message="This cannot be undone"
          variant="destructive"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      // Destructive variant should exist
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('renders warning variant', () => {
      render(
        <ConfirmDialog
          open={true}
          title="Warning"
          message="Proceed with caution"
          variant="warning"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      expect(screen.getByText('Warning')).toBeInTheDocument()
    })
  })
})

describe('DeleteConfirmDialog', () => {
  it('renders with entity name and type', () => {
    render(
      <DeleteConfirmDialog
        open={true}
        entityName="Software Engineer"
        entityType="job"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText(/delete job/i)).toBeInTheDocument()
    expect(screen.getByText(/software engineer/i)).toBeInTheDocument()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('uses "item" as default entity type', () => {
    render(
      <DeleteConfirmDialog
        open={true}
        entityName="Test Item"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByText(/delete item/i)).toBeInTheDocument()
  })

  it('has "Keep it" as cancel label', () => {
    render(
      <DeleteConfirmDialog
        open={true}
        entityName="Test"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /keep it/i })).toBeInTheDocument()
  })
})
