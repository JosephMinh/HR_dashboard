import { describe, expect, it } from "vitest"

import { UserRole } from "@/generated/prisma/enums"
import {
  AuthorizationError,
  Permission,
  canManageUsers,
  canMutate,
  canUploadResume,
  canViewAudit,
  hasPermission,
  requireMutate,
} from "@/lib/permissions"

describe("permissions", () => {
  it("grants admins every permission", () => {
    expect(hasPermission(UserRole.ADMIN, Permission.VIEW_DATA)).toBe(true)
    expect(hasPermission(UserRole.ADMIN, Permission.MUTATE)).toBe(true)
    expect(hasPermission(UserRole.ADMIN, Permission.DELETE)).toBe(true)
    expect(hasPermission(UserRole.ADMIN, Permission.UPLOAD_RESUME)).toBe(true)
    expect(hasPermission(UserRole.ADMIN, Permission.VIEW_AUDIT)).toBe(true)
    expect(hasPermission(UserRole.ADMIN, Permission.MANAGE_USERS)).toBe(true)
  })

  it("limits recruiters to non-admin capabilities", () => {
    expect(canMutate(UserRole.RECRUITER)).toBe(true)
    expect(canUploadResume(UserRole.RECRUITER)).toBe(true)
    expect(canViewAudit(UserRole.RECRUITER)).toBe(false)
    expect(canManageUsers(UserRole.RECRUITER)).toBe(false)
  })

  it("keeps viewers read-only", () => {
    expect(hasPermission(UserRole.VIEWER, Permission.VIEW_DATA)).toBe(true)
    expect(canMutate(UserRole.VIEWER)).toBe(false)
    expect(canUploadResume(UserRole.VIEWER)).toBe(false)
    expect(canViewAudit(UserRole.VIEWER)).toBe(false)
  })

  it("rejects missing roles", () => {
    expect(canMutate(null)).toBe(false)
    expect(canViewAudit(undefined)).toBe(false)
  })

  it("throws a consistent authorization error for blocked mutations", () => {
    expect(() => requireMutate(UserRole.VIEWER)).toThrow(AuthorizationError)
    expect(() => requireMutate(undefined)).toThrow(
      "Only admins and recruiters can create, update, or delete recruiting data.",
    )
  })
})
