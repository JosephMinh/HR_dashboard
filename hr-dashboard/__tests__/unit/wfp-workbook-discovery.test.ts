/**
 * Workbook Discovery Tests
 *
 * Regression coverage for the discoverWorkbook() function in prisma/import-wfp.ts.
 * Ensures the importer's default path resolution is resilient to workbook
 * filename revisions, avoids unrelated .xlsx files, and fails clearly.
 *
 * Bead: hr-tde6.4.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'path'

// We need to mock fs before importing the module under test
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    readdirSync: vi.fn(),
    existsSync: actual.existsSync,
  }
})

// Import after mocks are set up
import * as fs from 'fs'
import { discoverWorkbook } from '../../prisma/import-wfp'

const mockedReaddirSync = vi.mocked(fs.readdirSync)

// The hr-dashboard root from the perspective of prisma/import-wfp.ts
const PRISMA_DIR = path.resolve(__dirname, '../../prisma')
const HR_DASHBOARD_ROOT = path.resolve(PRISMA_DIR, '..')

describe('discoverWorkbook', () => {
  const originalEnv = process.env.WFP_WORKBOOK_PATH

  beforeEach(() => {
    delete process.env.WFP_WORKBOOK_PATH
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WFP_WORKBOOK_PATH = originalEnv
    } else {
      delete process.env.WFP_WORKBOOK_PATH
    }
  })

  // -----------------------------------------------------------------------
  // Env var override
  // -----------------------------------------------------------------------

  describe('WFP_WORKBOOK_PATH env override', () => {
    it('returns absolute env path directly without scanning', () => {
      process.env.WFP_WORKBOOK_PATH = '/custom/path/workbook.xlsx'
      expect(discoverWorkbook()).toBe('/custom/path/workbook.xlsx')
      expect(mockedReaddirSync).not.toHaveBeenCalled()
    })

    it('resolves relative env path against hr-dashboard root', () => {
      process.env.WFP_WORKBOOK_PATH = 'data/my-workbook.xlsx'
      const result = discoverWorkbook()
      expect(result).toBe(path.resolve(HR_DASHBOARD_ROOT, 'data/my-workbook.xlsx'))
      expect(mockedReaddirSync).not.toHaveBeenCalled()
    })

    it('trims whitespace from env var', () => {
      process.env.WFP_WORKBOOK_PATH = '  /trimmed/path.xlsx  '
      expect(discoverWorkbook()).toBe('/trimmed/path.xlsx')
    })

    it('ignores empty env var and falls through to auto-discovery', () => {
      process.env.WFP_WORKBOOK_PATH = '   '
      mockedReaddirSync.mockReturnValue([
        '2026 WFP - Approved.xlsx' as unknown as fs.Dirent,
      ])
      const result = discoverWorkbook()
      expect(result).toBe(path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved.xlsx'))
    })
  })

  // -----------------------------------------------------------------------
  // Auto-discovery: canonical naming pattern
  // -----------------------------------------------------------------------

  describe('auto-discovery from canonical naming pattern', () => {
    it('finds workbook without revision suffix', () => {
      mockedReaddirSync.mockReturnValue([
        '2026 WFP - Approved.xlsx' as unknown as fs.Dirent,
      ])
      expect(discoverWorkbook()).toBe(
        path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved.xlsx'),
      )
    })

    it('finds workbook with revision suffix (1)', () => {
      mockedReaddirSync.mockReturnValue([
        '2026 WFP - Approved (1).xlsx' as unknown as fs.Dirent,
      ])
      expect(discoverWorkbook()).toBe(
        path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved (1).xlsx'),
      )
    })

    it('finds workbook with revision suffix (2)', () => {
      mockedReaddirSync.mockReturnValue([
        '2026 WFP - Approved (2).xlsx' as unknown as fs.Dirent,
      ])
      expect(discoverWorkbook()).toBe(
        path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved (2).xlsx'),
      )
    })

    it('selects highest revision when multiple candidates exist', () => {
      mockedReaddirSync.mockReturnValue([
        '2026 WFP - Approved (1).xlsx' as unknown as fs.Dirent,
        '2026 WFP - Approved (3).xlsx' as unknown as fs.Dirent,
        '2026 WFP - Approved (2).xlsx' as unknown as fs.Dirent,
        '2026 WFP - Approved.xlsx' as unknown as fs.Dirent,
      ])
      expect(discoverWorkbook()).toBe(
        path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved (3).xlsx'),
      )
    })

    it('treats no-suffix version as revision 0 (lowest)', () => {
      mockedReaddirSync.mockReturnValue([
        '2026 WFP - Approved.xlsx' as unknown as fs.Dirent,
        '2026 WFP - Approved (1).xlsx' as unknown as fs.Dirent,
      ])
      expect(discoverWorkbook()).toBe(
        path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved (1).xlsx'),
      )
    })
  })

  // -----------------------------------------------------------------------
  // Unrelated files are ignored
  // -----------------------------------------------------------------------

  describe('unrelated files are ignored', () => {
    it('ignores non-matching xlsx files', () => {
      mockedReaddirSync.mockReturnValue([
        'random-spreadsheet.xlsx' as unknown as fs.Dirent,
        'budget-2026.xlsx' as unknown as fs.Dirent,
        '2026 WFP - Approved (2).xlsx' as unknown as fs.Dirent,
        '2026 WFP - Draft.xlsx' as unknown as fs.Dirent,
      ])
      expect(discoverWorkbook()).toBe(
        path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved (2).xlsx'),
      )
    })

    it('ignores non-xlsx files', () => {
      mockedReaddirSync.mockReturnValue([
        '2026 WFP - Approved (1).csv' as unknown as fs.Dirent,
        '2026 WFP - Approved (2).xlsx' as unknown as fs.Dirent,
        'readme.md' as unknown as fs.Dirent,
      ])
      expect(discoverWorkbook()).toBe(
        path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved (2).xlsx'),
      )
    })

    it('ignores files that partially match the pattern', () => {
      mockedReaddirSync.mockReturnValue([
        '2026 WFP - Approved (abc).xlsx' as unknown as fs.Dirent,
        '2025 WFP - Approved (1).xlsx' as unknown as fs.Dirent,
        '2026 WFP - Approved (1).xlsx' as unknown as fs.Dirent,
      ])
      expect(discoverWorkbook()).toBe(
        path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved (1).xlsx'),
      )
    })
  })

  // -----------------------------------------------------------------------
  // Failure behavior
  // -----------------------------------------------------------------------

  describe('failure behavior', () => {
    it('throws with actionable message when no matching workbook exists', () => {
      mockedReaddirSync.mockReturnValue([
        'unrelated.xlsx' as unknown as fs.Dirent,
        'package.json' as unknown as fs.Dirent,
      ])
      expect(() => discoverWorkbook()).toThrow(/No WFP workbook found/)
      expect(() => discoverWorkbook()).toThrow(/WFP_WORKBOOK_PATH/)
    })

    it('throws with actionable message when directory is empty', () => {
      mockedReaddirSync.mockReturnValue([])
      expect(() => discoverWorkbook()).toThrow(/No WFP workbook found/)
    })

    it('throws when directory cannot be read', () => {
      mockedReaddirSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied')
      })
      expect(() => discoverWorkbook()).toThrow(/Cannot read hr-dashboard root/)
    })
  })

  // -----------------------------------------------------------------------
  // Determinism
  // -----------------------------------------------------------------------

  describe('determinism', () => {
    it('produces same result regardless of file listing order', () => {
      const files = [
        '2026 WFP - Approved (1).xlsx',
        '2026 WFP - Approved (3).xlsx',
        '2026 WFP - Approved (2).xlsx',
      ]

      // Order 1
      mockedReaddirSync.mockReturnValue(
        files.map((f) => f as unknown as fs.Dirent),
      )
      const result1 = discoverWorkbook()

      // Order 2 (reversed)
      mockedReaddirSync.mockReturnValue(
        [...files].reverse().map((f) => f as unknown as fs.Dirent),
      )
      const result2 = discoverWorkbook()

      expect(result1).toBe(result2)
      expect(result1).toBe(
        path.join(HR_DASHBOARD_ROOT, '2026 WFP - Approved (3).xlsx'),
      )
    })
  })
})
