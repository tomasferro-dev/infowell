import { NextResponse } from 'next/server'

import { BUCKET_NOTAS_VOZ, BUCKET_REMITOS } from '@/lib/storage-paths'
import { getActor } from '@/server/guards'
import { crearUrlDeSubida } from '@/server/storage'

/**
 * Chequeo de configuración de Storage. Solo para el administrador.
 *
 * Existe porque un fallo de subida se ve igual desde el celular sea cual sea
 * la causa: bucket inexistente, clave equivocada o URL mal cargada. Esto lo
 * distingue en una pantalla, sin revisar logs.
 *
 * NUNCA devuelve el valor de una variable: solo si está presente y si funciona.
 */
export async function GET() {
  const actor = await getActor()

  // Solo ADMIN: revela qué está configurado y qué no.
  if (!actor || actor.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const variables = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    AUTH_SECRET: !!process.env.AUTH_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  /** Pide una URL firmada de prueba: es exactamente lo que hace la app al subir. */
  async function probarBucket(bucket: string) {
    try {
      await crearUrlDeSubida(bucket, `diagnostico/prueba-${Date.now()}.txt`)
      // Firmar no crea el archivo: la URL se descarta sin usarla.
      return { ok: true as const }
    } catch (error) {
      return {
        ok: false as const,
        motivo: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const [remitos, notasVoz] = await Promise.all([
    probarBucket(BUCKET_REMITOS),
    probarBucket(BUCKET_NOTAS_VOZ),
  ])

  const todoBien = Object.values(variables).every(Boolean) && remitos.ok && notasVoz.ok

  return NextResponse.json({
    todoBien,
    variables,
    buckets: { [BUCKET_REMITOS]: remitos, [BUCKET_NOTAS_VOZ]: notasVoz },
    ayuda: todoBien
      ? 'Storage está bien configurado.'
      : 'Revisá las variables en false y el motivo de cada bucket que falle.',
  })
}
