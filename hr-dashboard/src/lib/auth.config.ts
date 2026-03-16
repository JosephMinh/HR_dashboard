import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  // Intentionally rely on Auth.js default host-only, httpOnly cookies with
  // SameSite=Lax and secure-on-HTTPS behavior. Do not add custom cookie
  // overrides or skipCSRFCheck without updating the security documentation and
  // re-reviewing the application's CSRF posture.
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const pathname = nextUrl.pathname
      const isOnProtectedRoute = pathname === '/' ||
                                 pathname.startsWith('/dashboard') ||
                                 pathname.startsWith('/jobs') ||
                                 pathname.startsWith('/candidates') ||
                                 pathname.startsWith('/admin') ||
                                 pathname.startsWith('/settings')
      const isOnLogin = pathname.startsWith('/login')

      if (isOnProtectedRoute) {
        if (!isLoggedIn) return false // Redirect to login

        // Gate temp-password users to the password change page.
        // Allow: /settings/password, /login, /api/auth/*, /api/users/me/password
        const mustChangePassword = auth?.user?.mustChangePassword === true
        if (mustChangePassword) {
          const allowed =
            pathname === '/settings/password' ||
            pathname.startsWith('/api/auth') ||
            pathname === '/api/users/me/password'

          if (!allowed) {
            return Response.redirect(new URL('/settings/password', nextUrl))
          }
        }

        return true
      }

      if (isOnLogin && isLoggedIn) {
        return Response.redirect(new URL('/', nextUrl))
      }

      return true
    },
  },
  providers: [], // Providers added in auth.ts
  session: {
    strategy: 'jwt',
    maxAge: 4 * 60 * 60, // 4 hours - shorter session for security
  },
} satisfies NextAuthConfig
