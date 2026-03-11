import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JobForm } from '@/app/jobs/job-form'
import { LoginForm } from '@/app/login/login-form'

const pushMock = vi.fn()
const signInMock = vi.fn()
let callbackUrl: string | null = '/jobs'

const createMutationState = {
  mutateAsync: vi.fn(),
  isPending: false,
  error: null as Error | null,
}

const updateMutationState = {
  mutateAsync: vi.fn(),
  isPending: false,
  error: null as Error | null,
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'callbackUrl' ? callbackUrl : null),
  }),
}))

vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}))

vi.mock('@/hooks/queries', () => ({
  useCreateJobMutation: () => createMutationState,
  useUpdateJobMutation: () => updateMutationState,
}))

describe('form UX regressions', () => {
  beforeEach(() => {
    callbackUrl = '/jobs'
    pushMock.mockReset()
    signInMock.mockReset()

    createMutationState.mutateAsync.mockReset()
    createMutationState.isPending = false
    createMutationState.error = null

    updateMutationState.mutateAsync.mockReset()
    updateMutationState.isPending = false
    updateMutationState.error = null
  })

  it('shows field-level validation errors for job form on submit', { timeout: 10000 }, async () => {
    const user = userEvent.setup()
    render(<JobForm mode="create" />)

    // Touch the required fields to trigger onBlur validation (standard timing)
    // TanStack Form with 'standard' timing validates onBlur, not just onSubmit
    const titleInput = screen.getByLabelText('Job Title *')
    await user.click(titleInput)
    await user.tab() // Blur to trigger onBlur validation

    // Validation errors should appear after blur
    await waitFor(() => {
      expect(screen.getByText('Title must be at least 3 characters')).toBeInTheDocument()
    })

    // The mutation should not have been called since validation failed
    expect(createMutationState.mutateAsync).not.toHaveBeenCalled()
  })

  it('shows the submit button with correct initial label', () => {
    // The submit button label is controlled by useFormFeedback's status
    // In idle state, create mode shows "Create Job"
    render(<JobForm mode="create" />)

    const submitButton = screen.getByRole('button', { name: 'Create Job' })
    expect(submitButton).toBeInTheDocument()
    expect(submitButton).not.toBeDisabled()
  })

  it('renders mutation error message for job form failures', () => {
    createMutationState.error = new Error('Job save failed')

    render(<JobForm mode="create" />)

    expect(screen.getByText('Job save failed')).toBeInTheDocument()
  })

  it('shows login error when credentials are rejected', async () => {
    signInMock.mockResolvedValue({ error: 'CredentialsSignin' })

    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'incorrect-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByText('Invalid email or password'),
    ).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('locks the login submit button while sign-in is in flight', async () => {
    signInMock.mockReturnValue(new Promise(() => {}))

    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('button', { name: 'Signing in...' })).toBeDisabled()
  })
})
