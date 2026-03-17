/**
 * Real Storage Test Harness
 *
 * Provides an in-memory object store, assertion helpers, and failure injection
 * for integration tests that exercise storage paths without vi.mock.
 *
 * The storage module's built-in test mode routes operations to an in-memory
 * Map instead of S3. This harness wraps that store with convenient APIs.
 *
 * ## Usage
 *
 * ```ts
 * import { setupStorageHarness } from "@/test/setup-integration"
 *
 * describe("resume upload", () => {
 *   setupIntegrationTests()
 *   const storage = setupStorageHarness()
 *
 *   it("uploads a resume", async () => {
 *     // ... POST /api/upload/resume ...
 *     storage.assertObjectExists("resumes/abc.pdf")
 *     expect(storage.count).toBe(1)
 *   })
 *
 *   it("handles upload failure", async () => {
 *     storage.injectFailure("permission-denied")
 *     // ... POST /api/upload/resume ... expects error
 *   })
 * })
 * ```
 */

import { beforeAll, beforeEach, afterAll } from "vitest"
import {
  getTestStore,
  clearTestStore,
  _enableTestStore,
  _disableTestStore,
  _setStorageTestInterceptor,
  type StoredTestObject,
} from "@/lib/storage"

// ---------------------------------------------------------------------------
// Failure injection modes
// ---------------------------------------------------------------------------

export type StorageFailureMode =
  | "permission-denied"
  | "not-found"
  | "service-unavailable"
  | "timeout"

const FAILURE_MESSAGES: Record<StorageFailureMode, string> = {
  "permission-denied": "AccessDenied: Access Denied",
  "not-found": "NoSuchKey: The specified key does not exist.",
  "service-unavailable": "ServiceUnavailable: Service Unavailable",
  timeout: "TimeoutError: Connection timed out after 30000ms",
}

// ---------------------------------------------------------------------------
// Harness API
// ---------------------------------------------------------------------------

/**
 * Setup storage test harness.
 *
 * Call at module level in your test file alongside setupIntegrationTests().
 * Clears the object store and resets failure injection before each test.
 */
export function setupStorageHarness() {
  beforeAll(() => {
    _enableTestStore()
  })

  afterAll(() => {
    _disableTestStore()
  })

  beforeEach(() => {
    clearTestStore()
    _setStorageTestInterceptor(null)
  })

  return {
    // ----- Store inspection -----

    /** All stored objects as a readonly Map. */
    get store(): ReadonlyMap<string, StoredTestObject> {
      return getTestStore()
    },

    /** Number of objects in the store. */
    get count(): number {
      return getTestStore().size
    },

    /** Get a specific object by key, or undefined. */
    getObject(key: string): StoredTestObject | undefined {
      return getTestStore().get(key)
    },

    /** Check if a key exists in the store. */
    hasObject(key: string): boolean {
      return getTestStore().has(key)
    },

    /** Get all keys matching a prefix. */
    keysWithPrefix(prefix: string): string[] {
      const keys: string[] = []
      for (const key of getTestStore().keys()) {
        if (key.startsWith(prefix)) keys.push(key)
      }
      return keys
    },

    /** Get all stored objects as an array. */
    allObjects(): StoredTestObject[] {
      return Array.from(getTestStore().values())
    },

    /** Clear the store mid-test (e.g., between two API calls). */
    clear(): void {
      clearTestStore()
    },

    // ----- Seeding -----

    /** Seed an object into the store (simulates pre-existing S3 object). */
    seedObject(
      key: string,
      opts?: {
        contentType?: string
        size?: number
        createdAt?: Date
      },
    ): void {
      const store = getTestStore() as Map<string, StoredTestObject>
      store.set(key, {
        key,
        contentType: opts?.contentType ?? "application/pdf",
        size: opts?.size ?? 1024,
        createdAt: opts?.createdAt ?? new Date(),
      })
    },

    /** Seed multiple objects at once. */
    seedObjects(
      keys: string[],
      opts?: { contentType?: string; size?: number; createdAt?: Date },
    ): void {
      for (const key of keys) {
        this.seedObject(key, opts)
      }
    },

    // ----- Assertions -----

    /** Assert exactly N objects exist in the store. */
    assertCount(expected: number): void {
      const actual = getTestStore().size
      if (actual !== expected) {
        const keys = Array.from(getTestStore().keys())
          .map((k) => `  - ${k}`)
          .join("\n")
        throw new Error(
          `Expected ${expected} storage object(s) but found ${actual}.\n` +
            (actual > 0 ? `Objects:\n${keys}` : "Store is empty."),
        )
      }
    },

    /** Assert the store is empty. */
    assertEmpty(): void {
      this.assertCount(0)
    },

    /** Assert that a specific key exists. */
    assertObjectExists(key: string): StoredTestObject {
      const obj = getTestStore().get(key)
      if (!obj) {
        const keys =
          Array.from(getTestStore().keys()).join(", ") || "(none)"
        throw new Error(
          `Expected object "${key}" to exist but it was not found. Keys: ${keys}`,
        )
      }
      return obj
    },

    /** Assert that a specific key does NOT exist. */
    assertObjectMissing(key: string): void {
      if (getTestStore().has(key)) {
        throw new Error(
          `Expected object "${key}" to not exist but it was found.`,
        )
      }
    },

    /** Assert that at least one key matches the prefix. */
    assertHasPrefix(prefix: string): void {
      const matching = this.keysWithPrefix(prefix)
      if (matching.length === 0) {
        throw new Error(
          `Expected at least one object with prefix "${prefix}" but found none.`,
        )
      }
    },

    // ----- Failure injection -----

    /**
     * Inject a failure into storage operations.
     *
     * All operations will fail with the specified error until cleared.
     *
     * ```ts
     * storage.injectFailure("permission-denied")
     * storage.injectFailure("not-found", { ops: ["download"] })
     * ```
     */
    injectFailure(
      mode: StorageFailureMode,
      opts?: {
        /** Only fail these operations (default: all). */
        ops?: Array<"upload" | "download" | "delete" | "list">
        /** Only fail keys matching this pattern. */
        keyPattern?: string | RegExp
      },
    ): void {
      _setStorageTestInterceptor((op, key) => {
        if (opts?.ops && !opts.ops.includes(op)) return null
        if (opts?.keyPattern) {
          const pattern = opts.keyPattern
          const matches =
            typeof pattern === "string"
              ? key.includes(pattern)
              : pattern.test(key)
          if (!matches) return null
        }
        return { error: FAILURE_MESSAGES[mode] }
      })
    },

    /**
     * Inject a custom interceptor for fine-grained control.
     * Return `{ error: string }` to simulate failure, or null to proceed normally.
     * Use `throw` to provide a specific Error instance (e.g., StorageConfigError).
     */
    injectCustom(
      fn: (
        op: "upload" | "download" | "delete" | "list",
        key: string,
      ) => { error: string; throw?: Error } | null,
    ): void {
      _setStorageTestInterceptor(fn)
    },

    /** Clear any failure injection. */
    clearFailure(): void {
      _setStorageTestInterceptor(null)
    },
  }
}

export type StorageHarness = ReturnType<typeof setupStorageHarness>
