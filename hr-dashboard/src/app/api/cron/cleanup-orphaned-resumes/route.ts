import crypto from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { listObjects, deleteObject } from '@/lib/storage'

/**
 * Cron endpoint for cleaning up orphaned resume files in S3.
 *
 * This handles cases where resume files exist in storage but have no
 * corresponding candidate record in the database:
 * - Historical orphans from before cleanup was implemented
 * - Race conditions (crash between upload and candidate creation)
 * - Failed cleanup during candidate deletion
 * - Manual database modifications that bypass the API
 *
 * Safety measures:
 * - Only deletes files older than 7 days (grace period)
 * - Deletes max 1000 orphaned files per run to prevent runaway cleanup jobs
 * - Scans the full resume prefix so orphaned files cannot hide behind healthy objects
 * - Supports dry-run mode via query parameter
 * - Logs all operations for audit trail
 *
 * Usage:
 * - GET /api/cron/cleanup-orphaned-resumes (performs cleanup)
 * - GET /api/cron/cleanup-orphaned-resumes?dryRun=true (preview only)
 *
 * Security:
 * - Should be protected by CRON_SECRET in production
 */

const GRACE_PERIOD_DAYS = 7
const MAX_FILES_PER_RUN = 1000

interface CleanupResult {
  success: boolean
  dryRun: boolean
  scanned: number
  orphaned: number
  deleted: number
  skippedTooNew: number
  errors: string[]
  deletedKeys: string[]
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  const isLocalEnvironment =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'

  if (!cronSecret && !isLocalEnvironment) {
    console.error('[cleanup-orphaned-resumes] CRON_SECRET is required outside development/test')
    return NextResponse.json(
      { error: 'Cron endpoint is not configured' },
      { status: 503 }
    )
  }

  if (cronSecret) {
    const authHeader = request.headers.get('authorization') ?? ''
    const expected = `Bearer ${cronSecret}`
    const headerBuf = Buffer.from(authHeader)
    const expectedBuf = Buffer.from(expected)
    if (headerBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(headerBuf, expectedBuf)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(request.url)
  const dryRun = searchParams.get('dryRun') === 'true'

  const result: CleanupResult = {
    success: true,
    dryRun,
    scanned: 0,
    orphaned: 0,
    deleted: 0,
    skippedTooNew: 0,
    errors: [],
    deletedKeys: [],
  }

  try {
    // Scan the full resume prefix before applying the deletion cap so orphaned
    // files do not starve behind older healthy objects.
    const s3Files = await listObjects('resumes/')
    result.scanned = s3Files.length

    if (s3Files.length === 0) {
      return NextResponse.json(result)
    }

    // Get all resume keys from the database
    const dbCandidates = await prisma.candidate.findMany({
      where: { resumeKey: { not: null } },
      select: { resumeKey: true },
    })

    const dbKeySet = new Set(
      dbCandidates
        .map((c) => c.resumeKey)
        .filter((key): key is string => key !== null)
    )

    // Calculate grace period threshold
    const gracePeriodMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
    const cutoffDate = new Date(Date.now() - gracePeriodMs)

    // Process each file
    for (const file of s3Files) {
      // Skip files that exist in the database
      if (dbKeySet.has(file.key)) {
        continue
      }

      result.orphaned++

      // Skip files that are too new (within grace period)
      // Also skip files with unknown lastModified to be conservative
      if (!file.lastModified || file.lastModified > cutoffDate) {
        result.skippedTooNew++
        continue
      }

      if (result.deleted >= MAX_FILES_PER_RUN) {
        continue
      }

      // Delete the orphaned file
      if (!dryRun) {
        try {
          await deleteObject(file.key)
          result.deleted++
          result.deletedKeys.push(file.key)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          result.errors.push(`Failed to delete ${file.key}: ${errorMessage}`)
        }
      } else {
        // In dry-run mode, just record what would be deleted
        result.deleted++
        result.deletedKeys.push(file.key)
      }
    }

    // Log summary for monitoring
    console.log(
      `[cleanup-orphaned-resumes] ${dryRun ? 'DRY RUN - ' : ''}` +
        `Scanned: ${result.scanned}, Orphaned: ${result.orphaned}, ` +
        `Deleted: ${result.deleted}/${MAX_FILES_PER_RUN}, Skipped (too new): ${result.skippedTooNew}, ` +
        `Errors: ${result.errors.length}`
    )

    if (result.errors.length > 0) {
      result.success = false
    }

    return NextResponse.json(result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[cleanup-orphaned-resumes] Fatal error: ${errorMessage}`)

    return NextResponse.json(
      {
        ...result,
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}
