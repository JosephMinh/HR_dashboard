import type { UserRole } from "@/generated/prisma/enums";

export type Role = UserRole;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface AuthSession {
  user: SessionUser;
}
