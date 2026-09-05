import { NextResponse } from 'next/server'
import { z } from 'zod'

import { SUBIDAS, TIPOS_DE_SUBIDA, construirRuta } from '@/lib/storage-paths'
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
  tipo: z.enum(TIPOS_DE_SUBIDA),
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

  // Cada tipo cuelga de un recurso, un bucket y una lista de mimes distintos.
  // La tabla vive en storage-paths.ts y está cubierta por sus tests: acá solo
  // se la consulta.
  const config = SUBIDAS[tipo]

  if (!authorize(actor, 'write', config.recurso, farmId)) {
    // 404 y no 403: no se confirma que la finca exista.
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  if (!config.permite(mimeType)) {
    return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 })
  }

  const bucket = config.bucket
  const ext = config.extension(mimeType)

  try {
    const ruta = construirRuta({ farmId, recursoId, ext })
    const { signedUrl } = await crearUrlDeSubida(bucket, ruta)

    return NextResponse.json({ signedUrl, ruta })
  } catch (error) {
    // El detalle va al log del servidor (Vercel → Logs), nunca al navegador:
    // el mensaje de Supabase puede incluir datos de la configuración.
    console.error('[uploads/sign] falló al firmar', {
      bucket,
      mensaje: error instanceof Error ? error.message : String(error),
    })

    // Al cliente se le devuelve una causa útil pero genérica, para que el
    // mensaje en pantalla diga qué revisar en vez de "algo falló".
    return NextResponse.json(
      {
        error: 'storage_no_disponible',
        detalle:
          'No se pudo preparar la subida. Revisá la configuración de Storage (bucket y claves).',
      },
      { status: 502 },
    )
  }
}
