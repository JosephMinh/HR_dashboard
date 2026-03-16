import { describe, it, expect } from 'vitest'

import {
  PasswordSchema,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS,
  getUnmetRequirements,
  generateTempPassword,
} from '@/lib/validations/password'

import type { AuditAction } from '@/lib/audit'

describe('Password Policy', () => {
  describe('PasswordSchema', () => {
    it('accepts a valid password with all character classes', () => {
      const result = PasswordSchema.safeParse('Str0ng!Pass99')
      expect(result.success).toBe(true)
    })

    it('accepts a password at exactly the minimum length', () => {
      // 12 chars: uppercase, lowercase, digit, symbol
      const result = PasswordSchema.safeParse('Abcdef1!xxxx')
      expect(result.success).toBe(true)
    })

    it('rejects a password shorter than minimum length', () => {
      const result = PasswordSchema.safeParse('Ab1!short')
      expect(result.success).toBe(false)
    })

    it('rejects an empty string', () => {
      const result = PasswordSchema.safeParse('')
      expect(result.success).toBe(false)
    })

    it('rejects a password missing uppercase letters', () => {
      const result = PasswordSchema.safeParse('alllowercase1!')
      expect(result.success).toBe(false)
    })

    it('rejects a password missing lowercase letters', () => {
      const result = PasswordSchema.safeParse('ALLUPPERCASE1!')
      expect(result.success).toBe(false)
    })

    it('rejects a password missing numbers', () => {
      const result = PasswordSchema.safeParse('NoNumbers!Here')
      expect(result.success).toBe(false)
    })

    it('rejects a password missing symbols', () => {
      const result = PasswordSchema.safeParse('NoSymbols1Here')
      expect(result.success).toBe(false)
    })
  })

  describe('PASSWORD_MIN_LENGTH', () => {
    it('is 12', () => {
      expect(PASSWORD_MIN_LENGTH).toBe(12)
    })
  })

  describe('PASSWORD_REQUIREMENTS', () => {
    it('has 5 requirements', () => {
      expect(PASSWORD_REQUIREMENTS).toHaveLength(5)
    })

    it('each requirement has key, label, and test function', () => {
      for (const req of PASSWORD_REQUIREMENTS) {
        expect(req.key).toBeTruthy()
        expect(req.label).toBeTruthy()
        expect(typeof req.test).toBe('function')
      }
    })
  })

  describe('getUnmetRequirements', () => {
    it('returns empty array for a valid password', () => {
      expect(getUnmetRequirements('Str0ng!Pass99')).toEqual([])
    })

    it('returns all requirements for an empty string', () => {
      const unmet = getUnmetRequirements('')
      expect(unmet).toHaveLength(5)
    })

    it('returns only the missing requirement for a partial password', () => {
      // Missing only symbol
      const unmet = getUnmetRequirements('NoSymbols1Here')
      expect(unmet).toHaveLength(1)
      expect(unmet[0]).toMatch(/symbol/i)
    })

    it('returns missing uppercase and number requirements', () => {
      // lowercase + symbol only, long enough
      const unmet = getUnmetRequirements('alllowercase!!')
      expect(unmet).toHaveLength(2)
      const labels = unmet.join(' ')
      expect(labels).toMatch(/uppercase/i)
      expect(labels).toMatch(/number/i)
    })
  })

  describe('generateTempPassword', () => {
    it('generates a password of default length (16)', () => {
      const pw = generateTempPassword()
      expect(pw.length).toBe(16)
    })

    it('generates a password of custom length', () => {
      const pw = generateTempPassword(20)
      expect(pw.length).toBe(20)
    })

    it('enforces minimum length even if requested length is too short', () => {
      const pw = generateTempPassword(4)
      expect(pw.length).toBeGreaterThanOrEqual(PASSWORD_MIN_LENGTH)
    })

    it('passes policy validation on every invocation (100x)', () => {
      for (let i = 0; i < 100; i++) {
        const pw = generateTempPassword()
        const result = PasswordSchema.safeParse(pw)
        if (!result.success) {
          // Include the failing password for debugging
          expect.fail(`Generated password "${pw}" failed validation: ${result.error.message}`)
        }
      }
    })

    it('contains all required character classes', () => {
      const pw = generateTempPassword()
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/\d/)
      expect(pw).toMatch(/[^A-Za-z0-9]/)
    })
  })

  describe('Audit actions', () => {
    it('USER_PASSWORD_CHANGED is a valid AuditAction', () => {
      const action: AuditAction = 'USER_PASSWORD_CHANGED'
      expect(action).toBe('USER_PASSWORD_CHANGED')
    })

    it('USER_PASSWORD_RESET is a valid AuditAction', () => {
      const action: AuditAction = 'USER_PASSWORD_RESET'
      expect(action).toBe('USER_PASSWORD_RESET')
    })
  })
})
