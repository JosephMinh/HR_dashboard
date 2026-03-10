import { beforeEach, describe, expect, it, vi } from "vitest"

import { createMockSession } from "@/test/auth"
import {
  createTestFactories,
  getTestPrisma,
  setupIntegrationTests,
} from "@/test/setup-integration"

const authMock = vi.fn()
const generateUploadUrlMock = vi.fn()
const generateDownloadUrlMock = vi.fn()

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}))

vi.mock("@/lib/storage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage")>(
    "@/lib/storage",
  )
  return {
    ...actual,
    generateUploadUrl: generateUploadUrlMock,
    generateDownloadUrl: generateDownloadUrlMock,
  }
})

describe("Integration: Resume upload API", () => {
  setupIntegrationTests({ logger: true })
  const factories = createTestFactories()

  beforeEach(() => {
    authMock.mockResolvedValue(createMockSession({ role: "RECRUITER" }))
    generateUploadUrlMock.mockReset()
    generateDownloadUrlMock.mockReset()
    generateUploadUrlMock.mockImplementation(
      async (key: string) => `https://example.test/upload/${encodeURIComponent(key)}`,
    )
    generateDownloadUrlMock.mockImplementation(
      async (key: string) => `https://example.test/download/${encodeURIComponent(key)}`,
    )
  })

  it("returns 401 for unauthenticated upload URL requests", async () => {
    authMock.mockResolvedValue(null)

    const { POST } = await import("@/app/api/upload/resume/route")
    const response = await POST(
      new Request("http://localhost/api/upload/resume", {
        method: "POST",
        body: JSON.stringify({ filename: "resume.pdf" }),
      }) as never,
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 403 for viewer upload URL requests", async () => {
    authMock.mockResolvedValue(createMockSession({ role: "VIEWER" }))

    const { POST } = await import("@/app/api/upload/resume/route")
    const response = await POST(
      new Request("http://localhost/api/upload/resume", {
        method: "POST",
        body: JSON.stringify({ filename: "resume.pdf" }),
      }) as never,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      error: "Only admins and recruiters can create, update, or delete recruiting data.",
    })
  })

  it("returns 400 when filename is missing", async () => {
    const { POST } = await import("@/app/api/upload/resume/route")
    const response = await POST(
      new Request("http://localhost/api/upload/resume", {
        method: "POST",
        body: JSON.stringify({ filename: "   " }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Filename is required" })
  })

  it("returns 400 for invalid resume file types", async () => {
    const { POST } = await import("@/app/api/upload/resume/route")
    const response = await POST(
      new Request("http://localhost/api/upload/resume", {
        method: "POST",
        body: JSON.stringify({ filename: "resume.exe" }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid file type. Accepted: PDF, DOC, DOCX, TXT, RTF",
    })
  })

  it.each([
    ["resume.pdf", "application/pdf"],
    ["resume.doc", "application/msword"],
    ["resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["resume.txt", "text/plain"],
    ["resume.rtf", "application/rtf"],
  ])("returns signed upload URL for %s", async (filename, expectedContentType) => {
    const { POST } = await import("@/app/api/upload/resume/route")
    const response = await POST(
      new Request("http://localhost/api/upload/resume", {
        method: "POST",
        body: JSON.stringify({ filename }),
      }) as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()

    expect(payload.maxSizeBytes).toBe(10 * 1024 * 1024)
    expect(payload.contentType).toBe(expectedContentType)
    expect(payload.key).toMatch(
      /^resumes\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|doc|docx|txt|rtf)$/i,
    )
    expect(payload.uploadUrl).toContain(encodeURIComponent(payload.key))
    expect(generateUploadUrlMock).toHaveBeenCalledWith(payload.key, expectedContentType)
  })

  it("rejects mismatched content type", async () => {
    const { POST } = await import("@/app/api/upload/resume/route")
    const response = await POST(
      new Request("http://localhost/api/upload/resume", {
        method: "POST",
        body: JSON.stringify({
          filename: "resume.pdf",
          contentType: "text/plain",
        }),
      }) as never,
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Content type does not match filename extension",
    })
  })

  it("accepts generic binary content type", async () => {
    const { POST } = await import("@/app/api/upload/resume/route")
    const response = await POST(
      new Request("http://localhost/api/upload/resume", {
        method: "POST",
        body: JSON.stringify({
          filename: "resume.pdf",
          contentType: "application/octet-stream",
        }),
      }) as never,
    )

    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.contentType).toBe("application/pdf")
    expect(generateUploadUrlMock).toHaveBeenCalledWith(payload.key, "application/pdf")
  })

  it("returns 401 for unauthenticated download URL requests", async () => {
    authMock.mockResolvedValue(null)

    const validKey = "resumes/123e4567-e89b-12d3-a456-426614174000.pdf"
    const { GET } = await import("@/app/api/upload/resume/[key]/route")
    const response = await GET(
      new Request(`http://localhost/api/upload/resume/${validKey}`) as never,
      { params: Promise.resolve({ key: validKey }) },
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" })
  })

  it("returns 400 for invalid and traversal-like keys", async () => {
    const { GET } = await import("@/app/api/upload/resume/[key]/route")

    const invalidResponse = await GET(
      new Request("http://localhost/api/upload/resume/not-a-valid-key") as never,
      { params: Promise.resolve({ key: "not-a-valid-key" }) },
    )
    expect(invalidResponse.status).toBe(400)
    await expect(invalidResponse.json()).resolves.toEqual({ error: "Invalid key" })

    const traversalResponse = await GET(
      new Request("http://localhost/api/upload/resume/../secrets.txt") as never,
      { params: Promise.resolve({ key: "../secrets.txt" }) },
    )
    expect(traversalResponse.status).toBe(400)
    await expect(traversalResponse.json()).resolves.toEqual({ error: "Invalid key" })
  })

  it("returns 404 when key is not linked to any candidate", async () => {
    const validKey = "resumes/123e4567-e89b-12d3-a456-426614174000.pdf"
    const { GET } = await import("@/app/api/upload/resume/[key]/route")
    const response = await GET(
      new Request(`http://localhost/api/upload/resume/${validKey}`) as never,
      { params: Promise.resolve({ key: validKey }) },
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "Resume not found" })
  })

  it("returns a signed download URL for a key linked to a candidate", async () => {
    const prisma = getTestPrisma()
    const candidate = await factories.createCandidate({
      firstName: "Robin",
      lastName: "Lee",
      email: "robin.lee@example.com",
    })
    const validKey = "resumes/123e4567-e89b-12d3-a456-426614174000.pdf"

    await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        resumeKey: validKey,
        resumeName: "resume.pdf",
      },
    })

    const { GET } = await import("@/app/api/upload/resume/[key]/route")
    const response = await GET(
      new Request(`http://localhost/api/upload/resume/${validKey}`) as never,
      { params: Promise.resolve({ key: validKey }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      downloadUrl: `https://example.test/download/${encodeURIComponent(validKey)}`,
    })
    expect(generateDownloadUrlMock).toHaveBeenCalledWith(validKey)
  })
})
