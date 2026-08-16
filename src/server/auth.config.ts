import Google from 'next-auth/providers/google'
import type { NextAuthConfig } from 'next-auth'

/**
 * Config compartida entre el middleware (edge) y el runtime completo.
 *
 * ACÁ NO PUEDE ENTRAR PRISMA: este módulo lo carga el middleware, que corre en
 * el runtime edge, donde el driver de Postgres no existe. El adapter y el
 * provider de credenciales viven en auth.ts, que solo se importa desde Node.
 */

// Google se registra solo si hay credenciales cargadas. Sin este guard,
// Auth.js aborta el arranque cuando las variables están vacías — y hoy lo
// están, porque el OAuth se configura más adelante.
const googleProvider = process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET ? [Google] : []

export const authConfig = {
  providers: [...googleProvider],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    // Obligatorio con el provider de credenciales, y además evita que el
    // middleware tenga que consultar la base para validar la sesión.
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 días: el operario no debería re-loguearse en cada visita
  },
  callbacks: {
    /**
     * El rol viaja en el token. La lista de fincas NO: se resuelve fresca en
     * cada request (ver getActor en guards.ts), para que revocar el acceso de
     * un cliente tenga efecto inmediato y no al vencer su sesión.
     */
    jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.isActive = user.isActive
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ''
        session.user.role = token.role
        session.user.isActive = token.isActive
      }
      return session
    },
  },
} satisfies NextAuthConfig
