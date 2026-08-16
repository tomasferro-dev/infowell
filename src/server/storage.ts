import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * Acceso a Supabase Storage. Los buckets son PRIVADOS: nada se sirve por URL
 * pública, todo pasa por una URL firmada de vida corta que se emite recién
 * después de validar el permiso sobre la finca.
 *
 * Usa la clave de servicio, así que este módulo es server-only y nunca debe
 * importarse desde un Client Component.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  throw new Error(
    'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY para usar Storage.',
  )
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * URL firmada para que el NAVEGADOR suba el archivo directo a Storage.
 *
 * La subida no pasa por el servidor a propósito: evita el límite de tamaño de
 * las Server Actions y no consume ancho de banda de Vercel con audio y fotos.
 */
export async function crearUrlDeSubida(bucket: string, ruta: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(ruta)

  if (error || !data) {
    throw new Error(`No se pudo preparar la subida: ${error?.message ?? 'sin datos'}`)
  }

  return { signedUrl: data.signedUrl, ruta: data.path }
}

/** URL firmada de lectura. Vida corta: es un permiso, no un enlace permanente. */
export async function crearUrlDeLectura(bucket: string, ruta: string, segundos = 60 * 10) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(ruta, segundos)

  if (error || !data) return null
  return data.signedUrl
}

export async function borrarArchivo(bucket: string, ruta: string) {
  await supabase.storage.from(bucket).remove([ruta])
}
