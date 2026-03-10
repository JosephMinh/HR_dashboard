import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnProtectedRoute = nextUrl.pathname === '/' ||
                                 nextUrl.pathname.startsWith('/dashboard') ||
                                 nextUrl.pathname.startsWith('/jobs') ||
                                 nextUrl.pathname.startsWith('/candidates')
      const isOnLogin = nextUrl.pathname.startsWith('/login')

      if (isOnProtectedRoute) {
        if (isLoggedIn) return true
        return false // Redirect to login
      }

      if (isOnLogin && isLoggedIn) {
        return Response.redirect(new URL('/', nextUrl))
      }

      return true
    },
    jwt({ token, user }) {
      if (user && user.id) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as 'ADMIN' | 'RECRUITER' | 'VIEWER'
      }
      return session
    },
  },
  providers: [], // Providers added in auth.ts
  session: {
    strategy: 'jwt',
  },
} satisfies NextAuthConfig
