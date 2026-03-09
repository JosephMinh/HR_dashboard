import type { ReactElement } from "react"

import { render } from "@testing-library/react"
import { SessionProvider } from "next-auth/react"
import type { Session } from "next-auth"

import { createMockSession } from "@/test/auth"

interface RenderWithSessionOptions {
  session?: Session
}

export function renderWithSession(
  ui: ReactElement,
  options: RenderWithSessionOptions = {},
) {
  const session = options.session ?? createMockSession()

  return render(<SessionProvider session={session}>{ui}</SessionProvider>)
}
