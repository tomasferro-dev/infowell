import { NextResponse } from 'next/server'

import { interpretarRuta, recursoDeBucket } from '@/lib/storage-paths'
import { authorize } from '@/server/authz'
import { getActor } from '@/server/guards'
import { crearUrlDeLectura } from '@/server/storage'

/**
 * Sirve un archivo privado: valida el permiso y redirige a una URL firmada.
 *
 * El permiso se recalcula en CADA pedido. Por eso la app nunca guarda URLs
 * firmadas en la base: si lo hiciera, revocarle el acceso a un cliente no
 * invalidaría los enlaces que ya tiene.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bucket: string; ruta: string[] }> },
) {
  const { bucket, ruta } = await params

  // Bucket desconocido: no se sirve nada. Sale de la misma tabla que las
  // subidas, así que agregar un bucket no deja esta ruta atrás.
  const recurso = recursoDeBucket(bucket)
  if (!recurso) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const actor = await getActor()
  if (!actor) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const rutaCompleta = ruta.join('/')
  const partes = interpretarRuta(rutaCompleta)

  // Ruta malformada o con salto de directorio: no se devuelve nada.
  if (!partes) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  if (!authorize(actor, 'read', recurso, partes.farmId)) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const firmada = await crearUrlDeLectura(bucket, rutaCompleta)
  if (!firmada) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // 307 para que el navegador siga el redirect conservando el método.
  return NextResponse.redirect(firmada, 307)
}
