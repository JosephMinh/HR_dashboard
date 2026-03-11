import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const findManyMock = vi.fn()
const listObjectsMock = vi.fn()
const deleteObjectMock = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    candidate: {
      findMany: findManyMock,
    },
  },
}))

vi.mock('@/lib/storage', () => ({
  listObjects: listObjectsMock,
  deleteObject: deleteObjectMock,
}))

const originalNodeEnv = process.env.NODE_ENV
const originalCronSecret = process.env.CRON_SECRET
const mutableEnv = process.env as Record<string, string | undefined>

describe('GET /api/cron/cleanup-orphaned-resumes', () => {
  beforeEach(() => {
    findManyMock.mockReset()
    listObjectsMock.mockReset()
    deleteObjectMock.mockReset()
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete mutableEnv.NODE_ENV
    } else {
      mutableEnv.NODE_ENV = originalNodeEnv
    }

    if (originalCronSecret === undefined) {
      delete mutableEnv.CRON_SECRET
    } else {
      mutableEnv.CRON_SECRET = originalCronSecret
    }
  })

  it('fails closed in production when CRON_SECRET is unset', async () => {
    mutableEnv.NODE_ENV = 'production'
    delete mutableEnv.CRON_SECRET

    const { GET } = await import('@/app/api/cron/cleanup-orphaned-resumes/route')
    const response = await GET(
      new Request('http://localhost/api/cron/cleanup-orphaned-resumes') as never,
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'Cron endpoint is not configured',
    })
    expect(listObjectsMock).not.toHaveBeenCalled()
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('requires a matching bearer token when CRON_SECRET is configured', async () => {
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.CRON_SECRET = 'top-secret'

    const { GET } = await import('@/app/api/cron/cleanup-orphaned-resumes/route')
    const response = await GET(
      new Request('http://localhost/api/cron/cleanup-orphaned-resumes', {
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      }) as never,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(listObjectsMock).not.toHaveBeenCalled()
  })

  it('allows local development without CRON_SECRET', async () => {
    mutableEnv.NODE_ENV = 'development'
    delete mutableEnv.CRON_SECRET
    listObjectsMock.mockResolvedValue([])
    findManyMock.mockResolvedValue([])

    const { GET } = await import('@/app/api/cron/cleanup-orphaned-resumes/route')
    const response = await GET(
      new Request('http://localhost/api/cron/cleanup-orphaned-resumes?dryRun=true') as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      dryRun: true,
      scanned: 0,
    })
    expect(listObjectsMock).toHaveBeenCalledWith('resumes/')
  })

  it('scans past the first 1000 objects before applying the deletion cap', async () => {
    mutableEnv.NODE_ENV = 'development'
    delete mutableEnv.CRON_SECRET

    const oldDate = new Date('2026-03-01T00:00:00.000Z')
    const linkedObjects = Array.from({ length: 1000 }, (_, index) => ({
      key: `resumes/00000000-0000-4000-8000-${String(index).padStart(12, '0')}.pdf`,
      lastModified: oldDate,
      size: 123,
    }))
    const orphanedObject = {
      key: 'resumes/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf',
      lastModified: oldDate,
      size: 456,
    }

    listObjectsMock.mockResolvedValue([...linkedObjects, orphanedObject])
    findManyMock.mockResolvedValue(
      linkedObjects.map((file) => ({ resumeKey: file.key })),
    )
    deleteObjectMock.mockResolvedValue(undefined)

    const { GET } = await import('@/app/api/cron/cleanup-orphaned-resumes/route')
    const response = await GET(
      new Request('http://localhost/api/cron/cleanup-orphaned-resumes') as never,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      scanned: 1001,
      orphaned: 1,
      deleted: 1,
      deletedKeys: [orphanedObject.key],
    })
    expect(deleteObjectMock).toHaveBeenCalledWith(orphanedObject.key)
  })
})
