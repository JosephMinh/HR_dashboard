/**
 * Password policy validation utilities.
 *
 * Single source of truth for password requirements across admin create/reset,
 * self-change, seeding, and UI display.
 */

import crypto from 'crypto'

import z from 'zod'

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 12

export const PASSWORD_REQUIREMENTS = [
  { key: 'minLength', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (pw: string) => pw.length >= PASSWORD_MIN_LENGTH },
  { key: 'uppercase', label: 'At least one uppercase letter', test: (pw: string) => /[A-Z]/.test(pw) },
  { key: 'lowercase', label: 'At least one lowercase letter', test: (pw: string) => /[a-z]/.test(pw) },
  { key: 'number', label: 'At least one number', test: (pw: string) => /\d/.test(pw) },
  { key: 'symbol', label: 'At least one symbol', test: (pw: string) => /[^A-Za-z0-9]/.test(pw) },
] as const

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .refine((pw) => /[A-Z]/.test(pw), { message: 'Password must contain at least one uppercase letter' })
  .refine((pw) => /[a-z]/.test(pw), { message: 'Password must contain at least one lowercase letter' })
  .refine((pw) => /\d/.test(pw), { message: 'Password must contain at least one number' })
  .refine((pw) => /[^A-Za-z0-9]/.test(pw), { message: 'Password must contain at least one symbol' })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an array of unmet requirement labels for real-time UI hints. */
export function getUnmetRequirements(password: string): string[] {
  return PASSWORD_REQUIREMENTS
    .filter((req) => !req.test(password))
    .map((req) => req.label)
}

// Character pools for temp password generation
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{}|;:,.<>?'
const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS

function randomChar(pool: string): string {
  const index = crypto.randomInt(pool.length)
  return pool[index]!
}

/**
 * Generate a temporary password that satisfies all policy requirements.
 * Uses crypto.randomBytes / crypto.randomInt for cryptographic randomness.
 */
export function generateTempPassword(length: number = 16): string {
  if (length < PASSWORD_MIN_LENGTH) {
    length = PASSWORD_MIN_LENGTH
  }

  // Guarantee at least one of each required class
  const required = [
    randomChar(UPPERCASE),
    randomChar(LOWERCASE),
    randomChar(DIGITS),
    randomChar(SYMBOLS),
  ]

  // Fill remaining with random chars from the full pool
  const remaining = Array.from({ length: length - required.length }, () => randomChar(ALL_CHARS))

  // Combine and shuffle using Fisher-Yates
  const chars = [...required, ...remaining]
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }

  return chars.join('')
}
