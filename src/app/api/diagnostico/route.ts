import { NextResponse } from 'next/server'

import { BUCKET_NOTAS_VOZ, BUCKET_REMITOS } from '@/lib/storage-paths'
import { getActor } from '@/server/guards'
import { crearUrlDeSubida } from '@/server/storage'

/**
 * Chequeo de configuración de Storage. Solo para el administrador.
 *
 * Existe porque un fallo de subida se ve igual desde el celular sea cual sea
 * la causa. Esto separa las tres que importan: la variable no está, está mal
 * escrita, o la clave no sirve.
 *
 * NUNCA devuelve el valor de un secreto: de la clave informa formato y largo,
 * que alcanzan para saber si es la correcta sin exponerla.
 */

/** Detecta problemas de copiado que no se ven a simple vista en un panel. */
function revisarTexto(valor: string | undefined) {
  if (!valor) return { presente: false as const }

  return {
    presente: true as const,
    largo: valor.length,
    // El error más común al pegar en Vercel: se cuela un espacio o un salto
    // de línea, y la URL deja de resolver.
    espaciosAlBorde: valor !== valor.trim(),
    comillas: /^["']|["']$/.test(valor),
    saltosDeLinea: /[\r\n]/.test(valor),
  }
}

/**
 * Identifica la clave por su prefijo, sin revelarla.
 * `sb_publishable_` es el error clásico: parece una clave secreta pero no
 * puede firmar subidas.
 */
function formatoDeClave(valor: string | undefined) {
  if (!valor) return 'ausente'
  const v = valor.trim()

  if (v.startsWith('sb_secret_')) return 'secreta nueva (correcta)'
  if (v.startsWith('sb_publishable_')) return 'PUBLICABLE — no sirve para firmar subidas'
  if (v.startsWith('eyJ')) return 'JWT legacy (service_role o anon)'
  return 'desconocido'
}

export async function GET() {
  const actor = await getActor()

  if (!actor || actor.role !== 'ADMIN') {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const urlCruda = process.env.NEXT_PUBLIC_SUPABASE_URL
  const claveCruda = process.env.SUPABASE_SERVICE_ROLE_KEY

  // La URL es pública por definición (NEXT_PUBLIC_): se muestra entera, que es
  // lo que permite ver de un vistazo si está mal escrita.
  const url = {
    valor: urlCruda ?? null,
    ...revisarTexto(urlCruda),
    empiezaConHttps: urlCruda?.trim().startsWith('https://') ?? false,
    barraFinal: urlCruda?.trim().endsWith('/') ?? false,
  }

  const clave = {
    ...revisarTexto(claveCruda),
    formato: formatoDeClave(claveCruda),
  }

  /**
   * Llamada directa a la API de Storage, sin la librería.
   * Separa el fallo de red del de permisos: si esto devuelve un status HTTP,
   * la URL resuelve y el problema es la clave; si tira excepción, la petición
   * nunca salió y el problema es la URL.
   */
  async function probarConexion() {
    if (!urlCruda || !claveCruda) return { alcanzada: false, motivo: 'faltan variables' }

    try {
      const respuesta = await fetch(`${urlCruda.trim().replace(/\/$/, '')}/storage/v1/bucket`, {
        headers: { apikey: claveCruda.trim(), authorization: `Bearer ${claveCruda.trim()}` },
      })

      return {
        alcanzada: true,
        status: respuesta.status,
        interpretacion:
          respuesta.status === 200
            ? 'La URL y la clave funcionan.'
            : respuesta.status === 401 || respuesta.status === 403
              ? 'La URL resuelve, pero la clave no tiene permiso. Revisá que sea la secreta.'
              : `Respuesta inesperada (${respuesta.status}).`,
      }
    } catch (error) {
      return {
        alcanzada: false,
        motivo: error instanceof Error ? error.message : String(error),
        interpretacion:
          'La petición no llegó a salir. Es la URL: revisá que no tenga comillas, espacios ni barra final.',
      }
    }
  }

  /** Pide una URL firmada: exactamente lo que hace la app al subir. */
  async function probarBucket(bucket: string) {
    try {
      // Firmar no crea el archivo: la URL se descarta sin usarla.
      await crearUrlDeSubida(bucket, `diagnostico/prueba-${Date.now()}.txt`)
      return { ok: true as const }
    } catch (error) {
      return {
        ok: false as const,
        motivo: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const [conexion, remitos, notasVoz] = await Promise.all([
    probarConexion(),
    probarBucket(BUCKET_REMITOS),
    probarBucket(BUCKET_NOTAS_VOZ),
  ])

  const todoBien = remitos.ok && notasVoz.ok

  return NextResponse.json({
    todoBien,
    variables: {
      DATABASE_URL: !!process.env.DATABASE_URL,
      AUTH_SECRET: !!process.env.AUTH_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: clave,
    },
    conexion,
    buckets: { [BUCKET_REMITOS]: remitos, [BUCKET_NOTAS_VOZ]: notasVoz },
  })
}
