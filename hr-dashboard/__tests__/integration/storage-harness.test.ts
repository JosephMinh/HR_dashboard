/**
 * Storage Harness Integration Tests
 *
 * Verifies that the storage harness works with real in-memory storage
 * (no vi.mock on @/lib/storage), exercises assertion helpers, seeding,
 * and failure injection.
 */

import { describe, it, expect } from "vitest"
import {
  setupIntegrationTests,
  setupStorageHarness,
} from "@/test/setup-integration"
import {
  generateUploadUrl,
  generateDownloadUrl,
  deleteObject,
  listObjects,
  generateObjectKey,
} from "@/lib/storage"

describe("Storage Harness", () => {
  setupIntegrationTests({ resetBeforeEach: false })
  const storage = setupStorageHarness()

  // =========================================================================
  // Store inspection
  // =========================================================================

  describe("store inspection", () => {
    it("starts empty before each test", () => {
      expect(storage.count).toBe(0)
      storage.assertEmpty()
    })

    it("tracks objects created via generateUploadUrl", async () => {
      const key = generateObjectKey("resume.pdf")
      await generateUploadUrl(key, "application/pdf")

      expect(storage.count).toBe(1)
      expect(storage.hasObject(key)).toBe(true)

      const obj = storage.getObject(key)
      expect(obj).toBeDefined()
      expect(obj!.contentType).toBe("application/pdf")
    })

    it("returns a test-mode URL from generateUploadUrl", async () => {
      const key = "resumes/test.pdf"
      const url = await generateUploadUrl(key, "application/pdf")

      expect(url).toContain("test-storage.local")
      expect(url).toContain(key)
    })

    it("returns a test-mode URL from generateDownloadUrl", async () => {
      const key = "resumes/test.pdf"
      const url = await generateDownloadUrl(key)

      expect(url).toContain("test-storage.local")
      expect(url).toContain(key)
    })
  })

  // =========================================================================
  // Delete
  // =========================================================================

  describe("deleteObject", () => {
    it("removes an object from the test store", async () => {
      const key = generateObjectKey("resume.pdf")
      await generateUploadUrl(key, "application/pdf")
      expect(storage.hasObject(key)).toBe(true)

      await deleteObject(key)
      expect(storage.hasObject(key)).toBe(false)
    })

    it("is a no-op for non-existent keys (matches S3 behavior)", async () => {
      await deleteObject("resumes/nonexistent.pdf")
      storage.assertEmpty()
    })
  })

  // =========================================================================
  // List
  // =========================================================================

  describe("listObjects", () => {
    it("lists objects by prefix", async () => {
      await generateUploadUrl("resumes/a.pdf", "application/pdf")
      await generateUploadUrl("resumes/b.pdf", "application/pdf")
      await generateUploadUrl("other/c.txt", "text/plain")

      const resumeObjects = await listObjects("resumes/")
      expect(resumeObjects).toHaveLength(2)
      expect(resumeObjects.map((o) => o.key).sort()).toEqual([
        "resumes/a.pdf",
        "resumes/b.pdf",
      ])
    })

    it("respects maxKeys", async () => {
      await generateUploadUrl("resumes/1.pdf", "application/pdf")
      await generateUploadUrl("resumes/2.pdf", "application/pdf")
      await generateUploadUrl("resumes/3.pdf", "application/pdf")

      const limited = await listObjects("resumes/", 2)
      expect(limited).toHaveLength(2)
    })

    it("returns empty for non-matching prefix", async () => {
      await generateUploadUrl("resumes/a.pdf", "application/pdf")
      const result = await listObjects("other/")
      expect(result).toHaveLength(0)
    })
  })

  // =========================================================================
  // Seeding
  // =========================================================================

  describe("seeding", () => {
    it("seeds a single object", () => {
      storage.seedObject("resumes/seeded.pdf")

      expect(storage.count).toBe(1)
      storage.assertObjectExists("resumes/seeded.pdf")
    })

    it("seeds multiple objects", () => {
      storage.seedObjects([
        "resumes/a.pdf",
        "resumes/b.pdf",
        "resumes/c.pdf",
      ])

      storage.assertCount(3)
    })

    it("seeded objects appear in listObjects", async () => {
      storage.seedObject("resumes/old.pdf", {
        createdAt: new Date("2020-01-01"),
      })
      storage.seedObject("resumes/new.pdf", {
        createdAt: new Date("2025-01-01"),
      })

      const objects = await listObjects("resumes/")
      expect(objects).toHaveLength(2)
      // Oldest first
      expect(objects[0]!.key).toBe("resumes/old.pdf")
      expect(objects[1]!.key).toBe("resumes/new.pdf")
    })

    it("seeded objects can be deleted", async () => {
      storage.seedObject("resumes/to-delete.pdf")
      await deleteObject("resumes/to-delete.pdf")
      storage.assertObjectMissing("resumes/to-delete.pdf")
    })
  })

  // =========================================================================
  // Assertions
  // =========================================================================

  describe("assertions", () => {
    it("assertObjectExists throws for missing keys", () => {
      expect(() => storage.assertObjectExists("missing")).toThrow(
        "not found",
      )
    })

    it("assertObjectMissing throws for present keys", () => {
      storage.seedObject("resumes/exists.pdf")
      expect(() => storage.assertObjectMissing("resumes/exists.pdf")).toThrow(
        "not exist",
      )
    })

    it("assertCount throws with helpful message", () => {
      storage.seedObject("resumes/a.pdf")
      expect(() => storage.assertCount(0)).toThrow("found 1")
    })

    it("assertHasPrefix works", () => {
      storage.seedObject("resumes/a.pdf")
      storage.assertHasPrefix("resumes/")
      expect(() => storage.assertHasPrefix("other/")).toThrow("found none")
    })

    it("keysWithPrefix returns matching keys", () => {
      storage.seedObjects(["resumes/a.pdf", "resumes/b.pdf", "other/c.txt"])
      expect(storage.keysWithPrefix("resumes/")).toHaveLength(2)
    })
  })

  // =========================================================================
  // Failure injection
  // =========================================================================

  describe("failure injection", () => {
    it("injects permission-denied on all operations", async () => {
      storage.injectFailure("permission-denied")

      await expect(
        generateUploadUrl("resumes/fail.pdf", "application/pdf"),
      ).rejects.toThrow("AccessDenied")
    })

    it("injects not-found on download only", async () => {
      storage.injectFailure("not-found", { ops: ["download"] })

      // Upload succeeds
      await generateUploadUrl("resumes/ok.pdf", "application/pdf")
      expect(storage.count).toBe(1)

      // Download fails
      await expect(
        generateDownloadUrl("resumes/ok.pdf"),
      ).rejects.toThrow("NoSuchKey")
    })

    it("injects failure for specific key pattern", async () => {
      storage.injectFailure("service-unavailable", {
        keyPattern: /secret/,
      })

      // Non-matching key succeeds
      await generateUploadUrl("resumes/public.pdf", "application/pdf")

      // Matching key fails
      await expect(
        generateUploadUrl("resumes/secret.pdf", "application/pdf"),
      ).rejects.toThrow("ServiceUnavailable")
    })

    it("clearFailure stops injection", async () => {
      storage.injectFailure("timeout")
      await expect(
        generateUploadUrl("resumes/a.pdf", "application/pdf"),
      ).rejects.toThrow("TimeoutError")

      storage.clearFailure()
      const url = await generateUploadUrl("resumes/b.pdf", "application/pdf")
      expect(url).toBeDefined()
    })

    it("injectCustom for fine-grained control", async () => {
      let callCount = 0
      storage.injectCustom((op, key) => {
        callCount++
        if (callCount > 2) return { error: "Quota exceeded" }
        return null
      })

      await generateUploadUrl("resumes/1.pdf", "application/pdf")
      await generateUploadUrl("resumes/2.pdf", "application/pdf")
      await expect(
        generateUploadUrl("resumes/3.pdf", "application/pdf"),
      ).rejects.toThrow("Quota exceeded")
    })
  })
})
