/**
 * Service worker de la app de pozos.
 *
 * Escrito a mano y no con un plugin, por una razón de seguridad concreta:
 * TODAS las páginas de esta app son autenticadas y muestran datos de una finca
 * concreta. Las estrategias de caché por defecto de cualquier plugin guardarían
 * ese HTML en el disco del teléfono. En un celular compartido —o si al usuario
 * le cambian las fincas asignadas— el siguiente vería datos que no le
 * corresponden.
 *
 * REGLA INVIOLABLE DE ESTE ARCHIVO:
 *   Se cachean SOLO recursos estáticos y públicos (JS, CSS, íconos, fuentes).
 *   NUNCA HTML de páginas, respuestas de /api, ni archivos de Storage.
 *
 * Alcance real: la app abre instantáneamente y avisa cuando no hay conexión.
 * La cola de subida offline NO está: hacerla bien (IndexedDB + Background Sync)
 * es un trabajo aparte, y a medias sería peor que no tenerla.
 */

const VERSION = 'v1'
const CACHE_ESTATICO = `estatico-${VERSION}`
const CACHE_OFFLINE = `offline-${VERSION}`

/** Lo mínimo para poder mostrar algo sin red. */
const PRECARGA = ['/offline', '/icons/icon-192.png', '/manifest.webmanifest']

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_OFFLINE)
      // Si algún recurso falla, no se aborta la instalación entera.
      .then((cache) => cache.addAll(PRECARGA).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(
          claves
            .filter((clave) => !clave.endsWith(VERSION))
            .map((clave) => caches.delete(clave)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

/** ¿Es un recurso estático y público, sin datos de nadie? */
function esEstaticoPublico(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest'
  )
}

self.addEventListener('fetch', (evento) => {
  const { request } = evento

  // Solo GET: nunca se toca un POST (login, formularios, subidas).
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Otro origen (Supabase Storage, por ejemplo): pasa derecho, sin caché.
  if (url.origin !== self.location.origin) return

  // Datos de usuario: SIEMPRE a la red, nunca al disco.
  if (url.pathname.startsWith('/api/')) return

  if (esEstaticoPublico(url)) {
    // Los assets de /_next/static tienen hash en el nombre: si están, sirven.
    evento.respondWith(
      caches.match(request).then(
        (enCache) =>
          enCache ??
          fetch(request).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone()
              caches.open(CACHE_ESTATICO).then((cache) => cache.put(request, copia))
            }
            return respuesta
          }),
      ),
    )
    return
  }

  // Navegación a una página: red obligatoria. Si no hay, se muestra el aviso
  // de offline — nunca una página vieja con datos de otra sesión.
  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_OFFLINE)
        const offline = await cache.match('/offline')
        return (
          offline ??
          new Response('Sin conexión', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          })
        )
      }),
    )
  }
})
