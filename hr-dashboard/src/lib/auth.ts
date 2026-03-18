import NextAuth from 'next-auth'
import type { Session, User } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import Credentials from 'next-auth/providers/credentials'
import { compare, hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { authConfig } from './auth.config'

// Pre-computed dummy hash for constant-time comparison when user is not found.
// Prevents timing attacks that could enumerate valid email addresses.
let _dummyHash: string | null = null
async function getDummyHash(): Promise<string> {
  if (!_dummyHash) {
    _dummyHash = await hash('dummy-password-for-timing-safety', 10)
  }
  return _dummyHash
}

const SESSION_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  mustChangePassword: true,
} as const

export async function refreshJwtTokenFromDatabase(token: JWT): Promise<JWT | null> {
  const userId =
    (typeof token.id === 'string' && token.id.length > 0 ? token.id : null) ??
    (typeof token.sub === 'string' && token.sub.length > 0 ? token.sub : null)

  if (!userId) {
    return token
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: SESSION_USER_SELECT,
  })

  if (!user || !user.active) {
    return null
  }

  token.sub = user.id
  token.id = user.id
  token.email = user.email
  token.name = user.name
  token.role = user.role
  token.mustChangePassword = user.mustChangePassword

  return token
}

const authCallbacks = {
  ...authConfig.callbacks,
  async jwt({ token, user }: { token: JWT; user?: User }) {
    if (user?.id) {
      token.sub = user.id
      token.id = user.id
      token.email = user.email
      token.name = user.name
      token.role = user.role
      token.mustChangePassword = user.mustChangePassword ?? false
    }

    return refreshJwtTokenFromDatabase(token)
  },
  session({ session, token }: { session: Session; token: JWT }) {
    if (session.user) {
      session.user.id = token.id as string
      session.user.name = token.name as string
      session.user.email = token.email as string
      session.user.role = token.role as 'ADMIN' | 'RECRUITER' | 'VIEWER'
      session.user.mustChangePassword = token.mustChangePassword as boolean
    }
    return session
  },
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: authCallbacks,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = (credentials.email as string).toLowerCase().trim()
        const password = credentials.password as string

        const user = await prisma.user.findUnique({
          where: { email },
        })

        if (!user || !user.active) {
          // Perform a dummy comparison to prevent timing-based email enumeration.
          // Without this, "user not found" returns ~instantly while "wrong password"
          // takes ~250ms (bcrypt cost), letting attackers distinguish the two.
          await compare(password, await getDummyHash())
          return null
        }

        const isPasswordValid = await compare(password, user.passwordHash)

        if (!isPasswordValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        }
      },
    }),
  ],
})
