import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const findJobMock = vi.fn()
const findCandidateByResumeKeyMock = vi.fn()
const updateJobMock = vi.fn()
const getClientIpMock = vi.fn()
const logAuditUpdateMock = vi.fn()
const generateUploadUrlMock = vi.fn()
const generateDownloadUrlMock = vi.fn()
const isValidResumeTypeMock = vi.fn()
const isValidResumeKeyMock = vi.fn()
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
    candidate: {
      findFirst: findCandidateByResumeKeyMock,
    },
  },
}))

vi.mock('@/lib/audit', () => ({
  getClientIp: getClientIpMock,
  logAuditUpdate: logAuditUpdateMock,
}))

vi.mock('@/lib/storage', () => ({
  generateObjectKey: generateObjectKeyMock,
  generateUploadUrl: generateUploadUrlMock,
  generateDownloadUrl: generateDownloadUrlMock,
  getContentType: getContentTypeMock,
  isValidResumeType: isValidResumeTypeMock,
  isValidResumeKey: isValidResumeKeyMock,
  MAX_RESUME_SIZE_BYTES: 10 * 1024 * 1024,
}))

describe('API auth enforcement', () => {
  beforeEach(() => {
    authMock.mockReset()
    findJobMock.mockReset()
    findCandidateByResumeKeyMock.mockReset()
    updateJobMock.mockReset()
    getClientIpMock.mockReset()
    logAuditUpdateMock.mockReset()
    generateUploadUrlMock.mockReset()
    generateDownloadUrlMock.mockReset()
    isValidResumeTypeMock.mockReset()
    isValidResumeKeyMock.mockReset()
    generateObjectKeyMock.mockReset()
    getContentTypeMock.mockReset()

    isValidResumeTypeMock.mockReturnValue(true)
    isValidResumeKeyMock.mockImplementation((key: string) =>
      /^resumes\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|doc|docx|txt|rtf)$/i.test(key),
    )
    generateObjectKeyMock.mockReturnValue('resumes/test-key.pdf')
    getContentTypeMock.mockReturnValue('application/pdf')
    generateUploadUrlMock.mockResolvedValue('https://example.com/upload')
    generateDownloadUrlMock.mockResolvedValue('https://example.com/download')
    findCandidateByResumeKeyMock.mockResolvedValue({ id: 'candidate-1' })
    getClientIpMock.mockReturnValue('127.0.0.1')
    logAuditUpdateMock.mockResolvedValue(undefined)
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

  it('rejects reopening a job without pipelineHealth', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-2', role: 'RECRUITER' },
    })

    const now = new Date('2026-03-09T09:00:00.000Z')
    findJobMock.mockResolvedValue({
      id: 'job-2',
      title: 'Ops Manager',
      department: 'Operations',
      description: 'desc',
      location: null,
      hiringManager: null,
      recruiterOwner: null,
      status: 'CLOSED',
      priority: 'MEDIUM',
      pipelineHealth: null,
      isCritical: false,
      openedAt: now,
      targetFillDate: null,
      closedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/jobs/job-2', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'OPEN' }),
      }) as never,
      { params: Promise.resolve({ id: 'job-2' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Pipeline health is required for open jobs',
    })
    expect(updateJobMock).not.toHaveBeenCalled()
  })

  it('clears closedAt when reopening a closed job', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-3', role: 'RECRUITER' },
    })

    const now = new Date('2026-03-09T09:00:00.000Z')
    findJobMock.mockResolvedValue({
      id: 'job-3',
      title: 'Data Analyst',
      department: 'Analytics',
      description: 'desc',
      location: null,
      hiringManager: null,
      recruiterOwner: null,
      status: 'CLOSED',
      priority: 'MEDIUM',
      pipelineHealth: null,
      isCritical: false,
      openedAt: now,
      targetFillDate: null,
      closedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    updateJobMock.mockResolvedValue({
      id: 'job-3',
      title: 'Data Analyst',
      department: 'Analytics',
      description: 'desc',
      location: null,
      hiringManager: null,
      recruiterOwner: null,
      status: 'ON_HOLD',
      priority: 'MEDIUM',
      pipelineHealth: null,
      isCritical: false,
      openedAt: now,
      targetFillDate: null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    })

    const { PATCH } = await import('@/app/api/jobs/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/jobs/job-3', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ON_HOLD' }),
      }) as never,
      { params: Promise.resolve({ id: 'job-3' }) },
    )

    expect(response.status).toBe(200)
    expect(updateJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ON_HOLD',
          closedAt: null,
        }),
      }),
    )
  })

  it('returns 400 when PATCH /api/jobs/[id] has no valid fields', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-4', role: 'RECRUITER' },
    })

    const now = new Date('2026-03-09T09:00:00.000Z')
    findJobMock.mockResolvedValue({
      id: 'job-4',
      title: 'Product Designer',
      department: 'Design',
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
      new Request('http://localhost/api/jobs/job-4', {
        method: 'PATCH',
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ id: 'job-4' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'No valid fields provided for update',
    })
    expect(updateJobMock).not.toHaveBeenCalled()
  })

  it('rejects setting closedAt on non-closed statuses', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-5', role: 'RECRUITER' },
    })

    const now = new Date('2026-03-09T09:00:00.000Z')
    findJobMock.mockResolvedValue({
      id: 'job-5',
      title: 'QA Engineer',
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
      new Request('http://localhost/api/jobs/job-5', {
        method: 'PATCH',
        body: JSON.stringify({ closedAt: '2026-03-10T00:00:00.000Z' }),
      }) as never,
      { params: Promise.resolve({ id: 'job-5' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'closedAt can only be set when status is CLOSED',
    })
    expect(updateJobMock).not.toHaveBeenCalled()
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
    expect(generateUploadUrlMock).toHaveBeenCalledWith(
      'resumes/test-key.pdf',
      'application/pdf',
    )
  })

  it('rejects mismatched contentType in upload URL requests', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })

    const { POST } = await import('@/app/api/upload/resume/route')
    const response = await POST(
      new Request('http://localhost/api/upload/resume', {
        method: 'POST',
        body: JSON.stringify({
          filename: 'resume.pdf',
          contentType: 'text/plain',
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Content type does not match filename extension',
    })
    expect(generateUploadUrlMock).not.toHaveBeenCalled()
  })

  it('accepts contentType with charset when mime type matches', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })

    const { POST } = await import('@/app/api/upload/resume/route')
    const response = await POST(
      new Request('http://localhost/api/upload/resume', {
        method: 'POST',
        body: JSON.stringify({
          filename: 'resume.pdf',
          contentType: 'application/pdf; charset=utf-8',
        }),
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(generateUploadUrlMock).toHaveBeenCalledWith(
      'resumes/test-key.pdf',
      'application/pdf',
    )
  })

  it('allows generic application/octet-stream contentType values', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })

    const { POST } = await import('@/app/api/upload/resume/route')
    const response = await POST(
      new Request('http://localhost/api/upload/resume', {
        method: 'POST',
        body: JSON.stringify({
          filename: 'resume.pdf',
          contentType: 'application/octet-stream',
        }),
      }) as never,
    )

    expect(response.status).toBe(200)
    expect(generateUploadUrlMock).toHaveBeenCalledWith(
      'resumes/test-key.pdf',
      'application/pdf',
    )
  })

  it('rejects invalid resume download keys', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })

    const { GET } = await import('@/app/api/upload/resume/[key]/route')
    const response = await GET(
      new Request('http://localhost/api/upload/resume/not-a-valid-key') as never,
      { params: Promise.resolve({ key: 'not-a-valid-key' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid key' })
    expect(generateDownloadUrlMock).not.toHaveBeenCalled()
  })

  it('returns 404 when resume key is not linked to a candidate', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })
    findCandidateByResumeKeyMock.mockResolvedValue(null)

    const validKey = 'resumes/123e4567-e89b-12d3-a456-426614174000.pdf'
    const { GET } = await import('@/app/api/upload/resume/[key]/route')
    const response = await GET(
      new Request(`http://localhost/api/upload/resume/${validKey}`) as never,
      { params: Promise.resolve({ key: validKey }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Resume not found' })
    expect(generateDownloadUrlMock).not.toHaveBeenCalled()
  })

  it('returns signed URL for valid resume download keys', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })

    const validKey = 'resumes/123e4567-e89b-12d3-a456-426614174000.pdf'
    const { GET } = await import('@/app/api/upload/resume/[key]/route')
    const response = await GET(
      new Request(`http://localhost/api/upload/resume/${validKey}`) as never,
      { params: Promise.resolve({ key: validKey }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      downloadUrl: 'https://example.com/download',
    })
    expect(findCandidateByResumeKeyMock).toHaveBeenCalledWith({
      where: { resumeKey: validKey },
      select: { id: true },
    })
    expect(generateDownloadUrlMock).toHaveBeenCalledWith(validKey)
  })
})
