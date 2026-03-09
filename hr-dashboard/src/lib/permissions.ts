import { UserRole } from "@/generated/prisma/enums";
import type { Role } from "@/types/auth";

export const Permission = {
  VIEW_DATA: "viewData",
  MUTATE: "mutate",
  DELETE: "delete",
  UPLOAD_RESUME: "uploadResume",
  VIEW_AUDIT: "viewAudit",
  MANAGE_USERS: "manageUsers",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

type RolePermissions = Record<Permission, boolean>;
type RoleLike = Role | null | undefined;

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  readonly status = 403;

  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
  [UserRole.ADMIN]: {
    [Permission.VIEW_DATA]: true,
    [Permission.MUTATE]: true,
    [Permission.DELETE]: true,
    [Permission.UPLOAD_RESUME]: true,
    [Permission.VIEW_AUDIT]: true,
    [Permission.MANAGE_USERS]: true,
  },
  [UserRole.RECRUITER]: {
    [Permission.VIEW_DATA]: true,
    [Permission.MUTATE]: true,
    [Permission.DELETE]: true,
    [Permission.UPLOAD_RESUME]: true,
    [Permission.VIEW_AUDIT]: false,
    [Permission.MANAGE_USERS]: false,
  },
  [UserRole.VIEWER]: {
    [Permission.VIEW_DATA]: true,
    [Permission.MUTATE]: false,
    [Permission.DELETE]: false,
    [Permission.UPLOAD_RESUME]: false,
    [Permission.VIEW_AUDIT]: false,
    [Permission.MANAGE_USERS]: false,
  },
};

export function hasPermission(
  role: RoleLike,
  permission: Permission,
): boolean {
  if (!role) {
    return false;
  }

  return ROLE_PERMISSIONS[role][permission];
}

export function canMutate(role: RoleLike): boolean {
  return hasPermission(role, Permission.MUTATE);
}

export function requireMutate(role: RoleLike): asserts role is Role {
  if (!canMutate(role)) {
    throw new AuthorizationError(
      "Only admins and recruiters can create, update, or delete recruiting data.",
    );
  }
}

export function canViewAudit(role: RoleLike): boolean {
  return hasPermission(role, Permission.VIEW_AUDIT);
}

export function canManageUsers(role: RoleLike): boolean {
  return hasPermission(role, Permission.MANAGE_USERS);
}

export function canDelete(role: RoleLike): boolean {
  return hasPermission(role, Permission.DELETE);
}

export function canUploadResume(role: RoleLike): boolean {
  return hasPermission(role, Permission.UPLOAD_RESUME);
}
