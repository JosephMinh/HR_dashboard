import { describe, expect, it } from 'vitest'

import { ResumeUploadSchema } from '@/lib/validations'

describe('ResumeUploadSchema', () => {
  it('accepts the full set of live resume extensions', () => {
    const cases = [
      { filename: 'resume.pdf', contentType: 'application/pdf', sizeBytes: 1024 },
      { filename: 'resume.doc', contentType: 'application/msword', sizeBytes: 1024 },
      {
        filename: 'resume.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 1024,
      },
      { filename: 'resume.txt', contentType: 'text/plain', sizeBytes: 1024 },
      { filename: 'resume.rtf', contentType: 'application/rtf', sizeBytes: 1024 },
    ]

    for (const payload of cases) {
      expect(ResumeUploadSchema.safeParse(payload).success).toBe(true)
    }
  })

  it('accepts generic binary content types used by some browsers', () => {
    const result = ResumeUploadSchema.safeParse({
      filename: 'resume.pdf',
      contentType: 'application/octet-stream',
      sizeBytes: 1024,
    })

    expect(result.success).toBe(true)
  })

  it('rejects unsupported file extensions', () => {
    const result = ResumeUploadSchema.safeParse({
      filename: 'resume.exe',
      contentType: 'application/octet-stream',
      sizeBytes: 1024,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Invalid file type. Accepted: PDF, DOC, DOCX, TXT, RTF',
    )
  })

  it('rejects content types that do not match the file extension', () => {
    const result = ResumeUploadSchema.safeParse({
      filename: 'resume.pdf',
      contentType: 'text/plain',
      sizeBytes: 1024,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      'Content type does not match filename extension',
    )
  })

  it('requires sizeBytes instead of the old size field name', () => {
    const result = ResumeUploadSchema.safeParse({
      filename: 'resume.pdf',
      contentType: 'application/pdf',
      size: 1024,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.path[0] === 'sizeBytes')).toBe(true)
  })
})
