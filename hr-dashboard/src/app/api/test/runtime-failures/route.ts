import { NextRequest, NextResponse } from "next/server"

import { _setTestInterceptor, type EmailPayload, type EmailResult } from "@/lib/email"
import { _setStorageTestInterceptor } from "@/lib/storage"

export const dynamic = "force-dynamic"

type EmailFailureMode = "reject" | "timeout" | "partial"
type StorageFailureMode =
  | "permission-denied"
  | "not-found"
  | "service-unavailable"
  | "timeout"
  | "config-error"
type StorageOperation = "upload" | "download" | "delete" | "list"

type RuntimeFailureRequest = {
  email?: {
    mode: EmailFailureMode
    match?: {
      to?: string
      subject?: string
    }
  } | null
  storage?: {
    mode: StorageFailureMode
    ops?: StorageOperation[]
    keyPattern?: string
  } | null
}

const EMAIL_FAILURES: Record<EmailFailureMode, EmailResult> = {
  reject: {
    success: false,
    error: "SMTP connection refused: ECONNREFUSED 127.0.0.1:25",
  },
  timeout: {
    success: false,
    error: "Connection timeout: socket hang up after 30000ms",
  },
  partial: {
    success: false,
    error: "Partial delivery failure: 452 Too many recipients",
  },
}

const STORAGE_FAILURES: Record<Exclude<StorageFailureMode, "config-error">, string> = {
  "permission-denied": "AccessDenied: Access Denied",
  "not-found": "NoSuchKey: The specified key does not exist.",
  "service-unavailable": "ServiceUnavailable: Service Unavailable",
  timeout: "TimeoutError: Connection timed out after 30000ms",
}

function isTestControlEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false
  }
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true"
}

function guardTestOnlyRoute() {
  if (!isTestControlEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return null
}

function matchesSubstring(value: string, expected?: string): boolean {
  return !expected || value.includes(expected)
}

function createStorageConfigError(): Error & {
  missing: string[]
  issues: string[]
  warnings: string[]
} {
  const error = new Error("Storage configuration invalid.")
  error.name = "StorageConfigError"

  return Object.assign(error, {
    missing: ["STORAGE_BUCKET"],
    issues: ["AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set together."],
    warnings: [],
  })
}

function clearRuntimeFailures() {
  _setTestInterceptor(null)
  _setStorageTestInterceptor(null)
}

export async function POST(request: NextRequest) {
  const guard = guardTestOnlyRoute()
  if (guard) {
    return guard
  }

  let body: RuntimeFailureRequest
  try {
    body = (await request.json()) as RuntimeFailureRequest
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if ("email" in body) {
    if (!body.email) {
      _setTestInterceptor(null)
    } else {
      const { mode, match } = body.email
      const failure = EMAIL_FAILURES[mode]
      if (!failure) {
        return NextResponse.json({ error: "Invalid email failure mode" }, { status: 400 })
      }

      _setTestInterceptor((payload: EmailPayload): EmailResult | null => {
        if (!matchesSubstring(payload.to, match?.to)) {
          return null
        }
        if (!matchesSubstring(payload.subject, match?.subject)) {
          return null
        }
        return failure
      })
    }
  }

  if ("storage" in body) {
    if (!body.storage) {
      _setStorageTestInterceptor(null)
    } else {
      const { mode, ops, keyPattern } = body.storage

      if (mode === "config-error") {
        _setStorageTestInterceptor((op, key) => {
          if (ops && !ops.includes(op)) {
            return null
          }
          if (keyPattern && !key.includes(keyPattern)) {
            return null
          }
          return {
            error: "Storage configuration invalid.",
            throw: createStorageConfigError(),
          }
        })
      } else {
        const failure = STORAGE_FAILURES[mode]
        if (!failure) {
          return NextResponse.json({ error: "Invalid storage failure mode" }, { status: 400 })
        }

        _setStorageTestInterceptor((op, key) => {
          if (ops && !ops.includes(op)) {
            return null
          }
          if (keyPattern && !key.includes(keyPattern)) {
            return null
          }
          return { error: failure }
        })
      }
    }
  }

  return NextResponse.json(
    {
      success: true,
      configured: {
        email: body.email ?? "unchanged",
        storage: body.storage ?? "unchanged",
      },
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  )
}

export async function DELETE() {
  const guard = guardTestOnlyRoute()
  if (guard) {
    return guard
  }

  clearRuntimeFailures()

  return NextResponse.json(
    { success: true },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  )
}
