/**
 * Integration tests for storage configuration validation
 *
 * Tests the validateStorageConfig function and StorageConfigError
 * by manipulating environment variables to verify validation logic.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  validateStorageConfig,
  StorageConfigError,
  type StorageConfigStatus,
} from "@/lib/storage"

describe("validateStorageConfig", () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Create a clean environment for each test
    process.env = { ...originalEnv }
    // Clear storage-related env vars
    delete process.env.STORAGE_BUCKET
    delete process.env.STORAGE_REGION
    delete process.env.STORAGE_ENDPOINT
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("bucket validation", () => {
    it("returns invalid when STORAGE_BUCKET is missing", () => {
      const status = validateStorageConfig()

      expect(status.configured).toBe(false)
      expect(status.valid).toBe(false)
      expect(status.bucket).toBeNull()
      expect(status.missing).toContain("STORAGE_BUCKET")
    })

    it("returns invalid when STORAGE_BUCKET is empty string", () => {
      process.env.STORAGE_BUCKET = ""

      const status = validateStorageConfig()

      expect(status.configured).toBe(false)
      expect(status.valid).toBe(false)
      expect(status.missing).toContain("STORAGE_BUCKET")
    })

    it("returns invalid when STORAGE_BUCKET is whitespace only", () => {
      process.env.STORAGE_BUCKET = "   "

      const status = validateStorageConfig()

      expect(status.configured).toBe(false)
      expect(status.valid).toBe(false)
      expect(status.missing).toContain("STORAGE_BUCKET")
    })

    it("returns valid when STORAGE_BUCKET is set", () => {
      process.env.STORAGE_BUCKET = "test-bucket"

      const status = validateStorageConfig()

      expect(status.configured).toBe(true)
      expect(status.valid).toBe(true)
      expect(status.bucket).toBe("test-bucket")
      expect(status.missing).toHaveLength(0)
      expect(status.issues).toHaveLength(0)
    })

    it("trims whitespace from bucket name", () => {
      process.env.STORAGE_BUCKET = "  my-bucket  "

      const status = validateStorageConfig()

      expect(status.bucket).toBe("my-bucket")
    })
  })

  describe("region handling", () => {
    it("defaults to us-east-1 when STORAGE_REGION is not set", () => {
      process.env.STORAGE_BUCKET = "test-bucket"

      const status = validateStorageConfig()

      expect(status.region).toBe("us-east-1")
    })

    it("uses STORAGE_REGION when set", () => {
      process.env.STORAGE_BUCKET = "test-bucket"
      process.env.STORAGE_REGION = "eu-west-1"

      const status = validateStorageConfig()

      expect(status.region).toBe("eu-west-1")
    })

    it("trims whitespace from region", () => {
      process.env.STORAGE_BUCKET = "test-bucket"
      process.env.STORAGE_REGION = "  ap-southeast-1  "

      const status = validateStorageConfig()

      expect(status.region).toBe("ap-southeast-1")
    })
  })

  describe("endpoint handling", () => {
    it("returns null endpoint when STORAGE_ENDPOINT is not set", () => {
      process.env.STORAGE_BUCKET = "test-bucket"

      const status = validateStorageConfig()

      expect(status.endpoint).toBeNull()
    })

    it("returns endpoint when STORAGE_ENDPOINT is set", () => {
      process.env.STORAGE_BUCKET = "test-bucket"
      process.env.STORAGE_ENDPOINT = "http://localhost:9000"

      const status = validateStorageConfig()

      expect(status.endpoint).toBe("http://localhost:9000")
    })
  })

  describe("credentials validation", () => {
    it("returns issue when only AWS_ACCESS_KEY_ID is set", () => {
      process.env.STORAGE_BUCKET = "test-bucket"
      process.env.AWS_ACCESS_KEY_ID = "my-access-key"

      const status = validateStorageConfig()

      expect(status.valid).toBe(false)
      expect(status.issues).toContain(
        "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set together."
      )
    })

    it("returns issue when only AWS_SECRET_ACCESS_KEY is set", () => {
      process.env.STORAGE_BUCKET = "test-bucket"
      process.env.AWS_SECRET_ACCESS_KEY = "my-secret-key"

      const status = validateStorageConfig()

      expect(status.valid).toBe(false)
      expect(status.issues).toContain(
        "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set together."
      )
    })

    it("returns valid when both credentials are set", () => {
      process.env.STORAGE_BUCKET = "test-bucket"
      process.env.AWS_ACCESS_KEY_ID = "my-access-key"
      process.env.AWS_SECRET_ACCESS_KEY = "my-secret-key"

      const status = validateStorageConfig()

      expect(status.valid).toBe(true)
      expect(status.issues).toHaveLength(0)
      expect(status.warnings).toHaveLength(0)
    })

    it("returns valid when neither credential is set (uses IAM/credential chain)", () => {
      process.env.STORAGE_BUCKET = "test-bucket"

      const status = validateStorageConfig()

      expect(status.valid).toBe(true)
      expect(status.issues).toHaveLength(0)
      // Should have a warning about IAM credentials
      expect(status.warnings.length).toBeGreaterThan(0)
      expect(status.warnings[0]).toContain("credential")
    })
  })

  describe("warnings", () => {
    it("warns about missing credentials when no endpoint and no credentials", () => {
      process.env.STORAGE_BUCKET = "test-bucket"

      const status = validateStorageConfig()

      expect(status.warnings).toContain(
        "AWS credentials are not explicitly set. Ensure the runtime provides credentials via IAM or the default AWS credential chain."
      )
    })

    it("does not warn when endpoint is set (assumes local/test environment)", () => {
      process.env.STORAGE_BUCKET = "test-bucket"
      process.env.STORAGE_ENDPOINT = "http://localhost:9000"
      process.env.AWS_ACCESS_KEY_ID = "minioadmin"
      process.env.AWS_SECRET_ACCESS_KEY = "minioadmin"

      const status = validateStorageConfig()

      expect(status.warnings).toHaveLength(0)
    })
  })

  describe("complete configuration scenarios", () => {
    it("validates full MinIO local development configuration", () => {
      process.env.STORAGE_BUCKET = "hr-dashboard"
      process.env.STORAGE_REGION = "us-east-1"
      process.env.STORAGE_ENDPOINT = "http://localhost:9000"
      process.env.AWS_ACCESS_KEY_ID = "minioadmin"
      process.env.AWS_SECRET_ACCESS_KEY = "minioadmin"

      const status = validateStorageConfig()

      expect(status).toMatchObject<StorageConfigStatus>({
        configured: true,
        valid: true,
        bucket: "hr-dashboard",
        region: "us-east-1",
        endpoint: "http://localhost:9000",
        missing: [],
        issues: [],
        warnings: [],
      })
    })

    it("validates AWS S3 production configuration with explicit credentials", () => {
      process.env.STORAGE_BUCKET = "company-hr-resumes"
      process.env.STORAGE_REGION = "eu-west-1"
      process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
      process.env.AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

      const status = validateStorageConfig()

      expect(status.configured).toBe(true)
      expect(status.valid).toBe(true)
      expect(status.endpoint).toBeNull()
      expect(status.warnings).toHaveLength(0)
    })

    it("validates AWS S3 production configuration with IAM credentials", () => {
      process.env.STORAGE_BUCKET = "company-hr-resumes"
      process.env.STORAGE_REGION = "eu-west-1"
      // No explicit credentials - assumes IAM role

      const status = validateStorageConfig()

      expect(status.configured).toBe(true)
      expect(status.valid).toBe(true)
      expect(status.warnings.length).toBeGreaterThan(0) // Warning about IAM
    })
  })
})

describe("StorageConfigError", () => {
  it("creates error with missing fields message", () => {
    const status: StorageConfigStatus = {
      configured: false,
      valid: false,
      bucket: null,
      region: "us-east-1",
      endpoint: null,
      missing: ["STORAGE_BUCKET"],
      issues: [],
      warnings: [],
    }

    const error = new StorageConfigError(status)

    expect(error.name).toBe("StorageConfigError")
    expect(error.message).toContain("Missing required storage environment variables")
    expect(error.message).toContain("STORAGE_BUCKET")
    expect(error.missing).toEqual(["STORAGE_BUCKET"])
    expect(error.status).toBe(status)
  })

  it("creates error with issues message", () => {
    const status: StorageConfigStatus = {
      configured: true,
      valid: false,
      bucket: "test-bucket",
      region: "us-east-1",
      endpoint: null,
      missing: [],
      issues: ["AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set together."],
      warnings: [],
    }

    const error = new StorageConfigError(status)

    expect(error.message).toContain("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set together")
    expect(error.issues).toHaveLength(1)
  })

  it("creates error with warnings included in message", () => {
    const status: StorageConfigStatus = {
      configured: true,
      valid: true,
      bucket: "test-bucket",
      region: "us-east-1",
      endpoint: null,
      missing: [],
      issues: [],
      warnings: ["AWS credentials are not explicitly set."],
    }

    // Note: This wouldn't normally throw since valid=true, but testing error construction
    const error = new StorageConfigError(status)

    expect(error.message).toContain("AWS credentials are not explicitly set")
    expect(error.warnings).toHaveLength(1)
  })

  it("creates error with combined message when multiple problems exist", () => {
    const status: StorageConfigStatus = {
      configured: false,
      valid: false,
      bucket: null,
      region: "us-east-1",
      endpoint: null,
      missing: ["STORAGE_BUCKET"],
      issues: ["AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set together."],
      warnings: ["Some warning"],
    }

    const error = new StorageConfigError(status)

    expect(error.message).toContain("STORAGE_BUCKET")
    expect(error.message).toContain("AWS_ACCESS_KEY_ID")
    expect(error.message).toContain("Some warning")
  })
})
