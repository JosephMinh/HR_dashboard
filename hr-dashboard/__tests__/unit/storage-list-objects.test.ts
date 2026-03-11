import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listObjects } from '@/lib/storage'

const originalEnv = {
  STORAGE_BUCKET: process.env.STORAGE_BUCKET,
  STORAGE_REGION: process.env.STORAGE_REGION,
  STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
}

function restoreEnv() {
  const mutableEnv = process.env as Record<string, string | undefined>

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete mutableEnv[key]
      continue
    }

    mutableEnv[key] = value
  }
}

describe('listObjects', () => {
  beforeEach(() => {
    const mutableEnv = process.env as Record<string, string | undefined>
    mutableEnv.STORAGE_BUCKET = 'test-bucket'
    mutableEnv.STORAGE_REGION = 'us-east-1'

    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    restoreEnv()
  })

  it('scans all pages before truncating so older objects are not starved', async () => {
    const sendMock = vi
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({
        Contents: [
          {
            Key: 'resumes/recent-a.pdf',
            LastModified: new Date('2026-03-10T00:00:00.000Z'),
            Size: 1,
          },
          {
            Key: 'resumes/recent-b.pdf',
            LastModified: new Date('2026-03-09T00:00:00.000Z'),
            Size: 2,
          },
        ],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      } as never)
      .mockResolvedValueOnce({
        Contents: [
          {
            Key: 'resumes/oldest.pdf',
            LastModified: new Date('2026-02-01T00:00:00.000Z'),
            Size: 3,
          },
        ],
        IsTruncated: false,
      } as never)

    const objects = await listObjects('resumes/', 2)

    expect(sendMock).toHaveBeenCalledTimes(2)
    expect(sendMock.mock.calls[0]?.[0]).toBeInstanceOf(ListObjectsV2Command)
    expect(sendMock.mock.calls[1]?.[0]).toBeInstanceOf(ListObjectsV2Command)
    expect(objects).toEqual([
      {
        key: 'resumes/oldest.pdf',
        lastModified: new Date('2026-02-01T00:00:00.000Z'),
        size: 3,
      },
      {
        key: 'resumes/recent-b.pdf',
        lastModified: new Date('2026-03-09T00:00:00.000Z'),
        size: 2,
      },
    ])
  })

  it('sorts unknown modification times after dated objects', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValueOnce({
      Contents: [
        {
          Key: 'resumes/unknown.pdf',
          LastModified: undefined,
          Size: 1,
        },
        {
          Key: 'resumes/known.pdf',
          LastModified: new Date('2026-03-01T00:00:00.000Z'),
          Size: 2,
        },
      ],
      IsTruncated: false,
    } as never)

    const objects = await listObjects('resumes/', 2)

    expect(objects.map((object) => object.key)).toEqual([
      'resumes/known.pdf',
      'resumes/unknown.pdf',
    ])
  })
})
