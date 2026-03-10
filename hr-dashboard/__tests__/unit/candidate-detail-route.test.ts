import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const findUniqueMock = vi.fn()
const updateMock = vi.fn()
const getClientIpMock = vi.fn()
const logAuditUpdateMock = vi.fn()

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    candidate: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}))

vi.mock('@/lib/audit', () => ({
  getClientIp: getClientIpMock,
  logAuditUpdate: logAuditUpdateMock,
}))

describe('GET /api/candidates/[id]', () => {
  beforeEach(() => {
    authMock.mockReset()
    findUniqueMock.mockReset()
    updateMock.mockReset()
    getClientIpMock.mockReset()
    logAuditUpdateMock.mockReset()
  })

  it('returns 401 for unauthenticated requests', async () => {
    authMock.mockResolvedValue(null)

    const { GET } = await import('@/app/api/candidates/[id]/route')
    const response = await GET(
      new Request('http://localhost/api/candidates/cand-1') as never,
      { params: Promise.resolve({ id: 'cand-1' }) },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(findUniqueMock).not.toHaveBeenCalled()
  })

  it('returns 404 when candidate does not exist', async () => {
    authMock.mockResolvedValue({
      user: { id: 'user-1', role: 'RECRUITER' },
    })
    findUniqueMock.mockResolvedValue(null)

    const { GET } = await import('@/app/api/candidates/[id]/route')
    const response = await GET(
      new Request('http://localhost/api/candidates/missing') as never,
      { params: Promise.resolve({ id: 'missing' }) },
    )

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: 'missing' },
      include: {
        applications: {
          include: {
            job: {
              select: {
                id: true,
                title: true,
                department: true,
                status: true,
                priority: true,
                pipelineHealth: true,
                isCritical: true,
                targetFillDate: true,
              },
            },
          },
          orderBy: { stageUpdatedAt: 'desc' },
        },
      },
    })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Candidate not found',
    })
  })

  it('returns candidate details with application history', async () => {
    authMock.mockResolvedValue({
      user: { id: 'user-2', role: 'ADMIN' },
    })

    const now = new Date('2026-03-09T08:30:00.000Z')
    const targetFillDate = new Date('2026-04-01T00:00:00.000Z')

    findUniqueMock.mockResolvedValue({
      id: 'cand-7',
      firstName: 'Lily',
      lastName: 'Thompson',
      email: null,
      phone: '555-0107',
      linkedinUrl: 'https://www.linkedin.com/in/lily-thompson',
      currentCompany: 'Bluebird Support',
      location: 'Portland, OR',
      source: 'LINKEDIN',
      resumeKey: null,
      resumeName: null,
      notes: 'Reached out directly after seeing the support opening.',
      createdAt: now,
      updatedAt: now,
      applications: [
        {
          id: 'app-1',
          stage: 'INTERVIEWING',
          recruiterOwner: 'Jane Recruiter',
          interviewNotes: 'Leadership panel next week.',
          stageUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
          job: {
            id: 'job-12',
            title: 'Customer Support Lead',
            department: 'Operations',
            status: 'OPEN',
            priority: 'HIGH',
            pipelineHealth: 'ON_TRACK',
            isCritical: false,
            targetFillDate,
          },
        },
      ],
    })

    const { GET } = await import('@/app/api/candidates/[id]/route')
    const response = await GET(
      new Request('http://localhost/api/candidates/cand-7') as never,
      { params: Promise.resolve({ id: 'cand-7' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      candidate: {
        id: 'cand-7',
        firstName: 'Lily',
        lastName: 'Thompson',
        email: null,
        phone: '555-0107',
        linkedinUrl: 'https://www.linkedin.com/in/lily-thompson',
        currentCompany: 'Bluebird Support',
        location: 'Portland, OR',
        source: 'LINKEDIN',
        resumeKey: null,
        resumeName: null,
        notes: 'Reached out directly after seeing the support opening.',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        applications: [
          {
            id: 'app-1',
            stage: 'INTERVIEWING',
            recruiterOwner: 'Jane Recruiter',
            interviewNotes: 'Leadership panel next week.',
            stageUpdatedAt: now.toISOString(),
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            job: {
              id: 'job-12',
              title: 'Customer Support Lead',
              department: 'Operations',
              status: 'OPEN',
              priority: 'HIGH',
              pipelineHealth: 'ON_TRACK',
              isCritical: false,
              targetFillDate: targetFillDate.toISOString(),
            },
          },
        ],
      },
    })
  })
})

describe('PATCH /api/candidates/[id]', () => {
  beforeEach(() => {
    authMock.mockReset()
    findUniqueMock.mockReset()
    updateMock.mockReset()
    getClientIpMock.mockReset()
    logAuditUpdateMock.mockReset()
    getClientIpMock.mockReturnValue('127.0.0.1')
    logAuditUpdateMock.mockResolvedValue(undefined)
  })

  it('returns 401 for unauthenticated requests', async () => {
    authMock.mockResolvedValue(null)

    const { PATCH } = await import('@/app/api/candidates/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/candidates/cand-1', {
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'Updated' }),
      }) as never,
      { params: Promise.resolve({ id: 'cand-1' }) },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 for viewer role', async () => {
    authMock.mockResolvedValue({
      user: { id: 'viewer-1', role: 'VIEWER' },
    })

    const { PATCH } = await import('@/app/api/candidates/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/candidates/cand-1', {
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'Updated' }),
      }) as never,
      { params: Promise.resolve({ id: 'cand-1' }) },
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: 'Only admins and recruiters can create, update, or delete recruiting data.',
    })
  })

  it('returns 404 when candidate is missing', async () => {
    authMock.mockResolvedValue({
      user: { id: 'recruiter-1', role: 'RECRUITER' },
    })
    findUniqueMock.mockResolvedValue(null)

    const { PATCH } = await import('@/app/api/candidates/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/candidates/missing', {
        method: 'PATCH',
        body: JSON.stringify({ firstName: 'Updated' }),
      }) as never,
      { params: Promise.resolve({ id: 'missing' }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'Candidate not found',
    })
  })

  it('updates candidate fields and writes audit before/after', async () => {
    authMock.mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN', name: 'Admin User' },
    })

    const now = new Date('2026-03-09T08:50:00.000Z')
    const existingCandidate = {
      id: 'cand-22',
      firstName: 'Lily',
      lastName: 'Thompson',
      email: null,
      phone: '555-0107',
      linkedinUrl: null,
      currentCompany: 'Bluebird Support',
      location: 'Portland, OR',
      source: 'LINKEDIN',
      resumeKey: null,
      resumeName: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    }
    const updatedCandidate = {
      ...existingCandidate,
      firstName: 'Lillian',
      email: 'lillian@example.com',
      updatedAt: new Date('2026-03-09T09:00:00.000Z'),
    }

    findUniqueMock.mockResolvedValue(existingCandidate)
    updateMock.mockResolvedValue(updatedCandidate)

    const { PATCH } = await import('@/app/api/candidates/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/candidates/cand-22', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: '  Lillian  ',
          email: 'lillian@example.com',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'cand-22' }) },
    )

    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'cand-22' },
      data: {
        firstName: 'Lillian',
        email: 'lillian@example.com',
      },
    })
    expect(logAuditUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'CANDIDATE_UPDATED',
        entityType: 'Candidate',
        entityId: 'cand-22',
        ipAddress: '127.0.0.1',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      candidate: {
        id: 'cand-22',
        firstName: 'Lillian',
        lastName: 'Thompson',
        email: 'lillian@example.com',
        phone: '555-0107',
        linkedinUrl: null,
        currentCompany: 'Bluebird Support',
        location: 'Portland, OR',
        source: 'LINKEDIN',
        resumeKey: null,
        resumeName: null,
        notes: null,
        createdAt: now.toISOString(),
        updatedAt: updatedCandidate.updatedAt.toISOString(),
      },
    })
  })

  it('returns 400 when resume key format is invalid', async () => {
    authMock.mockResolvedValue({
      user: { id: 'admin-1', role: 'ADMIN' },
    })
    findUniqueMock.mockResolvedValue({
      id: 'cand-22',
      firstName: 'Lily',
      lastName: 'Thompson',
      email: null,
      phone: null,
      linkedinUrl: null,
      currentCompany: null,
      location: null,
      source: null,
      resumeKey: null,
      resumeName: null,
      notes: null,
      createdAt: new Date('2026-03-09T08:50:00.000Z'),
      updatedAt: new Date('2026-03-09T08:50:00.000Z'),
    })

    const { PATCH } = await import('@/app/api/candidates/[id]/route')
    const response = await PATCH(
      new Request('http://localhost/api/candidates/cand-22', {
        method: 'PATCH',
        body: JSON.stringify({
          resumeKey: 'resumes/not-a-uuid.pdf',
          resumeName: 'resume.pdf',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'cand-22' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid resume key format',
    })
    expect(updateMock).not.toHaveBeenCalled()
  })
})
