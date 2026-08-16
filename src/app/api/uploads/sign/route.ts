import { NextResponse } from 'next/server'
import { z } from 'zod'

import {
  BUCKET_NOTAS_VOZ,
  BUCKET_REMITOS,
  construirRuta,
  extensionDeImagen,
  extensionDeMime,
  mimeAudioPermitido,
  mimeImagenPermitido,
} from '@/lib/storage-paths'
import { authorize } from '@/server/authz'
import { getActor } from '@/server/guards'
import { crearUrlDeSubida } from '@/server/storage'

/**
 * Emite una URL firmada de subida.
 *
 * Es el único punto por donde entran archivos, así que acá se decide TODO:
 * quién puede escribir en esa finca, qué tipo de archivo se acepta y en qué
 * ruta va a quedar. La ruta la arma el servidor — nunca la manda el cliente.
 */

const cuerpoSchema = z.object({
  tipo: z.enum(['nota-voz', 'remito']),
  farmId: z.string().min(1),
  /** Pozo o remito al que pertenece. Solo agrupa: el permiso sale del farmId. */
  recursoId: z.string().min(1),
  mimeType: z.string().min(1),
})

export async function POST(request: Request) {
  const actor = await getActor()
  if (!actor) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  const parsed = cuerpoSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  const { tipo, farmId, recursoId, mimeType } = parsed.data

  // Cada tipo de archivo cuelga de un recurso distinto, y el permiso también:
  // el cargador puede escribir remitos pero no notas de voz.
  const recurso = tipo === 'nota-voz' ? 'observation' : 'receipt'

  if (!authorize(actor, 'write', recurso, farmId)) {
    // 404 y no 403: no se confirma que la finca exista.
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  const esAudio = tipo === 'nota-voz'
  const permitido = esAudio ? mimeAudioPermitido(mimeType) : mimeImagenPermitido(mimeType)

  if (!permitido) {
    return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 })
  }

  const bucket = esAudio ? BUCKET_NOTAS_VOZ : BUCKET_REMITOS
  const ext = esAudio ? extensionDeMime(mimeType) : extensionDeImagen(mimeType)

  try {
    const ruta = construirRuta({ farmId, recursoId, ext })
    const { signedUrl } = await crearUrlDeSubida(bucket, ruta)

    return NextResponse.json({ signedUrl, ruta })
  } catch {
    return NextResponse.json({ error: 'No se pudo preparar la subida' }, { status: 400 })
  }
}
