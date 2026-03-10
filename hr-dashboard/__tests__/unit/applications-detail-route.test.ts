import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const findUniqueMock = vi.fn()
const updateMock = vi.fn()
const deleteMock = vi.fn()
const getClientIpMock = vi.fn()
const logAuditUpdateMock = vi.fn()
const logAuditDeleteMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    application: {
      findUnique: findUniqueMock,
      update: updateMock,
      delete: deleteMock,
    },
  },
}))

vi.mock('@/lib/audit', () => ({
  getClientIp: getClientIpMock,
  logAuditUpdate: logAuditUpdateMock,
  logAuditDelete: logAuditDeleteMock,
}))

vi.mock('@/lib/validations', () => ({
  isValidUUID: () => true, // Allow test IDs
}))

describe('PATCH /api/applications/[id]', () => {
  beforeEach(() => {
    authMock.mockReset()
    findUniqueMock.mockReset()
    updateMock.mockReset()
    getClientIpMock.mockReset()
    logAuditUpdateMock.mockReset()
    getClientIpMock.mockReturnValue('127.0.0.1')
    logAuditUpdateMock.mockResolvedValue(undefined)
  })

  it('returns 400 when no updatable fields are provided', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })
    const now = new Date('2026-03-10T03:00:00.000Z')
    findUniqueMock.mockResolvedValue({
      id: 'app-1',
      jobId: 'job-1',
      candidateId: 'cand-1',
      stage: 'NEW',
      recruiterOwner: null,
      interviewNotes: null,
      stageUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    const { PATCH } = await import('@/app/api/applications/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/applications/app-1', {
        method: 'PATCH',
        body: JSON.stringify({}),
      }) as never,
      { params: Promise.resolve({ id: 'app-1' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'No valid fields provided for update',
    })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('updates application stage and writes audit log', async () => {
    authMock.mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    })
    const now = new Date('2026-03-10T03:10:00.000Z')
    findUniqueMock.mockResolvedValue({
      id: 'app-2',
      jobId: 'job-2',
      candidateId: 'cand-2',
      stage: 'NEW',
      recruiterOwner: 'Jane',
      interviewNotes: null,
      stageUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    updateMock.mockResolvedValue({
      id: 'app-2',
      jobId: 'job-2',
      candidateId: 'cand-2',
      stage: 'SCREENING',
      recruiterOwner: 'Jane',
      interviewNotes: 'Initial call scheduled.',
      stageUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
      job: { id: 'job-2', title: 'Product Manager', department: 'Product' },
      candidate: { id: 'cand-2', firstName: 'Ava', lastName: 'Chen', email: 'ava@example.com' },
    })

    const { PATCH } = await import('@/app/api/applications/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/applications/app-2', {
        method: 'PATCH',
        body: JSON.stringify({ stage: 'SCREENING', interviewNotes: 'Initial call scheduled.' }),
      }) as never,
      { params: Promise.resolve({ id: 'app-2' }) },
    )

    expect(response.status).toBe(200)
    expect(updateMock).toHaveBeenCalled()
    expect(logAuditUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'APPLICATION_UPDATED',
        entityType: 'Application',
        entityId: 'app-2',
        ipAddress: '127.0.0.1',
      }),
    )
  })
})

describe('DELETE /api/applications/[id]', () => {
  beforeEach(() => {
    authMock.mockReset()
    findUniqueMock.mockReset()
    deleteMock.mockReset()
    getClientIpMock.mockReset()
    logAuditDeleteMock.mockReset()
    getClientIpMock.mockReturnValue('127.0.0.1')
    logAuditDeleteMock.mockResolvedValue(undefined)
  })

  it('returns 404 when the application does not exist', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-2', role: 'RECRUITER' },
    })
    findUniqueMock.mockResolvedValue(null)

    const { DELETE } = await import('@/app/api/applications/[id]/route')
    const response = await DELETE(
      new Request('http://localhost/api/applications/missing', {
        method: 'DELETE',
      }) as never,
      { params: Promise.resolve({ id: 'missing' }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Application not found',
    })
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
