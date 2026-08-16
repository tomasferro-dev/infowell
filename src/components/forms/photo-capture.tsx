'use client'

import imageCompression from 'browser-image-compression'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { VisorImagenes } from '@/components/data/visor-imagenes'
import { Button } from '@/components/ui/button'
import { describirFalloDeFirma } from '@/lib/subidas'
import { cn } from '@/lib/utils'

/**
 * Captura de fotos del remito.
 *
 * Está pensado para el peor caso real: el operario en el campo, con 4G malo.
 * Por eso las fotos se comprimen ANTES de salir del teléfono (una foto de
 * cámara moderna pesa 4-8 MB; comprimida queda en cientos de KB) y se suben una
 * por una, mostrando el progreso, para que un fallo no arrastre a todas.
 */

type Foto = {
  /** id local, para poder reordenar y borrar antes de guardar. */
  id: string
  ruta: string
  previewUrl: string
  subiendo: boolean
  error?: boolean
}

export function PhotoCapture({
  farmId,
  borradorId,
  name = 'photos',
}: {
  farmId: string
  /** Id del remito en borrador: agrupa las fotos antes de que exista la fila. */
  borradorId: string
  name?: string
}) {
  const [fotos, setFotos] = useState<Foto[]>([])
  const [mensaje, setMensaje] = useState<string>()
  const [ampliada, setAmpliada] = useState<number>()
  const inputCamara = useRef<HTMLInputElement>(null)
  const inputGaleria = useRef<HTMLInputElement>(null)

  async function subirUna(archivo: File): Promise<void> {
    const id = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(archivo)

    setFotos((previas) => [...previas, { id, ruta: '', previewUrl, subiendo: true }])

    try {
      // 1600px de lado mayor: sobra para leer un remito en pantalla y en un
      // zoom razonable, y baja el peso un orden de magnitud.
      const comprimida = await imageCompression(archivo, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })

      const firma = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipo: 'remito',
          farmId,
          recursoId: borradorId,
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

      setFotos((previas) =>
        previas.map((f) => (f.id === id ? { ...f, ruta, subiendo: false } : f)),
      )
    } catch (error) {
      setFotos((previas) =>
        previas.map((f) => (f.id === id ? { ...f, subiendo: false, error: true } : f)),
      )
      // Se muestra la causa real: sin esto, un problema de configuración se
      // ve igual que una foto pesada o una señal mala.
      setMensaje(error instanceof Error ? error.message : 'No se pudo subir la foto.')
    }
  }

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? [])
    // Se limpia el input para poder volver a elegir el mismo archivo.
    e.target.value = ''
    setMensaje(undefined)

    // Secuencial y no en paralelo: con señal pobre, cuatro subidas simultáneas
    // se pisan entre sí y tardan más que una atrás de otra.
    for (const archivo of archivos) {
      await subirUna(archivo)
    }
  }

  function quitar(id: string) {
    setFotos((previas) => {
      const foto = previas.find((f) => f.id === id)
      if (foto) URL.revokeObjectURL(foto.previewUrl)
      return previas.filter((f) => f.id !== id)
    })
  }

  function mover(id: string, direccion: -1 | 1) {
    setFotos((previas) => {
      const i = previas.findIndex((f) => f.id === id)
      const j = i + direccion
      if (i < 0 || j < 0 || j >= previas.length) return previas

      const copia = [...previas]
      ;[copia[i], copia[j]] = [copia[j]!, copia[i]!]
      return copia
    })
  }

  const subiendoAlguna = fotos.some((f) => f.subiendo)

  return (
    <div className="space-y-3">
      {/* Solo las subidas OK viajan en el submit, en el orden elegido. */}
      {fotos
        .filter((f) => f.ruta && !f.error)
        .map((f) => (
          <input key={f.id} type="hidden" name={name} value={f.ruta} />
        ))}

      <div className="grid grid-cols-2 gap-2">
        {/* capture="environment" abre la cámara trasera directo, sin pasar por
            el selector de archivos. Es el flujo que usa el operario. */}
        <input
          ref={inputCamara}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={alElegir}
          className="hidden"
        />
        <input
          ref={inputGaleria}
          type="file"
          accept="image/*"
          multiple
          onChange={alElegir}
          className="hidden"
        />

        <Button
          type="button"
          variant="outline"
          onClick={() => inputCamara.current?.click()}
          className="h-12 text-base"
        >
          <Camera className="size-4" />
          Sacar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => inputGaleria.current?.click()}
          className="h-12 text-base"
        >
          <ImagePlus className="size-4" />
          Galería
        </Button>
      </div>

      {fotos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {fotos.map((foto, indice) => (
            <li key={foto.id} className="space-y-1">
              <div
                className={cn(
                  'relative aspect-square overflow-hidden rounded-lg border',
                  foto.error && 'border-destructive',
                )}
              >
                <button
                  type="button"
                  onClick={() => !foto.subiendo && setAmpliada(indice)}
                  className="size-full"
                  aria-label={`Ampliar foto ${indice + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob local, next/image no aplica */}
                  <img
                    src={foto.previewUrl}
                    alt={`Foto ${indice + 1} del remito`}
                    className="size-full object-cover"
                  />
                </button>

                {foto.subiendo ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="size-5 animate-spin text-white" />
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => quitar(foto.id)}
                  aria-label={`Quitar foto ${indice + 1}`}
                  className="bg-background/90 absolute top-1 right-1 flex size-7 items-center justify-center rounded-full border"
                >
                  <X className="size-4" />
                </button>
              </div>

              {fotos.length > 1 ? (
                <div className="flex justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => mover(foto.id, -1)}
                    disabled={indice === 0}
                    aria-label={`Mover foto ${indice + 1} antes`}
                    className="text-muted-foreground disabled:opacity-30 px-2 text-xs"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => mover(foto.id, 1)}
                    disabled={indice === fotos.length - 1}
                    aria-label={`Mover foto ${indice + 1} después`}
                    className="text-muted-foreground disabled:opacity-30 px-2 text-xs"
                  >
                    →
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {subiendoAlguna ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Subiendo fotos…
        </p>
      ) : null}

      {mensaje ? <p className="text-destructive text-sm font-medium">{mensaje}</p> : null}

      {/* Mismo visor que en el detalle del remito: un solo gesto en toda la app. */}
      {ampliada !== undefined ? (
        <VisorImagenes
          imagenes={fotos.map((f, i) => ({
            id: f.id,
            src: f.previewUrl,
            alt: `Foto ${i + 1} del remito`,
          }))}
          indiceInicial={ampliada}
          onCerrar={() => setAmpliada(undefined)}
        />
      ) : null}
    </div>
  )
}
