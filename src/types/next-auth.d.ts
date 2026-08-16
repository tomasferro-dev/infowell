import type { UserRole } from '@/generated/prisma/enums'
import type { DefaultSession } from 'next-auth'

/**
 * Extiende los tipos de Auth.js con los campos propios del dominio, para que
 * `session.user.role` sea tipado y no `any` en toda la app.
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      role: UserRole
      isActive: boolean
    } & DefaultSession['user']
  }

  interface User {
    role: UserRole
    isActive: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: UserRole
    isActive: boolean
  }
}

// next-auth reexporta el JWT de @auth/core: sin augmentar también este módulo,
// el `token` de los callbacks queda como unknown.
declare module '@auth/core/jwt' {
  interface JWT {
    role: UserRole
    isActive: boolean
  }
}
