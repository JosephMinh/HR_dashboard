import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const findJobMock = vi.fn()
const updateJobMock = vi.fn()
const generateUploadUrlMock = vi.fn()
const isValidResumeTypeMock = vi.fn()
const generateObjectKeyMock = vi.fn()
const getContentTypeMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    job: {
      findUnique: findJobMock,
      update: updateJobMock,
    },
  },
}))

vi.mock('@/lib/storage', () => ({
  generateObjectKey: generateObjectKeyMock,
  generateUploadUrl: generateUploadUrlMock,
  getContentType: getContentTypeMock,
  isValidResumeType: isValidResumeTypeMock,
  MAX_RESUME_SIZE_BYTES: 10 * 1024 * 1024,
}))

describe('API auth enforcement', () => {
  beforeEach(() => {
    authMock.mockReset()
    findJobMock.mockReset()
    updateJobMock.mockReset()
    generateUploadUrlMock.mockReset()
    isValidResumeTypeMock.mockReset()
    generateObjectKeyMock.mockReset()
    getContentTypeMock.mockReset()

    isValidResumeTypeMock.mockReturnValue(true)
    generateObjectKeyMock.mockReturnValue('resumes/test-key.pdf')
    getContentTypeMock.mockReturnValue('application/pdf')
    generateUploadUrlMock.mockResolvedValue('https://example.com/upload')
  })

  it('blocks VIEWER from PATCH /api/jobs/[id]', async () => {
    authMock.mockResolvedValue({
      user: { id: 'viewer-1', role: 'VIEWER' },
    })

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/jobs/job-1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated role check' }),
      }) as never,
      { params: Promise.resolve({ id: 'job-1' }) },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Only admins and recruiters can create, update, or delete recruiting data.',
    })
    expect(findJobMock).not.toHaveBeenCalled()
  })

  it('allows RECRUITER through role gate for PATCH /api/jobs/[id]', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })
    const now = new Date('2026-03-09T09:00:00.000Z')
    findJobMock.mockResolvedValue({
      id: 'job-1',
      title: 'Old title',
      department: 'Engineering',
      description: 'desc',
      location: null,
      hiringManager: null,
      recruiterOwner: null,
      status: 'OPEN',
      priority: 'MEDIUM',
      pipelineHealth: 'ON_TRACK',
      isCritical: false,
      openedAt: now,
      targetFillDate: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    updateJobMock.mockResolvedValue({
      id: 'job-1',
      title: 'Updated role check',
      department: 'Engineering',
      description: 'desc',
      location: null,
      hiringManager: null,
      recruiterOwner: null,
      status: 'OPEN',
      priority: 'MEDIUM',
      pipelineHealth: 'ON_TRACK',
      isCritical: false,
      openedAt: now,
      targetFillDate: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/jobs/job-1', {
        method: 'PATCH',
        body: JSON.stringify({ title: 'Updated role check' }),
      }) as never,
      { params: Promise.resolve({ id: 'job-1' }) },
    )

    expect(response.status).toBe(200)
    expect(findJobMock).toHaveBeenCalled()
    expect(updateJobMock).toHaveBeenCalled()
  })

  it('blocks VIEWER from POST /api/upload/resume', async () => {
    authMock.mockResolvedValue({
      user: { id: 'viewer-1', role: 'VIEWER' },
    })

    const { POST } = await import('@/app/api/upload/resume/route')
    const response = await POST(
      new Request('http://localhost/api/upload/resume', {
        method: 'POST',
        body: JSON.stringify({ filename: 'resume.pdf' }),
      }) as never,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Only admins and recruiters can create, update, or delete recruiting data.',
    })
    expect(generateUploadUrlMock).not.toHaveBeenCalled()
  })

  it('allows RECRUITER to request upload URL', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })

    const { POST } = await import('@/app/api/upload/resume/route')
    const response = await POST(
      new Request('http://localhost/api/upload/resume', {
        method: 'POST',
        body: JSON.stringify({ filename: 'resume.pdf' }),
      }) as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      key: 'resumes/test-key.pdf',
      uploadUrl: 'https://example.com/upload',
      contentType: 'application/pdf',
      maxSizeBytes: 10 * 1024 * 1024,
    })
  })
})
