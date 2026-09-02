import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Acceso a Supabase Storage. Los buckets son PRIVADOS: nada se sirve por URL
 * pública, todo pasa por una URL firmada de vida corta que se emite recién
 * después de validar el permiso sobre la finca.
 *
 * Usa la clave de servicio, así que este módulo es server-only y nunca debe
 * importarse desde un Client Component.
 */

let cliente: SupabaseClient | undefined

/**
 * Crea el cliente la PRIMERA VEZ QUE SE USA, no al importar el módulo.
 *
 * Esto no es un detalle de estilo: `next build` importa cada ruta para
 * recolectar sus datos, así que un error lanzado en el cuerpo del módulo
 * rompe el build entero. Y estas credenciales son de ejecución, no de
 * compilación — el build no tiene por qué necesitarlas.
 *
 * Si faltan, ahora falla el request que las necesitaba, con un mensaje claro,
 * en vez de caerse el deploy.
 */
function storage() {
  if (cliente) return cliente

  const url = limpiar(process.env.SUPABASE_URL)?.replace(/\/+$/, '')
  const serviceKey = limpiar(process.env.SUPABASE_SERVICE_ROLE_KEY)

  if (!url || !serviceKey) {
    throw new Error(
      'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para usar Storage.',
    )
  }

  cliente = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return cliente
}

/**
 * Saca espacios, saltos de línea y comillas envolventes.
 *
 * Pegar una variable en un panel web arrastra basura invisible con facilidad,
 * y una URL con un salto de línea al final no resuelve: el error que sale es
 * "fetch failed", que no dice nada sobre la causa real.
 */
function limpiar(valor: string | undefined): string | undefined {
  if (!valor) return undefined

  const limpio = valor.trim().replace(/^["']|["']$/g, '').trim()
  return limpio === '' ? undefined : limpio
}

/**
 * URL firmada para que el NAVEGADOR suba el archivo directo a Storage.
 *
 * La subida no pasa por el servidor a propósito: evita el límite de tamaño de
 * las Server Actions y no consume ancho de banda de Vercel con audio y fotos.
 */
export async function crearUrlDeSubida(bucket: string, ruta: string) {
  const { data, error } = await storage().storage.from(bucket).createSignedUploadUrl(ruta)

  if (error || !data) {
    throw new Error(`No se pudo preparar la subida: ${error?.message ?? 'sin datos'}`)
  }

  return { signedUrl: data.signedUrl, ruta: data.path }
}

/** URL firmada de lectura. Vida corta: es un permiso, no un enlace permanente. */
export async function crearUrlDeLectura(bucket: string, ruta: string, segundos = 60 * 10) {
  const { data, error } = await storage().storage.from(bucket).createSignedUrl(ruta, segundos)

  if (error || !data) return null
  return data.signedUrl
}

export async function borrarArchivo(bucket: string, ruta: string) {
  await storage().storage.from(bucket).remove([ruta])
}
