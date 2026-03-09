import { describe, expect, test } from "bun:test";

import { UserRole } from "@/generated/prisma/enums";
import {
  AuthorizationError,
  Permission,
  canManageUsers,
  canMutate,
  canUploadResume,
  canViewAudit,
  hasPermission,
  requireMutate,
} from "@/lib/permissions";

describe("permissions", () => {
  test("admins have every defined permission", () => {
    expect(hasPermission(UserRole.ADMIN, Permission.VIEW_DATA)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, Permission.MUTATE)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, Permission.DELETE)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, Permission.UPLOAD_RESUME)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, Permission.VIEW_AUDIT)).toBe(true);
    expect(hasPermission(UserRole.ADMIN, Permission.MANAGE_USERS)).toBe(true);
  });

  test("recruiters can mutate but cannot access admin-only features", () => {
    expect(canMutate(UserRole.RECRUITER)).toBe(true);
    expect(canUploadResume(UserRole.RECRUITER)).toBe(true);
    expect(canViewAudit(UserRole.RECRUITER)).toBe(false);
    expect(canManageUsers(UserRole.RECRUITER)).toBe(false);
  });

  test("viewers are read-only", () => {
    expect(hasPermission(UserRole.VIEWER, Permission.VIEW_DATA)).toBe(true);
    expect(canMutate(UserRole.VIEWER)).toBe(false);
    expect(canUploadResume(UserRole.VIEWER)).toBe(false);
    expect(canViewAudit(UserRole.VIEWER)).toBe(false);
  });

  test("missing roles are denied by default", () => {
    expect(canMutate(null)).toBe(false);
    expect(canViewAudit(undefined)).toBe(false);
  });

  test("requireMutate throws a user-friendly authorization error", () => {
    expect(() => requireMutate(UserRole.VIEWER)).toThrow(AuthorizationError);
    expect(() => requireMutate(undefined)).toThrow(
      "Only admins and recruiters can create, update, or delete recruiting data.",
    );
  });

  test("requireMutate allows admins and recruiters", () => {
    expect(() => requireMutate(UserRole.ADMIN)).not.toThrow();
    expect(() => requireMutate(UserRole.RECRUITER)).not.toThrow();
  });
});
