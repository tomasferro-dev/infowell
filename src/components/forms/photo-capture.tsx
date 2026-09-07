'use client'

import imageCompression from 'browser-image-compression'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { VisorImagenes } from '@/components/data/visor-imagenes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Captura de fotos del remito.
 *
 * Está pensado para el peor caso real: el operario en el campo, con 4G malo.
 * Las fotos se comprimen ANTES de salir del teléfono —una foto de cámara
 * moderna pesa 4-8 MB; comprimida queda en cientos de KB— pero **no se suben
 * acá**: se guardan comprimidas y suben recién al guardar el remito.
 *
 * Antes se subían apenas se elegían. Se cambió por dos razones:
 *
 *   - Sin señal fallaban una por una y el remito quedaba a medias. Ahora el
 *     remito entero —datos y fotos— es una sola unidad que entra en la cola.
 *   - Un remito que se subía y después fallaba al guardar dejaba las fotos
 *     huérfanas en el bucket: filas que no existen apuntando a archivos que sí.
 */

type Foto = {
  /** id local, para poder reordenar y borrar antes de guardar. */
  id: string
  /** La foto ya comprimida, esperando a que se guarde el remito. */
  blob: Blob
  previewUrl: string
  /** Mientras se comprime: en un teléfono modesto tarda un segundo o dos. */
  preparando: boolean
}

export function PhotoCapture({
  onFotos,
}: {
  /**
   * Las fotos comprimidas y si alguna todavía se está achicando.
   *
   * El segundo dato no sobra: sin él, apretar Guardar mientras una foto se
   * comprime guarda el remito SIN esa foto y sin decir nada — la pérdida
   * silenciosa que toda esta pantalla existe para evitar.
   */
  onFotos: (fotos: Blob[], preparando: boolean) => void
}) {
  const [fotos, setFotos] = useState<Foto[]>([])
  const [mensaje, setMensaje] = useState<string>()
  const [ampliada, setAmpliada] = useState<number>()
  // Por ref: si el padre pasa una función nueva en cada render, depender de
  // ella haría que el efecto corra siempre y avise en bucle.
  const onFotosActual = useRef(onFotos)
  // En un efecto sin dependencias, como hace el mapa con sus callbacks:
  // asignar un ref durante el render es lo que React desaconseja.
  useEffect(() => {
    onFotosActual.current = onFotos
  })
  const inputCamara = useRef<HTMLInputElement>(null)
  const inputGaleria = useRef<HTMLInputElement>(null)

  async function prepararUna(archivo: File): Promise<void> {
    const id = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(archivo)

    setFotos((previas) => [...previas, { id, blob: archivo, previewUrl, preparando: true }])

    try {
      // 1600px de lado mayor: sobra para leer un remito en pantalla y en un
      // zoom razonable, y baja el peso un orden de magnitud. Se comprime acá
      // y no al subir: así lo que espera en la cola ya es chico.
      const comprimida = await imageCompression(archivo, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })

      setFotos((previas) =>
        previas.map((f) => (f.id === id ? { ...f, blob: comprimida, preparando: false } : f)),
      )
    } catch {
      // Si no se puede comprimir se usa el original: pesa más, pero perder la
      // foto por no poder achicarla sería peor.
      setFotos((previas) =>
        previas.map((f) => (f.id === id ? { ...f, preparando: false } : f)),
      )
      setMensaje('Una foto no se pudo achicar. Va como está, puede tardar más en subir.')
    }
  }

  async function alElegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? [])
    // Se limpia el input para poder volver a elegir el mismo archivo.
    e.target.value = ''
    setMensaje(undefined)

    // Secuencial: comprimir cuatro fotos a la vez en un teléfono modesto lo
    // deja sin memoria y el navegador mata la pestaña.
    for (const archivo of archivos) {
      await prepararUna(archivo)
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

  const preparandoAlguna = fotos.some((f) => f.preparando)

  /*
   * Se avisa hacia arriba en un efecto y no dentro de `setFotos`: llamar al
   * padre desde el actualizador de estado lo hace renderizar en medio del
   * render de este, que React marca como error.
   */
  useEffect(() => {
    onFotosActual.current(
      fotos.filter((f) => !f.preparando).map((f) => f.blob),
      fotos.some((f) => f.preparando),
    )
  }, [fotos])

  return (
    <div className="space-y-3">
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
                  foto.preparando && 'opacity-70',
                )}
              >
                <button
                  type="button"
                  onClick={() => !foto.preparando && setAmpliada(indice)}
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

                {foto.preparando ? (
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

      {preparandoAlguna ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Achicando fotos…
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
