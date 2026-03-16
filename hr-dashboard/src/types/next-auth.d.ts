import { DefaultSession, DefaultUser } from 'next-auth'
import { DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: 'ADMIN' | 'RECRUITER' | 'VIEWER'
      mustChangePassword: boolean
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    role: 'ADMIN' | 'RECRUITER' | 'VIEWER'
    mustChangePassword: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    role: 'ADMIN' | 'RECRUITER' | 'VIEWER'
    mustChangePassword: boolean
  }
}
