import imageCompression from 'browser-image-compression'

import { describirFalloDeFirma } from '@/lib/subidas'
import { guardarRemitoAction } from '@/server/actions/receipts'

import {
  anotarIntento,
  esFalloDeRed,
  pendientes,
  quitarDeLaCola,
  type RemitoEnCola,
} from '@/lib/cola-remitos'

/**
 * Sube las fotos y guarda el remito.
 *
 * Este es el ÚNICO camino de envío: lo usa el formulario cuando hay señal y lo
 * usa la cola cuando reintenta. Tener dos caminos distintos sería tener uno que
 * casi nunca se ejecuta —el del reintento— y que por eso se pudre sin que nadie
 * se entere hasta el día que hace falta.
 *
 * Tira si no se pudo. Quien llama decide qué hacer con eso: el formulario lo
 * encola si fue la red, la cola lo deja para el próximo intento.
 */
export async function enviarRemito(remito: RemitoEnCola): Promise<void> {
  const rutas: string[] = []

  for (const foto of remito.fotos) {
    // 1600px de lado mayor: sobra para leer un remito y baja el peso un orden
    // de magnitud, que en el campo con 4G malo es la diferencia entre subir y
    // no subir.
    const comprimida = await imageCompression(
      new File([foto], 'remito.jpg', { type: 'image/jpeg' }),
      { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true, fileType: 'image/jpeg' },
    )

    const firma = await fetch('/api/uploads/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tipo: 'remito',
        farmId: remito.farmId,
        recursoId: remito.id,
        mimeType: 'image/jpeg',
      }),
    })

    if (!firma.ok) throw new Error(await describirFalloDeFirma(firma))
    const { signedUrl, ruta } = await firma.json()

    const cuerpo = new FormData()
    cuerpo.append('cacheControl', '3600')
    cuerpo.append('', comprimida)

    const subida = await fetch(signedUrl, { method: 'PUT', body: cuerpo })
    if (!subida.ok) {
      throw new Error(`El servidor de archivos rechazó la foto (${subida.status}).`)
    }

    rutas.push(ruta)
  }

  const r = await guardarRemitoAction(remito.farmId, remito.campos, rutas)
  if (!r.ok) throw new Error(r.error)
}

/**
 * Intenta subir todo lo que está esperando.
 *
 * Ante un fallo de RED corta y no sigue: si no hay señal para el primero,
 * tampoco la hay para el resto, y machacar solo gasta batería.
 *
 * Ante un rechazo del SERVIDOR sigue con el próximo, pero deja el rechazado en
 * la cola con su motivo anotado. Ese no va a subir nunca solo, así que la
 * pantalla tiene que mostrar por qué — es exactamente el caso que la bitácora
 * marca como el peligro: pendiente para siempre y en silencio.
 */
export async function procesarCola(): Promise<{ enviados: number; quedan: number }> {
  const cola = await pendientes()
  let enviados = 0

  for (const remito of cola) {
    try {
      await enviarRemito(remito)
      await quitarDeLaCola(remito.id)
      enviados += 1
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'No se pudo subir'
      await anotarIntento(remito.id, mensaje)

      if (esFalloDeRed(error)) break
    }
  }

  return { enviados, quedan: (await pendientes()).length }
}
