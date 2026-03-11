/**
 * Simple validation functions for input validation.
 * These are pure functions that don't depend on zod or other schema libraries,
 * making them easy to mock in tests.
 */

// UUID validation regex (matches standard UUID v4 format)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validates if a string is a valid UUID format.
 * Used for validating route params and foreign key references.
 */
export function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Email validation regex - more robust than basic patterns.
 * Validates:
 * - Exactly one @ symbol
 * - Local part allows alphanumeric, dots, underscores, hyphens, plus signs
 * - Domain part requires valid hostname format
 * - TLD must be at least 2 characters
 */
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/

/**
 * Validates if a string is a valid email format.
 * More robust than simple regex - checks for:
 * - Single @ symbol
 * - Valid local part characters
 * - Valid domain format
 * - TLD at least 2 chars
 */
export function isValidEmail(email: string): boolean {
  if (email.length > 254) return false // RFC 5321 max length
  return EMAIL_REGEX.test(email)
}
