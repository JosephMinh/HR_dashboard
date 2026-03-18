import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/lib/auth.config'
import { enforceApiRateLimit } from '@/lib/rate-limit'

const { auth } = NextAuth(authConfig)

export default auth(async (request) => {
  const rateLimitResponse = await enforceApiRateLimit(request)
  if (rateLimitResponse) {
    return rateLimitResponse
  }

  const authorized = authConfig.callbacks?.authorized?.({
    request,
    auth: request.auth,
  })

  if (authorized instanceof Response) {
    return authorized
  }

  if (authorized === false) {
    const signInPage = authConfig.pages?.signIn ?? '/login'
    if (request.nextUrl.pathname !== signInPage) {
      const signInUrl = request.nextUrl.clone()
      signInUrl.pathname = signInPage
      signInUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search)
      return NextResponse.redirect(signInUrl)
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
