import NextAuth from 'next-auth'

import { authConfig } from '@/server/auth.config'

/**
 * Chequeo liviano: ¿hay sesión? Nada más.
 *
 * Corre en el edge, así que NO puede tocar la base — por eso usa authConfig y
 * no auth.ts. El permiso real (rol + finca) se valida server-side en cada
 * action y query vía guards.ts. Este middleware es comodidad de navegación,
 * no una barrera de seguridad.
 */
const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  const isAuthPage = pathname === '/login'

  if (isAuthPage) {
    if (isLoggedIn) return Response.redirect(new URL('/', req.nextUrl))
    return
  }

  if (!isLoggedIn) {
    // Se preserva el destino para volver ahí después del login.
    const callbackUrl = encodeURIComponent(pathname + req.nextUrl.search)
    return Response.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, req.nextUrl))
  }
})

export const config = {
  /**
   * Excluye /api/auth, los assets de Next y todo lo de la PWA.
   *
   * `sw.js` y `offline` TIENEN que quedar afuera: el service worker se
   * descarga sin sesión (si el middleware lo redirige al login, no se registra
   * nunca) y la página offline es justamente la que se muestra cuando no se
   * puede consultar la sesión.
   */
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico|icons|offline|sw.js|manifest.webmanifest).*)',
  ],
}
