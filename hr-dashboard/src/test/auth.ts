import type { Session } from "next-auth"

import { UserRole } from "@/generated/prisma/enums"

type MockSessionOverrides = Partial<Session["user"]>

export function createMockSession(
  overrides: MockSessionOverrides = {},
): Session {
  return {
    expires: "2999-01-01T00:00:00.000Z",
    user: {
      id: "test-user-id",
      name: "Test Recruiter",
      email: "test.recruiter@company.com",
      role: UserRole.RECRUITER,
      ...overrides,
    },
  }
}
